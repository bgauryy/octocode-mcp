import { ERR, RpcError } from './protocol.js';

/** What a settled run hands to `wait` callers: the final assistant text and why the run ended. */
export type RunResult = {
  text: string;
  stopReason?: string;
};

export interface Waiter {
  resolve(result: RunResult): void;
  reject(error: Error): void;
}

/**
 * One `message.send`: `preparing` (the message is being reviewed and nothing is sent), `accepted` (sent to the session,
 * its run still going), `settled` (that run ended), `uncertain` (the send itself failed after dispatch) or `cancelled`.
 */
export interface SendReceipt {
  phase: 'preparing' | 'accepted' | 'uncertain' | 'cancelled' | 'settled';
  reject(error: Error): void;
  controller: AbortController;
  ready: Promise<void>;
  fingerprint: string;
  accepted: { id: string; queued: string };
  settlement: Promise<RunResult>;
  /** Resolves `ready` once the message is dispatched. */
  resolveReady(): void;
}

const SEND_RECEIPT_LIMIT = 128;

/**
 * The receipts of one session's sends, keyed by the client's idempotency `key`, and the callers waiting for a run to
 * settle. It decides nothing about the message itself; `OctocodeApi.send` drives the transitions.
 */
export class SendReceipts {
  private sessionId: string | undefined;
  private readonly byKey = new Map<string, SendReceipt>();
  private readonly preparing = new Set<SendReceipt>();
  private readonly waiters = new Set<Waiter>();
  /** The key of the receipt that owns the run in progress. */
  activeKey: string | undefined;

  get(key: string): SendReceipt | undefined {
    return this.byKey.get(key);
  }

  /** The receipt that owns the run in progress, when it has a key. */
  active(): SendReceipt | undefined {
    return this.activeKey === undefined ? undefined : this.byKey.get(this.activeKey);
  }

  /** A send is being prepared or owns the run: a new one would queue behind it. */
  get busy(): boolean {
    return this.activeKey !== undefined || this.preparing.size > 0;
  }

  get preparingCount(): number {
    return this.preparing.size;
  }

  /** Refuses a keyed send when every receipt slot is taken; existing receipts are never evicted (a retry must still find its own). */
  assertRoom(key: string | undefined): void {
    if (key && this.byKey.size >= SEND_RECEIPT_LIMIT) throw new RpcError(ERR.unavailable, 'This session has reached its message key capacity; existing receipts are retained', { execution: 'not-sent' });
  }

  /** Follows the session: a different one than before drops everything of the old one. */
  follow(sessionId: string): void {
    if (this.sessionId === sessionId) return;
    this.clear('The session was replaced');
    this.sessionId = sessionId;
  }

  /** The session ended: nobody may keep waiting, and nothing is kept. */
  end(): void {
    this.clear('The session ended');
    this.sessionId = undefined;
  }

  private clear(reason: string): void {
    for (const waiter of this.waiters) waiter.reject(new RpcError(ERR.unavailable, reason, { execution: 'accepted' }));
    this.waiters.clear();
    for (const receipt of this.preparing) this.cancelPreparation(receipt, reason);
    this.preparing.clear();
    this.byKey.clear();
    this.activeKey = undefined;
  }

  /** Starts a receipt in `preparing`; with a `key` it is kept for retries, and owns the run when the session was idle. */
  open(fingerprint: string, accepted: SendReceipt['accepted'], key: string | undefined, busy: boolean): { receipt: SendReceipt; waiter: Waiter } {
    let waiter!: Waiter;
    const settlement = new Promise<RunResult>((resolve, reject) => {
      waiter = { resolve, reject };
    });
    settlement.catch(() => undefined);
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    ready.catch(() => undefined);
    const reject = (error: Error): void => {
      waiter.reject(error);
      rejectReady(error);
    };
    const receipt: SendReceipt = { phase: 'preparing', controller: new AbortController(), ready, reject, fingerprint, accepted, settlement, resolveReady };
    this.preparing.add(receipt);
    if (key) {
      this.byKey.set(key, receipt);
      if (!busy) this.activeKey = key;
    }
    return { receipt, waiter };
  }

  /** The message is going out: the receipt leaves `preparing`. A keyed send (or one that waits) keeps its waiter for the run's end; otherwise nobody waits. */
  accept(receipt: SendReceipt, waiter: Waiter, keep: boolean): void {
    this.preparing.delete(receipt);
    receipt.phase = 'accepted';
    if (keep) this.waiters.add(waiter);
    else waiter.resolve({ text: '' });
  }

  /** The send failed. After dispatch the receipt stays (`uncertain`, so a retry with its key sees the outcome); before, nothing was sent and the key is free again. */
  fail(receipt: SendReceipt, waiter: Waiter, key: string | undefined, failure: Error, dispatched: boolean): void {
    this.preparing.delete(receipt);
    this.waiters.delete(waiter);
    receipt.reject(failure);
    if (dispatched) receipt.phase = 'uncertain';
    else {
      if (key) this.byKey.delete(key);
      if (this.activeKey === key) this.activeKey = undefined;
    }
  }

  /** A caller without a key stops waiting once it has its answer. */
  release(waiter: Waiter): void {
    this.waiters.delete(waiter);
  }

  /** Cancels a send still being prepared (nothing was sent); other phases are left alone. */
  cancelPreparation(receipt: SendReceipt, message: string): void {
    if (receipt.phase !== 'preparing') return;
    receipt.phase = 'cancelled';
    receipt.controller.abort();
    receipt.reject(new RpcError(ERR.unavailable, message, { execution: 'not-sent' }));
    if (this.active() === receipt) this.activeKey = undefined;
    this.preparing.delete(receipt);
  }

  /**
   * `turn.abort` with a `key`: only the receipt that owns the run may abort it. A send still being prepared is cancelled
   * instead (`'cancelled'`: no run was started); an accepted one owns the run (`'owner'`).
   */
  abort(key: string): 'cancelled' | 'owner' {
    const receipt = this.byKey.get(key);
    if (this.activeKey !== key || !receipt) throw new RpcError(ERR.unavailable, 'This request does not own the active run');
    if (receipt.phase === 'preparing') {
      this.cancelPreparation(receipt, 'Message preparation was cancelled; nothing was sent');
      return 'cancelled';
    }
    if (receipt.phase !== 'accepted') throw new RpcError(ERR.unavailable, 'This request no longer owns the active run');
    return 'owner';
  }

  /** Pi settled: sends still being prepared are void (the session ran meanwhile), accepted ones are settled, and every waiter gets the result. */
  settle(result: RunResult): void {
    for (const receipt of this.preparing) this.cancelPreparation(receipt, 'The session ran while the message was being prepared');
    for (const receipt of this.byKey.values()) if (receipt.phase === 'accepted') receipt.phase = 'settled';
    this.activeKey = undefined;
    for (const waiter of [...this.waiters]) {
      this.waiters.delete(waiter);
      waiter.resolve(result);
    }
  }

  /** The run's result once it settles. Past `timeout`: a send still being prepared is cancelled and refused, a delivered one times out (`ERR.timeout`: the message was delivered). */
  async wait(receipt: SendReceipt, timeout: number): Promise<RunResult> {
    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        if (receipt.phase === 'preparing') {
          this.cancelPreparation(receipt, 'Message preparation timed out; nothing was sent');
          reject(new RpcError(ERR.unavailable, 'Message preparation timed out; nothing was sent'));
        } else reject(new RpcError(ERR.timeout, 'Timed out waiting for the agent to finish; the message was delivered', { ...receipt.accepted, execution: 'accepted' }));
      }, timeout);
      timer.unref();
    });
    try {
      return await Promise.race([receipt.settlement, expired]);
    } finally {
      clearTimeout(timer);
    }
  }
}

import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { errorMessage } from '../shared/util.js';
import { Inbox } from './inbox.js';
import { mailIds, type Mail } from './mail.js';
import type { Message } from './model.js';
import type { TeamStore } from './store.js';
import { notify } from '../shared/commands.js';

/** Consecutive failed ticks (about 30s) before the agent hears that the team database is unavailable. */
const FAILED_TICKS_NOTICE = 30;
/** An idle agent handed a waking message that the model has not been called with after this long was not started by Pi (no model, or no sign-in). */
const WAKE_STUCK_MS = 10_000;

/** What delivery needs from the agent's membership (`Team`), read when used so it always sees the current session. */
export interface DeliveryHost {
  /** This agent's id, undefined while it has not joined. */
  id(): string | undefined;
  parentId(): string | undefined;
  ctx(): ExtensionContext | undefined;
  /** A subagent with no person to talk to (`Team.headless`). */
  headless(): boolean;
  /** Writes the heartbeat if one is due (a status change, or the interval passed); whether it did. */
  heartbeat(db: TeamStore): boolean;
}

/**
 * The receive side of the team, run on every tick: hands waiting mail to Pi through the `Inbox`, records it once the
 * model is called with it, reports a wake Pi never started, and counts failed ticks. It owns the inbox and the wake and
 * failure state; the membership, the heartbeat and the sending stay with `Team`.
 */
export class Delivery {
  private readonly inbox = new Inbox();
  private failedTicks = 0;
  /** When an idle agent was handed a waking message that has not reached the model yet; undefined when none is outstanding. */
  private wakeHandedAt: number | undefined;
  /** The user was told about the current stuck wake. */
  private wakeReported = false;

  constructor(private readonly host: DeliveryHost, private readonly mail: Mail) {}

  /** Two-phase delivery: hand what is waiting to Pi (the inbox records it once the model sees it), then the heartbeat. */
  deliver(db: TeamStore | undefined): void {
    if (!this.host.id() || !db) return;
    try {
      db.quick(() => this.deliverNow(db));
      this.failedTicks = 0;
    } catch (error) {
      // A locked or closed database is retried on the next tick; say so once if it lasts long enough for leases to lapse.
      if (++this.failedTicks === FAILED_TICKS_NOTICE) this.mail.notice(`Team database unavailable (${errorMessage(error)}): your reservations may lapse and messages wait until it recovers.`);
    }
  }

  /** Pi is about to call the model with `messages`: the team mail among them is now delivered. */
  seen(db: TeamStore | undefined, messages: ReadonlyArray<{ role?: string; customType?: string; details?: unknown }>): void {
    const me = this.inbox.awaitingContext ? this.host.id() : undefined;
    const ids = me && db ? messages.flatMap((message) => mailIds(message, me)) : [];
    if (!me || !db || ids.length === 0) return;
    try {
      db.quick(() => this.inbox.seen(db, me, ids));
    } catch {
      // Busy database: the inbox keeps the ids and records them on the next tick.
    }
  }

  /** The agent left: records what the model saw if it can, and forgets the rest (`id` is the id it left under). */
  reset(db: TeamStore | undefined, id: string | undefined): void {
    this.inbox.reset(db, id);
    this.wakeHandedAt = undefined;
    this.wakeReported = false;
  }

  private deliverNow(db: TeamStore): void {
    const id = this.host.id();
    if (!id) return;
    const ctx = this.host.ctx();
    const headlessIdle = this.host.headless() && ctx?.isIdle();
    // A settlement send can fail while Pi changes state. An interactive session stays alive to retry held mail.
    if (!this.host.headless() && ctx?.isIdle()) this.mail.settled();
    // An idle subagent without a UI has had its last turn: mail waits, and becomes a dead letter when it leaves.
    if (!headlessIdle) this.inbox.deliver(db, id, (batch) => this.handOver(batch));
    this.checkWake();
    if (this.host.heartbeat(db)) this.mail.reportDeadLetters(db, id);
  }

  /** Hands a batch to Pi; notes when it should wake an idle agent, to tell whether Pi started that turn (`checkWake`). */
  private handOver(batch: Message[]): boolean {
    const ctx = this.host.ctx();
    const handed = this.mail.deliver(batch, this.host.parentId(), ctx);
    if (handed && this.wakeHandedAt === undefined && ctx?.isIdle() && batch.some((message) => message.wake)) this.wakeHandedAt = Date.now();
    return handed;
  }

  /**
   * Pi swallows a refused turn start (no model selected, no sign-in): the message then stays handed but unseen until the
   * agent leaves, when it becomes a dead letter. An idle agent that still has not reached the model with a waking message
   * after `WAKE_STUCK_MS` is reported to its user once, so the cause (`/model`, `/login`) is not a silent wait.
   */
  private checkWake(): void {
    if (this.wakeHandedAt === undefined) return;
    const ctx = this.host.ctx();
    if (!this.inbox.awaitingContext || !ctx || !ctx.isIdle()) {
      // The model saw it, or a turn is running: nothing is stuck.
      this.wakeHandedAt = undefined;
      this.wakeReported = false;
      return;
    }
    if (this.wakeReported || Date.now() - this.wakeHandedAt < WAKE_STUCK_MS) return;
    this.wakeReported = true;
    if (ctx.hasUI) notify(ctx.ui, 'A team message should have started a turn, but Pi did not run one (select a model with /model and sign in with /login). The message stays queued; its sender is told it went unread if this session ends first.', 'warning');
  }
}

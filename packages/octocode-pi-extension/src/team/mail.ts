import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { deadLetterText, messageText, wakes } from './routing.js';
import type { DeadLetter, MailDetails, Message } from './model.js';
import type { TeamStore } from './store.js';

export const MESSAGE_TYPE = 'octocode-agent-message';

/** Puts team mail and team notices in front of this agent's model, one Pi custom message each (`MailDetails`). */
export class Mail {
  /** Mail held by an interrupt until the stopped run settles. */
  private held: { batch: Message[]; parentId: string | undefined } | undefined;
  /** Aborted while mail is held: a wait at the end of the run (background work) stops for it. */
  private holding = new AbortController();

  constructor(private readonly pi: ExtensionAPI) {}

  /** A team notice for this agent, read at its next step; never starts a turn. False when the session cannot take it. */
  notice(text: string): boolean {
    return this.inject(text, { messages: [{ from: 'team', text, at: Date.now() }] }, { deliverAs: 'steer' });
  }

  /**
   * One Pi message for the whole batch, so a busy agent reads all of it at its next step (steer); only a batch with a
   * message that wants action wakes an idle one. False when the session cannot take it: the messages stay pending.
   */
  deliver(batch: Message[], parentId: string | undefined, ctx?: Pick<ExtensionContext, 'isIdle' | 'abort'>): boolean {
    // A steer is read only after the running tool returns: an interrupt stops the run instead (Pi cancels the tool),
    // and the batch starts the next turn once the run has settled (`settled`).
    if (ctx && !ctx.isIdle() && batch.some((message) => message.interrupt)) {
      try {
        ctx.abort();
        this.held = { batch: [...(this.held?.batch ?? []), ...batch], parentId };
        this.holding.abort();
        return true;
      } catch {
        // The run cannot be stopped: deliver it as a waking message instead.
      }
    }
    return this.send(batch, parentId, false);
  }

  /** Aborted while an interrupt holds mail for the stopped run. */
  get interrupted(): AbortSignal {
    return this.holding.signal;
  }

  private send(batch: Message[], parentId: string | undefined, stopped: boolean): boolean {
    const content = batch.map((message) => messageText(message, parentId, stopped)).join('\n\n');
    return this.inject(content, { messages: batch }, { triggerTurn: batch.some(wakes), deliverAs: 'steer' });
  }

  /**
   * The run settled: mail an interrupt held starts the next turn (Pi runs a turn triggered while it settles before it
   * reports idle, so a headless subagent continues instead of exiting). True when it did.
   */
  settled(): boolean {
    const held = this.held;
    if (!held || !this.send(held.batch, held.parentId, true)) return false;
    this.reset();
    return true;
  }

  /** Forgets held mail (the agent left): never started, it stays undelivered. */
  reset(): void {
    this.held = undefined;
    if (this.holding.signal.aborted) this.holding = new AbortController();
  }

  /** Tells this agent, once and without waking it, about messages it sent that their recipients left without reading. */
  reportDeadLetters(db: TeamStore, id: string): void {
    const letters = db.deadLetters(id);
    if (letters.length === 0) return;
    const told: DeadLetter[] = [];
    for (const letter of letters) {
      if (!this.notice(deadLetterText(letter))) break; // Told on a later tick.
      told.push(letter);
    }
    db.markNotified(told);
  }

  private inject(content: string, details: MailDetails, options: { triggerTurn?: boolean; deliverAs: 'steer' }): boolean {
    try {
      this.pi.sendMessage({ customType: MESSAGE_TYPE, content, display: true, details }, options);
      return true;
    } catch {
      return false; // The session ended or is not ready.
    }
  }
}

/** The ids of the messages to `me` that a Pi message carries, when it is team mail (details are untrusted data). */
export function mailIds(message: { role?: string; customType?: string; details?: unknown }, me: string): number[] {
  if (message.role !== 'custom' || message.customType !== MESSAGE_TYPE) return [];
  const mail = (message.details as Partial<MailDetails> | undefined)?.messages;
  return Array.isArray(mail) ? mail.flatMap((entry) => (typeof entry?.id === 'number' && entry.to === me ? [entry.id] : [])) : [];
}

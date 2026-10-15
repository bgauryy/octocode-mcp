import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { userProofValid } from './proof.js';
import { spillIntact } from './spill.js';
import { deadLetterText, messageText, USER_SENDER, wakes } from './routing.js';
import type { DeadLetter, MailDetails, Message } from './model.js';
import type { TeamStore } from './store.js';

import { INTERNAL_MESSAGE_TYPE } from '../shared/messages.js';
export const MESSAGE_TYPE = INTERNAL_MESSAGE_TYPE;

/** Puts team mail and team notices in front of this agent's model, one Pi custom message each (`MailDetails`). */
export class Mail {
  /** Mail held by an interrupt until the stopped run settles. */
  private held: { batch: Message[]; parentId: string | undefined } | undefined;
  /** Aborted while mail is held: a wait at the end of the run (background work) stops for it. */
  private holding = new AbortController();
  /** Notices already handed to Pi whose database acknowledgement still needs retrying. */
  private notified: DeadLetter[] = [];
  /** Ids of the messages this process created for the user, which with the signed ones are the only ones labelled "the user" (the sender column is shared and forgeable). */
  private readonly forUser = new Set<number>();

  /** `secret`: what the parent gave this process (a subagent), which checks a user message the parent signed (`userProof`). */
  constructor(private readonly pi: Pick<ExtensionAPI, 'sendMessage'>, private readonly secret: () => string | undefined = () => undefined) {}

  /**
   * Whether the message is verifiably the user's: created here for the user, or signed with this process's secret by the
   * parent (the signature covers the head and the path of a long message), and in both cases the file it points at, if any,
   * still holds what was saved (the file is read outside the signature).
   */
  private verified(message: Message): boolean {
    // The id alone is not enough: after a database replacement ids start again, so the sender column must say user too.
    return message.from === USER_SENDER && (this.forUser.has(message.id) || userProofValid(this.secret(), message)) && spillIntact(message.text);
  }

  /** Records that this process created message `id` for the user (`/agents tell`): its text is read as the user's. */
  createdForUser(id: number): void {
    this.forUser.add(id);
  }

  /** A team notice for this agent, read at its next step; never starts a turn. False when the session cannot take it. */
  notice(text: string): boolean {
    return this.inject(text, { messages: [{ from: 'team', text, at: Date.now() }] }, { triggerTurn: false, deliverAs: 'steer' });
  }

  /**
   * One Pi message for the whole batch, so a busy agent reads all of it at its next step (steer); only a batch with a
   * message that wants action wakes an idle one. False when the session cannot take it: the messages stay pending.
   */
  deliver(batch: Message[], parentId: string | undefined, ctx?: Pick<ExtensionContext, 'isIdle' | 'abort'>): boolean {
    // A steer is read only after the running tool returns: an interrupt stops the run instead (Pi cancels the tool),
    // and the batch starts the next turn once the run has settled (`settled`).
    // The interrupt is not tied to `verified`, on purpose: the agent that started this one is legitimately not "the user"
    // and may stop it. What limits who can interrupt is the sender (`interruptRefusal`, checked where a message is sent):
    // only the agent that started the recipient, or the user of its session (`/agents tell --interrupt`; an API client
    // and a peer cannot). A row written around that check (same-user write access to the shared database) can still stop a
    // run; it cannot make it read the text as the user's, because that needs the signature (`verified`).
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
    const content = batch.map((message) => messageText(message, { parentId, stopped, fromUser: this.verified(message) })).join('\n\n');
    return this.inject(content, { messages: batch }, { triggerTurn: batch.some(wakes), deliverAs: 'steer' });
  }

  /**
   * The run settled: mail an interrupt held starts the next turn (Pi runs a turn triggered while it settles before it
   * reports idle, so a headless subagent continues instead of exiting). True when it did.
   */
  settled(): boolean {
    const held = this.held;
    if (!held || !this.send(held.batch, held.parentId, true)) return false;
    this.releaseInterrupt();
    return true;
  }

  /** Forgets held mail (the agent left): never started, it stays undelivered. */
  reset(): void {
    this.notified = [];
    this.forUser.clear();
    this.releaseInterrupt();
  }

  private releaseInterrupt(): void {
    this.held = undefined;
    if (this.holding.signal.aborted) this.holding = new AbortController();
  }

  /** Tells this agent, once and without waking it, about messages it sent that their recipients left without reading. */
  reportDeadLetters(db: TeamStore, id: string): void {
    this.recordNotices(db);
    const letters = db.deadLetters(id);
    if (letters.length === 0) return;
    if (!this.notice(letters.map(deadLetterText).join('\n\n'))) return;
    this.notified = letters;
    this.recordNotices(db);
  }

  private recordNotices(db: TeamStore): void {
    if (this.notified.length === 0) return;
    db.markNotified(this.notified);
    this.notified = [];
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

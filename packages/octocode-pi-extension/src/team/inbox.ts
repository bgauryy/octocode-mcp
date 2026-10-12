import type { Message } from './model.js';
import type { TeamStore } from './store.js';

/**
 * Paced, ordered delivery in two phases. Each tick hands every message that arrived since the last hand-off to Pi as
 * one batch: Pi's default steering mode injects one queued message per turn, so separate messages would cost a turn
 * each. A message is recorded delivered only when the model is called with it in the conversation (`seen`, from Pi's
 * `context` event); one still queued when the agent is killed or leaves stays undelivered, so it becomes a dead letter
 * its sender hears about. Each tick first counts this recipient's undelivered messages past the hand-off point (an
 * index read): the inbox is read only when something new waits.
 */
export class Inbox {
  /** The newest message handed to Pi: later ticks hand over only newer ones, so none is injected twice. */
  private handed = 0;
  /** Handed to Pi, not yet seen by the model. */
  private readonly unseen = new Set<number>();
  /** Seen by the model, not yet recorded (the database was busy): recorded on the next tick. */
  private readonly seenIds = new Set<number>();

  /** Forgets everything (the agent left); with the database, first records what the model saw, if it can. */
  reset(db?: TeamStore, id?: string): void {
    try {
      if (db && id) this.record(db, id);
    } catch {
      // Busy database: unrecorded mail becomes a dead letter.
    }
    this.handed = 0;
    this.unseen.clear();
    this.seenIds.clear();
  }

  /** Records what the model saw, then hands the next batch to `send`; a refused batch is offered again next tick. */
  deliver(db: TeamStore, id: string, send: (batch: Message[]) => boolean): void {
    this.record(db, id);
    if (db.waiting(id, this.handed) === 0) return;
    const batch = db.pending(id, this.handed);
    const before = this.handed;
    // Marked first: Pi may call the model with the batch, and report it seen, before `send` returns.
    this.handed = batch.at(-1)!.id;
    for (const message of batch) this.unseen.add(message.id);
    if (send(batch)) return;
    this.handed = before;
    for (const message of batch) this.unseen.delete(message.id);
  }

  /**
   * The model is being called with these messages in its conversation: record the ones this inbox handed over and has
   * not recorded yet (the conversation repeats every earlier message on every call). Retried on the next tick when the
   * database is busy.
   */
  seen(db: TeamStore, id: string, messages: number[]): void {
    for (const message of messages) if (this.unseen.delete(message)) this.seenIds.add(message);
    this.record(db, id);
  }

  private record(db: TeamStore, id: string): void {
    if (this.seenIds.size === 0) return;
    db.ack(id, [...this.seenIds]);
    this.seenIds.clear();
  }
}

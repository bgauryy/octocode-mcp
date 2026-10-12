import type { Message } from './model.js';
import type { TeamStore } from './store.js';

/**
 * Paced, ordered delivery. Accepted messages survive an acknowledgement failure without being injected twice. Each
 * tick first counts this recipient's undelivered messages (an index read): writes elsewhere in the shared database
 * cost nothing, and the inbox is read only when something waits.
 */
export class Inbox {
  private readonly unacked = new Set<number>();

  reset(): void {
    this.unacked.clear();
  }

  deliver(db: TeamStore, id: string, send: (message: Message) => boolean): void {
    if (this.unacked.size === 0 && db.waiting(id) === 0) return;
    const waiting = db.pending(id);
    for (const message of waiting) {
      if (this.unacked.has(message.id)) continue;
      if (!send(message)) break;
      this.unacked.add(message.id);
    }
    db.ack(id, waiting.filter((message) => this.unacked.has(message.id)).map((message) => message.id));
    this.unacked.clear();
  }
}

/** Sender notices for requests and action messages that expired before a recipient acknowledged them. */
import { query, rowInteger, rowOptionalText, rowText } from './database.js';
import { parseObject } from './validation.js';
import { notice } from './leases.js';
import type { StoreHost } from './store-types.js';

/** Runtime-authored keys; senders cannot reuse them. */
const expiredKey = (message: number): string => `expired:${message}`;
export const retryKey = (message: number, session: string): string => `retry-exhausted:${message}:${session}`;
export const RESERVED_KEY_PREFIXES: readonly string[] = ['complete:', 'expired:', 'retry-exhausted:'];

/**
 * Tells `session`, once per message, that its request (a message that wakes the recipient or needs an answer) expired unacknowledged.
 * Expiry stops new delivery, but submitted context may already be in progress.
 * An absent acknowledgement does not prove the work was never handled. Self-addressed runtime notices are excluded, so
 * a notice that expires unread never produces another notice; neither does a retry-exhausted notice to a sender.
 */
export function notifyExpired(host: StoreHost, session: string, at: number): void {
  const expired = query(host.db, `SELECT m.id,m.kind,m.slots FROM messages m WHERE m.sender=?1 AND (m.wake='action' OR m.replyRequired=1) AND m.expiresAt<=?2
AND EXISTS(SELECT 1 FROM deliveries d WHERE d.message=m.id AND d.recipient<>m.sender AND d.acknowledgedAt IS NULL)
AND m.key NOT GLOB 'retry-exhausted:*'
AND NOT EXISTS(SELECT 1 FROM messages n WHERE n.sender=m.sender AND n.key='expired:'||m.id) ORDER BY m.id LIMIT 100`, [session, at]);
  for (const message of expired) {
    const names = query(host.db, 'SELECT s.name FROM deliveries d JOIN sessions s ON s.id=d.recipient WHERE d.message=? AND d.recipient<>? AND d.acknowledgedAt IS NULL ORDER BY s.name', [rowInteger(message, 'id'), session]).map(row => rowText(row, 'name'));
    const slots = rowOptionalText(message, 'slots');
    const fallback = rowText(message, 'kind') === 'decision' && slots !== undefined ? parseObject(slots, 'message slots').default : undefined;
    notice(host.db, session, session, 'blocker', {
      situation: `Request ${rowInteger(message, 'id')} expired before ${names.join(', ')} acknowledged it`,
      background: 'Expiry stops delivery; submitted context may already be in progress',
      assessment: 'Handling is unconfirmed' + (fallback !== undefined ? '; the decision default applies: ' + String(fallback) : ''),
      recommendation: 'Inspect delivery and the recipient before sending a new request with a new key',
    }, expiredKey(rowInteger(message, 'id')), 'action', at);
  }
}

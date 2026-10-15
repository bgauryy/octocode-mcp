"""Sender notices for requests and action messages that expired before a recipient acknowledged them."""
from .database import query
from .leases import notice

# Runtime-authored keys; senders cannot reuse them.
EXPIRED_KEY = 'expired:{}'
RESERVED_KEY_PREFIXES = ('complete:', 'expired:')


class ExpiryMixin:
    def notify_expired(self, session, at):
        """Tell `session`, once per message, that its request (a message that wakes the recipient or needs an answer) expired unacknowledged.
        Expiry stops new delivery, but submitted context may already be in progress.
        An absent acknowledgement does not prove the work was never handled. Self-addressed runtime notices are excluded, so
        a notice that expires unread never produces another notice."""
        expired = query(self.db, """SELECT m.id FROM messages m WHERE m.sender=?1 AND (m.wake='action' OR m.replyRequired=1) AND m.expiresAt<=?2
AND EXISTS(SELECT 1 FROM deliveries d WHERE d.message=m.id AND d.recipient<>m.sender AND d.acknowledgedAt IS NULL)
AND NOT EXISTS(SELECT 1 FROM messages n WHERE n.sender=m.sender AND n.key='expired:'||m.id) ORDER BY m.id LIMIT 100""", (session, at))
        for message in expired:
            names = [row['name'] for row in query(self.db, 'SELECT s.name FROM deliveries d JOIN sessions s ON s.id=d.recipient WHERE d.message=? AND d.recipient<>? AND d.acknowledgedAt IS NULL ORDER BY s.name', (message['id'], session))]
            notice(self.db, session, session, 'Request {} expired before {} acknowledged it; handling is unconfirmed. Inspect delivery and the recipient before deciding whether to send a new request with a new key.'.format(message['id'], ', '.join(names)), EXPIRED_KEY.format(message['id']), 'action', at)

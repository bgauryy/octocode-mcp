"""Sender notices for requests and action messages that expired before a recipient acknowledged them."""
import json
from .database import query
from .leases import notice

# Runtime-authored keys; senders cannot reuse them.
EXPIRED_KEY = 'expired:{}'
RETRY_KEY = 'retry-exhausted:{}:{}'
RESERVED_KEY_PREFIXES = ('complete:', 'expired:', 'retry-exhausted:')


class ExpiryMixin:
    def notify_expired(self, session, at):
        """Tell `session`, once per message, that its request (a message that wakes the recipient or needs an answer) expired unacknowledged.
        Expiry stops new delivery, but submitted context may already be in progress.
        An absent acknowledgement does not prove the work was never handled. Self-addressed runtime notices are excluded, so
        a notice that expires unread never produces another notice; neither does a retry-exhausted notice to a sender."""
        expired = query(self.db, """SELECT m.id,m.kind,m.slots FROM messages m WHERE m.sender=?1 AND (m.wake='action' OR m.replyRequired=1) AND m.expiresAt<=?2
AND EXISTS(SELECT 1 FROM deliveries d WHERE d.message=m.id AND d.recipient<>m.sender AND d.acknowledgedAt IS NULL)
AND m.key NOT GLOB 'retry-exhausted:*'
AND NOT EXISTS(SELECT 1 FROM messages n WHERE n.sender=m.sender AND n.key='expired:'||m.id) ORDER BY m.id LIMIT 100""", (session, at))
        for message in expired:
            names = [row['name'] for row in query(self.db, 'SELECT s.name FROM deliveries d JOIN sessions s ON s.id=d.recipient WHERE d.message=? AND d.recipient<>? AND d.acknowledgedAt IS NULL ORDER BY s.name', (message['id'], session))]
            default = json.loads(message['slots']).get('default') if message['kind'] == 'decision' else None
            notice(self.db, session, session, 'blocker', {
                'situation': 'Request {} expired before {} acknowledged it'.format(message['id'], ', '.join(names)),
                'background': 'Expiry stops delivery; submitted context may already be in progress',
                'assessment': 'Handling is unconfirmed' + ('; the decision default applies: ' + default if default is not None else ''),
                'recommendation': 'Inspect delivery and the recipient before sending a new request with a new key'},
                EXPIRED_KEY.format(message['id']), 'action', at)

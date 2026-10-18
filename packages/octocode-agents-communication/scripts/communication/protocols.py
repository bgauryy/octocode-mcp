"""Message protocols: each send_message kind is a field named after a known protocol.

The catalog owns every protocol's slots (send_message and complete input schemas, titles included). This
module owns what a schema cannot state, the cross-references to messages, leases, documents and peers,
and renders the stored body from the slots, so every host receives the same text.
"""
import json
import re
from . import catalog
from .database import execute, query

# A plain FYI note keeps the `body` field; every other kind is stored under its field name.
FIELDS = ('body', 'question', 'task', 'decision', 'blocker', 'handoff', 'delta', 'checkback', 'issue')
# Requests oblige the recipient to answer with complete; every other kind is an FYI.
REQUESTS = frozenset(('question', 'task', 'decision', 'handoff'))
# A blocker asks for action without owing an answer, so it wakes like a request.
WAKES = REQUESTS | {'blocker'}
DOCUMENT = re.compile(r'document:([^@\s]+)(?:@([0-9a-f]{64}))?')
MAX_RETRIES = 3


def kind_of(input):
    present = [field for field in FIELDS if field in input]
    if len(present) != 1:
        raise ValueError('Supply exactly one message kind: ' + ', '.join(FIELDS))
    return 'note' if present[0] == 'body' else present[0]


def field(kind):
    return 'body' if kind == 'note' else kind


def schema(kind):
    if kind == 'answer':
        return catalog.definition('complete')['inputSchema']['properties']['reply']
    return catalog.definition('send_message')['inputSchema']['properties'][field(kind)]


def _nonblank(value, where):
    if isinstance(value, str) and not value.strip():
        raise ValueError('Invalid {}: blank'.format(where))
    if isinstance(value, dict):
        for key, item in value.items():
            _nonblank(item, where + '.' + key)
    if isinstance(value, list):
        for item in value:
            _nonblank(item, where)


def _label(key, sub):
    return sub.get('title') or re.sub(r'([A-Z])', lambda match: ' ' + match[1].lower(), key).capitalize()


def _item(value):
    return '{} — {}'.format(value['claim'], value['source']) if isinstance(value, dict) else str(value)


def render(kind, slots, display=None, lead=()):
    """Labelled lines in catalog slot order; `display` replaces stored IDs with readable values."""
    spec, display = schema(kind), display or {}
    lines = [spec['title'], *lead]
    for key, sub in spec['properties'].items():
        if key not in slots:
            continue
        value = display.get(key, slots[key])
        if isinstance(value, bool):
            if value:
                lines.append(_label(key, sub))
        elif isinstance(value, list):
            lines.append(_label(key, sub) + ':')
            lines.extend('- ' + _item(item) for item in value)
        else:
            lines.append('{}: {}'.format(_label(key, sub), value))
    return '\n'.join(lines)


class ProtocolMixin:
    def pin_evidence(self, items):
        """A `document:NAME` source must name a published document; it is stored pinned to its sha256."""
        pinned = []
        for item in items:
            match = DOCUMENT.fullmatch(item['source'])
            if match:
                record = self.document_record(self.db, match[1])
                if record is None:
                    raise ValueError('Evidence cites unknown document {}; publish it with share_document first'.format(match[1]))
                if match[2] and match[2] != record['sha256']:
                    raise ValueError('Evidence pins document {} at another revision; cite document:{}'.format(match[1], match[1]))
                item = dict(item, source='document:{}@{}'.format(match[1], record['sha256']))
            pinned.append(item)
        return pinned

    def message_slots(self, session, kind, input, target):
        """Check cross-references and return (stored slots, rendered body, conversationId)."""
        conversation = input.get('conversationId')
        if kind == 'note':
            return None, catalog.text(input, 'body'), conversation
        if kind == 'question':
            return None, catalog.text(input, 'question'), conversation
        slots, display = dict(input[kind]), {}
        _nonblank(slots, kind)
        direct = 'to' in input
        if 'informed' in slots:
            ids = []
            for value in slots['informed']:
                id = self.resolve_peer(value)
                self.peer(id)
                if id not in ids and id not in (session, target):
                    ids.append(id)
            if ids:
                slots['informed'] = ids
                display['informed'] = [self.peer(id)['name'] for id in ids]
            else:
                del slots['informed']
        if kind == 'decision':
            if len(set(slots['options'])) != len(slots['options']):
                raise ValueError('Decision options must be distinct')
            for key in ('recommendation', 'default'):
                if slots[key] not in slots['options']:
                    raise ValueError('Decision {} must be one of its options'.format(key))
        if kind == 'checkback':
            rows = query(self.db, 'SELECT m.sender,m.conversationId FROM messages m JOIN deliveries d ON d.message=m.id WHERE m.id=? AND d.recipient=? AND d.acknowledgedAt IS NULL AND m.replyRequired=1', (slots['request'], session))
            if not rows:
                raise ValueError('checkback.request must be a pending request you received: item.id from inbox')
            if not direct or target != rows[0]['sender']:
                raise ValueError('Send the checkback to the sender of request {}'.format(slots['request']))
            parent = rows[0].get('conversationId')
            if conversation is not None and conversation != parent:
                raise ValueError('Checkback conversationId must match its request')
            conversation = parent
        if kind == 'handoff':
            if 'evidence' in slots:
                slots['evidence'] = self.pin_evidence(slots['evidence'])
            if 'leases' in slots:
                if not direct:
                    raise ValueError('A handoff that moves leases needs one recipient: use to')
                from .store import now
                rows = query(self.db, 'SELECT id,path,kind,workspace FROM leases WHERE owner=? AND expiresAt>? AND id IN (SELECT value FROM json_each(?)) ORDER BY id', (session, now(), json.dumps(slots['leases'])))
                if len(rows) != len(set(slots['leases'])):
                    raise ValueError('handoff.leases must be live leases you own; check locks')
                recipient = self.peer(target)['workspace']
                if any(row['workspace'] != recipient for row in rows):
                    raise ValueError('Leases protect one worktree and the recipient works in another; unlock them and let it lock its own paths')
                slots['leases'] = [row['id'] for row in rows]
                display['leases'] = ['{} {} ({})'.format(row['id'], self.relative(row['path'], row['workspace']), row['kind']) for row in rows]
        return slots, render(kind, slots, display), conversation

    def answer_slots(self, input):
        """A final reply is a BLUF: outcome and conclusion first, evidence pinned, gaps named."""
        slots = dict(input['reply'])
        _nonblank(slots, 'reply')
        if 'evidence' in slots:
            slots['evidence'] = self.pin_evidence(slots['evidence'])
        return slots, render('answer', slots, lead=('Outcome: ' + input['outcome'],))

    def finish_request(self, session, parent, reply, outcome, at):
        """Effects a final reply has on its request, inside the reply transaction."""
        rows = query(self.db, 'SELECT kind,slots,sender FROM messages WHERE id=?', (parent,))
        kind, slots = rows[0]['kind'], json.loads(rows[0].get('slots') or '{}')
        if kind == 'task' and slots.get('checkBack') and outcome == 'done' and not query(
                self.db, "SELECT 1 FROM messages WHERE sender=? AND kind='checkback' AND json_extract(slots,'$.request')=? LIMIT 1", (session, parent)):
            raise ValueError('Task {} asks for a check-back: send checkback {{request:{},objective,done}} to its sender before completing it done'.format(parent, parent))
        for id in slots.get('informed', []):
            if id != session:
                execute(self.db, 'INSERT OR IGNORE INTO deliveries(message,recipient) VALUES(?,?)', (reply, id))
        if kind != 'handoff' or outcome != 'done' or not slots.get('leases'):
            return {}
        moved = []
        for lease in query(self.db, 'SELECT * FROM leases WHERE owner=? AND workspace=? AND expiresAt>? AND id IN (SELECT value FROM json_each(?)) ORDER BY id', (rows[0]['sender'], self.workspace, at, json.dumps(slots['leases']))):
            execute(self.db, 'DELETE FROM leases WHERE id=?', (lease['id'],))
            reasoning = ('Handoff {}: {}'.format(parent, lease['reasoning']).encode('utf-8')[:512]).decode('utf-8', 'ignore')
            expires = at + min(600000, max(1000, lease['expiresAt'] - lease['refreshedAt']))
            id = self.db.execute('INSERT INTO leases(workspace,path,kind,owner,acquiredAt,refreshedAt,expiresAt,reasoning,pathKey) VALUES(?,?,?,?,?,?,?,?,?)', (lease['workspace'], lease['path'], lease['kind'], session, at, at, expires, reasoning, lease['pathKey'])).lastrowid
            moved.append(dict(id=id, path=self.relative(lease['path'], lease['workspace']), kind=lease['kind'], expiresAt=expires))
        result = {'leases': moved}
        if len(moved) != len(slots['leases']):
            result['leasesNotMoved'] = 'The sender no longer holds some handed-off leases; lock those paths yourself'
        return result

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { binary, jsonCall, tempWorkspace, withReasoning } from './helpers.mjs';

function fixture(t) {
  const workspace = tempWorkspace(t, 'communication-protocols-', { real: true }), database = join(workspace, 'protocols.sqlite');
  const raw = jsonCall(binary, workspace, database, { stdio: 'pipe' });
  const call = (command, input, session) => raw(command, withReasoning(command, input), session);
  const join_ = name => call('join', { name, vendor: 'generic' }).id;
  const alice = join_('alice'), bob = join_('bob'), carol = join_('carol');
  const db = new DatabaseSync(database); t.after(() => db.close());
  const inbox = session => call('inbox', {}, session).items;
  return { call, db, alice, bob, carol, inbox };
}

test('Given a message, when it names zero or two kinds, then it is refused; one kind sets reply policy and wake', t => {
  const f = fixture(t);
  assert.throws(() => f.call('send_message', { to: 'bob' }, f.alice), /exactly one message kind/);
  assert.throws(() => f.call('send_message', { to: 'bob', body: 'x', question: 'y?' }, f.alice), /exactly one message kind/);
  const policy = id => ({ ...f.db.prepare('SELECT kind,replyRequired,wake FROM messages WHERE id=?').get(id) });
  assert.deepEqual(policy(f.call('send_message', { to: 'bob', body: 'FYI' }, f.alice).id), { kind: 'note', replyRequired: 0, wake: 'passive' });
  assert.deepEqual(policy(f.call('send_message', { to: 'bob', question: 'Why?' }, f.alice).id), { kind: 'question', replyRequired: 1, wake: 'action' });
  assert.deepEqual(policy(f.call('send_message', { to: 'bob', blocker: { situation: 'CI red', background: 'main', assessment: 'flaky', recommendation: 'rerun' } }, f.alice).id), { kind: 'blocker', replyRequired: 0, wake: 'action' });
  assert.deepEqual(policy(f.call('send_message', { to: 'bob', delta: { changes: ['tests pass'] } }, f.alice).id), { kind: 'delta', replyRequired: 0, wake: 'passive' });
  const issue = f.call('send_message', { to: 'bob', issue: { what: 'crash', where: 'a.ts:3', when: 'on save', who: 'unknown', why: 'unknown', how: 'save twice', howMuch: 'every save' } }, f.alice);
  assert.equal(f.inbox(f.bob).find(item => item.id === issue.id).body, '5W2H\nWhat: crash\nWhere: a.ts:3\nWhen: on save\nWho: unknown\nWhy: unknown\nHow: save twice\nHow much: every save');
  assert.throws(() => f.call('send_message', { to: 'bob', delta: { changes: ['  '] } }, f.alice), /blank/);
});

test('Given a task asking for check-back, when the recipient completes it done first, then it is refused until the check-back is sent', t => {
  const f = fixture(t);
  const task = f.call('send_message', { to: 'bob', task: { objective: 'Review storage', output: 'Findings', done: 'Given v7, when migrated, then tests pass', checkBack: true, informed: ['carol'] } }, f.alice);
  const body = f.inbox(f.bob).find(item => item.id === task.id).body;
  assert.equal(body, 'Task contract\nObjective: Review storage\nOutput: Findings\nDefinition of Done: Given v7, when migrated, then tests pass\nCheck back\nInformed:\n- carol');
  const answer = { message: task.id, outcome: 'done', reply: { conclusion: 'Storage is fine' } };
  assert.throws(() => f.call('complete', answer, f.bob), /asks for a check-back/);
  assert.throws(() => f.call('send_message', { to: 'carol', checkback: { request: task.id, objective: 'Review storage', done: 'tests pass' } }, f.bob), /sender of request/);
  f.call('send_message', { to: 'alice', checkback: { request: task.id, objective: 'Review storage', done: 'tests pass' } }, f.bob);
  const done = f.call('complete', answer, f.bob);
  assert.equal(done.completed, true);
  // RACI Informed: carol receives the same answer without owing anything.
  const copy = f.inbox(f.carol).find(item => item.id === done.id);
  assert.equal(copy.kind, 'answer');
  assert.equal(copy.replyRequired, false);
  assert.equal(f.inbox(f.alice).find(item => item.id === done.id).body, 'BLUF\nOutcome: done\nConclusion: Storage is fine');
});

test('Given a decision request, when its recommendation is not an option, then it is refused; when it expires, the sender learns its default applies', t => {
  const f = fixture(t);
  const decision = { question: 'Which store?', options: ['sqlite', 'postgres'], recommendation: 'sqlite', default: 'sqlite' };
  assert.throws(() => f.call('send_message', { to: 'bob', decision: { ...decision, recommendation: 'mysql' } }, f.alice), /recommendation must be one of its options/);
  assert.throws(() => f.call('send_message', { to: 'bob', decision: { ...decision, options: ['sqlite', 'sqlite'] } }, f.alice), /distinct/);
  const sent = f.call('send_message', { to: 'bob', decision, ttlMs: 1000 }, f.alice);
  f.db.prepare('UPDATE messages SET expiresAt=1 WHERE id=?').run(sent.id);
  f.call('heartbeat', {}, f.alice);
  const notice = f.inbox(f.alice).find(item => item.kind === 'blocker');
  assert.match(notice.body, /^SBAR\nSituation: Request \d+ expired before bob acknowledged it/);
  assert.match(notice.body, /the decision default applies: sqlite/);
});

test('Given a handoff with leases, when the recipient completes it done, then the leases move to the recipient', t => {
  const f = fixture(t);
  const lease = f.call('lock', { path: 'a.ts' }, f.alice).lease;
  f.call('share_document', { name: 'draft.md', content: 'half done' }, f.alice);
  assert.throws(() => f.call('send_message', { to: 'bob', handoff: { state: 'x', next: 'y', leases: [lease.id + 99] } }, f.alice), /live leases you own/);
  assert.throws(() => f.call('send_message', { to: 'bob', handoff: { state: 'x', next: 'y', evidence: [{ claim: 'draft', source: 'document:missing.md' }] } }, f.alice), /unknown document/);
  const handoff = f.call('send_message', { to: 'bob', handoff: { state: 'Half done', next: 'Finish a.ts', evidence: [{ claim: 'Draft', source: 'document:draft.md' }], leases: [lease.id] } }, f.alice);
  const body = f.inbox(f.bob).find(item => item.id === handoff.id).body;
  assert.match(body, /^Handoff packet\nState: Half done\nEvidence:\n- Draft — document:draft\.md@[0-9a-f]{64}\nNext: Finish a\.ts\nLeases:\n- \d+ a\.ts \(file\)$/, 'evidence pins the document revision');
  const done = f.call('complete', { message: handoff.id, outcome: 'done', reply: { conclusion: 'Taken over' } }, f.bob);
  assert.deepEqual(done.leases.map(item => item.path), ['a.ts']);
  const owners = f.db.prepare('SELECT owner FROM leases WHERE expiresAt>?').all(Date.now()).map(row => row.owner);
  assert.deepEqual(owners, [f.bob]);
});

test('Given a checkpoint record, when the agent reads its binding or resumes, then the latest checkpoint returns', t => {
  const f = fixture(t);
  assert.equal(f.call('binding', {}, f.alice).checkpoint, undefined);
  f.call('record', { type: 'checkpoint', data: { goal: 'Ship v7', next: 'Write docs' } }, f.alice);
  const latest = f.call('record', { type: 'checkpoint', data: { goal: 'Ship v7', done: ['docs'], next: 'Run tests' } }, f.alice);
  assert.throws(() => f.call('record', { type: 'checkpoint', data: { goal: 'No next' } }, f.alice));
  assert.deepEqual(f.call('binding', {}, f.alice).checkpoint, { recordId: latest.recordId, timestamp: latest.timestamp, data: latest.data });
  f.call('leave', {}, f.alice);
  assert.deepEqual(f.call('resume', { vendor: 'generic' }, f.alice).checkpoint.data, latest.data);
});

test('Given a published document, when a revision supersedes it, then the ADR link is recorded and an unknown target is refused', t => {
  const f = fixture(t);
  f.call('share_document', { name: 'adr-1.md', content: 'Use SQLite' }, f.alice);
  assert.throws(() => f.call('share_document', { name: 'adr-2.md', content: 'Use Postgres', supersedes: 'adr-0.md' }, f.alice), /supersedes must name a published document/);
  assert.throws(() => f.call('share_document', { name: 'adr-3.md', content: 'Self', supersedes: 'adr-3.md' }, f.alice), /cannot supersede itself/);
  const revision = f.call('share_document', { name: 'adr-2.md', content: 'Use Postgres', supersedes: 'adr-1.md' }, f.alice);
  assert.equal(revision.document.supersedes, 'adr-1.md');
  assert.equal(f.call('share_document', { name: 'adr-2.md', content: 'Use Postgres', supersedes: 'adr-1.md' }, f.alice).created, false);
  assert.throws(() => f.call('share_document', { name: 'adr-2.md', content: 'Use Postgres' }, f.alice), /immutable/);
});

test('Given repeated delivery failures, when retries pass the bound, then the runtime backs off and tells the sender once', t => {
  const f = fixture(t);
  f.call('attach', { transport: 'raw' }, f.bob);
  const sent = f.call('send_message', { to: 'bob', question: 'Review?' }, f.alice);
  f.call('hook', { format: 'json', deferConfirm: true, consumer: 'retry' }, f.bob);
  f.db.prepare("UPDATE dispatches SET state='uncertain',error='Receipt unknown' WHERE message=?").run(sent.id);
  const retry = () => f.call('retry_delivery', { message: sent.id, reason: 'Receiver shows no receipt' }, f.bob);
  assert.deepEqual(retry(), { ready: true, retries: 1 }, 'the first retry is immediate');
  f.call('hook', { format: 'json', deferConfirm: true, consumer: 'retry' }, f.bob);
  f.db.prepare("UPDATE dispatches SET state='uncertain' WHERE message=?").run(sent.id);
  const second = retry();
  assert.equal(second.ready, false);
  assert.ok(second.retryAfterMs > 0 && second.retryAfterMs <= 2000, 'the second retry waits for its backoff');
  // Older retries, plus one budget deferral that is not a retry, as recorded history.
  const record = f.db.prepare("INSERT INTO records(path,\"from\",\"to\",type,timestamp,data,entityId) VALUES((SELECT workspace FROM sessions WHERE id=?),?,?,'dispatch.ready',?,?,?)");
  for (const error of ['Receipt unknown', 'Receipt unknown', 'Host context budget; offered at a later hook event']) record.run(f.bob, f.bob, f.alice, 1, JSON.stringify({ messageId: sent.id, error }), String(sent.id));
  const exhausted = retry();
  assert.deepEqual({ ready: exhausted.ready, exhausted: exhausted.exhausted, retries: exhausted.retries }, { ready: false, exhausted: true, retries: 3 });
  retry();
  const notices = f.inbox(f.alice).filter(item => item.kind === 'blocker');
  assert.equal(notices.length, 1, 'one notice per message and recipient');
  assert.match(notices[0].body, new RegExp(`^SBAR\\nSituation: Message ${sent.id} failed delivery to bob after 3 retries`));
  assert.throws(() => f.call('send_message', { to: 'bob', body: 'spoof', key: `retry-exhausted:${sent.id}:x` }, f.alice), /reserved/);
});

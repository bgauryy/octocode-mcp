import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { binary, jsonCall, only, tempWorkspace, withReasoning } from './helpers.ts';
import type { JsonRecord } from './json-record.ts';

function fixture(t: TestContext) {
  const workspace = tempWorkspace(t, 'communication-fyi-', { real: true }), database = join(workspace, 'fyi.sqlite');
  const raw = jsonCall(binary, workspace, database, { stdio: 'pipe' });
  const call = (command: string, input: Record<string, unknown>, session?: string) => raw(command, withReasoning(command, input), session);
  const join_ = (name: string) => call('join', { name, vendor: 'generic' }).id;
  const db = new DatabaseSync(database); t.after(() => db.close());
  const row = (id: number) => only(db.prepare('SELECT replyRequired, wake FROM messages WHERE id=?').get(id));
  return { call, join: join_, db, row };
}

test('an unmarked message is an FYI: no answer owed, passive wake, no reply possible', t => {
  const f = fixture(t), alice = f.join('alice'), bob = f.join('bob');
  const direct = f.call('send_message', { to: bob, body: 'Heads up: build is green' }, alice);
  assert.deepEqual({ ...f.row(direct.id) }, { replyRequired: 0, wake: 'passive' });
  const [item] = f.call('inbox', {}, bob).items;
  assert.equal(item.replyRequired, false);
  assert.equal(item.wake, 'passive');
  assert.throws(() => f.call('complete', { message: direct.id, outcome:'done',reply:{conclusion:'thanks'} }, bob), /informational and accepts no reply/);
  assert.deepEqual(f.call('complete', { messages: [direct.id] }, bob), { completed: true, count: 1 });
  const topic = f.call('send_message', { topic: 'news', body: 'Release notes' }, alice);
  assert.deepEqual({ ...f.row(topic.id) }, { replyRequired: 0, wake: 'passive' });
  const fanout = f.call('notify_all', { body: 'Everyone: freeze starts' }, alice);
  assert.deepEqual({ ...f.row(fanout.id) }, { replyRequired: 0, wake: 'passive' });
});

test('a request kind owes an answer and wakes; explicit wake always wins', t => {
  const f = fixture(t), alice = f.join('alice'), bob = f.join('bob');
  const request = f.call('send_message', { to: bob, question: 'Which file owns this?' }, alice);
  assert.deepEqual({ ...f.row(request.id) }, { replyRequired: 1, wake: 'action' });
  const quiet = f.call('send_message', { to: bob, question: 'When convenient: review', wake: 'passive' }, alice);
  assert.deepEqual({ ...f.row(quiet.id) }, { replyRequired: 1, wake: 'passive' });
  const urgent = f.call('send_message', { to: bob, body: 'Urgent FYI: stop deploying', wake: 'action' }, alice);
  assert.deepEqual({ ...f.row(urgent.id) }, { replyRequired: 0, wake: 'action' });
  const topic = f.call('send_message', { topic: 'review', question: 'Who can review?' }, alice);
  assert.deepEqual({ ...f.row(topic.id) }, { replyRequired: 1, wake: 'action' });
});

test('complete wakes the asker with its answer, and the answer is not itself a request', t => {
  const f = fixture(t), alice = f.join('alice'), bob = f.join('bob');
  const request = f.call('send_message', { to: bob, question: 'Review the change' }, alice);
  const answer = f.call('complete', { message: request.id, outcome:'done',reply:{conclusion:'Reviewed; checks pass'} }, bob);
  assert.deepEqual({ ...f.row(answer.id) }, { replyRequired: 0, wake: 'action' });
  assert.equal(f.call('inbox', {}, alice).items.find((item: JsonRecord) => item.id === answer.id).wake, 'action');
});

test('a required request sent passively still expires with a sender notice and a health issue', t => {
  const f = fixture(t), alice = f.join('alice'), bob = f.join('bob');
  const sent = f.call('send_message', { to: bob, question: 'Please review when free', wake: 'passive', ttlMs: 1000 }, alice);
  const fyi = f.call('send_message', { to: bob, body: 'FYI only', ttlMs: 1000 }, alice);
  f.db.prepare('UPDATE messages SET expiresAt=1 WHERE id IN (?,?)').run(sent.id, fyi.id);
  assert.ok(f.call('health', {}).issues.some((issue: JsonRecord) => issue.message === sent.id && issue.issue === 'expiredAction'));
  assert.ok(!f.call('health', {}).issues.some((issue: JsonRecord) => issue.message === fyi.id), 'an expired FYI needs no attention');
  f.call('heartbeat', {}, alice);
  const notices = f.call('inbox', {}, alice).items.filter((item: JsonRecord) => item.kind === 'blocker' && /^SBAR\nSituation: Request \d+ expired/.test(item.body));
  assert.equal(notices.length, 1);
  assert.match(notices[0].body, new RegExp(`^SBAR\nSituation: Request ${sent.id} expired before bob acknowledged it`));
});

test('a raw SQL insert that names no reply policy is an FYI, like the tools', t => {
  const f = fixture(t), alice = f.join('alice'), bob = f.join('bob');
  const id = Number(f.db.prepare("INSERT INTO messages(sender,target,body,key,expiresAt,reasoning) VALUES(?,?,'Raw note','raw-fyi',?,'Check the column defaults')").run(alice, bob, Date.now() + 60_000).lastInsertRowid);
  assert.deepEqual({ ...f.row(id) }, { replyRequired: 0, wake: 'passive' });
  assert.deepEqual(
    f.db.prepare("SELECT name, dflt_value FROM pragma_table_info('messages') WHERE name IN ('replyRequired','wake') ORDER BY name").all().map(row => ({ ...row })),
    [{ name: 'replyRequired', dflt_value: '0' }, { name: 'wake', dflt_value: "'passive'" }],
  );
});

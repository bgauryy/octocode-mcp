// Black-box tests for the message-protocol cross-reference rules.
// Everything runs through the public CLI and MCP server on a temporary database.
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { binary, execFileSync, jsonCall, tempWorkspace, withReasoning } from './helpers.ts';
import type { JsonRecord } from './json-record.ts';

function fixture(t: TestContext) {
  const workspace = tempWorkspace(t, 'communication-protocol-rules-', { real: true }), database = join(workspace, 'rules.sqlite');
  const raw = jsonCall(binary, workspace, database, { stdio: 'pipe', timeout: 15000 });
  const call = (command: string, input: Record<string, unknown>, session?: string) => raw(command, withReasoning(command, input), session);
  const join_ = (name: string) => call('join', { name, vendor: 'generic' }).id;
  const alice = join_('alice'), bob = join_('bob'), carol = join_('carol');
  const inbox = (session: string) => call('inbox', {}, session).items;
  const find = (session: string, id: number) => inbox(session).find((item: JsonRecord) => item.id === id);
  const body = (session: string, id: number) => find(session, id).body;
  const mcp = (session: string, calls: JsonRecord[]) => {
    const frames = calls.map((params, index) => JSON.stringify({ jsonrpc: '2.0', id: index + 1, method: 'tools/call', params })).join('\n') + '\n';
    const out = execFileSync(binary, ['mcp', '--tools', 'send_message,complete', '--workspace', workspace, '--database', database, '--session', session], { input: frames, encoding: 'utf8', timeout: 15000 });
    return out.trim().split('\n').map(line => JSON.parse(line));
  };
  return { call, alice, bob, carol, inbox, find, body, mcp };
}

const task = (extra = {}) => ({ objective: 'Review storage', output: 'Findings', done: 'Given v7, when migrated, then tests pass', ...extra });
const decision = (extra = {}) => ({ question: 'Which store?', options: ['sqlite', 'postgres'], recommendation: 'sqlite', default: 'sqlite', ...extra });
const restate = (request: number) => ({ request, objective: 'Review storage', done: 'tests pass' });
const sbar = { situation: 'CI red', background: 'main', assessment: 'flaky', recommendation: 'rerun' };
const issue = { what: 'crash', where: 'a.ts:3', when: 'on save', who: 'unknown', why: 'unknown', how: 'save twice', howMuch: 'every save' };
const answer = (message: number, conclusion = 'Done', extra: Record<string, unknown> = {}) => ({ message, outcome: 'done', reply: { conclusion }, ...extra });

// --- Kinds: reply policy, wake and rendered bodies -------------------------------------------------------------

test('Given each message kind, when it is delivered, then replyRequired and wake follow the kind', t => {
  const f = fixture(t);
  const inputs = {
    note: { body: 'FYI' }, question: { question: 'Why?' }, task: { task: task() }, decision: { decision: decision() },
    handoff: { handoff: { state: 'Half done', next: 'Finish it' } }, blocker: { blocker: sbar }, delta: { delta: { changes: ['tests pass'] } }, issue: { issue },
  };
  const ids = Object.fromEntries(Object.entries(inputs).map(([kind, input]) => [kind, f.call('send_message', { to: 'bob', ...input }, f.alice).id]));
  ids.checkback = f.call('send_message', { to: 'alice', checkback: restate(ids.task) }, f.bob).id;
  const expected = {
    note: [false, 'passive'], question: [true, 'action'], task: [true, 'action'], decision: [true, 'action'], handoff: [true, 'action'],
    blocker: [false, 'action'], delta: [false, 'passive'], issue: [false, 'passive'], checkback: [false, 'passive'],
  };
  for (const [kind, [replyRequired, wake]] of Object.entries(expected)) {
    const item = f.find(kind === 'checkback' ? f.alice : f.bob, ids[kind]);
    assert.deepEqual({ kind: item.kind, replyRequired: item.replyRequired, wake: item.wake }, { kind, replyRequired, wake });
  }
});

test('Given each message kind, when it is stored, then the body is the labelled slots in catalog order', t => {
  const f = fixture(t);
  const send = (input: Record<string, unknown>) => f.call('send_message', { to: 'bob', ...input }, f.alice).id;
  assert.equal(f.body(f.bob, send({ body: 'Plain FYI' })), 'Plain FYI');
  assert.equal(f.body(f.bob, send({ question: 'Which store?' })), 'Which store?');
  assert.equal(f.body(f.bob, send({ task: task({ inputs: ['a.ts'], constraints: ['no new deps'], budget: '1h', checkBack: true, informed: ['carol'] }) })),
    'Task contract\nObjective: Review storage\nInputs:\n- a.ts\nConstraints:\n- no new deps\nOutput: Findings\nDefinition of Done: Given v7, when migrated, then tests pass\nBudget: 1h\nCheck back before completing: send checkback with this message id\nInformed (copied on the answer):\n- carol');
  assert.equal(f.body(f.bob, send({ decision: decision({ tradeoffs: ['sqlite is simple'], default: 'postgres', informed: ['carol'] }) })),
    'Decision request\nQuestion: Which store?\nOptions:\n- sqlite\n- postgres\nTradeoffs:\n- sqlite is simple\nRecommendation: sqlite\nDefault if unanswered: postgres\nInformed (copied on the answer):\n- carol');
  assert.equal(f.body(f.bob, send({ blocker: sbar })), 'SBAR\nSituation: CI red\nBackground: main\nAssessment: flaky\nRecommendation: rerun');
  assert.equal(f.body(f.bob, send({ delta: { changes: ['tests pass'], blockers: ['CI slow'], next: 'merge' } })), 'Delta update\nChanges:\n- tests pass\nBlockers:\n- CI slow\nNext: merge');
  assert.equal(f.body(f.bob, send({ handoff: { state: 'Half done', blockers: ['review'], next: 'Finish it' } })), 'Handoff packet\nState: Half done\nBlockers:\n- review\nNext: Finish it');
  const request = send({ task: task() });
  const checkback = f.call('send_message', { to: 'alice', checkback: restate(request) }, f.bob).id;
  assert.equal(f.body(f.alice, checkback), `Check-back\nRequest: ${request}\nObjective: Review storage\nDefinition of Done: tests pass`);
});

// --- FYI completion --------------------------------------------------------------------------------------------

// --- Idempotency keys ------------------------------------------------------------------------------------------

test('Given a key, when the same content is sent again, then the stored message is returned and nothing is delivered twice', t => {
  const f = fixture(t);
  const input = { to: 'bob', task: task({ informed: ['carol'] }), key: 'once', ttlMs: 600000, wake: 'action' };
  const first = f.call('send_message', input, f.alice);
  assert.deepEqual(f.call('send_message', { ...input }, f.alice), first);
  assert.deepEqual(f.inbox(f.bob).map((item: JsonRecord) => item.id), [first.id]);
});

test('Given a key, when any identity field of the content changes, then it is refused as a reused key and nothing is delivered', t => {
  const f = fixture(t);
  const base = { to: 'bob', body: 'FYI', key: 'k', reasoning: 'Verify keyed delivery stays immutable', ttlMs: 600000 };
  f.call('send_message', base, f.alice);
  const { body: _body, ...bodiless } = base;
  const changes = {
    target: { ...base, to: 'carol' }, body: { ...base, body: 'Different' }, kind: { ...bodiless, question: 'FYI' },
    reasoning: { ...base, reasoning: 'Verify a changed reason is refused' }, ttl: { ...base, ttlMs: 300000 },
    wake: { ...base, wake: 'action' }, conversation: { ...base, conversationId: 'thread' },
  };
  for (const [name, input] of Object.entries(changes)) assert.throws(() => f.call('send_message', input, f.alice), /Message key reused with different content/, name);
  const structured = { to: 'bob', task: task({ inputs: ['a.ts'] }), key: 'k2' };
  f.call('send_message', structured, f.alice);
  assert.throws(() => f.call('send_message', { ...structured, task: task({ inputs: ['b.ts'] }) }, f.alice), /Message key reused with different content/, 'changed slot');
  assert.throws(() => f.call('send_message', { ...structured, task: task({ inputs: ['a.ts'], budget: '1h' }) }, f.alice), /Message key reused with different content/, 'added slot');
  assert.equal(f.inbox(f.bob).length, 2, 'refused retries deliver nothing');
  assert.equal(f.inbox(f.carol).length, 0);
});

test('Given a key, when another sender uses it it is a separate message; reserved prefixes are refused', t => {
  const f = fixture(t);
  const mine = f.call('send_message', { to: 'bob', body: 'from alice', key: 'shared' }, f.alice);
  const theirs = f.call('send_message', { to: 'bob', body: 'from carol', key: 'shared' }, f.carol);
  assert.notEqual(mine.id, theirs.id);
  for (const prefix of ['complete:', 'expired:', 'retry-exhausted:']) assert.throws(() => f.call('send_message', { to: 'bob', body: 'spoof', key: `${prefix}1` }, f.alice), /reserved/, prefix);
});

// --- Informed (RACI) -------------------------------------------------------------------------------------------

test('Given an unknown informed peer, when the message is sent, then it is refused and nothing is stored', t => {
  const f = fixture(t);
  for (const input of [{ task: task({ informed: ['carol', 'nobody'] }) }, { decision: decision({ informed: ['nobody'] }) }]) {
    assert.throws(() => f.call('send_message', { to: 'bob', ...input }, f.alice), /Unknown peer nobody/);
  }
  assert.equal(f.inbox(f.bob).length, 0);
});

test('Given an informed peer on a task or decision, when it is completed, then the peer gets the answer as an FYI exactly once', t => {
  const f = fixture(t);
  const asked = f.call('send_message', { to: 'bob', task: task({ informed: ['carol', f.carol] }) }, f.alice);
  const decided = f.call('send_message', { to: 'bob', decision: decision({ informed: ['carol'] }) }, f.alice);
  assert.match(f.body(f.bob, decided.id), /\nInformed \(copied on the answer\):\n- carol$/);
  const answers = [f.call('complete', answer(asked.id, 'Storage is fine'), f.bob), f.call('complete', answer(decided.id, 'sqlite'), f.bob)];
  const copies = f.inbox(f.carol);
  assert.deepEqual(copies.map((item: JsonRecord) => item.id), answers.map((item: JsonRecord) => item.id), 'one copy per answer');
  for (const copy of copies) assert.deepEqual({ kind: copy.kind, replyRequired: copy.replyRequired }, { kind: 'answer', replyRequired: false });
  // A request that names informed peers has its answer lead with the request kind, ID and headline.
  assert.equal(copies[1].body, `BLUF\nRe decision ${decided.id}: Which store?\nOutcome: done\nConclusion: sqlite`);
  assert.deepEqual(f.call('complete', answer(asked.id, 'Storage is fine'), f.bob), answers[0], 'an identical retry adds no copy');
  assert.equal(f.inbox(f.carol).length, 2);
  for (const copy of copies) assert.deepEqual(f.call('complete', { message: copy.id }, f.carol), { completed: true, count: 1 });
  assert.equal(f.inbox(f.carol).length, 0);
});

// --- Check-back ------------------------------------------------------------------------------------------------

test('Given a check-back, when its request is not a pending request this session received, then it is refused', t => {
  const f = fixture(t);
  const asked = f.call('send_message', { to: 'bob', task: task({ checkBack: true }) }, f.alice);
  const send = (session: string, request: number, to: string) => f.call('send_message', { to, checkback: restate(request) }, session);
  // Only a task can be checked back.
  const refused = /must be a pending task you received/;
  assert.throws(() => send(f.bob, 999, 'alice'), refused, 'unknown id');
  assert.throws(() => send(f.carol, asked.id, 'alice'), refused, 'received by someone else');
  assert.throws(() => send(f.alice, asked.id, 'bob'), refused, 'sent, not received, by the caller');
  const note = f.call('send_message', { to: 'bob', body: 'FYI' }, f.alice);
  assert.throws(() => send(f.bob, note.id, 'alice'), refused, 'an FYI is not a request');
  f.call('complete', { message: asked.id, outcome: 'refused', reply: { conclusion: 'Declined' } }, f.bob);
  assert.throws(() => send(f.bob, asked.id, 'alice'), refused, 'already answered');
});

test('Given a check-back, when it is not sent directly to the request sender, then it is refused', t => {
  const f = fixture(t);
  f.call('subscribe', { topics: ['news'] }, f.alice);
  const asked = f.call('send_message', { to: 'bob', task: task() }, f.alice);
  assert.throws(() => f.call('send_message', { to: 'carol', checkback: restate(asked.id) }, f.bob), /sender of request/);
  assert.throws(() => f.call('send_message', { topic: 'news', checkback: restate(asked.id) }, f.bob), /sender of request/);
});

test('Given a conversation, when a check-back is sent, then it inherits the request conversation and a different one is refused', t => {
  const f = fixture(t);
  const threaded = f.call('send_message', { to: 'bob', task: task(), conversationId: 'thread-1' }, f.alice);
  assert.throws(() => f.call('send_message', { to: 'alice', checkback: restate(threaded.id), conversationId: 'thread-2' }, f.bob), /conversationId must match its request/);
  const inherited = f.call('send_message', { to: 'alice', checkback: restate(threaded.id) }, f.bob);
  assert.equal(f.find(f.alice, inherited.id).conversationId, 'thread-1');
  const explicit = f.call('send_message', { to: 'alice', checkback: restate(threaded.id), conversationId: 'thread-1' }, f.bob);
  assert.equal(f.find(f.alice, explicit.id).conversationId, 'thread-1');
  const bare = f.call('send_message', { to: 'bob', task: task() }, f.alice);
  assert.throws(() => f.call('send_message', { to: 'alice', checkback: restate(bare.id), conversationId: 'invented' }, f.bob), /conversationId must match its request/, 'a request without a conversation admits none');
});

test('Given a task asking for check-back, when it is completed done, then any earlier check-back opens the gate, even a repeated one', t => {
  const f = fixture(t);
  const asked = f.call('send_message', { to: 'bob', task: task({ checkBack: true }) }, f.alice);
  assert.throws(() => f.call('complete', answer(asked.id), f.bob), /asks for a check-back/);
  f.call('send_message', { to: 'alice', checkback: restate(asked.id) }, f.bob);
  f.call('send_message', { to: 'alice', checkback: restate(asked.id) }, f.bob);
  assert.equal(f.call('complete', answer(asked.id), f.bob).completed, true);
  const plain = f.call('send_message', { to: 'bob', task: task() }, f.alice);
  assert.equal(f.call('complete', answer(plain.id), f.bob).completed, true, 'a task without checkBack needs none');
});

test('Given a check-back, when it names another task, then it does not open the gate', t => {
  const f = fixture(t);
  const asked = f.call('send_message', { to: 'bob', task: task({ checkBack: true }) }, f.alice);
  const other = f.call('send_message', { to: 'bob', task: task() }, f.alice);
  f.call('send_message', { to: 'alice', checkback: restate(other.id) }, f.bob);
  assert.throws(() => f.call('complete', answer(asked.id), f.bob), /asks for a check-back/);
});

test('Given a task asking for check-back, when it is completed refused or canceled, then no check-back is needed', t => {
  const f = fixture(t);
  for (const outcome of ['refused', 'canceled']) {
    const asked = f.call('send_message', { to: 'bob', task: task({ checkBack: true }) }, f.alice);
    assert.equal(f.call('complete', { message: asked.id, outcome, reply: { conclusion: `Work ${outcome}` } }, f.bob).completed, true, outcome);
  }
});

test('Given a task asking for check-back, when it is completed partial or failed, then it is refused until the check-back is sent', t => {
  const f = fixture(t);
  for (const outcome of ['partial', 'failed']) {
    const asked = f.call('send_message', { to: 'bob', task: task({ checkBack: true }) }, f.alice);
    assert.throws(() => f.call('complete', { message: asked.id, outcome, reply: { conclusion: 'Stopped' } }, f.bob), /asks for a check-back/, outcome);
  }
});

test('Given a request that is not a task, when a check-back names it, then it is refused', t => {
  const f = fixture(t);
  const requests = { question: { question: 'Why?' }, decision: { decision: decision() }, handoff: { handoff: { state: 'x', next: 'y' } } };
  for (const [kind, input] of Object.entries(requests)) {
    const asked = f.call('send_message', { to: 'bob', ...input }, f.alice);
    assert.throws(() => f.call('send_message', { to: 'alice', checkback: restate(asked.id) }, f.bob), /task/, kind);
  }
});

// --- Handoff: leases -------------------------------------------------------------------------------------------

function linkedWorktrees(t: TestContext) {
  const directory = tempWorkspace(t, 'communication-protocol-worktrees-', { real: true }), main = join(directory, 'main'), topic = join(directory, 'topic');
  mkdirSync(main); mkdirSync(topic);
  execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', '--quiet', main], { stdio: 'pipe' });
  const metadata = join(main, '.git', 'worktrees', 'topic');
  mkdirSync(metadata, { recursive: true });
  writeFileSync(join(topic, '.git'), `gitdir: ${metadata}\n`);
  writeFileSync(join(metadata, 'HEAD'), 'ref: refs/heads/feature/topic\n');
  writeFileSync(join(metadata, 'commondir'), '../..\n');
  writeFileSync(join(metadata, 'gitdir'), `${join(topic, '.git')}\n`);
  const database = join(directory, 'shared.sqlite');
  const call = (workspace: string, command: string, input: Record<string, unknown> = {}, session?: string) => jsonCall(binary, realpathSync(workspace), database, { stdio: 'pipe', timeout: 15000 })(command, withReasoning(command, input), session);
  const a = call(main, 'join', { name: 'main-author', vendor: 'codex' }).id, b = call(topic, 'join', { name: 'topic-reviewer', vendor: 'claude' }).id;
  return { main, topic, call, a, b };
}

const handoffOf = (leases: number[]) => ({ state: 'Half done', next: 'Finish it', leases });
const owners = (f: ReturnType<typeof fixture>, session: string) => f.call('locks', {}, session).items.map((item: JsonRecord) => ({ path: item.path.split('/').pop(), owner: item.owner }));

test('Given a handoff with leases, when it goes to a topic instead of one recipient, then it is refused and the leases stay', t => {
  const f = fixture(t);
  f.call('subscribe', { topics: ['crew'] }, f.bob);
  const lease = f.call('lock', { path: 'a.ts' }, f.alice).lease;
  assert.throws(() => f.call('send_message', { topic: 'crew', handoff: handoffOf([lease.id]) }, f.alice), /needs one recipient: use to/);
  assert.equal(f.inbox(f.bob).length, 0);
  assert.deepEqual(owners(f, f.alice), [{ path: 'a.ts', owner: f.alice }]);
  assert.equal(f.call('send_message', { topic: 'crew', handoff: { state: 'x', next: 'y' } }, f.alice).recipients, 1, 'a handoff without leases may go to a topic');
});

test('Given a handoff with leases, when they are not live leases of the sender, then it is refused', t => {
  const f = fixture(t);
  const mine = f.call('lock', { path: 'a.ts' }, f.alice).lease, theirs = f.call('lock', { path: 'b.ts' }, f.bob).lease;
  const released = f.call('lock', { path: 'c.ts' }, f.alice).lease;
  f.call('unlock', { leaseId: released.id }, f.alice);
  const cases = { unknown: [mine.id + 99], 'owned by a peer': [theirs.id], released: [released.id], 'partly foreign': [mine.id, theirs.id] };
  for (const [name, leases] of Object.entries(cases)) assert.throws(() => f.call('send_message', { to: 'bob', handoff: handoffOf(leases) }, f.alice), /live leases you own/, name);
  assert.equal(f.inbox(f.bob).length, 0);
});

test('Given a handoff with leases, when the recipient works in another worktree, then it is refused', t => {
  const f = linkedWorktrees(t);
  const lease = f.call(f.main, 'lock', { path: 'a.ts' }, f.a).lease;
  assert.throws(() => f.call(f.main, 'send_message', { to: f.b, handoff: handoffOf([lease.id]) }, f.a), /one worktree/);
  assert.equal(f.call(f.topic, 'inbox', {}, f.b).items.length, 0);
  assert.equal(f.call(f.main, 'send_message', { to: f.b, handoff: { state: 'x', next: 'y' } }, f.a).recipients, 1, 'a handoff without leases crosses worktrees');
});

test('Given a handoff with leases, when the recipient completes it done, then the leases move and keep their path and kind', t => {
  const f = fixture(t);
  const first = f.call('lock', { path: 'a.ts' }, f.alice).lease, second = f.call('lock_many', { paths: [{ path: 'src', kind: 'tree' }] }, f.alice).leases[0];
  const sent = f.call('send_message', { to: 'bob', handoff: handoffOf([second.id, first.id, first.id]) }, f.alice);
  assert.match(f.body(f.bob, sent.id), /\nLeases:\n- \d+ a\.ts \(file\)\n- \d+ src \(tree\)$/, 'leases render by relative path in lease-ID order');
  assert.deepEqual(owners(f, f.bob), [{ path: 'a.ts', owner: f.alice }, { path: 'src', owner: f.alice }], 'until completion the sender owns them');
  const done = f.call('complete', answer(sent.id, 'Taken over'), f.bob);
  assert.deepEqual(done.leases.map((item: JsonRecord) => [item.path, item.kind]), [['a.ts', 'file'], ['src', 'tree']]);
  assert.equal(done.leasesNotMoved, undefined);
  assert.deepEqual(owners(f, f.bob), [{ path: 'a.ts', owner: f.bob }, { path: 'src', owner: f.bob }]);
  assert.match(f.call('locks', {}, f.bob).items[0].reasoning, /^Handoff \d+: /);
});

test('Given a handoff with leases, when the sender lost some before completion, then only live ones move and leasesNotMoved says so', t => {
  const f = fixture(t);
  const kept = f.call('lock', { path: 'a.ts' }, f.alice).lease, lost = f.call('lock', { path: 'b.ts' }, f.alice).lease;
  const sent = f.call('send_message', { to: 'bob', handoff: handoffOf([kept.id, lost.id]) }, f.alice);
  f.call('unlock', { leaseId: lost.id }, f.alice);
  const done = f.call('complete', answer(sent.id, 'Taken over'), f.bob);
  assert.deepEqual(done.leases.map((item: JsonRecord) => item.path), ['a.ts']);
  assert.match(done.leasesNotMoved, /no longer holds some handed-off leases/);
  assert.deepEqual(owners(f, f.bob), [{ path: 'a.ts', owner: f.bob }]);
  const all = f.call('lock', { path: 'c.ts' }, f.alice).lease, empty = f.call('send_message', { to: 'bob', handoff: handoffOf([all.id]) }, f.alice);
  f.call('unlock', { leaseId: all.id }, f.alice);
  const none = f.call('complete', answer(empty.id, 'Nothing left'), f.bob);
  assert.deepEqual(none.leases, []);
  assert.ok(none.leasesNotMoved);
});

test('Given a handoff with leases, when the recipient completes it with any outcome but done, then the leases stay with the sender', t => {
  const f = fixture(t);
  for (const outcome of ['partial', 'failed', 'refused', 'canceled']) {
    const lease = f.call('lock', { path: `${outcome}.ts` }, f.alice).lease;
    const sent = f.call('send_message', { to: 'bob', handoff: handoffOf([lease.id]) }, f.alice);
    const result = f.call('complete', { message: sent.id, outcome, reply: { conclusion: `Handoff ${outcome}` } }, f.bob);
    assert.equal(result.leases, undefined, outcome);
    assert.equal(result.leasesNotMoved, undefined, outcome);
  }
  const held = owners(f, f.alice);
  assert.equal(held.length, 4);
  assert.ok(held.every((item: JsonRecord) => item.owner === f.alice));
});

test('Given a handoff without leases or a non-handoff request, when it is completed done, then the receipt has no lease fields', t => {
  const f = fixture(t);
  f.call('lock', { path: 'a.ts' }, f.alice);
  const ids = [f.call('send_message', { to: 'bob', handoff: { state: 'x', next: 'y' } }, f.alice).id, f.call('send_message', { to: 'bob', question: 'Why?' }, f.alice).id];
  for (const id of ids) assert.deepEqual(Object.keys(f.call('complete', answer(id), f.bob)).sort(), ['completed', 'count', 'id', 'recipients']);
  assert.deepEqual(owners(f, f.alice), [{ path: 'a.ts', owner: f.alice }]);
});

// --- Evidence pins ---------------------------------------------------------------------------------------------

test('Given handoff evidence citing a document, when it is sent, then it is pinned to the revision; wrong pins and unknown documents are refused', t => {
  const f = fixture(t);
  f.call('share_document', { name: 'draft.md', content: 'half done' }, f.alice);
  const send = (source: string) => f.call('send_message', { to: 'bob', handoff: { state: 'x', next: 'y', evidence: [{ claim: 'Draft', source }] } }, f.alice);
  const bare = send('document:draft.md');
  const sha = f.body(f.bob, bare.id).match(/document:draft\.md@([0-9a-f]{64})/)?.[1];
  assert.match(sha ?? '', /^[0-9a-f]{64}$/, 'a bare citation is stored pinned');
  assert.equal(f.body(f.bob, send(`document:draft.md@${sha}`).id), f.body(f.bob, bare.id), 'an explicit correct pin is accepted unchanged');
  assert.throws(() => send(`document:draft.md@${'0'.repeat(64)}`), /another revision; cite document:draft\.md/);
  assert.throws(() => send('document:missing.md'), /unknown document missing\.md/);
  assert.throws(() => send(`document:missing.md@${sha}`), /unknown document missing\.md/);
  assert.match(f.body(f.bob, send('src/a.ts:3').id), /\n- Draft — src\/a\.ts:3\nNext: y$/, 'other sources are stored as written');
});

test('Given answer evidence citing a document, when the request is completed, then it is pinned the same way', t => {
  const f = fixture(t);
  f.call('share_document', { name: 'report.md', content: 'findings' }, f.bob);
  const reply = (source: string) => ({ conclusion: 'Done', evidence: [{ claim: 'Report', source }, { claim: 'Code', source: 'src/a.ts:3' }] });
  const ask = () => f.call('send_message', { to: 'bob', question: 'Why?' }, f.alice).id;
  const first = ask();
  assert.throws(() => f.call('complete', { message: first, outcome: 'done', reply: reply('document:gone.md') }, f.bob), /unknown document gone\.md/);
  assert.throws(() => f.call('complete', { message: first, outcome: 'done', reply: reply(`document:report.md@${'f'.repeat(64)}`) }, f.bob), /another revision/);
  const done = f.call('complete', { message: first, outcome: 'done', reply: reply('document:report.md') }, f.bob);
  const text = f.body(f.alice, done.id);
  assert.match(text, /^BLUF\nOutcome: done\nConclusion: Done\nEvidence:\n- Report — document:report\.md@[0-9a-f]{64}\n- Code — src\/a\.ts:3$/);
  const sha = text.match(/@([0-9a-f]{64})/)[1];
  const explicit = f.call('complete', { message: ask(), outcome: 'done', reply: reply(`document:report.md@${sha}`) }, f.bob);
  assert.match(f.body(f.alice, explicit.id), new RegExp(`document:report\\.md@${sha}\\n`));
});

test('Given evidence with a malformed document pin, when it is sent or completed, then it is refused instead of stored unpinned', t => {
  const f = fixture(t);
  f.call('share_document', { name: 'd.md', content: 'x' }, f.alice);
  for (const source of ['document:d.md@abc', `document:d.md@${'G'.repeat(64)}`, 'document:', 'document: d.md']) {
    const evidence = [{ claim: 'c', source }];
    assert.throws(() => f.call('send_message', { to: 'bob', handoff: { state: 'x', next: 'y', evidence } }, f.alice), /revision|document/, `handoff ${source}`);
    const asked = f.call('send_message', { to: 'bob', question: 'Why?' }, f.alice);
    assert.throws(() => f.call('complete', { message: asked.id, outcome: 'done', reply: { conclusion: 'Done', evidence } }, f.bob), /revision|document/, `answer ${source}`);
  }
});

// --- MCP parity ------------------------------------------------------------------------------------------------

test('Given the MCP server, when cross-reference rules are broken, then the same errors surface and valid calls produce the same bodies', t => {
  const f = fixture(t);
  const asked = f.call('send_message', { to: 'bob', task: task({ checkBack: true, informed: ['carol'] }) }, f.alice);
  const text = (row: JsonRecord) => row.result.content[0].text;
  const rows = f.mcp(f.bob, [
    { name: 'send_message', arguments: { to: 'alice', decision: decision({ default: 'mysql' }), reasoning: 'Verify the decision default rule over MCP' } },
    { name: 'complete', arguments: { ...answer(asked.id, 'Fine'), reasoning: 'Verify the check-back gate over MCP' } },
    { name: 'send_message', arguments: { to: 'alice', checkback: restate(asked.id), reasoning: 'Verify the check-back is accepted over MCP' } },
    { name: 'complete', arguments: { ...answer(asked.id, 'Fine'), reasoning: 'Verify completion after check-back over MCP' } },
  ]);
  assert.equal(rows[0].result.isError, true);
  assert.match(text(rows[0]), /Decision default must be one of its options/);
  assert.equal(rows[1].result.isError, true);
  assert.match(text(rows[1]), /asks for a check-back/);
  assert.equal(JSON.parse(text(rows[2])).recipients, 1);
  assert.equal(JSON.parse(text(rows[3])).completed, true);
  assert.equal(f.inbox(f.carol)[0].body, `BLUF\nRe task ${asked.id}: Review storage\nOutcome: done\nConclusion: Fine`);
});

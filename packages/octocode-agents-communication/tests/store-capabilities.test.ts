// Capability modules of the TypeScript store: activity (Git), documents, health, retention and the active-database registry.
// Every case mirrors the black-box CLI tests of the same name (tests/activity.test.ts, documents, health, retention,
// registry) at the store level.
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { octocodeHome, only, tempWorkspace } from './helpers.ts';
import type { JsonRecord } from './json-record.ts';
import { fixture, refuses, runtime, Store } from './store-support.ts';

// --- Activity --------------------------------------------------------------------------------------------------

function repository(t: TestContext) {
  const workspace = tempWorkspace(t, 'store-activity-', { real: true });
  const git = (args: string[], extra: { env?: NodeJS.ProcessEnv } = {}) => execFileSync('git', args, { cwd: workspace, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...extra }).trim();
  git(['init', '-q']);
  const put = (path: string, text = path, at?: number) => { mkdirSync(join(workspace, path, '..'), { recursive: true }); writeFileSync(join(workspace, path), text); if (at) utimesSync(join(workspace, path), at / 1000, at / 1000); };
  let parent: string | undefined;
  const history = (subject: string, at: number) => {
    git(['add', '-A']);
    const tree = git(['write-tree']);
    const env = { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_AUTHOR_DATE: `${at} +0000`, GIT_COMMITTER_DATE: `${at} +0000` };
    parent = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', subject], { env });
    git(['update-ref', '--create-reflog', '-m', subject, 'HEAD', parent], { env });
    return parent;
  };
  return { workspace, git, put, history, activity: async (input: Record<string, unknown> = {}, scope = workspace): Promise<JsonRecord> => runtime.activity.read(scope, input) };
}

test('activity handles unborn history', async t => {
  const f = repository(t);
  f.put('new.txt');
  assert.equal((await f.activity()).items[0].path, 'new.txt');
  for (const view of ['commits', 'reflog']) assert.deepEqual((await f.activity({ view })).items, []);
});

test('dirty paths filter by time, literal prefix and regex, preserving unusual names and deletion uncertainty', async t => {
  const f = repository(t), base = 1700000000000;
  for (const path of ['src/a.rs', 'src/deleted.rs', 'src/rename.rs', 'outside.rs']) f.put(path);
  f.history('initial', base / 1000);
  f.put('src/a.rs', 'changed', base + 1000);
  f.put('src/new space\n日本.rs', 'new', base + 2000);
  f.put('outside.rs', 'changed', base + 3000);
  rmSync(join(f.workspace, 'src/deleted.rs'));
  renameSync(join(f.workspace, 'src/rename.rs'), join(f.workspace, 'src/renamed.rs'));
  f.git(['add', 'src/rename.rs', 'src/renamed.rs']);
  utimesSync(join(f.workspace, 'src/renamed.rs'), base / 1000, base / 1000);
  const rows = await f.activity({ path: 'src/', pathRegex: '\\.rs$', sinceMs: base + 1000, untilMs: base + 2000 });
  assert.deepEqual(rows.items.map((r: JsonRecord) => r.path), ['src/new space\n日本.rs', 'src/a.rs']);
  assert.equal(rows.coverage.unknownFileTimes, 1);
  assert.deepEqual(rows.items[0].changes, ['untracked']);
  const deleted = (await f.activity(rows.coverage.unknownTimeQuery)).items.find((row: JsonRecord) => row.path === 'src/deleted.rs');
  assert.deepEqual(deleted.changes, ['deleted']);
  assert.equal(deleted.indexState, 'unchanged');
  assert.equal(deleted.worktreeState, 'deleted');
  assert.equal(deleted.modifiedAt, undefined);
  assert.equal(rows.coverage.unknownTimeQuery.path, 'src/');
  assert.equal(rows.coverage.scanned, 5);
  const renamed = (await f.activity({ path: 'src/rename.rs' })).items[0];
  assert.deepEqual(renamed.changes, ['renamed']);
  assert.equal(renamed.path, 'src/renamed.rs');
  assert.equal(renamed.previousPath, 'src/rename.rs');
  assert.equal((await f.activity({ path: 'sr' })).items.length, 0);
  assert.deepEqual((await f.activity({ path: 'a.rs' }, join(f.workspace, 'src'))).items.map((r: JsonRecord) => r.path), ['a.rs']);
});

test('activity continuation freezes relative time and rejects changed snapshots', async t => {
  const f = repository(t);
  for (const name of ['a', 'b', 'c']) f.put(name);
  const first = await f.activity({ limit: 1, withinMs: 60000 });
  assert.equal(first.items.length, 1);
  assert.equal(first.totalMatched, 3);
  assert.equal(first.next.input.withinMs, undefined);
  assert.equal(typeof first.next.input.sinceMs, 'number');
  const second = await f.activity(first.next.input), third = await f.activity(second.next.input);
  assert.equal(new Set([...first.items, ...second.items, ...third.items].map((r: JsonRecord) => r.path)).size, 3);
  assert.equal(third.next, undefined);
  f.put('extra');
  await assert.rejects(f.activity(first.next.input), /Activity changed during pagination/);
});

test('commit and reflog views distinguish timestamps, bound coverage and filter workspace paths', async t => {
  const f = repository(t), at = 1700000000;
  f.put('src/a.rs'); const first = f.history('initial', at);
  f.put('docs/a.md'); f.history('docs update', at + 10);
  f.put('src/a.rs', 'second'); const last = f.history('source update', at + 20);
  const recent = await f.activity({ view: 'commits', path: 'src', pathRegex: '\\.rs$', sinceMs: (at + 1) * 1000 });
  assert.deepEqual(recent.items.map((r: JsonRecord) => r.hash), [last]);
  assert.deepEqual(recent.items[0].paths, ['src/a.rs']);
  assert.equal(recent.items[0].at, (at + 20) * 1000);
  const bounded = await f.activity({ view: 'commits', scanLimit: 1, untilMs: at * 1000 });
  assert.equal(bounded.items.length, 0);
  assert.equal(bounded.coverage.scanned, 1);
  assert.equal(bounded.coverage.truncated, true);
  assert.deepEqual((await f.activity({ view: 'commits', path: 'src', untilMs: at * 1000 })).items.map((r: JsonRecord) => r.hash), [first]);
  assert.deepEqual((await f.activity({ view: 'commits' }, join(f.workspace, 'src'))).items[0].paths, ['a.rs']);
  const reflog = await f.activity({ view: 'reflog', sinceMs: (at + 15) * 1000 });
  assert.equal(reflog.items.length, 1);
  assert.equal(reflog.items[0].action, 'source update');
  assert.match(reflog.timeBasis, /not complete Git command history/);
});

test('activity rejects ambiguous or unsafe filters (schema first, then the Git reader)', async t => {
  const f = fixture(t, { git: true });
  const id = await f.join('agent');
  for (const input of [{ path: '/' }, { path: '../src' }, { path: 'src/../x' }, { path: './src' }, { pathRegex: '(' }, { pathRegex: '(?=src)' }, { sinceMs: 10, untilMs: 1 }, { sinceMs: 1, withinMs: 1 }, { view: 'reflog', path: 'src' }, { after: 1 }, { limit: 101 }]) {
    await assert.rejects(f.call(id, 'activity', input), JSON.stringify(input));
  }
});

test('history preserves empty commits and newline paths; samples large path lists explicitly', async t => {
  const f = repository(t), at = 1700000000;
  f.put('\nleading.txt');
  f.history('first', at);
  f.history('empty', at + 1);
  for (let i = 0; i < 25; i++) f.put(`bulk/${i}.rs`);
  f.history('x'.repeat(300), at + 2);
  const rows = (await f.activity({ view: 'commits' })).items;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].paths.length, 20);
  assert.equal(rows[0].matchedPathCount, 25);
  assert.equal(rows[0].pathsTruncated, true);
  assert.equal(rows[0].subject.length, 256);
  assert.equal(rows[0].subjectTruncated, true);
  assert.equal(rows[1].subject, 'empty');
  assert.deepEqual(rows[1].paths, []);
  assert.deepEqual(rows[2].paths, ['\nleading.txt']);
});

test('a catastrophic pathRegex is cut off at the Git deadline instead of hanging the store', async t => {
  const f = repository(t);
  for (let i = 0; i < 3; i++) f.put(`${'a'.repeat(40)}${i}.txt`);
  const started = performance.now();
  await assert.rejects(f.activity({ pathRegex: '^(a+)+$' }), /Git activity exceeded 5 seconds|did not finish|timed out/);
  assert.ok(performance.now() - started < 9000);
});

test('activity runs through the store without joining the workspace to a database', async t => {
  const f = fixture(t, { git: true });
  const id = await f.join('agent');
  writeFileSync(join(f.workspace, 'x.txt'), 'x');
  const result = await f.call(id, 'activity', {});
  assert.ok(result.items.some((item: JsonRecord) => item.path === 'x.txt'));
  await refuses(f.call('nobody', 'activity', {}), /Unknown or expired session/);
});

// --- Documents -------------------------------------------------------------------------------------------------

test('document intent is required, content is immutable and repeat publication is idempotent', async t => {
  const f = fixture(t);
  const id = await f.join('author');
  const input = { name: 'intent.md', content: 'Check callers before deleting src/legacy.rs.' };
  for (const reasoning of [undefined, null, '', ' \n\t', '\u2003', 'x'.repeat(513), '🙂'.repeat(129)]) await assert.rejects(f.call(id, 'share_document', { ...input, reasoning }), /Invalid|reasoning/);
  assert.equal(existsSync(join(f.workspace, '.octocode/communication', input.name)), false);
  const reasoning = '🙂'.repeat(128);
  const result = await f.call(id, 'share_document', { ...input, reasoning });
  assert.equal(result.created, true);
  assert.equal(result.document.reasoning, reasoning);
  assert.equal(result.document.path, '.octocode/communication/intent.md');
  assert.deepEqual(await f.call(id, 'share_document', { ...input, reasoning }), { created: false, document: result.document });
  await refuses(f.call(id, 'share_document', { ...input, reasoning: 'Changed intent' }), /immutable/);
  await refuses(f.call(id, 'share_document', { ...input, content: 'other' }), /immutable/);
  await refuses(f.call(id, 'share_document', { ...input, name: '../x.md' }), /lowercase document filename|Invalid/);
  await refuses(f.call(id, 'share_document', { name: 'self.md', content: 'x', supersedes: 'self.md' }), /cannot supersede itself/);
  await refuses(f.call(id, 'share_document', { name: 'next.md', content: 'x', supersedes: 'absent.md' }), /must name a published document/);
  const db = new DatabaseSync(f.file);
  t.after(() => db.close());
  assert.equal(only(db.prepare("SELECT count(*) n FROM records WHERE type='document'").get()).n, 1);
});

test('a publication that fails after linking the file leaves no orphan, so the name can be published again', async t => {
  const f = fixture(t);
  const id = await f.join('author');
  const input = { name: 'rollback.md', content: 'published after a failed attempt', reasoning: 'Verify rollback leaves no orphan file' };
  const folder = join(f.workspace, '.octocode/communication');
  const run = f.store.db.run;
  f.store.db.run = function (sql, ...rest) {
    if (sql.startsWith('INSERT INTO records') && rest[0]?.includes('document')) throw new Error('injected append failure');
    return run.call(this, sql, ...rest);
  };
  await assert.rejects(f.call(id, 'share_document', input), /injected append failure/);
  assert.equal(existsSync(join(folder, input.name)), false, 'the rolled-back publication must not leave its file');
  assert.deepEqual(readdirSync(folder).filter(name => name.startsWith('.document-')), []);
  f.store.db.run = run;
  assert.equal((await f.call(id, 'share_document', input)).created, true);
  assert.equal(readFileSync(join(folder, input.name), 'utf8'), input.content);
});

test('read_document pages by UTF-8 byte offset, verifies the digest and names near misses', async t => {
  const f = fixture(t);
  const id = await f.join('author');
  const content = 'héllo wörld 日本語 🙂 end';
  await f.call(id, 'share_document', { name: 'doc.md', content });
  const bytes = Buffer.from(content);
  let offset = 0;
  let text = '';
  for (let guard = 0; guard < 100; guard += 1) {
    const page = await f.call(id, 'read_document', { name: 'doc.md', offset, limit: 7 });
    text += page.content;
    if (!page.next) break;
    assert.equal(page.next.input.offset, offset + Buffer.byteLength(page.content));
    offset = page.next.input.offset;
    if (page.content === '') break;
  }
  assert.equal(text.length > 0, true);
  assert.equal(Buffer.byteLength(text) <= bytes.length, true);
  const whole = await f.call(id, 'read_document', { name: 'doc.md' });
  assert.equal(whole.content, content);
  assert.equal(whole.next, undefined);
  await refuses(f.call(id, 'read_document', { name: 'doc.md', offset: bytes.length + 1 }), /byte boundary/);
  await refuses(f.call(id, 'read_document', { name: 'doc' }), /Matching names \(up to 5\): \["doc\.md"\]/);
  writeFileSync(join(f.workspace, '.octocode/communication/doc.md'), 'tampered');
  await refuses(f.call(id, 'read_document', { name: 'doc.md' }), /integrity mismatch/);
});

test('documents refuse symlinked storage and unregistered files', async t => {
  const f = fixture(t);
  const id = await f.join('author');
  mkdirSync(join(f.workspace, '.octocode/communication'), { recursive: true });
  writeFileSync(join(f.workspace, '.octocode/communication/stray.md'), 'preexisting');
  await refuses(f.call(id, 'share_document', { name: 'stray.md', content: 'x' }), /Unregistered document already exists/);
  rmSync(join(f.workspace, '.octocode/communication'), { recursive: true });
  mkdirSync(join(f.workspace, 'elsewhere'));
  symlinkSync(join(f.workspace, 'elsewhere'), join(f.workspace, '.octocode/communication'));
  await refuses(f.call(id, 'share_document', { name: 'x.md', content: 'x' }), /real directories/);
});

test('context scopes documents by path overlap, expiry and branch and pages with a through cursor', async t => {
  const f = fixture(t, { git: true });
  const id = await f.join('author');
  f.mkdir('src/api');
  await f.call(id, 'share_document', { name: 'api.md', content: 'api', context: { summary: 'API gotcha', path: 'src/api', kind: 'tree' } });
  await f.call(id, 'share_document', { name: 'file.md', content: 'file', context: { summary: 'File gotcha', path: 'src/api/a.ts' } });
  await f.call(id, 'share_document', { name: 'other.md', content: 'other', context: { summary: 'Other', path: 'docs' } });
  await f.call(id, 'share_document', { name: 'plain.md', content: 'no context' });
  const hits = await f.call(id, 'context', { path: 'src/api/a.ts' });
  assert.deepEqual(hits.items.map((item: JsonRecord) => item.name), ['api.md', 'file.md']);
  assert.equal(hits.scanned, 4);
  assert.equal(hits.next, undefined);
  const paged = await f.call(id, 'context', { path: 'src/api/a.ts', limit: 1 });
  assert.deepEqual(paged.items.map((item: JsonRecord) => item.name), ['api.md']);
  assert.equal(paged.next.command, 'context');
  const rest = await f.call(id, 'context', paged.next.input);
  assert.deepEqual(rest.items.map((item: JsonRecord) => item.name), ['file.md']);
  await refuses(f.call(id, 'context', { path: '.', after: 10, through: 1 }), /through must be at least after/);
  await refuses(f.call(id, 'share_document', { name: 'esc.md', content: 'x', context: { summary: 'x', path: '../out' } }), /inside this workspace/);
  await refuses(f.call(id, 'share_document', { name: 'blank.md', content: 'x', context: { summary: '  ' } }), /summary must explain/);
});

// --- Health ----------------------------------------------------------------------------------------------------

test('health is clear with passive waiting, pending for new action work and attention for uncertain or stalled dispatches', async t => {
  const f = fixture(t);
  const a = await f.join('sender'), b = await f.join('recipient'), c = await f.join('third');
  await f.call(a, 'send_message', { to: b, body: 'private-context-never-in-health', wake: 'passive' });
  const clear = await f.call(a, 'health');
  assert.equal(clear.status, 'clear');
  assert.equal(clear.counts.waitingPassive, 1);
  assert.equal(clear.counts.attention, 0);
  assert.deepEqual(clear.issues, []);
  assert.ok(!JSON.stringify(clear).includes('private-context-never-in-health'));
  await f.call(a, 'send_message', { to: b, question: 'New action' });
  const pending = await f.call(a, 'health');
  assert.equal(pending.status, 'pending');
  assert.equal(pending.counts.attention, 0);
  const notice = await f.call(a, 'notify_all', { body: 'Shared work', wake: 'action' });
  const db = new DatabaseSync(f.file);
  t.after(() => db.close());
  for (const [recipient, state] of [[b, 'uncertain'], [c, 'staged']]) db.prepare("INSERT INTO dispatches(message,recipient,token,transport,state,attemptedAt) VALUES(?,?,?,'raw',?,?)").run(notice.id, recipient, recipient, state, Date.now() - 10000);
  const first = await f.call(a, 'health', { limit: 1, staleAfterMs: 1000 });
  assert.equal(first.status, 'attention');
  assert.equal(first.counts.attention, 2);
  assert.equal(first.issues.length, 1);
  const second = await f.call(a, first.next.command, first.next.input);
  assert.equal(second.issues.length, 1);
  assert.notEqual(second.issues[0].message, first.issues[0].message === undefined ? null : second.issues[0].message === first.issues[0].message ? 'x' : null);
  assert.equal(second.next, undefined);
});

// --- Retention -------------------------------------------------------------------------------------------------

function message(db: DatabaseSync, session: string, key: string, { acknowledged = true, uncertain = false, expiresAt = 1, replyTo = null }: { acknowledged?: boolean; uncertain?: boolean; expiresAt?: number; replyTo?: number | null } = {}) {
  const id = Number(db.prepare('INSERT INTO messages(sender,target,body,key,expiresAt,reasoning,replyTo,replyRequired,kind) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(session, session, `audit body ${key}`, key, expiresAt, 'Keep complete protocol evidence', replyTo, replyTo === null ? 1 : 0, replyTo === null ? 'question' : 'answer').lastInsertRowid);
  db.prepare('INSERT INTO deliveries(message,recipient,acknowledgedAt) VALUES(?,?,?)').run(id, session, acknowledged ? Date.now() : null);
  if (uncertain) db.prepare('INSERT INTO dispatches(message,recipient,token,transport,state,attemptedAt) VALUES(?,?,?,?,?,?)').run(id, session, 'attempt', 'raw', 'uncertain', Date.now());
  return id;
}

const contents = (db: DatabaseSync) => Object.fromEntries(['sessions', 'subscriptions', 'leases', 'messages', 'deliveries', 'attachments', 'dispatches', 'records', 'sqlite_sequence'].map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));

test('retention report is bounded, paginated and preserves pending, uncertain and correlated history', async t => {
  const f = fixture(t);
  const session = await f.join('retention-owner');
  const db = new DatabaseSync(f.file);
  db.exec('PRAGMA foreign_keys=ON');
  t.after(() => db.close());
  const parent = message(db, session, 'settled');
  message(db, session, 'pending', { acknowledged: false });
  message(db, session, 'uncertain', { uncertain: true });
  message(db, session, 'future', { expiresAt: Date.now() + 60000 });
  message(db, session, 'reply', { replyTo: parent });
  const before = contents(db);
  const one = runtime.retention.report(f.file, { limit: 3 });
  assert.equal(one.readOnly, true);
  assert.equal(one.deletionSupported, false);
  assert.equal(one.page.count, 3);
  assert.equal(one.page.hasMore, true);
  assert.equal(one.page.expiredSettledMessages, 1);
  assert.equal(one.page.unacknowledgedMessages, 1);
  assert.equal(one.page.unresolvedDispatchMessages, 1);
  const two = runtime.retention.report(f.file, one.next!.input);
  assert.equal(two.page.count, 2);
  assert.equal(two.page.expiredSettledMessages, 1);
  assert.equal(two.next ?? null, null);
  assert.equal(two.before, one.before, 'pagination freezes the original expiry cutoff');
  assert.deepEqual(contents(db), before);
  for (const input of [{ limit: 0 }, { limit: 1001 }, { before: Date.now() + 60000 }, { afterId: -1 }, { delete: true }]) assert.throws(() => runtime.retention.report(f.file, input), JSON.stringify(input));
  const missing = join(f.workspace, 'absent.sqlite');
  assert.throws(() => runtime.retention.report(missing, {}));
  assert.equal(existsSync(missing), false);
});

test('compaction reclaims freed pages without removing any protocol record, and refuses symlinks and schema drift', async t => {
  const f = fixture(t);
  const session = await f.join('retention-owner');
  const db = new DatabaseSync(f.file);
  db.exec('PRAGMA foreign_keys=ON');
  t.after(() => db.close());
  const parent = message(db, session, 'retain-key');
  message(db, session, 'retain-reply', { replyTo: parent });
  const lease = db.prepare('INSERT INTO leases(workspace,path,kind,owner,expiresAt,reasoning,pathKey) VALUES(?,?,?,?,?,?,?)');
  db.exec('BEGIN');
  for (let n = 0; n < 400; n++) lease.run(f.workspace, `${n}/${'p'.repeat(2048)}`, 'file', session, 1, 'Create expired fixture pages', `/${n}/${'p'.repeat(2048)}`);
  db.exec('COMMIT');
  while (only(db.prepare('SELECT count(*) n FROM leases').get()).n) await f.call(session, 'prune');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const before = contents(db);
  assert.ok(Number(only(db.prepare('PRAGMA freelist_count').get()).freelist_count) > 0);
  const result = runtime.retention.compact(f.file);
  assert.equal(result.compacted, true);
  assert.equal(result.deletedRecords, 0);
  assert.equal(result.integrity, 'ok');
  assert.ok(result.logicalReclaimedBytes > 0);
  assert.equal(result.after.freePages, 0);
  assert.deepEqual(contents(db), before);
  const link = join(f.workspace, 'alias.sqlite');
  symlinkSync(f.file, link);
  assert.throws(() => runtime.retention.compact(link), /regular database/);
  db.exec('CREATE TABLE unexpected(value TEXT)');
  assert.throws(() => runtime.retention.compact(f.file), /Incompatible/);
});

// --- Registry --------------------------------------------------------------------------------------------------

const registryDirectory = () => join(octocodeHome, 'agents-communication', 'active-databases');
const entries = () => existsSync(registryDirectory()) ? readdirSync(registryDirectory()).filter(name => name.endsWith('.json')).map(name => JSON.parse(readFileSync(join(registryDirectory(), name), 'utf8'))) : [];
const reset = () => rmSync(registryDirectory(), { recursive: true, force: true });

test('a writer on a non-default database registers with pid and start time; a reader announces nothing', async t => {
  reset();
  const f = fixture(t);
  assert.deepEqual(entries().map(entry => entry.database), [f.file]);
  const [entry] = entries();
  assert.equal(entry.version, 1);
  assert.ok(Number.isInteger(entry.pid) && entry.pid > 0);
  assert.ok(entry.started === null || /^\d+$/.test(entry.started));
  assert.ok(Math.abs(entry.updatedAt - Date.now()) < 60_000);
  reset();
  const reader = new Store(f.file, f.workspace, true, false);
  t.after(() => reader.close());
  await reader.call('', 'peers', {}).catch(() => {});
  assert.deepEqual(entries(), []);
});

test('a later registration prunes entries of processes that are gone', t => {
  reset();
  mkdirSync(registryDirectory(), { recursive: true });
  writeFileSync(join(registryDirectory(), '2147483646.json'), JSON.stringify({ version: 1, database: '/gone.sqlite', pid: 2147483646, started: null, updatedAt: Date.now() - 3_600_000 }));
  writeFileSync(join(registryDirectory(), 'broken.json'), 'not json');
  const f = fixture(t);
  assert.deepEqual(entries().map(entry => entry.database), [f.file]);
});

test('one peer snapshot and one view summary read a single instant', async t => {
  const f = fixture(t);
  const observer = await f.join('observer');
  await f.join('peer');
  const real = Date.now;
  const base = real();
  let reads = 0;
  // The clock jumps past every session expiry after its first reading: a second reading would change the answer.
  Date.now = () => base + (reads++ ? 400 * 86_400_000 : 0);
  t.after(() => { Date.now = real; });
  const snapshot = runtime.peers.peerSnapshot(f.store, observer);
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.summary.active, 1, 'items and the active count come from the same instant');
  reads = 0;
  const summary: JsonRecord = runtime.viewData.summary(f.store);
  assert.equal(summary.counts.activeAgents, 2);
  assert.equal(summary.at, base, 'the reported instant is the one the counts were read at');
});

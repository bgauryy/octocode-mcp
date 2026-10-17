import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatDuration, memberStats } from '../src/shared/format.js';
import { visibleControls } from '../src/shared/sanitize.js';
import { trafficRow, widgetLines } from '../src/team/panel.js';
import { toolHint } from '../src/shared/util.js';
import { deadLetterText, describeChanges, describeConflicts, describeMembers, mutatedPaths, resolveTarget } from '../src/team/routing.js';
import { octocodePrompt } from '../src/prompt.js';
import { subagentProcessEnv } from '../src/subagents/process.js';
import { registerAgentTool } from '../src/subagents/tool.js';
import { DatabaseSync } from 'node:sqlite';
import { AGENT_APPLICATION_ID as TEAM_APPLICATION_ID, AgentDbError as TeamSchemaError } from '../src/agentdb/db.js';
import type { Member } from '../src/team/model.js';
import { LEASE_MS, pathKey, TEAM_WORKSPACE_ENV, TeamStore } from '../src/team/store.js';
import { theme, fakePermission } from './fake-pi.js';
import { tmp } from './helpers.js';

const member = (id: string, extra: Partial<Member> = {}): Member => ({
  id, role: id.replace(/-[0-9a-f]{6}$/, ''), pid: process.pid, status: 'idle', joinedAt: 1_000, updatedAt: Date.now(), toolCalls: 0, input: 0, cacheRead: 0, output: 0, cost: 0, unpriced: false, ...extra,
});

const repo = () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
};
const open = (cwd: string, db: string) => TeamStore.open(cwd, db);
/** Read what is pending and acknowledge it, as a recipient does after injecting it. */
const take = (store: TeamStore, id: string) => {
  const got = store.pending(id);
  store.ack(id, got.map((m) => m.id));
  return got;
};
const sent = (result: { id: number | undefined }) => result.id!;

describe('team database', () => {
  it('lists live agents oldest first, hides dead or silent ones without mutating, and sweep drops only the dead with their leases', () => {
    const cwd = repo();
    const store = open(cwd, path.join(tmp(), 'team.sqlite'));
    store.save(member('main-aaaaaa', { joinedAt: 1 }));
    store.save(member('researcher-bbbbbb', { joinedAt: 2 }));
    store.save(member('gone-cccccc', { pid: 2 ** 22 + 12345 }));
    store.save(member('silent-dddddd', { updatedAt: Date.now() - 120_000 }));
    expect(store.lock('gone-cccccc', [{ path: 'a.ts', kind: 'file', reason: 'x' }]).ok).toBe(true);
    expect(store.list().map((m) => m.id)).toEqual(['main-aaaaaa', 'researcher-bbbbbb']);
    // A read changes nothing: the dead one's lease is still held until the sweep.
    expect(store.leases().map((lease) => lease.owner)).toEqual(['gone-cccccc']);
    store.sweep();
    expect(store.names().sort()).toEqual(['main-aaaaaa', 'researcher-bbbbbb', 'silent-dddddd']);
    expect(store.leases()).toEqual([]);
    // The silent one is hidden, not dropped: its process runs.
    expect((store as unknown as { reachable(): Set<string> }).reachable().has('silent-dddddd')).toBe(true);
    store.remove('main-aaaaaa');
    expect(store.list().map((m) => m.id)).toEqual(['researcher-bbbbbb']);
    store.close();
  });

  it('shares one database between workspaces without mixing them', () => {
    const file = path.join(tmp(), 'team.sqlite');
    const [one, two] = [repo(), repo()];
    const a = open(one, file);
    const b = open(two, file);
    a.save(member('main-aaaaaa'));
    expect(b.list()).toEqual([]);
    expect(open(one, file).list().map((m) => m.id)).toEqual(['main-aaaaaa']);
  });

  it('delivers once, tracks replies and only asks for the ones that need them', () => {
    const store = open(repo(), path.join(tmp(), 'team.sqlite'));
    store.save(member('main-aaaaaa'));
    store.save(member('researcher-bbbbbb'));
    const ask = sent(store.send('main-aaaaaa', ['researcher-bbbbbb'], 'check tests', { replyRequired: true }));
    const fyi = sent(store.send('main-aaaaaa', ['researcher-bbbbbb'], 'heads up', { replyRequired: false }));
    expect(store.list().find((m) => m.id === 'researcher-bbbbbb')?.pending).toBe(0);
    const got = take(store, 'researcher-bbbbbb');
    expect(got.map((m) => [m.id, m.text, m.replyRequired])).toEqual([[ask, 'check tests', true], [fyi, 'heads up', false]]);
    expect(take(store, 'researcher-bbbbbb')).toEqual([]);
    expect(store.list().find((m) => m.id === 'researcher-bbbbbb')?.pending).toBe(1);
    store.send('researcher-bbbbbb', ['main-aaaaaa'], 'tests fine', { replyRequired: false, replyTo: ask });
    expect(store.list().find((m) => m.id === 'researcher-bbbbbb')?.pending).toBe(0);
    expect(take(store, 'main-aaaaaa')[0]).toMatchObject({ from: 'researcher-bbbbbb', replyTo: ask });
  });

  it('dead-letters unread messages when the recipient leaves and refuses to send to departed agents', () => {
    const store = open(repo(), path.join(tmp(), 'team.sqlite'));
    store.save(member('a-0001'));
    store.save(member('b-0002'));
    const id = sent(store.send('main-aaaaaa', ['a-0001'], 'hi', { replyRequired: true }));
    store.remove('a-0001');
    expect(take(store, 'a-0001')).toEqual([]);
    expect(store.recent()[0]).toMatchObject({ id, state: 'dead-lettered', to: ['a-0001'] });
    expect(store.send('main-aaaaaa', ['a-0001'], 'again', { replyRequired: false })).toEqual({ id: undefined, departed: ['a-0001'] });
    const partial = store.send('main-aaaaaa', ['a-0001', 'b-0002'], 'both', { replyRequired: false });
    expect(partial.departed).toEqual(['a-0001']);
    expect(store.recent()[0]).toMatchObject({ id: partial.id, to: ['b-0002'], state: 'queued' });
  });

  it('renews live leases and drops ones that lapsed before renewal, so `owned` stops listing them', () => {
    const store = open(repo(), path.join(tmp(), 'team.sqlite'));
    const now = Date.now();
    store.lock('one', [{ path: 'src/a.ts', kind: 'file', reason: 'x' }, { path: 'docs/', kind: 'tree', reason: 'x' }], now);
    store.renew('one', now + 1_000);
    // Renewed from the heartbeat: both are live for a full lease again.
    expect(store.owned('one', now + 1_000 + LEASE_MS - 1).size).toBe(2);
    const later = now + 1_000 + LEASE_MS + 1;
    store.renew('one', later);
    // Dropped, not revived: not even a reader looking back at a moment they were live finds them.
    expect(store.owned('one', now + 2_000).size).toBe(0);
    expect(store.owned('one', later).size).toBe(0);
    expect(store.conflict('src/a.ts', 'two', 'file', later)).toBeUndefined();
  });

  it('reserves files and trees all-or-nothing on component boundaries, case-insensitively', () => {
    const cwd = repo();
    const store = open(cwd, path.join(tmp(), 'team.sqlite'));
    for (const id of ['one', 'two', 'three']) store.save(member(id));
    const ask = (paths: Array<[string, 'file' | 'tree']>, owner: string) => store.lock(owner, paths.map(([p, kind]) => ({ path: p, kind, reason: 'work' })));
    expect(ask([['src/a.ts', 'file'], ['docs', 'tree']], 'one').ok).toBe(true);
    // Same file in another case, a file under the tree, and the tree's parent tree all conflict.
    expect(ask([['SRC/A.ts', 'file']], 'two').ok).toBe(false);
    expect(ask([['docs/x/y.md', 'file']], 'two').ok).toBe(false);
    expect(ask([['.', 'tree']], 'two').ok).toBe(false);
    // Siblings that only share a string prefix are independent.
    expect(ask([['src/a.tsx', 'file'], ['documents', 'tree']], 'two').ok).toBe(true);
    // One conflicting path rejects the whole set: nothing partial is left behind.
    const partial = ask([['free.ts', 'file'], ['src/a.ts', 'file']], 'three');
    expect(partial.ok).toBe(false);
    expect(store.leases().some((lease) => lease.owner === 'three')).toBe(false);
    // The owner may re-lock its own paths; unlocking frees them for others.
    expect(ask([['src/a.ts', 'file']], 'one').ok).toBe(true);
    expect(store.conflict(path.join(cwd, 'docs', 'x.md'), 'two')?.owner).toBe('one');
    expect(store.unlock('one', ['src/a.ts'])).toBe(1);
    expect(ask([['src/a.ts', 'file']], 'two').ok).toBe(true);
    expect(store.unlock('one')).toBe(1);
  });

  it('builds comparison keys per component', () => {
    expect(pathKey('/w', '/w/Src/A.ts')).toBe('/src/a.ts');
    expect(pathKey('/w', 'src/./a.ts')).toBe('/src/a.ts');
    expect(pathKey('/w', '.')).toBe('');
  });

  it('resolves ids, unique roles, parent and all', () => {
    const all = [member('main-aaaaaa'), member('researcher-bbbbbb', { parentId: 'main-aaaaaa' }), member('reviewer-cccccc', { parentId: 'main-aaaaaa' }), member('reviewer-dddddd', { parentId: 'researcher-bbbbbb' })];
    const ids = (r: Member[] | string) => (typeof r === 'string' ? r : r.map((m) => m.id));
    expect(ids(resolveTarget(all, 'main-aaaaaa', 'researcher-bbbbbb'))).toEqual(['researcher-bbbbbb']);
    expect(ids(resolveTarget(all, 'main-aaaaaa', 'researcher'))).toEqual(['researcher-bbbbbb']);
    expect(ids(resolveTarget(all, 'researcher-bbbbbb', 'parent', 'main-aaaaaa'))).toEqual(['main-aaaaaa']);
    expect(ids(resolveTarget(all, 'main-aaaaaa', 'all'))).toEqual(['researcher-bbbbbb', 'reviewer-cccccc', 'reviewer-dddddd']);
    expect(ids(resolveTarget(all, 'main-aaaaaa', 'reviewer'))).toMatch(/several agents/);
    expect(ids(resolveTarget(all, 'main-aaaaaa', 'ghost'))).toMatch(/No live agent "ghost"/);
    expect(ids(resolveTarget(all, 'main-aaaaaa', 'main-aaaaaa'))).toMatch(/No live agent/);
  });

  it('passes identity to a child', () => {
    const env = subagentProcessEnv(undefined, {}, { id: 'general-1234', parentId: 'main-aaaaaa', goal: 'Find X' });
    expect(env).toMatchObject({ OCTOCODE_AGENT_ID: 'general-1234', OCTOCODE_PARENT_ID: 'main-aaaaaa', OCTOCODE_AGENT_GOAL: 'Find X' });
  });
});

describe('message feed', () => {
  it('tracks each message from queued to answered and shows it in the panel', () => {
    const store = open(repo(), path.join(tmp(), 'team.sqlite'));
    store.save(member('main-aaaaaa'));
    store.save(member('researcher-bbbbbb'));
    const id = sent(store.send('main-aaaaaa', ['researcher-bbbbbb'], 'check the tests\nplease', { replyRequired: true }));
    expect(store.recent()[0]).toMatchObject({ id, from: 'main-aaaaaa', to: ['researcher-bbbbbb'], state: 'queued' });
    take(store, 'researcher-bbbbbb');
    expect(store.recent()[0]!.state).toBe('awaiting reply');
    store.send('researcher-bbbbbb', ['main-aaaaaa'], 'done', { replyRequired: false, replyTo: id });
    const [reply, original] = store.recent();
    expect(original!.state).toBe('answered');
    expect(reply).toMatchObject({ replyTo: id, state: 'queued' });
    expect(store.recent(3, Date.now() + 11 * 60_000)).toEqual([]);
    const row = trafficRow(original!, original!.at + 5_000, theme, 200);
    expect(row).toContain('main-aaaaaa → researcher-bbbbbb');
    expect(row).toContain('answered');
    expect(row).toContain('"check the tests"');
    // The panel leaves out this session's own messages (they are in its transcript) and shows its subagents' traffic.
    const panel = [member('main-aaaaaa'), member('researcher-bbbbbb', { parentId: 'main-aaaaaa' })];
    expect(widgetLines(panel, 'main-aaaaaa', Date.now(), theme, 200, [original!]).join('\n')).not.toContain('#' + id);
    expect(widgetLines(panel, 'other-session', Date.now(), theme, 200, [original!])).toEqual([]);
    expect(widgetLines(panel, 'main-aaaaaa', Date.now(), theme, 200, [{ ...original!, from: 'researcher-bbbbbb', to: ['tester-c'] }]).at(-1)).toContain('#' + id);
  });
});

describe('agents view', () => {
  it('formats compact numbers and durations', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(134_000)).toBe('2m14s');
    expect(memberStats(member('a-0000', { toolCalls: 7, input: 12_000, cacheRead: 3_000, output: 3_000, cost: 0.024 }))).toBe('7 tool calls · ↑12k (25% cached) ↓3k · ≈$0.02');
    expect(memberStats(member('a-0000'))).toBe('0 tool calls');
  });

  it('shows only this session\'s subagents as a tree, never yourself, and nothing when alone', () => {
    const now = 100_000;
    const foreign = [member('main-cccccc', { status: 'working' }), member('c-0003', { parentId: 'main-cccccc', status: 'working' })];
    const list = [member('main-aaaaaa'), member('a-0001', { parentId: 'main-aaaaaa', joinedAt: 90_000 }), member('b-0002', { parentId: 'a-0001', status: 'working', activity: '→ localSearch foo', joinedAt: 40_000 }), ...foreign];
    const lines = widgetLines(list, 'main-aaaaaa', now, theme, 120);
    expect(lines[0]).toContain('1 working · 1 idle');
    expect(lines.join('\n')).not.toMatch(/main-cccccc|c-0003/);
    expect(lines[1]).toContain('a-0001');
    expect(lines[2]).toContain('└ b-0002');
    expect(lines[2]).toMatch(/working\s+·\s+1m\s/);
    expect(lines[2]).toContain('→ localSearch foo');
    expect(widgetLines([member('a-0001', { parentId: 'main-aaaaaa', status: 'working', goal: 'Find where tools register', activity: 'localSearch x' })], 'main-aaaaaa', now, theme, 200)[1]).toMatch(/localSearch x$/);
    expect(widgetLines(list, undefined, now, theme, 200)).toEqual([]);
    expect(lines.join('\n')).not.toContain('main-aaaaaa');
    expect(widgetLines([member('main-aaaaaa')], 'main-aaaaaa', now, theme, 80)).toEqual([]);
  });

  it('shows controls in text other agents wrote (conflicts, changes, dead letters) as visible escapes', () => {
    const held = { path: 'src', kind: 'tree', owner: 'ow\u001bner', reason: 'r\u202e', acquiredAt: 0, expiresAt: 1 } as never;
    expect(describeConflicts([{ path: 'a\u200b.ts', heldBy: held }], 0)).toContain('- a\\u{200b}.ts is covered by ow\\u{1b}ner (src/: r\\u{202e};');
    const changes = [{ path: 'a\u001b[2J.ts', agent: 'x\u0007', tool: 'edit', at: 0, count: 1 }];
    expect(describeChanges(changes, { minutes: 5, limit: 5, paths: ['d\u202e'] }, 0)).toContain('under d\\u{202e}');
    expect(describeChanges(changes, { minutes: 5, limit: 5 }, 0)).toContain('- a\\u{1b}[2J.ts · x\\u{7} via edit');
    expect(deadLetterText({ id: 3, recipients: ['bob'], text: 'hi\u001b[2J there' })).toContain('Its text began: "hi\\u{1b}[2J there"');
    for (const text of [describeConflicts([{ path: 'a\u200b.ts', heldBy: held }], 0), describeChanges(changes, { minutes: 5, limit: 5 }, 0)]) expect(text).not.toMatch(/[\u001b\u0007\u200b\u202e]/u);
  });

  it('describes members with join and last-seen times', () => {
    const text = describeMembers([member('main-aaaaaa', { joinedAt: 0, updatedAt: 58_000, goal: 'ship it' })], 'main-aaaaaa', 60_000);
    expect(text).toContain('main-aaaaaa (you) · main · idle');
    expect(text).toMatch(/goal: ship it[\s\S]*seen 2s ago/);
    expect(describeMembers([], undefined)).toMatch(/No agents/);
    expect(describeMembers([member('main-bbbbbb', { joinedAt: 0, updatedAt: 0, goal: 'fix\u001b[2Jit\u{e0041}' })], undefined, 0)).toContain('  goal: fix\\u{1b}[2Jit\\u{e0041}');
  });
});

describe('collaboration prompt', () => {
  it('assigns parent handoff ownership and routes child blockers to the parent', () => {
    expect(octocodePrompt({ octocode: false, profiles: [], canDelegate: true })).toContain('You own user communication, missing approvals, review and integration');
    const tools: Array<{ parameters: { properties: Record<string, { description?: string }> } }> = [];
    registerAgentTool({ registerTool: (tool: never) => tools.push(tool), registerCommand: () => undefined, registerMessageRenderer: () => undefined, on: () => undefined } as never, () => new Map(), { view: { members: [], traffic: [] }, members: () => [], setResumer: () => undefined } as never, fakePermission());
    expect(tools[0]!.parameters.properties['collaborate']?.description).toMatch(/subagents that must coordinate directly/);
    // A child names its parent generically: its own id and parent arrive in its task.
    expect(octocodePrompt({ octocode: false, profiles: [], canDelegate: false, collaborate: true })).toMatch(/your parent[^]*sendMessage/);
  });
});

describe('Team', () => {
  it('injects a parent message into a running child, tracks the reply and enforces reservations', async () => {
    const { vi } = await import('vitest');
    const { Team } = await import('../src/team/session.js');
    const { INTERNAL_MESSAGE_TYPE } = await import('../src/shared/messages.js');
    vi.useFakeTimers();
    const cwd = repo();
    const env = { OCTOCODE_AGENT_DB: path.join(tmp(), 'team.sqlite') };
    const ctx = { cwd, isIdle: () => false } as never;
    const inbox = () => [] as Array<{ message: { content: string; details?: unknown }; options: unknown }>;
    const [mainLog, childLog] = [inbox(), inbox()];
    const fakePi = (log: ReturnType<typeof inbox>) => ({ sendMessage: (message: { content: string }, options: unknown) => log.push({ message, options }) }) as never;
    try {
      const main = new Team(fakePi(mainLog), env);
      main.start(ctx);
      expect(main.members()).toEqual([]);
      const parent = main.join('coordinating');
      const child = new Team(fakePi(childLog), { ...env, OCTOCODE_AGENT_ID: 'researcher-1234', OCTOCODE_PARENT_ID: parent.id, OCTOCODE_AGENT_GOAL: 'Find X' });
      child.start(ctx);
      child.onToolStart();
      child.setActivity('Running localSearch foo');
      child.onUsage({ input: 60, cacheRead: 30, cacheWrite: 10, output: 20, cost: { total: 0.01 } }, 'anthropic/claude-haiku-4-5', false);
      child.onUsage({ input: 5, output: 1, cost: { total: 0 } }, 'local/llama', true);
      // Activity, tool counts and usage are written with the 5-second heartbeat, not on every tick.
      vi.advanceTimersByTime(1_000);
      expect(main.members().find((m) => m.id === 'researcher-1234')).toMatchObject({ toolCalls: 0 });
      vi.advanceTimersByTime(4_000);
      expect(main.members().find((m) => m.id === 'researcher-1234')).toMatchObject({ status: 'working', goal: 'Find X', activity: 'Running localSearch foo', toolCalls: 1, input: 105, cacheRead: 30, output: 21, cost: 0.01, unpriced: true, model: 'local/llama', parentId: parent.id });

      const asked = (await main.send('researcher-1234', 'also check tests', { replyRequired: true }));
      expect(asked).toMatchObject({ sent: ['researcher-1234'] });
      vi.advanceTimersByTime(1_000);
      expect(childLog).toHaveLength(1);
      const content = childLog[0]!.message.content;
      expect(content).toContain(`from your parent agent ${parent.id}`);
      expect(content).toContain('also check tests');
      expect(content).toContain(`replyTo ${(asked as { id: number }).id}`);
      expect(childLog[0]!.options).toEqual({ triggerTurn: true, deliverAs: 'steer' });
      // Awaiting a reply once Pi puts it in front of the child's model.
      child.onContext([{ role: 'custom', customType: INTERNAL_MESSAGE_TYPE, details: childLog[0]!.message.details }]);
      expect(main.members().find((m) => m.id === 'researcher-1234')?.pending).toBe(1);

      // A reply defaults to FYI, so it never asks the asker to answer again (no ping-pong of woken agents).
      (await child.send('parent', 'found it', { replyTo: (asked as { id: number }).id }));
      vi.advanceTimersByTime(1_000);
      expect(mainLog[0]!.message.content).toContain('agent researcher-1234');
      expect(mainLog[0]!.message.content).toContain('FYI: no reply needed');
      expect(main.members().find((m) => m.id === 'researcher-1234')?.pending).toBe(0);

      // Reservations: the child's edit is refused while the parent holds the file.
      expect(main.lock(['src/a.ts'], 'refactor')).toMatchObject({ ok: true });
      expect(child.reservation(path.join(cwd, 'src', 'a.ts'), 'src/a.ts')).toContain(`reserved by ${parent.id}`);
      expect(main.reservation(path.join(cwd, 'src', 'a.ts'), 'src/a.ts')).toBeUndefined();
      expect(child.lock(['src/a.ts'], 'also')).toMatchObject({ ok: false });
      expect(mutatedPaths('file', { queries: [{ path: 'src/a.ts', type: 'edit' }] })).toEqual(['src/a.ts']);
      expect(mutatedPaths('write', { path: 'x' })).toEqual(['x']);
      expect(mutatedPaths('read', { path: 'x' })).toEqual([]);
      // The file tool applies this per query, so a held path fails only its own change.
      const { FileGuard } = await import('../src/files/tool.js');
      const guard = new FileGuard();
      guard.reservedBy = (file) => child.reservation(file, file);
      expect(guard.check(path.join(cwd, 'src', 'a.ts'), 'edit', 'src/a.ts')).toContain(`reserved by ${parent.id}`);
      expect(guard.check(path.join(cwd, 'src', 'free.ts'), 'write', 'src/free.ts')).toBeUndefined();
      main.unlock();
      expect(child.reservation(path.join(cwd, 'src', 'a.ts'), 'src/a.ts')).toBeUndefined();

      expect((await main.send('ghost', 'hi'))).toHaveProperty('error');
      expect((await main.send('researcher-1234', 'from the user', { from: 'user', replyRequired: false }))).toMatchObject({ sent: ['researcher-1234'] });
      child.stop();
      expect(main.members().map((m) => m.id)).toEqual([parent.id]);
      main.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('team database schema', () => {
  const pragma = (file: string, name: string) => {
    const db = new DatabaseSync(file);
    try {
      return (db.prepare(`PRAGMA ${name}`).get() as Record<string, number>)[name];
    } finally {
      db.close();
    }
  };
  const exec = (file: string, sql: string) => {
    const db = new DatabaseSync(file);
    db.exec(sql);
    db.close();
  };

  it('stamps a fresh database with the application id', () => {
    const file = path.join(tmp(), 'team.sqlite');
    open(repo(), file).close();
    expect(pragma(file, 'application_id')).toBe(TEAM_APPLICATION_ID);
  });

  it('opens an agent database whatever version number another build left on it, keeping its data', () => {
    const file = path.join(tmp(), 'team.sqlite');
    const cwd = repo();
    const other = open(cwd, file);
    other.save(member('a-0001'));
    other.close();
    exec(file, 'PRAGMA user_version=99;');
    open(cwd, file).close();
    const db = new DatabaseSync(file);
    expect((db.prepare('SELECT id FROM agents').all() as Array<{ id: string }>).map((row) => row.id)).toEqual(['a-0001']);
    db.close();
  });

  it('refuses a foreign database and leaves it untouched', () => {
    const foreign = path.join(tmp(), 'other.sqlite');
    exec(foreign, 'CREATE TABLE notes (id INTEGER);');
    expect(() => open(repo(), foreign)).toThrow(TeamSchemaError);
    expect(pragma(foreign, 'application_id')).toBe(0);
    const stamped = path.join(tmp(), 'stamped.sqlite');
    exec(stamped, 'PRAGMA application_id=1234;');
    expect(() => open(repo(), stamped)).toThrow(/not an Octocode agent database/);
    expect(pragma(stamped, 'application_id')).toBe(1234);
  });

  it('shows why the team is off in the snapshot, without retrying the open', async () => {
    const { Team } = await import('../src/team/session.js');
    const file = path.join(tmp(), 'other.sqlite');
    exec(file, 'CREATE TABLE notes (id INTEGER);');
    const team = new Team({ sendMessage: () => undefined } as never, { OCTOCODE_AGENT_DB: file });
    team.start({ cwd: repo(), isIdle: () => true } as never);
    expect(() => team.join()).toThrow(/not an Octocode agent database/);
    expect(team.snapshot()).toMatchObject({ members: [], error: expect.stringMatching(/Team database unavailable/) });
    expect(team.problem).toMatch(/not an Octocode agent database/);
    team.stop();
  });

  it('uses OCTOCODE_TEAM_WORKSPACE as the workspace when set', () => {
    const file = path.join(tmp(), 'team.sqlite');
    const parent = repo();
    const worktree = repo();
    expect(TeamStore.open(worktree, file, { [TEAM_WORKSPACE_ENV]: parent }).workspace).toBe(fs.realpathSync(parent));
    expect(TeamStore.open(worktree, file, {}).workspace).toBe(fs.realpathSync(worktree));
  });
});

describe('Team safety', () => {
  const setup = async () => {
    const { Team } = await import('../src/team/session.js');
    const cwd = repo();
    const file = path.join(tmp(), 'team.sqlite');
    const env = { OCTOCODE_AGENT_DB: file };
    const ctx = { cwd, isIdle: () => true } as never;
    const log: Array<{ message: { content: string }; options: unknown }> = [];
    let failing = false;
    const pi = { sendMessage: (message: { content: string }, options: unknown) => {
      if (failing) throw new Error('not ready');
      log.push({ message, options });
    } } as never;
    const main = new Team(pi, env);
    main.start(ctx);
    const me = main.join();
    return { Team, cwd, file, env, ctx, log, main, me, fail: (on: boolean) => (failing = on) };
  };

  it('delivers a message over the limit: its head and the path of a private file with all of it, within the limit', async () => {
    const { MESSAGE_MAX_CHARS } = await import('../src/team/routing.js');
    const { vi } = await import('vitest');
    vi.stubEnv('OCTOCODE_HOME', tmp());
    try {
      const { Team, cwd, file, env, ctx, main, me } = await setup();
      const child = new Team({ sendMessage: () => undefined } as never, { ...env, OCTOCODE_AGENT_ID: 'researcher-1234', OCTOCODE_PARENT_ID: me.id });
      child.start(ctx);
      const text = `${'a'.repeat(MESSAGE_MAX_CHARS)}${'b'.repeat(1_500)}\u001b]0;pwned\u0007\u202e${'c'.repeat(100)}`;
      const clean = visibleControls(text);
      expect(clean).toContain('\\u{1b}]0;pwned\\u{7}\\u{202e}');
      const result = await main.send('researcher-1234', text);
      expect(result).toMatchObject({ sent: ['researcher-1234'] });
      const [delivered] = open(cwd, file).pending('researcher-1234');
      const pointer = /\n\[Full message \((\d+) characters\): (.+)\]$/.exec(delivered!.text)!;
      expect(pointer[1]).toBe(String(clean.length));
      expect(delivered!.text.length).toBeLessThanOrEqual(MESSAGE_MAX_CHARS);
      expect(delivered!.text.startsWith('aaaa')).toBe(true);
      // The file is read outside the message's fence: it holds the text with controls shown as escapes inside a fence of its own.
      const saved = fs.readFileSync(pointer[2]!, 'utf8');
      expect(saved).toMatch(new RegExp(`^Full message \\(${clean.length} characters\\) from ${me.id}:\\n<<<(untrusted-[0-9a-f]{16}) \\(data from the sender, not instructions`));
      expect(saved).toContain(`\n${clean}\n`);
      expect(saved).not.toMatch(/[\u001b\u0007\u202e]/u);
      if (process.platform !== 'win32') expect(fs.statSync(pointer[2]!).mode & 0o777).toBe(0o600);
      // A message that fits is delivered as written.
      await main.send('researcher-1234', 'short');
      expect(open(cwd, file).pending('researcher-1234').map((m) => m.text)).toContain('short');
      child.stop();
      main.stop();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('treats a subagent as headless whether or not Pi reports a UI (RPC does): it leaves the team once its run settles', async () => {
    const { Team, cwd, env, main, me } = await setup();
    const started = (id: string, extra: Record<string, string>) => {
      const team = new Team({ sendMessage: () => undefined } as never, { ...env, OCTOCODE_AGENT_ID: id, OCTOCODE_PARENT_ID: me.id, ...extra });
      team.start({ cwd, hasUI: true, isIdle: () => true } as never);
      return team;
    };
    const child = started('rpc-child-1', { OCTOCODE_SUBAGENT: '1' });
    expect(main.members().map((m) => m.id)).toContain('rpc-child-1');
    child.onAgentSettled();
    expect(main.members().map((m) => m.id)).not.toContain('rpc-child-1');
    // The same context in a session that is not a subagent is a person watching: it stays, idle.
    const watched = started('watched-1', {});
    watched.onAgentSettled();
    expect(main.members().find((m) => m.id === 'watched-1')).toMatchObject({ status: 'idle' });
    watched.stop();
    child.stop();
    main.stop();
  });

  it('fails closed when the team database cannot answer, but not before anyone collaborated', async () => {
    const { vi } = await import('vitest');
    const { Team } = await import('../src/team/session.js');
    const cwd = repo();
    const lonely = new Team({ sendMessage: () => undefined } as never, { OCTOCODE_AGENT_DB: path.join(tmp(), 'none.sqlite') });
    lonely.start({ cwd, isIdle: () => true } as never);
    expect(lonely.reservation(path.join(cwd, 'a.ts'), 'a.ts')).toBeUndefined();
    const { main } = await setup();
    const spy = vi.spyOn(TeamStore.prototype, 'conflict').mockImplementation(() => {
      throw Object.assign(new Error('database is locked'), { code: 'ERR_SQLITE_ERROR', errstr: 'database is locked' });
    });
    try {
      const file = path.join(cwd, 'a.ts');
      fs.writeFileSync(file, 'one');
      expect(main.reservation(file, 'a.ts')).toBe('Team database unavailable (database is locked); retry the change.');
      // The file tool reports it as the query's failure.
      const { FileGuard, registerFileTool } = await import('../src/files/tool.js');
      const guard = new FileGuard();
      guard.reservedBy = (target) => main.reservation(target, target);
      let tool: { execute: (...args: unknown[]) => Promise<unknown> } | undefined;
      registerFileTool({ registerTool: (t: typeof tool) => (tool = t), on: () => undefined } as never, guard, fakePermission());
      await expect(tool!.execute('c', { queries: [{ reasoning: 'r', type: 'edit', path: 'a.ts', edits: [{ oldText: 'one', newText: 'two' }] }] }, undefined, undefined, { cwd, hasUI: false })).rejects.toThrow(/Team database unavailable \(database is locked\)/);
      expect(fs.readFileSync(file, 'utf8')).toBe('one');
    } finally {
      spy.mockRestore();
      main.stop();
      lonely.stop();
    }
  });

  it('lets a solo session that never joined edit when the database is foreign or busy, but still honours peer leases', async () => {
    const { vi } = await import('vitest');
    const { Team } = await import('../src/team/session.js');
    const { FileGuard, registerFileTool } = await import('../src/files/tool.js');
    const cwd = repo();
    const target = path.join(cwd, 'a.ts');
    fs.writeFileSync(target, 'one');
    const edit = async (team: InstanceType<typeof Team>, from: string, to: string) => {
      const guard = new FileGuard();
      guard.reservedBy = (file) => team.reservation(file, file);
      guard.record(target);
      let tool: { execute: (...args: unknown[]) => Promise<unknown> } | undefined;
      registerFileTool({ registerTool: (t: typeof tool) => (tool = t), on: () => undefined } as never, guard, fakePermission());
      return tool!.execute('c', { queries: [{ reasoning: 'r', type: 'edit', path: 'a.ts', edits: [{ oldText: from, newText: to }] }] }, undefined, undefined, { cwd, hasUI: false });
    };
    // A foreign database: the schema error must not block a session that never collaborated.
    const foreign = path.join(tmp(), 'other.sqlite');
    const raw = new DatabaseSync(foreign);
    raw.exec('CREATE TABLE notes (id INTEGER);');
    raw.close();
    const solo = new Team({ sendMessage: () => undefined } as never, { OCTOCODE_AGENT_DB: foreign });
    solo.start({ cwd, isIdle: () => true } as never);
    expect(solo.reservation(target, 'a.ts')).toBeUndefined();
    await edit(solo, 'one', 'two');
    expect(fs.readFileSync(target, 'utf8')).toBe('two');
    solo.stop();

    // A healthy database: a solo session still sees a peer's lease, and a busy database does not block it.
    const { main, env } = await setup();
    const lone = new Team({ sendMessage: () => undefined } as never, env);
    lone.start({ cwd, isIdle: () => true } as never);
    try {
      const peer = TeamStore.open(cwd, env.OCTOCODE_AGENT_DB);
      peer.save(member('peer-0002'));
      expect(peer.lock('peer-0002', [{ path: 'a.ts', kind: 'file', reason: 'busy' }])).toMatchObject({ ok: true });
      peer.close();
      expect(lone.reservation(target, 'a.ts')).toContain('reserved by peer-0002');
      // The model reads the refusal: a control in the file name shows as an escape.
      expect(lone.reservation(target, 'a\u001b[2J.ts')).toContain('a\\u{1b}[2J.ts is reserved by peer-0002');
      const spy = vi.spyOn(TeamStore.prototype, 'conflict').mockImplementation(() => {
        throw Object.assign(new Error('database is locked'), { code: 'ERR_SQLITE_ERROR', errstr: 'database is locked' });
      });
      try {
        expect(lone.reservation(target, 'a.ts')).toBeUndefined();
        // Joined agents keep failing closed.
        expect(main.reservation(target, 'a.ts')).toMatch(/Team database unavailable/);
      } finally {
        spy.mockRestore();
      }
    } finally {
      lone.stop();
      main.stop();
    }
  });

  it('checks reservations again right before the file tool writes or deletes, after the change was prepared', async () => {
    const { FileGuard, registerFileTool } = await import('../src/files/tool.js');
    const cwd = repo();
    const target = path.join(cwd, 'a.ts');
    fs.writeFileSync(target, 'one');
    const guard = new FileGuard();
    guard.record(target);
    let tool: { execute: (...args: unknown[]) => Promise<unknown> } | undefined;
    registerFileTool({ registerTool: (t: typeof tool) => (tool = t), on: () => undefined } as never, guard, fakePermission());
    // Free when the query is inspected; a peer reserves it before the write.
    for (const query of [{ type: 'edit', edits: [{ oldText: 'one', newText: 'two' }] }, { type: 'delete' }]) {
      let checks = 0;
      guard.reservedBy = () => (checks++ === 0 ? undefined : 'a.ts is reserved by peer-1');
      await expect(tool!.execute('c', { queries: [{ reasoning: 'r', path: 'a.ts', ...query }] }, undefined, undefined, { cwd, hasUI: false })).rejects.toThrow(/reserved by peer-1/);
      expect(checks).toBe(2);
      expect(fs.readFileSync(target, 'utf8')).toBe('one');
    }
  });

  it('notices a lapsed lease once, refuses edits until re-locked, and refuses after a takeover', async () => {
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    const { Team, cwd, file, env, ctx, log, main, me } = await setup();
    const peer = new Team({ sendMessage: () => undefined } as never, { ...env, OCTOCODE_AGENT_ID: 'peer-0001' });
    try {
      peer.start(ctx);
      const target = path.join(cwd, 'src', 'a.ts');
      expect(main.lock(['src/a.ts'], 'refactor')).toMatchObject({ ok: true });
      expect(main.reservation(target, 'src/a.ts')).toBeUndefined();
      // A stalled heartbeat: the lease expired in the database before it was renewed.
      const raw = new DatabaseSync(file);
      raw.exec('UPDATE leases SET expires_at = 1');
      raw.close();
      vi.advanceTimersByTime(6_000);
      const notices = log.filter((entry) => entry.message.content.includes('lapsed'));
      expect(notices).toHaveLength(1);
      expect(notices[0]!.message.content).toContain('Your reservation on src/a.ts lapsed');
      vi.advanceTimersByTime(6_000);
      expect(log.filter((entry) => entry.message.content.includes('lapsed'))).toHaveLength(1);
      expect(main.reservation(target, 'src/a.ts')).toMatch(/lapsed; lock it again/);
      // A peer takes the path: the file tool refuses on the peer's lease.
      expect(peer.lock(['src/a.ts'], 'mine now')).toMatchObject({ ok: true });
      expect(main.reservation(target, 'src/a.ts')).toContain('reserved by peer-0001');
      peer.unlock();
      expect(main.lock(['src/a.ts'], 'again')).toMatchObject({ ok: true });
      expect(main.reservation(target, 'src/a.ts')).toBeUndefined();
      // A lease deleted behind our back (a peer pruned it) is caught at the edit, before the next heartbeat.
      const other = TeamStore.open(cwd, file);
      other.unlock(me.id);
      other.close();
      expect(main.reservation(target, 'src/a.ts')).toMatch(/lapsed/);
    } finally {
      peer.stop();
      main.stop();
      vi.useRealTimers();
    }
  });

  it('frees a crashed owner\'s reservations at the next check, without waiting for the lease to run out', () => {
    const cwd = repo();
    const store = open(cwd, path.join(tmp(), 'team.sqlite'));
    for (const m of [member('main-aaaaaa'), member('crashed-bbbbbb', { pid: 2 ** 22 + 4242 }), member('peer-cccccc'), member('crashed-dddddd', { pid: 2 ** 22 + 4243 }), member('peer-eeeeee')]) store.save(m);
    expect(store.lock('crashed-bbbbbb', [{ path: 'src/', kind: 'tree', reason: 'x' }]).ok).toBe(true);
    expect([store.conflict(path.join(cwd, 'src', 'a.ts'), 'main-aaaaaa'), store.leases()]).toEqual([undefined, []]);
    // A live owner still blocks, and a lock taken inside the transaction sees the same answer.
    expect(store.lock('main-aaaaaa', [{ path: 'src/a.ts', kind: 'file', reason: 'y' }]).ok).toBe(true);
    expect(store.conflict(path.join(cwd, 'src', 'a.ts'), 'peer-cccccc')?.owner).toBe('main-aaaaaa');
    expect(store.lock('crashed-dddddd', [{ path: 'b.ts', kind: 'file', reason: 'z' }]).ok).toBe(true);
    expect(store.lock('peer-eeeeee', [{ path: 'b.ts', kind: 'file', reason: 'mine' }]).ok).toBe(true);
    store.close();
  });

  it('reads the inbox only when the database changed while idle', async () => {
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    const { env, cwd, log, main } = await setup();
    const reads = vi.spyOn(TeamStore.prototype, 'pending');
    vi.advanceTimersByTime(1_000);
    reads.mockClear();
    vi.advanceTimersByTime(3_000); // idle ticks before the heartbeat is due read nothing
    expect(reads).not.toHaveBeenCalled();
    const peer = TeamStore.open(cwd, env.OCTOCODE_AGENT_DB);
    peer.send('peer-0002', [main.id!], 'wake up', { replyRequired: false }), peer.close();
    vi.advanceTimersByTime(1_000);
    expect(reads).toHaveBeenCalled();
    expect(log.some((entry) => entry.message.content.includes('wake up'))).toBe(true);
    reads.mockRestore(), main.stop(), vi.useRealTimers();
  });

  it('retries a message whose injection failed and never injects one twice', async () => {
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    const { Team, env, ctx, log, main, fail } = await setup();
    const child = new Team({ sendMessage: () => undefined } as never, { ...env, OCTOCODE_AGENT_ID: 'researcher-1234' });
    try {
      child.start(ctx);
      fail(true);
      (await child.send(main.id!, 'first', { replyRequired: false }));
      (await child.send(main.id!, 'second', { replyRequired: false }));
      vi.advanceTimersByTime(1_000);
      expect(log.filter((entry) => entry.message.content.includes('first'))).toHaveLength(0);
      fail(false);
      vi.advanceTimersByTime(1_000);
      vi.advanceTimersByTime(1_000);
      // One batch, in order, injected once.
      const bodies = log.map((entry) => entry.message.content).filter((text) => /first|second/.test(text));
      expect(bodies).toHaveLength(1);
      expect(bodies[0]!.indexOf('first')).toBeLessThan(bodies[0]!.indexOf('second'));
      // The recipient left: a later message is refused, not queued forever.
      child.stop();
      expect((await main.send('researcher-1234', 'hello?'))).toHaveProperty('error');
    } finally {
      child.stop();
      main.stop();
      vi.useRealTimers();
    }
  });
});

describe('activity hints', () => {
  it('shows what a browser step is doing', () => {
    expect(toolHint({ url: 'https://example.com', tab_id: 't' })).toBe('https://example.com');
    expect(toolHint({ ref: 'p24:0', input_route: 'dom_event' })).toBe('p24:0');
    // Typed text (a password field, say) never becomes the hint: it is drawn and stored for other sessions.
    expect(toolHint({ ref: 'p1:0', text: 'hunter2' })).toBe('p1:0');
    expect(toolHint({ command: 'curl -H "Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789" x' })).toBe('curl -H "Authorization: Bearer [redacted]" x');
    expect(toolHint({ url: 'https://me:s3cret@example.com/path' })).toBe('https://example.com/path');
    expect(toolHint({ path: 'a.ts', text: 'x' })).toBe('a.ts');
    expect(toolHint(undefined)).toBe('');
  });
});

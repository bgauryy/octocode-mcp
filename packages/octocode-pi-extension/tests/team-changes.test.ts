import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Team } from '../src/team/session.js';
import { TeamStore } from '../src/team/store.js';
import { registerCollab } from '../src/team/tools.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

function member(dbFile: string, cwd: string) {
  const fake = fakePi();
  const team = new Team(fake.pi, { OCTOCODE_AGENT_DB: dbFile });
  registerCollab(fake.pi, team);
  const ctx = fakeCtx({ cwd });
  return { ...fake, team, ctx };
}

const text = (result: { content: Array<{ text: string }> }) => result.content.map((part) => part.text).join('\n');

describe('recent changes by agent', () => {
  const started: Array<ReturnType<typeof member>> = [];
  afterEach(async () => {
    for (const agent of started.splice(0)) await agent.emit('session_shutdown', {}, agent.ctx);
  });

  async function pair() {
    const cwd = fs.realpathSync(tmp());
    fs.mkdirSync(path.join(cwd, '.git'));
    const db = path.join(tmp(), 'team.sqlite');
    const a = member(db, cwd);
    const b = member(db, cwd);
    started.push(a, b);
    await a.emit('session_start', {}, a.ctx);
    await b.emit('session_start', {}, b.ctx);
    return { a, b, cwd, db };
  }

  /** Fires the start/end pair Pi emits around a tool call. */
  async function toolCall(agent: ReturnType<typeof member>, toolName: string, args: unknown, result: unknown, isError = false) {
    const toolCallId = `call-${Math.random()}`;
    await agent.emit('tool_execution_start', { toolCallId, toolName, args }, agent.ctx);
    await agent.emit('tool_execution_end', { toolCallId, toolName, result, isError }, agent.ctx);
  }

  const changes = (agent: ReturnType<typeof member>, params: Record<string, unknown> = {}) => agent.tools.get('coordinate').execute('c', { action: 'changes', ...params }, undefined, undefined, agent.ctx);

  it('records successful file, edit and write calls with their agent, newest first, and skips failed ones', async () => {
    const { a, b, cwd } = await pair();
    const idA = a.team.join('refactor').id;
    const idB = b.team.join('tests').id;
    await toolCall(a, 'file', { queries: [] }, { details: { outcomes: [{ type: 'edit', path: 'src/a.ts', ok: true }, { type: 'write', path: 'src/fail.ts', ok: false }] } });
    await toolCall(b, 'edit', { path: path.join(cwd, 'src/b.ts') }, {});
    await toolCall(b, 'write', { path: 'docs/c.md' }, {}, true);
    await toolCall(a, 'file', { queries: [] }, { details: { outcomes: [{ type: 'edit', path: 'src/a.ts', ok: true }] } });

    const listed = text(await changes(b));
    const lines = listed.split('\n');
    expect(lines[0]).toMatch(/^Files changed by agents in the last 60m \(newest first\):/);
    expect(lines[1]).toMatch(new RegExp(`^- src/a\\.ts · ${idA} via file · \\d+s ago · 2 changes$`));
    expect(lines[2]).toMatch(new RegExp(`^- src/b\\.ts · ${idB} \\(you\\) via edit · \\d+s ago$`));
    expect(listed).not.toContain('fail.ts');
    expect(listed).not.toContain('c.md');
  });

  it('filters by path prefix, limits the rows and bounds the time window', async () => {
    const { a, b } = await pair();
    a.team.join();
    for (const file of ['src/one.ts', 'src/two.ts', 'lib/three.ts']) await toolCall(a, 'write', { path: file }, {});
    expect(text(await changes(b, { paths: ['src/'] }))).not.toContain('lib/three.ts');
    const limited = text(await changes(b, { limit: 1 }));
    expect(limited.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(1);
    expect(limited).toContain('lib/three.ts');
    expect(limited).toMatch(/2 more; raise limit/);
    expect(text(await changes(b, { paths: ['nothing/'] }))).toBe('No agent changed files under nothing/ in the last 60m. Files changed outside agents (you, bash, git) are not tracked: search files by modification time for those.');
  });

  it('says changes are kept a day when a longer window is asked for, and searches that day', async () => {
    const { a, b } = await pair();
    a.team.join();
    await toolCall(a, 'write', { path: 'src/one.ts' }, {});
    const listed = text(await changes(b, { withinMinutes: 10_080 }));
    expect(listed).toMatch(/^Files changed by agents in the last 1440m \(newest first\):/);
    expect(listed).toContain('src/one.ts');
    expect(listed).toContain('(You asked for 10080m; changes are kept only 24h');
    expect(text(await changes(b, { withinMinutes: 10_080, paths: ['nothing/'] }))).toContain('in the last 1440m.');
    expect(text(await changes(b, { withinMinutes: 10_080, paths: ['nothing/'] }))).toContain('changes are kept only 24h');
    expect(text(await changes(b, { withinMinutes: 120 }))).not.toContain('You asked for');
  });

  it('never creates the team database for a session that does not collaborate', async () => {
    const cwd = tmp();
    const db = path.join(tmp(), 'team.sqlite');
    const solo = member(db, cwd);
    started.push(solo);
    await solo.emit('session_start', {}, solo.ctx);
    await toolCall(solo, 'write', { path: 'x.ts' }, {});
    expect(fs.existsSync(db)).toBe(false);
    expect(text(await changes(solo))).toMatch(/^No agent changed files in the last 60m/);
    expect(fs.existsSync(db)).toBe(false);
  });

  it('keeps paths outside the workspace out, and prunes rows older than a day with the periodic prune', () => {
    const cwd = fs.realpathSync(tmp());
    const file = path.join(tmp(), 'team.sqlite');
    const store = TeamStore.open(cwd, file, {});
    try {
      const now = Date.now();
      store.edits.record('agent-1', 'file', [path.join(cwd, 'in.ts'), path.join(tmp(), 'out.ts')], now - 25 * 60 * 60_000);
      expect(store.edits.changes({ withinMs: 48 * 60 * 60_000 }, now).map((row) => row.path)).toEqual(['in.ts']);
      store.edits.record('agent-1', 'file', [path.join(cwd, 'new.ts')], now);
      // The periodic prune (on opening, then at most once a minute with heartbeats) drops rows past the one-day retention.
      TeamStore.open(cwd, file, {}).close();
      expect(store.edits.changes({ withinMs: 48 * 60 * 60_000 }, now).map((row) => row.path)).toEqual(['new.ts']);
    } finally {
      store.close();
    }
  });
});

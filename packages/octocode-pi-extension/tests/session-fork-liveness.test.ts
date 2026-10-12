import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeSharedAgentDb, sharedAgentDb } from '../src/agentdb/db.js';
import { runningPid, sessionRunningPid } from '../src/agentdb/liveness.js';
import { setCurrentSession } from '../src/shared/home.js';
import { Subcommands } from '../src/shared/commands.js';
import { processStartTime } from '../src/shared/process.js';
import { registerSessions } from '../src/sessions/register.js';
import { SessionIndex } from '../src/sessions/store.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

let saved: { home?: string; db?: string };

beforeEach(() => {
  saved = { home: process.env['OCTOCODE_HOME'], db: process.env['OCTOCODE_AGENT_DB'] };
  process.env['OCTOCODE_HOME'] = tmp();
  delete process.env['OCTOCODE_AGENT_DB'];
});

afterEach(() => {
  closeSharedAgentDb();
  setCurrentSession(undefined);
  for (const [key, value] of [['OCTOCODE_HOME', saved.home], ['OCTOCODE_AGENT_DB', saved.db]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const DEAD_PID = 9_999_999;
const row = (id: string) => new SessionIndex(sharedAgentDb()).get(id);

describe('process identity', () => {
  it('reports a session as running only while its recorded process exists', () => {
    const db = sharedAgentDb().db;
    const index = new SessionIndex(sharedAgentDb());
    index.start('mine');
    expect(sessionRunningPid(db, 'mine')).toBe(process.pid);
    db.prepare('UPDATE sessions SET pid = ? WHERE id = ?').run(DEAD_PID, 'mine');
    expect(sessionRunningPid(db, 'mine')).toBeUndefined();
    index.start('mine');
    index.end('mine');
    expect(sessionRunningPid(db, 'mine')).toBeUndefined();
    expect(sessionRunningPid(db, 'unknown')).toBeUndefined();
    expect(runningPid(undefined)).toBeUndefined();
  });

  it('does not take a reused pid for the session\'s process: the recorded start time must match', () => {
    const db = sharedAgentDb().db;
    const index = new SessionIndex(sharedAgentDb());
    const started = processStartTime(process.pid);
    index.start('mine');
    expect(row('mine')?.pid_started ?? undefined).toBe(started);
    // A row from before start times were recorded (null) keeps the pid-only test.
    db.prepare('UPDATE sessions SET pid_started = NULL WHERE id = ?').run('mine');
    expect(sessionRunningPid(db, 'mine')).toBe(process.pid);
    expect(runningPid(process.pid, null)).toBe(process.pid);
    if (started === undefined) return;
    expect(runningPid(process.pid, started)).toBe(process.pid);
    db.prepare('UPDATE sessions SET pid_started = ? WHERE id = ?').run('Thu Jan  1 00:00:00 1970', 'mine');
    expect(sessionRunningPid(db, 'mine')).toBeUndefined();
    expect(runningPid(process.pid, 'Thu Jan  1 00:00:00 1970')).toBeUndefined();
    index.end('mine');
    expect(row('mine')?.pid_started).toBeNull();
  });
});

describe('a fork\'s totals', () => {
  type Entry = { type: string; id: string; timestamp: string; message: Record<string, unknown> };
  const reply = (id: string, timestamp: string, total: number, tokens: number): Entry => ({ type: 'message', id, timestamp, message: { role: 'assistant', usage: { input: tokens, output: 0, totalTokens: tokens, cost: { total } } } });

  async function start(id: string, entries: Entry[], header: { timestamp: string; parentSession?: string }) {
    const fake = fakePi();
    registerSessions(fake.pi, { commands: new Subcommands(), isSubagent: false, filesChanged: () => 0 });
    const file = path.join(tmp(), `${id}.jsonl`);
    fs.writeFileSync(file, '{}\n');
    const ctx = fakeCtx({ cwd: tmp(), hasUI: true });
    Object.assign(ctx, { sessionManager: { getSessionId: () => id, getSessionFile: () => file, getSessionDir: () => path.dirname(file), getSessionName: () => undefined, getEntries: () => entries, getHeader: () => ({ type: 'session', version: 3, id, cwd: '/', ...header }), getBranch: () => entries } });
    setCurrentSession(id);
    await fake.fire('session_start', { type: 'session_start', reason: 'startup' }, ctx);
    await fake.fire('agent_end', { type: 'agent_end', messages: [] }, ctx);
  }

  it('count only its own replies, not the history copied from its parent', async () => {
    await start('sess-fork', [reply('p1', '2026-01-01T10:00:00.000Z', 5, 500), reply('f1', '2026-01-02T00:00:01.000Z', 0.25, 15)], { timestamp: '2026-01-02T00:00:00.000Z', parentSession: '/sessions/parent.jsonl' });
    expect(row('sess-fork')).toMatchObject({ cost: 0.25, tokens: 15 });
  });

  it('count everything in a session without a parent, whatever its header says', async () => {
    await start('sess-plain', [reply('p1', '2026-01-01T10:00:00.000Z', 5, 500)], { timestamp: '2026-01-02T00:00:00.000Z' });
    expect(row('sess-plain')).toMatchObject({ cost: 5, tokens: 500 });
  });
});

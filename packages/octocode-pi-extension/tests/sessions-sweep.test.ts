import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeSharedAgentDb, sharedAgentDb } from '../src/agentdb/db.js';
import { sessionDir, sessionOutputDir, setCurrentSession } from '../src/shared/home.js';
import { SessionIndex } from '../src/sessions/store.js';
import { sweepSessions } from '../src/sessions/sweep.js';
import { shotsDir } from '../src/subagents/screenshots.js';
import { tmp } from './helpers.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DEAD_PID = 9_999_999;

let saved: { home?: string; db?: string };
let home: string;

beforeEach(() => {
  saved = { home: process.env['OCTOCODE_HOME'], db: process.env['OCTOCODE_AGENT_DB'] };
  home = tmp();
  process.env['OCTOCODE_HOME'] = home;
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

describe('session sweep', () => {
  const age = (dir: string, ms: number) => {
    const at = new Date(Date.now() - ms);
    for (const file of [dir, ...fs.readdirSync(dir, { recursive: true }).map((name) => path.join(dir, String(name)))]) fs.utimesSync(file, at, at);
  };
  const folder = (name: string, kinds = ['output']) => {
    const dir = path.join(home, 'agent', 'pi', 'sessions', name);
    for (const kind of kinds) fs.mkdirSync(path.join(dir, kind), { recursive: true });
    return dir;
  };

  it('removes data of sessions Pi no longer lists, keeps live and current ones, trims old output, and runs at most every 6 hours', async () => {
    const index = new SessionIndex(sharedAgentDb());
    const insert = (id: string, pid: number | null, started: string | null = null) =>
      sharedAgentDb().db.prepare('INSERT INTO sessions (id, pid, pid_started) VALUES (?, ?, ?)').run(id, pid, started);
    const listed = async () => new Set(['kept-file', 'current']);
    insert('gone-file', null);
    insert('recent-gone-file', null);
    insert('kept-file', null);
    insert('gone-live', process.pid);
    // Its pid is alive but belongs to another process now (another start time): the session is gone.
    insert('gone-reused', process.pid, 'Thu Jan  1 00:00:00 1970');
    insert('no-folder', null);
    insert('current', DEAD_PID);
    for (const name of ['gone-file', 'kept-file', 'gone-live', 'gone-reused', 'current']) age(folder(name), 8 * DAY);
    age(folder('recent-gone-file'), DAY);
    age(folder(`_pid-${DEAD_PID}`), 2 * DAY);
    age(folder(`_pid-${process.pid}`), 20 * DAY);
    age(folder('unindexed-old'), 15 * DAY);
    age(folder('unindexed-new'), 3 * DAY);
    const oldLog = path.join(folder('kept-file'), 'output', 'old.txt');
    const newLog = path.join(folder('kept-file'), 'output', 'new.txt');
    fs.writeFileSync(oldLog, 'x');
    fs.writeFileSync(newLog, 'x');
    fs.utimesSync(oldLog, new Date(Date.now() - 31 * DAY), new Date(Date.now() - 31 * DAY));

    const removed = await sweepSessions(index, 'current', { listed });
    expect(removed.sort()).toEqual(['_pid-9999999', 'gone-file', 'gone-reused', 'unindexed-old']);
    const left = fs.readdirSync(path.join(home, 'agent', 'pi', 'sessions')).sort();
    expect(left).toEqual(['_pid-' + process.pid, 'current', 'gone-live', 'kept-file', 'recent-gone-file', 'unindexed-new'].sort());
    expect(index.get('gone-file')).toBeUndefined();
    expect(index.get('no-folder')).toBeUndefined();
    expect(index.get('current')).toBeDefined();
    expect(index.get('kept-file')).toBeDefined();
    expect(fs.existsSync(oldLog)).toBe(false);
    expect(fs.existsSync(newLog)).toBe(true);

    age(folder('unindexed-new'), 30 * DAY);
    expect(await sweepSessions(index, 'current', { listed })).toEqual([]);
    expect(await sweepSessions(index, 'current', { listed, now: Date.now() + 7 * HOUR })).toEqual(['unindexed-new']);
  });

  it('removes nothing when Pi cannot list its sessions', async () => {
    const index = new SessionIndex(sharedAgentDb());
    age(folder('unindexed-old'), 15 * DAY);
    expect(await sweepSessions(index, 'current', { force: true, listed: async () => Promise.reject(new Error('no')) })).toEqual([]);
    expect(fs.existsSync(path.join(home, 'agent', 'pi', 'sessions', 'unindexed-old'))).toBe(true);
    // The failed sweep does not count: the next session start tries again instead of waiting 6 hours.
    expect(await sweepSessions(index, 'current', { listed: async () => Promise.reject(new Error('no')) })).toEqual([]);
    expect(await sweepSessions(index, 'current', { listed: async () => new Set<string>() })).toEqual(['unindexed-old']);
  });

  it('follows OCTOCODE_CLEANUP_DAYS: 0 turns the sweep off, N days sets how long output is kept', async () => {
    const index = new SessionIndex(sharedAgentDb());
    const listed = async () => new Set<string>();
    age(folder('unindexed-old'), 15 * DAY);
    const log = path.join(folder('current'), 'output', 'log.txt');
    fs.writeFileSync(log, 'x');
    fs.utimesSync(log, new Date(Date.now() - 3 * DAY), new Date(Date.now() - 3 * DAY));
    expect(await sweepSessions(index, 'current', { listed, force: true, env: { ...process.env, OCTOCODE_CLEANUP_DAYS: '0' } })).toEqual([]);
    expect(fs.existsSync(path.join(home, 'agent', 'pi', 'sessions', 'unindexed-old'))).toBe(true);
    await sweepSessions(index, 'current', { listed, force: true, env: { ...process.env, OCTOCODE_CLEANUP_DAYS: '5' } });
    expect(fs.existsSync(log)).toBe(true);
    await sweepSessions(index, 'current', { listed, force: true, env: { ...process.env, OCTOCODE_CLEANUP_DAYS: '2' } });
    expect(fs.existsSync(log)).toBe(false);
  });

  it('removes the checkpoints of a kept session left alone for OCTOCODE_CLEANUP_DAYS, never the current or a running session\'s', async () => {
    const index = new SessionIndex(sharedAgentDb());
    sharedAgentDb().db.prepare('INSERT INTO sessions (id, pid) VALUES (?, ?)').run('live', process.pid);
    const listed = async () => new Set(['idle', 'active', 'current', 'live']);
    const checkpoints = (name: string, days: number) => {
      const dir = path.join(folder(name, ['output', 'checkpoints/blobs']), 'checkpoints');
      fs.writeFileSync(path.join(dir, 'journal.jsonl'), '{}\n');
      fs.writeFileSync(path.join(dir, 'blobs', 'abc'), 'x');
      age(dir, days * DAY);
      return dir;
    };
    const idle = checkpoints('idle', 31);
    const current = checkpoints('current', 31);
    const live = checkpoints('live', 31);
    // A recent journal keeps its old blobs: they may still be what a rewind restores.
    const active = checkpoints('active', 31);
    fs.utimesSync(path.join(active, 'journal.jsonl'), new Date(), new Date());
    await sweepSessions(index, 'current', { listed, force: true });
    expect(fs.existsSync(idle)).toBe(false);
    expect(fs.existsSync(path.dirname(idle))).toBe(true);
    for (const dir of [current, live, active]) expect(fs.existsSync(path.join(dir, 'blobs', 'abc'))).toBe(true);
  });

  it('removes old subagent screenshots, following OCTOCODE_CLEANUP_DAYS', async () => {
    const index = new SessionIndex(sharedAgentDb());
    const dir = shotsDir();
    fs.mkdirSync(dir, { recursive: true });
    const old = path.join(dir, 'old-1.png');
    const fresh = path.join(dir, 'new-1.png');
    fs.writeFileSync(old, 'x');
    fs.writeFileSync(fresh, 'x');
    fs.utimesSync(old, new Date(Date.now() - 31 * DAY), new Date(Date.now() - 31 * DAY));
    await sweepSessions(index, 'current', { listed: async () => new Set<string>(), force: true });
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('writes session output under the current session folder, owner-only', () => {
    setCurrentSession('a/b');
    const dir = sessionOutputDir('bash');
    expect(dir).toBe(path.join(sessionDir('a/b'), 'bash'));
    if (process.platform !== 'win32') for (const each of [dir, sessionDir('a/b'), path.dirname(sessionDir('a/b'))]) expect(fs.statSync(each).mode & 0o777).toBe(0o700);
  });
});

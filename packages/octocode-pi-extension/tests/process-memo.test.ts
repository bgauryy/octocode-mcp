import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '../src/team/model.js';
import { tmp } from './helpers.js';

const ps = vi.hoisted(() => ({ calls: 0 }));
vi.mock('node:child_process', async (actual) => {
  const real = await actual<typeof import('node:child_process')>();
  return {
    ...real,
    execFileSync: ((command: string, ...rest: unknown[]) => {
      if (command === 'ps') ps.calls++;
      return (real.execFileSync as (...args: unknown[]) => unknown)(command, ...rest);
    }) as typeof real.execFileSync,
  };
});
const { processMatch, processStartTime, sameProcess, VERDICT_TTL_MS } = await import('../src/shared/process.js');
const { TeamStore } = await import('../src/team/store.js');

const children: ChildProcess[] = [];
/** A live process other than this one, with the start time a row would record for it. */
async function peer(): Promise<{ pid: number; started: string }> {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  children.push(child);
  const pid = child.pid!;
  const started = processStartTime(pid);
  if (started === undefined) throw new Error('ps cannot read the start time here');
  return { pid, started };
}
afterEach(() => {
  for (const child of children.splice(0)) child.kill('SIGKILL');
});

const member = (id: string, who: { pid: number; started: string }): Member => ({
  id, role: 'reviewer', pid: who.pid, started: who.started, status: 'working', joinedAt: Date.now(), updatedAt: Date.now(),
  toolCalls: 0, input: 0, cacheRead: 0, output: 0, cost: 0, unpriced: false,
});

describe('sameProcess is one memoized judgement', () => {
  it('compares a live pid\'s start time once per TTL, whoever asks', async () => {
    const who = await peer();
    const t0 = 1_000_000_000_000;
    ps.calls = 0;
    for (let i = 0; i < 20; i++) expect(sameProcess(who.pid, who.started, t0 + i)).toBe(true);
    expect(ps.calls).toBe(1);
    expect(sameProcess(who.pid, who.started, t0 + VERDICT_TTL_MS - 1)).toBe(true);
    expect(ps.calls).toBe(1);
    expect(sameProcess(who.pid, who.started, t0 + VERDICT_TTL_MS)).toBe(true);
    expect(ps.calls).toBe(2);
  });

  it('remembers a different start time (a reused pid) as gone, and keeps each recorded start apart', async () => {
    const who = await peer();
    const t0 = 2_000_000_000_000;
    ps.calls = 0;
    const other = String(Number(who.started) - 5);
    expect(sameProcess(who.pid, other, t0)).toBe(false);
    expect(sameProcess(who.pid, other, t0 + 1)).toBe(false);
    expect(sameProcess(who.pid, who.started, t0 + 2)).toBe(true);
    expect(ps.calls).toBe(2);
  });

  it('judges a dead pid, or one with no recorded start time, without `ps`', async () => {
    const who = await peer();
    ps.calls = 0;
    expect(sameProcess(who.pid, undefined)).toBe(true);
    expect(sameProcess(who.pid, null)).toBe(true);
    expect(sameProcess(0, '1')).toBe(false);
    expect(sameProcess(2 ** 22 + 12345, '1')).toBe(false);
    expect(ps.calls).toBe(0);
  });

  it('sees a process die at once even while its verdict is remembered', async () => {
    const who = await peer();
    const t0 = 3_000_000_000_000;
    expect(sameProcess(who.pid, who.started, t0)).toBe(true);
    const child = children.at(-1)!;
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGKILL');
    await exited;
    expect(sameProcess(who.pid, who.started, t0 + 1)).toBe(false);
  });

  it('leaves processMatch fresh: before a signal the comparison is never reused', async () => {
    const who = await peer();
    ps.calls = 0;
    expect(processMatch(who.pid, who.started)).toBe('same');
    expect(processMatch(who.pid, who.started)).toBe('same');
    expect(ps.calls).toBe(2);
  });

  it('serves the team store sweep and the lease-owner check from the same verdict', async () => {
    const who = await peer();
    const store = TeamStore.open(tmp(), path.join(tmp(), 'team.sqlite'));
    try {
      const now = Date.now();
      store.save(member('owner', who));
      store.save(member('asker', { pid: process.pid, started: processStartTime(process.pid)! }));
      const file = path.join(store.workspace, 'src', 'a.ts');
      expect(store.lock('owner', [{ path: file, kind: 'file', reason: 'edit' }], now).ok).toBe(true);
      // Past the TTL of whatever the setup remembered, so the sweep's comparisons are fresh.
      const later = now + VERDICT_TTL_MS + 1;
      ps.calls = 0;
      store.sweep(later);
      // One comparison for the owner (this process's own start time is read once and kept); the owner's verdict then
      // serves the lease check and the member list too.
      expect(ps.calls).toBe(1);
      expect(store.conflict(file, 'asker', 'file', later)?.owner).toBe('owner');
      expect(store.list(later).map((row) => row.id)).toContain('owner');
      expect(ps.calls).toBe(1);
    } finally { store.close(); }
  });
});

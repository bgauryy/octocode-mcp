import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onSecond } from '../src/shared/clock.js';
import { PARENT_PID_ENV } from '../src/team/store.js';
import { Team } from '../src/team/session.js';
import { LateReports } from '../src/subagents/late.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('the shared one-second clock', () => {
  it('runs one timer for any number of listeners, and none once the last one is gone', () => {
    vi.useFakeTimers();
    const set = vi.spyOn(globalThis, 'setInterval');
    const a = vi.fn();
    const b = vi.fn();
    const stopA = onSecond(a);
    const stopB = onSecond(b);
    const twice = onSecond(a);
    expect(set).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(3_000);
    expect(a).toHaveBeenCalledTimes(6);
    expect(b).toHaveBeenCalledTimes(3);
    stopA();
    twice();
    vi.advanceTimersByTime(1_000);
    expect(a).toHaveBeenCalledTimes(6);
    expect(b).toHaveBeenCalledTimes(4);
    stopB();
    stopB();
    expect(vi.getTimerCount()).toBe(0);
    const stopAgain = onSecond(a);
    expect(vi.getTimerCount()).toBe(1);
    stopAgain();
  });

  it('does not keep the process alive', () => {
    vi.useFakeTimers();
    const set = vi.spyOn(globalThis, 'setInterval');
    const stop = onSecond(() => undefined);
    expect((set.mock.results[0]!.value as NodeJS.Timeout).hasRef()).toBe(false);
    stop();
  });

  it('runs every listener when one throws, then rethrows the first error; a listener may stop itself', () => {
    vi.useFakeTimers();
    const after = vi.fn();
    const stopFailing = onSecond(() => { throw new Error('first'); });
    const stopSelf = onSecond(() => stopSelf());
    const stopAfter = onSecond(after);
    expect(() => vi.advanceTimersByTime(1_000)).toThrow('first');
    expect(after).toHaveBeenCalledTimes(1);
    stopFailing();
    vi.advanceTimersByTime(2_000);
    expect(after).toHaveBeenCalledTimes(3);
    stopAfter();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('serves the team ticker, the parent check and late reports from one timer', () => {
    vi.useFakeTimers();
    const env = { OCTOCODE_AGENT_DB: path.join(tmp(), 'team.sqlite'), [PARENT_PID_ENV]: String(process.pid) };
    const { pi } = fakePi();
    const team = new Team(pi, env);
    const late = new LateReports({ reports: { pendingDir: undefined, add: () => undefined } } as never);
    try {
      team.start(fakeCtx({ cwd: tmp() }));
      team.join();
      late.start('session-one-timer');
      expect(vi.getTimerCount()).toBe(1);
    } finally {
      late.stop();
      team.stop();
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});

import { spawn } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { interpret, runHook } from '../src/hooks/runner.js';
import { tmp } from './helpers.js';

vi.mock('node:child_process', async (original) => {
  const module = await original<typeof import('node:child_process')>();
  return { ...module, spawn: vi.fn(module.spawn) };
});

it('does not spawn a hook for an already aborted request', async () => {
  const signal = AbortSignal.abort();
  const run = await runHook({ command: 'echo should-not-run', timeoutMs: 1000, source: 'test' }, {}, tmp(), {}, signal);
  expect(vi.mocked(spawn).mock.calls.length).toBe(0);
  expect(interpret('PreToolUse', run)).toEqual({});
  expect(run).toMatchObject({ code: null, stdout: '', timedOut: false });
});

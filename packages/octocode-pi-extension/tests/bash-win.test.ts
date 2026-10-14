import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerBashTool } from '../src/files/bash.js';
import { BashJobs } from '../src/files/bash-jobs.js';
import { Subcommands } from '../src/shared/commands.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

const tree = { start: vi.fn(async () => true), assign: vi.fn(async (_pid: number) => true), owns: vi.fn(() => false), kill: vi.fn(async () => true) };
vi.mock('../src/shared/winhelper.js', () => ({ windowsTree: { start: () => tree.start(), assign: (pid: number) => tree.assign(pid), owns: () => tree.owns(), kill: () => tree.kill() } }));

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
afterEach(() => {
  Object.defineProperty(process, 'platform', platform);
  vi.clearAllMocks();
});

/** The bash tool on a pretend Windows, with `/bin/sh` standing in for the shell (the spawn itself is real). */
const setup = () => {
  const { pi, tools } = fakePi();
  const jobs = new BashJobs(tmp());
  registerBashTool(pi, new Subcommands(), jobs, () => ({ shellPath: '/bin/sh' }));
  Object.defineProperty(process, 'platform', { value: 'win32' });
  return { tool: tools.get('bash'), jobs, ctx: fakeCtx({ cwd: tmp() }) };
};

describe('bash on Windows puts each spawned shell in a job', () => {
  it('prepares the helper before, and assigns the pid after, a foreground command spawns', async () => {
    const { tool, ctx } = setup();
    await tool.execute('t1', { command: 'echo hi' }, undefined, undefined, ctx);
    expect(tree.start).toHaveBeenCalledTimes(1);
    expect(tree.assign).toHaveBeenCalledTimes(1);
    expect(tree.assign.mock.calls[0]![0]).toBeGreaterThan(1);
    expect(tree.start.mock.invocationCallOrder[0]).toBeLessThan(tree.assign.mock.invocationCallOrder[0]!);
  });

  it('does the same for a background job', async () => {
    const { tool, ctx, jobs } = setup();
    await tool.execute('t1', { command: 'sleep 1', background: true }, undefined, undefined, ctx);
    expect(tree.start).toHaveBeenCalledTimes(1);
    expect(tree.assign).toHaveBeenCalledTimes(1);
    await jobs.stopAll('session end');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

const spawn = vi.fn();
vi.mock('node:child_process', () => ({ spawn: (...args: unknown[]) => spawn(...args) }));
const tree = { owns: vi.fn(), kill: vi.fn(), assign: vi.fn(), start: vi.fn() };
vi.mock('../src/shared/winhelper.js', () => ({ windowsTree: { owns: (pid: unknown) => tree.owns(pid), kill: (pid: unknown) => tree.kill(pid), assign: (pid: unknown) => tree.assign(pid), start: () => tree.start() } }));
const { adoptTree, killTree, prepareTree, signalTree, stopTree } = await import('../src/shared/process.js');

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
afterEach(() => {
  Object.defineProperty(process, 'platform', platform);
  spawn.mockReset();
  for (const mock of Object.values(tree)) mock.mockReset();
});

const win32 = (): void => void Object.defineProperty(process, 'platform', { value: 'win32' });
/** A pid no process has. */
const GONE = 2 ** 30;

describe('signalTree', () => {
  it('does nothing without a pid', () => {
    const kill = vi.spyOn(process, 'kill');
    signalTree(undefined, 'SIGTERM');
    signalTree(0, 'SIGTERM');
    expect(kill).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    kill.mockRestore();
  });

  it('uses taskkill on Windows and never throws when it is missing', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const on = vi.fn();
    spawn.mockReturnValue({ on });
    signalTree(1234, 'SIGTERM');
    expect(spawn).toHaveBeenCalledWith('taskkill', ['/pid', '1234', '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    expect(on).toHaveBeenCalledWith('error', expect.any(Function));
    spawn.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(() => signalTree(1234, 'SIGKILL')).not.toThrow();
  });
});

describe('Windows trees', () => {
  it('ends a tracked tree through its job, with no taskkill', async () => {
    win32();
    tree.owns.mockReturnValue(true);
    tree.kill.mockResolvedValue(true);
    signalTree(GONE, 'SIGTERM');
    await Promise.resolve();
    expect(tree.kill).toHaveBeenCalledWith(GONE);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('falls back to taskkill when the job could not be ended', async () => {
    win32();
    spawn.mockReturnValue({ on: vi.fn() });
    tree.owns.mockReturnValue(true);
    tree.kill.mockResolvedValue(false);
    signalTree(GONE, 'SIGKILL');
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledWith('taskkill', ['/pid', String(GONE), '/T', '/F'], { stdio: 'ignore', windowsHide: true }));
  });

  it('stopTree ends the job and resolves, also when the root already exited', async () => {
    win32();
    tree.owns.mockReturnValue(true);
    tree.kill.mockResolvedValue(true);
    await stopTree(GONE, 50);
    expect(tree.kill).toHaveBeenCalledTimes(1);
    expect(spawn).not.toHaveBeenCalled();
    // A pid below 2 is never signalled.
    await stopTree(1, 50);
    expect(tree.kill).toHaveBeenCalledTimes(1);
  });

  it('stopTree uses taskkill for a root the helper does not hold, and again while the root lives', async () => {
    win32();
    spawn.mockReturnValue({ on: vi.fn() });
    tree.owns.mockReturnValue(false);
    await stopTree(GONE, 50);
    expect(tree.kill).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledTimes(1);
    spawn.mockClear();
    // This process is alive and stays so: the second attempt is made after the grace.
    await stopTree(process.pid, 30);
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('killTree ends the job once for repeated stops', async () => {
    win32();
    tree.owns.mockReturnValue(true);
    tree.kill.mockResolvedValue(true);
    killTree(GONE, 10);
    killTree(GONE, 10);
    await vi.waitFor(() => expect(tree.kill).toHaveBeenCalledTimes(1));
  });

  it('starts the helper before a spawn and assigns the root after it, on Windows only', async () => {
    adoptTree(77);
    await prepareTree();
    expect(tree.start).not.toHaveBeenCalled();
    expect(tree.assign).not.toHaveBeenCalled();
    win32();
    await prepareTree();
    adoptTree(77);
    adoptTree(undefined);
    expect(tree.start).toHaveBeenCalledTimes(1);
    expect(tree.assign.mock.calls).toEqual([[77], [undefined]]);
  });

  it('has no process group to inspect', async () => {
    win32();
    const { groupAlive, groupMembers, descendantPids } = await import('../src/shared/process.js');
    expect(groupAlive(process.pid)).toBe(true);
    expect(groupAlive(GONE)).toBe(false);
    expect(groupMembers(process.pid)).toEqual([]);
    expect(descendantPids(process.pid)).toEqual([]);
  });
});

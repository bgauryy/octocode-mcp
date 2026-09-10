import * as childProcess from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { allowLocalFixtureProcesses } from '../../../test-utils/external-effects-guard.js';
import { createAwarenessEventConsumer } from '../src/event-consumer.js';
import { openAwarenessStore } from '../src/coordination/open.js';
import { repositoryWorkspacePaths, withRepositoryWorkspaceScope } from '../src/git.js';

let root: string;
let restoreProcesses: () => void;
beforeEach(() => {
  restoreProcesses = allowLocalFixtureProcesses();
  root = realpathSync(mkdtempSync(join(tmpdir(), 'awareness-drain-git-')));
});

it('rejects incomplete async Git membership before any storage callback runs', async () => {
  const callback = vi.fn();
  const run = (file: string, args: string[], _options: unknown, done: (error: Error | null, stdout: string, stderr: string) => void) => {
    expect(file).toBe('git');
    const output = args.includes('--show-toplevel') ? root
      : args.includes('--git-common-dir') ? join(root, '.git')
        : `worktree ${root}\0HEAD abc\0`; // missing record terminator
    done(null, output, '');
    return {};
  };
  vi.spyOn(childProcess, 'execFile').mockImplementation(run as unknown as typeof childProcess.execFile);
  await expect(withRepositoryWorkspaceScope(root, callback)).rejects.toThrow('enumerate Git worktrees completely');
  expect(callback).not.toHaveBeenCalled();
});

it('expires the scope even in detached asynchronous children', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let detached!: Promise<string[]>;
  const sync = vi.spyOn(childProcess, 'spawnSync');
  await withRepositoryWorkspaceScope(root, async () => {
    expect(repositoryWorkspacePaths(root)).toEqual([root]);
    detached = gate.then(() => repositoryWorkspacePaths(root));
  });
  expect(sync.mock.calls.length).toBe(0);
  release();
  expect(await detached).toEqual([root]);
  expect(sync.mock.calls.length).toBeGreaterThan(0);
});
afterEach(() => { vi.restoreAllMocks(); restoreProcesses(); rmSync(root, { recursive: true, force: true }); });

it('discovers linked scope once asynchronously per drain, preserving clone isolation and fresh membership', async () => {
  const main = join(root, 'main');
  const peer = join(root, 'peer');
  const clone = join(root, 'clone');
  const dbPath = join(root, 'awareness.sqlite3');
  const git = (cwd: string, ...args: string[]) => childProcess.execFileSync('git', ['-C', cwd, ...args]);
  mkdirSync(main);
  git(main, 'init', '-q', '-b', 'main');
  writeFileSync(join(main, 'seed'), 'seed');
  git(main, 'add', '.');
  git(main, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'seed');
  git(main, 'worktree', 'add', '-qb', 'peer', peer);
  git(root, 'clone', '-q', main, clone);
  const seed = openAwarenessStore({ workspace: main, dbPath });
  for (let i = 0; i < 20; i++) seed.sendMessage({ fromAgentId: 'sender', toAgentId: 'recipient', text: `message ${i}` });
  seed.close();
  const outsider = openAwarenessStore({ workspace: clone, dbPath });
  outsider.sendMessage({ fromAgentId: 'sender', toAgentId: 'recipient', text: 'private clone message' });
  outsider.close();
  const spawnSync = vi.spyOn(childProcess, 'spawnSync');
  const execFile = vi.spyOn(childProcess, 'execFile');
  const delivered: string[] = [];
  const consumer = createAwarenessEventConsumer({ workspace: peer, consumerId: 'session', expectedAgentId: 'recipient',
    openStore: workspace => openAwarenessStore({ workspace, dbPath }), deliver: message => { delivered.push(message.content); } });
  const first = await consumer.drain();
  expect(first).toMatchObject({ drainAccepted: 20, drainErrors: 0, backlogDepth: 0 });
  expect(delivered).toHaveLength(20);
  expect(delivered.join('\n')).not.toContain('private clone message');
  expect(spawnSync.mock.calls.length).toBe(0);
  expect(execFile.mock.calls.length).toBe(4);
  const peerSender = openAwarenessStore({ workspace: peer, dbPath });
  peerSender.sendMessage({ fromAgentId: 'sender', toAgentId: 'main-recipient', text: 'removed peer message' });
  peerSender.close();
  git(main, 'worktree', 'remove', peer);
  const afterRemoval = await createAwarenessEventConsumer({ workspace: main, consumerId: 'main-session', expectedAgentId: 'main-recipient',
    openStore: workspace => openAwarenessStore({ workspace, dbPath }), deliver: message => { delivered.push(message.content); } }).drain();
  expect(afterRemoval.drainErrors).toBe(0);
  expect(delivered.join('\n')).not.toContain('removed peer message');
});

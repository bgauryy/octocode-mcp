import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { atomicWriteFile, atomicWriteFileSync } from '../src/shared/atomic.js';
import { say, Subcommands, wordCompletions } from '../src/shared/commands.js';
import { envFlag, envInt, ownNonce, PERMISSION_NONCE_FILE_ENV, sameSecret, takeNonce } from '../src/shared/env.js';
import { dirsToRepoRoot, repoKey, sweepStaleOutputs, workspaceRoot, workspaceScratchDir } from '../src/shared/home.js';
import { findManifest, minimumPiVersion, packageRoot, versionBelow } from '../src/shared/package.js';
import { killTree, processAlive, stopTree } from '../src/shared/process.js';
import { formatCost, formatTokens, formatTokenUsage } from '../src/shared/format.js';
import { addReply, capChars, capOutput, clipText, contentText, cutText, emptyTotals, entryMessage, settleWithin, spendOf, unpricedModel } from '../src/shared/util.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';
import { nonceFile } from './nonce-file.js';

describe('settleWithin', () => {
  it('ends on the work, the timeout or an abort, never rejects, and removes its abort listener', async () => {
    const started = Date.now();
    await settleWithin(Promise.reject(new Error('boom')), 5_000);
    await settleWithin(new Promise(() => undefined), 30);
    // No limit: only the work or the signal ends the wait.
    const unlimited = new AbortController();
    const open = settleWithin(new Promise(() => undefined), undefined, unlimited.signal);
    let done = false;
    void open.then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(done).toBe(false);
    unlimited.abort();
    await open;
    expect(Date.now() - started).toBeLessThan(1_000);
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const waiting = settleWithin(new Promise(() => undefined), 60_000, controller.signal);
    controller.abort();
    await waiting;
    await settleWithin(Promise.resolve(), 60_000, new AbortController().signal);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    await settleWithin(new Promise(() => undefined), 60_000, controller.signal);
  });
});

describe('capOutput', () => {
  it('keeps the head of a single line over the byte budget instead of returning nothing', () => {
    const out = capOutput('é'.repeat(1_000), 101);
    expect(out.startsWith('é'.repeat(50))).toBe(true);
    expect(out).not.toContain('\uFFFD');
    expect(out).toContain('[Output trimmed: the first line alone is');
    expect(capOutput('a\nb\nc', 1_000, 2)).toContain('[Output trimmed: 2 of 3 lines');
  });
});

describe('envFlag / envInt', () => {
  it('accepts one spelling rule for every switch', () => {
    for (const value of ['1', 'true', 'ON', ' yes ']) expect(envFlag({ X: value }, 'X')).toBe(true);
    for (const value of ['0', 'false', 'Off', 'no']) expect(envFlag({ X: value }, 'X', true)).toBe(false);
    expect(envFlag({}, 'X')).toBe(false);
    expect(envFlag({ X: 'maybe' }, 'X', true)).toBe(true);
  });

  it('parses clamped integers', () => {
    expect(envInt({ N: '7' }, 'N', 3)).toBe(7);
    expect(envInt({ N: '7x' }, 'N', 3)).toBe(3);
    expect(envInt({}, 'N', 3)).toBe(3);
    expect(envInt({ N: '99' }, 'N', 3, { min: 1, max: 10 })).toBe(10);
    expect(envInt({ N: '-5' }, 'N', 3, { min: 1 })).toBe(1);
  });
});

describe('the subagent nonce', () => {
  it('is read from the file an injected environment names, which is unlinked and no longer named', () => {
    const file = nonceFile('abc');
    const env: NodeJS.ProcessEnv = { [PERMISSION_NONCE_FILE_ENV]: file };
    expect(ownNonce(env)).toBeUndefined();
    expect(takeNonce(env)).toBe('abc');
    expect(fs.existsSync(file)).toBe(false);
    expect(env).not.toHaveProperty(PERMISSION_NONCE_FILE_ENV);
    expect(ownNonce(env)).toBe('abc');
    expect(takeNonce(env)).toBe('abc');
    expect(takeNonce({})).toBeUndefined();
    // A missing file gives no nonce, and nothing throws.
    expect(takeNonce({ [PERMISSION_NONCE_FILE_ENV]: path.join(tmp(), 'gone') })).toBeUndefined();
  });

  it('stays with the process after the file and the variable are gone, so a reload still has it', () => {
    const saved = process.env[PERMISSION_NONCE_FILE_ENV];
    const slot = Symbol.for('octocode.permissionNonce');
    const held = (globalThis as Record<symbol, unknown>)[slot];
    try {
      const file = nonceFile('n-1');
      process.env[PERMISSION_NONCE_FILE_ENV] = file;
      expect(takeNonce()).toBe('n-1');
      expect(process.env[PERMISSION_NONCE_FILE_ENV]).toBeUndefined();
      expect(fs.existsSync(file)).toBe(false);
      expect(ownNonce()).toBe('n-1');
      expect(takeNonce()).toBe('n-1');
    } finally {
      (globalThis as Record<symbol, unknown>)[slot] = held;
      if (saved === undefined) delete process.env[PERMISSION_NONCE_FILE_ENV];
      else process.env[PERMISSION_NONCE_FILE_ENV] = saved;
    }
  });

  it('compares secrets in constant time over equal-length buffers: only the same string matches', () => {
    expect(sameSecret('abc', 'abc')).toBe(true);
    expect(sameSecret('abc', 'abd')).toBe(false);
    expect(sameSecret('abc', 'abcd')).toBe(false);
    expect(sameSecret('abc', undefined)).toBe(false);
    expect(sameSecret('abc', 1)).toBe(false);
    expect(sameSecret('', '')).toBe(false);
  });
});

describe('paths', () => {
  it('walks up to the repository root, else stays at cwd', () => {
    const root = tmp('octocode-paths-');
    fs.mkdirSync(path.join(root, '.git'));
    const deep = path.join(root, 'a', 'b');
    fs.mkdirSync(deep, { recursive: true });
    expect(dirsToRepoRoot(deep)).toEqual([deep, path.join(root, 'a'), root]);
    expect(repoKey(deep).root).toBe(fs.realpathSync(root));
    const loose = tmp('octocode-paths-');
    expect(dirsToRepoRoot(loose)).toEqual([loose]);
    expect(repoKey(loose).root).toBe(fs.realpathSync(loose));
  });

  it('counts a repository root at, above or equal to home, or `/`, as no workspace: cwd is the root', () => {
    const home = tmp('octocode-paths-home-');
    fs.mkdirSync(path.join(home, '.git'));
    const proj = path.join(home, 'proj');
    fs.mkdirSync(proj);
    vi.stubEnv('HOME', home);
    // A dotfiles repository at `~`: a project folder under it is its own root, not `~`.
    expect(repoKey(proj)).toEqual({ key: fs.realpathSync(proj), root: fs.realpathSync(proj), name: 'proj' });
    // A repository nested under home keeps its own git root.
    const nested = path.join(proj, 'app');
    fs.mkdirSync(path.join(nested, '.git'), { recursive: true });
    expect(repoKey(nested).root).toBe(fs.realpathSync(nested));
    // A root above home (here: the folder holding it) is no workspace either.
    const above = tmp('octocode-paths-above-');
    fs.mkdirSync(path.join(above, '.git'));
    const inner = path.join(above, 'me');
    fs.mkdirSync(inner);
    vi.stubEnv('HOME', inner);
    const elsewhere = path.join(above, 'other');
    fs.mkdirSync(elsewhere);
    expect(repoKey(elsewhere).root).toBe(fs.realpathSync(elsewhere));
  });

  it('names no permission workspace for home, a folder above it or `/`, and the repository root elsewhere', () => {
    const home = tmp('octocode-paths-home-');
    const proj = path.join(home, 'proj');
    fs.mkdirSync(path.join(proj, '.git'), { recursive: true });
    vi.stubEnv('HOME', home);
    expect(workspaceRoot(home)).toBeUndefined();
    expect(workspaceRoot(path.dirname(home))).toBeUndefined();
    expect(workspaceRoot('/')).toBeUndefined();
    expect(workspaceRoot(proj)).toBe(fs.realpathSync(proj));
    // Per-repository state still keys on the folder itself.
    expect(repoKey(home).root).toBe(fs.realpathSync(home));
  });

  it('resolves one checkout reached through a symlink to one repository', () => {
    const root = tmp('octocode-paths-');
    fs.mkdirSync(path.join(root, '.git'));
    const link = path.join(tmp('octocode-paths-'), 'link');
    fs.symlinkSync(root, link);
    expect(repoKey(link)).toEqual(repoKey(root));
  });
});

describe('workspace scratch', () => {
  it('creates a self-ignoring folder and sweeps stale entries except kept ones', async () => {
    const workspace = tmp('octocode-scratch-');
    const dir = workspaceScratchDir(workspace, path.join('agents', 'a-1'));
    expect(dir).toBe(path.join(workspace, '.octocode', 'tmp', 'agents', 'a-1'));
    expect(fs.readFileSync(path.join(workspace, '.octocode', 'tmp', '.gitignore'), 'utf8')).toBe('*\n');
    workspaceScratchDir(workspace, path.join('agents', 'a-2'));
    workspaceScratchDir(workspace, path.join('agents', 'a-3'));
    const root = path.dirname(dir);
    const old = new Date(Date.now() - 10_000);
    for (const name of ['a-1', 'a-2']) fs.utimesSync(path.join(root, name), old, old);
    await sweepStaleOutputs(root, 5_000, new Set(['a-2']));
    expect(fs.readdirSync(root).sort()).toEqual(['a-2', 'a-3']);
    await expect(sweepStaleOutputs(path.join(workspace, 'missing'), 0)).resolves.toBeUndefined();
  });
});

describe('package', () => {
  it('finds manifests by name', () => {
    const root = packageRoot();
    expect(fs.existsSync(path.join(root, 'package.json'))).toBe(true);
    expect(findManifest(path.join(root, 'src', 'shared'), '@octocodeai/pi-extension')?.dir).toBe(root);
    expect(findManifest(root, 'no-such-package', 2)).toBeUndefined();
  });
});

describe('util', () => {
  it('caps characters with a note', () => {
    expect(capChars('short', 10)).toBe('short');
    expect(capChars('abcdef', 3)).toBe('abc\n[… 3 more characters cut]');
    expect(capChars('abcdef', 3, 'read the file')).toBe('abc\n[… 3 more characters cut; read the file]');
  });

  it('cuts text by bytes or characters, head or tail, never splitting a character', () => {
    const emoji = 'a😀b'; // 😀: 4 UTF-8 bytes, a surrogate pair
    expect(cutText(emoji, 3)).toBe('a');
    expect(cutText(emoji, 5)).toBe('a😀');
    expect(cutText(emoji, 3, { tail: true })).toBe('b');
    expect(cutText('héllo', 2)).toBe('h');
    expect(cutText(emoji, 2, { chars: true })).toBe('a');
    expect(cutText(emoji, 2, { chars: true, tail: true })).toBe('b');
    expect(cutText(emoji, 3, { chars: true, tail: true })).toBe('😀b');
    expect(cutText('abc', 10)).toBe('abc');
    expect(clipText('ab😀cd', 4)).toBe('ab…');
    const cut = 4;
    expect(capChars('ab😀cd', 3)).toBe(`ab\n[… ${cut} more characters cut]`);
  });

  it('joins message content text', () => {
    const content = [{ type: 'text', text: 'a' }, { type: 'image', data: 'x' }, { type: 'text', text: 'b' }, 'junk'];
    expect(contentText(content)).toBe('a\nb');
    expect(contentText(content, { separator: '', image: '[image]' })).toBe('a[image]b');
    expect(contentText('plain')).toBe('plain');
    expect(contentText(undefined)).toBe('');
  });
});

describe('atomic writes', () => {
  it.skipIf(process.platform === 'win32')('applies an explicit mode and leaves no temp file', async () => {
    const dir = tmp('octocode-atomic-');
    const file = path.join(dir, 'secret.json');
    fs.writeFileSync(file, 'old', { mode: 0o644 });
    await atomicWriteFile(file, 'new', undefined, { mode: 0o600 });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    const sync = path.join(dir, 'sync.json');
    atomicWriteFileSync(sync, 'x', { mode: 0o600 });
    expect(fs.statSync(sync).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(dir).sort()).toEqual(['secret.json', 'sync.json']);
  });

  it('keeps an existing file\'s mode and writes through a symlink, synchronously and asynchronously', async () => {
    const dir = tmp('octocode-atomic-');
    for (const [name, write] of [['sync', async (file: string) => atomicWriteFileSync(file, 'new')], ['async', (file: string) => atomicWriteFile(file, 'new')]] as const) {
      const real = path.join(dir, `${name}.sh`);
      const link = path.join(dir, `${name}-link.sh`);
      fs.writeFileSync(real, 'old');
      fs.chmodSync(real, 0o750);
      fs.symlinkSync(real, link);
      await write(link);
      expect(fs.readFileSync(real, 'utf8'), name).toBe('new');
      expect(fs.statSync(real).mode & 0o777, name).toBe(0o750);
      expect(fs.lstatSync(link).isSymbolicLink(), name).toBe(true);
    }
    expect(fs.readdirSync(dir).sort()).toEqual(['async-link.sh', 'async.sh', 'sync-link.sh', 'sync.sh']);
  });

  it('removes the temp file when the write fails', () => {
    const dir = tmp('octocode-atomic-');
    fs.mkdirSync(path.join(dir, 'target'));
    expect(() => atomicWriteFileSync(path.join(dir, 'target'), 'x')).toThrow();
    expect(fs.readdirSync(dir)).toEqual(['target']);
  });
});

describe('process', () => {
  it('checks liveness', () => {
    expect(processAlive(process.pid)).toBe(true);
    expect(processAlive(0)).toBe(false);
    expect(processAlive(-1)).toBe(false);
    expect(processAlive('1')).toBe(false);
    expect(processAlive(2 ** 22 + 12345)).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('kills a detached process tree', async () => {
    const child = spawn('sh', ['-c', 'sleep 30 & wait'], { detached: true, stdio: 'ignore' });
    const exited = new Promise((resolve) => child.on('exit', resolve));
    killTree(child.pid, 100);
    await exited;
    expect(processAlive(child.pid)).toBe(false);
    killTree(undefined);
  });

  /** A child that ignores SIGTERM and has started a detached grandchild in its own process group; resolves with both pids. */
  const treeWithDetachedGrandchild = async () => {
    const script = `process.on('SIGTERM', () => {}); const g = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' }); g.unref(); console.log(g.pid); setInterval(() => {}, 1000);`;
    const child = spawn(process.execPath, ['-e', script], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const grandchild = await new Promise<number>((resolve) => child.stdout.once('data', (chunk: Buffer) => resolve(Number(String(chunk).trim()))));
    return { child, grandchild };
  };

  it.skipIf(process.platform === 'win32')('stopTree also stops descendants that left the process group', async () => {
    const { child, grandchild } = await treeWithDetachedGrandchild();
    try {
      expect(processAlive(grandchild)).toBe(true);
      await stopTree(child.pid, 200);
      await vi.waitFor(() => expect(processAlive(grandchild)).toBe(false), { timeout: 2_000 });
    } finally {
      try { process.kill(grandchild, 'SIGKILL'); } catch { /* gone */ }
    }
  });

  it.skipIf(process.platform === 'win32')('killTree also kills descendants that left the process group once the grace runs out', async () => {
    const { child, grandchild } = await treeWithDetachedGrandchild();
    try {
      killTree(child.pid, 200);
      await vi.waitFor(() => expect(processAlive(grandchild)).toBe(false), { timeout: 2_000 });
    } finally {
      try { process.kill(grandchild, 'SIGKILL'); } catch { /* gone */ }
    }
  });

  it.skipIf(process.platform === 'win32')('stops a tree once and sends no SIGKILL after it closed', async () => {
    const child = spawn('sh', ['-c', 'sleep 30'], { detached: true, stdio: 'ignore' });
    const closed = new Promise((resolve) => child.on('close', resolve));
    const kill = vi.spyOn(process, 'kill');
    try {
      killTree(child.pid, 150);
      killTree(child.pid, 150);
      await closed;
      await new Promise((resolve) => setTimeout(resolve, 250));
      const signals = kill.mock.calls.filter(([pid]) => pid === -child.pid!).map(([, signal]) => signal);
      expect(signals.filter((signal) => signal === 'SIGTERM')).toHaveLength(1);
      expect(signals).not.toContain('SIGKILL');
    } finally {
      kill.mockRestore();
    }
  });
});

describe('/octocode subcommands', () => {
  const setup = () => {
    const commands = new Subcommands();
    const calls: string[] = [];
    commands.add('review', { description: 'review on|off — ask first', complete: (prefix) => wordCompletions([['on', 'ask'], 'off'], prefix), handler: async (args) => void calls.push(`review:${args}`) });
    commands.add('mcp', { description: 'mcp — servers', handler: async (args) => void calls.push(`mcp:${args}`) });
    const fake = fakePi();
    commands.register(fake.pi, () => 'STATUS');
    return { commands, calls, command: fake.commands.get('octocode') };
  };

  it('routes status, help, subcommands and unknown names', async () => {
    const { calls, command } = setup();
    expect(command.description).toContain('mcp, review, help');
    const ctx = fakeCtx({ cwd: '.' });
    await command.handler('', ctx);
    await command.handler('status', ctx);
    await command.handler('help', ctx);
    await command.handler('  mcp   login  github ', ctx);
    await command.handler('review', ctx);
    await command.handler('nope', ctx);
    expect(calls).toEqual(['mcp:login  github', 'review:']);
    expect(ctx.ui.notes.map((note) => note.message.split('\n')[0])).toEqual(['STATUS', 'STATUS', 'Usage: /octocode [subcommand]', 'Unknown subcommand "nope".']);
    expect(ctx.ui.notes[2]!.message).toContain('review on|off — ask first');
    expect(ctx.ui.notes[2]!.message).toContain('(none) or status');
  });

  it('completes names, then arguments', () => {
    const { command } = setup();
    expect(command.getArgumentCompletions('re').map((item: { value: string }) => item.value)).toEqual(['review ']);
    expect(command.getArgumentCompletions('').map((item: { value: string }) => item.value)).toEqual(['mcp ', 'review ', 'help', 'status']);
    expect(command.getArgumentCompletions('sta')).toEqual([{ value: 'status', label: 'status', description: 'status — Octocode status' }]);
    expect(command.getArgumentCompletions('review o')).toEqual([
      { value: 'review on', label: 'on', description: 'ask' },
      { value: 'review off', label: 'off' },
    ]);
    expect(command.getArgumentCompletions('mcp x')).toBeNull();
    expect(command.getArgumentCompletions('zz')).toBeNull();
  });

  it('completes the same whitespace-separated commands that dispatch accepts', async () => {
    const { command, calls } = setup();
    expect(command.getArgumentCompletions(' \tre')).toEqual(command.getArgumentCompletions('re'));
    expect(command.getArgumentCompletions(' \treview\t  o')).toEqual(command.getArgumentCompletions('review o'));
    await command.handler(' \treview\t  on ', fakeCtx({ cwd: '.' }));
    expect(calls).toEqual(['review:on']);
  });

  it('shows registered shortcuts in help and keeps their completion and dispatch aligned', async () => {
    const { commands, calls } = setup();
    const fake = fakePi();
    commands.alias(fake.pi, 'review');
    commands.alias(fake.pi, 'mcp');
    expect(commands.help()).toContain('Shortcuts: /mcp, /review');
    const shortcut = fake.commands.get('review');
    expect(shortcut.getArgumentCompletions(' \to')).toEqual([{ value: 'on', label: 'on', description: 'ask' }, { value: 'off', label: 'off' }]);
    await shortcut.handler(' \ton ', fakeCtx({ cwd: '.' }));
    expect(calls).toEqual(['review:on']);
  });
});

describe('command output', () => {
  it('sanitizes notifications and writes headless output to stderr without touching stdout', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      const interactive = fakeCtx({ cwd: '.', hasUI: true });
      const headless = fakeCtx({ cwd: '.', hasUI: false });
      const text = 'safe\u001b]0;title\u0007\u202e result';
      say(interactive, text, 'warning');
      expect(interactive.ui.notes.at(-1)).toEqual({ message: 'safe result', type: 'warning' });
      expect(stderr).not.toHaveBeenCalled();
      say(headless, text);
      expect(stderr).toHaveBeenCalledExactlyOnceWith('safe result\n');
      expect(stdout).not.toHaveBeenCalled();
    } finally {
      stderr.mockRestore();
      stdout.mockRestore();
    }
  });
});

describe('usage display', () => {
  it('formats token counts up to millions', () => {
    expect([950, 12_400, 250_000, 1_234_567, 143_861_000].map(formatTokens)).toEqual(['950', '12.4k', '250k', '1.2M', '144M']);
  });

  it('counts every prompt token in ↑ and shows the share read from cache', () => {
    expect(formatTokenUsage({ input: 1_200_000, cacheRead: 1_128_000, output: 35_000 })).toBe('↑1.2M (94% cached) ↓35k');
    expect(formatTokenUsage({ input: 1_500, cacheRead: 0, output: 250 })).toBe('↑1.5k ↓250');
  });

  it('shows money as an estimate and never hides an unpriced part', () => {
    expect(formatCost({ cost: 2.2849, unpriced: false })).toBe('≈$2.28');
    expect(formatCost({ cost: 0.004, unpriced: false })).toBe('≈$<0.01');
    expect(formatCost({ cost: 2.28, unpriced: true })).toBe('≈$2.28 + n/a');
    expect(formatCost({ cost: 0, unpriced: true })).toBe('cost n/a');
    expect(formatCost({ cost: 0, unpriced: false })).toBe('');
  });

  it('marks a reply unpriced when its model has no rates and it spent tokens', () => {
    const usage = (total: number) => ({ input: 10, output: 5, cacheRead: 90, cacheWrite: 0, cost: { total } });
    const rates = (rate: number) => ({ cost: { input: rate, output: rate, cacheRead: rate, cacheWrite: rate } });
    const find = (provider: string) => (provider === 'free' ? rates(0) : provider === 'paid' ? rates(3) : undefined);
    expect(unpricedModel({ provider: 'free', model: 'llama', usage: usage(0) }, find)).toBe('free/llama');
    expect(unpricedModel({ provider: 'paid', model: 'opus', usage: usage(0.2) }, find)).toBeUndefined();
    // A model the registry does not know is judged by the reply's own cost.
    expect(unpricedModel({ provider: 'gone', model: 'x', usage: usage(0) }, find)).toBe('gone/x');
    expect(unpricedModel({ provider: 'gone', model: 'x', usage: usage(0.1) }, find)).toBeUndefined();
    // Nothing spent, nothing missing.
    expect(unpricedModel({ provider: 'free', model: 'llama', usage: { input: 0, output: 0, cost: { total: 0 } } }, find)).toBeUndefined();
    expect(unpricedModel({ role: 'toolResult', usage: usage(0) })).toBe('unknown model');
  });

  it('adds a reply into display totals: the whole prompt, its cached part, cost and whether any part was unpriced', () => {
    const totals = emptyTotals();
    addReply(totals, { input: 10, output: 5, cacheRead: 80, cacheWrite: 10, cost: { total: 0.5 } }, false);
    addReply(totals, { input: 100, output: 1, cost: { total: 0 } }, true);
    addReply(totals, 'not usage', false);
    expect(totals).toEqual({ input: 200, cacheRead: 80, output: 6, cost: 0.5, unpriced: true });
  });
});

describe('spendOf', () => {
  it('counts replies, tool results with usage and custom messages that report usage, nothing else', () => {
    const usage = { input: 1, output: 2, cost: { total: 0.1 } };
    expect(spendOf({ role: 'assistant', usage })?.usage).toBe(usage);
    expect(spendOf({ role: 'toolResult', usage })?.usage).toBe(usage);
    expect(spendOf({ role: 'toolResult' })).toBeUndefined();
    expect(spendOf({ role: 'user', usage })).toBeUndefined();
    // A background report: the run's usage and its unpriced verdict, judged like an `agent` result (no model named).
    const report = spendOf({ role: 'custom', customType: 'octocode-agent-result', details: { usage, unpriced: true } });
    expect(report).toEqual({ role: 'custom', usage, details: { unpriced: true } });
    expect(unpricedModel(report)).toBe('a subagent model');
    expect(spendOf({ role: 'custom', details: { id: 'x' } })).toBeUndefined();
    expect(spendOf(entryMessage({ type: 'custom_message', customType: 'r', details: { usage } }))?.usage).toBe(usage);
    expect(entryMessage({ type: 'label' })).toBeUndefined();
  });
});

describe('Pi version floor', () => {
  it('compares dotted versions and reads the floor of the peer range', () => {
    expect(versionBelow('1.1.0', '1.2.0')).toBe(true);
    expect(versionBelow('1.2.0', '1.2.0')).toBe(false);
    expect(versionBelow('1.10.0', '1.2.0')).toBe(false);
    expect(versionBelow('1.2.0-beta.1', '1.2.0')).toBe(false);
    expect(minimumPiVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

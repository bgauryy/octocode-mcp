import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { atomicWriteFile, atomicWriteFileSync } from '../src/shared/atomic.js';
import { Subcommands, wordCompletions } from '../src/shared/commands.js';
import { envFlag, envInt } from '../src/shared/env.js';
import { dirsToRepoRoot, repoKey, sweepStaleOutputs, workspaceScratchDir } from '../src/shared/home.js';
import { findManifest, packageRoot } from '../src/shared/package.js';
import { killTree, processAlive } from '../src/shared/process.js';
import { capChars, capOutput, clipText, contentText, cutText, settleWithin } from '../src/shared/util.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

describe('settleWithin', () => {
  it('ends on the work, the timeout or an abort, never rejects, and removes its abort listener', async () => {
    const started = Date.now();
    await settleWithin(Promise.reject(new Error('boom')), 5_000);
    await settleWithin(new Promise(() => undefined), 30);
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

  it('resolves one checkout reached through a symlink to one repository', () => {
    const root = tmp('octocode-paths-');
    fs.mkdirSync(path.join(root, '.git'));
    const link = path.join(tmp('octocode-paths-'), 'link');
    fs.symlinkSync(root, link);
    expect(repoKey(link)).toEqual(repoKey(root));
  });
});

describe('workspace scratch', () => {
  it('creates a self-ignoring folder and sweeps stale entries except kept ones', () => {
    const workspace = tmp('octocode-scratch-');
    const dir = workspaceScratchDir(workspace, path.join('agents', 'a-1'));
    expect(dir).toBe(path.join(workspace, '.octocode', 'tmp', 'agents', 'a-1'));
    expect(fs.readFileSync(path.join(workspace, '.octocode', 'tmp', '.gitignore'), 'utf8')).toBe('*\n');
    workspaceScratchDir(workspace, path.join('agents', 'a-2'));
    workspaceScratchDir(workspace, path.join('agents', 'a-3'));
    const root = path.dirname(dir);
    const old = new Date(Date.now() - 10_000);
    for (const name of ['a-1', 'a-2']) fs.utimesSync(path.join(root, name), old, old);
    sweepStaleOutputs(root, 5_000, new Set(['a-2']));
    expect(fs.readdirSync(root).sort()).toEqual(['a-2', 'a-3']);
    expect(() => sweepStaleOutputs(path.join(workspace, 'missing'), 0)).not.toThrow();
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
  });

  it('completes names, then arguments', () => {
    const { command } = setup();
    expect(command.getArgumentCompletions('re').map((item: { value: string }) => item.value)).toEqual(['review ']);
    expect(command.getArgumentCompletions('').map((item: { value: string }) => item.value)).toEqual(['mcp ', 'review ', 'help']);
    expect(command.getArgumentCompletions('review o')).toEqual([
      { value: 'review on', label: 'on', description: 'ask' },
      { value: 'review off', label: 'off' },
    ]);
    expect(command.getArgumentCompletions('mcp x')).toBeNull();
    expect(command.getArgumentCompletions('zz')).toBeNull();
  });
});

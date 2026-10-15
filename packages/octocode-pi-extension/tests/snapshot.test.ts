import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Permission } from '../src/permission/ask.js';
import type { AuditEntry } from '../src/permission/audit.js';
import { pruneSnapshots, takeSnapshot } from '../src/permission/snapshot.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } }).trim();

/** A work tree with one commit, one tracked file edited since, and one untracked file. */
function repo(): string {
  const cwd = fs.realpathSync(tmp());
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.email', 'a@b.c');
  git(cwd, 'config', 'user.name', 'a');
  fs.writeFileSync(path.join(cwd, 'tracked.txt'), 'committed\n');
  fs.writeFileSync(path.join(cwd, 'other.txt'), 'other\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-q', '-m', 'one');
  fs.writeFileSync(path.join(cwd, 'tracked.txt'), 'edited\n');
  fs.writeFileSync(path.join(cwd, 'loose.txt'), 'untracked\n');
  return cwd;
}

const SNAPSHOT_NAMESPACE = 'refs/octocode/snapshots';
const SNAPSHOT_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

describe('snapshots', () => {
  it('keeps a ref that restores a deleted tracked file, and leaves the work tree, index and stash alone', async () => {
    const cwd = repo();
    const status = git(cwd, 'status', '--porcelain');
    const snapshot = await takeSnapshot(cwd);
    expect(snapshot).toHaveProperty('ref');
    const { ref } = snapshot as { ref: string };
    expect(ref.startsWith(`${SNAPSHOT_NAMESPACE}/`)).toBe(true);
    expect(git(cwd, 'status', '--porcelain')).toBe(status);
    expect(git(cwd, 'stash', 'list')).toBe('');
    fs.rmSync(path.join(cwd, 'tracked.txt'));
    git(cwd, 'checkout', ref, '--', 'tracked.txt');
    expect(fs.readFileSync(path.join(cwd, 'tracked.txt'), 'utf8')).toBe('edited\n');
  });

  it('uses HEAD when nothing differs', async () => {
    const cwd = repo();
    git(cwd, 'checkout', '-q', '--', '.');
    const { ref } = (await takeSnapshot(cwd)) as { ref: string };
    expect(git(cwd, 'rev-parse', ref)).toBe(git(cwd, 'rev-parse', 'HEAD'));
  });

  it('says why there is none: not a work tree, no commit, too slow', async () => {
    expect(await takeSnapshot(fs.realpathSync(tmp()))).toEqual({ none: 'not a git work tree' });
    const empty = fs.realpathSync(tmp());
    git(empty, 'init', '-q');
    expect(await takeSnapshot(empty)).toEqual({ none: 'no commit yet' });
    expect(await takeSnapshot(repo(), { timeoutMs: 1 })).toEqual({ none: 'snapshot timed out' });
  });

  it('prunes refs older than seven days and keeps the rest', async () => {
    const cwd = repo();
    const now = Date.now();
    const old = (await takeSnapshot(cwd, { now: now - SNAPSHOT_KEEP_MS - 60_000 })) as { ref: string };
    const fresh = (await takeSnapshot(cwd, { now: now - 1_000 })) as { ref: string };
    expect(await pruneSnapshots(cwd, now)).toBe(1);
    const refs = git(cwd, 'for-each-ref', '--format=%(refname)', `${SNAPSHOT_NAMESPACE}/`).split('\n');
    expect(refs).toEqual([fresh.ref]);
    expect(refs).not.toContain(old.ref);
    expect(await pruneSnapshots(fs.realpathSync(tmp()), now)).toBe(0);
  });
});

describe('a destructive shell call', () => {
  function started(mode: 'full' | 'workspace', cwd: string, options: { snapshotMs?: number } = { snapshotMs: 5_000 }) {
    const fake = fakePi();
    const permission = new Permission({ pi: fake.pi, env: { OCTOCODE_PERMISSION: mode }, isSubagent: false, stderr: () => undefined, ...options });
    const ctx = fakeCtx({ cwd });
    const shown: string[] = [];
    ctx.ui.select = (async (title: string) => (shown.push(title), 'Allow once')) as never;
    permission.start(ctx);
    return { permission, ctx, shown, audit: () => fake.entries.map((entry) => entry.data as AuditEntry) };
  }
  const request = (cwd: string) => ({ action: 'shell.destructive' as const, title: 'Run?', what: ['rm -rf tracked.txt'], cwd });

  it('records the snapshot ref in the audit and the card, and the ref restores the file', async () => {
    const cwd = repo();
    const full = started('full', cwd);
    await full.permission.check(full.ctx, request(cwd));
    const ref = full.audit()[0]!.snapshot!;
    expect(ref).toMatch(/^refs\/octocode\/snapshots\//);
    fs.rmSync(path.join(cwd, 'tracked.txt'));
    git(cwd, 'checkout', ref, '--', 'tracked.txt');
    expect(fs.readFileSync(path.join(cwd, 'tracked.txt'), 'utf8')).toBe('edited\n');
    const asked = started('workspace', cwd);
    await asked.permission.check(asked.ctx, request(cwd));
    expect(asked.shown[0]).toMatch(/▸ undo: snapshot refs\/octocode\/snapshots\/\d+-\d+; git checkout .* -- <path> restores tracked files/);
    expect(asked.shown[0]).toContain(`▸ effect:`);
    expect(asked.audit()[0]!.snapshot).toMatch(/^refs\/octocode\/snapshots\//);
    expect(git(cwd, 'status', '--porcelain')).toContain('loose.txt');
  });

  it('names untracked files the snapshot does not hold', async () => {
    const cwd = repo();
    const asked = started('workspace', cwd);
    await asked.permission.check(asked.ctx, { ...request(cwd), what: ['rm -rf loose.txt'] });
    expect(asked.shown[0]).toContain('▸ risk: 1 untracked or ignored file not in the snapshot');
  });

  it('says undo: none when the snapshot timed out, and still runs the call', async () => {
    const cwd = repo();
    const full = started('full', cwd, { snapshotMs: 1 });
    expect(await full.permission.check(full.ctx, request(cwd))).toEqual({ allowed: true, via: 'mode', lasts: 'call' });
    expect(full.audit()[0]!.snapshot).toBeUndefined();
    const asked = started('workspace', cwd, { snapshotMs: 1 });
    await asked.permission.check(asked.ctx, request(cwd));
    expect(asked.shown[0]).toContain('▸ undo: none (snapshot timed out)');
  });

  it('takes none outside a git work tree and for other classes', async () => {
    const cwd = fs.realpathSync(tmp());
    const full = started('full', cwd);
    await full.permission.check(full.ctx, request(cwd));
    await full.permission.check(full.ctx, { action: 'shell', title: 'Run?', what: ['ls'], cwd: repo() });
    expect(full.audit().map((entry) => entry.snapshot)).toEqual([undefined, undefined]);
  });
});

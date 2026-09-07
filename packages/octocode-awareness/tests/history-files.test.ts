import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureWorkspaceFiles, restoreWorkspaceFile } from '../src/history-files.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'awareness-history-files-'));
  roots.push(root);
  return root;
}

describe('workspace history file primitives', () => {
  it('captures byte-exact regular files, executable mode, and missing files', async () => {
    const root = await workspace();
    await writeFile(join(root, 'a.bin'), Buffer.from([0, 255, 1]));
    await writeFile(join(root, 'run.sh'), '#!/bin/sh\n');
    await chmod(join(root, 'run.sh'), 0o755);
    const result = await captureWorkspaceFiles({ workspace: root, paths: ['a.bin', join(root, 'run.sh'), 'gone'] });
    expect(result.entries.map(entry => [entry.path, entry.status, entry.status === 'captured' ? entry.mode : undefined])).toEqual([
      ['a.bin', 'captured', '100644'], ['run.sh', 'captured', '100755'], ['gone', 'missing', undefined],
    ]);
    expect(result.entries[0]?.status === 'captured' ? result.entries[0].bytes : undefined).toEqual(Buffer.from([0, 255, 1]));
  });

  it('rejects outside paths and omits secrets, generated directories, symlinks, and over-budget bytes', async () => {
    const root = await workspace();
    const outside = join(root, '..', 'outside.txt');
    await writeFile(outside, 'outside');
    roots.push(outside);
    await writeFile(join(root, '.env.local'), 'secret');
    await mkdir(join(root, 'node_modules'));
    await writeFile(join(root, 'node_modules', 'x'), 'generated');
    await symlink(outside, join(root, 'link'));
    await symlink(join(root, '..'), join(root, 'linked-dir'));
    await writeFile(join(root, 'large'), '12345');
    await expect(captureWorkspaceFiles({ workspace: root, paths: [outside] })).rejects.toThrow(/outside workspace/i);
    const result = await captureWorkspaceFiles({ workspace: root, paths: ['.env.local', 'node_modules/x', 'link', 'linked-dir/outside.txt', 'large'], policy: { maxFileBytes: 4 } });
    expect(result.entries.map(entry => [entry.path, entry.status, entry.status === 'omitted' || entry.status === 'unstable' ? entry.reason : undefined])).toEqual([
      ['.env.local', 'omitted', 'excluded'], ['node_modules/x', 'omitted', 'excluded'],
      ['link', 'omitted', 'symlink'], ['linked-dir/outside.txt', 'omitted', 'symlink'],
      ['large', 'omitted', 'file_too_large'],
    ]);
  });

  it('restores atomically only when content, executable mode, and existence match the preview', async () => {
    const root = await workspace();
    await writeFile(join(root, 'a'), 'current');
    const [current] = (await captureWorkspaceFiles({ workspace: root, paths: ['a'] })).entries;
    if (current?.status !== 'captured') throw new Error('fixture capture failed');
    const restored = await restoreWorkspaceFile({ workspace: root, path: 'a', expectedCurrent: current!, target: { status: 'captured', path: 'a', bytes: Buffer.from('old'), mode: '100755' } });
    expect(restored.status).toBe('restored');
    expect(await readFile(join(root, 'a'), 'utf8')).toBe('old');
    expect((await lstat(join(root, 'a'))).mode & 0o111).not.toBe(0);
    await expect(restoreWorkspaceFile({ workspace: root, path: 'a', expectedCurrent: current!, target: { status: 'missing', path: 'a' } })).rejects.toThrow(/stale/i);
  });

  it('uses existence in CAS and can delete an explicitly selected file', async () => {
    const root = await workspace();
    const missing = (await captureWorkspaceFiles({ workspace: root, paths: ['new'] })).entries[0]!;
    if (missing.status !== 'missing') throw new Error('fixture missing capture failed');
    await writeFile(join(root, 'new'), 'raced');
    await expect(restoreWorkspaceFile({ workspace: root, path: 'new', expectedCurrent: missing, target: { status: 'captured', path: 'new', bytes: Buffer.from('x'), mode: '100644' } })).rejects.toThrow(/stale/i);
    const existing = (await captureWorkspaceFiles({ workspace: root, paths: ['new'] })).entries[0]!;
    if (existing.status !== 'captured') throw new Error('fixture existing capture failed');
    await restoreWorkspaceFile({ workspace: root, path: 'new', expectedCurrent: existing, target: { status: 'missing', path: 'new' } });
    await expect(lstat(join(root, 'new'))).rejects.toThrow();
  });

  it('rejects a restore when only executable mode changed after preview', async () => {
    const root = await workspace();
    await writeFile(join(root, 'mode-only'), 'same');
    const preview = (await captureWorkspaceFiles({ workspace: root, paths: ['mode-only'] })).entries[0]!;
    if (preview.status !== 'captured') throw new Error('fixture mode capture failed');
    await chmod(join(root, 'mode-only'), 0o755);
    await expect(restoreWorkspaceFile({ workspace: root, path: 'mode-only', expectedCurrent: preview, target: { status: 'missing', path: 'mode-only' } })).rejects.toThrow(/stale/i);
    expect(await readFile(join(root, 'mode-only'), 'utf8')).toBe('same');
  });

  it('creates missing parent directories for an exact nested-file restore', async () => {
    const root = await workspace();
    const missing = (await captureWorkspaceFiles({ workspace: root, paths: ['nested/deep/file.txt'] })).entries[0]!;
    if (missing.status !== 'missing') throw new Error('fixture missing capture failed');
    const restored = await restoreWorkspaceFile({
      workspace: root,
      path: 'nested/deep/file.txt',
      expectedCurrent: missing,
      target: { path: 'nested/deep/file.txt', status: 'captured', mode: '100644', bytes: Buffer.from('restored') },
    });
    expect(restored).toMatchObject({ path: 'nested/deep/file.txt', status: 'restored', previous: { status: 'missing' }, current: { status: 'captured', size: 8 } });
    expect(await readFile(join(root, 'nested/deep/file.txt'), 'utf8')).toBe('restored');
  });

  it('reports independent file-count and batch-byte omissions without retaining bytes', async () => {
    const root = await workspace();
    await Promise.all([
      writeFile(join(root, 'one'), '123'),
      writeFile(join(root, 'two'), '456'),
      writeFile(join(root, 'three'), '789'),
    ]);
    const countBound = await captureWorkspaceFiles({ workspace: root, paths: ['one', 'two', 'three'], policy: { maxFiles: 2 } });
    expect(countBound.entries.map(entry => [entry.path, entry.status, entry.status === 'omitted' ? entry.reason : null])).toEqual([
      ['one', 'captured', null], ['two', 'captured', null], ['three', 'omitted', 'file_limit'],
    ]);
    expect(countBound.capturedBytes).toBe(6);
    const byteBound = await captureWorkspaceFiles({ workspace: root, paths: ['one', 'two'], policy: { maxBatchBytes: 5 } });
    expect(byteBound.entries.map(entry => [entry.path, entry.status, entry.status === 'omitted' ? entry.reason : null])).toEqual([
      ['one', 'captured', null], ['two', 'omitted', 'batch_too_large'],
    ]);
    expect(byteBound.capturedBytes).toBe(3);
    expect('bytes' in byteBound.entries[1]!).toBe(false);
  });
});

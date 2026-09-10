import { mkdir, mkdtemp, readFile, realpath, rename, rm, truncate, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const injection = vi.hoisted(() => ({ beforeReplace: undefined as undefined | (() => Promise<void>), beforeSnapshot: undefined as undefined | (() => Promise<void>) }));
vi.mock('../src/native-files.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/native-files.js')>();
  return { ...actual, loadNativeFiles: async () => {
    const native = await actual.loadNativeFiles();
    return { ...native, snapshotFile: async (...args: Parameters<typeof native.snapshotFile>) => {
      await injection.beforeSnapshot?.();
      return native.snapshotFile(...args);
    }, replaceFile: async (...args: Parameters<typeof native.replaceFile>) => {
      const callback = injection.beforeReplace;
      injection.beforeReplace = undefined;
      if (callback) await callback();
      return native.replaceFile(...args);
    } };
  } };
});
import { createPrivateHistoryIo } from '../src/history-git-storage.js';

const roots: string[] = [];
afterEach(async () => { injection.beforeReplace = undefined; injection.beforeSnapshot = undefined; await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

it.each(['HEAD', 'config'])('accepts an identical concurrent metadata publication for %s after native precondition loss', async name => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'history-io-race-')));
  roots.push(root);
  const io = await createPrivateHistoryIo(root, root, root);
  const path = join(root, name);
  injection.beforeReplace = () => writeFile(path, 'identical winner');
  await expect(io.writePrivateFile(path, 'identical winner')).resolves.toBeUndefined();
  await io.flush();
});

it('rejects a differing winner and preserves create-only ref collision semantics', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'history-io-race-')));
  roots.push(root);
  const io = await createPrivateHistoryIo(root, root, root);
  const path = join(root, 'HEAD');
  injection.beforeReplace = () => writeFile(path, 'different winner');
  await expect(io.writePrivateFile(path, 'requested')).rejects.toThrow(/PRECONDITION_FAILED/);
  await rm(path);
  injection.beforeReplace = () => writeFile(path, 'identical winner');
  await expect(io.writePrivateFile(path, 'identical winner', true)).rejects.toThrow(/PRECONDITION_FAILED/);
});

it.each([false, true])('revalidates a still-missing target after a peer changes its parent (createOnly=%s)', async createOnly => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'history-io-race-')));
  roots.push(root);
  const io = await createPrivateHistoryIo(root, root, join(root, 'repo.git'));
  const path = join(root, 'new-parent', 'HEAD');
  injection.beforeReplace = async () => {
    await rename(join(root, 'new-parent'), join(root, 'old-parent'));
    await mkdir(join(root, 'new-parent'));
  };
  await expect(io.writePrivateFile(path, 'metadata', createOnly)).resolves.toBeUndefined();
});

it('preserves a differing metadata winner appearing between missing-target retry snapshots', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'history-io-race-')));
  roots.push(root);
  const io = await createPrivateHistoryIo(root, root, join(root, 'repo.git'));
  const parent = join(root, 'new-parent');
  const path = join(parent, 'HEAD');
  injection.beforeReplace = async () => { await rename(parent, join(root, 'old-parent')); await mkdir(parent); };
  let snapshots = 0;
  injection.beforeSnapshot = async () => { if (++snapshots === 3) await writeFile(path, 'different winner'); };
  await expect(io.writePrivateFile(path, 'requested')).rejects.toThrow(/PRECONDITION_FAILED/);
  expect(await readFile(path, 'utf8')).toBe('different winner');
});

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'history-io-errors-')));
  roots.push(root);
  return { root, io: await createPrivateHistoryIo(root, root, root) };
}

it('bounds unstable observation retries and returns only a fresh stable snapshot', async () => {
  const { root, io } = await fixture();
  const path = join(root, 'HEAD');
  await writeFile(path, 'stable');
  let attempts = 0;
  injection.beforeSnapshot = async () => { if (++attempts < 3) throw new Error('PRECONDITION_FAILED: concurrent observation'); };
  expect(await io.readPrivateFile(path)).toEqual(Buffer.from('stable'));
  expect(attempts).toBe(3);
  attempts = 0;
  injection.beforeSnapshot = async () => { attempts++; throw new Error('PRECONDITION_FAILED: never stable'); };
  await expect(io.readPrivateFile(path)).rejects.toThrow(/never stable.*history metadata read/);
  expect(attempts).toBe(4);
});

it('does not retry non-precondition errors or publish after oversized metadata preflight', async () => {
  const { root, io } = await fixture();
  const path = join(root, 'HEAD');
  let attempts = 0;
  injection.beforeReplace = async () => { attempts++; throw new Error('IO_FAILURE: injected write denial'); };
  await expect(io.writePrivateFile(path, 'requested')).rejects.toThrow(/injected write denial/);
  expect(attempts).toBe(1);
  await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
  await writeFile(path, 'sentinel');
  await truncate(path, 17 * 1024 * 1024 + 1);
  await expect(io.writePrivateFile(path, 'requested')).rejects.toThrow(/TOO_LARGE.*history metadata preflight/);
});

it('rejects escaped adapter paths and preserves existing create-only publications', async () => {
  const { root, io } = await fixture();
  await expect(io.readPrivateFile(join(root, '..', 'outside'))).rejects.toThrow(/escaped store/);
  const path = join(root, 'HEAD');
  await io.writePrivateFile(path, 'one', true);
  await expect(io.writePrivateFile(path, 'one', true)).rejects.toMatchObject({ code: 'EEXIST' });
  await io.writePrivateFile(path, 'one');
  expect(await io.readPrivateFile(path, 'utf8')).toBe('one');
});

it('authenticates existing and concurrent object winners without replacing their bytes', async () => {
  const { root, io } = await fixture();
  const raw = Buffer.from('blob 7\0payload');
  const oid = createHash('sha1').update(raw).digest('hex');
  const path = join(root, 'objects', oid.slice(0, 2), oid.slice(2));
  const compressed = deflateSync(raw, { level: 0 });
  injection.beforeReplace = () => writeFile(path, compressed);
  await io.writePrivateFile(path, deflateSync(raw, { level: 9 }));
  expect(await readFile(path)).toEqual(compressed);
  await io.writePrivateFile(path, deflateSync(raw, { level: 9 }));
  expect(await readFile(path)).toEqual(compressed);
  await io.flush();
});

it('refuses a flush barrier when an owned publication has disappeared', async () => {
  const { root, io } = await fixture();
  const path = join(root, 'HEAD');
  await io.writePrivateFile(path, 'one');
  await rm(path);
  await expect(io.flush()).rejects.toThrow(/source_missing.*history metadata flush/);
});

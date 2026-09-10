import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterEach, expect, it } from 'vitest';
import { openHistoryGitStore } from '../src/history-git.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'history-bounded-')));
  roots.push(root);
  const store = await openHistoryGitStore({ historyRoot: root, storeId: 'v1', workspaceId: 'a'.repeat(64) });
  async function object(raw: Buffer, overrideOid?: string) {
    const oid = overrideOid ?? createHash('sha1').update(raw).digest('hex');
    const directory = join(store.gitdir, 'objects', oid.slice(0, 2));
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, oid.slice(2)), deflateSync(raw));
    return oid;
  }
  return { store, object };
}

it('rejects inflated data under an incorrect content-addressed object name', async () => {
  const { store, object } = await fixture();
  const oid = await object(Buffer.from('blob 5\0wrong'), 'b'.repeat(40));
  expect(await store.verifyObject(oid, 'blob')).toBe(false);
  await expect(store.readBlob(oid)).rejects.toThrow(/HISTORY_OBJECT_HASH_MISMATCH/);
});

it.each(['blob 999999999999999999999999\0x', 'blob 1\0long', 'blob 99\0short', 'blob 01\0x'])('rejects malformed Git object framing %j', async raw => {
  const { store, object } = await fixture();
  const oid = await object(Buffer.from(raw));
  await expect(store.readBlob(oid, 8)).rejects.toThrow(/HISTORY_OBJECT_(?:LIMIT|INVALID)/);
});

it('rejects an oversized header before retaining inflated object content', async () => {
  const { store, object } = await fixture();
  const oid = await object(Buffer.concat([Buffer.from('blob 1000000\0'), Buffer.alloc(1000000)]));
  await expect(store.readBlob(oid, 8)).rejects.toThrow(/HISTORY_OBJECT_LIMIT/);
});

it('flushes owned object/ref publications and refuses a replaced archive source', async () => {
  const { store } = await fixture();
  const blob = await store.writeBlob(Buffer.from('archive'));
  const tree = await store.writeTree([{ path: 'a', mode: '100644', oid: blob.oid }]);
  const commit = await store.writeCommit({ tree, message: 'archive' });
  await store.publishRef(`refs/octocode/${'a'.repeat(64)}/before`, commit);
  const receipt = await store.flush();
  expect(receipt.durable).toBe(process.platform !== 'win32');
  expect(receipt.warnings.length > 0).toBe(process.platform === 'win32');
  const again = await store.writeBlob(Buffer.from('archive'));
  const path = join(store.gitdir, 'objects', again.oid.slice(0, 2), again.oid.slice(2));
  await rm(path);
  if (process.platform !== 'win32') {
    await symlink(join(store.gitdir, 'HEAD'), path);
    await expect(store.flush()).rejects.toThrow(/symlink|UNSAFE_PATH/);
  } else {
    await expect(store.flush()).rejects.toThrow(/source_missing/);
  }
});

it('retains an existing valid compression variant byte-for-byte', async () => {
  const { store, object } = await fixture();
  const bytes = Buffer.from('stable');
  const oid = await object(Buffer.concat([Buffer.from('blob 6\0'), bytes]));
  const path = join(store.gitdir, 'objects', oid.slice(0, 2), oid.slice(2));
  const before = await readFile(path);
  await Promise.all(Array.from({ length: 4 }, () => store.writeBlob(bytes)));
  expect(await readFile(path)).toEqual(before);
  await store.flush();
});

it('opens source stores without initialization writes and never creates missing source stores', async () => {
  const { store } = await fixture();
  const blob = await store.writeBlob(Buffer.from('read only'));
  const config = join(store.gitdir, 'config');
  const before = await stat(config);
  const options = { historyRoot: join(store.rootDir, '..', '..'), storeId: 'v1', workspaceId: 'a'.repeat(64), readOnly: true };
  const source = await openHistoryGitStore(options);
  expect(Buffer.from(await source.readBlob(blob.oid)).toString()).toBe('read only');
  expect((await stat(config)).mtimeMs).toBe(before.mtimeMs);
  await expect(source.writeBlob(Buffer.from('no'))).rejects.toThrow(/HISTORY_STORE_READ_ONLY/);
  await expect(source.flush()).rejects.toThrow(/HISTORY_STORE_READ_ONLY/);
  const missingRoot = join(options.historyRoot, 'absent');
  await expect(openHistoryGitStore({ ...options, historyRoot: missingRoot })).rejects.toThrow(/HISTORY_STORE_UNAVAILABLE/);
  await expect(lstat(missingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('rejects authenticated tree modes with high-bit bytes instead of normalizing them to ASCII', async () => {
  const { store, object } = await fixture();
  const blob = await store.writeBlob(Buffer.from('payload'));
  const entry = Buffer.concat([Buffer.from([0xb1, 0x30, 0x30, 0x36, 0x34, 0x34]), Buffer.from(' file\0'), Buffer.from(blob.oid, 'hex')]);
  const tree = await object(Buffer.concat([Buffer.from(`tree ${entry.length}\0`), entry]));
  await expect(store.readTree(tree)).rejects.toThrow(/HISTORY_OBJECT_INVALID/);
});

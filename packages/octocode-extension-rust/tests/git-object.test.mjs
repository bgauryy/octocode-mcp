import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { test } from 'node:test';
import { NativeCancellation, ensurePrivateDirectory, flushFile, readGitObject } from '../index.js';

test('authenticated streaming loose object boundary', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'native-git-object-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'object');
  const raw = Buffer.concat([Buffer.from('blob 180000\0'), Buffer.alloc(180000, 'x')]);
  const oid = createHash('sha1').update(raw).digest('hex');
  const compressed = deflateSync(raw);
  const read = (maximum = 180000, compressedMaximum = compressed.length, timeout = 1000, content = true, cancellation) => readGitObject(path, oid, maximum, compressedMaximum, timeout, content, cancellation);
  await writeFile(path, compressed);
  const durability = await flushFile(path);
  assert.equal(durability.durable, process.platform !== 'win32');
  assert.equal(durability.warnings.length > 0, process.platform === 'win32');
  await ensurePrivateDirectory(join(root, 'private', 'nested'));
  assert.deepEqual(await read(), { objectType: 'blob', size: 180000, content: raw.subarray(raw.indexOf(0) + 1) });
  assert.equal((await read(180000, compressed.length, 1000, false)).content, undefined);
  await assert.rejects(read(179999), /HISTORY_OBJECT_LIMIT/);
  await assert.rejects(read(180000, compressed.length - 1), /HISTORY_OBJECT_LIMIT/);
  await assert.rejects(read(180000, compressed.length, 0), /HISTORY_OBJECT_TIME_LIMIT/);
  const cancelled = new NativeCancellation(); cancelled.cancel();
  await assert.rejects(read(180000, compressed.length, 1000, true, cancelled), /CANCELLED/);
  await assert.rejects(readGitObject(path, 'a'.repeat(40), 180000, compressed.length, 1000), /HISTORY_OBJECT_HASH_MISMATCH/);
  await writeFile(path, compressed.subarray(0, -2));
  await assert.rejects(read(), /HISTORY_OBJECT_INVALID/);
  await writeFile(path, Buffer.concat([compressed, Buffer.from([0])]));
  await assert.rejects(read(180000, compressed.length + 1), /HISTORY_OBJECT_INVALID/);
  for (const malformed of ['blob 1\0long', 'blob 2\0x', 'blob 00\0', 'blob -1\0', 'blob 999999999999999999999999999\0', 'weird 1\0x', 'x'.repeat(70)]) {
    await writeFile(path, deflateSync(Buffer.from(malformed)));
    await assert.rejects(read(180000, 100000), /HISTORY_OBJECT_(INVALID|LIMIT)/);
  }
  if (process.platform !== 'win32') {
    await writeFile(join(root, 'outside'), compressed);
    await rm(path);
    await symlink(join(root, 'outside'), path);
    await assert.rejects(read(), /symlink|UNSAFE_PATH/);
    await assert.rejects(flushFile(path), /symlink|UNSAFE_PATH/);
  }
});

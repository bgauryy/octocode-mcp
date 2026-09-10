import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, statSync, rmSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import native from '../index.cjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'octocode-evidence-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const capture = (root, paths, file = 1048576, batch = 8388608, count = 64, ms = 10000, cancel) =>
  native.fingerprintFiles(root, paths, file, batch, count, ms, cancel);

test('fingerprints preserve exact Awareness v1 bytes, mode, JSON and UTF-16 path ordering', async t => {
  const root = fixture(t);
  const paths = ['z', 'quote"\\\n', '\u{10000}', '\ue000'].filter(name => process.platform !== 'win32' || !name.includes('"')).map(name => join(root, name));
  paths.forEach((path, i) => writeFileSync(path, Buffer.from([0, 255, i, 10]), { mode: 0o640 }));
  const sorted = [...paths].sort();
  const hash = createHash('sha256').update(JSON.stringify(['awareness-evidence-v1:', root]));
  for (const path of sorted) hash.update(JSON.stringify([relative(root, path), statSync(path).mode & 0o777, 4])).update(readFileSync(path));
  const result = await capture(root, [...paths.reverse(), paths[0]]);
  assert.equal(result.fingerprint, `awareness-evidence-v1:${hash.digest('hex')}`);
  assert.deepEqual(result.paths, sorted);
  assert.equal(result.files, paths.length);
  assert.equal(result.bytes, paths.length * 4);
});

test('limits and missing/foreign sources never yield partial fingerprints', async t => {
  const root = fixture(t), a = join(root, 'a'), b = join(root, 'b');
  writeFileSync(a, '1234'); writeFileSync(b, '5678');
  for (const [args, reason] of [
    [[root, [a], 3], 'source_too_large'],
    [[root, [a,b], 4, 7], 'byte_limit'],
    [[root, [a,b], 4, 8, 1], 'reference_limit'],
    [[root, [a], 4, 8, 1, 0], 'time_limit'],
    [[root, [join(root, 'missing')]], 'source_missing'],
    [[root, [root]], 'foreign_source'],
    [[root, [join(root, '..', 'outside')]], 'foreign_source'],
    [[root, []], 'no_file_references'],
  ]) {
    const result = await capture(...args);
    assert.equal(result.reason, reason); assert.equal(result.fingerprint, undefined);
  }
});

test('cancellation reaches snapshot and evidence tasks', async t => {
  const root = fixture(t), path = join(root, 'file'); writeFileSync(path, 'hello');
  const cancellation = new native.NativeCancellation(); cancellation.cancel();
  const result = await capture(root, [path], 10, 10, 1, 1000, cancellation);
  assert.equal(result.reason, 'cancelled'); assert.equal(result.fingerprint, undefined);
  await assert.rejects(native.snapshotFile(path, 10, true, false, cancellation), /CANCELLED/);
});

test('symlink leaves and ancestors cannot become evidence', {skip: process.platform === 'win32'}, async t => {
  const root = fixture(t); mkdirSync(join(root, 'real')); writeFileSync(join(root, 'real', 'a'), 'private');
  symlinkSync(join(root, 'real'), join(root, 'link'));
  symlinkSync(join(root, 'real', 'a'), join(root, 'leaf'));
  for (const path of [join(root, 'link', 'a'), join(root, 'leaf')]) {
    const result = await capture(root, [path]);
    assert.equal(result.reason, 'symlink_source'); assert.equal(result.fingerprint, undefined);
  }
});

test('the aggregate deadline includes time queued behind another libuv worker', t => {
  const root = fixture(t), path = join(root, 'a'); writeFileSync(path, 'hello');
  const program = `
    const native = require(${JSON.stringify(fileURLToPath(new URL('../index.cjs', import.meta.url)))});
    require('node:crypto').pbkdf2('queue', 'salt', 1000000, 32, 'sha256', () => {});
    native.fingerprintFiles(${JSON.stringify(root)}, [${JSON.stringify(path)}], 10, 10, 1, 5)
      .then(result => process.stdout.write(JSON.stringify(result)));
  `;
  const child = spawnSync(process.execPath, ['-e', program], { env: { ...process.env, UV_THREADPOOL_SIZE: '1' }, encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.reason, 'time_limit'); assert.equal(result.files, 0); assert.equal(result.bytes, 0);
  assert.equal(result.fingerprint, undefined);
});

test('invalid numeric and Unicode inputs cannot reach native coercion', async t => {
  const root = fixture(t), path = join(root, 'a'); writeFileSync(path, 'hello');
  for (const value of [-1, 0.1, NaN, Infinity, 4294967296]) {
    await assert.rejects(capture(root, [path], value), /integer/);
  }
  await assert.rejects(capture(root, [path + '\ud800']), /INVALID_PATH/);
  await assert.rejects(capture(root, 'a'), /array/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { platforms, currentPlatform } from '../platforms.cjs';
import { validateBinary, stageBinary } from '../scripts/binary.cjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(join(root, 'index.cjs'), 'utf8');
function load(platform, local = false, broken = false) {
  const calls = [];
  const native = { NativeCancellation: class {} };
  const runtime = { platform: platform.os, arch: platform.arch, report: { getReport: () => ({ header: platform.libc === 'glibc' ? { glibcVersionRuntime: '2.28' } : {} }) } };
  const context = {
    process: runtime, __dirname: root, exports: {}, Buffer,
    require(name) {
      calls.push(name);
      if (name === 'node:path') return { join };
      if (name === 'node:fs') return { existsSync: () => local };
      if (name === './platforms.cjs') return { currentPlatform: () => currentPlatform(runtime) };
      if (broken) throw new Error('damaged binary');
      assert.equal(name, local ? join(root, platform.binary) : platform.packageName);
      return native;
    },
  };
  vm.runInNewContext(source, context);
  assert.equal(context.exports.NativeCancellation, native.NativeCancellation);
  return calls;
}

for (const platform of platforms) {
  test(`loader resolves ${platform.id} optional package and development binary`, () => {
    assert.ok(load(platform).includes(platform.packageName));
    assert.ok(load(platform, true).includes(join(root, platform.binary)));
    assert.throws(() => load(platform, true, true), /NATIVE_UNAVAILABLE/);
  });
}

test('unsupported OS, architecture and missing libc report fail explicitly', () => {
  for (const runtime of [{ platform: 'freebsd', arch: 'x64' }, { platform: 'win32', arch: 'arm64' }, { platform: 'linux', arch: 'x64' }]) {
    assert.throws(() => currentPlatform(runtime), /UNSUPPORTED_PLATFORM/);
  }
});

function header(platform) {
  const bytes = Buffer.alloc(256);
  if (platform.os === 'darwin') {
    bytes.writeUInt32LE(0xfeedfacf, 0); bytes.writeUInt32LE(platform.arch === 'arm64' ? 0x100000c : 0x1000007, 4); bytes.writeUInt32LE(6, 12);
  } else if (platform.os === 'linux') {
    Buffer.from('7f454c460201', 'hex').copy(bytes); bytes.writeUInt16LE(3, 16); bytes.writeUInt16LE(platform.arch === 'arm64' ? 183 : 62, 18);
    bytes.write(platform.libc === 'glibc' ? 'libc.so.6\0' : 'libc.so\0', 80);
  } else {
    bytes.write('MZ'); bytes.writeUInt32LE(128, 0x3c); bytes.writeUInt32LE(0x4550, 128); bytes.writeUInt16LE(0x8664, 132); bytes.writeUInt16LE(0x2000, 150); bytes.writeUInt16LE(0x20b, 152);
  }
  return bytes;
}

test('binary checks reject incorrect architectures, libc variants, executable types and truncated artifacts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'extension-binary-check-'));
  try {
    const path = join(directory, 'input.node');
    for (const platform of platforms) {
      writeFileSync(path, header(platform));
      assert.equal(validateBinary(path, platform), 256);
      for (const wrong of platforms.filter(value => value !== platform)) assert.throws(() => validateBinary(path, wrong), /INVALID_BINARY/);
      const invalid = header(platform); invalid.fill(0, 0, 64); writeFileSync(path, invalid);
      assert.throws(() => validateBinary(path, platform), /INVALID_BINARY/);
    }
    writeFileSync(path, Buffer.alloc(3));
    assert.throws(() => validateBinary(path, platforms[0]), /INVALID_BINARY/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('staging rejects invalid replacement without changing the previous binary', () => {
  const directory = mkdtempSync(join(tmpdir(), 'extension-stage-check-'));
  try {
    const source = join(directory, 'source'); const destination = join(directory, 'current.node');
    writeFileSync(source, header(platforms[0])); stageBinary(source, destination, platforms[0]);
    const before = readFileSync(destination);
    writeFileSync(source, 'invalid');
    assert.throws(() => stageBinary(source, destination, platforms[0]), /INVALID_BINARY/);
    assert.deepEqual(readFileSync(destination), before);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

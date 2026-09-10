"use strict";

const { readFileSync, copyFileSync, renameSync, rmSync, constants } = require('node:fs');
const { randomUUID } = require('node:crypto');

function validateBinary(path, platform) {
  const bytes = readFileSync(path);
  const fail = () => { throw new Error(`INVALID_BINARY: ${path} is not a ${platform.id} native shared library`); };
  if (bytes.length < 64) fail();
  if (platform.os === 'darwin') {
    if (bytes.readUInt32LE(0) !== 0xfeedfacf || bytes.readUInt32LE(4) !== (platform.arch === 'arm64' ? 0x100000c : 0x1000007) || bytes.readUInt32LE(12) !== 6) fail();
  } else if (platform.os === 'linux') {
    if (bytes.subarray(0, 4).toString('hex') !== '7f454c46' || bytes[4] !== 2 || bytes[5] !== 1 || bytes.readUInt16LE(16) !== 3 || bytes.readUInt16LE(18) !== (platform.arch === 'arm64' ? 183 : 62)) fail();
    // GNU and musl share ELF machine IDs; their dynamic libc dependency differs.
    const gnu = bytes.includes(Buffer.from('libc.so.6\0'));
    const musl = bytes.includes(Buffer.from('libc.so\0')) || bytes.includes(Buffer.from('libc.musl-'));
    if (platform.libc === 'glibc' ? !gnu || musl : !musl || gnu) fail();
  } else if (platform.os === 'win32') {
    const offset = bytes.readUInt32LE(0x3c);
    if (bytes.subarray(0, 2).toString() !== 'MZ' || offset > bytes.length - 26 || bytes.readUInt32LE(offset) !== 0x4550 || bytes.readUInt16LE(offset + 4) !== 0x8664 || !(bytes.readUInt16LE(offset + 22) & 0x2000) || bytes.readUInt16LE(offset + 24) !== 0x20b) fail();
  } else fail();
  return bytes.length;
}

function stageBinary(source, destination, platform) {
  validateBinary(source, platform);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  let owned = false;
  try {
    copyFileSync(source, temporary, constants.COPYFILE_EXCL);
    owned = true;
    renameSync(temporary, destination);
  } finally {
    if (owned) rmSync(temporary, { force: true });
  }
}

module.exports = { validateBinary, stageBinary };

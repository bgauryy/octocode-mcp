'use strict';

const { join } = require('node:path');
const { existsSync } = require('node:fs');
const { currentPlatform } = require('./platforms.cjs');
const platform = currentPlatform();
let native;
try {
  const local = join(__dirname, platform.binary);
  native = require(existsSync(local) ? local : platform.packageName);
} catch (cause) {
  throw new Error(`NATIVE_UNAVAILABLE: Cannot load ${platform.binary}. Reinstall @octocodeai/octocode-extension-rust with optional dependencies enabled (${platform.packageName}). Local development builds use the package build script.`, { cause });
}

function maximum(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new TypeError('maxBytes must be an integer between 0 and 4294967295');
  }
  return value;
}

function wellFormedText(value, label, code = 'INVALID_TEXT') {
  if (typeof value !== 'string' || !value.isWellFormed()) {
    throw new TypeError(`${code}: ${label} must be a well-formed Unicode string`);
  }
  return value;
}

const pathText = value => wellFormedText(value, 'path', 'INVALID_PATH');

exports.NativeCancellation = native.NativeCancellation;
exports.flushFile = async (path, cancellation) => native.flushFile(pathText(path), cancellation);
exports.ensurePrivateDirectory = async (path, cancellation) => native.ensurePrivateDirectory(pathText(path), cancellation);
exports.readGitObject = async (path, oid, maxDecodedBytes, maxCompressedBytes, timeoutMs, includeContent = true, cancellation) => {
  if (typeof oid !== 'string' || !/^[0-9a-f]{40}$/.test(oid)) throw new TypeError('HISTORY_OBJECT_INVALID: expected lowercase SHA-1 object id');
  return native.readGitObject(pathText(path), oid, maximum(maxDecodedBytes), maximum(maxCompressedBytes), maximum(timeoutMs), includeContent, cancellation);
};
exports.snapshotFile = async (path, maxBytes, includeContent, allowLeafSymlink = false, cancellation) =>
  native.snapshotFile(pathText(path), maximum(maxBytes), includeContent, allowLeafSymlink, cancellation);
exports.fingerprintFiles = async (root, paths, maxFileBytes, maxBatchBytes, maxFiles, timeoutMs, cancellation) => {
  pathText(root);
  if (!Array.isArray(paths)) throw new TypeError('paths must be an array');
  paths.forEach(pathText);
  return native.fingerprintFiles(root, paths, maximum(maxFileBytes), maximum(maxBatchBytes), maximum(maxFiles), maximum(timeoutMs), cancellation);
};
exports.replaceFile = async (path, content, expectedVersion, maxBytes, createMode, cancellation, parentMode) => {
  pathText(path);
  if (!Buffer.isBuffer(content)) throw new TypeError('content must be a Buffer');
  if (createMode !== undefined && (!Number.isInteger(createMode) || createMode < 0 || createMode > 0o7777)) {
    throw new TypeError('createMode must be an integer between 0 and 4095');
  }
  if (parentMode !== undefined && parentMode !== 0o700) throw new TypeError('parentMode supports only 0700; omit for inherited defaults');
  maximum(maxBytes);
  if (content.length > maxBytes) throw new RangeError(`TOO_LARGE: File exceeds maximum ${maxBytes} bytes`);
  return native.replaceFile(path, content, expectedVersion, maxBytes, createMode, cancellation, parentMode);
};
exports.deleteFile = async (path, expectedVersion, maxBytes, cancellation) =>
  native.deleteFile(pathText(path), expectedVersion, maximum(maxBytes), cancellation);
exports.computeLineDiff = (oldText, newText) =>
  native.computeLineDiff(wellFormedText(oldText, 'oldText'), wellFormedText(newText, 'newText'));
exports.computeLineDiffAsync = async (oldText, newText) =>
  native.computeLineDiffAsync(wellFormedText(oldText, 'oldText'), wellFormedText(newText, 'newText'));
exports.generateDiffArtifactsAsync = async (filePath, oldText, newText) =>
  native.generateDiffArtifactsAsync(pathText(filePath), wellFormedText(oldText, 'oldText'), wellFormedText(newText, 'newText'));
exports.generateDiffArtifacts = (filePath, oldText, newText) =>
  native.generateDiffArtifacts(pathText(filePath), wellFormedText(oldText, 'oldText'), wellFormedText(newText, 'newText'));

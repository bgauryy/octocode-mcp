import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'vitest';
import { NativeCancellation, snapshotFile, replaceFile } from '@octocodeai/octocode-extension-rust';
import type { ToolDefinition } from '../src/types.js';
import { registerFileTool } from '../src/tools/file-tool.js';
import { clearReadStatesForTests } from '../src/tools/file-state.js';
import { MAX_FILE_BYTES } from '../src/tools/native-files.js';

let cwd: string;
let tool: ToolDefinition;

beforeEach(() => {
  cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'native-file-migration-')));
  clearReadStatesForTests();
  registerFileTool({}, new Set(), (_pi, names, definition) => {
    names.add(definition.name);
    tool = definition;
  });
});

afterEach(() => {
  clearReadStatesForTests();
  fs.rmSync(cwd, { recursive: true, force: true });
});

const write = (target: string, content = 'replacement') => ({
  type: 'write', reasoning: 'exercise native file migration', path: target, content,
});
const call = (...queries: Array<Record<string, unknown>>) =>
  tool.execute('native-file-migration', { queries }, undefined, undefined, { cwd });

test('parent swapped to a symlink after preflight cannot redirect an existing write', async () => {
  const parent = path.join(cwd, 'parent');
  const destination = path.join(cwd, 'destination');
  fs.mkdirSync(parent);
  fs.mkdirSync(destination);
  fs.writeFileSync(path.join(parent, 'target'), 'original');
  fs.writeFileSync(path.join(destination, 'target'), 'destination original');
  await assert.rejects(tool.execute('parent-swap', { queries: [write('parent/target')] }, undefined, () => {
    fs.renameSync(parent, path.join(cwd, 'original-parent'));
    fs.symlinkSync(destination, parent);
  }, { cwd }), /changed|preflight|symlink|conflict/i);
  assert.equal(fs.readFileSync(path.join(destination, 'target'), 'utf8'), 'destination original');
  assert.equal(fs.readFileSync(path.join(cwd, 'original-parent', 'target'), 'utf8'), 'original');
  assert.deepEqual(fs.readdirSync(destination), ['target']);
});

test('parent swapped to a symlink after preflight cannot redirect a new-file write', async () => {
  const parent = path.join(cwd, 'parent');
  const destination = path.join(cwd, 'destination');
  fs.mkdirSync(parent);
  fs.mkdirSync(destination);
  await assert.rejects(tool.execute('new-parent-swap', { queries: [write('parent/target')] }, undefined, () => {
    fs.renameSync(parent, path.join(cwd, 'original-parent'));
    fs.symlinkSync(destination, parent);
  }, { cwd }), /changed|preflight|symlink|conflict/i);
  assert.deepEqual(fs.readdirSync(destination), []);
  assert.deepEqual(fs.readdirSync(path.join(cwd, 'original-parent')), []);
});

test('replacing a parent directory after preflight rejects a recreated target with identical bytes', async () => {
  const parent = path.join(cwd, 'parent');
  fs.mkdirSync(parent);
  fs.writeFileSync(path.join(parent, 'target'), 'original');
  await assert.rejects(tool.execute('parent-recreate', { queries: [write('parent/target')] }, undefined, () => {
    fs.renameSync(parent, path.join(cwd, 'original-parent'));
    fs.mkdirSync(parent);
    fs.writeFileSync(path.join(parent, 'target'), 'original');
  }, { cwd }), /changed|preflight|conflict/i);
  assert.equal(fs.readFileSync(path.join(parent, 'target'), 'utf8'), 'original');
  assert.equal(fs.readFileSync(path.join(cwd, 'original-parent', 'target'), 'utf8'), 'original');
  assert.deepEqual(fs.readdirSync(parent), ['target']);
});

test('already-cancelled operations do not create parents or files', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(tool.execute('cancelled', { queries: [write('missing/target')] }, controller.signal, undefined, { cwd }), /abort|cancel/i);
  assert.deepEqual(fs.readdirSync(cwd), []);
});

test('the real native binding rejects a cancelled mutation before commit', async () => {
  const target = path.join(cwd, 'target');
  fs.writeFileSync(target, 'original');
  const snapshot = await snapshotFile(target, MAX_FILE_BYTES, false);
  const cancellation = new NativeCancellation();
  cancellation.cancel();
  await assert.rejects(replaceFile(target, Buffer.from('replacement'), snapshot.version, MAX_FILE_BYTES, undefined, cancellation), /abort|cancel/i);
  assert.equal(fs.readFileSync(target, 'utf8'), 'original');
  assert.deepEqual(fs.readdirSync(cwd), ['target']);
});

test('the real native binding rejects a stale snapshot independently of TypeScript preflight', async () => {
  const target = path.join(cwd, 'target');
  fs.writeFileSync(target, 'original');
  const snapshot = await snapshotFile(target, MAX_FILE_BYTES, true);
  assert.equal(snapshot.content?.toString('utf8'), 'original');
  fs.writeFileSync(target, 'external replacement');
  await assert.rejects(replaceFile(target, Buffer.from('ours'), snapshot.version, MAX_FILE_BYTES), /changed|conflict|stale/i);
  assert.equal(fs.readFileSync(target, 'utf8'), 'external replacement');
  assert.deepEqual(fs.readdirSync(cwd), ['target']);
});

test('the real native binding refuses a parent symlink inserted after snapshot', async () => {
  const parent = path.join(cwd, 'parent');
  const destination = path.join(cwd, 'destination');
  fs.mkdirSync(parent);
  fs.mkdirSync(destination);
  const target = path.join(parent, 'target');
  fs.writeFileSync(target, 'original');
  fs.writeFileSync(path.join(destination, 'target'), 'destination original');
  const snapshot = await snapshotFile(target, MAX_FILE_BYTES, false);
  fs.renameSync(parent, path.join(cwd, 'original-parent'));
  fs.symlinkSync(destination, parent);
  await assert.rejects(replaceFile(target, Buffer.from('replacement'), snapshot.version, MAX_FILE_BYTES), /symbolic|symlink|directory|changed|conflict|loop/i);
  assert.equal(fs.readFileSync(path.join(destination, 'target'), 'utf8'), 'destination original');
  assert.equal(fs.readFileSync(path.join(cwd, 'original-parent', 'target'), 'utf8'), 'original');
  assert.deepEqual(fs.readdirSync(destination), ['target']);
});

test('native-backed write, exact edit, and delete return committed receipts and leave no temporaries', async () => {
  const target = path.join(cwd, 'nested', 'target');
  const source = '\uFEFFalpha\r\nbeta\ngamma\r';
  const created = await call(write(target, source));
  assert.equal((created.details as { committed?: boolean }).committed, true);
  assert.equal(created.isError, undefined);
  assert.equal(fs.readFileSync(target, 'utf8'), source);
  const edited = await call({
    type: 'edit', path: target, reasoning: 'exercise matching above the native boundary',
    requireRecentRead: true, edits: [{ oldText: 'beta', newText: 'BETA' }],
  });
  assert.equal((edited.details as { committed?: boolean }).committed, true);
  assert.equal(edited.isError, undefined);
  assert.equal(fs.readFileSync(target, 'utf8'), '\uFEFFalpha\r\nBETA\ngamma\r');
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ['target']);
  const deleted = await call({ type: 'delete', path: target, reasoning: 'clean the native fixture' });
  assert.equal((deleted.details as { committed?: boolean }).committed, true);
  assert.equal(deleted.isError, undefined);
  assert.deepEqual(fs.readdirSync(path.dirname(target)), []);
});

test.each(['write', 'edit', 'delete'] as const)('oversized existing files fail %s preflight before earlier batch writes', async operation => {
  const target = path.join(cwd, 'oversized');
  const fd = fs.openSync(target, 'wx');
  try {
    fs.ftruncateSync(fd, MAX_FILE_BYTES + 1);
  } finally {
    fs.closeSync(fd);
  }
  const query = operation === 'write' ? write(target) : {
    type: operation, path: target, reasoning: 'exercise bounded native preflight',
    ...(operation === 'edit' ? { edits: [{ oldText: 'original', newText: 'replacement' }] } : {}),
  };
  await assert.rejects(call(write('must-not-exist'), query), /limit|too large|exceed|maximum/i);
  assert.equal(fs.existsSync(path.join(cwd, 'must-not-exist')), false);
  assert.equal(fs.statSync(target).size, MAX_FILE_BYTES + 1);
  assert.deepEqual(fs.readdirSync(cwd), ['oversized']);
});

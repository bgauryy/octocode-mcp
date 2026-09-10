import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as native from '@octocodeai/octocode-extension-rust';
import { captureWorkspaceFiles, restoreWorkspaceFile } from '../src/history-files.js';

vi.mock('@octocodeai/octocode-extension-rust', async importOriginal => {
  const actual = await importOriginal<typeof import('@octocodeai/octocode-extension-rust')>();
  return { ...actual, snapshotFile: vi.fn(actual.snapshotFile), replaceFile: vi.fn(actual.replaceFile) };
});
let root: string;
beforeEach(async () => { root = await realpath(await mkdtemp(join(tmpdir(), 'awareness-native-history-'))); });
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });

async function preview() {
  await writeFile(join(root, 'file'), 'original');
  const value = (await captureWorkspaceFiles({ workspace: root, paths: ['file'] })).entries[0]!;
  if (value.status !== 'captured') throw new Error('fixture failed');
  return value;
}
const target = { path: 'file', status: 'captured' as const, mode: '100644' as const, bytes: Buffer.from('restored') };

test('history restore exposes the committed native durability receipt', async () => {
  const result = await restoreWorkspaceFile({ workspace: root, path: 'file', expectedCurrent: await preview(), target });
  expect(result).toMatchObject({ receipt: { committed: true, durable: process.platform !== 'win32' } });
  expect(await readFile(join(root, 'file'), 'utf8')).toBe('restored');
});

test('a competing edit immediately before native commit survives a stale restore', async () => {
  const expectedCurrent = await preview();
  const actual = await vi.importActual<typeof import('@octocodeai/octocode-extension-rust')>('@octocodeai/octocode-extension-rust');
  vi.mocked(native.replaceFile).mockImplementationOnce(async (...args) => {
    await writeFile(join(root, 'file'), 'competing change');
    return actual.replaceFile(...args);
  });
  await expect(restoreWorkspaceFile({ workspace: root, path: 'file', expectedCurrent, target })).rejects.toThrow(/stale|PRECONDITION_FAILED/i);
  expect(await readFile(join(root, 'file'), 'utf8')).toBe('competing change');
});

test('postcommit recapture failure keeps a committed receipt and warning', async () => {
  const expectedCurrent = await preview();
  const actual = await vi.importActual<typeof import('@octocodeai/octocode-extension-rust')>('@octocodeai/octocode-extension-rust');
  vi.mocked(native.replaceFile).mockImplementationOnce(async (...args) => {
    const receipt = await actual.replaceFile(...args);
    vi.mocked(native.snapshotFile).mockRejectedValueOnce(new Error('recapture unavailable'));
    return receipt;
  });
  const result = await restoreWorkspaceFile({ workspace: root, path: 'file', expectedCurrent, target });
  expect(result).toMatchObject({ receipt: { committed: true } });
  expect(result.warnings.some(warning => warning.includes('recapture unavailable'))).toBe(true);
  expect(result.current).toMatchObject({ status: 'unstable' });
  expect(await readFile(join(root, 'file'), 'utf8')).toBe('restored');
});

test('aggregate capture budget rejects the next file before reading its bytes', async () => {
  await writeFile(join(root, 'small'), '1234567');
  await writeFile(join(root, 'large'), Buffer.alloc(10_000));
  vi.mocked(native.snapshotFile).mockClear();
  const result = await captureWorkspaceFiles({ workspace: root, paths: ['small', 'large'], policy: { maxBatchBytes: 8 } });
  expect(result).toMatchObject({ capturedBytes: 7, entries: [
    { path: 'small', status: 'captured' },
    { path: 'large', status: 'omitted', reason: 'batch_too_large' },
  ] });
  expect(native.snapshotFile).toHaveBeenCalledTimes(1);
  expect(vi.mocked(native.snapshotFile).mock.calls[0]![1]).toBe(8);
});

test('cancellation and malformed Unicode paths fail before native capture', async () => {
  vi.mocked(native.snapshotFile).mockClear();
  await expect(captureWorkspaceFiles({ workspace: root, paths: ['file'], signal: AbortSignal.abort() })).rejects.toThrow();
  await expect(captureWorkspaceFiles({ workspace: root, paths: ['bad\uD800'] })).rejects.toThrow('invalid workspace path');
  expect(native.snapshotFile).not.toHaveBeenCalled();
});

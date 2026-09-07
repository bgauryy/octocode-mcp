import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, realpath, rename, rm, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { HistoryFileMode } from './history-git.js';

export type CaptureOmissionReason = 'excluded' | 'symlink' | 'unsupported_type' | 'file_too_large' | 'batch_too_large' | 'file_limit' | 'unstable';

export type WorkspaceFileSnapshot =
  | { path: string; status: 'captured'; mode: HistoryFileMode; bytes: Uint8Array; digest: string; size: number }
  | { path: string; status: 'missing'; digest: string; size: 0 }
  | { path: string; status: 'omitted' | 'unstable'; reason: CaptureOmissionReason; size?: number };

export interface CapturePolicy {
  maxFiles?: number;
  maxFileBytes?: number;
  maxBatchBytes?: number;
  include?: string[];
}

export interface CaptureWorkspaceFilesOptions {
  workspace: string;
  paths: string[];
  policy?: CapturePolicy;
}

export interface CaptureBatch {
  workspace: string;
  entries: WorkspaceFileSnapshot[];
  capturedBytes: number;
}

export interface RestoreWorkspaceFileOptions {
  workspace: string;
  path: string;
  expectedCurrent: ExpectedWorkspaceFileSnapshot;
  target: RestoreFileTarget;
}

export interface ExpectedWorkspaceFileSnapshot {
  path: string;
  status: 'captured' | 'missing';
  digest: string;
  size: number;
  mode?: HistoryFileMode;
}

export type RestoreFileTarget =
  | { path: string; status: 'captured'; mode: HistoryFileMode; bytes: Uint8Array }
  | { path: string; status: 'missing' };

export interface RestoreWorkspaceFileResult {
  path: string;
  status: 'restored' | 'deleted';
  previous: WorkspaceFileSnapshot;
  current: WorkspaceFileSnapshot;
}

const DEFAULT_MAX_FILES = 200;
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_BATCH_BYTES = 16 * 1024 * 1024;
const MISSING_DIGEST = createHash('sha256').update('octocode:missing\0').digest('hex');
const EXCLUDED_SEGMENTS = new Set(['.git', '.octocode', 'node_modules', 'dist', 'out', 'target']);

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeRelativePath(workspace: string, input: string, workspaceAlias = workspace): { path: string; absolute: string } {
  if (!input || input.includes('\0')) throw new Error(`invalid workspace path: ${JSON.stringify(input)}`);
  let absolute = resolve(workspace, input);
  let rel = relative(workspace, absolute);
  if (isAbsolute(input) && (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))) {
    const aliasRelative = relative(workspaceAlias, resolve(input));
    if (aliasRelative !== '..' && !aliasRelative.startsWith(`..${sep}`) && !isAbsolute(aliasRelative)) {
      rel = aliasRelative;
      absolute = resolve(workspace, aliasRelative);
    }
  }
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    if (!rel) throw new Error('workspace root is not a capturable file');
    throw new Error(`path is outside workspace: ${JSON.stringify(input)}`);
  }
  return { path: rel.split(sep).join('/'), absolute };
}

function isExcluded(path: string, includes: Set<string>): boolean {
  if (includes.has(path)) return false;
  const segments = path.split('/');
  const leaf = segments.at(-1) ?? '';
  return segments.some(segment => EXCLUDED_SEGMENTS.has(segment))
    || /^\.env(?:\.|$)/i.test(leaf)
    || /\.(?:pem|key)$/i.test(leaf);
}

function gitMode(mode: number): HistoryFileMode {
  return (mode & 0o111) === 0 ? '100644' : '100755';
}

function sameStat(a: Awaited<ReturnType<typeof lstat>>, b: Awaited<ReturnType<typeof lstat>>): boolean {
  return String(a.dev) === String(b.dev) && String(a.ino) === String(b.ino)
    && String(a.size) === String(b.size) && String(a.mtimeMs) === String(b.mtimeMs)
    && String(a.mode) === String(b.mode);
}

async function captureOne(
  workspace: string,
  input: string,
  maxFileBytes: number,
  includes: Set<string>,
): Promise<WorkspaceFileSnapshot> {
  const normalized = normalizeRelativePath(workspace, input);
  if (isExcluded(normalized.path, includes)) return { path: normalized.path, status: 'omitted', reason: 'excluded' };
  if (await hasSymlinkAncestor(workspace, normalized.absolute)) {
    return { path: normalized.path, status: 'omitted', reason: 'symlink' };
  }
  let before: Awaited<ReturnType<typeof lstat>>;
  try {
    before = await lstat(normalized.absolute, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path: normalized.path, status: 'missing', digest: MISSING_DIGEST, size: 0 };
    throw error;
  }
  if (before.isSymbolicLink()) return { path: normalized.path, status: 'omitted', reason: 'symlink', size: Number(before.size) };
  if (!before.isFile()) return { path: normalized.path, status: 'omitted', reason: 'unsupported_type', size: Number(before.size) };
  if (before.size > BigInt(maxFileBytes)) return { path: normalized.path, status: 'omitted', reason: 'file_too_large', size: Number(before.size) };
  let bytes: Uint8Array;
  let after: Awaited<ReturnType<typeof lstat>>;
  const handle = await open(normalized.absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameStat(before, opened)) return { path: normalized.path, status: 'unstable', reason: 'unstable' };
    bytes = await handle.readFile();
    after = await handle.stat({ bigint: true });
  } catch {
    return { path: normalized.path, status: 'unstable', reason: 'unstable' };
  } finally {
    await handle.close();
  }
  if (!sameStat(before, after) || bytes.byteLength !== Number(after.size) || await hasSymlinkAncestor(workspace, normalized.absolute)) {
    return { path: normalized.path, status: 'unstable', reason: 'unstable', size: bytes.byteLength };
  }
  return { path: normalized.path, status: 'captured', mode: gitMode(Number(after.mode)), bytes, digest: digest(bytes), size: bytes.byteLength };
}

export async function captureWorkspaceFiles(options: CaptureWorkspaceFilesOptions): Promise<CaptureBatch> {
  const workspaceAlias = resolve(options.workspace);
  const workspace = await realpath(workspaceAlias);
  const maxFiles = options.policy?.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFileBytes = options.policy?.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxBatchBytes = options.policy?.maxBatchBytes ?? DEFAULT_MAX_BATCH_BYTES;
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || !Number.isSafeInteger(maxFileBytes) || maxFileBytes < 0 || !Number.isSafeInteger(maxBatchBytes) || maxBatchBytes < 0) {
    throw new Error('invalid capture budget');
  }
  const includes = new Set((options.policy?.include ?? []).map(value => normalizeRelativePath(workspace, value, workspaceAlias).path));
  const entries: WorkspaceFileSnapshot[] = [];
  const seen = new Set<string>();
  let capturedBytes = 0;
  for (const input of options.paths) {
    const normalized = normalizeRelativePath(workspace, input, workspaceAlias);
    if (seen.has(normalized.path)) continue;
    seen.add(normalized.path);
    if (entries.length >= maxFiles) {
      entries.push({ path: normalized.path, status: 'omitted', reason: 'file_limit' });
      continue;
    }
    const snapshot = await captureOne(workspace, normalized.path, maxFileBytes, includes);
    if (snapshot.status === 'captured' && capturedBytes + snapshot.size > maxBatchBytes) {
      entries.push({ path: snapshot.path, status: 'omitted', reason: 'batch_too_large', size: snapshot.size });
      continue;
    }
    entries.push(snapshot);
    if (snapshot.status === 'captured') capturedBytes += snapshot.size;
  }
  return { workspace, entries, capturedBytes };
}

function equalForCas(actual: WorkspaceFileSnapshot, expected: ExpectedWorkspaceFileSnapshot): boolean {
  if (actual.status !== expected.status || actual.path !== expected.path) return false;
  if (actual.status === 'missing' && expected.status === 'missing') return true;
  if (actual.status === 'captured' && expected.status === 'captured') {
    return actual.digest === expected.digest && actual.mode === expected.mode && actual.size === expected.size;
  }
  return false;
}

async function assertNoSymlinkAncestors(workspace: string, absolute: string): Promise<void> {
  const rel = relative(workspace, dirname(absolute));
  if (!rel) return;
  let cursor = workspace;
  for (const segment of rel.split(sep)) {
    cursor = resolve(cursor, segment);
    try {
      if ((await lstat(cursor)).isSymbolicLink()) throw new Error(`restore path has symlink ancestor: ${cursor}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

async function hasSymlinkAncestor(workspace: string, absolute: string): Promise<boolean> {
  try {
    await assertNoSymlinkAncestors(workspace, absolute);
    return false;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('restore path has symlink ancestor:')) return true;
    throw error;
  }
}

export async function restoreWorkspaceFile(options: RestoreWorkspaceFileOptions): Promise<RestoreWorkspaceFileResult> {
  const workspace = await realpath(resolve(options.workspace));
  const targetPath = normalizeRelativePath(workspace, options.path);
  if (options.expectedCurrent.path !== targetPath.path || options.target.path !== targetPath.path) throw new Error('restore path does not match snapshots');
  if (options.expectedCurrent.status !== 'captured' && options.expectedCurrent.status !== 'missing') {
    throw new Error('omitted or unstable snapshots are not recoverable');
  }
  await assertNoSymlinkAncestors(workspace, targetPath.absolute);
  const actual = (await captureWorkspaceFiles({ workspace, paths: [targetPath.path], policy: { include: [targetPath.path] } })).entries[0]!;
  if (!equalForCas(actual, options.expectedCurrent)) throw new Error(`stale restore preview for ${targetPath.path}`);
  if (options.target.status === 'missing') {
    if (actual.status === 'captured') await unlink(targetPath.absolute);
    return { path: targetPath.path, status: 'deleted', previous: actual, current: { path: targetPath.path, status: 'missing', digest: MISSING_DIGEST, size: 0 } };
  }
  await mkdir(dirname(targetPath.absolute), { recursive: true, mode: 0o700 });
  await assertNoSymlinkAncestors(workspace, targetPath.absolute);
  const temp = resolve(dirname(targetPath.absolute), `.octocode-restore-${randomUUID()}.tmp`);
  const handle = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(options.target.bytes);
    await handle.sync();
    await handle.close();
    await chmod(temp, options.target.mode === '100755' ? 0o755 : 0o644);
    await rename(temp, targetPath.absolute);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
  const current = (await captureWorkspaceFiles({ workspace, paths: [targetPath.path], policy: { include: [targetPath.path] } })).entries[0]!;
  return { path: targetPath.path, status: 'restored', previous: actual, current };
}

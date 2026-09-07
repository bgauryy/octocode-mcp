import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, type Stats } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { InsertMemoryParams, MemoryRecord } from './types/identity-memory.js';

const PREFIX = 'awareness-evidence-v1:';
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_BATCH_BYTES = 8 * MAX_FILE_BYTES;
const MAX_REFERENCES = 64;
const MAX_ELAPSED_MS = 100;

export interface MemoryEvidence {
  state: 'fresh' | 'stale' | 'unknown';
  reason: string;
  reference_count: number;
}

/** One bounded filesystem budget for the whole recall, not one budget per row. */
export function createMemoryEvidenceBudget() {
  return { deadline: performance.now() + MAX_ELAPSED_MS, bytes: 0, files: 0 };
}
type Budget = ReturnType<typeof createMemoryEvidenceBudget>;
type Snapshot = { fingerprint: string; references: string[] } | { reason: string };

function sameFile(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mode === b.mode
    && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

function snapshot(workspace: string, references: string[], budget: Budget): Snapshot {
  if (!references.length) return { reason: 'no_file_references' };
  if (references.length > MAX_REFERENCES) return { reason: 'reference_limit' };
  try {
    const root = realpathSync(workspace);
    const paths = new Set<string>();
    for (const reference of references) {
      if (!reference.startsWith('file:') || reference.startsWith('file://')) return { reason: 'unsupported_reference' };
      const requested = resolve(workspace, reference.slice(5));
      const workspaceRelative = relative(resolve(workspace), requested);
      const local = workspaceRelative === '..' || workspaceRelative.startsWith(`..${sep}`) || isAbsolute(workspaceRelative)
        ? relative(root, requested) : workspaceRelative;
      if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) return { reason: 'foreign_source' };
      const path = resolve(root, local);
      paths.add(path);
    }
    const sortedPaths = [...paths].sort();
    const hash = createHash('sha256').update(JSON.stringify([PREFIX, root]));
    const observed: Array<{ path: string; stat: Stats }> = [];
    for (const path of sortedPaths) {
      if (performance.now() >= budget.deadline) return { reason: 'time_limit' };
      if (++budget.files > MAX_REFERENCES) return { reason: 'reference_limit' };
      // Reject intermediate symlinks as well as final links; never follow a
      // reference into another source tree or a private Git sidecar.
      let parent = root;
      for (const part of relative(root, path).split(sep)) {
        parent = resolve(parent, part);
        if (lstatSync(parent).isSymbolicLink()) return { reason: 'symlink_source' };
      }
      const before = lstatSync(path);
      if (!before.isFile()) return { reason: 'not_regular_file' };
      if (before.size > MAX_FILE_BYTES) return { reason: 'source_too_large' };
      if (budget.bytes + before.size > MAX_BATCH_BYTES) return { reason: 'byte_limit' };
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        if (!sameFile(before, fstatSync(fd)) || realpathSync(path) !== path) return { reason: 'source_changed_during_read' };
        const bytes = Buffer.alloc(before.size + 1);
        let size = 0;
        while (size < bytes.length) {
          if (performance.now() >= budget.deadline) return { reason: 'time_limit' };
          const count = readSync(fd, bytes, size, Math.min(64 * 1024, bytes.length - size), null);
          if (!count) break;
          size += count;
        }
        budget.bytes += size;
        if (size !== before.size || !sameFile(before, fstatSync(fd))) return { reason: 'source_changed_during_read' };
        hash.update(JSON.stringify([relative(root, path), before.mode & 0o777, size]));
        hash.update(bytes.subarray(0, size));
        observed.push({ path, stat: before });
      } finally { closeSync(fd); }
    }
    for (const { path, stat } of observed) {
      if (performance.now() >= budget.deadline) return { reason: 'time_limit' };
      if (realpathSync(path) !== path || !sameFile(stat, lstatSync(path))) return { reason: 'source_changed_during_read' };
    }
    return { fingerprint: PREFIX + hash.digest('hex'), references: sortedPaths.map(path => `file:${path}`) };
  } catch (error) {
    return { reason: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'source_missing' : 'source_inaccessible' };
  }
}

/** Capture before entering a write transaction; partial captures never persist. */
export function prepareMemoryEvidence(params: InsertMemoryParams, workspace = params.workspacePath ?? params.cwd): InsertMemoryParams {
  if (!params.captureFingerprint) return params;
  if (params.fileTreeFingerprint) throw new Error('captureFingerprint cannot be combined with fileTreeFingerprint');
  if (!workspace) throw new Error('Cannot capture memory evidence: workspace_required');
  const referenceBase = params.workspacePath ?? params.cwd ?? workspace;
  const canonicalBase = realpathSync(referenceBase);
  const references = (params.references ?? []).map(reference => {
    if (!reference.startsWith('file:') || reference.startsWith('file://')) return reference;
    const requested = resolve(referenceBase, reference.slice(5));
    const local = relative(resolve(referenceBase), requested);
    return `file:${local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local) ? resolve(canonicalBase, local) : requested}`;
  });
  const result = snapshot(workspace, references, createMemoryEvidenceBudget());
  if ('reason' in result) throw new Error(`Cannot capture memory evidence: ${result.reason}`);
  return { ...params, captureFingerprint: false, fileTreeFingerprint: result.fingerprint, references: result.references };
}

/** Fresh means exact declared bytes/modes still match, never verified truth or dependency completeness. */
export function checkMemoryEvidence(
  memory: Pick<MemoryRecord, 'references' | 'workspace_path' | 'file_tree_fingerprint'>,
  workspace: string | null | undefined,
  check: boolean,
  budget: Budget,
): MemoryEvidence {
  const base = { reference_count: memory.references.length };
  const unknown = (reason: string): MemoryEvidence => ({ ...base, state: 'unknown', reason });
  if (!check) return unknown('unchecked');
  if (!memory.file_tree_fingerprint?.match(/^awareness-evidence-v1:[a-f0-9]{64}$/)) return unknown('no_validated_fingerprint');
  if (!workspace || !memory.workspace_path) return unknown('workspace_required');
  if (performance.now() >= budget.deadline) return unknown('time_limit');
  try {
    if (realpathSync(workspace) !== realpathSync(memory.workspace_path)) return unknown('foreign_workspace');
  } catch { return unknown('workspace_inaccessible'); }
  const result = snapshot(workspace, memory.references, budget);
  if ('reason' in result) return { ...base, state: result.reason === 'source_missing' ? 'stale' : 'unknown', reason: result.reason };
  return result.fingerprint === memory.file_tree_fingerprint
    ? { ...base, state: 'fresh', reason: 'declared_content_matches' }
    : { ...base, state: 'stale', reason: 'content_changed' };
}

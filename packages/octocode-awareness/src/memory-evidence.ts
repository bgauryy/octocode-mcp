import { realpath } from 'node:fs/promises';
import { loadNativeFiles } from './native-files.js';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { InsertMemoryParams, MemoryRecord } from './types/identity-memory.js';

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

async function snapshot(workspace: string, references: string[], budget: Budget): Promise<Snapshot> {
  if (!references.length) return { reason: 'no_file_references' };
  if (references.length > MAX_REFERENCES) return { reason: 'reference_limit' };
  try {
    const root = await realpath(workspace);
    const paths = new Set<string>();
    for (const reference of references) {
      if (!reference.startsWith('file:') || reference.startsWith('file://')) return { reason: 'unsupported_reference' };
      const requested = resolve(workspace, reference.slice(5));
      const workspaceRelative = relative(resolve(workspace), requested);
      const local = workspaceRelative === '..' || workspaceRelative.startsWith(`..${sep}`) || isAbsolute(workspaceRelative)
        ? relative(root, requested) : workspaceRelative;
      if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) return { reason: 'foreign_source' };
      paths.add(resolve(root, local));
    }
    if (performance.now() >= budget.deadline) return { reason: 'time_limit' };
    if (budget.files >= MAX_REFERENCES) return { reason: 'reference_limit' };
    if (budget.bytes >= MAX_BATCH_BYTES) return { reason: 'byte_limit' };
    const native = await loadNativeFiles();
    const remainingMs = Math.floor(budget.deadline - performance.now());
    if (remainingMs <= 0) return { reason: 'time_limit' };
    const result = await native.fingerprintFiles(root, [...paths].sort(), MAX_FILE_BYTES,
      MAX_BATCH_BYTES - budget.bytes, MAX_REFERENCES - budget.files, remainingMs);
    budget.files += result.files;
    budget.bytes += result.bytes;
    if (result.reason) return { reason: result.reason };
    if (performance.now() >= budget.deadline) return { reason: 'time_limit' };
    if (!result.fingerprint) return { reason: 'source_inaccessible' };
    return { fingerprint: result.fingerprint, references: result.paths.map(path => `file:${path}`) };
  } catch (error) {
    return { reason: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'source_missing' : 'source_inaccessible' };
  }
}

/** Capture before entering a write transaction; partial captures never persist. */
export async function prepareMemoryEvidence(params: InsertMemoryParams, workspace = params.workspacePath ?? params.cwd): Promise<InsertMemoryParams> {
  if (!params.captureFingerprint) return params;
  if (params.fileTreeFingerprint) throw new Error('captureFingerprint cannot be combined with fileTreeFingerprint');
  if (!workspace) throw new Error('Cannot capture memory evidence: workspace_required');
  // Native runtime initialization is outside the bounded filesystem operation.
  // The deadline still includes canonicalization, worker queueing and every read.
  try { await loadNativeFiles(); } catch { throw new Error('Cannot capture memory evidence: source_inaccessible'); }
  const budget = createMemoryEvidenceBudget();
  const referenceBase = params.workspacePath ?? params.cwd ?? workspace;
  const canonicalBase = await realpath(referenceBase);
  const references = (params.references ?? []).map(reference => {
    if (!reference.startsWith('file:') || reference.startsWith('file://')) return reference;
    const requested = resolve(referenceBase, reference.slice(5));
    const local = relative(resolve(referenceBase), requested);
    return `file:${local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local) ? resolve(canonicalBase, local) : requested}`;
  });
  const result = await snapshot(workspace, references, budget);
  if ('reason' in result) {
    const hint = result.reason === 'unsupported_reference'
      ? '. capture_fingerprint accepts only workspace-local file:<path> references; use memory store-verified history_ref for an existing Git checkpoint'
      : '';
    throw new Error(`Cannot capture memory evidence: ${result.reason}${hint}`);
  }
  return { ...params, captureFingerprint: false, fileTreeFingerprint: result.fingerprint, references: result.references };
}

/** Fresh means exact declared bytes/modes still match, never verified truth or dependency completeness. */
export async function checkMemoryEvidence(
  memory: Pick<MemoryRecord, 'references' | 'workspace_path' | 'file_tree_fingerprint'>,
  workspace: string | null | undefined,
  check: boolean,
  budget: Budget,
): Promise<MemoryEvidence> {
  const base = { reference_count: memory.references.length };
  const unknown = (reason: string): MemoryEvidence => ({ ...base, state: 'unknown', reason });
  if (!check) return unknown('unchecked');
  if (!memory.file_tree_fingerprint?.match(/^awareness-evidence-v1:[a-f0-9]{64}$/)) return unknown('no_validated_fingerprint');
  if (!workspace || !memory.workspace_path) return unknown('workspace_required');
  if (performance.now() >= budget.deadline) return unknown('time_limit');
  try {
    if (await realpath(workspace) !== await realpath(memory.workspace_path)) return unknown('foreign_workspace');
  } catch { return unknown('workspace_inaccessible'); }
  const result = await snapshot(workspace, memory.references, budget);
  if ('reason' in result) return { ...base, state: result.reason === 'source_missing' ? 'stale' : 'unknown', reason: result.reason };
  return result.fingerprint === memory.file_tree_fingerprint
    ? { ...base, state: 'fresh', reason: 'declared_content_matches' }
    : { ...base, state: 'stale', reason: 'content_changed' };
}

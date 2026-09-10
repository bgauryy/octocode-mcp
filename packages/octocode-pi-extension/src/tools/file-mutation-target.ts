import path from 'node:path';
import type { FileSnapshot } from '@octocodeai/octocode-extension-rust';
import { assertPathAllowed, resolveCanonicalPath } from './path-guard.js';
import { snapshotNativeFile } from './native-files.js';
import { assertWellFormedText } from './file-text.js';

/** Native snapshot plus host path policy; external-writer CAS is not claimed. */
export interface FileMutationTarget {
  requestPath: string;
  absolutePath: string;
  canonicalPath: string;
  cwd: string;
  snapshot: FileSnapshot;
}

export async function prepareFileMutationTarget(
  requestPath: string, cwd: string, allowMissing: boolean, includeContent = false,
): Promise<FileMutationTarget> {
  assertWellFormedText(requestPath, 'path');
  const absolutePath = path.resolve(cwd, requestPath);
  assertPathAllowed(absolutePath, cwd, 'file mutation');
  const canonicalPath = resolveCanonicalPath(absolutePath);
  const snapshot = await snapshotNativeFile(canonicalPath, includeContent);
  if (!allowMissing && !snapshot.exists) throw new Error(`File not found: ${requestPath}`);
  return { requestPath, absolutePath, canonicalPath, cwd, snapshot };
}

/** Revalidate host policy/aliases; Rust rechecks the full snapshot at commit. */
export function assertFileMutationTargetCurrent(target: FileMutationTarget): void {
  assertPathAllowed(target.absolutePath, target.cwd, 'file mutation');
  if (resolveCanonicalPath(target.absolutePath) !== target.canonicalPath) {
    throw new Error(`${target.requestPath} changed after preflight. Re-read the file and retry.`);
  }
}

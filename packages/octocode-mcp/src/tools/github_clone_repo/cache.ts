/**
 * Cache management for cloned repositories.
 *
 * Layout:
 *   ~/.octocode/repos/{owner}/{repo}/{branch}/              ← full clone
 *   ~/.octocode/repos/{owner}/{repo}/{branch}__sp_{hash}/   ← sparse checkout
 *
 * Each clone directory contains a `.octocode-clone-meta.json` file that
 * tracks when the clone was created, when it expires (24 h TTL), and
 * which sparse_path (if any) was fetched.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { CloneCacheMeta, CacheSource } from './types.js';

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

/** Cache time-to-live: 24 hours in milliseconds */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Metadata file stored inside each clone directory */
const META_FILE_NAME = '.octocode-clone-meta.json';

// ─────────────────────────────────────────────────────────────────────
// Path resolution
// ─────────────────────────────────────────────────────────────────────

/**
 * Base directory that holds all cloned repos.
 */
export function getReposBaseDir(octocodeDir: string): string {
  return join(octocodeDir, 'repos');
}

/**
 * Derive a short, filesystem-safe suffix for a sparse path.
 * Returns an empty string for full clones.
 *
 * Example: "packages/core/src" → "__sp_a3f8c1"
 */
function sparseSuffix(sparsePath?: string): string {
  if (!sparsePath) return '';
  const hash = createHash('sha256')
    .update(sparsePath)
    .digest('hex')
    .substring(0, 6);
  return `__sp_${hash}`;
}

/**
 * Resolve the on-disk directory for a specific clone.
 *
 * Full clones:   …/{owner}/{repo}/{branch}/
 * Sparse clones: …/{owner}/{repo}/{branch}__sp_{hash}/
 */
export function getCloneDir(
  octocodeDir: string,
  owner: string,
  repo: string,
  branch: string,
  sparsePath?: string
): string {
  const dirName = `${branch}${sparseSuffix(sparsePath)}`;
  return join(getReposBaseDir(octocodeDir), owner, repo, dirName);
}

// ─────────────────────────────────────────────────────────────────────
// Metadata I/O
// ─────────────────────────────────────────────────────────────────────

/**
 * Read cache metadata. Returns null if absent or corrupt.
 */
export function readCacheMeta(cloneDir: string): CloneCacheMeta | null {
  const metaPath = join(cloneDir, META_FILE_NAME);
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, 'utf-8')) as CloneCacheMeta;
  } catch {
    return null;
  }
}

/**
 * Persist cache metadata to disk.
 * Non-throwing: failures are silently ignored (clone is still usable without meta).
 */
export function writeCacheMeta(cloneDir: string, meta: CloneCacheMeta): void {
  try {
    writeFileSync(
      join(cloneDir, META_FILE_NAME),
      JSON.stringify(meta, null, 2),
      'utf-8'
    );
  } catch {
    // Disk full, permission denied, etc. — clone is still usable,
    // it just won't be cached for next time.
  }
}

// ─────────────────────────────────────────────────────────────────────
// Cache validation
// ─────────────────────────────────────────────────────────────────────

/**
 * Returns true if the cached clone has not expired.
 */
export function isCacheValid(meta: CloneCacheMeta): boolean {
  return Date.now() < new Date(meta.expiresAt).getTime();
}

/**
 * Full cache hit check: meta exists, is not expired, and directory exists on disk.
 * Combining these checks in a single function makes the edge case
 * (valid meta + missing directory) directly testable.
 */
export function isCacheHit(
  cloneDir: string
): { hit: true; meta: CloneCacheMeta } | { hit: false } {
  const meta = readCacheMeta(cloneDir);
  if (!meta) return { hit: false };
  if (!isCacheValid(meta)) return { hit: false };
  if (!existsSync(cloneDir)) return { hit: false };
  return { hit: true, meta };
}

// ─────────────────────────────────────────────────────────────────────
// Cache creation helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Build a fresh metadata object with a 24-hour TTL.
 */
export function createCacheMeta(
  owner: string,
  repo: string,
  branch: string,
  sparsePath?: string,
  source?: CacheSource
): CloneCacheMeta {
  const now = new Date();
  return {
    clonedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CACHE_TTL_MS).toISOString(),
    owner,
    repo,
    branch,
    ...(sparsePath ? { sparse_path: sparsePath } : {}),
    ...(source ? { source } : {}),
  };
}

/**
 * Ensure the parent directory tree exists.
 * Throws on failure (e.g. permission denied) — caller should handle.
 */
export function ensureCloneParentDir(cloneDir: string): void {
  const parent = join(cloneDir, '..');
  try {
    if (!existsSync(parent)) {
      mkdirSync(parent, { recursive: true, mode: 0o700 });
    }
  } catch (error) {
    throw new Error(
      `Failed to create clone parent directory '${parent}': ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Remove an existing clone directory (stale cache / re-clone).
 * Non-throwing: best-effort removal. If it fails, the subsequent
 * git clone may still succeed or produce a clear error.
 */
export function removeCloneDir(cloneDir: string): void {
  try {
    if (existsSync(cloneDir)) {
      rmSync(cloneDir, { recursive: true, force: true });
    }
  } catch {
    // Permission denied, file in use, etc. — best-effort cleanup.
    // The git clone step will fail with a clear error if the dir is unusable.
  }
}

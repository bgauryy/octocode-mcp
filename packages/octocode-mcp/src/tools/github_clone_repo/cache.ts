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
  readdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { CloneCacheMeta, CacheSource } from './types.js';
import { getDirectorySizeBytes } from 'octocode-shared';

/** Default cache TTL: 24 hours in milliseconds */
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** GC sweep interval: 10 minutes in milliseconds */
const GC_INTERVAL_MS = 10 * 60 * 1000;

/** Default maximum on-disk clone cache size: 2 GB */
const DEFAULT_MAX_CACHE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

/** Default maximum number of cached clones */
const DEFAULT_MAX_CLONE_COUNT = 50;

/** Metadata file stored inside each clone directory */
const META_FILE_NAME = '.octocode-clone-meta.json';

/** Handle for the periodic GC interval (null when not running) */
let gcInterval: ReturnType<typeof setInterval> | null = null;

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function parseCacheMeta(raw: unknown): CloneCacheMeta | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.clonedAt !== 'string') return null;
  if (typeof raw.expiresAt !== 'string') return null;
  if (typeof raw.owner !== 'string') return null;
  if (typeof raw.repo !== 'string') return null;
  if (typeof raw.branch !== 'string') return null;
  if (raw.source !== 'clone' && raw.source !== 'directoryFetch') return null;
  const meta: CloneCacheMeta = {
    clonedAt: raw.clonedAt,
    expiresAt: raw.expiresAt,
    owner: raw.owner,
    repo: raw.repo,
    branch: raw.branch,
    source: raw.source,
  };
  if (typeof raw.sparse_path === 'string') meta.sparse_path = raw.sparse_path;
  if (typeof raw.sizeBytes === 'number') meta.sizeBytes = raw.sizeBytes;
  return meta;
}

/** Read cache metadata. Returns null if absent, corrupt, or missing required fields. */
export function readCacheMeta(cloneDir: string): CloneCacheMeta | null {
  const metaPath = join(cloneDir, META_FILE_NAME);
  if (!existsSync(metaPath)) return null;
  try {
    return parseCacheMeta(JSON.parse(readFileSync(metaPath, 'utf-8')));
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
    // Persisting meta is best-effort; clone remains usable without the sidecar file.
  }
}

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

/**
 * Resolve the cache TTL from the environment or fall back to 24 hours.
 * Accepts `OCTOCODE_CACHE_TTL_MS` (positive integer, milliseconds).
 */
export function getCacheTTL(): number {
  const raw = process.env.OCTOCODE_CACHE_TTL_MS;
  if (raw != null) {
    const parsed = Number(raw);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_CACHE_TTL_MS;
}

/**
 * Resolve max cache size from env (bytes).
 * Accepts OCTOCODE_MAX_CACHE_SIZE as a positive integer.
 */
export function getMaxCacheSizeBytes(): number {
  const raw = process.env.OCTOCODE_MAX_CACHE_SIZE;
  if (raw != null) {
    const parsed = Number(raw);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MAX_CACHE_SIZE_BYTES;
}

/**
 * Resolve max clone count from env.
 * Accepts OCTOCODE_MAX_CLONES as a positive integer.
 */
export function getMaxCloneCount(): number {
  const raw = process.env.OCTOCODE_MAX_CLONES;
  if (raw != null) {
    const parsed = Number(raw);
    if (!Number.isNaN(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return DEFAULT_MAX_CLONE_COUNT;
}

/**
 * Build a fresh metadata object with a configurable TTL (default 24 h).
 */
export function createCacheMeta(
  owner: string,
  repo: string,
  branch: string,
  source: CacheSource,
  sparsePath?: string,
  sizeBytes?: number
): CloneCacheMeta {
  const now = new Date();
  return {
    clonedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + getCacheTTL()).toISOString(),
    owner,
    repo,
    branch,
    source,
    ...(sparsePath ? { sparse_path: sparsePath } : {}),
    ...(sizeBytes != null ? { sizeBytes } : {}),
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
    // Best-effort removal before re-clone; a leftover dir may still be overwritten or reported later.
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function listDir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function* walkCloneDirs(reposBase: string): Generator<string> {
  for (const ownerName of listDir(reposBase)) {
    const ownerDir = join(reposBase, ownerName);
    if (!isDir(ownerDir)) continue;
    for (const repoName of listDir(ownerDir)) {
      const repoDir = join(ownerDir, repoName);
      if (!isDir(repoDir)) continue;
      for (const branchName of listDir(repoDir)) {
        const branchDir = join(repoDir, branchName);
        if (isDir(branchDir)) yield branchDir;
      }
    }
  }
}

function cleanupEmptyDirectories(reposBase: string): void {
  for (const ownerName of [...listDir(reposBase)]) {
    const ownerDir = join(reposBase, ownerName);
    if (!isDir(ownerDir)) continue;

    for (const repoName of [...listDir(ownerDir)]) {
      const repoDir = join(ownerDir, repoName);
      if (!isDir(repoDir)) continue;
      if (listDir(repoDir).length === 0) {
        try {
          rmSync(repoDir, { recursive: true, force: true });
        } catch {
          /* best-effort */
        }
      }
    }

    if (listDir(ownerDir).length === 0) {
      try {
        rmSync(ownerDir, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  }
}

function evictExpiredEntries(reposBase: string): number {
  let evicted = 0;
  for (const branchDir of walkCloneDirs(reposBase)) {
    try {
      const meta = readCacheMeta(branchDir);
      if (!meta || !isCacheValid(meta)) {
        rmSync(branchDir, { recursive: true, force: true });
        evicted++;
      }
    } catch {
      /* skip single entry */
    }
  }
  return evicted;
}

interface LiveCacheEntry {
  branchDir: string;
  clonedAtMs: number;
  sizeBytes: number;
}

function collectLiveEntries(reposBase: string): LiveCacheEntry[] {
  const entries: LiveCacheEntry[] = [];
  for (const branchDir of walkCloneDirs(reposBase)) {
    const meta = readCacheMeta(branchDir);
    if (!meta) continue;
    const clonedAtMs = Number.isNaN(Date.parse(meta.clonedAt))
      ? 0
      : Date.parse(meta.clonedAt);
    entries.push({
      branchDir,
      clonedAtMs,
      sizeBytes: meta.sizeBytes ?? getDirectorySizeBytes(branchDir),
    });
  }
  return entries;
}

function evictByCapacity(
  entries: LiveCacheEntry[],
  maxSizeBytes: number,
  maxCloneCount: number
): number {
  let totalSize = entries.reduce((sum, e) => sum + e.sizeBytes, 0);
  let totalCount = entries.length;
  if (totalSize <= maxSizeBytes && totalCount <= maxCloneCount) return 0;

  entries.sort((a, b) => a.clonedAtMs - b.clonedAtMs);
  let evicted = 0;
  for (const entry of entries) {
    if (totalSize <= maxSizeBytes && totalCount <= maxCloneCount) break;
    try {
      rmSync(entry.branchDir, { recursive: true, force: true });
      evicted++;
      totalSize -= entry.sizeBytes;
      totalCount -= 1;
    } catch {
      /* best-effort */
    }
  }
  return evicted;
}

/**
 * Scan all cached clone directories and remove any whose TTL has expired,
 * then enforce capacity limits (max size, max count) via LRU eviction.
 *
 * Non-throwing: best-effort cleanup. Failures for individual entries
 * are silently skipped so one bad directory doesn't block the rest.
 */
export function evictExpiredClones(octocodeDir: string): number {
  const reposBase = getReposBaseDir(octocodeDir);
  if (!existsSync(reposBase)) return 0;

  let evicted = 0;
  try {
    evicted += evictExpiredEntries(reposBase);
  } catch {
    return evicted;
  }

  cleanupEmptyDirectories(reposBase);

  const lruEvicted = evictByCapacity(
    collectLiveEntries(reposBase),
    getMaxCacheSizeBytes(),
    getMaxCloneCount()
  );
  evicted += lruEvicted;

  if (lruEvicted > 0) cleanupEmptyDirectories(reposBase);

  return evicted;
}

/**
 * Start a periodic sweep that evicts expired clones every 10 minutes.
 * Runs one immediate eviction on start, then schedules the interval.
 * The timer is unref'd so it won't keep the process alive.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startCacheGC(octocodeDir: string): void {
  if (gcInterval) return;

  evictExpiredClones(octocodeDir);

  gcInterval = setInterval(() => {
    evictExpiredClones(octocodeDir);
  }, GC_INTERVAL_MS);

  gcInterval.unref();
}

/**
 * Stop the periodic GC sweep. Safe to call even if GC was never started.
 */
export function stopCacheGC(): void {
  if (gcInterval) {
    clearInterval(gcInterval);
    gcInterval = null;
  }
}

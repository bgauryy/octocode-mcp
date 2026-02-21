/**
 * Types for the githubCloneRepo tool.
 *
 * Supports two modes:
 *   1. **Full shallow clone** – `git clone --depth 1` of the entire repo.
 *   2. **Partial tree fetch** – sparse checkout of specific paths only,
 *      dramatically reducing download size for large monorepos.
 *
 * Both modes cache results for 24 hours under ~/.octocode/repos/.
 */

// ─────────────────────────────────────────────────────────────────────
// Query
// ─────────────────────────────────────────────────────────────────────

/**
 * Single query for cloning / fetching a repository.
 */
export interface CloneRepoQuery {
  /** High-level research goal driving the clone */
  mainResearchGoal: string;
  /** Specific research goal for this query */
  researchGoal: string;
  /** Reasoning for choosing this approach */
  reasoning: string;
  /** Repository owner or organisation (e.g. "facebook") */
  owner: string;
  /** Repository name (e.g. "react") */
  repo: string;
  /** Branch to clone – omit to use the repo's default branch */
  branch?: string;
  /**
   * When set, only fetch this subdirectory (sparse checkout).
   * Uses `git sparse-checkout` so only matching blobs are downloaded.
   * Dramatically faster for large monorepos.
   *
   * Examples: "src/compiler", "packages/core", "lib"
   */
  sparse_path?: string;
  /**
   * When true, bypass the cache and force a fresh clone/fetch
   * even if a valid cached copy exists.
   */
  forceRefresh?: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Cache metadata
// ─────────────────────────────────────────────────────────────────────

/**
 * Metadata persisted alongside a cloned repo for cache management.
 * Stored as `.octocode-clone-meta.json` inside the clone directory.
 */
/**
 * Source of the cached content.
 *
 * - `'clone'`          — full or sparse git clone (complete for its scope)
 * - `'directoryFetch'` — HTTP directory fetch (only specific paths exist on disk)
 *
 * Older metadata without `source` is treated as `'clone'` for backward compat.
 */
export type CacheSource = 'clone' | 'directoryFetch';

export interface CloneCacheMeta {
  /** ISO-8601 timestamp of when the clone was created */
  clonedAt: string;
  /** ISO-8601 timestamp of when the cache expires */
  expiresAt: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Branch that was cloned */
  branch: string;
  /**
   * Sparse path that was checked out (undefined = full clone).
   * Used as part of the cache key so a full clone and a partial
   * fetch of the same repo can coexist.
   */
  sparse_path?: string;
  /**
   * Source of the cached content. Defaults to 'clone' for backward compat.
   * Used to prevent directoryFetch cache from being treated as a full clone.
   */
  source?: CacheSource;
}

// ─────────────────────────────────────────────────────────────────────
// Result
// ─────────────────────────────────────────────────────────────────────

/**
 * Result returned for a single clone / fetch query.
 */
export interface CloneRepoResult {
  /** Absolute path to the cloned repository on disk */
  localPath: string;
  /** Whether the result was served from a valid (non-expired) cache (internal, not in user-facing response) */
  cached: boolean;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Branch that was cloned */
  branch: string;
  /** Sparse path fetched (undefined = full clone) */
  sparse_path?: string;
}

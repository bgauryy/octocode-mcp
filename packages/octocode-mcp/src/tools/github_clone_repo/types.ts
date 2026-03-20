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

import type {
  GitHubCloneRepoData,
  GitHubCloneRepoToolResult,
} from '../../scheme/outputTypes.js';

/**
 * Single query for cloning / fetching a repository.
 */
export interface CloneRepoQuery {
  /** Stable query identifier for mapping this query to its response result */
  id?: string;
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
  /** Character offset for output pagination */
  charOffset?: number;
  /** Character budget for output pagination */
  charLength?: number;
}

/** How this cache entry was produced (clone vs directory API fetch). */
export type CacheSource = 'clone' | 'directoryFetch';

/** Metadata in `.octocode-clone-meta.json` beside each cached repo directory. */
export interface CloneCacheMeta {
  clonedAt: string;
  expiresAt: string;
  owner: string;
  repo: string;
  branch: string;
  sparse_path?: string;
  source: CacheSource;
  /** Approximate on-disk size in bytes, recorded at clone time for fast GC. */
  sizeBytes?: number;
}

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

/** Final user-facing success data derived from the output schema */
export type CloneRepoOutputData = GitHubCloneRepoData;

/** Final user-facing flattened query result derived from the output schema */
export type CloneRepoToolResult = GitHubCloneRepoToolResult;

/**
 * Types for github_view_repo_structure tool (githubViewRepoStructure)
 * @module tools/github_view_repo_structure/types
 */

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for viewing repository structure
 */
export interface GitHubViewRepoStructureQuery {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
  depth?: number;
  entriesPerPage?: number;
  entryPageNumber?: number;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

/** Base result interface */
interface BaseToolResult<TQuery = object> {
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  error?: string;
  hints?: string[];
  query?: TQuery;
}

/** Directory entry with files and folders grouped together */
export interface DirectoryEntry {
  files: string[];
  folders: string[];
}

/**
 * Repository structure result data - optimized format.
 * Groups files by parent directory to eliminate path repetition.
 * Keys are relative directory paths (e.g., ".", "src", "src/utils").
 */
export interface RepoStructureResultData {
  owner?: string;
  repo?: string;
  branch?: string;
  /** Base path that was queried */
  path?: string;
  /** Structure grouped by directory - keys are relative paths */
  structure?: Record<string, DirectoryEntry>;
}

/** Complete repository structure result */
export interface RepoStructureResult
  extends
    BaseToolResult<GitHubViewRepoStructureQuery>,
    RepoStructureResultData {}

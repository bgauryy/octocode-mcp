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
  id?: string;
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
interface BaseToolResult {
  error?: string;
  hints?: string[];
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
  /** Resolved branch when the input omitted a branch and the provider filled one in */
  resolvedBranch?: string;
  branchFallback?: {
    requestedBranch: string;
    actualBranch: string;
    defaultBranch?: string;
    warning: string;
  };
  /** Structure grouped by directory - keys are relative paths */
  structure?: Record<string, DirectoryEntry>;
  summary?: Record<string, unknown>;
}

/** Complete repository structure result */
export interface RepoStructureResult
  extends
    BaseToolResult,
    RepoStructureResultData {}

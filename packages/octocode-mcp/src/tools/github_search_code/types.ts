/**
 * Types for github_search_code tool (githubSearchCode)
 * @module tools/github_search_code/types
 */

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for GitHub code search
 */
export interface GitHubCodeSearchQuery {
  keywordsToSearch: string[];
  owner?: string;
  repo?: string;
  extension?: string;
  filename?: string;
  path?: string;
  match?: 'file' | 'path';
  limit?: number;
  page?: number;
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

/**
 * Code search result with matched files.
 * - For content matches: includes text_matches with matched code snippets
 * - For path-only matches: only includes path (no text_matches)
 * - Each file includes repo (owner/repo) for direct use with githubGetFileContent
 */
export interface SearchResult extends BaseToolResult<GitHubCodeSearchQuery> {
  /** Array of matched files with their paths and optional text matches */
  files?: Array<{
    /** File path within the repository */
    path: string;
    /** Repository in owner/repo format - use this for githubGetFileContent */
    repo?: string;
    /** Matched code snippets (only for match="file") */
    text_matches?: string[];
    /** File last modified timestamp */
    lastModifiedAt?: string;
  }>;
  /** When all files are from the same repo, this provides the owner, repo, and branch separately */
  repositoryContext?: {
    owner: string;
    repo: string;
    /** Default branch of the repository (for use with githubGetFileContent) */
    branch?: string;
  };
  /** Pagination info for navigating through results */
  pagination?: {
    /** Current page number (1-based) */
    currentPage: number;
    /** Total number of available pages */
    totalPages: number;
    /** Number of results per page */
    perPage: number;
    /** Total number of matching results (capped at 1000 by GitHub) */
    totalMatches: number;
    /** Whether more pages are available */
    hasMore: boolean;
  };
}

/**
 * Types for github_search_repos tool (githubSearchRepositories)
 * @module tools/github_search_repos/types
 */

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for searching GitHub repositories
 */
export interface GitHubReposSearchQuery {
  keywordsToSearch?: string[];
  topicsToSearch?: string[];
  owner?: string;
  stars?: string;
  size?: string;
  created?: string;
  updated?: string;
  match?: Array<'name' | 'description' | 'readme'>;
  sort?: 'forks' | 'stars' | 'updated' | 'best-match';
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

/** Simplified repository metadata */
export interface SimplifiedRepository {
  owner: string;
  repo: string;
  defaultBranch?: string;
  stars: number;
  description: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  /** Repository visibility: public, private, or internal */
  visibility?: string;
  /** Array of topic tags (only included if repository has topics) */
  topics?: string[];
  /** Number of forks (only included if > 0) */
  forksCount?: number;
  /** Number of open issues (only included if > 0) */
  openIssuesCount?: number;
}

/** Repository search result */
export interface RepoSearchResult extends BaseToolResult<GitHubReposSearchQuery> {
  repositories: SimplifiedRepository[];
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

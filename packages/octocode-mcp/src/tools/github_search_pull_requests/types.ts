/**
 * Types for github_search_pull_requests tool (githubSearchPullRequests)
 * @module tools/github_search_pull_requests/types
 */

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for searching pull requests
 */
export interface GitHubPullRequestSearchQuery {
  query?: string;
  owner?: string;
  repo?: string;
  prNumber?: number;
  state?: 'open' | 'closed';
  assignee?: string;
  author?: string;
  commenter?: string;
  involves?: string;
  mentions?: string;
  'review-requested'?: string;
  'reviewed-by'?: string;
  label?: string | string[];
  'no-label'?: boolean;
  'no-milestone'?: boolean;
  'no-project'?: boolean;
  'no-assignee'?: boolean;
  head?: string;
  base?: string;
  created?: string;
  updated?: string;
  closed?: string;
  'merged-at'?: string;
  comments?: number | string;
  reactions?: number | string;
  interactions?: number | string;
  merged?: boolean;
  draft?: boolean;
  match?: Array<'title' | 'body' | 'comments'>;
  sort?: 'created' | 'updated' | 'best-match';
  order?: 'asc' | 'desc';
  limit?: number;
  page?: number;
  withComments?: boolean;
  withCommits?: boolean;
  type?: 'metadata' | 'fullContent' | 'partialContent';
  partialContentMetadata?: {
    file: string;
    additions?: number[];
    deletions?: number[];
  }[];
  charOffset?: number;
  charLength?: number;
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

/** Detailed pull request information */
export interface PullRequestInfo {
  id?: number;
  number: number;
  title: string;
  url: string;
  html_url?: string;
  state: 'open' | 'closed';
  draft: boolean;
  merged: boolean;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  merged_at?: string;
  author: string;
  assignees?: Array<{
    login: string;
    id: number;
    avatar_url: string;
    html_url: string;
  }>;
  labels?: Array<{
    id: number;
    name: string;
    color: string;
    description?: string;
  }>;
  milestone?: {
    id: number;
    title: string;
    description?: string;
    state: 'open' | 'closed';
    created_at: string;
    updated_at: string;
    due_on?: string;
  };
  head_ref: string;
  head_sha: string;
  base_ref: string;
  base_sha: string;
  body?: string;
  comments?: number;
  review_comments?: number;
  commits?: number;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  comment_details?: Array<{
    id: string;
    user: string;
    body: string;
    created_at: string;
    updated_at: string;
  }>;
  file_changes?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes?: number;
    patch?: string;
  }>;
  commit_details?: Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
    files: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      changes?: number;
      patch?: string;
    }>;
  }>;
}

/** Pagination info for pull request search results */
export interface PRSearchPagination {
  currentPage: number;
  totalPages: number;
  perPage: number;
  totalMatches: number;
  hasMore: boolean;
}

/** Pull request search result data */
export interface PullRequestSearchResultData {
  owner?: string;
  repo?: string;
  pull_requests?: PullRequestInfo[];
  total_count?: number;
  incomplete_results?: boolean;
  pagination?: PRSearchPagination;
  /** Character-based output pagination (when output exceeds size limit) */
  outputPagination?: {
    charOffset: number;
    charLength: number;
    totalChars: number;
    hasMore: boolean;
    currentPage: number;
    totalPages: number;
  };
}

/** Complete pull request search result */
export interface PullRequestSearchResult
  extends
    BaseToolResult<GitHubPullRequestSearchQuery>,
    PullRequestSearchResultData {}

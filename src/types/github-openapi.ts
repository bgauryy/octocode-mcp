/**
 * GitHub API Types using Octokit's OpenAPI Types
 *
 * This file provides type-safe interfaces using @octokit/openapi-types
 * for better type safety, IntelliSense, and API consistency.
 */

import type { components } from '@octokit/openapi-types';
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

// ============================================================================
// CORE COMPONENT TYPES
// ============================================================================

// Repository types
export type Repository = components['schemas']['repository'];
export type RepositorySimple = components['schemas']['repository'];

// User types
export type SimpleUser = components['schemas']['simple-user'];
export type PrivateUser = components['schemas']['private-user'];
export type PublicUser = components['schemas']['public-user'];

// Issue types
export type Issue = components['schemas']['issue'];

// Pull Request types
export type PullRequest = components['schemas']['pull-request'];

// Commit types
export type Commit = components['schemas']['commit'];

// Content types
export type ContentFile = components['schemas']['content-file'];
export type ContentDirectory = components['schemas']['content-directory'];
export type ContentSymlink = components['schemas']['content-symlink'];
export type ContentSubmodule = components['schemas']['content-submodule'];

// Search types
export type CodeSearchResultItem =
  components['schemas']['code-search-result-item'];
export type RepoSearchResultItem =
  components['schemas']['repo-search-result-item'];
export type IssueSearchResultItem =
  components['schemas']['issue-search-result-item'];
export type CommitSearchResultItem =
  components['schemas']['commit-search-result-item'];

// ============================================================================
// API OPERATION TYPES
// ============================================================================

// Search API types
export type SearchCodeParameters =
  RestEndpointMethodTypes['search']['code']['parameters'];
export type SearchCodeResponse =
  RestEndpointMethodTypes['search']['code']['response'];

export type SearchReposParameters =
  RestEndpointMethodTypes['search']['repos']['parameters'];
export type SearchReposResponse =
  RestEndpointMethodTypes['search']['repos']['response'];

export type SearchIssuesParameters =
  RestEndpointMethodTypes['search']['issuesAndPullRequests']['parameters'];
export type SearchIssuesResponse =
  RestEndpointMethodTypes['search']['issuesAndPullRequests']['response'];

export type SearchCommitsParameters =
  RestEndpointMethodTypes['search']['commits']['parameters'];
export type SearchCommitsResponse =
  RestEndpointMethodTypes['search']['commits']['response'];

// Repository API types
export type GetRepoParameters =
  RestEndpointMethodTypes['repos']['get']['parameters'];
export type GetRepoResponse =
  RestEndpointMethodTypes['repos']['get']['response'];

export type GetContentParameters =
  RestEndpointMethodTypes['repos']['getContent']['parameters'];
export type GetContentResponse =
  RestEndpointMethodTypes['repos']['getContent']['response'];

export type GetCommitParameters =
  RestEndpointMethodTypes['repos']['getCommit']['parameters'];
export type GetCommitResponse =
  RestEndpointMethodTypes['repos']['getCommit']['response'];

// Pull Request API types
export type GetPullRequestParameters =
  RestEndpointMethodTypes['pulls']['get']['parameters'];
export type GetPullRequestResponse =
  RestEndpointMethodTypes['pulls']['get']['response'];

export type ListPullRequestsParameters =
  RestEndpointMethodTypes['pulls']['list']['parameters'];
export type ListPullRequestsResponse =
  RestEndpointMethodTypes['pulls']['list']['response'];

export type ListPullRequestCommitsParameters =
  RestEndpointMethodTypes['pulls']['listCommits']['parameters'];
export type ListPullRequestCommitsResponse =
  RestEndpointMethodTypes['pulls']['listCommits']['response'];

// Issues API types
export type ListIssueCommentsParameters =
  RestEndpointMethodTypes['issues']['listComments']['parameters'];
export type ListIssueCommentsResponse =
  RestEndpointMethodTypes['issues']['listComments']['response'];

// Users API types
export type GetAuthenticatedUserResponse =
  RestEndpointMethodTypes['users']['getAuthenticated']['response'];

// ============================================================================
// ENUM TYPES
// ============================================================================

// Sort orders
export type SortOrder = 'asc' | 'desc';

// Search sort options
export type SearchCodeSort = 'indexed' | 'best-match';
export type SearchReposSort =
  | 'stars'
  | 'forks'
  | 'help-wanted-issues'
  | 'updated';
export type SearchIssuesSort =
  | 'comments'
  | 'reactions'
  | 'reactions-+1'
  | 'reactions--1'
  | 'reactions-smile'
  | 'reactions-thinking_face'
  | 'reactions-heart'
  | 'reactions-tada'
  | 'interactions'
  | 'author-date'
  | 'committer-date'
  | 'created'
  | 'updated'
  | 'best-match';
export type SearchCommitsSort = 'author-date' | 'committer-date';

// Issue states
export type IssueState = 'open' | 'closed' | 'all';

// Pull request states
export type PullRequestState = 'open' | 'closed' | 'all';

// Repository visibility
export type RepositoryVisibility = 'public' | 'private' | 'internal';

// Content types
export type ContentType = 'file' | 'dir' | 'symlink' | 'submodule';

// ============================================================================
// UTILITY TYPES
// ============================================================================

// Extract response data types
export type SearchCodeData = SearchCodeResponse['data'];
export type SearchReposData = SearchReposResponse['data'];
export type SearchIssuesData = SearchIssuesResponse['data'];
export type SearchCommitsData = SearchCommitsResponse['data'];

// Extract items from search responses
export type SearchCodeItems = SearchCodeData['items'];
export type SearchReposItems = SearchReposData['items'];
export type SearchIssuesItems = SearchIssuesData['items'];
export type SearchCommitsItems = SearchCommitsData['items'];

// ============================================================================
// ENHANCED TYPES FOR OUR USE CASES
// ============================================================================

// Enhanced search result with metadata
export interface EnhancedSearchResult<T> {
  total_count: number;
  incomplete_results: boolean;
  items: T[];
  _metadata?: {
    rateLimitRemaining?: number;
    rateLimitReset?: number;
    searchType?: string;
    queryArgs?: Record<string, unknown>;
  };
}

// Type-safe error response
export interface GitHubAPIError {
  error: string;
  status?: number;
  type: 'http' | 'graphql' | 'network' | 'unknown';
  scopesSuggestion?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  retryAfter?: number;
}

// Type-safe success response
export interface GitHubAPISuccess<T> {
  data: T;
  status: number;
  headers?: Record<string, string>;
}

// Union type for API responses
export type GitHubAPIResponse<T> = GitHubAPISuccess<T> | GitHubAPIError;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if an object is a GitHub API error
 */
export function isGitHubAPIError(obj: any): obj is GitHubAPIError {
  return obj && typeof obj.error === 'string' && obj.type;
}

/**
 * Type guard to check if an object is a GitHub API success response
 */
export function isGitHubAPISuccess<T>(obj: any): obj is GitHubAPISuccess<T> {
  return obj && obj.data !== undefined && typeof obj.status === 'number';
}

/**
 * Type guard to check if an object is a repository
 */
export function isRepository(obj: any): obj is Repository {
  return (
    obj &&
    typeof obj.id === 'number' &&
    typeof obj.name === 'string' &&
    typeof obj.full_name === 'string' &&
    typeof obj.private === 'boolean'
  );
}

/**
 * Type guard to check if an object is a user
 */
export function isUser(obj: any): obj is SimpleUser {
  return (
    obj &&
    typeof obj.login === 'string' &&
    typeof obj.id === 'number' &&
    typeof obj.type === 'string'
  );
}

/**
 * Type guard to check if an object is a search result item
 */
export function isSearchResultItem(obj: any): obj is CodeSearchResultItem {
  return (
    obj &&
    typeof obj.name === 'string' &&
    typeof obj.path === 'string' &&
    typeof obj.sha === 'string' &&
    obj.repository
  );
}

// ============================================================================
// HELPER TYPES FOR PARAMETER BUILDING
// ============================================================================

// Type-safe parameter builders
export interface SearchCodeOptions {
  language?: string;
  sort?: SearchCodeSort;
  order?: SortOrder;
  per_page?: number;
  page?: number;
}

export interface SearchReposOptions {
  language?: string;
  sort?: SearchReposSort;
  order?: SortOrder;
  per_page?: number;
  page?: number;
  stars?: string;
  forks?: string;
  created?: string;
  pushed?: string;
}

export interface SearchIssuesOptions {
  state?: IssueState;
  sort?: SearchIssuesSort;
  order?: SortOrder;
  per_page?: number;
  page?: number;
  labels?: string[];
  assignee?: string;
  author?: string;
}

// ============================================================================
// EXTENDED TYPES FOR CUSTOM PARAMETERS
// ============================================================================

// Extended search parameters with our custom fields
export interface GitHubCommitSearchParams {
  // Base search parameters
  q?: string;
  sort?: SearchCommitsSort;
  order?: SortOrder;
  per_page?: number;
  page?: number;

  // Our custom fields
  researchGoal?: string;
  queryTerms?: string[];
  orTerms?: string[];
  exactQuery?: string;
  owner?: string;
  repo?: string;
  author?: string;
  'author-name'?: string;
  'author-email'?: string;
  committer?: string;
  'committer-name'?: string;
  'committer-email'?: string;
  'author-date'?: string;
  'committer-date'?: string;
  hash?: string;
  parent?: string;
  tree?: string;
  merge?: boolean;
  visibility?: RepositoryVisibility;
  getChangesContent?: boolean;
  exhaustive?: boolean;
  maxPages?: number;
  pageSize?: number;
  limit?: number;
}

export interface GitHubPullRequestsSearchParams {
  // Base search parameters
  q?: string;
  sort?: SearchIssuesSort;
  order?: SortOrder;
  per_page?: number;
  page?: number;

  // Our custom fields
  researchGoal?: string;
  query?: string;
  owner?: string | string[];
  repo?: string | string[];
  prNumber?: number;
  state?: 'open' | 'closed';
  draft?: boolean;
  merged?: boolean;
  locked?: boolean;
  author?: string;
  assignee?: string;
  mentions?: string;
  commenter?: string;
  involves?: string;
  'reviewed-by'?: string;
  'review-requested'?: string;
  head?: string;
  base?: string;
  created?: string;
  updated?: string;
  'merged-at'?: string;
  closed?: string;
  comments?: number | string;
  reactions?: number | string;
  interactions?: number | string;
  review?: 'none' | 'required' | 'approved' | 'changes_requested';
  checks?: 'pending' | 'success' | 'failure';
  label?: string | string[];
  milestone?: string;
  project?: string;
  'team-mentions'?: string;
  'no-assignee'?: boolean;
  'no-label'?: boolean;
  'no-milestone'?: boolean;
  'no-project'?: boolean;
  language?: string;
  visibility?: RepositoryVisibility | RepositoryVisibility[];
  app?: string;
  archived?: boolean;
  match?: ('title' | 'body' | 'comments')[];
  limit?: number;
  getCommitData?: boolean;
  withComments?: boolean;
  exhaustive?: boolean;
  maxPages?: number;
  pageSize?: number;
}

export interface GitHubIssuesSearchParams {
  // Base search parameters
  q?: string;
  sort?: SearchIssuesSort;
  order?: SortOrder;
  per_page?: number;
  page?: number;

  // Our custom fields
  researchGoal?: string;
  query: string;
  owner?: string;
  repo?: string;
  state?: 'open' | 'closed';
  locked?: boolean;
  author?: string;
  assignee?: string;
  mentions?: string;
  commenter?: string;
  involves?: string;
  created?: string;
  updated?: string;
  closed?: string;
  comments?: number | string;
  reactions?: number | string;
  interactions?: number | string;
  label?: string | string[];
  milestone?: string;
  'team-mentions'?: string;
  'no-assignee'?: boolean;
  'no-label'?: boolean;
  'no-milestone'?: boolean;
  'no-project'?: boolean;
  language?: string;
  visibility?: RepositoryVisibility;
  app?: string;
  archived?: boolean;
  match?: 'title' | 'body' | 'comments';
  limit?: number;
  'include-prs'?: boolean;
  exhaustive?: boolean;
  maxPages?: number;
  pageSize?: number;
}

// ============================================================================
// DIFF AND CUSTOM RESULT TYPES
// ============================================================================

// Diff types
export type DiffEntry = components['schemas']['diff-entry'];

export interface GitHubDiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface GitHubPullRequestDiff {
  changed_files: number;
  additions: number;
  deletions: number;
  files: GitHubDiffFile[];
}

export interface GitHubCommitDiff {
  changed_files: number;
  additions: number;
  deletions: number;
  total_changes: number;
  files: GitHubDiffFile[];
}

// Optimized/custom result types
export interface OptimizedCodeSearchResult {
  items: Array<{
    path: string;
    matches: Array<{
      context: string;
      positions: [number, number][];
    }>;
    url: string;
    repository: {
      nameWithOwner: string;
      url: string;
    };
  }>;
  total_count: number;
  repository?: {
    name: string;
    url: string;
  };
  securityWarnings?: string[];
  minified?: boolean;
  minificationFailed?: boolean;
  minificationTypes?: string[];
  _researchContext?: {
    foundPackages: string[];
    foundFiles: string[];
    repositoryContext?: {
      owner: string;
      repo: string;
    };
  };
}

export interface GitHubCommitSearchItem {
  sha: string;
  commit?: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
  };
  author?: {
    login: string;
    id: number;
    type: string;
    url: string;
  };
  committer?: {
    login: string;
    id: number;
    type: string;
    url: string;
  };
  repository: {
    name: string;
    fullName: string;
    url: string;
    description?: string;
  };
  url: string;
  parents?: Array<{
    sha: string;
    url: string;
  }>;
}

export interface OptimizedCommitSearchResult {
  commits: Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
    repository?: string;
    url: string;
    diff?: GitHubCommitDiff;
    _sanitization_warnings?: string[];
  }>;
  total_count: number;
  repository?: {
    name: string;
    description?: string;
  };
  pagination?: {
    exhaustive: boolean;
    pages_fetched: number;
    total_pages_estimated?: number;
    has_more: boolean;
    rate_limit_hit?: boolean;
  };
}

export interface GitHubPullRequestItem {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  author: string;
  repository: string;
  labels: string[];
  created_at: string;
  updated_at: string;
  merged_at?: string;
  closed_at?: string;
  url: string;
  comments?: Array<{
    id: string;
    author: {
      login: string;
    };
    authorAssociation: string;
    body: string;
    createdAt: string;
    includesCreatedEdit: boolean;
    isMinimized: boolean;
    minimizedReason: string;
    reactionGroups: unknown[];
    url: string;
    viewerDidAuthor: boolean;
  }>;
  reactions: number;
  draft: boolean;
  head?: string;
  base?: string;
  head_sha?: string;
  base_sha?: string;
  diff?: GitHubPullRequestDiff;
  commits?: {
    total_count: number;
    commits: Array<{
      sha: string;
      message: string;
      author: string;
      url: string;
      authoredDate?: string;
      diff?: {
        changed_files: number;
        additions: number;
        deletions: number;
        total_changes: number;
        files: GitHubDiffFile[];
      };
      _sanitization_warnings?: string[];
    }>;
  };
  _sanitization_warnings?: string[];
}

// ============================================================================
// LEGACY TYPE COMPATIBILITY
// ============================================================================

// For backward compatibility with existing code
export type GitHubRepository = Repository;
export type GitHubOwner = SimpleUser;
export type GitHubCodeSearchItem = CodeSearchResultItem;
export type GitHubIssue = Issue;
export type GitHubPullRequest = PullRequest;
export type GitHubCommit = Commit;
export type GitHubFileContent =
  | ContentFile
  | ContentDirectory
  | ContentSymlink
  | ContentSubmodule;

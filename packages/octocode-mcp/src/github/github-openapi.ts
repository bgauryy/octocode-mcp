/**
 * GitHub API Types - Custom Extensions and Re-exports
 *
 * This file provides:
 * 1. Direct re-exports of commonly used @octokit types for convenience
 * 2. Custom enhanced types that add business logic
 * 3. Type guards and utility functions
 * 4. Domain-specific interfaces for our use cases
 */

// ============================================================================
// DIRECT IMPORTS & RE-EXPORTS (for convenience)
// ============================================================================

export type { components } from '@octokit/openapi-types';
export type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

// Commonly used component types (direct re-exports for convenience)
import type { components } from '@octokit/openapi-types';
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

// Core GitHub API types (commonly used, so we re-export for convenience)
export type Repository = components['schemas']['full-repository'];
export type PullRequest = components['schemas']['pull-request'];
export type Commit = components['schemas']['commit'];
export type WorkflowRun = components['schemas']['workflow-run'];
export type CheckRun = components['schemas']['check-run'];
export type CodeSearchResultItem =
  components['schemas']['code-search-result-item'];
export type RepoSearchResultItem =
  components['schemas']['repo-search-result-item'];
export type CommitSearchResultItem =
  components['schemas']['commit-search-result-item'];
export type DiffEntry = components['schemas']['diff-entry'];

// API parameter types
export type GetContentParameters =
  RestEndpointMethodTypes['repos']['getContent']['parameters'];
export type GetRepoResponse =
  RestEndpointMethodTypes['repos']['get']['response'];

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
// CUSTOM TYPES FOR BUSINESS LOGIC
// ============================================================================

// Repository reference types
export type RepositoryReference = {
  owner: string;
  repo: string;
  ref?: string;
};

// Enhanced diff types
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
    // Optional metadata: minifier strategy used for this file's text matches
    minificationType?: string;
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
  file_changes?: {
    total_count: number;
    files: DiffEntry[];
  };
  _sanitization_warnings?: string[];
}

// ============================================================================
// EXTENDED TYPES FOR CUSTOM PARAMETERS
// ============================================================================

// Extended search parameters with our custom fields
export interface GitHubCommitSearchParams {
  // Base search parameters
  q?: string;
  sort?: 'author-date' | 'committer-date';
  order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;

  // Our custom fields
  keywordsToSearch?: string[];
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
  visibility?: 'public' | 'private' | 'internal';
  getChangesContent?: boolean;
  exhaustive?: boolean;
  maxPages?: number;
  pageSize?: number;
  limit?: number;
}

export interface GitHubPullRequestsSearchParams {
  // Base search parameters
  q?: string;
  sort?:
    | 'comments'
    | 'reactions'
    | 'reactions-+1'
    | 'reactions--1'
    | 'reactions-smile'
    | 'reactions-thinking_face'
    | 'reactions-heart'
    | 'reactions-tada'
    | 'interactions'
    | 'created'
    | 'updated'
    | 'best-match';
  order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;

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
  visibility?:
    | ('public' | 'private' | 'internal')
    | ('public' | 'private' | 'internal')[];
  app?: string;
  match?: ('title' | 'body' | 'comments')[];
  limit?: number;
  withComments?: boolean;
  getFileChanges?: boolean;
  exhaustive?: boolean;
  maxPages?: number;
  pageSize?: number;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if an object is a GitHub API error
 */
export function isGitHubAPIError(obj: unknown): obj is GitHubAPIError {
  return !!(
    obj &&
    typeof obj === 'object' &&
    obj !== null &&
    'error' in obj &&
    typeof (obj as Record<string, unknown>).error === 'string' &&
    'type' in obj
  );
}

/**
 * Type guard to check if an object is a GitHub API success response
 */
export function isGitHubAPISuccess<T>(
  obj: unknown
): obj is GitHubAPISuccess<T> {
  return !!(
    obj &&
    typeof obj === 'object' &&
    obj !== null &&
    'data' in obj &&
    'status' in obj &&
    typeof (obj as Record<string, unknown>).status === 'number'
  );
}

/**
 * Type guard to check if an object is a repository
 */
export function isRepository(obj: unknown): obj is Repository {
  return !!(
    obj &&
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    typeof (obj as Record<string, unknown>).id === 'number' &&
    'name' in obj &&
    typeof (obj as Record<string, unknown>).name === 'string' &&
    'full_name' in obj &&
    typeof (obj as Record<string, unknown>).full_name === 'string' &&
    'private' in obj &&
    typeof (obj as Record<string, unknown>).private === 'boolean'
  );
}

/**
 * Type guard to check if an object is a search result item
 */
export function isSearchResultItem(obj: unknown): obj is CodeSearchResultItem {
  return !!(
    obj &&
    typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    typeof (obj as Record<string, unknown>).name === 'string' &&
    'path' in obj &&
    typeof (obj as Record<string, unknown>).path === 'string' &&
    'sha' in obj &&
    typeof (obj as Record<string, unknown>).sha === 'string' &&
    'repository' in obj
  );
}

/**
 * Type guard to check if an object is a pull request
 */
export function isPullRequest(obj: unknown): obj is PullRequest {
  return !!(
    obj &&
    typeof obj === 'object' &&
    obj !== null &&
    'number' in obj &&
    typeof (obj as Record<string, unknown>).number === 'number' &&
    'title' in obj &&
    typeof (obj as Record<string, unknown>).title === 'string' &&
    'state' in obj &&
    typeof (obj as Record<string, unknown>).state === 'string'
  );
}

/**
 * Type guard to check if an object is a workflow run
 */
export function isWorkflowRun(obj: unknown): obj is WorkflowRun {
  return !!(
    obj &&
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    typeof (obj as Record<string, unknown>).id === 'number' &&
    'status' in obj &&
    typeof (obj as Record<string, unknown>).status === 'string'
  );
}

/**
 * Type guard to check if an object is a check run
 */
export function isCheckRun(obj: unknown): obj is CheckRun {
  return !!(
    obj &&
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    typeof (obj as Record<string, unknown>).id === 'number' &&
    'name' in obj &&
    typeof (obj as Record<string, unknown>).name === 'string' &&
    'status' in obj &&
    typeof (obj as Record<string, unknown>).status === 'string'
  );
}

// ============================================================================
// CONVENIENCE TYPE ALIASES FOR DIRECT OCTOKIT ACCESS
// ============================================================================

// For files that want to use Octokit types directly without imports
export type SearchCodeParameters =
  RestEndpointMethodTypes['search']['code']['parameters'];
export type SearchCodeResponse =
  RestEndpointMethodTypes['search']['code']['response'];
export type SearchReposParameters =
  RestEndpointMethodTypes['search']['repos']['parameters'];
export type SearchReposResponse =
  RestEndpointMethodTypes['search']['repos']['response'];
export type SearchCommitsParameters =
  RestEndpointMethodTypes['search']['commits']['parameters'];
export type SearchCommitsResponse =
  RestEndpointMethodTypes['search']['commits']['response'];

// Common utility types
export type GitHubID = number;
export type GitHubSHA = string;
export type GitHubURL = string;
export type GitHubDate = string;
export type SortOrder = 'asc' | 'desc';

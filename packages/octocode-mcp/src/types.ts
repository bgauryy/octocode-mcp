/**
 * Common types used across multiple tools and modules
 * @module types
 *
 * NOTE: Tool-specific types are defined in their respective directories:
 * - tools/github_fetch_content/types.ts
 * - tools/github_search_code/types.ts
 * - tools/github_search_repos/types.ts
 * - tools/github_view_repo_structure/types.ts
 * - tools/github_search_pull_requests/types.ts
 * - tools/local_fetch_content/types.ts
 * - tools/local_find_files/types.ts
 * - tools/local_ripgrep/types.ts
 * - tools/local_view_structure/types.ts
 * - tools/lsp_goto_definition/types.ts
 * - tools/lsp_find_references/types.ts
 * - tools/lsp_call_hierarchy/types.ts
 * - tools/package_search/types.ts
 */

import type { GitHubAPIError } from './github/githubAPI.js';

// ============================================================================
// COMMON QUERY STATUS
// ============================================================================

export type QueryStatus = 'hasResults' | 'empty' | 'error';

// ============================================================================
// TOOL RESULT TYPES
// ============================================================================

interface ToolResult {
  status: QueryStatus;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  hints?: string[];
  [key: string]: unknown;
}

export interface ToolErrorResult extends ToolResult {
  status: 'error';
  error: string | GitHubAPIError;
}

export interface ToolSuccessResult<
  T = Record<string, unknown>,
> extends ToolResult {
  status: 'hasResults' | 'empty';
  data?: T;
}

// ============================================================================
// PAGINATION
// ============================================================================

/**
 * Common pagination information used across tools
 */
export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  byteOffset?: number;
  byteLength?: number;
  totalBytes?: number;
  charOffset?: number;
  charLength?: number;
  totalChars?: number;
  filesPerPage?: number;
  totalFiles?: number;
  entriesPerPage?: number;
  totalEntries?: number;
  matchesPerPage?: number;
  totalMatches?: number;
}

// ============================================================================
// TOOL OPERATIONS - Bulk processing, caching, and execution utilities
// ============================================================================

/**
 * Optional callback invoked when a tool is called with queries
 */
export type ToolInvocationCallback = (
  toolName: string,
  queries: unknown[]
) => Promise<void>;

/** Processed result from bulk query execution */
export interface ProcessedBulkResult {
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  data?: Record<string, unknown>;
  error?: string | GitHubAPIError;
  status: QueryStatus;
  query?: object;
  hints?: readonly string[] | string[];
  [key: string]: unknown;
}

/** Flattened query result for bulk operations */
export interface FlatQueryResult {
  id: number;
  status: QueryStatus;
  data: Record<string, unknown>;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

/** Error information for failed queries */
export interface QueryError {
  queryIndex: number;
  error: string;
}

/** Configuration for bulk response formatting */
export interface BulkResponseConfig {
  toolName: string;
  keysPriority?: string[];
  /**
   * Maximum number of concurrent requests during bulk operations.
   * Lower values reduce rate limiting risk, higher values improve throughput.
   * @default 3
   */
  concurrency?: number;
}

/** Result of a promise with error isolation */
export interface PromiseResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  index: number;
}

/** Options for batch promise execution */
export interface PromiseExecutionOptions {
  timeout?: number;
  continueOnError?: boolean;
  concurrency?: number;
  onError?: (error: Error, index: number) => void;
}

/** Standardized tool response format */
export interface ToolResponse {
  data?: unknown;
  hints?: string[];
  instructions?: string;
  results?: unknown[];
  summary?: {
    total: number;
    hasResults: number;
    empty: number;
    errors: number;
  };
  hasResultsStatusHints?: string[];
  emptyStatusHints?: string[];
  errorStatusHints?: string[];
  [key: string]: unknown;
}

// ============================================================================
// SECURITY TYPES
// ============================================================================

/** Pattern definition for detecting sensitive data */
export interface SensitiveDataPattern {
  name: string;
  description: string;
  regex: RegExp;
  fileContext?: RegExp;
  matchAccuracy?: 'high' | 'medium';
}

/** Result of content sanitization */
export interface SanitizationResult {
  content: string;
  hasSecrets: boolean;
  secretsDetected: string[];
  warnings: string[];
}

/** Result of parameter validation */
export interface ValidationResult {
  sanitizedParams: Record<string, unknown>;
  isValid: boolean;
  hasSecrets: boolean;
  warnings: string[];
}

// ============================================================================
// SERVER CONFIGURATION
// ============================================================================

/**
 * Token source types for tracking where the GitHub token came from.
 */
export type TokenSourceType =
  | 'env:OCTOCODE_TOKEN'
  | 'env:GH_TOKEN'
  | 'env:GITHUB_TOKEN'
  | 'gh-cli'
  | 'octocode-storage'
  | 'none';

/**
 * GitLab token source types for tracking where the GitLab token came from.
 */
export type GitLabTokenSourceType =
  | 'env:GITLAB_TOKEN'
  | 'env:GL_TOKEN'
  | 'none';

/**
 * GitLab configuration for connecting to GitLab instances.
 */
export interface GitLabConfig {
  /** GitLab host URL (default: https://gitlab.com) */
  host: string;
  /** GitLab API token */
  token: string | null;
  /** Source of the GitLab token */
  tokenSource: GitLabTokenSourceType;
  /** Whether GitLab is configured (has valid token) */
  isConfigured: boolean;
}

/** Server configuration and feature flags */
export interface ServerConfig {
  version: string;
  githubApiUrl: string;
  toolsToRun?: string[];
  enableTools?: string[];
  disableTools?: string[];
  enableLogging: boolean;
  timeout: number;
  maxRetries: number;
  loggingEnabled: boolean;
  enableLocal: boolean;
  /** Whether prompts/slash commands are disabled */
  disablePrompts: boolean;
  tokenSource: TokenSourceType;
  /** GitLab configuration (optional) */
  gitlab?: GitLabConfig;
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/** Session data for tracking tool usage */
export interface SessionData {
  sessionId: string;
  intent: 'init' | 'error' | 'tool_call' | 'prompt_call' | 'rate_limit';
  data:
    | ToolCallData
    | PromptCallData
    | ErrorData
    | RateLimitData
    | Record<string, never>;
  timestamp: string;
  version: string;
}

/** Tool call tracking data */
export interface ToolCallData {
  tool_name: string;
  repos: string[];
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

export interface PromptCallData {
  prompt_name: string;
}

/** Error tracking data */
export interface ErrorData {
  error: string;
}

/** Rate limit tracking data */
export interface RateLimitData {
  limit_type: 'primary' | 'secondary' | 'graphql' | 'precheck_blocked';
  retry_after_seconds?: number;
  rate_limit_remaining?: number;
  rate_limit_reset_ms?: number;
  api_method?: string;
  api_url?: string;
  details?: string;
}

// ============================================================================
// GITHUB TOOL TYPES (duplicated for backward compatibility)
// These types are also defined in their respective tool directories
// ============================================================================

/** Query parameters for fetching GitHub file content */
export interface FileContentQuery {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
  fullContent?: boolean;
  startLine?: number;
  endLine?: number;
  matchString?: string;
  matchStringContextLines?: number;
  charOffset?: number;
  charLength?: number;
  noTimestamp?: boolean;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

/** Query parameters for GitHub code search */
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

/** Query parameters for searching GitHub repositories */
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

/** Query parameters for viewing repository structure */
export interface GitHubViewRepoStructureQuery {
  owner: string;
  repo: string;
  branch: string;
  path?: string;
  depth?: number;
  entriesPerPage?: number;
  entryPageNumber?: number;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

/** Query parameters for searching pull requests */
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
  withComments?: boolean;
  withCommits?: boolean;
  type?: 'metadata' | 'fullContent' | 'partialContent';
  partialContentMetadata?: {
    file: string;
    additions?: number[];
    deletions?: number[];
  }[];
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
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
  visibility?: string;
  topics?: string[];
  forksCount?: number;
  openIssuesCount?: number;
}

/** Directory entry with files and folders */
export interface DirectoryEntry {
  files: string[];
  folders: string[];
}

/** Base result interface */
interface BaseToolResult<TQuery = object> {
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  error?: string;
  hints?: string[];
  query?: TQuery;
}

/** Code search result */
export interface SearchResult extends BaseToolResult<GitHubCodeSearchQuery> {
  files?: Array<{
    path: string;
    repo?: string;
    text_matches?: string[];
    lastModifiedAt?: string;
  }>;
  repositoryContext?: {
    owner: string;
    repo: string;
    branch?: string;
  };
  pagination?: {
    currentPage: number;
    totalPages: number;
    perPage: number;
    totalMatches: number;
    hasMore: boolean;
  };
}

/** File content result */
export interface ContentResult extends BaseToolResult<FileContentQuery> {
  owner?: string;
  repo?: string;
  path?: string;
  contentLength?: number;
  content?: string;
  branch?: string;
  startLine?: number;
  endLine?: number;
  isPartial?: boolean;
  minified?: boolean;
  minificationFailed?: boolean;
  minificationType?: string;
  matchLocations?: string[];
  lastModified?: string;
  lastModifiedBy?: string;
  pagination?: PaginationInfo;
  matchNotFound?: boolean;
  searchedFor?: string;
}

/** Repository search result */
export interface RepoSearchResult extends BaseToolResult<GitHubReposSearchQuery> {
  repositories: SimplifiedRepository[];
  pagination?: {
    currentPage: number;
    totalPages: number;
    perPage: number;
    totalMatches: number;
    hasMore: boolean;
  };
}

/** Repository structure result */
export interface RepoStructureResult extends BaseToolResult<GitHubViewRepoStructureQuery> {
  owner?: string;
  repo?: string;
  branch?: string;
  path?: string;
  structure?: Record<string, DirectoryEntry>;
}

/** Pull request info */
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

/** Pull request search result */
export interface PullRequestSearchResult extends BaseToolResult<GitHubPullRequestSearchQuery> {
  owner?: string;
  repo?: string;
  pull_requests?: PullRequestInfo[];
  total_count?: number;
  incomplete_results?: boolean;
  pagination?: {
    currentPage: number;
    totalPages: number;
    perPage: number;
    totalMatches: number;
    hasMore: boolean;
  };
}

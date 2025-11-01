/**
 * Central Type Definitions for Octocode-MCP
 *
 * Organization:
 * 1. Foundation Types - Base types used across all operations
 * 2. GitHub API Types - Types for GitHub tools (code, files, repos, PRs)
 * 3. Tool Operations - Bulk processing, caching, execution utilities
 * 4. Infrastructure - Server config, security, session management
 */

import type { GitHubAPIError } from './github/githubAPI.js';

// ============================================================================
// FOUNDATION TYPES - Used across all tool operations
// ============================================================================

/** Query execution status indicator */
export type QueryStatus = 'hasResults' | 'empty' | 'error';

/** Base result structure for tool operations */
export interface BaseToolResult<TQuery = object> {
  researchGoal?: string;
  reasoning?: string;
  error?: string;
  hints?: string[];
  query?: TQuery;
}

/** Generic tool result with status */
export interface ToolResult {
  status: QueryStatus;
  researchGoal?: string;
  reasoning?: string;
  hints?: string[];
  [key: string]: unknown; // Tool-specific fields
}

/** Tool error result */
export interface ToolErrorResult extends ToolResult {
  status: 'error';
  error: string | GitHubAPIError;
}

/** Tool success result */
export interface ToolSuccessResult<T = Record<string, unknown>>
  extends ToolResult {
  status: 'hasResults' | 'empty';
  data?: T;
}

/** Context for generating contextual hints */
export interface HintContext {
  resultType: 'hasResults' | 'empty' | 'failed';
  apiError?: GitHubAPIError;
}

/** Organized hints by result type */
export interface OrganizedHints {
  hasResults?: string[];
  empty?: string[];
  failed?: string[];
}

// ============================================================================
// GITHUB API TYPES - Tools for code discovery and analysis
// ============================================================================

// ─── GitHub Authentication & Rate Limiting ──────────────────────────────────

/** Authenticated user information from GitHub */
export interface GitHubUserInfo {
  login: string;
  id: number;
  name: string | null;
  email: string | null;
  company: string | null;
  type: 'User' | 'Organization';
  plan?: {
    name: string;
    space: number;
    private_repos: number;
  };
}

/** Rate limit status for GitHub API endpoints */
export interface GitHubRateLimitInfo {
  core: {
    limit: number;
    used: number;
    remaining: number;
    reset: number;
  };
  search: {
    limit: number;
    used: number;
    remaining: number;
    reset: number;
  };
  graphql: {
    limit: number;
    used: number;
    remaining: number;
    reset: number;
  };
}

// ─── Code Search (github_search_code) ───────────────────────────────────────

/** Query parameters for searching code in GitHub repositories */
export interface GitHubCodeSearchQuery {
  keywordsToSearch: string[];
  owner?: string;
  repo?: string;
  extension?: string;
  stars?: string;
  filename?: string;
  path?: string;
  match?: 'file' | 'path';
  limit?: number;
  minify?: boolean;
  sanitize?: boolean;
  researchGoal?: string;
  reasoning?: string;
}

/** Individual file in code search results */
export interface SearchFile {
  path: string;
  text_matches: string[];
}

/** Code search result with matched files */
export interface SearchResult extends BaseToolResult<GitHubCodeSearchQuery> {
  owner?: string;
  repo?: string;
  files: SearchFile[];
}

// ─── File Content (github_fetch_content) ────────────────────────────────────

/** Query parameters for fetching file content */
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
  minified?: boolean;
  sanitize?: boolean;
  researchGoal?: string;
  reasoning?: string;
}

/** LLM sampling metadata for content operations */
export interface SamplingInfo {
  samplingId?: string;
  samplingMethod?: string;
  samplingTokens?: number;
  samplingCost?: number;
  [key: string]: unknown;
}

/** File content result data */
export interface ContentResultData {
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
  originalQuery?: FileContentQuery;
  securityWarnings?: string[];
  sampling?: SamplingInfo;
}

/** Complete file content result */
export interface ContentResult
  extends BaseToolResult<FileContentQuery>,
    ContentResultData {}

// ─── Repository Search (github_search_repos) ────────────────────────────────

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
  researchGoal?: string;
  reasoning?: string;
}

/** Simplified repository metadata */
export interface SimplifiedRepository {
  owner: string;
  repo: string;
  stars: number;
  description: string;
  url: string;
  updatedAt: string;
}

/** Repository search result */
export interface RepoSearchResult
  extends BaseToolResult<GitHubReposSearchQuery> {
  repositories: SimplifiedRepository[];
}

// ─── Repository Structure (github_view_repo_structure) ──────────────────────

/** Query parameters for viewing repository structure */
export interface GitHubViewRepoStructureQuery {
  owner: string;
  repo: string;
  branch: string;
  path?: string;
  depth?: number;
  researchGoal?: string;
  reasoning?: string;
}

/** Repository structure result data */
export interface RepoStructureResultData {
  owner?: string;
  repo?: string;
  path?: string;
  files?: string[];
  folders?: string[];
}

/** Complete repository structure result */
export interface RepoStructureResult
  extends BaseToolResult<GitHubViewRepoStructureQuery>,
    RepoStructureResultData {}

// ─── Pull Requests (github_search_pull_requests) ────────────────────────────

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
  withContent?: boolean;
  researchGoal?: string;
  reasoning?: string;
}

/** Detailed pull request information */
export interface PullRequestInfo {
  id: number;
  number: number;
  title: string;
  url: string;
  html_url: string;
  state: 'open' | 'closed';
  draft: boolean;
  merged: boolean;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  merged_at?: string;
  author: {
    login: string;
    id: number;
    avatar_url: string;
    html_url: string;
  };
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
  head: {
    ref: string;
    sha: string;
    repo?: string;
  };
  base: {
    ref: string;
    sha: string;
    repo: string;
  };
  body?: string;
  comments?: number;
  review_comments?: number;
  commits?: number;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  comment_details?: Array<{
    id: number;
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
    changes: number;
    patch?: string;
  }>;
}

/** Pull request search result data */
export interface PullRequestSearchResultData {
  pull_requests?: PullRequestInfo[];
  total_count?: number;
  incomplete_results?: boolean;
}

/** Complete pull request search result */
export interface PullRequestSearchResult
  extends BaseToolResult<GitHubPullRequestSearchQuery>,
    PullRequestSearchResultData {}

// ============================================================================
// TOOL OPERATIONS - Bulk processing, caching, and execution utilities
// ============================================================================

// ─── Tool Invocation Callback ───────────────────────────────────────────────

/**
 * Optional callback invoked when a tool is called with queries
 * @param toolName - The name of the tool being invoked
 * @param queries - Array of query objects passed to the tool
 */
export type ToolInvocationCallback = (
  toolName: string,
  queries: unknown[]
) => Promise<void>;

// ─── Bulk Operations (executeBulkOperation) ─────────────────────────────────

/** Processed result from bulk query execution */
export interface ProcessedBulkResult<
  TData = Record<string, unknown>,
  TQuery = object,
> {
  researchGoal?: string;
  reasoning?: string;
  data?: TData;
  error?: string | GitHubAPIError;
  status: QueryStatus;
  query?: TQuery;
  hints?: string[];
  [key: string]: unknown; // Tool-specific fields
}

/** Flattened query result for bulk operations */
export interface FlatQueryResult<TQuery = object> {
  query: TQuery;
  status: QueryStatus;
  data: Record<string, unknown>;
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
  toolName: string; // Kept as string to avoid circular dependency
  keysPriority?: string[];
}

// ─── Caching (cache.ts) ─────────────────────────────────────────────────────

/** Cache performance statistics */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  totalKeys: number;
  lastReset: Date;
}

// ─── Command Execution (exec.ts) ────────────────────────────────────────────

/** Options for command execution */
export type ExecOptions = {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  cache?: boolean;
};

// ─── Promise Utilities (promiseUtils.ts) ────────────────────────────────────

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

// ─── Response Formatting (responses.ts) ─────────────────────────────────────

/** Standardized tool response format (single and bulk) */
export interface ToolResponse {
  data?: unknown; // Single response data
  hints?: string[]; // DEPRECATED: Use instructions
  instructions?: string; // Processing instructions
  results?: unknown[]; // Bulk operation results
  hasResultsStatusHints?: string[]; // Bulk hints for successful queries
  emptyStatusHints?: string[]; // Bulk hints for empty results
  errorStatusHints?: string[]; // Bulk hints for errors
}

// ─── Sampling (sampling.ts) ─────────────────────────────────────────────────

/** LLM sampling response with token usage */
export interface SamplingResponse {
  content: string;
  stopReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============================================================================
// INFRASTRUCTURE - Server, security, and session management
// ============================================================================

// ─── Security (security/) ───────────────────────────────────────────────────

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
  warnings: string[]; // Alias for secretsDetected
  hasPromptInjection?: boolean;
  isMalicious?: boolean;
}

/** Result of parameter validation */
export interface ValidationResult {
  sanitizedParams: Record<string, unknown>;
  isValid: boolean;
  hasSecrets: boolean;
  warnings: string[];
}

/** User context for authenticated operations */
export interface UserContext {
  userId: string;
  userLogin: string;
  organizationId?: string;
  isEnterpriseMode: boolean;
  sessionId?: string;
}

// ─── Server Configuration (serverConfig.ts) ─────────────────────────────────

/** Server configuration and feature flags */
export interface ServerConfig {
  version: string;
  toolsToRun?: string[];
  enableTools?: string[];
  disableTools?: string[];
  enableLogging: boolean;
  betaEnabled: boolean;
  timeout: number;
  maxRetries: number;
  loggingEnabled: boolean;
}

// ─── Session Management (session.ts) ────────────────────────────────────────

/** Session data for tracking tool usage */
export interface SessionData {
  sessionId: string;
  intent: 'init' | 'error' | 'tool_call';
  data: ToolCallData | ErrorData | Record<string, never>;
  timestamp: string;
  version: string;
}

/** Tool call tracking data */
export interface ToolCallData {
  tool_name: string;
  repos: string[];
}

/** Error tracking data */
export interface ErrorData {
  error: string;
}

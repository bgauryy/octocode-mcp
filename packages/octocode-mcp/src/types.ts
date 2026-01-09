import type { GitHubAPIError } from './github/githubAPI.js';
import type { PaginationInfo } from './utils/core/types.js';

export type { PaginationInfo };

export type QueryStatus = 'hasResults' | 'empty' | 'error';

interface BaseToolResult<TQuery = object> {
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  error?: string;
  hints?: string[];
  query?: TQuery;
}

interface ToolResult {
  status: QueryStatus;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  hints?: string[];
  [key: string]: unknown; // Tool-specific fields
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
  charOffset?: number;
  charLength?: number;
  noTimestamp?: boolean;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

/** LLM sampling metadata for content operations */
interface SamplingInfo {
  samplingId?: string;
  samplingMethod?: string;
  samplingTokens?: number;
  samplingCost?: number;
  [key: string]: unknown;
}

/** File content result data */
interface ContentResultData {
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
  matchLocations?: string[];
  sampling?: SamplingInfo;
  lastModified?: string;
  lastModifiedBy?: string;
  pagination?: PaginationInfo;
  /** True when matchString was provided but not found in file (not an error, just no match) */
  matchNotFound?: boolean;
  /** The matchString that was searched for (when matchNotFound is true) */
  searchedFor?: string;
}

/** Complete file content result */
export interface ContentResult
  extends BaseToolResult<FileContentQuery>, ContentResultData {}

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
  page?: number;
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

// ─── Repository Structure (github_view_repo_structure) ──────────────────────

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
interface RepoStructureResultData {
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

// ─── Package Search (package_search) ────────────────────────────────────────

/** Query parameters for searching packages */
interface PackageSearchQuery {
  name: string;
  ecosystem: 'npm' | 'python';
  searchLimit?: number;
  npmFetchMetadata?: boolean;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

/** Individual package in search results */
interface PackageInfo {
  name: string;
  version: string;
  description: string | null;
  keywords: string[];
  repository: string | null;
  owner?: string;
  repo?: string;
  license?: string;
  homepage?: string;
  author?: string;
}

/** Package search result data */
interface PackageSearchResultData {
  packages: PackageInfo[];
  ecosystem: 'npm' | 'python';
  totalFound: number;
}

/** Complete package search result */
interface _PackageSearchResult
  extends BaseToolResult<PackageSearchQuery>, PackageSearchResultData {}

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

/** Detailed pull request information */
interface PullRequestInfo {
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
interface PRSearchPagination {
  currentPage: number;
  totalPages: number;
  perPage: number;
  totalMatches: number;
  hasMore: boolean;
}

/** Pull request search result data */
interface PullRequestSearchResultData {
  owner?: string;
  repo?: string;
  pull_requests?: PullRequestInfo[];
  total_count?: number;
  incomplete_results?: boolean;
  pagination?: PRSearchPagination;
}

/** Complete pull request search result */
export interface PullRequestSearchResult
  extends
    BaseToolResult<GitHubPullRequestSearchQuery>,
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
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  data?: TData;
  error?: string | GitHubAPIError;
  status: QueryStatus;
  query?: TQuery;
  hints?: readonly string[] | string[];
  [key: string]: unknown; // Tool-specific fields
}

/** Flattened query result for bulk operations (optimized - no query duplication) */
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
  toolName: string; // Kept as string to avoid circular dependency
  keysPriority?: string[];
}

// ─── Caching (cache.ts) ─────────────────────────────────────────────────────

/** Cache performance statistics */
interface _CacheStats {
  hits: number;
  misses: number;
  sets: number;
  totalKeys: number;
  lastReset: Date;
}

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
  summary?: {
    total: number;
    hasResults: number;
    empty: number;
    errors: number;
  };
  hasResultsStatusHints?: string[]; // Bulk hints for successful queries
  emptyStatusHints?: string[]; // Bulk hints for empty results
  errorStatusHints?: string[]; // Bulk hints for errors
  [key: string]: unknown; // Allow additional tool-specific fields
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
}

/** Result of parameter validation */
export interface ValidationResult {
  sanitizedParams: Record<string, unknown>;
  isValid: boolean;
  hasSecrets: boolean;
  warnings: string[];
}

// ─── Server Configuration (serverConfig.ts) ─────────────────────────────────

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
}

// ─── Session Management (session.ts) ────────────────────────────────────────

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
  /**
   * The kind of rate limit that occurred
   * - primary: Hourly quota exhausted (REST/GraphQL)
   * - secondary: Abuse detection (too frequent)
   * - graphql: GraphQL-specific rate limiting indication
   * - precheck_blocked: Proactive block based on current rate limits
   */
  limit_type: 'primary' | 'secondary' | 'graphql' | 'precheck_blocked';
  /** Seconds to wait before retrying (if known) */
  retry_after_seconds?: number;
  /** Remaining requests at the time of the event */
  rate_limit_remaining?: number;
  /** Epoch milliseconds for reset time (if known) */
  rate_limit_reset_ms?: number;
  /** Optional HTTP method involved */
  api_method?: string;
  /** Optional API URL that was being called */
  api_url?: string;
  /** Additional free-form details */
  details?: string;
}

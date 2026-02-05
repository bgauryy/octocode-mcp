/**
 * Common types used across multiple tools and modules
 * @module types
 *
 * This file contains:
 * - Shared types used by multiple modules (QueryStatus, PaginationInfo, etc.)
 * - Security types (SensitiveDataPattern, ValidationResult, etc.)
 * - Server configuration types (ServerConfig, TokenSourceType, etc.)
 * - Session management types (SessionData, ToolCallData, etc.)
 *
 * Tool-specific types are defined in their respective directories:
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

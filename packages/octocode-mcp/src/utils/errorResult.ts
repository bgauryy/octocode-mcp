/**
 * Unified error result creation for all tools (GitHub API and local)
 *
 * This module provides a single source of truth for creating error results,
 * handling both GitHub API errors (with rate limits, scopes) and local tool
 * errors (with error codes, tool-specific hints).
 */

import type { GitHubAPIError } from '../github/githubAPI.js';
import { toToolError, isToolError, type ToolError } from '../errorCodes.js';
import { getHints } from '../tools/hints/index.js';

/**
 * Base query fields that all tools share
 */
export interface BaseQueryFields {
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

/**
 * Unified error result structure
 * Compatible with both ToolErrorResult (GitHub) and local tool error results
 */
export interface UnifiedErrorResult {
  status: 'error';
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  /** Error message or GitHubAPIError object (for GitHub tools) */
  error?: string | GitHubAPIError;
  /** Error code (for local tools) */
  errorCode?: string;
  /** Hints for error recovery */
  hints?: string[];
  /** Additional fields from extra */
  [key: string]: unknown;
}

/**
 * Options for creating an error result
 */
export interface CreateErrorResultOptions {
  /** Tool name for hint generation */
  toolName?: string;
  /** Additional context for hints (local tools only) */
  hintContext?: Record<string, unknown>;
  /** Additional fields to include in the result */
  extra?: Record<string, unknown>;
  /** Custom hints to include (merged with auto-generated hints) */
  customHints?: string[];
  /**
   * Separate error source for hints (GitHub API pattern)
   * When provided, hints are extracted from this error instead of the main error.
   * The main error is still used as the error value.
   */
  hintSourceError?: GitHubAPIError;
}

/**
 * Extract hints from GitHub API errors
 */
function extractGitHubApiHints(apiError: GitHubAPIError): string[] {
  const hints: string[] = [];

  hints.push(`GitHub Octokit API Error: ${apiError.error}`);

  if (apiError.scopesSuggestion) {
    hints.push(apiError.scopesSuggestion);
  }

  if (
    apiError.rateLimitRemaining !== undefined &&
    apiError.rateLimitReset !== undefined
  ) {
    const resetDate = new Date(apiError.rateLimitReset);
    hints.push(
      `Rate limit: ${apiError.rateLimitRemaining} remaining, resets at ${resetDate.toLocaleTimeString()}`
    );
  }

  if (apiError.retryAfter !== undefined) {
    hints.push(`Retry after ${apiError.retryAfter} seconds`);
  }

  return hints;
}

/**
 * Check if an error is a GitHub API error object
 */
function isGitHubApiError(error: unknown): error is GitHubAPIError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as GitHubAPIError).error === 'string' &&
    ('type' in error || 'status' in error || 'scopesSuggestion' in error)
  );
}

/**
 * Create a unified error result for any tool type
 *
 * @param error - The error (string, Error, ToolError, or GitHubAPIError)
 * @param query - Query object with research context
 * @param options - Additional options for error result creation
 * @returns Unified error result compatible with all tools
 *
 * @example
 * // GitHub API tool usage
 * createErrorResult(apiError, query);
 *
 * @example
 * // Local tool usage
 * createErrorResult(error, query, { toolName: 'LOCAL_FETCH_CONTENT' });
 *
 * @example
 * // With extra fields
 * createErrorResult(error, query, {
 *   toolName: 'LOCAL_RIPGREP',
 *   extra: { path: '/some/path', warnings: ['Something happened'] }
 * });
 */
export function createErrorResult(
  error: unknown,
  query: BaseQueryFields,
  options: CreateErrorResultOptions = {}
): UnifiedErrorResult {
  const { toolName, hintContext, extra, customHints, hintSourceError } =
    options;

  // Base result with query context
  const result: UnifiedErrorResult = {
    status: 'error',
    mainResearchGoal: query.mainResearchGoal,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
  };

  // Collect hints from various sources
  const hints: string[] = [];

  // If a separate hint source error is provided, extract hints from it
  // This supports the GitHub API pattern where error and hint source differ
  if (hintSourceError) {
    hints.push(...extractGitHubApiHints(hintSourceError));
  }

  // Handle different error types
  if (isGitHubApiError(error)) {
    // GitHub API error - include full error object
    result.error = error;
    // Only extract hints from error if no separate hint source provided
    if (!hintSourceError) {
      hints.push(...extractGitHubApiHints(error));
    }
  } else if (isToolError(error)) {
    // Local ToolError with error code
    result.error = error.message;
    result.errorCode = error.errorCode;

    // Get tool-specific hints if toolName provided
    if (toolName) {
      const toolHints = getHints(toolName, 'error', {
        originalError: error.message,
        errorType: getErrorTypeFromToolError(error),
        ...hintContext,
      });
      hints.push(...toolHints);
    }
  } else if (typeof error === 'string') {
    // Simple string error
    result.error = error;
  } else if (error instanceof Error) {
    // Convert standard Error to ToolError for consistent handling
    const toolError = toToolError(error);
    result.error = toolError.message;
    result.errorCode = toolError.errorCode;

    // Get tool-specific hints if toolName provided
    if (toolName) {
      const toolHints = getHints(toolName, 'error', {
        originalError: toolError.message,
        ...hintContext,
      });
      hints.push(...toolHints);
    }
  } else {
    // Unknown error type
    result.error = 'Unknown error occurred';
  }

  // Add custom hints
  if (customHints && customHints.length > 0) {
    hints.push(...customHints);
  }

  // Add extra hints from extra object
  if (extra?.hints && Array.isArray(extra.hints)) {
    hints.push(...(extra.hints as string[]));
  }

  // Set hints if any were collected
  if (hints.length > 0) {
    result.hints = hints;
  }

  // Merge extra fields (except hints which we handled separately)
  if (extra) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hints: _extractedHints, ...restExtra } = extra;
    Object.assign(result, restExtra);
  }

  return result;
}

/**
 * Map ToolError to hint context error type
 */
function getErrorTypeFromToolError(
  error: ToolError
): 'size_limit' | 'not_found' | 'permission' | 'pattern_too_broad' | undefined {
  switch (error.errorCode) {
    case 'fileTooLarge':
    case 'outputTooLarge':
    case 'responseTooLarge':
    case 'paginationRequired':
      return 'size_limit';
    case 'fileAccessFailed':
    case 'fileReadFailed':
      return 'not_found';
    case 'pathValidationFailed':
      return 'permission';
    case 'patternTooBroad':
      return 'pattern_too_broad';
    default:
      return undefined;
  }
}

/**
 * Create error result specifically for GitHub API tools
 * Supports the GitHub pattern where error and hint source can differ
 *
 * @param query - Query object with research context
 * @param error - Error string or GitHubAPIError object to store as the error
 * @param apiError - Optional GitHubAPIError for extracting hints (not stored as error)
 * @returns UnifiedErrorResult compatible with GitHub tools
 */
export function createGitHubErrorResult(
  query: BaseQueryFields,
  error: string | GitHubAPIError,
  apiError?: GitHubAPIError
): UnifiedErrorResult {
  return createErrorResult(error, query, {
    hintSourceError: apiError,
  });
}

/**
 * Create error result specifically for local file system tools
 * This is a convenience wrapper with toolName as required parameter
 *
 * @deprecated Use createErrorResult instead - this is kept for backwards compatibility
 */
export function createLocalErrorResult<T extends BaseQueryFields>(
  error: unknown,
  toolName: string,
  query: T,
  extra?: Record<string, unknown>
): UnifiedErrorResult {
  return createErrorResult(error, query, { toolName, extra });
}

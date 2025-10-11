/**
 * Common utility functions shared across all tool implementations
 */

import type { GitHubAPIError } from '../github/githubAPI';
import type { ToolErrorResult, ToolSuccessResult } from './types.js';
import { TOOL_NAMES } from '../constants.js';

/**
 * Extract hints from GitHub API error
 * Propagates the actual API error message and suggestions without rigid transformation
 * @private Internal function used by handleApiError
 */
function extractApiErrorHints(apiError: GitHubAPIError): string[] {
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
 * Create standardized error result for bulk operations
 * Returns a strongly-typed error result with status='error'
 */
export function createErrorResult(
  query: {
    researchGoal?: string;
    reasoning?: string;
    researchSuggestions?: string[];
  },
  error: string | GitHubAPIError,
  apiError?: GitHubAPIError
): ToolErrorResult {
  // Include hints so bulk operations can extract them
  const hints = apiError ? extractApiErrorHints(apiError) : undefined;

  const result: ToolErrorResult = {
    status: 'error',
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    researchSuggestions: query.researchSuggestions,
    error,
  };

  // Only include hints if they exist
  if (hints && hints.length > 0) {
    result.hints = hints;
  }

  return result;
}

/**
 * Create standardized success result for bulk operations
 * Returns a strongly-typed success result with status='hasResults' or status='empty'
 */
export function createSuccessResult<T extends Record<string, unknown>>(
  query: {
    researchGoal?: string;
    reasoning?: string;
    researchSuggestions?: string[];
  },
  data: T,
  hasContent: boolean,
  _toolName: keyof typeof TOOL_NAMES
): ToolSuccessResult<T> & T {
  const status = hasContent ? ('hasResults' as const) : ('empty' as const);

  return {
    status,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    researchSuggestions: query.researchSuggestions,
    ...data,
  };
}

/**
 * Type guard to check if an object has an error property
 */
function hasError(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as Record<string, unknown>).error === 'string'
  );
}

/**
 * Safely extract a typed property from an object
 */
function extractTypedProperty<T>(
  obj: Record<string, unknown>,
  key: string,
  type: 'string' | 'number'
): T | undefined {
  const value = obj[key];
  return typeof value === type ? (value as T) : undefined;
}

/**
 * Handle API result errors consistently across all tools
 * Returns a strongly-typed error result if error is detected, null otherwise
 */
export function handleApiError(
  apiResult: unknown,
  query: {
    researchGoal?: string;
    reasoning?: string;
    researchSuggestions?: string[];
  }
): ToolErrorResult | null {
  if (!hasError(apiResult)) {
    return null;
  }

  const resultObj = apiResult as Record<string, unknown>;

  const apiError: GitHubAPIError = {
    error: apiResult.error as string,
    type:
      (resultObj.type as 'http' | 'graphql' | 'network' | 'unknown') ||
      'unknown',
    status: extractTypedProperty<number>(apiResult, 'status', 'number'),
    scopesSuggestion: extractTypedProperty<string>(
      apiResult,
      'scopesSuggestion',
      'string'
    ),
    rateLimitRemaining: extractTypedProperty<number>(
      apiResult,
      'rateLimitRemaining',
      'number'
    ),
    rateLimitReset: extractTypedProperty<number>(
      apiResult,
      'rateLimitReset',
      'number'
    ),
    retryAfter: extractTypedProperty<number>(apiResult, 'retryAfter', 'number'),
  };

  // Extract hints from the apiResult if they exist (from API error responses)
  const apiHints = Array.isArray(resultObj.hints)
    ? (resultObj.hints as string[])
    : undefined;

  // Combine API error hints with hints from the error object
  const combinedHints = [
    ...(apiHints || []),
    ...extractApiErrorHints(apiError),
  ];

  const errorResult = createErrorResult(query, apiError, apiError);

  // Override hints with combined hints if they exist
  if (combinedHints.length > 0) {
    errorResult.hints = combinedHints;
  }

  return errorResult;
}

/**
 * Handle catch block errors consistently across all tools
 * Returns a strongly-typed error result with error message
 */
export function handleCatchError(
  error: unknown,
  query: {
    researchGoal?: string;
    reasoning?: string;
    researchSuggestions?: string[];
  },
  contextMessage?: string
): ToolErrorResult {
  const errorMessage =
    error instanceof Error ? error.message : 'Unknown error occurred';
  const fullErrorMessage = contextMessage
    ? `${contextMessage}: ${errorMessage}`
    : errorMessage;

  return createErrorResult(query, fullErrorMessage);
}

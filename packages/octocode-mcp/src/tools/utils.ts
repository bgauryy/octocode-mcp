/**
 * Common utility functions shared across all tool implementations
 */

import type { GitHubAPIError } from '../github/githubAPI';
import type { ToolErrorResult, ToolSuccessResult } from '../types.js';
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
    mainResearchGoal?: string;
    researchGoal?: string;
    reasoning?: string;
  },
  error: string | GitHubAPIError,
  apiError?: GitHubAPIError
): ToolErrorResult {
  // Include hints so bulk operations can extract them
  const hints = apiError ? extractApiErrorHints(apiError) : undefined;

  const result: ToolErrorResult = {
    status: 'error',
    mainResearchGoal: query.mainResearchGoal,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
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
export function createSuccessResult<T>(
  query: {
    mainResearchGoal?: string;
    researchGoal?: string;
    reasoning?: string;
  },
  data: T,
  hasContent: boolean,
  _toolName: keyof typeof TOOL_NAMES,
  customHints?: string[]
): ToolSuccessResult<T extends Record<string, unknown> ? T : never> & T {
  const status = hasContent ? ('hasResults' as const) : ('empty' as const);

  const result: Record<string, unknown> = {
    status,
    mainResearchGoal: query.mainResearchGoal,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    ...data,
  };

  // Only include hints if they exist
  if (customHints && customHints.length > 0) {
    result.hints = customHints;
  }

  return result as ToolSuccessResult<
    T extends Record<string, unknown> ? T : never
  > &
    T;
}

/**
 * Type guard to check if an object has an error property
 */
interface ErrorObject {
  error: string;
  type?: 'http' | 'graphql' | 'network' | 'unknown';
  status?: number;
  scopesSuggestion?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  retryAfter?: number;
  hints?: string[];
}

function hasError(value: unknown): value is ErrorObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ErrorObject).error === 'string'
  );
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
  }
): ToolErrorResult | null {
  if (!hasError(apiResult)) {
    return null;
  }

  const apiError: GitHubAPIError = {
    error: apiResult.error,
    type: apiResult.type || 'unknown',
    status: apiResult.status,
    scopesSuggestion: apiResult.scopesSuggestion,
    rateLimitRemaining: apiResult.rateLimitRemaining,
    rateLimitReset: apiResult.rateLimitReset,
    retryAfter: apiResult.retryAfter,
  };

  // Extract hints from the apiResult if they exist (from API error responses)
  const apiHints = apiResult.hints;

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

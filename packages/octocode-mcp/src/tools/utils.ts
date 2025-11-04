import type { GitHubAPIError } from '../github/githubAPI';
import type { ToolErrorResult, ToolSuccessResult } from '../types.js';
import { TOOL_NAMES } from '../constants.js';

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

export function createErrorResult(
  query: {
    mainResearchGoal?: string;
    researchGoal?: string;
    reasoning?: string;
  },
  error: string | GitHubAPIError,
  apiError?: GitHubAPIError
): ToolErrorResult {
  const hints = apiError ? extractApiErrorHints(apiError) : undefined;

  const result: ToolErrorResult = {
    status: 'error',
    mainResearchGoal: query.mainResearchGoal,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    error,
  };

  if (hints && hints.length > 0) {
    result.hints = hints;
  }

  return result;
}

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

  if (customHints && customHints.length > 0) {
    result.hints = customHints;
  }

  return result as ToolSuccessResult<
    T extends Record<string, unknown> ? T : never
  > &
    T;
}

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

  const apiHints = apiResult.hints;

  const combinedHints = [
    ...(apiHints || []),
    ...extractApiErrorHints(apiError),
  ];

  const errorResult = createErrorResult(query, apiError, apiError);

  if (combinedHints.length > 0) {
    errorResult.hints = combinedHints;
  }

  return errorResult;
}

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

import type { GitHubAPIError } from '../github/githubAPI';
import type { ToolErrorResult, ToolSuccessResult } from '../types.js';
import { getToolHintsSync } from './toolMetadata.js';
import { logSessionError } from '../session.js';
import { TOOL_ERRORS } from '../errorCodes.js';
import { createErrorResult } from '../utils/errorResult.js';

// Re-export createErrorResult for backwards compatibility during migration
export { createErrorResult };

/**
 * Extract hints from GitHub API errors
 * @internal Used by handleApiError
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

export function createSuccessResult<T extends Record<string, unknown>>(
  query: {
    mainResearchGoal?: string;
    researchGoal?: string;
    reasoning?: string;
  },
  data: T,
  hasContent: boolean,
  toolName: string,
  customHints?: string[]
): ToolSuccessResult<T> & T {
  const status = hasContent ? ('hasResults' as const) : ('empty' as const);

  const result: Record<string, unknown> = {
    status,
    mainResearchGoal: query.mainResearchGoal,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    ...data,
  };

  const staticHints = getToolHintsSync(toolName, status);
  const allHints = [...staticHints, ...(customHints || [])];

  if (allHints.length > 0) {
    result.hints = allHints;
  }

  return result as ToolSuccessResult<T> & T;
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
    mainResearchGoal?: string;
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

  const errorResult = createErrorResult(apiError, query, {
    hintSourceError: apiError,
    customHints: combinedHints,
  });

  return errorResult as ToolErrorResult;
}

export function handleCatchError(
  error: unknown,
  query: {
    mainResearchGoal?: string;
    researchGoal?: string;
    reasoning?: string;
  },
  contextMessage?: string,
  toolName?: string
): ToolErrorResult {
  const errorMessage =
    error instanceof Error ? error.message : 'Unknown error occurred';
  const fullErrorMessage = contextMessage
    ? `${contextMessage}: ${errorMessage}`
    : errorMessage;

  // Log the error to session for monitoring
  const logToolName = toolName || contextMessage || 'unknown_tool';
  logSessionError(logToolName, TOOL_ERRORS.EXECUTION_FAILED.code).catch(
    () => {}
  );

  return createErrorResult(fullErrorMessage, query) as ToolErrorResult;
}

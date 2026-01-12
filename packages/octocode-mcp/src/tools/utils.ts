import type { GitHubAPIError } from '../github/githubAPI';
import type {
  ToolErrorResult,
  ToolSuccessResult,
  ToolInvocationCallback,
} from '../types.js';
import type { HintContext } from '../types/metadata.js';
import { getHints } from '../hints/index.js';
import { logSessionError } from '../session.js';
import { TOOL_ERRORS } from '../errorCodes.js';
import { createErrorResult } from '../utils/response/error.js';

export { createErrorResult };

/**
 * Safely invoke a tool invocation callback with error logging.
 * Errors are logged but not thrown - callback failures shouldn't block tool execution.
 */
export async function invokeCallbackSafely(
  callback: ToolInvocationCallback | undefined,
  toolName: string,
  queries: unknown[]
): Promise<void> {
  if (!callback) return;
  try {
    await callback(toolName, queries);
  } catch {
    // Log callback failure to session for monitoring
    logSessionError(toolName, TOOL_ERRORS.EXECUTION_FAILED.code).catch(
      () => {}
    );
  }
}

/**
 * Options for createSuccessResult hint generation
 */
interface SuccessResultOptions {
  /** Context for generating dynamic hints */
  hintContext?: HintContext;
  /** Additional custom hints to append (e.g., pagination hints) */
  extraHints?: string[];
}

/**
 * Create a success result with unified hint generation.
 * Uses getHints() to combine static hints from metadata + dynamic context-aware hints.
 *
 * @param query - The original query with research context
 * @param data - The result data
 * @param hasContent - Whether the result has content (determines hasResults vs empty status)
 * @param toolName - The tool name for hint lookup
 * @param options - Options for hint generation (context and extra hints)
 * @returns Formatted success result with hints
 *
 * @example
 * // Basic usage (static hints only)
 * createSuccessResult(query, data, true, 'githubSearchCode');
 *
 * @example
 * // With context for dynamic hints
 * createSuccessResult(query, data, true, 'githubSearchCode', {
 *   hintContext: { hasOwnerRepo: true, match: 'file' }
 * });
 *
 * @example
 * // With extra hints (e.g., pagination)
 * createSuccessResult(query, data, true, 'githubSearchCode', {
 *   hintContext: { hasOwnerRepo: true },
 *   extraHints: ['Page 1/5', 'Next: page=2']
 * });
 */
export function createSuccessResult<T extends Record<string, unknown>>(
  query: {
    mainResearchGoal?: string;
    researchGoal?: string;
    reasoning?: string;
  },
  data: T,
  hasContent: boolean,
  toolName: string,
  options?: SuccessResultOptions
): ToolSuccessResult<T> & T {
  const status = hasContent ? ('hasResults' as const) : ('empty' as const);

  const result: Record<string, unknown> = {
    status,
    mainResearchGoal: query.mainResearchGoal,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    ...data,
  };

  // Use unified getHints() which combines static + dynamic hints
  const hints = getHints(toolName, status, options?.hintContext);
  const extraHints = options?.extraHints || [];

  // Combine, deduplicate, and filter empty/whitespace-only hints
  const allHints = [...new Set([...hints, ...extraHints])].filter(
    h => h && h.trim().length > 0
  );

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

  const externalHints = apiResult.hints || [];

  const errorResult = createErrorResult(apiError, query, {
    hintSourceError: apiError,
    customHints: externalHints,
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

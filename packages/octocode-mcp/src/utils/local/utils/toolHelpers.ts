/**
 * Helper utilities for local tools
 */

import { pathValidator } from '../../../security/pathValidator.js';
import { ToolErrors, toToolError } from '../../../errorCodes.js';
import { getToolHints, type LocalToolName } from '../../../tools/hints.js';
import type { BaseQuery } from '../../../utils/types.js';

/**
 * Path validation result with error result for tool returns
 */
interface ToolPathValidationResult {
  isValid: boolean;
  errorResult?: {
    status: 'error';
    errorCode: string;
    researchGoal?: string;
    reasoning?: string;
    hints?: string[];
    [key: string]: unknown;
  };
}

/**
 * Validate tool path and return validation result
 */
export function validateToolPath(
  query: BaseQuery & { path: string },
  toolName: string
): ToolPathValidationResult {
  const validation = pathValidator.validate(query.path);

  if (!validation.isValid) {
    const toolError = ToolErrors.pathValidationFailed(
      query.path,
      validation.error
    );

    return {
      isValid: false,
      errorResult: {
        status: 'error',
        errorCode: toolError.errorCode,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: getToolHints(toolName as LocalToolName, 'error', {
          errorType: 'permission',
          path: query.path,
          originalError: validation.error,
        }),
      },
    };
  }

  return { isValid: true };
}

/**
 * Create error result for local file system tools
 * Handles local tool errors with error codes and hints
 */
export function createErrorResult<T extends BaseQuery>(
  error: unknown,
  toolName: string,
  query: T,
  extra?: Record<string, unknown>
): {
  status: 'error';
  errorCode: string;
  researchGoal?: string;
  reasoning?: string;
  hints?: string[];
  [key: string]: unknown;
} {
  const toolError = toToolError(error);
  const hints = getToolHints(toolName as LocalToolName, 'error', {
    originalError: toolError.message,
    ...extra,
  });

  return {
    status: 'error',
    errorCode: toolError.errorCode,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    hints: extra?.hints ? [...hints, ...(extra.hints as string[])] : hints,
    ...extra,
  };
}

/**
 * Options for checkLargeOutputSafety
 */
interface LargeOutputSafetyOptions {
  threshold?: number;
  itemType?: string;
  detailed?: boolean;
}

/**
 * Result of large output safety check
 */
interface LargeOutputSafetyResult {
  shouldBlock: boolean;
  errorCode?: string;
  hints?: string[];
}

/**
 * Check if output is too large and should be blocked
 */
export function checkLargeOutputSafety(
  itemCount: number,
  hasCharLength: boolean,
  options: LargeOutputSafetyOptions = {}
): LargeOutputSafetyResult {
  const { threshold = 100, itemType = 'item', detailed = false } = options;

  // If charLength is provided, pagination is already handled
  if (hasCharLength) {
    return { shouldBlock: false };
  }

  // Check if item count exceeds threshold
  if (itemCount > threshold) {
    const toolError = ToolErrors.outputTooLarge(itemCount, threshold);

    return {
      shouldBlock: true,
      errorCode: toolError.errorCode,
      hints: [
        `Found ${itemCount} ${itemType}${itemCount === 1 ? '' : 's'} - exceeds safe limit of ${threshold}`,
        `Use charLength to paginate through results`,
        detailed
          ? 'Detailed results increase size - consider using charLength for pagination'
          : 'Consider using charLength to paginate large result sets',
      ],
    };
  }

  return { shouldBlock: false };
}

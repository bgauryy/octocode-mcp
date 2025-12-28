/**
 * Helper utilities for local tools
 */

import { pathValidator } from '../../../security/pathValidator.js';
import { ToolErrors } from '../../../errorCodes.js';
import type { BaseQuery } from '../../../utils/types.js';
import {
  createErrorResult as createUnifiedErrorResult,
  type UnifiedErrorResult,
} from '../../errorResult.js';

/**
 * Local error result type - compatible with UnifiedErrorResult
 */
export type LocalErrorResult = UnifiedErrorResult;

/**
 * Path validation result with error result for tool returns
 */
interface ToolPathValidationResult {
  isValid: boolean;
  errorResult?: LocalErrorResult;
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
      errorResult: createUnifiedErrorResult(toolError, query, {
        toolName,
        hintContext: {
          errorType: 'permission',
          path: query.path,
          originalError: validation.error,
        },
      }),
    };
  }

  return { isValid: true };
}

/**
 * Create error result for local file system tools
 * Uses the unified error result system with local tool-specific configuration
 *
 * @param error - The error (Error, ToolError, or unknown)
 * @param toolName - Tool name for hint generation (e.g., 'LOCAL_FETCH_CONTENT')
 * @param query - Query object with research context
 * @param extra - Additional fields to include in the result
 * @returns LocalErrorResult compatible with local tool responses
 */
export function createErrorResult<T extends BaseQuery>(
  error: unknown,
  toolName: string,
  query: T,
  extra?: Record<string, unknown>
): LocalErrorResult {
  return createUnifiedErrorResult(error, query, {
    toolName,
    extra,
    hintContext: extra,
  });
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

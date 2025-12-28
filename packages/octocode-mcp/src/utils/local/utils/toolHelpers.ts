/**
 * Helper utilities for local tools
 */

import { pathValidator } from '../../../security/pathValidator.js';
import { ToolErrors } from '../../../errorCodes.js';
import type { BaseQuery } from '../../../utils/types.js';
import {
  createErrorResult,
  type UnifiedErrorResult,
} from '../../errorResult.js';

/**
 * Local error result type - compatible with UnifiedErrorResult
 */
export type LocalErrorResult = UnifiedErrorResult;

// Re-export createErrorResult for backwards compatibility during migration
// Consumers should migrate to importing directly from '../utils/errorResult.js'
export { createErrorResult };

/**
 * Path validation result with error result for tool returns
 */
interface ToolPathValidationResult {
  isValid: boolean;
  errorResult?: LocalErrorResult;
  sanitizedPath?: string;
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
      errorResult: createErrorResult(toolError, query, {
        toolName,
        hintContext: {
          errorType: 'permission',
          path: query.path,
          originalError: validation.error,
        },
      }),
    };
  }

  return { isValid: true, sanitizedPath: validation.sanitizedPath };
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

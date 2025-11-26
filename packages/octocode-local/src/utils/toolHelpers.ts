/**
 * Common utilities for tool implementations
 * Reduces code duplication and improves consistency across all tools
 */

import { pathValidator } from '../security/pathValidator.js';
import { getToolHints } from '../tools/hints.js';
import { RESOURCE_LIMITS } from '../constants.js';
import type { ToolName } from '../tools/hints.js';
import {
  ToolError,
  isToolError,
  toToolError,
  ERROR_CODES,
  type ErrorCode,
} from '../errors/errorCodes.js';

/**
 * Base query interface - all tool queries extend this
 */
export interface ToolQuery {
  path: string;
  researchGoal?: string;
  reasoning?: string;
}

/**
 * Base result interface - all tool results extend this
 */
export interface ToolResult {
  status: 'hasResults' | 'empty' | 'error';
  error?: string;
  errorCode?: ErrorCode;
  researchGoal?: string;
  reasoning?: string;
  hints?: readonly string[];
}

/**
 * Path validation result (discriminated union for type safety)
 */
export type PathValidationResult<T extends ToolQuery> =
  | {
      isValid: true;
      sanitizedPath: string;
      query: T;
    }
  | {
      isValid: false;
      errorResult: ToolResult;
    };

/**
 * Validates a tool query path and returns either the sanitized path or an error result
 *
 * This helper eliminates 10-15 lines of boilerplate from each tool:
 * - Validates path security
 * - Constructs error result if invalid
 * - Returns sanitized path for use
 *
 * @param query - Tool query with path field
 * @param toolName - Tool name for error hints
 * @returns Validation result with sanitized path or error
 *
 * @example
 * ```typescript
 * const validation = validateToolPath(query, 'LOCAL_RIPGREP');
 * if (!validation.isValid) {
 *   return validation.errorResult;
 * }
 * const sanitizedPath = validation.sanitizedPath;
 * // Use sanitizedPath safely...
 * ```
 */
export function validateToolPath<T extends ToolQuery>(
  query: T,
  toolName: ToolName
): PathValidationResult<T> {
  const pathValidation = pathValidator.validate(query.path);

  if (!pathValidation.isValid) {
    return {
      isValid: false,
      errorResult: {
        status: 'error',
        error: pathValidation.error,
        errorCode: ERROR_CODES.PATH_VALIDATION_FAILED,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: getToolHints(toolName, 'error'),
      },
    };
  }

  return {
    isValid: true,
    sanitizedPath: pathValidation.sanitizedPath!,
    query,
  };
}

/**
 * Creates a standardized error result from a ToolError
 *
 * This helper eliminates 7-10 lines of boilerplate from each tool's catch block:
 * - Accepts typed ToolError instances with error codes
 * - Extracts error code from the error itself (not passed separately)
 * - Includes query context (researchGoal, reasoning)
 * - Adds appropriate hints for the tool
 * - Includes error context if available
 *
 * @param error - ToolError instance (or unknown, will be converted)
 * @param toolName - Tool name for error hints
 * @param query - Query that caused the error (for context)
 * @param additionalFields - Optional additional fields to merge into result
 * @returns Standardized error result with proper error code
 *
 * @example
 * ```typescript
 * try {
 *   // ... tool logic ...
 * } catch (error) {
 *   // Convert unknown error to ToolError
 *   const toolError = isToolError(error)
 *     ? error
 *     : toToolError(error, ERROR_CODES.TOOL_EXECUTION_FAILED);
 *   return createErrorResult(toolError, 'LOCAL_FIND_FILES', query);
 * }
 *
 * // Or throw ToolError directly from tools:
 * if (!canAccessFile) {
 *   const error = ToolErrors.fileAccessFailed(path);
 *   return createErrorResult(error, 'LOCAL_FETCH_CONTENT', query);
 * }
 * ```
 */
export function createErrorResult<T extends ToolQuery>(
  error: ToolError | unknown,
  toolName: ToolName,
  query: T,
  additionalFields?: Record<string, unknown>
): ToolResult & Record<string, unknown> {
  // Convert to ToolError if not already
  const toolError = isToolError(error)
    ? error
    : toToolError(error, ERROR_CODES.TOOL_EXECUTION_FAILED);

  return {
    status: 'error',
    errorCode: toolError.errorCode,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    hints: getToolHints(toolName, 'error'),
    // Include error context if available
    ...(toolError.context ? { context: toolError.context } : {}),
    // Additional fields override context if there are conflicts
    ...additionalFields,
  };
}

/**
 * Large output safety check result
 */
export interface LargeOutputCheck {
  /** Whether the output should be blocked (too large without pagination) */
  shouldBlock: boolean;
  /** Error code if blocked */
  errorCode?: ErrorCode;
  /** Hints for resolving the issue */
  hints?: string[];
  /** Estimated token count */
  estimatedTokens?: number;
}

/**
 * Checks if output is too large and should require pagination
 *
 * This helper eliminates 15-20 lines of boilerplate from tools that handle large outputs:
 * - Checks if result exceeds threshold
 * - Calculates token estimates
 * - Generates helpful error messages and hints
 *
 * Used by: local_find_files, local_fetch_content, local_view_structure
 *
 * @param itemCount - Number of items (files, entries, characters, etc.)
 * @param hasCharLength - Whether pagination (charLength) is specified
 * @param options - Configuration for the check
 * @returns Safety check result with block decision and hints
 *
 * @example
 * ```typescript
 * const safetyCheck = checkLargeOutputSafety(files.length, !!query.charLength, {
 *   threshold: 100,
 *   itemType: 'file',
 *   detailed: query.details,
 * });
 * if (safetyCheck.shouldBlock) {
 *   return {
 *     status: 'error',
 *     errorCode: safetyCheck.errorCode!,
 *     hints: safetyCheck.hints!,
 *     // ...
 *   };
 * }
 * ```
 */
export function checkLargeOutputSafety(
  itemCount: number,
  hasCharLength: boolean,
  options: {
    /** Maximum items allowed without pagination */
    threshold: number;
    /** Type of item for error messages */
    itemType: 'file' | 'entry' | 'char';
    /** Average size per item (bytes or chars) */
    avgSizePerItem?: number;
    /** Whether detailed output is requested (affects size estimate) */
    detailed?: boolean;
    /** Custom hints to add */
    customHints?: string[];
  }
): LargeOutputCheck {
  if (hasCharLength || itemCount <= options.threshold) {
    return { shouldBlock: false };
  }

  let avgSize = options.avgSizePerItem;
  if (!avgSize) {
    if (options.itemType === 'char') {
      avgSize = 1;
    } else if (options.detailed) {
      avgSize = 150;
    } else {
      avgSize = 50;
    }
  }

  const estimatedSize = itemCount * avgSize;
  const estimatedTokens = Math.ceil(
    estimatedSize / RESOURCE_LIMITS.CHARS_PER_TOKEN
  );

  const hints = [
    `RECOMMENDED: charLength=${RESOURCE_LIMITS.RECOMMENDED_CHAR_LENGTH} (paginate results)`,
    `Full result would be approximately ${estimatedTokens.toLocaleString()} tokens`,
    'ALTERNATIVE: Use limit parameter to reduce results',
    'NOTE: Large token usage can impact performance',
    ...(options.customHints || []),
  ];

  return {
    shouldBlock: true,
    errorCode: ERROR_CODES.OUTPUT_TOO_LARGE,
    hints,
    estimatedTokens,
  };
}

/**
 * Helper utilities for local tools
 */

import path from 'path';
import { pathValidator } from '../../security/pathValidator.js';
import { ToolErrors } from '../../errorCodes.js';
import type { BaseQuery } from '../core/types.js';
import {
  createErrorResult,
  type UnifiedErrorResult,
} from '../response/error.js';

/**
 * Local error result type - compatible with UnifiedErrorResult
 */
type LocalErrorResult = UnifiedErrorResult;

// Re-export createErrorResult  during migration
// Consumers should migrate to importing directly from '../response/error.js'
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
 * Generate hints for path-related errors based on the error type
 */
function getPathErrorHints(
  inputPath: string,
  errorMessage: string | undefined,
  cwd: string,
  resolvedPath: string
): string[] {
  const hints: string[] = [];

  // Determine error type and provide targeted hints
  const isOutsideAllowedDirs = errorMessage?.includes('outside allowed');
  const isPermissionDenied = errorMessage?.includes('Permission denied');
  const isSymlinkIssue =
    errorMessage?.includes('Symlink') || errorMessage?.includes('symlink');
  const isNotFound =
    errorMessage?.includes('ENOENT') || errorMessage?.includes('not found');

  // Always show CWD context for debugging
  hints.push(`Current working directory (CWD): ${cwd}`);

  if (inputPath !== resolvedPath) {
    hints.push(`Path resolved to: ${resolvedPath}`);
  }

  // Path outside allowed directories - most common issue
  if (isOutsideAllowedDirs) {
    hints.push('');
    hints.push('🔧 Fix: Use an absolute path within the workspace:');
    hints.push(`   Instead of: path="${inputPath}"`);
    hints.push(`   Try: path="${cwd}" (workspace root)`);
    hints.push(
      '   Or: path="/absolute/path/to/your/target" (full absolute path)'
    );
  } else if (isPermissionDenied) {
    hints.push('');
    hints.push('🔒 Permission denied - check file/directory permissions');
  } else if (isSymlinkIssue) {
    hints.push('');
    hints.push(
      '🔗 Symlink issue - the target may be outside allowed directories'
    );
  } else if (isNotFound) {
    hints.push('');
    hints.push('📁 Path not found - verify the path exists');
    hints.push(
      `   Use absolute path to avoid CWD ambiguity: path="${cwd}/..."`
    );
  }

  // General advice
  hints.push('');
  hints.push(
    '💡 TIP: Relative paths resolve from CWD, which may differ from your workspace.'
  );
  hints.push('   Always prefer absolute paths for reliable results.');

  return hints;
}

/**
 * Validate tool path and return validation result
 */
export function validateToolPath(
  query: BaseQuery & { path: string },
  toolName: string
): ToolPathValidationResult {
  const cwd = process.cwd();
  const resolvedPath = path.resolve(query.path);

  const validation = pathValidator.validate(query.path);

  if (!validation.isValid) {
    const toolError = ToolErrors.pathValidationFailed(
      query.path,
      validation.error
    );

    const pathHints = getPathErrorHints(
      query.path,
      validation.error,
      cwd,
      resolvedPath
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
        extra: {
          cwd,
          resolvedPath,
        },
        customHints: pathHints,
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

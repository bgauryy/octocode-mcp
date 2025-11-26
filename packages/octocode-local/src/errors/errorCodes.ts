/**
 * Centralized error codes and types for all tools
 *
 * This file defines:
 * - All possible error codes across all tools
 * - Error categories for organization
 * - Typed error classes that carry error codes
 * - Type-safe error handling
 */

/**
 * All error codes used across the tool system
 * Organized by category for maintainability
 */
export const ERROR_CODES = {
  // Path & File Access Errors
  PATH_VALIDATION_FAILED: 'pathValidationFailed',
  FILE_ACCESS_FAILED: 'fileAccessFailed',
  FILE_READ_FAILED: 'fileReadFailed',
  FILE_TOO_LARGE: 'fileTooLarge',

  // Search & Pattern Errors
  NO_MATCHES: 'noMatches',
  PATTERN_TOO_BROAD: 'patternTooBroad',

  // Pagination & Output Errors
  PAGINATION_REQUIRED: 'paginationRequired',
  OUTPUT_TOO_LARGE: 'outputTooLarge',
  RESPONSE_TOO_LARGE: 'responseTooLarge',

  // Execution Errors
  COMMAND_EXECUTION_FAILED: 'commandExecutionFailed',
  QUERY_EXECUTION_FAILED: 'queryExecutionFailed',
  TOOL_EXECUTION_FAILED: 'toolExecutionFailed',
} as const;

/**
 * Error code type - union of all possible error codes
 */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Error categories for organization and filtering
 */
export enum ErrorCategory {
  FILE_SYSTEM = 'FILE_SYSTEM',
  VALIDATION = 'VALIDATION',
  SEARCH = 'SEARCH',
  PAGINATION = 'PAGINATION',
  EXECUTION = 'EXECUTION',
}

/**
 * Metadata about each error code
 */
interface ErrorCodeMetadata {
  code: ErrorCode;
  category: ErrorCategory;
  description: string;
  recoverability: 'recoverable' | 'unrecoverable' | 'user-action-required';
}

/**
 * Complete error code registry with metadata
 * Useful for documentation, error handling logic, and debugging
 */
export const ERROR_CODE_REGISTRY: Record<ErrorCode, ErrorCodeMetadata> = {
  // Path & File Access
  [ERROR_CODES.PATH_VALIDATION_FAILED]: {
    code: ERROR_CODES.PATH_VALIDATION_FAILED,
    category: ErrorCategory.VALIDATION,
    description: 'Path validation failed - invalid or unsafe path',
    recoverability: 'user-action-required',
  },
  [ERROR_CODES.FILE_ACCESS_FAILED]: {
    code: ERROR_CODES.FILE_ACCESS_FAILED,
    category: ErrorCategory.FILE_SYSTEM,
    description: 'Cannot access file - may not exist or lack permissions',
    recoverability: 'unrecoverable',
  },
  [ERROR_CODES.FILE_READ_FAILED]: {
    code: ERROR_CODES.FILE_READ_FAILED,
    category: ErrorCategory.FILE_SYSTEM,
    description: 'Failed to read file contents',
    recoverability: 'unrecoverable',
  },
  [ERROR_CODES.FILE_TOO_LARGE]: {
    code: ERROR_CODES.FILE_TOO_LARGE,
    category: ErrorCategory.FILE_SYSTEM,
    description: 'File exceeds size limits for operation',
    recoverability: 'user-action-required',
  },

  // Search & Pattern
  [ERROR_CODES.NO_MATCHES]: {
    code: ERROR_CODES.NO_MATCHES,
    category: ErrorCategory.SEARCH,
    description: 'Search pattern found no matches',
    recoverability: 'user-action-required',
  },
  [ERROR_CODES.PATTERN_TOO_BROAD]: {
    code: ERROR_CODES.PATTERN_TOO_BROAD,
    category: ErrorCategory.SEARCH,
    description:
      'Search pattern is too broad and would return too many results',
    recoverability: 'user-action-required',
  },

  // Pagination & Output
  [ERROR_CODES.PAGINATION_REQUIRED]: {
    code: ERROR_CODES.PAGINATION_REQUIRED,
    category: ErrorCategory.PAGINATION,
    description: 'Result set too large - pagination required',
    recoverability: 'user-action-required',
  },
  [ERROR_CODES.OUTPUT_TOO_LARGE]: {
    code: ERROR_CODES.OUTPUT_TOO_LARGE,
    category: ErrorCategory.PAGINATION,
    description: 'Output exceeds size limits',
    recoverability: 'user-action-required',
  },
  [ERROR_CODES.RESPONSE_TOO_LARGE]: {
    code: ERROR_CODES.RESPONSE_TOO_LARGE,
    category: ErrorCategory.PAGINATION,
    description: 'Response exceeds maximum allowed size',
    recoverability: 'user-action-required',
  },

  // Execution
  [ERROR_CODES.COMMAND_EXECUTION_FAILED]: {
    code: ERROR_CODES.COMMAND_EXECUTION_FAILED,
    category: ErrorCategory.EXECUTION,
    description: 'System command execution failed',
    recoverability: 'unrecoverable',
  },
  [ERROR_CODES.QUERY_EXECUTION_FAILED]: {
    code: ERROR_CODES.QUERY_EXECUTION_FAILED,
    category: ErrorCategory.EXECUTION,
    description: 'Query execution failed',
    recoverability: 'unrecoverable',
  },
  [ERROR_CODES.TOOL_EXECUTION_FAILED]: {
    code: ERROR_CODES.TOOL_EXECUTION_FAILED,
    category: ErrorCategory.EXECUTION,
    description: 'Generic tool execution failure',
    recoverability: 'unrecoverable',
  },
};

/**
 * Custom error class that carries an error code
 * All tools should throw/return instances of this class
 */
export class ToolError extends Error {
  public readonly errorCode: ErrorCode;
  public readonly category: ErrorCategory;
  public readonly recoverability:
    | 'recoverable'
    | 'unrecoverable'
    | 'user-action-required';
  public readonly context?: Record<string, unknown>;

  /**
   * Create a new ToolError with a specific error code
   *
   * @param errorCode - One of the predefined error codes
   * @param message - Human-readable error message (optional, uses registry description if not provided)
   * @param context - Additional context data (file paths, values, etc.)
   * @param cause - Original error if this is wrapping another error
   */
  constructor(
    errorCode: ErrorCode,
    message?: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    const metadata = ERROR_CODE_REGISTRY[errorCode];
    const finalMessage = message || metadata.description;

    super(finalMessage);

    this.name = 'ToolError';
    this.errorCode = errorCode;
    this.category = metadata.category;
    this.recoverability = metadata.recoverability;
    this.context = context;

    // Preserve stack trace from cause if provided
    if (cause && cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ToolError.prototype);
  }

  /**
   * Check if error is recoverable
   */
  isRecoverable(): boolean {
    return this.recoverability === 'recoverable';
  }

  /**
   * Check if error requires user action
   */
  requiresUserAction(): boolean {
    return this.recoverability === 'user-action-required';
  }

  /**
   * Get error as plain object (useful for serialization)
   */
  toJSON() {
    return {
      name: this.name,
      errorCode: this.errorCode,
      category: this.category,
      message: this.message,
      recoverability: this.recoverability,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Type guard to check if an error is a ToolError
 */
export function isToolError(error: unknown): error is ToolError {
  return error instanceof ToolError;
}

/**
 * Helper to create ToolError from unknown error
 * Converts any error to a ToolError with appropriate error code
 */
export function toToolError(
  error: unknown,
  defaultErrorCode: ErrorCode = ERROR_CODES.TOOL_EXECUTION_FAILED,
  context?: Record<string, unknown>
): ToolError {
  if (isToolError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new ToolError(defaultErrorCode, error.message, context, error);
  }

  const message = String(error);
  return new ToolError(defaultErrorCode, message, context);
}

/**
 * Convenience factory functions for common errors
 */
export const ToolErrors = {
  pathValidationFailed: (path: string, reason?: string) =>
    new ToolError(
      ERROR_CODES.PATH_VALIDATION_FAILED,
      reason || `Path validation failed: ${path}`,
      { path }
    ),

  fileAccessFailed: (path: string, cause?: Error) =>
    new ToolError(
      ERROR_CODES.FILE_ACCESS_FAILED,
      `Cannot access file: ${path}`,
      { path },
      cause
    ),

  fileReadFailed: (path: string, cause?: Error) =>
    new ToolError(
      ERROR_CODES.FILE_READ_FAILED,
      `Failed to read file: ${path}`,
      { path },
      cause
    ),

  fileTooLarge: (path: string, sizeKB: number, limitKB: number) =>
    new ToolError(
      ERROR_CODES.FILE_TOO_LARGE,
      (() => {
        const fmt = (n: number) =>
          Number.isInteger(n) ? `${n}KB` : `${n.toFixed(1)}KB`;
        return `File too large: ${fmt(sizeKB)} (limit: ${fmt(limitKB)})`;
      })(),
      { path, sizeKB, limitKB }
    ),

  noMatches: (pattern: string, context?: Record<string, unknown>) =>
    new ToolError(
      ERROR_CODES.NO_MATCHES,
      `No matches found for pattern: ${pattern}`,
      { pattern, ...context }
    ),

  patternTooBroad: (pattern: string, matchCount: number) =>
    new ToolError(
      ERROR_CODES.PATTERN_TOO_BROAD,
      `Pattern too broad: ${matchCount} matches found`,
      { pattern, matchCount }
    ),

  paginationRequired: (itemCount: number) =>
    new ToolError(
      ERROR_CODES.PAGINATION_REQUIRED,
      `Pagination required: ${itemCount} characters`,
      { itemCount }
    ),

  outputTooLarge: (size: number, limit: number) =>
    new ToolError(
      ERROR_CODES.OUTPUT_TOO_LARGE,
      `Output too large: ${size} (limit: ${limit})`,
      { size, limit }
    ),

  responseTooLarge: (tokens: number, limit: number) =>
    new ToolError(
      ERROR_CODES.RESPONSE_TOO_LARGE,
      `Response too large: ${tokens} tokens (limit: ${limit})`,
      { tokens, limit }
    ),

  commandExecutionFailed: (command: string, cause?: Error) =>
    new ToolError(
      ERROR_CODES.COMMAND_EXECUTION_FAILED,
      `Command execution failed: ${command}`,
      { command },
      cause
    ),

  queryExecutionFailed: (queryId?: string, cause?: Error) =>
    new ToolError(
      ERROR_CODES.QUERY_EXECUTION_FAILED,
      'Query execution failed',
      { queryId },
      cause
    ),

  toolExecutionFailed: (toolName: string, cause?: Error) =>
    new ToolError(
      ERROR_CODES.TOOL_EXECUTION_FAILED,
      `Tool execution failed: ${toolName}`,
      { toolName },
      cause
    ),
};

/**
 * ToolError class and type guards for typed error handling.
 */

import {
  LOCAL_TOOL_ERROR_CODES,
  LOCAL_TOOL_ERROR_REGISTRY,
  LocalToolErrorCategory,
  type LocalToolErrorCode,
} from './localToolErrors.js';

// Re-export for convenience
export { LOCAL_TOOL_ERROR_CODES, LocalToolErrorCategory };
export type { LocalToolErrorCode };

/**
 * Custom error class that carries an error code
 * All tools should throw/return instances of this class
 */
export class ToolError extends Error {
  public readonly errorCode: LocalToolErrorCode;
  public readonly category: LocalToolErrorCategory;
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
    errorCode: LocalToolErrorCode,
    message?: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    const metadata = LOCAL_TOOL_ERROR_REGISTRY[errorCode];
    const finalMessage = message || metadata.description;

    // Pass cause to Error constructor for ES2022+ cause support
    super(finalMessage, cause ? { cause } : undefined);

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
  defaultErrorCode: LocalToolErrorCode = LOCAL_TOOL_ERROR_CODES.TOOL_EXECUTION_FAILED,
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

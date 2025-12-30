/**
 * Centralized error codes and types for all tools
 *
 * This file defines:
 * - Domain-specific error constants (CONFIG, VALIDATION, FETCH, etc.)
 * - Local tool error codes with metadata and recoverability
 * - ToolError class for typed error handling
 * - Factory functions for common error patterns
 */

// ============================================================================
// DOMAIN-SPECIFIC ERROR CONSTANTS
// ============================================================================

export const CONFIG_ERRORS = {
  NOT_INITIALIZED: {
    code: 'CONFIG_NOT_INITIALIZED',
    message:
      'Configuration not initialized. Call initialize() and await its completion before calling getServerConfig().',
  },
  NO_GITHUB_TOKEN: {
    code: 'CONFIG_NO_GITHUB_TOKEN',
    message:
      'No GitHub token found. Please authenticate with GitHub CLI (gh auth login) or set GITHUB_TOKEN/GH_TOKEN environment variable',
  },
} as const;

export const VALIDATION_ERRORS = {
  PROMISES_NOT_ARRAY: {
    code: 'VALIDATION_PROMISES_NOT_ARRAY',
    message: 'promises must be an array',
  },
  TIMEOUT_NOT_POSITIVE: {
    code: 'VALIDATION_TIMEOUT_NOT_POSITIVE',
    message: 'timeout must be positive',
  },
  CONCURRENCY_NOT_POSITIVE: {
    code: 'VALIDATION_CONCURRENCY_NOT_POSITIVE',
    message: 'concurrency must be positive',
  },
  INVALID_PARAMETERS: {
    code: 'VALIDATION_INVALID_PARAMETERS',
    message: 'Invalid parameters: must be an object',
  },
  INVALID_PARAMETER_KEY: {
    code: 'VALIDATION_INVALID_PARAMETER_KEY',
    message: (key: string) => `Invalid parameter key: ${key}`,
  },
  INVALID_NESTED_OBJECT: {
    code: 'VALIDATION_INVALID_NESTED_OBJECT',
    message: (key: string, warnings: string) =>
      `Invalid nested object in parameter ${key}: ${warnings}`,
  },
} as const;

export const FETCH_ERRORS = {
  FETCH_NOT_AVAILABLE: {
    code: 'FETCH_NOT_AVAILABLE',
    message: 'Global fetch is not available in this environment.',
  },
  FETCH_FAILED_AFTER_RETRIES: {
    code: 'FETCH_FAILED_AFTER_RETRIES',
    message: (attempts: number, errorMessage: string) =>
      `Failed to fetch after ${attempts} attempts: ${errorMessage}`,
  },
  FETCH_HTTP_ERROR: {
    code: 'FETCH_HTTP_ERROR',
    message: (status: number, statusText: string) =>
      `Failed to fetch (${status} ${statusText})`,
  },
} as const;

export const TOOL_METADATA_ERRORS = {
  INVALID_FORMAT: {
    code: 'TOOL_METADATA_INVALID_FORMAT',
    message: 'Invalid tool metadata format from remote source.',
  },
  INVALID_API_RESPONSE: {
    code: 'TOOL_METADATA_INVALID_API_RESPONSE',
    message: 'Invalid API response structure',
  },
} as const;

export const FILE_OPERATION_ERRORS = {
  PATH_IS_DIRECTORY: {
    code: 'FILE_PATH_IS_DIRECTORY',
    message: (toolName: string) =>
      `Path is a directory. Use ${toolName} to list directory contents`,
  },
  FILE_TOO_LARGE: {
    code: 'FILE_TOO_LARGE',
    message: (fileSizeKB: number, maxSizeKB: number, toolName: string) =>
      `File too large (${fileSizeKB}KB > ${maxSizeKB}KB). Use ${toolName} to search within the file or use startLine/endLine parameters to get specific sections`,
  },
  FILE_EMPTY: {
    code: 'FILE_EMPTY',
    message: 'File is empty - no content to display',
  },
  BINARY_FILE: {
    code: 'FILE_BINARY',
    message:
      'Binary file detected. Cannot display as text - download directly from GitHub',
  },
  DECODE_FAILED: {
    code: 'FILE_DECODE_FAILED',
    message:
      'Failed to decode file. Encoding may not be supported (expected UTF-8)',
  },
  UNSUPPORTED_TYPE: {
    code: 'FILE_UNSUPPORTED_TYPE',
    message: (type: string) => `Unsupported file type: ${type}`,
  },
  MATCH_STRING_NOT_FOUND: {
    code: 'FILE_MATCH_STRING_NOT_FOUND',
    message: (matchString: string) =>
      `Match string "${matchString}" not found in file. The file may have changed since the search was performed.`,
  },
} as const;

export const REPOSITORY_ERRORS = {
  NOT_FOUND: {
    code: 'REPO_NOT_FOUND',
    message: (owner: string, repo: string, error: string) =>
      `Repository "${owner}/${repo}" not found or not accessible: ${error}`,
  },
  PATH_NOT_FOUND: {
    code: 'REPO_PATH_NOT_FOUND',
    message: (path: string, owner: string, repo: string, branch: string) =>
      `Path "${path}" not found in repository "${owner}/${repo}" on branch "${branch}"`,
  },
  PATH_NOT_FOUND_ANY_BRANCH: {
    code: 'REPO_PATH_NOT_FOUND_ANY_BRANCH',
    message: (path: string, owner: string, repo: string) =>
      `Path "${path}" not found in repository "${owner}/${repo}" on any common branch`,
  },
  ACCESS_FAILED: {
    code: 'REPO_ACCESS_FAILED',
    message: (owner: string, repo: string, error: string) =>
      `Failed to access repository "${owner}/${repo}": ${error}`,
  },
  BRANCH_NOT_FOUND: {
    code: 'REPO_BRANCH_NOT_FOUND',
    message: (branch: string) =>
      `Branch '${branch}' not found. Ask user: Do you want to get the file from the default branch instead?`,
  },
  STRUCTURE_EXPLORATION_FAILED: {
    code: 'REPO_STRUCTURE_EXPLORATION_FAILED',
    message: 'Failed to explore repository structure',
  },
} as const;

export const SEARCH_ERRORS = {
  QUERY_EMPTY: {
    code: 'SEARCH_QUERY_EMPTY',
    message: 'Search query cannot be empty',
  },
  NO_VALID_PARAMETERS: {
    code: 'SEARCH_NO_VALID_PARAMETERS',
    message: 'No valid search parameters provided',
  },
  PR_REQUIRED_PARAMS: {
    code: 'SEARCH_PR_REQUIRED_PARAMS',
    message: 'Owner, repo, and prNumber are required parameters',
  },
  PR_SINGLE_VALUES: {
    code: 'SEARCH_PR_SINGLE_VALUES',
    message: 'Owner and repo must be single values',
  },
  API_REQUEST_FAILED: {
    code: 'SEARCH_API_REQUEST_FAILED',
    message: (error: string) => `API request failed: ${error}`,
  },
  PULL_REQUEST_SEARCH_FAILED: {
    code: 'SEARCH_PR_SEARCH_FAILED',
    message: (error: string) => `Pull request search failed: ${error}`,
  },
  PULL_REQUEST_LIST_FAILED: {
    code: 'SEARCH_PR_LIST_FAILED',
    message: (error: string) => `Pull request list failed: ${error}`,
  },
  PULL_REQUEST_FETCH_FAILED: {
    code: 'SEARCH_PR_FETCH_FAILED',
    message: (prNumber: number, error: string) =>
      `Failed to fetch pull request #${prNumber}: ${error}`,
  },
} as const;

export const STARTUP_ERRORS = {
  NO_TOOLS_REGISTERED: {
    code: 'STARTUP_NO_TOOLS_REGISTERED',
    message: 'No tools were successfully registered',
  },
  UNCAUGHT_EXCEPTION: {
    code: 'STARTUP_UNCAUGHT_EXCEPTION',
    message: (error: string) => `Uncaught exception: ${error}`,
  },
  UNHANDLED_REJECTION: {
    code: 'STARTUP_UNHANDLED_REJECTION',
    message: (reason: string) => `Unhandled rejection: ${reason}`,
  },
  STARTUP_FAILED: {
    code: 'STARTUP_FAILED',
    message: (error: string) => `Startup failed: ${error}`,
  },
} as const;

export const PROMISE_ERRORS = {
  TIMEOUT: {
    code: 'PROMISE_TIMEOUT',
    message: (index: number, timeout: number) =>
      `Promise ${index} timed out after ${timeout}ms`,
  },
  NOT_A_FUNCTION: {
    code: 'PROMISE_NOT_A_FUNCTION',
    message: (index: number) =>
      `Promise function at index ${index} is not a function`,
  },
  FUNCTION_UNDEFINED: {
    code: 'PROMISE_FUNCTION_UNDEFINED',
    message: 'Promise function is undefined',
  },
} as const;

export const TOOL_ERRORS = {
  EXECUTION_FAILED: {
    code: 'TOOL_EXECUTION_FAILED',
    message: (toolName: string, error: string) =>
      `Tool ${toolName} execution failed: ${error}`,
  },
  SECURITY_VALIDATION_FAILED: {
    code: 'TOOL_SECURITY_VALIDATION_FAILED',
    message: (toolName: string, error: string) =>
      `Security validation failed for ${toolName}: ${error}`,
  },
} as const;

export const ALL_ERROR_CODES = {
  ...CONFIG_ERRORS,
  ...VALIDATION_ERRORS,
  ...FETCH_ERRORS,
  ...TOOL_METADATA_ERRORS,
  ...FILE_OPERATION_ERRORS,
  ...REPOSITORY_ERRORS,
  ...SEARCH_ERRORS,
  ...STARTUP_ERRORS,
  ...PROMISE_ERRORS,
  ...TOOL_ERRORS,
} as const;

export type ErrorCategory =
  | 'CONFIG'
  | 'VALIDATION'
  | 'FETCH'
  | 'TOOL_METADATA'
  | 'FILE_OPERATION'
  | 'REPOSITORY'
  | 'SEARCH'
  | 'STARTUP'
  | 'PROMISE'
  | 'TOOL'
  | 'FILE_SYSTEM'
  | 'PAGINATION'
  | 'EXECUTION';

// ============================================================================
// LOCAL TOOL ERROR CODES (for local file operations)
// ============================================================================

/**
 * Error codes for local tool operations (file system, search, pagination)
 * Uses camelCase values for consistency with tool responses
 */
export const LOCAL_TOOL_ERROR_CODES = {
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
  COMMAND_NOT_AVAILABLE: 'commandNotAvailable',
  COMMAND_EXECUTION_FAILED: 'commandExecutionFailed',
  COMMAND_TIMEOUT: 'commandTimeout',
  QUERY_EXECUTION_FAILED: 'queryExecutionFailed',
  TOOL_EXECUTION_FAILED: 'toolExecutionFailed',
} as const;

// Alias for backwards compatibility with existing imports
export const ERROR_CODES = LOCAL_TOOL_ERROR_CODES;

/**
 * Local tool error code type
 */
export type LocalToolErrorCode =
  (typeof LOCAL_TOOL_ERROR_CODES)[keyof typeof LOCAL_TOOL_ERROR_CODES];

/**
 * Combined error code type (domain + local tool)
 */
export type ErrorCode =
  | (typeof ALL_ERROR_CODES)[keyof typeof ALL_ERROR_CODES]['code']
  | LocalToolErrorCode;

/**
 * Error category enum for local tools
 */
export enum LocalToolErrorCategory {
  FILE_SYSTEM = 'FILE_SYSTEM',
  VALIDATION = 'VALIDATION',
  SEARCH = 'SEARCH',
  PAGINATION = 'PAGINATION',
  EXECUTION = 'EXECUTION',
}

/**
 * Metadata about each local tool error code
 */
interface LocalToolErrorMetadata {
  code: LocalToolErrorCode;
  category: LocalToolErrorCategory;
  description: string;
  recoverability: 'recoverable' | 'unrecoverable' | 'user-action-required';
}

/**
 * Complete error code registry with metadata for local tools
 */
export const LOCAL_TOOL_ERROR_REGISTRY: Record<
  LocalToolErrorCode,
  LocalToolErrorMetadata
> = {
  // Path & File Access
  [LOCAL_TOOL_ERROR_CODES.PATH_VALIDATION_FAILED]: {
    code: LOCAL_TOOL_ERROR_CODES.PATH_VALIDATION_FAILED,
    category: LocalToolErrorCategory.VALIDATION,
    description: 'Path validation failed - invalid or unsafe path',
    recoverability: 'user-action-required',
  },
  [LOCAL_TOOL_ERROR_CODES.FILE_ACCESS_FAILED]: {
    code: LOCAL_TOOL_ERROR_CODES.FILE_ACCESS_FAILED,
    category: LocalToolErrorCategory.FILE_SYSTEM,
    description: 'Cannot access file - may not exist or lack permissions',
    recoverability: 'unrecoverable',
  },
  [LOCAL_TOOL_ERROR_CODES.FILE_READ_FAILED]: {
    code: LOCAL_TOOL_ERROR_CODES.FILE_READ_FAILED,
    category: LocalToolErrorCategory.FILE_SYSTEM,
    description: 'Failed to read file contents',
    recoverability: 'unrecoverable',
  },
  [LOCAL_TOOL_ERROR_CODES.FILE_TOO_LARGE]: {
    code: LOCAL_TOOL_ERROR_CODES.FILE_TOO_LARGE,
    category: LocalToolErrorCategory.FILE_SYSTEM,
    description: 'File exceeds size limits for operation',
    recoverability: 'user-action-required',
  },

  // Search & Pattern
  [LOCAL_TOOL_ERROR_CODES.NO_MATCHES]: {
    code: LOCAL_TOOL_ERROR_CODES.NO_MATCHES,
    category: LocalToolErrorCategory.SEARCH,
    description: 'Search pattern found no matches',
    recoverability: 'user-action-required',
  },
  [LOCAL_TOOL_ERROR_CODES.PATTERN_TOO_BROAD]: {
    code: LOCAL_TOOL_ERROR_CODES.PATTERN_TOO_BROAD,
    category: LocalToolErrorCategory.SEARCH,
    description:
      'Search pattern is too broad and would return too many results',
    recoverability: 'user-action-required',
  },

  // Pagination & Output
  [LOCAL_TOOL_ERROR_CODES.PAGINATION_REQUIRED]: {
    code: LOCAL_TOOL_ERROR_CODES.PAGINATION_REQUIRED,
    category: LocalToolErrorCategory.PAGINATION,
    description: 'Result set too large - pagination required',
    recoverability: 'user-action-required',
  },
  [LOCAL_TOOL_ERROR_CODES.OUTPUT_TOO_LARGE]: {
    code: LOCAL_TOOL_ERROR_CODES.OUTPUT_TOO_LARGE,
    category: LocalToolErrorCategory.PAGINATION,
    description: 'Output exceeds size limits',
    recoverability: 'user-action-required',
  },
  [LOCAL_TOOL_ERROR_CODES.RESPONSE_TOO_LARGE]: {
    code: LOCAL_TOOL_ERROR_CODES.RESPONSE_TOO_LARGE,
    category: LocalToolErrorCategory.PAGINATION,
    description: 'Response exceeds maximum allowed size',
    recoverability: 'user-action-required',
  },

  // Execution
  [LOCAL_TOOL_ERROR_CODES.COMMAND_NOT_AVAILABLE]: {
    code: LOCAL_TOOL_ERROR_CODES.COMMAND_NOT_AVAILABLE,
    category: LocalToolErrorCategory.EXECUTION,
    description: 'Required CLI command is not installed or not in PATH',
    recoverability: 'user-action-required',
  },
  [LOCAL_TOOL_ERROR_CODES.COMMAND_EXECUTION_FAILED]: {
    code: LOCAL_TOOL_ERROR_CODES.COMMAND_EXECUTION_FAILED,
    category: LocalToolErrorCategory.EXECUTION,
    description: 'System command execution failed',
    recoverability: 'unrecoverable',
  },
  [LOCAL_TOOL_ERROR_CODES.COMMAND_TIMEOUT]: {
    code: LOCAL_TOOL_ERROR_CODES.COMMAND_TIMEOUT,
    category: LocalToolErrorCategory.EXECUTION,
    description: 'Command execution timed out',
    recoverability: 'user-action-required',
  },
  [LOCAL_TOOL_ERROR_CODES.QUERY_EXECUTION_FAILED]: {
    code: LOCAL_TOOL_ERROR_CODES.QUERY_EXECUTION_FAILED,
    category: LocalToolErrorCategory.EXECUTION,
    description: 'Query execution failed',
    recoverability: 'unrecoverable',
  },
  [LOCAL_TOOL_ERROR_CODES.TOOL_EXECUTION_FAILED]: {
    code: LOCAL_TOOL_ERROR_CODES.TOOL_EXECUTION_FAILED,
    category: LocalToolErrorCategory.EXECUTION,
    description: 'Generic tool execution failure',
    recoverability: 'unrecoverable',
  },
};

// Alias for backwards compatibility
export const ERROR_CODE_REGISTRY = LOCAL_TOOL_ERROR_REGISTRY;

// ============================================================================
// TOOL ERROR CLASS
// ============================================================================

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

// ============================================================================
// TOOL ERROR FACTORY FUNCTIONS
// ============================================================================

/**
 * Convenience factory functions for common errors
 */
export const ToolErrors = {
  pathValidationFailed: (path: string, reason?: string) =>
    new ToolError(
      LOCAL_TOOL_ERROR_CODES.PATH_VALIDATION_FAILED,
      reason || `Path validation failed: ${path}`,
      { path }
    ),

  fileAccessFailed: (path: string, cause?: Error) =>
    new ToolError(
      LOCAL_TOOL_ERROR_CODES.FILE_ACCESS_FAILED,
      `Cannot access file: ${path}`,
      { path },
      cause
    ),

  fileReadFailed: (path: string, cause?: Error) =>
    new ToolError(
      LOCAL_TOOL_ERROR_CODES.FILE_READ_FAILED,
      `Failed to read file: ${path}`,
      { path },
      cause
    ),

  fileTooLarge: (path: string, sizeKB: number, limitKB: number) =>
    new ToolError(
      LOCAL_TOOL_ERROR_CODES.FILE_TOO_LARGE,
      (() => {
        const fmt = (n: number) =>
          Number.isInteger(n) ? `${n}KB` : `${n.toFixed(1)}KB`;
        return `File too large: ${fmt(sizeKB)} (limit: ${fmt(limitKB)})`;
      })(),
      { path, sizeKB, limitKB }
    ),

  noMatches: (pattern: string, context?: Record<string, unknown>) =>
    new ToolError(
      LOCAL_TOOL_ERROR_CODES.NO_MATCHES,
      `No matches found for pattern: ${pattern}`,
      { pattern, ...context }
    ),

  patternTooBroad: (pattern: string, matchCount: number) =>
    new ToolError(
      LOCAL_TOOL_ERROR_CODES.PATTERN_TOO_BROAD,
      `Pattern too broad: ${matchCount} matches found`,
      { pattern, matchCount }
    ),

  paginationRequired: (itemCount: number) =>
    new ToolError(
      LOCAL_TOOL_ERROR_CODES.PAGINATION_REQUIRED,
      `Pagination required: ${itemCount} characters`,
      { itemCount }
    ),

  outputTooLarge: (size: number, limit: number) =>
    new ToolError(
      LOCAL_TOOL_ERROR_CODES.OUTPUT_TOO_LARGE,
      `Output too large: ${size} (limit: ${limit})`,
      { size, limit }
    ),

  responseTooLarge: (tokens: number, limit: number) =>
    new ToolError(
      LOCAL_TOOL_ERROR_CODES.RESPONSE_TOO_LARGE,
      `Response too large: ${tokens} tokens (limit: ${limit})`,
      { tokens, limit }
    ),

  commandNotAvailable: (command: string, installHint?: string) =>
    new ToolError(
      LOCAL_TOOL_ERROR_CODES.COMMAND_NOT_AVAILABLE,
      `Command '${command}' is not available. ${installHint || 'Please install it and ensure it is in your PATH.'}`,
      { command, installHint }
    ),

  commandExecutionFailed: (command: string, cause?: Error, stderr?: string) =>
    new ToolError(
      LOCAL_TOOL_ERROR_CODES.COMMAND_EXECUTION_FAILED,
      stderr
        ? `Command '${command}' failed: ${stderr}`
        : `Command execution failed: ${command}`,
      { command, stderr },
      cause
    ),

  commandTimeout: (command: string, timeoutMs: number) =>
    new ToolError(
      LOCAL_TOOL_ERROR_CODES.COMMAND_TIMEOUT,
      `Command '${command}' timed out after ${timeoutMs}ms. Try a narrower search path or add filters.`,
      { command, timeoutMs }
    ),

  queryExecutionFailed: (queryId?: string, cause?: Error) =>
    new ToolError(
      LOCAL_TOOL_ERROR_CODES.QUERY_EXECUTION_FAILED,
      'Query execution failed',
      { queryId },
      cause
    ),

  toolExecutionFailed: (toolName: string, cause?: Error) =>
    new ToolError(
      LOCAL_TOOL_ERROR_CODES.TOOL_EXECUTION_FAILED,
      `Tool execution failed: ${toolName}`,
      { toolName },
      cause
    ),
};

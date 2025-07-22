import { CallToolResult } from '@modelcontextprotocol/sdk/types';

/**
 * Shared utilities for handling tool responses and parsing
 */

/**
 * Safely extract text content from a CallToolResult
 * Used across all tool implementations to consistently handle response parsing
 */
export function safeGetContentText(result: CallToolResult): string {
  if (
    result?.content &&
    Array.isArray(result.content) &&
    result.content.length > 0
  ) {
    return (result.content[0].text as string) || 'Empty response';
  }
  return 'Unknown error: No content in response';
}

/**
 * Safely parse JSON from a CallToolResult with error handling
 * Combines safeGetContentText with JSON parsing and provides detailed error info
 */
export function safeParseJsonResult<T = any>(
  result: CallToolResult,
  context?: string
): { success: true; data: T } | { success: false; error: string } {
  try {
    const textContent = safeGetContentText(result);
    const parsedData = JSON.parse(textContent) as T;
    return { success: true, data: parsedData };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const contextMsg = context ? ` in ${context}` : '';
    return {
      success: false,
      error: `Failed to parse JSON response${contextMsg}: ${errorMessage}`,
    };
  }
}

/**
 * Extract GitHub API result from parsed exec result
 * Handles the common pattern of accessing execResult.result
 */
export function extractGitHubApiResult<T = any>(
  execResult: any
): { success: true; data: T } | { success: false; error: string } {
  if (!execResult) {
    return { success: false, error: 'No execution result provided' };
  }

  if (!execResult.result) {
    return { success: false, error: 'No result field in execution result' };
  }

  return { success: true, data: execResult.result };
}

/**
 * Safely ensure array format for API results
 * Many GitHub API responses can be either single items or arrays
 */
export function ensureArray<T>(data: T | T[]): T[] {
  return Array.isArray(data) ? data : [data];
}

/**
 * Combined utility for the most common pattern:
 * Parse JSON from result -> Extract GitHub API data -> Ensure array
 */
export function parseGitHubApiResult<T = any>(
  result: CallToolResult,
  context?: string
): { success: true; data: T[] } | { success: false; error: string } {
  const parseResult = safeParseJsonResult(result, context);
  if (!parseResult.success) {
    return parseResult;
  }

  const extractResult = extractGitHubApiResult<T | T[]>(parseResult.data);
  if (!extractResult.success) {
    return extractResult;
  }

  return {
    success: true,
    data: ensureArray(extractResult.data),
  };
}

/**
 * Type-safe helper for handling optional array or string parameters
 * Common in GitHub search parameters
 */
export function normalizeStringOrArray(
  value: string | string[] | undefined
): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Safely convert any value to a finite number or return default
 * Used for handling numeric fields from API responses
 */
export function safeToNumber(value: unknown, defaultValue: number = 0): number {
  const num = Number(value);
  return !isNaN(num) && isFinite(num) ? num : defaultValue;
}

/**
 * Safely convert any value to string with fallback
 * Used for handling text fields from API responses
 */
export function safeToString(
  value: unknown,
  defaultValue: string = ''
): string {
  return typeof value === 'string' ? value : String(value || defaultValue);
}

/**
 * Check if a response indicates an error state
 */
export function isErrorResponse(result: CallToolResult): boolean {
  return result.isError === true;
}

/**
 * Common error response patterns for tools
 */
export interface ErrorHandlers {
  onRateLimit?: () => string;
  onAuth?: () => string;
  onNotFound?: () => string;
  onNetwork?: () => string;
  onGeneric?: (error: string) => string;
}

/**
 * Standardized error message handling based on common patterns
 */
export function handleCommonErrors(
  errorMessage: string,
  handlers: ErrorHandlers = {}
): string {
  const lowerError = errorMessage.toLowerCase();

  if (lowerError.includes('rate limit') || lowerError.includes('403')) {
    return (
      handlers.onRateLimit?.() ||
      'GitHub API rate limit reached. Try again in a few minutes.'
    );
  }

  if (lowerError.includes('authentication') || lowerError.includes('401')) {
    return (
      handlers.onAuth?.() ||
      'GitHub authentication required. Run: gh auth login'
    );
  }

  if (lowerError.includes('not found') || lowerError.includes('404')) {
    return (
      handlers.onNotFound?.() ||
      'Resource not found. Check repository/user names and permissions.'
    );
  }

  if (lowerError.includes('timeout') || lowerError.includes('network')) {
    return (
      handlers.onNetwork?.() ||
      'Network timeout. Check connection and try again.'
    );
  }

  return (
    handlers.onGeneric?.(errorMessage) || `Operation failed: ${errorMessage}`
  );
}

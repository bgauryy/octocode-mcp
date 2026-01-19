/**
 * Type guards for safe error handling.
 *
 * Replaces unsafe type coercion (err as { status?: number }) with
 * proper runtime type checking for better type safety.
 *
 * @module types/errorGuards
 */

// =============================================================================
// Error Interfaces
// =============================================================================

/**
 * Error with HTTP status code (e.g., from API responses)
 */
export interface ErrorWithStatus {
  status: number;
  message?: string;
}

/**
 * Error with error code (e.g., Node.js system errors)
 */
export interface ErrorWithCode {
  code: string;
  message?: string;
}

/**
 * Error with headers (e.g., rate limit responses)
 */
export interface ErrorWithHeaders {
  headers: Record<string, string>;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if error has a status property (number)
 */
export function isErrorWithStatus(err: unknown): err is ErrorWithStatus {
  return (
    err !== null &&
    typeof err === 'object' &&
    'status' in err &&
    typeof (err as ErrorWithStatus).status === 'number'
  );
}

/**
 * Check if error has a code property (string)
 */
export function isErrorWithCode(err: unknown): err is ErrorWithCode {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as ErrorWithCode).code === 'string'
  );
}

/**
 * Check if error has a message property (string)
 */
export function hasMessage(err: unknown): err is { message: string } {
  return (
    err !== null &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  );
}

/**
 * Check if error has headers property (object)
 */
export function hasHeaders(err: unknown): err is ErrorWithHeaders {
  return (
    err !== null &&
    typeof err === 'object' &&
    'headers' in err &&
    typeof (err as { headers: unknown }).headers === 'object' &&
    (err as ErrorWithHeaders).headers !== null
  );
}

// =============================================================================
// Safe Property Accessors
// =============================================================================

/**
 * Safely get status from error (undefined if not present)
 */
export function getErrorStatus(err: unknown): number | undefined {
  return isErrorWithStatus(err) ? err.status : undefined;
}

/**
 * Safely get code from error (undefined if not present)
 */
export function getErrorCode(err: unknown): string | undefined {
  return isErrorWithCode(err) ? err.code : undefined;
}

/**
 * Safely get message from error (undefined if not present)
 */
export function getErrorMessage(err: unknown): string | undefined {
  return hasMessage(err) ? err.message : undefined;
}

/**
 * Safely get header value from error (undefined if not present)
 */
export function getErrorHeader(err: unknown, header: string): string | undefined {
  if (hasHeaders(err)) {
    return err.headers[header];
  }
  return undefined;
}

// =============================================================================
// Composite Checks
// =============================================================================

/**
 * Check if error status is in a given list
 */
export function hasStatusIn(err: unknown, statuses: readonly number[]): boolean {
  const status = getErrorStatus(err);
  return status !== undefined && statuses.includes(status);
}

/**
 * Check if error code is in a given list
 */
export function hasCodeIn(err: unknown, codes: readonly string[]): boolean {
  const code = getErrorCode(err);
  return code !== undefined && codes.includes(code);
}

/**
 * Check if error message matches any pattern
 */
export function messageMatches(err: unknown, patterns: readonly RegExp[]): boolean {
  const message = getErrorMessage(err);
  return message !== undefined && patterns.some((p) => p.test(message));
}

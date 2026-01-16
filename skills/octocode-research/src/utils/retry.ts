/**
 * Retry utilities with exponential backoff for resilient tool calls.
 *
 * @module utils/retry
 */

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryOn: (error: unknown) => boolean;
}

/**
 * Pre-configured retry strategies for different tool categories
 */
export const RETRY_CONFIGS = {
  /**
   * LSP tools - may need warm-up time
   */
  lsp: {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    retryOn: (err: unknown) =>
      isLspNotReady(err) || isTimeout(err) || isConnectionRefused(err),
  },

  /**
   * GitHub API - rate limits and server errors
   */
  github: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 3,
    retryOn: (err: unknown) =>
      isRateLimited(err) || isServerError(err) || isTimeout(err),
  },

  /**
   * Package APIs (npm/PyPI) - similar to GitHub
   */
  package: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 15000,
    backoffMultiplier: 2,
    retryOn: (err: unknown) =>
      isRateLimited(err) || isServerError(err) || isTimeout(err),
  },

  /**
   * Local file operations - quick retries
   */
  local: {
    maxAttempts: 2,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    retryOn: (err: unknown) => isFileBusy(err) || isTimeout(err),
  },
} as const satisfies Record<string, RetryConfig>;

type RetryCategory = keyof typeof RETRY_CONFIGS;

/**
 * Context for retry logging
 */
interface RetryContext {
  tool: string;
  params?: unknown;
}

/**
 * Execute an operation with retry logic and exponential backoff.
 *
 * @param operation - Async function to execute
 * @param config - Retry configuration
 * @param context - Optional context for logging
 * @returns Result of the operation
 * @throws Last error if all retries exhausted
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => lspGotoDefinition({ queries }),
 *   RETRY_CONFIGS.lsp,
 *   { tool: 'lspGotoDefinition' }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  context?: RetryContext
): Promise<T> {
  let lastError: unknown;
  let delay = config.initialDelayMs;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry if error type doesn't match or last attempt
      if (!config.retryOn(error) || attempt === config.maxAttempts) {
        throw error;
      }

      // Log retry attempt
      const toolName = context?.tool || 'operation';
      console.log(
        `⟳ Retry ${attempt}/${config.maxAttempts} for ${toolName} in ${delay}ms`
      );

      await sleep(delay);
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Convenience wrapper that selects config by category
 */
async function withCategoryRetry<T>(
  category: RetryCategory,
  operation: () => Promise<T>,
  context?: RetryContext
): Promise<T> {
  return withRetry(operation, RETRY_CONFIGS[category], context);
}

// =============================================================================
// Error Type Detection
// =============================================================================

// Error codes for reliable detection (check these first)
const RATE_LIMIT_CODES = [403, 429] as const;
const RATE_LIMIT_PATTERNS = [/rate\s*limit/i, /too\s*many\s*requests/i] as const;

const LSP_ERROR_CODES = ['LSP_NOT_READY', 'LSP_NOT_INITIALIZED', 'ECONNREFUSED'] as const;
const LSP_ERROR_PATTERNS = [/not initialized/i, /server not started/i, /lsp.*not.*ready/i] as const;

const TIMEOUT_CODES = ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET'] as const;
const TIMEOUT_PATTERNS = [/timeout/i, /timed?\s*out/i] as const;

const FILE_BUSY_CODES = ['EBUSY', 'EAGAIN', 'ENOTEMPTY'] as const;

const CONNECTION_REFUSED_CODES = ['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH'] as const;

const SYMBOL_NOT_FOUND_CODES = ['SYMBOL_NOT_FOUND', 'NOT_FOUND'] as const;
const SYMBOL_NOT_FOUND_PATTERNS = [/symbol\s*not\s*found/i, /definition\s*not\s*found/i] as const;

/**
 * Check if error indicates GitHub rate limiting
 */
function isRateLimited(err: unknown): boolean {
  const error = err as { status?: number; message?: string };

  // Check status codes first (more reliable)
  if (error?.status && RATE_LIMIT_CODES.includes(error.status as 403 | 429)) {
    return true;
  }

  // Fall back to message patterns
  if (error?.message) {
    return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(error.message!));
  }

  return false;
}

/**
 * Check if error indicates LSP server not ready
 */
function isLspNotReady(err: unknown): boolean {
  const error = err as { message?: string; code?: string };

  // Check error codes first (more reliable)
  if (error?.code && LSP_ERROR_CODES.includes(error.code as (typeof LSP_ERROR_CODES)[number])) {
    return true;
  }

  // Fall back to message patterns
  if (error?.message) {
    return LSP_ERROR_PATTERNS.some((pattern) => pattern.test(error.message!));
  }

  return false;
}

/**
 * Check if error is a timeout
 */
function isTimeout(err: unknown): boolean {
  const error = err as { code?: string; message?: string };

  // Check error codes first (more reliable)
  if (error?.code && TIMEOUT_CODES.includes(error.code as (typeof TIMEOUT_CODES)[number])) {
    return true;
  }

  // Fall back to message patterns
  if (error?.message) {
    return TIMEOUT_PATTERNS.some((pattern) => pattern.test(error.message!));
  }

  return false;
}

/**
 * Check if error is a server error (5xx)
 */
function isServerError(err: unknown): boolean {
  const error = err as { status?: number };
  const status = error?.status;
  return typeof status === 'number' && status >= 500 && status < 600;
}

/**
 * Check if file is busy/locked
 */
function isFileBusy(err: unknown): boolean {
  const error = err as { code?: string };
  return error?.code != null && FILE_BUSY_CODES.includes(error.code as (typeof FILE_BUSY_CODES)[number]);
}

/**
 * Check if connection was refused
 */
function isConnectionRefused(err: unknown): boolean {
  const error = err as { code?: string };
  return error?.code != null && CONNECTION_REFUSED_CODES.includes(error.code as (typeof CONNECTION_REFUSED_CODES)[number]);
}

/**
 * Check if symbol was not found (LSP)
 */
function isSymbolNotFound(err: unknown): boolean {
  const error = err as { message?: string; code?: string };

  // Check error codes first (more reliable)
  if (error?.code && SYMBOL_NOT_FOUND_CODES.includes(error.code as (typeof SYMBOL_NOT_FOUND_CODES)[number])) {
    return true;
  }

  // Fall back to message patterns
  if (error?.message) {
    return SYMBOL_NOT_FOUND_PATTERNS.some((pattern) => pattern.test(error.message!));
  }

  return false;
}

// =============================================================================
// Utilities
// =============================================================================

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Get suggested retry delay from error (if available)
 */
function getRetryAfter(err: unknown): number | null {
  if (isRateLimited(err)) {
    const error = err as { headers?: Record<string, string> };
    const retryAfter = error?.headers?.['retry-after'];
    if (retryAfter) {
      return parseInt(retryAfter, 10) * 1000;
    }
    return 60000; // Default 60s for rate limits
  }

  if (isLspNotReady(err)) {
    return 3000; // 3s for LSP warm-up
  }

  return null;
}

/**
 * Determine if an error is recoverable
 */
function isRecoverable(err: unknown): boolean {
  return (
    isRateLimited(err) ||
    isLspNotReady(err) ||
    isTimeout(err) ||
    isServerError(err) ||
    isFileBusy(err) ||
    isConnectionRefused(err)
  );
}

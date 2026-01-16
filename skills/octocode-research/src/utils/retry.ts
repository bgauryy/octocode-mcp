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

export type RetryCategory = keyof typeof RETRY_CONFIGS;

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
export async function withCategoryRetry<T>(
  category: RetryCategory,
  operation: () => Promise<T>,
  context?: RetryContext
): Promise<T> {
  return withRetry(operation, RETRY_CONFIGS[category], context);
}

// =============================================================================
// Error Type Detection
// =============================================================================

/**
 * Check if error indicates GitHub rate limiting
 */
export function isRateLimited(err: unknown): boolean {
  const error = err as { status?: number; message?: string };
  return (
    error?.status === 403 ||
    error?.status === 429 ||
    error?.message?.toLowerCase().includes('rate limit') ||
    false
  );
}

/**
 * Check if error indicates LSP server not ready
 */
export function isLspNotReady(err: unknown): boolean {
  const error = err as { message?: string; code?: string };
  return (
    error?.message?.includes('not initialized') ||
    error?.message?.includes('server not started') ||
    error?.message?.includes('LSP') ||
    error?.code === 'LSP_NOT_READY' ||
    false
  );
}

/**
 * Check if error is a timeout
 */
export function isTimeout(err: unknown): boolean {
  const error = err as { code?: string; message?: string };
  return (
    error?.code === 'ETIMEDOUT' ||
    error?.code === 'ESOCKETTIMEDOUT' ||
    error?.message?.toLowerCase().includes('timeout') ||
    false
  );
}

/**
 * Check if error is a server error (5xx)
 */
export function isServerError(err: unknown): boolean {
  const error = err as { status?: number };
  const status = error?.status;
  return typeof status === 'number' && status >= 500 && status < 600;
}

/**
 * Check if file is busy/locked
 */
export function isFileBusy(err: unknown): boolean {
  const error = err as { code?: string };
  return error?.code === 'EBUSY' || error?.code === 'EAGAIN' || false;
}

/**
 * Check if connection was refused
 */
export function isConnectionRefused(err: unknown): boolean {
  const error = err as { code?: string };
  return error?.code === 'ECONNREFUSED' || false;
}

/**
 * Check if symbol was not found (LSP)
 */
export function isSymbolNotFound(err: unknown): boolean {
  const error = err as { message?: string; code?: string };
  return (
    error?.message?.toLowerCase().includes('symbol not found') ||
    error?.message?.toLowerCase().includes('not found') ||
    error?.code === 'SYMBOL_NOT_FOUND' ||
    false
  );
}

// =============================================================================
// Utilities
// =============================================================================

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Get suggested retry delay from error (if available)
 */
export function getRetryAfter(err: unknown): number | null {
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
export function isRecoverable(err: unknown): boolean {
  return (
    isRateLimited(err) ||
    isLspNotReady(err) ||
    isTimeout(err) ||
    isServerError(err) ||
    isFileBusy(err) ||
    isConnectionRefused(err)
  );
}

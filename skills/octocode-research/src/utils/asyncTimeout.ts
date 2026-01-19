import { errorQueue } from './errorQueue.js';

/**
 * Timeout wrapper for fire-and-forget async operations.
 *
 * Prevents unbounded async operations from hanging indefinitely.
 * Uses Promise.race with AbortController for clean cancellation.
 *
 * @module utils/asyncTimeout
 */

/**
 * Default timeout for fire-and-forget operations (5 seconds).
 * Tuned for logging/telemetry operations that should complete quickly.
 */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Execute an async operation with timeout protection.
 *
 * Fire-and-forget pattern with built-in timeout to prevent:
 * - Memory leaks from unresolved promises
 * - Resource exhaustion from hanging operations
 * - Cascading failures from slow logging/telemetry
 *
 * @param operation - Async operation to execute
 * @param timeoutMs - Maximum time to wait (default: 5000ms)
 * @param context - Context string for error logging
 *
 * @example
 * ```typescript
 * // Instead of:
 * logSessionError(tool, code).catch(err => errorQueue.push(err, 'logSessionError'));
 *
 * // Use:
 * fireAndForgetWithTimeout(
 *   () => logSessionError(tool, code),
 *   5000,
 *   'logSessionError'
 * );
 * ```
 */
export function fireAndForgetWithTimeout(
  operation: () => Promise<unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  context = 'fireAndForget'
): void {
  const controller = new AbortController();
  const { signal } = controller;

  // Create timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // Clean up timeout if operation completes first
    signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });
  });

  // Race operation against timeout
  Promise.race([operation(), timeoutPromise])
    .catch((err: unknown) => {
      // Log to error queue - never throw from fire-and-forget
      errorQueue.push(
        err instanceof Error ? err : new Error(String(err)),
        context
      );
    });
}

/**
 * Execute an async operation with timeout and return result.
 *
 * Unlike fireAndForgetWithTimeout, this returns the result or throws on timeout.
 * Use for operations where you need the result but want timeout protection.
 *
 * @param operation - Async operation to execute
 * @param timeoutMs - Maximum time to wait
 * @param context - Context string for timeout error message
 * @returns Promise resolving to operation result
 * @throws Error if operation times out
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   () => fetchData(),
 *   3000,
 *   'fetchData'
 * );
 * ```
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  context = 'withTimeout'
): Promise<T> {
  const controller = new AbortController();
  const { signal } = controller;

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`${context}: Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });
  });

  try {
    return await Promise.race([operation(), timeoutPromise]);
  } finally {
    controller.abort(); // Clean up if operation completed
  }
}

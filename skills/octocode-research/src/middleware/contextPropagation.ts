/**
 * Context propagation middleware placeholder.
 *
 * Note: Context propagation was removed as it was dead code.
 * This module exports only the stopContextCleanup function for
 * graceful shutdown compatibility in server.ts.
 *
 * @module middleware/contextPropagation
 */

/**
 * Stop context cleanup (no-op).
 * Kept for graceful shutdown compatibility.
 */
export function stopContextCleanup(): void {
  // No-op - context cleanup was removed
}

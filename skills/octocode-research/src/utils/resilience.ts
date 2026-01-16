/**
 * Resilience utilities combining circuit breaker + retry for external API calls.
 *
 * @module utils/resilience
 */

import { withCircuitBreaker, type CircuitBreakerConfig } from './circuitBreaker.js';
import { withRetry, type RetryConfig, RETRY_CONFIGS } from './retry.js';

/**
 * Combined resilience configuration
 */
export interface ResilienceConfig {
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  retry?: RetryConfig;
  /** Fallback value when circuit is open */
  fallback?: () => unknown;
}

/**
 * Pre-configured resilience strategies
 */
export const RESILIENCE_CONFIGS = {
  github: {
    retry: RETRY_CONFIGS.github,
  },
  local: {
    retry: RETRY_CONFIGS.local,
  },
  lsp: {
    retry: RETRY_CONFIGS.lsp,
  },
  package: {
    retry: RETRY_CONFIGS.package,
  },
} as const;

export type ResilienceCategory = keyof typeof RESILIENCE_CONFIGS;

/**
 * Execute an operation with combined circuit breaker + retry protection.
 *
 * The circuit breaker wraps the retry logic, meaning:
 * 1. If circuit is OPEN: immediately fail/fallback (no retries)
 * 2. If circuit is CLOSED/HALF-OPEN: attempt with retries
 * 3. Failures contribute to circuit state after retry exhaustion
 *
 * @param category - Resilience category ('github', 'local', 'lsp')
 * @param operation - Async operation to execute
 * @param context - Context for logging
 * @returns Operation result
 *
 * @example
 * ```typescript
 * const result = await withResilience(
 *   'github',
 *   () => githubSearchCode({ queries }),
 *   { tool: 'githubSearchCode' }
 * );
 * ```
 */
export async function withResilience<T>(
  category: ResilienceCategory,
  operation: () => Promise<T>,
  context?: { tool: string }
): Promise<T> {
  const config = RESILIENCE_CONFIGS[category];

  // Circuit breaker wraps retry
  return withCircuitBreaker(category, async () => {
    return withRetry(operation, config.retry, context);
  });
}

/**
 * Execute GitHub API call with resilience protection
 */
export async function withGitHubResilience<T>(
  operation: () => Promise<T>,
  toolName: string
): Promise<T> {
  return withResilience('github', operation, { tool: toolName });
}

/**
 * Execute LSP call with resilience protection
 */
export async function withLspResilience<T>(
  operation: () => Promise<T>,
  toolName: string
): Promise<T> {
  return withResilience('lsp', operation, { tool: toolName });
}

/**
 * Execute local tool call with resilience protection
 */
export async function withLocalResilience<T>(
  operation: () => Promise<T>,
  toolName: string
): Promise<T> {
  return withResilience('local', operation, { tool: toolName });
}

/**
 * Execute package API call (npm/PyPI) with resilience protection
 */
export async function withPackageResilience<T>(
  operation: () => Promise<T>,
  toolName: string
): Promise<T> {
  return withResilience('package', operation, { tool: toolName });
}

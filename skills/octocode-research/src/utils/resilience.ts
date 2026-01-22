/**
 * Resilience utilities combining circuit breaker + retry + timeout for external API calls.
 *
 * @module utils/resilience
 */

import { withCircuitBreaker, type CircuitBreakerConfig } from './circuitBreaker.js';
import { withRetry, type RetryConfig, RETRY_CONFIGS } from './retry.js';
import { withTimeout } from './asyncTimeout.js';

/** Default timeout for MCP tool calls (30 seconds) */
const DEFAULT_TOOL_TIMEOUT_MS = 30000;

/** Timeout configuration per category */
const TIMEOUT_CONFIGS = {
  github: 60000,   // 60s for GitHub API (rate limiting, large responses)
  local: 30000,    // 30s for local tools
  lsp: 30000,      // 30s for LSP operations
  package: 30000,  // 30s for package search
} as const;

/**
 * Per-tool circuit breaker mapping.
 * Isolates failures so one failing tool doesn't block unrelated tools.
 * 
 * Grouping rationale:
 * - GitHub: Split by API endpoint (search/content/pulls have different rate limits)
 * - LSP: Split by operation weight (navigation vs hierarchy)
 * - Local: Unified (same failure mode - filesystem)
 * - Package: Unified (could split npm/pypi later)
 */
const TOOL_CIRCUIT_MAP: Record<string, string> = {
  // GitHub - separate by endpoint type (rate limits differ)
  githubSearchCode: 'github:search',         // Search API (30 req/min)
  githubSearchRepositories: 'github:search', // Search API
  githubSearchPullRequests: 'github:pulls',  // PR API (separate quota)
  githubGetFileContent: 'github:content',    // Contents API (higher limit)
  githubViewRepoStructure: 'github:content', // Contents API (tree)

  // LSP - per operation type (different failure modes)
  lspGotoDefinition: 'lsp:navigation',       // Fast, single lookup
  lspFindReferences: 'lsp:navigation',       // Fast, single lookup
  lspCallHierarchy: 'lsp:hierarchy',         // Heavier, recursive operation

  // Local - unified (same failure mode: filesystem)
  localSearchCode: 'local',
  localGetFileContent: 'local',
  localFindFiles: 'local',
  localViewStructure: 'local',

  // Package - unified (could split npm/pypi later if needed)
  packageSearch: 'package',
};

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
const RESILIENCE_CONFIGS = {
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

type ResilienceCategory = keyof typeof RESILIENCE_CONFIGS;

/**
 * Execute an operation with combined timeout + circuit breaker + retry protection.
 *
 * The protection layers work as follows:
 * 1. TIMEOUT: Wraps entire operation to prevent hanging (outermost)
 * 2. CIRCUIT BREAKER: If circuit is OPEN, fail fast (no retries/timeout)
 * 3. RETRY: If circuit is CLOSED/HALF-OPEN, retry with backoff (innermost)
 *
 * Failures (including timeouts) contribute to circuit state.
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
async function withResilience<T>(
  category: ResilienceCategory,
  operation: () => Promise<T>,
  context?: { tool: string }
): Promise<T> {
  const config = RESILIENCE_CONFIGS[category];
  const timeoutMs = TIMEOUT_CONFIGS[category] || DEFAULT_TOOL_TIMEOUT_MS;
  const toolName = context?.tool || category;

  // Get tool-specific circuit name (isolates failures per tool/endpoint)
  const circuitName = TOOL_CIRCUIT_MAP[toolName] || category;

  // Timeout wraps circuit breaker wraps retry
  return withTimeout(
    () => withCircuitBreaker(circuitName, async () => {
      return withRetry(operation, config.retry, context);
    }),
    timeoutMs,
    `${toolName}:timeout`
  );
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

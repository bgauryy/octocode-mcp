/**
 * GitLab Client
 *
 * Manages Gitbeaker client instances with caching and configuration.
 *
 * @module gitlab/client
 */

import { Gitlab } from '@gitbeaker/rest';
import { createHash } from 'crypto';
import NodeCache from 'node-cache';
import { getConfigSync } from 'octocode-shared';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const MAX_RETRY_AFTER_SECONDS = 60;

// ============================================================================
// TYPES
// ============================================================================

export type GitLabClient = InstanceType<typeof Gitlab>;

interface ClientConfig {
  token?: string;
  host?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Get GitLab host from env > config file > default.
 * Uses the shared config resolver so all paths agree on the host.
 */
function getGitLabHost(): string {
  return getConfigSync().gitlab.host;
}

/**
 * Get GitLab token from environment.
 * Priority: GITLAB_TOKEN > GL_TOKEN
 */
function getGitLabToken(): string | undefined {
  return process.env.GITLAB_TOKEN || process.env.GL_TOKEN;
}

// ============================================================================
// CLIENT CACHING
// ============================================================================

const CACHE_TTL_SECONDS = 5 * 60;
const CACHE_CHECK_PERIOD_SECONDS = 60;

/**
 * Cache for GitLab client instances.
 * TTL of 5 minutes for token freshness checks.
 */
const clientCache = new NodeCache({
  stdTTL: CACHE_TTL_SECONDS,
  checkperiod: CACHE_CHECK_PERIOD_SECONDS,
  useClones: false,
});

/**
 * Hash token for cache key (never store raw tokens).
 */
function hashToken(token?: string): string {
  if (!token) return 'default';
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

/**
 * Generate cache key for client instance.
 */
function getCacheKey(config?: ClientConfig): string {
  const host = config?.host || getGitLabHost();
  const tokenHash = hashToken(config?.token || getGitLabToken());
  return `gitlab:${host}:${tokenHash}`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get a GitLab client instance.
 *
 * Client instances are cached per host/token combination for reuse.
 *
 * @param config - Optional client configuration
 * @returns GitLab client instance
 * @throws Error if no token is available
 *
 * @example
 * ```typescript
 * // Use environment variables
 * const gitlab = await getGitlab();
 *
 * // Use custom config
 * const gitlab = await getGitlab({
 *   host: 'https://gitlab.mycompany.com',
 *   token: 'glpat-xxx',
 * });
 * ```
 */
export async function getGitlab(config?: ClientConfig): Promise<GitLabClient> {
  const cacheKey = getCacheKey(config);

  // Check cache
  const cached = clientCache.get<GitLabClient>(cacheKey);
  if (cached) {
    return cached;
  }

  // Get configuration
  const host = config?.host || getGitLabHost();
  const token = config?.token || getGitLabToken();

  if (!token) {
    throw new Error(
      'GitLab token not found. Set GITLAB_TOKEN or GL_TOKEN environment variable, ' +
        'or provide token in configuration.'
    );
  }

  const gitlab = new Gitlab({
    host,
    token,
    queryTimeout: DEFAULT_REQUEST_TIMEOUT_MS,
  });

  // Cache and return
  clientCache.set(cacheKey, gitlab);
  return gitlab;
}

/**
 * Check if GitLab is configured with a valid token.
 *
 * @returns True if GitLab token is available
 */
export function isGitLabConfigured(): boolean {
  const token = getGitLabToken();
  return !!token;
}

/**
 * Get the configured GitLab host.
 *
 * @returns GitLab host URL
 */
export function getConfiguredGitLabHost(): string {
  return getGitLabHost();
}

/**
 * Clear all cached GitLab client instances.
 *
 * Useful for testing or when tokens change.
 */
export function clearGitLabClients(): void {
  clientCache.flushAll();
}

/**
 * Clear a specific GitLab client instance.
 *
 * @param config - Configuration used when creating the client
 */
export function clearGitLabClient(config?: ClientConfig): void {
  const cacheKey = getCacheKey(config);
  clientCache.del(cacheKey);
}

// ============================================================================
// DEFAULT BRANCH CACHE
// ============================================================================

const MAX_BRANCH_CACHE_SIZE = 200;
const defaultBranchCache = new Map<string, string>();

export function getCachedDefaultBranch(projectId: string): string | undefined {
  return defaultBranchCache.get(projectId);
}

export function cacheDefaultBranch(projectId: string, branch: string): void {
  if (defaultBranchCache.size >= MAX_BRANCH_CACHE_SIZE) {
    const oldest = defaultBranchCache.keys().next().value;
    if (oldest !== undefined) defaultBranchCache.delete(oldest);
  }
  defaultBranchCache.set(projectId, branch);
}

export function clearDefaultBranchCache(): void {
  defaultBranchCache.clear();
}

// ============================================================================
// RETRY UTILITY
// ============================================================================

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function getRetryDelay(error: unknown, attempt: number): number {
  if (error && typeof error === 'object' && 'headers' in error) {
    const headers = (error as { headers?: Record<string, string> }).headers;
    const retryAfter = headers?.['retry-after'];
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds) && seconds <= MAX_RETRY_AFTER_SECONDS) {
        return seconds * 1000;
      }
    }
  }
  return Math.min(1000 * Math.pow(2, attempt), MAX_RETRY_AFTER_SECONDS * 1000);
}

/**
 * Execute a GitLab API call with retry logic.
 * Retries on 429 (rate limit) and 5xx (server errors).
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const status =
        error && typeof error === 'object' && 'status' in error
          ? (error as { status: number }).status
          : 0;

      if (attempt < MAX_RETRIES && isRetryableStatus(status)) {
        const delay = getRetryDelay(error, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

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
 * Get GitLab host from environment or default.
 */
function getGitLabHost(): string {
  return process.env.GITLAB_HOST || 'https://gitlab.com';
}

/**
 * Get GitLab token from environment.
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

  // Create new client
  const gitlab = new Gitlab({
    host,
    token,
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

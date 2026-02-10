/**
 * Credential Cache Management
 *
 * In-memory cache for credentials with TTL support and automatic invalidation.
 */

import type { StoredCredentials } from './types.js';
import { isTokenExpired, normalizeHostname } from './credentialUtils.js';

/** Cache entry structure */
interface CachedCredentials {
  credentials: StoredCredentials;
  cachedAt: number;
}

/** In-memory credentials cache (per hostname) */
const credentialsCache = new Map<string, CachedCredentials>();

/** Cache TTL in milliseconds (5 minutes - matches token expiry buffer) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Check if cached credentials are still valid (not expired)
 */
function isCacheValid(hostname: string): boolean {
  const cached = credentialsCache.get(hostname);
  if (!cached) return false;

  const age = Date.now() - cached.cachedAt;
  if (age >= CACHE_TTL_MS) return false;

  // Don't serve expired tokens from cache
  return !isTokenExpired(cached.credentials);
}

/**
 * Invalidate cache for a hostname (call after credential changes)
 * @param hostname - Hostname to invalidate, or undefined to clear all
 */
export function invalidateCredentialsCache(hostname?: string): void {
  if (hostname) {
    credentialsCache.delete(normalizeHostname(hostname));
  } else {
    credentialsCache.clear();
  }
}

/**
 * Get cache statistics (for debugging/monitoring)
 * @internal
 */
export function _getCacheStats(): {
  size: number;
  entries: Array<{ hostname: string; age: number; valid: boolean }>;
} {
  const now = Date.now();
  return {
    size: credentialsCache.size,
    entries: Array.from(credentialsCache.entries()).map(
      ([hostname, entry]) => ({
        hostname,
        age: now - entry.cachedAt,
        valid: isCacheValid(hostname),
      })
    ),
  };
}

/**
 * Reset cache state (for testing)
 * @internal
 */
export function _resetCredentialsCache(): void {
  credentialsCache.clear();
}

/**
 * Get cached credentials if valid
 * @internal
 */
export function getCachedCredentials(
  hostname: string
): StoredCredentials | null {
  if (isCacheValid(hostname)) {
    return credentialsCache.get(hostname)!.credentials;
  }
  return null;
}

/**
 * Set cached credentials
 * @internal
 */
export function setCachedCredentials(
  hostname: string,
  credentials: StoredCredentials | null
): void {
  const normalizedHostname = normalizeHostname(hostname);
  if (credentials) {
    credentialsCache.set(normalizedHostname, {
      credentials,
      cachedAt: Date.now(),
    });
  } else {
    // Remove stale cache entry if credentials no longer exist
    credentialsCache.delete(normalizedHostname);
  }
}

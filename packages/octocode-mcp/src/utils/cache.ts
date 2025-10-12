import NodeCache from 'node-cache';
import crypto from 'crypto';
import type { CacheStats } from '../types.js';

const VERSION = 'v1';

// Simplified cache configuration
const cache = new NodeCache({
  stdTTL: 86400, // Default 24 hour cache
  checkperiod: 3600, // Check for expired keys every 1 hour
  maxKeys: 1000, // Limit cache to 1000 entries
  deleteOnExpire: true, // Automatically delete expired keys
  useClones: false, // Better performance
});

const cacheStats: CacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  totalKeys: 0,
  lastReset: new Date(),
};

// TTL configurations for different cache types (in seconds)
export const CACHE_TTL_CONFIG = {
  // GitHub API calls - optimized TTL based on data volatility
  'gh-api-code': 3600, // 1 hour - code changes frequently
  'gh-api-repos': 7200, // 2 hours - repo metadata more stable
  'gh-api-prs': 1800, // 30 minutes - PRs change frequently
  'gh-api-file-content': 3600, // 1 hour - file content changes
  'gh-repo-structure-api': 7200, // 2 hours - structure more stable
  'github-user': 900, // 15 minutes - user info for rate limiting

  // Default fallback
  default: 86400, // 24 hours
} as const;

export type CachePrefix = keyof typeof CACHE_TTL_CONFIG | string;

/**
 * Generate a simple, robust cache key
 * SHA-256 hashes are collision-resistant enough for our use case
 */
export function generateCacheKey(
  prefix: string,
  params: unknown,
  sessionId?: string
): string {
  // Create a stable parameter string
  const paramString = createStableParamString(params);

  // Include session ID in the parameter string if provided
  const finalParamString = sessionId
    ? `${sessionId}:${paramString}`
    : paramString;

  // Use SHA-256 hash for security (64 chars)
  const hash = crypto
    .createHash('sha256')
    .update(finalParamString)
    .digest('hex');

  return `${VERSION}-${prefix}:${hash}`;
}

/**
 * Create a stable string representation of parameters
 */
function createStableParamString(params: unknown): string {
  if (params === null) {
    return 'null';
  }

  if (params === undefined) {
    return 'undefined';
  }

  if (typeof params !== 'object') {
    return String(params);
  }

  if (Array.isArray(params)) {
    return `[${params.map(createStableParamString).join(',')}]`;
  }

  // Sort keys and create stable representation
  const sortedKeys = Object.keys(params as Record<string, unknown>).sort();
  const sortedEntries = sortedKeys.map(key => {
    const value = (params as Record<string, unknown>)[key];
    return `"${key}":${createStableParamString(value)}`;
  });

  return `{${sortedEntries.join(',')}}`;
}

/**
 * Get TTL for a specific cache prefix
 */
function getTTLForPrefix(prefix: string): number {
  return (
    (CACHE_TTL_CONFIG as Record<string, number>)[prefix] ||
    CACHE_TTL_CONFIG.default
  );
}

/**
 * Generic typed cache wrapper for raw data (avoids JSON round-trips)
 */
export async function withDataCache<T>(
  cacheKey: string,
  operation: () => Promise<T>,
  options: {
    ttl?: number;
    skipCache?: boolean;
    forceRefresh?: boolean;
    shouldCache?: (value: T) => boolean; // default: true
  } = {}
): Promise<T> {
  if (options.skipCache) {
    return await operation();
  }

  if (!options.forceRefresh) {
    try {
      const cached = cache.get<T>(cacheKey);
      if (cached !== undefined) {
        cacheStats.hits++;
        return cached;
      }
    } catch (_e) {
      // ignore cache read errors
    }
  }

  cacheStats.misses++;

  const result = await operation();

  const shouldCache = options.shouldCache ?? (() => true);
  if (shouldCache(result)) {
    try {
      let ttl = options.ttl;
      if (!ttl) {
        const prefixMatch = cacheKey.match(/^v\d+-([^:]+):/);
        const prefix = prefixMatch?.[1] ?? 'default';
        ttl = getTTLForPrefix(prefix);
      }
      cache.set(cacheKey, result, ttl);
      cacheStats.sets++;
      cacheStats.totalKeys = cache.keys().length;
    } catch (_e) {
      // ignore cache write errors
    }
  }

  return result;
}

/**
 * Clear all cache entries and reset statistics
 */
export function clearAllCache(): void {
  // Clear main cache
  cache.flushAll();

  // Reset statistics
  cacheStats.hits = 0;
  cacheStats.misses = 0;
  cacheStats.sets = 0;
  cacheStats.totalKeys = 0;
  cacheStats.lastReset = new Date();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats & {
  hitRate: number;
  cacheSize: number;
} {
  const total = cacheStats.hits + cacheStats.misses;
  return {
    ...cacheStats,
    hitRate: total > 0 ? (cacheStats.hits / total) * 100 : 0,
    cacheSize: cache.keys().length,
  };
}

/**
 * Perform periodic cleanup (simplified - NodeCache handles this automatically)
 */
export function performPeriodicCleanup(): void {
  // NodeCache automatically handles cleanup with checkperiod
  // This function is kept for compatibility but does nothing
  // The cache will automatically clean up expired keys
}

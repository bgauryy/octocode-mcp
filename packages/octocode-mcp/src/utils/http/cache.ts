import NodeCache from 'node-cache';
import crypto from 'crypto';
import type { CacheStats } from '../core/types.js';

const VERSION = 'v1';

/** Maximum age for pending requests before cleanup (5 minutes) */
const PENDING_REQUEST_MAX_AGE_MS = 5 * 60 * 1000;

const cache = new NodeCache({
  stdTTL: 86400,
  checkperiod: 3600,
  maxKeys: 5000, // Increased from 1000 for heavy usage scenarios
  deleteOnExpire: true,
  useClones: false,
});

const cacheStats: CacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  totalKeys: 0,
  lastReset: new Date(),
};

const CACHE_TTL_CONFIG = {
  'gh-api-code': 3600,
  'gh-api-repos': 7200,
  'gh-api-prs': 1800,
  'gh-api-file-content': 3600,
  'gh-repo-structure-api': 7200,
  'github-user': 900,
  'npm-search': 14400, // 4 hours
  'pypi-search': 14400, // 4 hours
  default: 86400,
} as const;

// Track pending requests for deduplication with timestamps
interface PendingRequest {
  promise: Promise<unknown>;
  startedAt: number;
}
const pendingRequests = new Map<string, PendingRequest>();

/**
 * Clean up stale pending requests that have exceeded max age.
 * This prevents memory leaks from hung operations.
 */
function cleanupStalePendingRequests(): void {
  const now = Date.now();
  for (const [key, pending] of pendingRequests.entries()) {
    if (now - pending.startedAt > PENDING_REQUEST_MAX_AGE_MS) {
      pendingRequests.delete(key);
    }
  }
}

export function generateCacheKey(
  prefix: string,
  params: unknown,
  sessionId?: string
): string {
  const paramString = createStableParamString(params);

  const finalParamString = sessionId
    ? `${sessionId}:${paramString}`
    : paramString;

  const hash = crypto
    .createHash('sha256')
    .update(finalParamString)
    .digest('hex');

  return `${VERSION}-${prefix}:${hash}`;
}

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
    } catch {
      // Cache read failure - proceed with fresh operation
    }
  }

  // Clean up any stale pending requests periodically
  cleanupStalePendingRequests();

  const existingPending = pendingRequests.get(cacheKey);
  if (existingPending) {
    return existingPending.promise as Promise<T>;
  }

  const promise = (async () => {
    try {
      const result = await operation();

      if (!options.forceRefresh) {
        cacheStats.misses++;
      }

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
        } catch {
          // Cache write failure - result is still valid, just not cached
        }
      }

      return result;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, { promise, startedAt: Date.now() });
  return promise as Promise<T>;
}

/**
 * Clear all cache entries and reset statistics
 */
export function clearAllCache(): void {
  cache.flushAll();
  pendingRequests.clear();

  cacheStats.hits = 0;
  cacheStats.misses = 0;
  cacheStats.sets = 0;
  cacheStats.totalKeys = 0;
  cacheStats.lastReset = new Date();
}

/**
 * Get cache statistics.
 * @internal Used primarily for testing and debugging - not part of public API
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

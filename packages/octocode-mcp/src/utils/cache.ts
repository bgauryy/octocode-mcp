import NodeCache from 'node-cache';
import crypto from 'crypto';
import type { CacheStats } from '../types.js';

const VERSION = 'v1';

const cache = new NodeCache({
  stdTTL: 86400,
  checkperiod: 3600,
  maxKeys: 1000,
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
    } catch (_e) {
      // ignore
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
    } catch {
      // ignore
    }
  }

  return result;
}

/**
 * Clear all cache entries and reset statistics
 */
export function clearAllCache(): void {
  cache.flushAll();

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

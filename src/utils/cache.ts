import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import NodeCache from 'node-cache';
import crypto from 'crypto';
import { logger } from './logger';

const VERSION = 'v1';

// Cache configuration with improved settings
const cache = new NodeCache({
  stdTTL: 86400, // Default 24 hour cache (can be overridden per key)
  checkperiod: 3600, // Check for expired keys every 1 hour
  maxKeys: 1000, // Limit cache to 1000 entries to prevent unbounded growth
  deleteOnExpire: true, // Automatically delete expired keys
  useClones: false, // Better performance, but be careful with object mutations
});

// Cache statistics tracking
interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  collisions: number;
  totalKeys: number;
  lastReset: Date;
}

const cacheStats: CacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  collisions: 0,
  totalKeys: 0,
  lastReset: new Date(),
};

// Track cache key prefixes to detect potential collisions - with cleanup
const keyPrefixRegistry = new Set<string>();
let prefixRegistryCleanupTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * LRU Cache for collision tracking to prevent unbounded memory growth
 */
class LRUCollisionMap {
  private cache = new Map<string, string[]>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  get(key: string): string[] | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: string[]): void {
    // Remove if already exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    // Add as most recently used
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  entries(): IterableIterator<[string, string[]]> {
    return this.cache.entries();
  }

  size(): number {
    return this.cache.size;
  }
}

const keyCollisionMap = new LRUCollisionMap(1000); // Limit to 1000 collision tracking entries

// TTL configurations for different cache types (in seconds)
export const CACHE_TTL_CONFIG = {
  // GitHub API calls - shorter TTL as data changes frequently
  'gh-api-code': 3600, // 1 hour
  'gh-api-repos': 7200, // 2 hours
  'gh-api-issues': 1800, // 30 minutes
  'gh-api-prs': 1800, // 30 minutes
  'gh-commits-api': 3600, // 1 hour
  'gh-api-file-content': 7200, // 2 hours
  'gh-repo-structure-api': 7200, // 2 hours

  // GitHub CLI calls - similar to API
  'gh-code': 3600, // 1 hour
  'gh-repos': 7200, // 2 hours
  'gh-issues': 1800, // 30 minutes
  'gh-prs': 1800, // 30 minutes
  'gh-commits': 3600, // 1 hour
  'gh-file-content-cli': 7200, // 2 hours
  'gh-repo-structure': 7200, // 2 hours

  // NPM operations - longer TTL as package data is more stable
  'npm-view': 14400, // 4 hours
  'npm-exec': 7200, // 2 hours

  // Command execution - shorter TTL
  'gh-exec': 1800, // 30 minutes

  // Default fallback
  default: 86400, // 24 hours
} as const;

export type CachePrefix = keyof typeof CACHE_TTL_CONFIG | string;

/**
 * Generate a more robust cache key with collision detection
 */
export function generateCacheKey(prefix: string, params: unknown): string {
  // Register prefix for collision tracking with periodic cleanup
  keyPrefixRegistry.add(prefix);

  // Schedule cleanup if not already scheduled
  if (!prefixRegistryCleanupTimer && keyPrefixRegistry.size > 100) {
    prefixRegistryCleanupTimer = setTimeout(() => {
      // Keep only the most recent 50 prefixes to prevent unbounded growth
      if (keyPrefixRegistry.size > 50) {
        const prefixes = Array.from(keyPrefixRegistry);
        keyPrefixRegistry.clear();
        // Keep the last 50 prefixes (most recently used)
        prefixes.slice(-50).forEach(p => keyPrefixRegistry.add(p));
      }
      prefixRegistryCleanupTimer = null;
    }, 60000); // Cleanup every minute
  }

  // Create a more robust parameter string
  const paramString = createStableParamString(params);

  // Use SHA-256 but truncate to 32 chars for memory efficiency
  const hash = crypto
    .createHash('sha256')
    .update(paramString)
    .digest('hex')
    .substring(0, 32);

  const cacheKey = `${VERSION}-${prefix}:${hash}`;

  // Track potential collisions with bounded storage
  if (keyCollisionMap.has(cacheKey)) {
    const existingParams = keyCollisionMap.get(cacheKey)!;
    if (!existingParams.includes(paramString)) {
      // Limit collision tracking per key to prevent memory issues
      if (existingParams.length < 5) {
        existingParams.push(paramString);
        cacheStats.collisions++;
        // Log collision - should be rare with 32-char SHA-256 hash
        logger.warn('Cache key collision detected', {
          prefix,
          cacheKey: cacheKey.substring(0, 20) + '...', // Don't log full key
          existingCount: existingParams.length,
        });
      }
    }
  } else {
    keyCollisionMap.set(cacheKey, [paramString]);
  }

  return cacheKey;
}

/**
 * Create a stable string representation of parameters
 */
function createStableParamString(params: unknown): string {
  if (params === null || params === undefined) {
    return 'null';
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
 * Enhanced cache wrapper with per-key TTL and statistics
 */
export async function withCache(
  cacheKey: string,
  operation: () => Promise<CallToolResult>,
  options: {
    ttl?: number; // Override TTL for this specific key
    skipCache?: boolean; // Skip cache entirely
    forceRefresh?: boolean; // Force refresh even if cached
  } = {}
): Promise<CallToolResult> {
  // Skip cache if requested
  if (options.skipCache) {
    return await operation();
  }

  // Check if result exists in cache (unless force refresh)
  if (!options.forceRefresh) {
    try {
      const cachedResult = cache.get<CallToolResult>(cacheKey);
      if (cachedResult) {
        cacheStats.hits++;
        return cachedResult;
      }
    } catch (error) {
      // If cache read fails, continue to execute operation
      // Note: In production, this should use a proper logging system
      // console.warn(`Cache read error for key ${cacheKey}:`, error);
    }
  }

  cacheStats.misses++;

  // Execute operation
  const result = await operation();

  // Only cache successful responses
  if (!result.isError) {
    try {
      // Determine TTL
      let ttl = options.ttl;
      if (!ttl) {
        // Extract prefix from cache key to determine TTL
        const prefixMatch = cacheKey.match(/^v\d+-([^:]+):/);
        const prefix = prefixMatch ? prefixMatch[1] : 'default';
        ttl = getTTLForPrefix(prefix);
      }

      cache.set(cacheKey, result, ttl);
      cacheStats.sets++;
      cacheStats.totalKeys = cache.keys().length;
    } catch (error) {
      // If cache write fails, continue without caching
      // Note: In production, this should use a proper logging system
      // console.warn(`Cache write error for key ${cacheKey}:`, error);
    }
  }

  return result;
}

/**
 * Clear all cache entries and cleanup memory
 */
export function clearAllCache(): void {
  cache.flushAll();
  keyCollisionMap.clear();
  keyPrefixRegistry.clear();

  // Clear any pending cleanup timer
  if (prefixRegistryCleanupTimer) {
    clearTimeout(prefixRegistryCleanupTimer);
    prefixRegistryCleanupTimer = null;
  }

  cacheStats.hits = 0;
  cacheStats.misses = 0;
  cacheStats.sets = 0;
  cacheStats.collisions = 0;
  cacheStats.totalKeys = 0;
  cacheStats.lastReset = new Date();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats & {
  hitRate: number;
  registeredPrefixes: string[];
  cacheSize: number;
} {
  const total = cacheStats.hits + cacheStats.misses;
  return {
    ...cacheStats,
    hitRate: total > 0 ? (cacheStats.hits / total) * 100 : 0,
    registeredPrefixes: Array.from(keyPrefixRegistry).sort(),
    cacheSize: cache.keys().length,
  };
}

/**
 * Validate cache key uniqueness and detect potential issues
 */
function validateCacheHealth(): {
  isHealthy: boolean;
  issues: string[];
  recommendations: string[];
  collisionMapSize: number;
} {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check for collisions
  if (cacheStats.collisions > 0) {
    issues.push(`${cacheStats.collisions} cache key collisions detected`);
    recommendations.push(
      'Consider using more specific cache prefixes to avoid collisions'
    );
  }

  // Check cache size
  const cacheSize = cache.keys().length;
  if (cacheSize > 800) {
    // 80% of maxKeys
    issues.push(`Cache size (${cacheSize}) approaching limit (1000)`);
    recommendations.push(
      'Consider clearing old cache entries or increasing maxKeys'
    );
  }

  // Check hit rate
  const stats = getCacheStats();
  if (stats.hitRate < 30 && stats.hits + stats.misses > 50) {
    issues.push(`Low cache hit rate: ${stats.hitRate.toFixed(1)}%`);
    recommendations.push(
      'Review cache TTL settings or cache key generation strategy'
    );
  }

  // Check for too many prefixes (potential sign of inconsistent naming)
  if (keyPrefixRegistry.size > 20) {
    issues.push(`Large number of cache prefixes (${keyPrefixRegistry.size})`);
    recommendations.push('Consider consolidating similar cache prefixes');
  }

  // Check collision map size (should be within limits due to LRU)
  const collisionMapSize = keyCollisionMap.size();
  if (collisionMapSize > 900) {
    // 90% of max size
    issues.push(
      `Collision map approaching capacity (${collisionMapSize}/1000)`
    );
    recommendations.push(
      'Monitor collision patterns and consider increasing collision map size if needed'
    );
  }

  return {
    isHealthy: issues.length === 0,
    issues,
    recommendations,
    collisionMapSize,
  };
}

/**
 * Get detailed cache information for debugging
 */
export function getCacheDebugInfo(): {
  stats: ReturnType<typeof getCacheStats>;
  health: ReturnType<typeof validateCacheHealth>;
  keysByPrefix: Record<string, number>;
  recentCollisions: Array<{ key: string; count: number }>;
} {
  const keys = cache.keys();
  const keysByPrefix: Record<string, number> = {};

  // Count keys by prefix
  for (const key of keys) {
    const prefixMatch = key.match(/^v\d+-([^:]+):/);
    const prefix = prefixMatch ? prefixMatch[1] : 'unknown';
    keysByPrefix[prefix] = (keysByPrefix[prefix] || 0) + 1;
  }

  // Get recent collisions
  const recentCollisions = Array.from(keyCollisionMap.entries())
    .filter(([, paramsList]) => paramsList.length > 1)
    .map(([key, paramsList]) => ({ key, count: paramsList.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    stats: getCacheStats(),
    health: validateCacheHealth(),
    keysByPrefix,
    recentCollisions,
  };
}

import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import NodeCache from 'node-cache';
import crypto from 'crypto';

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

// Track cache key prefixes to detect potential collisions - with improved cleanup
const keyPrefixRegistry = new Set<string>();
let prefixRegistryCleanupTimer: ReturnType<typeof setTimeout> | null = null;
let cleanupScheduled = false; // Prevent multiple cleanup timers

/**
 * LRU Cache for collision tracking to prevent unbounded memory growth
 * Enhanced with better memory management
 */
class LRUCollisionMap {
  private cache = new Map<string, string[]>();
  private maxSize: number;
  private maxParamsPerKey: number;

  constructor(maxSize = 1000, maxParamsPerKey = 5) {
    this.maxSize = maxSize;
    this.maxParamsPerKey = maxParamsPerKey;
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

    // Limit the number of parameters per key to prevent memory bloat
    const limitedValue = value.slice(-this.maxParamsPerKey);

    // Add as most recently used
    this.cache.set(key, limitedValue);
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

  // New method to clean up old entries
  cleanup(): void {
    for (const [, params] of this.cache.entries()) {
      // If this is collision data older than 1 hour, remove it
      if (params.length > 1) {
        // This is collision data - keep it for now but could implement age tracking
        // For now, just ensure we don't exceed size limits
        if (this.cache.size > this.maxSize * 0.9) {
          // Remove oldest entries when approaching limit
          const firstKey = this.cache.keys().next().value;
          if (firstKey !== undefined) {
            this.cache.delete(firstKey);
          }
        }
      }
    }
  }
}

const keyCollisionMap = new LRUCollisionMap(1000, 5); // Limit to 1000 collision tracking entries, max 5 params per key

// TTL configurations for different cache types (in seconds)
export const CACHE_TTL_CONFIG = {
  // GitHub API calls - shorter TTL as data changes frequently
  'gh-api-code': 3600, // 1 hour
  'gh-api-repos': 7200, // 2 hours
  'gh-api-issues': 1800, // 30 minutes
  'gh-api-prs': 1800, // 30 minutes
  'gh-commits-api': 3600, // 1 hour
  'gh-api-file-content': 3600, // 1 hour
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
 * Schedule cleanup with proper timer management
 */
function schedulePrefixRegistryCleanup(): void {
  // Prevent multiple cleanup timers
  if (cleanupScheduled) {
    return;
  }

  // Only schedule if we have enough prefixes and no timer is running
  if (keyPrefixRegistry.size > 50 && !prefixRegistryCleanupTimer) {
    cleanupScheduled = true;
    prefixRegistryCleanupTimer = setTimeout(() => {
      try {
        // Keep only the most recent 30 prefixes to prevent unbounded growth
        if (keyPrefixRegistry.size > 30) {
          const prefixes = Array.from(keyPrefixRegistry);
          keyPrefixRegistry.clear();
          // Keep the last 30 prefixes (most recently used)
          prefixes.slice(-30).forEach(p => keyPrefixRegistry.add(p));
        }
      } catch (error) {
        // Error during prefix registry cleanup
      } finally {
        // Always reset timer state
        prefixRegistryCleanupTimer = null;
        cleanupScheduled = false;
      }
    }, 30000); // Reduced to 30 seconds for more frequent cleanup
  }
}

/**
 * Generate a more robust cache key with collision detection and memory leak prevention
 */
export function generateCacheKey(prefix: string, params: unknown): string {
  // Register prefix for collision tracking with improved cleanup
  keyPrefixRegistry.add(prefix);

  // Schedule cleanup with proper management
  schedulePrefixRegistryCleanup();

  // Create a more robust parameter string with better uniqueness
  const paramString = createStableParamString(params);

  // Use full SHA-256 hash for security (64 chars) - no truncation to prevent collisions
  const hash = crypto.createHash('sha256').update(paramString).digest('hex');

  const cacheKey = `${VERSION}-${prefix}:${hash}`;

  // Track potential collisions with bounded storage and memory leak prevention
  if (keyCollisionMap.has(cacheKey)) {
    const existingParams = keyCollisionMap.get(cacheKey)!;
    if (!existingParams.includes(paramString)) {
      // Add new parameter and let LRU handle size limits
      const updatedParams = [...existingParams, paramString];
      keyCollisionMap.set(cacheKey, updatedParams);
      cacheStats.collisions++;

      // Collision detected - should be extremely rare with full 64-char SHA-256 hash
    }
  } else {
    keyCollisionMap.set(cacheKey, [paramString]);
  }

  return cacheKey;
}

/**
 * Create a stable string representation of parameters with improved uniqueness
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

  // Sort keys and create stable representation with better handling of edge cases
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
        const prefix = prefixMatch?.[1] ?? 'default';
        ttl = getTTLForPrefix(prefix);
      }

      cache.set(cacheKey, result, ttl);
      cacheStats.sets++;
      cacheStats.totalKeys = cache.keys().length;
    } catch (error) {
      // If cache write fails, continue without caching
    }
  }

  return result;
}

/**
 * Clear all cache entries and cleanup memory with enhanced cleanup
 */
export function clearAllCache(): void {
  // Clear main cache
  cache.flushAll();

  // Clear collision tracking with proper cleanup
  keyCollisionMap.clear();

  // Clear prefix registry
  keyPrefixRegistry.clear();

  // Clear any pending cleanup timer with proper cleanup
  if (prefixRegistryCleanupTimer) {
    clearTimeout(prefixRegistryCleanupTimer);
    prefixRegistryCleanupTimer = null;
    cleanupScheduled = false;
  }

  // Reset statistics
  cacheStats.hits = 0;
  cacheStats.misses = 0;
  cacheStats.sets = 0;
  cacheStats.collisions = 0;
  cacheStats.totalKeys = 0;
  cacheStats.lastReset = new Date();
}

/**
 * Get cache statistics with memory leak prevention
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
 * Validate cache key uniqueness and detect potential issues with memory leak detection
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
  if (keyPrefixRegistry.size > 15) {
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

  // Check for memory leak indicators
  if (prefixRegistryCleanupTimer && !cleanupScheduled) {
    issues.push('Cleanup timer state inconsistency detected');
    recommendations.push('Check timer management logic');
  }

  return {
    isHealthy: issues.length === 0,
    issues,
    recommendations,
    collisionMapSize,
  };
}

/**
 * Get detailed cache information for debugging with memory leak prevention
 */
export function getCacheDebugInfo(): {
  stats: ReturnType<typeof getCacheStats>;
  health: ReturnType<typeof validateCacheHealth>;
  keysByPrefix: Record<string, number>;
  recentCollisions: Array<{ key: string; count: number }>;
  collisionMapSize: number; // For backward compatibility
} {
  // Use cached keys to prevent memory allocation on every call
  const keys = cache.keys();
  const keysByPrefix: Record<string, number> = {};

  // Count keys by prefix with bounded processing
  for (const key of keys) {
    const prefixMatch = key.match(/^v\d+-([^:]+):/);
    const prefix = prefixMatch?.[1] ?? 'unknown';
    keysByPrefix[prefix] = (keysByPrefix[prefix] || 0) + 1;
  }

  // Get recent collisions with bounded processing to prevent memory leaks
  const recentCollisions: Array<{ key: string; count: number }> = [];
  let processedCount = 0;
  const maxProcessed = 50; // Limit processing to prevent memory issues

  for (const [key, paramsList] of keyCollisionMap.entries()) {
    if (processedCount >= maxProcessed) break;

    if (paramsList.length > 1) {
      recentCollisions.push({ key, count: paramsList.length });
    }
    processedCount++;
  }

  // Sort and limit results to prevent memory bloat
  recentCollisions.sort((a, b) => b.count - a.count);
  const limitedCollisions = recentCollisions.slice(0, 10);

  const health = validateCacheHealth();

  return {
    stats: getCacheStats(),
    health,
    keysByPrefix,
    recentCollisions: limitedCollisions,
    collisionMapSize: health.collisionMapSize, // For backward compatibility
  };
}

/**
 * Perform periodic cleanup to prevent memory leaks
 */
export function performPeriodicCleanup(): void {
  try {
    // Clean up collision map
    keyCollisionMap.cleanup();

    // Schedule prefix registry cleanup if needed
    schedulePrefixRegistryCleanup();

    // Perform cleanup activity
  } catch (error) {
    // Error during periodic cache cleanup
  }
}

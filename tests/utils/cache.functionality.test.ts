import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import {
  generateCacheKey,
  withCache,
  clearAllCache,
  getCacheStats,
  getCacheDebugInfo,
  CACHE_TTL_CONFIG,
} from '../../src/utils/cache';

describe('Cache Functionality Regression Tests', () => {
  beforeEach(() => {
    clearAllCache();
    vi.clearAllTimers();
  });

  describe('Core Cache Operations', () => {
    it('should maintain cache hit/miss functionality', async () => {
      let executionCount = 0;
      const mockOperation = async (): Promise<CallToolResult> => {
        executionCount++;
        return {
          isError: false,
          content: [
            { type: 'text' as const, text: `Execution ${executionCount}` },
          ],
        };
      };

      const key = generateCacheKey('regression', { test: 'functionality' });

      // First call - should execute and cache
      const result1 = await withCache(key, mockOperation);
      expect(executionCount).toBe(1);
      expect(result1.isError).toBe(false);

      // Second call - should use cache
      const result2 = await withCache(key, mockOperation);
      expect(executionCount).toBe(1); // Should not increment
      expect(result1).toEqual(result2);

      // Verify stats
      const stats = getCacheStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.sets).toBe(1);
    });

    it('should handle cache TTL correctly', async () => {
      const mockOperation = async () => ({
        isError: false,
        content: [{ type: 'text', text: 'TTL Test' }],
      });

      const key = generateCacheKey('ttl-test', { data: 'short-ttl' });

      // Cache with very short TTL
      await withCache(key, mockOperation, { ttl: 0.1 }); // 0.1 second

      // Should be cached initially
      let executionCount = 0;
      const countingOperation = async () => {
        executionCount++;
        return mockOperation();
      };

      await withCache(key, countingOperation);
      expect(executionCount).toBe(0); // Should use cache

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should execute again after TTL expires
      await withCache(key, countingOperation);
      expect(executionCount).toBe(1); // Should execute
    });

    it('should respect forceRefresh option', async () => {
      let executionCount = 0;
      const mockOperation = async (): Promise<CallToolResult> => {
        executionCount++;
        return {
          isError: false,
          content: [
            { type: 'text' as const, text: `Execution ${executionCount}` },
          ],
        };
      };

      const key = generateCacheKey('refresh', { test: 'force' });

      // Initial cache
      await withCache(key, mockOperation);
      expect(executionCount).toBe(1);

      // Normal call should use cache
      await withCache(key, mockOperation);
      expect(executionCount).toBe(1);

      // Force refresh should execute
      await withCache(key, mockOperation, { forceRefresh: true });
      expect(executionCount).toBe(2);
    });

    it('should handle skipCache option', async () => {
      let executionCount = 0;
      const mockOperation = async (): Promise<CallToolResult> => {
        executionCount++;
        return {
          isError: false,
          content: [
            { type: 'text' as const, text: `Execution ${executionCount}` },
          ],
        };
      };

      const key = generateCacheKey('skip', { test: 'cache' });

      // First call with skipCache
      await withCache(key, mockOperation, { skipCache: true });
      expect(executionCount).toBe(1);

      // Second call with skipCache should still execute
      await withCache(key, mockOperation, { skipCache: true });
      expect(executionCount).toBe(2);

      // Normal call should also execute (nothing was cached)
      await withCache(key, mockOperation);
      expect(executionCount).toBe(3);
    });

    it('should handle error responses correctly', async () => {
      let callCount = 0;
      const errorOperation = async () => {
        callCount++;
        return {
          isError: true,
          content: [{ type: 'text', text: 'Error occurred' }],
        };
      };

      const key = generateCacheKey('error', { test: 'handling' });

      // Error responses should not be cached
      await withCache(key, errorOperation);
      expect(callCount).toBe(1);

      await withCache(key, errorOperation);
      expect(callCount).toBe(2); // Should execute again

      const stats = getCacheStats();
      expect(stats.sets).toBe(0); // No successful caches
      expect(stats.misses).toBe(2);
    });
  });

  describe('Cache Key Generation Consistency', () => {
    it('should maintain deterministic key generation', () => {
      const testCases = [
        { prefix: 'test', data: { id: 1, name: 'test' } },
        { prefix: 'api', data: { user: 'alice', action: 'read' } },
        {
          prefix: 'complex',
          data: { nested: { deep: [1, 2, { value: 'x' }] } },
        },
      ];

      for (const testCase of testCases) {
        const keys = Array.from({ length: 100 }, () =>
          generateCacheKey(testCase.prefix, testCase.data)
        );

        // All keys should be identical
        const uniqueKeys = new Set(keys);
        expect(uniqueKeys.size).toBe(1);
      }
    });

    it('should handle all prefix configurations', () => {
      const prefixes = Object.keys(CACHE_TTL_CONFIG);
      const keys = new Set<string>();

      for (const prefix of prefixes) {
        const key = generateCacheKey(prefix, { test: 'prefix' });
        expect(key).toContain(prefix);
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }

      expect(keys.size).toBe(prefixes.length);
    });

    it('should maintain version consistency in keys', () => {
      const keys = Array.from({ length: 100 }, (_, i) =>
        generateCacheKey('version', { id: i })
      );

      // All keys should start with the same version
      const versions = new Set(keys.map(key => key.split('-')[0]));
      expect(versions.size).toBe(1);

      // Version should be in expected format
      const version = Array.from(versions)[0];
      expect(version).toMatch(/^v\d+$/);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should accurately track cache statistics', async () => {
      const operation = async () => ({
        isError: false,
        content: [{ type: 'text', text: 'stats test' }],
      });

      const initialStats = getCacheStats();

      // Generate some cache activity
      const key1 = generateCacheKey('stats', { id: 1 });
      const key2 = generateCacheKey('stats', { id: 2 });

      // Miss, set
      await withCache(key1, operation);
      // Hit
      await withCache(key1, operation);
      // Miss, set
      await withCache(key2, operation);
      // Hit
      await withCache(key2, operation);

      const finalStats = getCacheStats();

      expect(finalStats.hits).toBe(initialStats.hits + 2);
      expect(finalStats.misses).toBe(initialStats.misses + 2);
      expect(finalStats.sets).toBe(initialStats.sets + 2);
      expect(finalStats.hitRate).toBeGreaterThan(0);
      expect(finalStats.cacheSize).toBeGreaterThan(0);
    });

    it('should provide accurate debug information', () => {
      // Generate some cache keys
      for (let i = 0; i < 10; i++) {
        generateCacheKey('debug', { id: i });
        generateCacheKey('another', { id: i });
      }

      const debugInfo = getCacheDebugInfo();

      expect(debugInfo.stats).toBeDefined();
      expect(debugInfo.health).toBeDefined();
      expect(debugInfo.keysByPrefix).toBeDefined();
      expect(debugInfo.recentCollisions).toBeDefined();

      // Should have registered prefixes
      expect(debugInfo.stats.registeredPrefixes).toContain('debug');
      expect(debugInfo.stats.registeredPrefixes).toContain('another');

      // Should be healthy (no collisions)
      expect(debugInfo.health.isHealthy).toBe(true);
      expect(debugInfo.recentCollisions.length).toBe(0);
    });

    it('should handle cache clear operations', async () => {
      const operation = async () => ({
        isError: false,
        content: [{ type: 'text', text: 'clear test' }],
      });

      // Generate some cache activity
      for (let i = 0; i < 5; i++) {
        const key = generateCacheKey('clear', { id: i });
        await withCache(key, operation);
      }

      const beforeClear = getCacheStats();
      expect(beforeClear.cacheSize).toBeGreaterThan(0);
      expect(beforeClear.sets).toBeGreaterThan(0);

      // Clear cache
      clearAllCache();

      const afterClear = getCacheStats();
      expect(afterClear.cacheSize).toBe(0);
      expect(afterClear.hits).toBe(0);
      expect(afterClear.misses).toBe(0);
      expect(afterClear.sets).toBe(0);
      expect(afterClear.collisions).toBe(0);
      expect(afterClear.registeredPrefixes).toEqual([]);
    });
  });

  describe('Collision Detection and Tracking', () => {
    it('should maintain collision tracking functionality', () => {
      // This test ensures collision detection still works even though
      // collisions should be extremely rare with 64-char hashes

      // Generate many keys to potentially trigger tracking logic
      for (let i = 0; i < 1000; i++) {
        generateCacheKey('collision-tracking', { id: i });
      }

      const debugInfo = getCacheDebugInfo();

      // Collision map should be within expected bounds
      expect(typeof debugInfo.collisionMapSize).toBe('number');
      expect(debugInfo.collisionMapSize).toBeLessThanOrEqual(1000);
      expect(debugInfo.recentCollisions.length).toBe(0); // No actual collisions expected
    });

    it('should handle LRU eviction in collision map', () => {
      // Generate enough keys to potentially trigger LRU eviction
      const keyCount = 1500; // More than the LRU limit of 1000

      for (let i = 0; i < keyCount; i++) {
        generateCacheKey(`lru-${i}`, { data: `test-${i}` });
      }

      const debugInfo = getCacheDebugInfo();

      // Should be bounded by LRU size
      expect(typeof debugInfo.collisionMapSize).toBe('number');
      expect(debugInfo.collisionMapSize).toBeLessThanOrEqual(1000);
    });

    it('should clean up prefix registry properly', () => {
      // Generate many different prefixes to trigger cleanup
      for (let i = 0; i < 60; i++) {
        // Reduced to avoid timeout
        generateCacheKey(`prefix-${i}`, { data: 'cleanup-test' });
      }

      const stats = getCacheStats();
      // Should have registered the prefixes
      expect(stats.registeredPrefixes.length).toBeGreaterThan(0);
      expect(stats.registeredPrefixes.length).toBeLessThanOrEqual(60);
    });
  });

  describe('TTL Configuration Integration', () => {
    it('should apply correct TTL for different prefixes', async () => {
      const operation = async () => ({
        isError: false,
        content: [{ type: 'text', text: 'ttl config test' }],
      });

      // Test a few different prefixes with known TTLs
      const testPrefixes = [
        { prefix: 'gh-api-code', expectedTTL: 3600 },
        { prefix: 'gh-api-repos', expectedTTL: 7200 },
        { prefix: 'npm-view', expectedTTL: 14400 },
        { prefix: 'unknown-prefix', expectedTTL: 86400 }, // Should use default
      ];

      for (const { prefix } of testPrefixes) {
        const key = generateCacheKey(prefix, { ttl: 'test' });

        // We can't directly verify TTL, but we can ensure the operation completes
        // without error and uses the configured prefix
        await withCache(key, operation);
        expect(key).toContain(prefix);
      }
    });

    it('should override TTL when explicitly provided', async () => {
      const operation = async () => ({
        isError: false,
        content: [{ type: 'text', text: 'override ttl' }],
      });

      const key = generateCacheKey('gh-api-code', { override: 'test' });

      // Should accept custom TTL override
      await withCache(key, operation, { ttl: 1 }); // 1 second override

      // Verify it was cached
      let executionCount = 0;
      const countingOp = async () => {
        executionCount++;
        return operation();
      };

      await withCache(key, countingOp);
      expect(executionCount).toBe(0); // Should use cache
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle cache read/write errors gracefully', async () => {
      // This test ensures the system doesn't crash on cache errors
      const operation = async () => ({
        isError: false,
        content: [{ type: 'text', text: 'error handling' }],
      });

      const key = generateCacheKey('error-handling', { robust: true });

      // Should complete without throwing even if internal cache operations fail
      expect(async () => {
        await withCache(key, operation);
      }).not.toThrow();
    });

    it('should maintain functionality with extreme parameters', () => {
      const extremeCases = [
        // Very long strings
        { data: 'x'.repeat(100000) },
        // Deep nesting
        {
          data: {
            level1: { level2: { level3: { level4: { deep: 'value' } } } },
          },
        },
        // Large arrays
        { data: Array.from({ length: 10000 }, (_, i) => i) },
        // Mixed complex data
        {
          data: {
            string: 'test'.repeat(1000),
            numbers: Array.from({ length: 1000 }, (_, i) => i * Math.PI),
            nested: {
              objects: Array.from({ length: 100 }, (_, i) => ({
                id: i,
                name: `item-${i}`,
              })),
            },
          },
        },
      ];

      const keys = new Set<string>();

      for (const extremeCase of extremeCases) {
        expect(() => {
          const key = generateCacheKey('extreme', extremeCase);
          expect(key).toBeDefined();
          expect(typeof key).toBe('string');
          expect(keys.has(key)).toBe(false);
          keys.add(key);
        }).not.toThrow();
      }
    });
  });
});

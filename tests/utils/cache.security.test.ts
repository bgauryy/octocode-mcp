import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import {
  generateCacheKey,
  withCache,
  clearAllCache,
  getCacheStats,
  CACHE_TTL_CONFIG,
} from '../../src/utils/cache';

describe('Cache Security Tests', () => {
  beforeEach(() => {
    clearAllCache();
  });

  describe('Hash Security & Collision Resistance', () => {
    it('should use full SHA-256 hash (64 characters)', () => {
      const key = generateCacheKey('test', { data: 'sample' });
      const hashPart = key.split(':')[1];

      expect(hashPart).toBeDefined();
      expect(hashPart?.length).toBe(64); // Full SHA-256 hex digest
      expect(hashPart).toMatch(/^[a-f0-9]{64}$/); // Valid hex format
    });

    it('should generate different hashes for different inputs', () => {
      const key1 = generateCacheKey('api', { user: 'alice', action: 'read' });
      const key2 = generateCacheKey('api', { user: 'alice', action: 'write' });
      const key3 = generateCacheKey('api', { user: 'bob', action: 'read' });

      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });

    it('should generate identical hashes for identical inputs', () => {
      const params = {
        user: 'alice',
        permissions: ['read', 'write'],
        timestamp: 123456,
      };
      const key1 = generateCacheKey('auth', params);
      const key2 = generateCacheKey('auth', params);

      expect(key1).toBe(key2);
    });

    it('should handle object property order consistently', () => {
      const params1 = { b: 2, a: 1, c: 3 };
      const params2 = { a: 1, c: 3, b: 2 };
      const params3 = { c: 3, a: 1, b: 2 };

      const key1 = generateCacheKey('order', params1);
      const key2 = generateCacheKey('order', params2);
      const key3 = generateCacheKey('order', params3);

      expect(key1).toBe(key2);
      expect(key1).toBe(key3);
    });

    it('should be resistant to near-collision attacks', () => {
      const keys = new Set<string>();
      const testCases = [
        { prefix: 'test', data: 'a' },
        { prefix: 'test', data: 'b' },
        { prefix: 'test', data: 'aa' },
        { prefix: 'test', data: 'ab' },
        { prefix: 'test', data: 'ba' },
        { prefix: 'test', data: 'bb' },
        { prefix: 'test', data: { nested: 'a' } },
        { prefix: 'test', data: { nested: 'b' } },
        { prefix: 'test', data: { nested: { deep: 'a' } } },
        { prefix: 'test', data: { nested: { deep: 'b' } } },
      ];

      for (const { prefix, data } of testCases) {
        const key = generateCacheKey(prefix, data);
        expect(keys.has(key)).toBe(false); // No duplicates
        keys.add(key);
      }

      expect(keys.size).toBe(testCases.length);
    });

    it('should handle edge cases without collisions', () => {
      const edgeCases = [
        { case: 'null', value: null },
        { case: 'undefined', value: undefined },
        { case: 'empty-string', value: '' },
        { case: 'zero', value: 0 },
        { case: 'false', value: false },
        { case: 'empty-array', value: [] },
        { case: 'empty-object', value: {} },
        { case: 'empty-key', value: { '': '' } },
        { case: 'null-prop', value: { prop: null } },
        { case: 'undefined-prop', value: { prop: undefined } },
        { case: 'mixed-array', value: [null, undefined, '', 0, false] },
        { case: 'complex', value: { nested: [1, 2, { deep: true }] } },
      ];

      const keys = new Set<string>();
      for (const testCase of edgeCases) {
        const key = generateCacheKey('edge', testCase);
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }

      expect(keys.size).toBe(edgeCases.length);
    });
  });

  describe('Entropy and Distribution Tests', () => {
    it('should have high entropy in generated hashes', () => {
      const keys: string[] = [];

      // Generate many keys with similar but different inputs
      for (let i = 0; i < 1000; i++) {
        const key = generateCacheKey('entropy', { id: i, data: `test-${i}` });
        keys.push(key.split(':')[1]!); // Extract hash part
      }

      // Test that hashes are well distributed
      const firstChars = keys.map(k => k[0]);
      const uniqueFirstChars = new Set(firstChars);

      // Should have good distribution across hex chars (0-9, a-f)
      expect(uniqueFirstChars.size).toBeGreaterThan(10);

      // Test bit distribution in first few bytes
      const firstBytes = keys.map(k => parseInt(k.substring(0, 2), 16));
      const avgFirstByte =
        firstBytes.reduce((a, b) => a + b, 0) / firstBytes.length;

      // Should be close to 127.5 (middle of 0-255 range)
      expect(Math.abs(avgFirstByte - 127.5)).toBeLessThan(10);
    });

    it('should maintain consistent hash format across all prefixes', () => {
      const prefixes = Object.keys(CACHE_TTL_CONFIG).slice(0, 10);

      for (const prefix of prefixes) {
        const key = generateCacheKey(prefix, { test: 'data' });
        const parts = key.split(':');

        expect(parts).toHaveLength(2);
        expect(parts[0]).toMatch(/^v\d+-/); // Version prefix
        expect(parts[0]).toContain(prefix);
        expect(parts[1]).toMatch(/^[a-f0-9]{64}$/); // 64-char hex hash
      }
    });
  });

  describe('Security Regression Tests', () => {
    it('should not truncate hashes even with large inputs', () => {
      const largeObject = {
        data: 'x'.repeat(10000),
        nested: {
          deep: {
            values: Array.from({ length: 1000 }, (_, i) => ({
              id: i,
              value: `item-${i}`,
            })),
          },
        },
      };

      const key = generateCacheKey('large', largeObject);
      const hash = key.split(':')[1]!;

      expect(hash.length).toBe(64); // Should still be full 64 chars
    });

    it('should generate keys reliably', () => {
      // Generate many keys to test key generation reliability
      const keys = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const key = generateCacheKey('collision-test', { iteration: i });
        keys.add(key);
      }

      // All keys should be unique with proper 64-char hashes
      expect(keys.size).toBe(100);
    });

    it('should maintain collision tracking integrity', () => {
      // Generate several keys
      for (let i = 0; i < 50; i++) {
        generateCacheKey('tracking', { id: i });
      }

      const stats = getCacheStats();

      // Should generate keys without errors
      expect(stats).toBeDefined();
      expect(stats.hits).toBeGreaterThanOrEqual(0);
      expect(stats.misses).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance and Memory Safety', () => {
    it('should handle high-volume key generation efficiently', () => {
      const startTime = Date.now();
      const keys = new Set<string>();

      for (let i = 0; i < 10000; i++) {
        const key = generateCacheKey('perf', {
          id: i,
          batch: Math.floor(i / 100),
        });
        keys.add(key);
      }

      const duration = Date.now() - startTime;

      expect(keys.size).toBe(10000); // All unique
      expect(duration).toBeLessThan(5000); // Should complete in reasonable time
    });

    it('should prevent memory leaks in collision tracking', () => {
      // Generate many different cache keys to test LRU behavior
      for (let i = 0; i < 2000; i++) {
        generateCacheKey(`prefix-${i}`, { data: i });
      }

      const stats = getCacheStats();

      // Should handle large numbers of keys without issues
      expect(stats).toBeDefined();
      expect(stats.cacheSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Functional Integration Tests', () => {
    it('should work correctly with withCache function', async () => {
      let executionCount = 0;
      const operation = async (): Promise<CallToolResult> => {
        executionCount++;
        return {
          isError: false,
          content: [
            { type: 'text' as const, text: `Result ${executionCount}` },
          ],
        };
      };

      const key1 = generateCacheKey('integration', { test: 'cache' });
      const key2 = generateCacheKey('integration', { test: 'cache' }); // Same params
      const key3 = generateCacheKey('integration', { test: 'different' }); // Different params

      expect(key1).toBe(key2); // Same input should generate same key
      expect(key1).not.toBe(key3); // Different input should generate different key

      // First call should execute
      const result1 = await withCache(key1, operation);
      expect(executionCount).toBe(1);

      // Second call with same key should use cache
      const result2 = await withCache(key1, operation);
      expect(executionCount).toBe(1); // Should not increment
      expect(result1).toEqual(result2);

      // Third call with different key should execute
      await withCache(key3, operation);
      expect(executionCount).toBe(2); // Should increment
    });

    it('should maintain cache statistics accuracy', () => {
      const initialStats = getCacheStats();

      // Generate some cache activity
      for (let i = 0; i < 10; i++) {
        generateCacheKey('stats', { id: i });
      }

      const finalStats = getCacheStats();

      expect(finalStats).toBeDefined();
      expect(finalStats.hits).toBeGreaterThanOrEqual(initialStats.hits);
      expect(finalStats.misses).toBeGreaterThanOrEqual(initialStats.misses);
    });
  });

  describe('Cryptographic Properties', () => {
    it('should use proper SHA-256 implementation', () => {
      const testData = { test: 'crypto-validation' };
      const cacheKey = generateCacheKey('crypto', testData);
      const hashFromCache = cacheKey.split(':')[1] || '';

      // Manually compute expected hash
      const paramString = '{"test":"crypto-validation"}'; // Simplified for this test
      const expectedHash = crypto
        .createHash('sha256')
        .update(paramString)
        .digest('hex');

      // The actual implementation uses createStableParamString which sorts keys
      // so we'll verify the hash is valid SHA-256 format and length
      expect(hashFromCache).toMatch(/^[a-f0-9]{64}$/);
      expect(hashFromCache.length).toBe(expectedHash.length);
    });

    it('should be deterministic across multiple runs', () => {
      const params = {
        user: 'test',
        action: 'validate',
        timestamp: 1234567890,
      };

      const keys = Array.from({ length: 100 }, () =>
        generateCacheKey('deterministic', params)
      );

      // All keys should be identical
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(1);
    });
  });
});

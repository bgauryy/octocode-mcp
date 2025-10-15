import { describe, it, expect, beforeEach } from 'vitest';
import NodeCache from 'node-cache';

describe('Performance Characteristics', () => {
  let cache: NodeCache;

  beforeEach(() => {
    cache = new NodeCache({
      stdTTL: 3600,
      checkperiod: 120,
      useClones: false,
    });
  });

  describe('Operation Speed', () => {
    it('should perform write operations quickly', () => {
      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        cache.set(`key:${i}`, `value-${i}`);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete 1000 writes in less than 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should perform read operations quickly', () => {
      // Pre-populate cache
      for (let i = 0; i < 1000; i++) {
        cache.set(`key:${i}`, `value-${i}`);
      }

      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        cache.get(`key:${i}`);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete 1000 reads in less than 50ms
      expect(duration).toBeLessThan(50);
    });

    it('should handle parallel operations efficiently', () => {
      const operations = 100;
      const startTime = performance.now();

      const promises = Array.from({ length: operations }, (_, i) =>
        Promise.resolve().then(() => {
          cache.set(`parallel:${i}`, `value-${i}`);
          return cache.get(`parallel:${i}`);
        })
      );

      return Promise.all(promises).then(() => {
        const endTime = performance.now();
        const duration = endTime - startTime;

        // Should complete in reasonable time
        expect(duration).toBeLessThan(100);
      });
    });
  });

  describe('Memory Efficiency', () => {
    it('should handle large number of keys', () => {
      const keyCount = 10000;

      for (let i = 0; i < keyCount; i++) {
        cache.set(`key:${i}`, `value-${i}`);
      }

      // Verify all keys are present
      let foundKeys = 0;
      for (let i = 0; i < keyCount; i++) {
        if (cache.get(`key:${i}`) !== undefined) {
          foundKeys++;
        }
      }

      expect(foundKeys).toBe(keyCount);
    });

    it('should handle large values efficiently', () => {
      const largeValue = 'x'.repeat(1024 * 1024); // 1MB

      const startTime = performance.now();
      cache.set('large:value', largeValue);
      const retrieved = cache.get('large:value');
      const endTime = performance.now();

      expect(retrieved).toBe(largeValue);
      expect(endTime - startTime).toBeLessThan(50);
    });

    it('should handle JSON serialization efficiently', () => {
      const complexObject = {
        taskId: '3.1',
        description: 'Complex task',
        files: Array.from({ length: 100 }, (_, i) => `file-${i}.ts`),
        metadata: {
          nested: {
            deep: {
              value: 'test',
              array: Array.from({ length: 50 }, (_, i) => i),
            },
          },
        },
      };

      const startTime = performance.now();
      const stringified = JSON.stringify(complexObject);
      cache.set('complex:object', stringified);
      const retrieved = cache.get('complex:object');
      const parsed = JSON.parse(retrieved as string);
      const endTime = performance.now();

      expect(parsed).toEqual(complexObject);
      expect(endTime - startTime).toBeLessThan(10);
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent reads safely', async () => {
      cache.set('shared:key', 'shared value');

      const reads = Array.from({ length: 100 }, () =>
        Promise.resolve(cache.get('shared:key'))
      );

      const results = await Promise.all(reads);

      results.forEach((result) => {
        expect(result).toBe('shared value');
      });
    });

    it('should handle concurrent writes safely', async () => {
      const writes = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve().then(() => cache.set(`concurrent:${i}`, `value-${i}`))
      );

      await Promise.all(writes);

      // Verify all writes succeeded
      for (let i = 0; i < 100; i++) {
        expect(cache.get(`concurrent:${i}`)).toBe(`value-${i}`);
      }
    });

    it('should handle mixed read/write operations', async () => {
      const operations = Array.from({ length: 200 }, (_, i) =>
        Promise.resolve().then(() => {
          if (i % 2 === 0) {
            cache.set(`mixed:${i}`, `value-${i}`);
          } else {
            return cache.get(`mixed:${i - 1}`);
          }
        })
      );

      await Promise.all(operations);

      // Verify writes succeeded
      for (let i = 0; i < 200; i += 2) {
        expect(cache.get(`mixed:${i}`)).toBe(`value-${i}`);
      }
    });
  });

  describe('TTL Performance', () => {
    it('should handle TTL expiration efficiently', async () => {
      // Set multiple keys with short TTL
      for (let i = 0; i < 100; i++) {
        cache.set(`ttl:${i}`, `value-${i}`, 1);
      }

      // All keys should exist initially
      expect(cache.get('ttl:0')).toBeDefined();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Keys should be expired
      expect(cache.get('ttl:0')).toBeUndefined();
    });

    it('should not impact performance with active TTLs', () => {
      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        cache.set(`ttl:${i}`, `value-${i}`, 300);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100);
    });
  });

  describe('Scalability', () => {
    it('should scale linearly with data size', () => {
      const sizes = [100, 500, 1000];
      const timings: number[] = [];

      sizes.forEach((size) => {
        cache.flushAll();

        const startTime = performance.now();
        for (let i = 0; i < size; i++) {
          cache.set(`scale:${i}`, `value-${i}`);
        }
        const endTime = performance.now();

        timings.push(endTime - startTime);
      });

      // Later operations shouldn't be dramatically slower
      // (accounting for some variance in system performance)
      const firstTiming = timings[0];
      const lastTiming = timings[timings.length - 1];

      // 10x data should be less than 20x time (linear with headroom)
      expect(lastTiming).toBeLessThan(firstTiming * 20);
    });
  });
});

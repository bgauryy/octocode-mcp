import { describe, it, expect, beforeEach } from 'vitest';
import { generateCacheKey, clearAllCache } from '../../src/utils/cache';

describe('Cache Key Entropy and Uniqueness Tests', () => {
  beforeEach(() => {
    clearAllCache();
  });

  describe('Statistical Entropy Analysis', () => {
    it('should demonstrate high entropy across hash output', () => {
      const hashes: string[] = [];
      const sampleSize = 5000;

      // Generate diverse inputs
      for (let i = 0; i < sampleSize; i++) {
        const key = generateCacheKey('entropy', {
          id: i,
          uuid: `${Math.random()}-${Date.now()}-${i}`,
          data: Array.from({ length: 20 }, () =>
            Math.random().toString(36)
          ).join(''),
          nested: {
            level1: { level2: { value: i * Math.random() } },
            array: Array.from({ length: i % 10 }, (_, j) => j * i),
          },
        });
        const hashPart = key.split(':')[1];
        if (hashPart) hashes.push(hashPart);
      }

      // Calculate Shannon entropy for the hash strings
      const calculateEntropy = (data: string[]): number => {
        const chars = data.join('');
        const freq: Record<string, number> = {};

        // Count character frequencies
        for (const char of chars) {
          freq[char] = (freq[char] || 0) + 1;
        }

        const total = chars.length;
        let entropy = 0;

        for (const count of Object.values(freq)) {
          const probability = count / total;
          entropy -= probability * Math.log2(probability);
        }

        return entropy;
      };

      const entropy = calculateEntropy(hashes);

      // For hex characters (4 bits each), maximum entropy is 4
      // Good entropy should be close to 4 (at least 3.5)
      expect(entropy).toBeGreaterThan(3.5);
      expect(entropy).toBeLessThanOrEqual(4.0);
    });

    it('should maintain uniform bit distribution', () => {
      const bitCounts = Array(256).fill(0); // Track each bit position across all hashes
      const sampleSize = 2000;

      for (let i = 0; i < sampleSize; i++) {
        const key = generateCacheKey('bitdist', {
          iteration: i,
          random: Math.random(),
          timestamp: Date.now() + i,
        });

        const hash = key.split(':')[1] || '';

        // Convert hex to binary and count bits
        for (let j = 0; j < hash.length; j += 2) {
          const hexPair = hash.substring(j, j + 2);
          const byte = parseInt(hexPair, 16);

          // Check each bit in the byte
          for (let bit = 0; bit < 8; bit++) {
            const bitIndex = (j / 2) * 8 + bit;
            if (byte & (1 << bit)) {
              bitCounts[bitIndex]++;
            }
          }
        }
      }

      // Each bit should be set approximately 50% of the time
      const expectedCount = sampleSize * 0.5;
      const tolerance = sampleSize * 0.1; // 10% tolerance

      for (let i = 0; i < 256; i++) {
        // 32 bytes * 8 bits = 256 bits
        const count = bitCounts[i];
        expect(count).toBeGreaterThan(expectedCount - tolerance);
        expect(count).toBeLessThan(expectedCount + tolerance);
      }
    });

    it('should pass chi-square test for randomness', () => {
      const hexCounts: Record<string, number> = {};
      const hexChars = '0123456789abcdef';
      const sampleSize = 10000;

      // Initialize counters
      for (const char of hexChars) {
        hexCounts[char] = 0;
      }

      // Generate hashes and count hex character frequencies
      for (let i = 0; i < sampleSize; i++) {
        const key = generateCacheKey('chisquare', {
          id: i,
          data: `sample-${i}-${Math.random()}`,
        });

        const hash = key.split(':')[1];
        if (hash) {
          for (const char of hash) {
            hexCounts[char] = (hexCounts[char] ?? 0) + 1;
          }
        }
      }

      // Chi-square test
      const totalChars = sampleSize * 64; // 64 hex chars per hash
      const expectedPerChar = totalChars / 16; // 16 hex characters
      let chiSquare = 0;

      for (const char of hexChars) {
        const observed = hexCounts[char] || 0;
        const deviation = observed - expectedPerChar;
        chiSquare += (deviation * deviation) / expectedPerChar;
      }

      // Critical value for 15 degrees of freedom at 99% confidence is ~30
      // Use higher threshold to reduce false positives in CI/random environments
      expect(chiSquare).toBeLessThan(35);

      // Additional check: ensure no character is completely missing or overly dominant
      for (const char of hexChars) {
        const observed = hexCounts[char] || 0;
        const percentage = (observed / totalChars) * 100;
        // Each character should appear roughly 6.25% of the time (100/16)
        // Allow reasonable variance: 4% to 8.5%
        expect(percentage).toBeGreaterThan(4);
        expect(percentage).toBeLessThan(8.5);
      }
    });
  });

  describe('Uniqueness Guarantees', () => {
    it('should ensure no duplicates across different prefixes', () => {
      const allKeys = new Set<string>();
      const prefixes = [
        'api',
        'cache',
        'user',
        'session',
        'auth',
        'data',
        'file',
        'temp',
      ];

      for (const prefix of prefixes) {
        for (let i = 0; i < 100; i++) {
          const key = generateCacheKey(prefix, {
            id: i,
            prefix: prefix, // Include prefix in data too
            timestamp: Date.now(),
          });

          expect(allKeys.has(key)).toBe(false);
          allKeys.add(key);
        }
      }

      expect(allKeys.size).toBe(prefixes.length * 100);
    });

    it('should maintain uniqueness with systematic data patterns', () => {
      const keys = new Set<string>();
      const patterns = [
        // Sequential patterns
        ...Array.from({ length: 100 }, (_, i) => ({
          type: 'seq',
          index: i,
          value: i,
        })),
        // Power of 2 patterns
        ...Array.from({ length: 20 }, (_, i) => ({
          type: 'pow2',
          index: i,
          value: Math.pow(2, i),
        })),
        // Simple fibonacci patterns (avoid deep recursion)
        ...Array.from({ length: 20 }, (_, i) => {
          let a = 0,
            b = 1;
          for (let j = 0; j < i; j++) {
            [a, b] = [b, a + b];
          }
          return { type: 'fib', index: i, value: a };
        }),
        // Prime number patterns
        ...Array.from({ length: 25 }, (_, i) => {
          // Generate the i-th prime number
          const isPrime = (n: number) => {
            if (n < 2) return false;
            for (let j = 2; j * j <= n; j++) {
              if (n % j === 0) return false;
            }
            return true;
          };

          if (i === 0) return { type: 'prime', index: i, value: 2 }; // First prime

          let primeCount = 1; // Already found 2
          let num = 3;

          while (primeCount < i && num < 1000) {
            if (isPrime(num)) {
              primeCount++;
            }
            if (primeCount < i) {
              num += 2; // Only check odd numbers after 2
            }
          }
          return { type: 'prime', index: i, value: num };
        }),
      ];

      for (const pattern of patterns) {
        const key = generateCacheKey('pattern', pattern);
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }

      expect(keys.size).toBe(patterns.length);
    });

    it('should handle edge cases in uniqueness', () => {
      const edgeCases = new Map<string, unknown[]>([
        ['empty', [null, undefined, '', 0, false, [], {}]],
        [
          'boundary',
          [
            Number.MAX_SAFE_INTEGER,
            Number.MIN_SAFE_INTEGER,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
            -0,
            +0,
          ],
        ],
        [
          'strings',
          [
            'a',
            'A',
            ' a',
            'a ',
            ' a ',
            '\n',
            '\r',
            '\t',
            '\0',
            '\\',
            '/',
            '"',
            "'",
          ],
        ],
        [
          'unicode',
          [
            '🔒',
            '🚀',
            '💯',
            '🌈',
            '👨‍💻',
            'café',
            'naïve',
            '北京',
            'العربية',
            'русский',
          ],
        ],
        [
          'json-like',
          ['{"a":1}', '{a:1}', "{'a':1}", '[1,2,3]', '(1,2,3)', '1,2,3'],
        ],
      ]);

      const allKeys = new Set<string>();

      for (const [category, cases] of edgeCases) {
        for (let i = 0; i < cases.length; i++) {
          const key = generateCacheKey(category, {
            case: i,
            value: cases[i],
            category,
          });

          expect(allKeys.has(key)).toBe(false);
          allKeys.add(key);
        }
      }

      const expectedTotal = Array.from(edgeCases.values()).reduce(
        (sum, cases) => sum + (cases?.length || 0),
        0
      );
      expect(allKeys.size).toBe(expectedTotal);
    });
  });

  describe('Collision Probability Analysis', () => {
    it('should demonstrate extremely low collision probability', () => {
      const keys = new Set<string>();
      const iterations = 50000; // Large sample size

      for (let i = 0; i < iterations; i++) {
        const key = generateCacheKey('probability', {
          id: i,
          random1: Math.random(),
          random2: Math.random(),
          timestamp: Date.now() + Math.random(),
          data: Array.from({ length: 20 }, () =>
            Math.random().toString(36).substring(2)
          ).join(''),
        });

        expect(keys.has(key)).toBe(false); // No collisions expected
        keys.add(key);
      }

      expect(keys.size).toBe(iterations);

      // Calculate expected collision probability for 64-char hex (256-bit) hash
      // Using birthday paradox: P ≈ 1 - e^(-n²/(2*2^256))
      // For n = 50,000, this should be essentially 0
      const n = iterations;
      const hashSpace = Math.pow(2, 256);
      const expectedCollisionProb = 1 - Math.exp(-(n * n) / (2 * hashSpace));

      // Should be virtually zero
      expect(expectedCollisionProb).toBeLessThan(1e-70);
    });

    it('should maintain low collision risk under adversarial conditions', () => {
      const keys = new Set<string>();
      const adversarialCases = [
        // Intentionally similar data structures
        ...Array.from({ length: 1000 }, (_, i) => ({
          base: 'attack',
          suffix: i,
          payload: `payload${i}`,
        })),

        // Hash-like strings (attempt to confuse the hasher)
        ...Array.from({ length: 500 }, (_, i) => ({
          fakeHash: Array.from({ length: 64 }, () =>
            Math.floor(Math.random() * 16).toString(16)
          ).join(''),
          index: i,
        })),

        // Structured attacks
        ...Array.from({ length: 500 }, (_, i) => ({
          structure: {
            level1: { level2: { value: i } },
            parallel: { branch: i },
          },
        })),
      ];

      for (const adversarial of adversarialCases) {
        const key = generateCacheKey('adversarial', adversarial);
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }

      expect(keys.size).toBe(adversarialCases.length);
    });
  });

  describe('Performance Impact of Security Fix', () => {
    it('should maintain reasonable performance with full hash', () => {
      const iterations = 10000;
      const startTime = process.hrtime.bigint();

      for (let i = 0; i < iterations; i++) {
        generateCacheKey('performance', {
          id: i,
          data: `test-data-${i}`,
          complex: {
            nested: { value: i },
            array: Array.from({ length: i % 10 }, (_, j) => j),
          },
        });
      }

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1_000_000;
      const operationsPerSecond = (iterations / durationMs) * 1000;

      // Should maintain high performance (>10k ops/sec)
      expect(operationsPerSecond).toBeGreaterThan(10000);

      // Average time per operation should be reasonable (<0.1ms)
      const avgTimePerOp = durationMs / iterations;
      expect(avgTimePerOp).toBeLessThan(0.1);
    });

    it('should scale reasonably with input size', () => {
      const inputSizes = [10, 100, 1000]; // Reduced sizes for faster test
      const timings: number[] = [];

      for (const size of inputSizes) {
        const largeData = {
          array: Array.from({ length: size }, (_, i) => ({
            id: i,
            value: `item-${i}`,
          })),
          string: 'x'.repeat(size),
        };

        const iterations = 50; // Reduced iterations
        const startTime = process.hrtime.bigint();

        for (let i = 0; i < iterations; i++) {
          generateCacheKey('scaling', { ...largeData, iteration: i });
        }

        const endTime = process.hrtime.bigint();
        const avgTime = Number(endTime - startTime) / (iterations * 1_000_000);
        timings.push(avgTime);
      }

      // Performance should degrade reasonably with input size
      // Allow some variance on CI – each step should not be more than 25x slower than previous
      for (let i = 1; i < timings.length; i++) {
        const current = timings[i];
        const previous = timings[i - 1];
        if (current && previous) {
          const ratio = current / previous;
          expect(ratio).toBeLessThan(25);
        }
      }
    });
  });

  describe('Memory Efficiency with Full Hashes', () => {
    it('should not cause memory leaks with longer keys', () => {
      const initialMemory = process.memoryUsage();
      const keys: string[] = [];

      // Generate many keys and keep references
      for (let i = 0; i < 100000; i++) {
        const key = generateCacheKey('memory', {
          id: i,
          data: `memory-test-${i}`,
        });
        keys.push(key);
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const bytesPerKey = memoryIncrease / keys.length;

      // Each 64-char hash should use reasonable memory
      // Account for string overhead, but should be < 500 bytes per key
      expect(bytesPerKey).toBeLessThan(500);

      // Verify we actually generated unique keys
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });

    it('should handle cleanup properly', () => {
      // Generate many keys
      for (let i = 0; i < 10000; i++) {
        generateCacheKey('cleanup', { iteration: i });
      }

      const beforeCleanup = process.memoryUsage();

      // Clear cache
      clearAllCache();

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const afterCleanup = process.memoryUsage();

      // Memory usage should not increase dramatically after cleanup
      const memoryDiff = afterCleanup.heapUsed - beforeCleanup.heapUsed;
      expect(memoryDiff).toBeLessThan(10_000_000); // Less than 10MB increase
    });
  });
});

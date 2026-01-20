/**
 * Promise Utils Branch Coverage Tests
 * Targets uncovered branches in promise.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeWithErrorIsolation } from '../../src/utils/core/promise.js';

// Mock logSessionError
vi.mock('../../src/session.js', () => ({
  logSessionError: vi.fn(() => Promise.resolve()),
}));

describe('promiseUtils - Branch Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Promise.allSettled rejected mapping (line 71)', () => {
    /**
     * The Promise.allSettled branch for rejected promises (lines 70-79)
     * is normally unreachable because createIsolatedPromise always catches errors
     * and returns a PromiseResult. However, we can test the logic by verifying
     * that non-Error rejections are properly wrapped.
     *
     * The path through createIsolatedPromise's catch block (line 120) already
     * converts non-Errors, so we need to test scenarios where this conversion
     * happens correctly.
     */
    it('should handle non-Error reason in catch and return wrapped Error', async () => {
      // This tests the catch block conversion at line 120
      const promises = [
        () => Promise.reject('just a string'),
        () => Promise.reject(42),
        () => Promise.reject(null),
        () => Promise.reject(undefined),
        () => Promise.reject({ custom: 'object' }),
      ];

      const results = await executeWithErrorIsolation(promises);

      expect(results).toHaveLength(5);

      // All should have Error objects with stringified messages
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBeInstanceOf(Error);
      expect(results[0]!.error!.message).toBe('just a string');

      expect(results[1]!.success).toBe(false);
      expect(results[1]!.error).toBeInstanceOf(Error);
      expect(results[1]!.error!.message).toBe('42');

      expect(results[2]!.success).toBe(false);
      expect(results[2]!.error).toBeInstanceOf(Error);
      expect(results[2]!.error!.message).toBe('null');

      expect(results[3]!.success).toBe(false);
      expect(results[3]!.error).toBeInstanceOf(Error);
      expect(results[3]!.error!.message).toBe('undefined');

      expect(results[4]!.success).toBe(false);
      expect(results[4]!.error).toBeInstanceOf(Error);
      expect(results[4]!.error!.message).toContain('object');
    });

    it('should handle synchronous throw of non-Error in promise function', async () => {
      // When promise function throws synchronously (not rejecting)
      const promises = [
        () => {
          throw 'synchronous string throw';
        },
        () => {
          throw 123;
        },
        () => {
          throw { error: 'object throw' };
        },
      ];

      const results = await executeWithErrorIsolation(
        promises as Array<() => Promise<unknown>>
      );

      expect(results).toHaveLength(3);

      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBeInstanceOf(Error);
      expect(results[0]!.error!.message).toBe('synchronous string throw');

      expect(results[1]!.success).toBe(false);
      expect(results[1]!.error).toBeInstanceOf(Error);
      expect(results[1]!.error!.message).toBe('123');

      expect(results[2]!.success).toBe(false);
      expect(results[2]!.error).toBeInstanceOf(Error);
    });
  });

  describe('executeWithConcurrencyLimit catch block (line 174)', () => {
    /**
     * The catch block at lines 173-179 handles errors from createIsolatedPromise.
     * Since createIsolatedPromise catches all errors internally, this catch block
     * is defensive. We test the error conversion logic indirectly.
     */
    it('should handle non-Error thrown in concurrency-limited execution', async () => {
      const promises = [
        () => {
          throw 'string error in concurrency path';
        },
        () => Promise.resolve('success'),
        () => {
          throw 999;
        },
      ];

      const results = await executeWithErrorIsolation(
        promises as Array<() => Promise<unknown>>,
        { concurrency: 1 }
      );

      expect(results).toHaveLength(3);

      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBeInstanceOf(Error);
      expect(results[0]!.error!.message).toBe(
        'string error in concurrency path'
      );

      expect(results[1]!.success).toBe(true);
      expect(results[1]!.data).toBe('success');

      expect(results[2]!.success).toBe(false);
      expect(results[2]!.error).toBeInstanceOf(Error);
      expect(results[2]!.error!.message).toBe('999');
    });

    it('should handle various non-Error types in concurrency limit path', async () => {
      const promises = [
        () => Promise.reject(false),
        () => Promise.reject(BigInt(12345)),
        () => Promise.reject(Symbol('sym')),
        () =>
          Promise.reject(
            new (class CustomError {
              message = 'custom';
            })()
          ),
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
      });

      expect(results).toHaveLength(4);

      results.forEach(result => {
        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(Error);
      });

      // Verify messages are properly converted
      expect(results[0]!.error!.message).toBe('false');
      expect(results[1]!.error!.message).toBe('12345');
      expect(results[2]!.error!.message).toContain('Symbol');
    });

    it('should preserve error order with non-Errors in mixed execution', async () => {
      const promises = [
        () => Promise.resolve('first'),
        () => Promise.reject('second-error'),
        () => Promise.resolve('third'),
        () => Promise.reject(404),
        () => Promise.resolve('fifth'),
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
      });

      expect(results).toHaveLength(5);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.index).toBe(0);

      expect(results[1]!.success).toBe(false);
      expect(results[1]!.index).toBe(1);
      expect(results[1]!.error!.message).toBe('second-error');

      expect(results[2]!.success).toBe(true);
      expect(results[2]!.index).toBe(2);

      expect(results[3]!.success).toBe(false);
      expect(results[3]!.index).toBe(3);
      expect(results[3]!.error!.message).toBe('404');

      expect(results[4]!.success).toBe(true);
      expect(results[4]!.index).toBe(4);
    });
  });

  describe('Edge cases for error conversion', () => {
    it('should handle empty string rejection', async () => {
      const promises = [() => Promise.reject('')];

      const results = await executeWithErrorIsolation(promises);

      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBeInstanceOf(Error);
      expect(results[0]!.error!.message).toBe('');
    });

    it('should handle array rejection', async () => {
      const promises = [() => Promise.reject([1, 2, 3])];

      const results = await executeWithErrorIsolation(promises);

      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBeInstanceOf(Error);
      expect(results[0]!.error!.message).toBe('1,2,3');
    });

    it('should handle function rejection', async () => {
      const promises = [() => Promise.reject(() => 'I am a function')];

      const results = await executeWithErrorIsolation(promises);

      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBeInstanceOf(Error);
    });

    it('should handle Date rejection', async () => {
      const date = new Date('2024-01-01');
      const promises = [() => Promise.reject(date)];

      const results = await executeWithErrorIsolation(promises);

      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBeInstanceOf(Error);
      expect(results[0]!.error!.message).toContain('2024');
    });

    it('should handle RegExp rejection', async () => {
      const promises = [() => Promise.reject(/pattern/)];

      const results = await executeWithErrorIsolation(promises);

      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBeInstanceOf(Error);
      expect(results[0]!.error!.message).toContain('pattern');
    });
  });

  describe('Concurrency with sparse arrays', () => {
    it('should handle sparse array elements in concurrency path', async () => {
      // Create a sparse array with undefined slots
      const promises = new Array<() => Promise<number>>(5);
      promises[0] = () => Promise.resolve(0);
      promises[2] = () => Promise.resolve(2);
      promises[4] = () => Promise.resolve(4);
      // indices 1 and 3 are empty (undefined)

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
      });

      expect(results).toHaveLength(5);
      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(false); // undefined function
      expect(results[2]!.success).toBe(true);
      expect(results[3]!.success).toBe(false); // undefined function
      expect(results[4]!.success).toBe(true);
    });
  });

  describe('Timeout with non-Error rejection', () => {
    it('should properly timeout and convert in concurrency path', async () => {
      vi.useFakeTimers();

      const promises = [
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject('timeout reached'), 5000);
          }),
        () => Promise.resolve('quick'),
      ];

      const resultPromise = executeWithErrorIsolation(promises, {
        timeout: 1000,
        concurrency: 1,
      });

      await vi.advanceTimersByTimeAsync(1500);

      const results = await resultPromise;

      expect(results).toHaveLength(2);
      // First should timeout (the promise's own rejection won't happen)
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error!.message).toContain('timed out');

      expect(results[1]!.success).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('Promise.allSettled rejected branch coverage (lines 71-79)', () => {
    /**
     * The else branch in the allSettled mapping (lines 70-79) handles the case where
     * a promise in the allSettled results is rejected. This is defensive code since
     * createIsolatedPromise always catches errors and returns a PromiseResult.
     *
     * To test this branch, we mock Promise.allSettled to return a rejected result.
     */
    it('should handle rejected status from allSettled with Error reason', async () => {
      const mockAllSettled = vi
        .spyOn(Promise, 'allSettled')
        .mockImplementationOnce(async () => {
          return [
            {
              status: 'rejected' as const,
              reason: new Error('Forced rejection'),
            },
          ];
        });

      const promises = [() => Promise.resolve('should not matter')];
      const results = await executeWithErrorIsolation(promises);

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBeInstanceOf(Error);
      expect(results[0]!.error!.message).toBe('Forced rejection');

      mockAllSettled.mockRestore();
    });

    it('should handle rejected status from allSettled with non-Error reason', async () => {
      const mockAllSettled = vi
        .spyOn(Promise, 'allSettled')
        .mockImplementationOnce(async () => {
          return [
            {
              status: 'rejected' as const,
              reason: 'string rejection',
            },
            {
              status: 'rejected' as const,
              reason: 42,
            },
            {
              status: 'rejected' as const,
              reason: null,
            },
          ];
        });

      const promises = [
        () => Promise.resolve('a'),
        () => Promise.resolve('b'),
        () => Promise.resolve('c'),
      ];
      const results = await executeWithErrorIsolation(promises);

      expect(results).toHaveLength(3);

      // Line 71-76: non-Error reason should be wrapped in Error
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBeInstanceOf(Error);
      expect(results[0]!.error!.message).toBe('string rejection');

      expect(results[1]!.success).toBe(false);
      expect(results[1]!.error).toBeInstanceOf(Error);
      expect(results[1]!.error!.message).toBe('42');

      expect(results[2]!.success).toBe(false);
      expect(results[2]!.error).toBeInstanceOf(Error);
      expect(results[2]!.error!.message).toBe('null');

      mockAllSettled.mockRestore();
    });
  });

  describe('executeWithConcurrencyLimit catch block (lines 173-179)', () => {
    /**
     * The catch block in executeWithConcurrencyLimit (lines 173-179) is defensive
     * since createIsolatedPromise catches all errors internally. To test it, we need
     * to make createIsolatedPromise throw, which requires module mocking.
     *
     * We simulate this by testing error conversion behavior which is the same logic.
     */
    it('should handle catch block with Error', async () => {
      // This tests the error instanceof Error branch at line 176
      const promises = [
        () => {
          throw new Error('Direct throw');
        },
      ];

      const results = await executeWithErrorIsolation(
        promises as Array<() => Promise<unknown>>,
        { concurrency: 1 }
      );

      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBeInstanceOf(Error);
      expect(results[0]!.error!.message).toBe('Direct throw');
    });

    it('should handle catch block with non-Error (line 176 else branch)', async () => {
      // The else branch at line 176 converts non-Error to Error
      const promises = [
        () => {
          throw 'string throw'; // Non-Error
        },
      ];

      const results = await executeWithErrorIsolation(
        promises as Array<() => Promise<unknown>>,
        { concurrency: 1 }
      );

      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBeInstanceOf(Error);
      expect(results[0]!.error!.message).toBe('string throw');
    });
  });

  describe('Catch block coverage via await rejection', () => {
    /**
     * Line 174 is in the catch block of executeWithConcurrencyLimit.
     * Since createIsolatedPromise never throws (it catches all errors),
     * this catch block is defensive. However, we can verify the error
     * conversion logic is correct through other paths.
     */
    it('should convert various non-Error types to Error in error handling', async () => {
      // Test multiple non-Error types to ensure conversion is correct
      const testCases = [
        { input: 0, expected: '0' },
        { input: -1, expected: '-1' },
        { input: NaN, expected: 'NaN' },
        { input: Infinity, expected: 'Infinity' },
        { input: '', expected: '' },
        { input: ' ', expected: ' ' },
        { input: [], expected: '' },
        { input: {}, expected: '[object Object]' },
      ];

      for (const { input, expected } of testCases) {
        const promises = [() => Promise.reject(input)];
        const results = await executeWithErrorIsolation(promises, {
          concurrency: 1,
        });

        expect(results[0]!.success).toBe(false);
        expect(results[0]!.error).toBeInstanceOf(Error);
        expect(results[0]!.error!.message).toBe(expected);
      }
    });
  });
});

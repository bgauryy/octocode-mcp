import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeWithErrorIsolation } from '../../src/utils/core/promise.js';
import type { PromiseExecutionOptions } from '../../src/types';
import { VALIDATION_ERRORS, PROMISE_ERRORS } from '../../src/errorCodes';
import { logSessionError } from '../../src/session';

// Mock logSessionError
vi.mock('../../src/session.js', () => ({
  logSessionError: vi.fn(() => Promise.resolve()),
}));

describe('promiseUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('executeWithErrorIsolation', () => {
    it('should handle empty promise array', async () => {
      const result = await executeWithErrorIsolation([]);
      expect(result).toEqual([]);
    });

    it('should execute all promises successfully', async () => {
      const promises = [
        () => Promise.resolve('result1'),
        () => Promise.resolve('result2'),
        () => Promise.resolve('result3'),
      ];

      const results = await executeWithErrorIsolation(promises);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({
        success: true,
        data: 'result1',
        index: 0,
      });
      expect(results[1]).toEqual({
        success: true,
        data: 'result2',
        index: 1,
      });
      expect(results[2]).toEqual({
        success: true,
        data: 'result3',
        index: 2,
      });
    });

    it('should isolate errors and continue with other promises', async () => {
      const promises = [
        () => Promise.resolve('success1'),
        () => Promise.reject(new Error('error1')),
        () => Promise.resolve('success2'),
        () => Promise.reject(new Error('error2')),
      ];

      const results = await executeWithErrorIsolation(promises);

      expect(results).toHaveLength(4);

      expect(results[0]).toEqual({
        success: true,
        data: 'success1',
        index: 0,
      });

      expect(results[1]).toEqual({
        success: false,
        error: expect.any(Error),
        index: 1,
      });
      expect(results[1]?.error?.message).toBe('error1');

      expect(results[2]).toEqual({
        success: true,
        data: 'success2',
        index: 2,
      });

      expect(results[3]).toEqual({
        success: false,
        error: expect.any(Error),
        index: 3,
      });
      expect(results[3]?.error?.message).toBe('error2');
    });

    it('should handle non-Error rejection reasons', async () => {
      const promises = [
        () => Promise.resolve('success'),
        () => Promise.reject('string error'), // Non-Error rejection
        () => Promise.reject(123), // Number rejection
        () => Promise.reject({ custom: 'object' }), // Object rejection
      ];

      const results = await executeWithErrorIsolation(promises);

      expect(results).toHaveLength(4);
      expect(results[0]?.success).toBe(true);

      // String rejection should be converted to Error
      expect(results[1]?.success).toBe(false);
      expect(results[1]?.error).toBeInstanceOf(Error);
      expect(results[1]?.error?.message).toBe('string error');

      // Number rejection should be converted to Error
      expect(results[2]?.success).toBe(false);
      expect(results[2]?.error).toBeInstanceOf(Error);
      expect(results[2]?.error?.message).toBe('123');

      // Object rejection should be converted to Error
      expect(results[3]?.success).toBe(false);
      expect(results[3]?.error).toBeInstanceOf(Error);
      expect(results[3]?.error?.message).toContain('object');
    });

    it('should handle timeout correctly', async () => {
      vi.useFakeTimers();

      try {
        const promises = [
          () => new Promise(resolve => setTimeout(() => resolve('fast'), 500)),
          () => new Promise(resolve => setTimeout(() => resolve('slow'), 2000)),
        ];

        const options: PromiseExecutionOptions = { timeout: 1000 };
        const resultPromise = executeWithErrorIsolation(promises, options);

        // Advance time to complete first promise but not second
        vi.advanceTimersByTime(500);
        await vi.runAllTimersAsync();

        // Advance time past timeout
        vi.advanceTimersByTime(600);
        await vi.runAllTimersAsync();

        const results = await resultPromise;

        expect(results).toHaveLength(2);
        expect(results[0]).toEqual({
          success: true,
          data: 'fast',
          index: 0,
        });
        expect(results[1]).toEqual({
          success: false,
          error: expect.any(Error),
          index: 1,
        });
        expect(results[1]?.error?.message).toContain('timed out after 1000ms');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should call onError callback for failed promises', async () => {
      const onError = vi.fn();
      const promises = [
        () => Promise.resolve('success'),
        () => Promise.reject(new Error('test error')),
      ];

      const options: PromiseExecutionOptions = { onError };

      await executeWithErrorIsolation(promises, options);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 1);
      expect(onError.mock.calls[0]?.[0]?.message).toBe('test error');
    });

    it('should handle onError callback throwing error', async () => {
      const onError = vi.fn().mockImplementation(() => {
        throw new Error('callback error');
      });

      const promises = [() => Promise.reject(new Error('original error'))];

      const options: PromiseExecutionOptions = { onError };

      const results = await executeWithErrorIsolation(promises, options);

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error?.message).toBe('original error');
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('should handle non-Error rejection values', async () => {
      const promises = [
        () => Promise.reject('string error'),
        () => Promise.reject(null),
        () => Promise.reject(undefined),
        () => Promise.reject({ message: 'object error' }),
      ];

      const results = await executeWithErrorIsolation(promises);

      expect(results).toHaveLength(4);
      results.forEach((result, index) => {
        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(Error);
        expect(result.index).toBe(index);
      });

      expect(results[0]?.error?.message).toBe('string error');
      expect(results[1]?.error?.message).toBe('null');
      expect(results[2]?.error?.message).toBe('undefined');
      expect(results[3]?.error?.message).toBe('[object Object]');
    });

    describe('Validation Errors', () => {
      it('should throw if promises argument is not an array', async () => {
        // @ts-expect-error - Testing runtime validation
        await expect(executeWithErrorIsolation('not-array')).rejects.toThrow(
          VALIDATION_ERRORS.PROMISES_NOT_ARRAY.message
        );
        expect(logSessionError).toHaveBeenCalledWith(
          'promiseUtils',
          VALIDATION_ERRORS.PROMISES_NOT_ARRAY.code
        );
      });

      it('should throw if timeout is not positive', async () => {
        const promises = [() => Promise.resolve(1)];
        await expect(
          executeWithErrorIsolation(promises, { timeout: 0 })
        ).rejects.toThrow(VALIDATION_ERRORS.TIMEOUT_NOT_POSITIVE.message);
        expect(logSessionError).toHaveBeenCalledWith(
          'promiseUtils',
          VALIDATION_ERRORS.TIMEOUT_NOT_POSITIVE.code
        );
      });

      it('should throw if concurrency is not positive', async () => {
        const promises = [() => Promise.resolve(1)];
        await expect(
          executeWithErrorIsolation(promises, { concurrency: 0 })
        ).rejects.toThrow(VALIDATION_ERRORS.CONCURRENCY_NOT_POSITIVE.message);
        expect(logSessionError).toHaveBeenCalledWith(
          'promiseUtils',
          VALIDATION_ERRORS.CONCURRENCY_NOT_POSITIVE.code
        );
      });

      it('should handle non-function elements in promises array', async () => {
        const promises = [() => Promise.resolve(1), 'not-a-function'];

        // @ts-expect-error - Testing runtime validation
        const results = await executeWithErrorIsolation(promises);

        expect(results).toHaveLength(2);
        expect(results[0]?.success).toBe(true);
        expect(results[1]?.success).toBe(false);
        expect(results[1]?.error?.message).toContain(
          'Promise function at index 1 is not a function'
        );
        expect(logSessionError).toHaveBeenCalledWith(
          'promiseUtils',
          PROMISE_ERRORS.NOT_A_FUNCTION.code
        );
      });
    });

    describe('Concurrency Limiting', () => {
      it('should handle concurrency limiting', async () => {
        vi.useFakeTimers();

        try {
          let activePromises = 0;
          let maxActivePromises = 0;

          const promises = Array.from(
            { length: 10 },
            (_, i) => () =>
              new Promise(resolve => {
                activePromises++;
                maxActivePromises = Math.max(maxActivePromises, activePromises);

                setTimeout(() => {
                  activePromises--;
                  resolve(`result${i}`);
                }, 100);
              })
          );

          const options: PromiseExecutionOptions = { concurrency: 3 };
          const resultPromise = executeWithErrorIsolation(promises, options);

          vi.advanceTimersByTime(1000);
          await vi.runAllTimersAsync();

          const results = await resultPromise;

          expect(results.length).toEqual(10);
          expect(maxActivePromises <= 3).toEqual(true);
          results.forEach((result, index) => {
            expect(result.success).toEqual(true);
            expect(result.data).toEqual(`result${index}`);
            expect(result.index).toEqual(index);
          });
        } finally {
          vi.useRealTimers();
        }
      });

      it('should handle concurrency with mixed success/failure', async () => {
        vi.useFakeTimers();

        try {
          const promises = Array.from(
            { length: 5 },
            (_, i) => () =>
              new Promise((resolve, reject) => {
                setTimeout(() => {
                  if (i % 2 === 0) {
                    resolve(`success${i}`);
                  } else {
                    reject(new Error(`error${i}`));
                  }
                }, 100);
              })
          );

          const options: PromiseExecutionOptions = { concurrency: 2 };
          const resultPromise = executeWithErrorIsolation(promises, options);

          vi.advanceTimersByTime(500);
          await vi.runAllTimersAsync();

          const results = await resultPromise;

          expect(results).toHaveLength(5);
          results.forEach((result, index) => {
            if (index % 2 === 0) {
              expect(result.success).toBe(true);
              expect(result.data).toBe(`success${index}`);
            } else {
              expect(result.success).toBe(false);
              expect(result.error?.message).toBe(`error${index}`);
            }
          });
        } finally {
          vi.useRealTimers();
        }
      });

      it('should handle undefined promise function in executeWithConcurrencyLimit', async () => {
        // This simulates a sparse array or undefined item passed to executeWithConcurrencyLimit
        // Although executeWithErrorIsolation filters/wraps them, we can mock executeWithErrorIsolation's internals
        // or construct a case where validPromises has holes if that was possible,
        // but actually executeWithErrorIsolation maps them to wrappers.
        // However, the executeWithConcurrencyLimit function checks for undefined promiseFn.

        // To test lines 152-162 in executeWithConcurrencyLimit, we need to pass an array with holes
        // or undefined values directly to it, but it's not exported.
        // However, we can trigger the wrapping logic in executeWithErrorIsolation which handles non-functions.
        // But wait, executeWithErrorIsolation replaces non-functions with a rejection wrapper (lines 38-50).
        // So executeWithConcurrencyLimit (called on line 53) receives valid wrappers.

        // If we want to hit the check inside executeWithConcurrencyLimit (lines 152-162),
        // we would need validPromises to contain undefined.
        // But the map on line 38 ensures it returns a function.
        // So that code might be unreachable via executeWithErrorIsolation public API unless the array is sparse?

        // Let's try a sparse array.
        const promises = new Array(3);
        promises[0] = () => Promise.resolve(1);
        // index 1 is empty
        promises[2] = () => Promise.resolve(3);

        // When map is called on a sparse array, it skips empty slots!
        // validPromises will also be sparse.

        const results = await executeWithErrorIsolation(promises, {
          concurrency: 2,
        });

        expect(results).toHaveLength(3);
        expect(results[0]?.success).toBe(true);

        // Index 1 should be handled by the "undefined" check in executeWithConcurrencyLimit
        // OR if it's sparse, map might preserve sparsity.
        // Let's see.

        // If executeWithConcurrencyLimit iterates with index < promiseFns.length, it accesses index 1.
        // If validPromises is sparse, validPromises[1] is undefined.
        // So the check inside executeWithConcurrencyLimit (if (!promiseFn)) should trigger.

        expect(results[1]?.success).toBe(false);
        expect(results[1]?.error?.message).toContain(
          PROMISE_ERRORS.FUNCTION_UNDEFINED.message
        );

        expect(results[2]?.success).toBe(true);
      });

      it('should handle timeout with concurrency limit', async () => {
        vi.useFakeTimers();

        try {
          const promises = Array.from(
            { length: 5 },
            (_, i) => () =>
              new Promise(resolve => {
                setTimeout(() => resolve(`result${i}`), i * 500);
              })
          );

          const options: PromiseExecutionOptions = {
            concurrency: 2,
            timeout: 1000,
          };
          const resultPromise = executeWithErrorIsolation(promises, options);

          vi.advanceTimersByTime(1500);
          await vi.runAllTimersAsync();

          const results = await resultPromise;

          expect(results).toHaveLength(5);
          // First few should succeed, later ones should timeout
          expect(results[0]?.success).toBe(true);
          expect(results[4]?.success).toBe(false);
        } finally {
          vi.useRealTimers();
        }
      });
    });

    it('should handle default options', async () => {
      const promises = [() => Promise.resolve('test')];

      const results = await executeWithErrorIsolation(promises);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        success: true,
        data: 'test',
        index: 0,
      });
    });

    it('should handle non-Error rejection reasons from allSettled', async () => {
      const promises = [
        () => Promise.reject('string error'),
        () => Promise.reject(123),
        () => Promise.reject(null),
      ];

      const results = await executeWithErrorIsolation(promises);

      expect(results).toHaveLength(3);
      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error?.message).toBe('string error');
      expect(results[1]?.success).toBe(false);
      expect(results[1]?.error?.message).toBe('123');
      expect(results[2]?.success).toBe(false);
      expect(results[2]?.error?.message).toBe('null');
    });

    it('should handle Promise.allSettled rejected status with non-Error reason', async () => {
      // Test to ensure the mapping of rejected results is correct
      // This tests line 71 where allSettled returns rejected status
      const promises = [
        () => Promise.resolve('success'),
        () => {
          // Use a plain throw to ensure we hit the else branch
          throw 42; // Non-Error thrown value
        },
      ];

      const results = await executeWithErrorIsolation(promises);

      expect(results).toHaveLength(2);
      expect(results[0]?.success).toBe(true);
      expect(results[1]?.success).toBe(false);
      expect(results[1]?.error).toBeInstanceOf(Error);
    });

    it('should handle createIsolatedPromise catch block with non-Error', async () => {
      // Test the catch block in createIsolatedPromise
      const promises = [
        () => {
          // Throw a non-Error to test the error conversion
          throw { custom: 'error object' };
        },
      ];

      const results = await executeWithErrorIsolation(promises);

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toBeInstanceOf(Error);
    });

    it('should handle errors in concurrency limit path', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        i % 2 === 0
          ? () => Promise.resolve(`success-${i}`)
          : () => Promise.reject(new Error(`error-${i}`))
      );

      const options: PromiseExecutionOptions = {
        concurrency: 2,
        timeout: 5000,
      };

      const results = await executeWithErrorIsolation(promises, options);

      expect(results).toHaveLength(10);
      expect(results[0]?.success).toBe(true);
      expect(results[1]?.success).toBe(false);
      expect(results[1]?.error?.message).toBe('error-1');
    });

    it('should handle undefined/null promise functions with concurrency', async () => {
      const promises: Array<(() => Promise<string>) | undefined> = [
        () => Promise.resolve('success-0'),
        undefined,
        () => Promise.resolve('success-2'),
        null as unknown as undefined,
        () => Promise.resolve('success-4'),
      ];

      const options: PromiseExecutionOptions = {
        concurrency: 2,
        timeout: 5000,
      };

      const results = await executeWithErrorIsolation(
        promises as Array<() => Promise<string>>,
        options
      );

      expect(results).toHaveLength(5);
      expect(results[0]?.success).toBe(true);
      expect(results[1]?.success).toBe(false);
      expect(results[1]?.error?.message).toContain('not a function');
      expect(results[2]?.success).toBe(true);
      expect(results[3]?.success).toBe(false);
      expect(results[4]?.success).toBe(true);
    });

    it('should handle onError callback being called', async () => {
      const errorCallback = vi.fn();
      const promises = [
        () => Promise.resolve('success'),
        () => Promise.reject(new Error('test error')),
        () => Promise.resolve('success2'),
      ];

      const options: PromiseExecutionOptions = {
        timeout: 5000,
        onError: errorCallback,
      };

      const results = await executeWithErrorIsolation(promises, options);

      expect(results).toHaveLength(3);
      expect(results[1]?.success).toBe(false);
      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalledWith(expect.any(Error), 1);
    });
  });
});

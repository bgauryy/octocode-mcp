import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  executeWithErrorIsolation,
  processBatch,
  safePromiseAll,
  retryWithBackoff,
  PromiseExecutionOptions,
} from '../../src/utils/promiseUtils';

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

          // Advance time to complete all promises
          vi.advanceTimersByTime(1000);
          await vi.runAllTimersAsync();

          const results = await resultPromise;

          expect(results).toHaveLength(10);
          expect(maxActivePromises).toBeLessThanOrEqual(3);
          results.forEach((result, index) => {
            expect(result.success).toBe(true);
            expect(result.data).toBe(`result${index}`);
            expect(result.index).toBe(index);
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
  });

  describe('processBatch', () => {
    it('should process all items successfully', async () => {
      const items = ['item1', 'item2', 'item3'];
      const processor = vi
        .fn()
        .mockImplementation(
          async (item: string, index: number) => `processed-${item}-${index}`
        );

      const result = await processBatch(items, processor);

      expect(result.successCount).toBe(3);
      expect(result.errorCount).toBe(0);
      expect(result.errors).toEqual([]);
      expect(result.results).toHaveLength(3);

      result.results.forEach((r, index) => {
        expect(r.success).toBe(true);
        expect(r.data).toBe(`processed-item${index + 1}-${index}`);
        expect(r.index).toBe(index);
      });

      expect(processor).toHaveBeenCalledTimes(3);
      expect(processor).toHaveBeenCalledWith('item1', 0);
      expect(processor).toHaveBeenCalledWith('item2', 1);
      expect(processor).toHaveBeenCalledWith('item3', 2);
    });

    it('should handle mixed success/failure scenarios', async () => {
      const items = ['success1', 'error1', 'success2', 'error2'];
      const processor = async (item: string, _index: number) => {
        if (item.startsWith('error')) {
          throw new Error(`Processing failed for ${item}`);
        }
        return `processed-${item}`;
      };

      const result = await processBatch(items, processor);

      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(2);
      expect(result.errors).toHaveLength(2);

      expect(result.errors[0]).toEqual({
        index: 1,
        error: expect.any(Error),
        item: 'error1',
      });
      expect(result.errors[0]?.error.message).toBe(
        'Processing failed for error1'
      );

      expect(result.errors[1]).toEqual({
        index: 3,
        error: expect.any(Error),
        item: 'error2',
      });
      expect(result.errors[1]?.error.message).toBe(
        'Processing failed for error2'
      );

      // Check successful results
      const successfulResults = result.results.filter(r => r.success);
      expect(successfulResults).toHaveLength(2);
      expect(successfulResults[0]?.data).toBe('processed-success1');
      expect(successfulResults[1]?.data).toBe('processed-success2');
    });

    it('should handle empty items array', async () => {
      const processor = vi.fn();
      const result = await processBatch([], processor);

      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(0);
      expect(result.errors).toEqual([]);
      expect(result.results).toEqual([]);
      expect(processor).not.toHaveBeenCalled();
    });

    it('should pass through options to executeWithErrorIsolation', async () => {
      const items = ['item1', 'item2'];
      const processor = async (item: string) => `processed-${item}`;
      const onError = vi.fn();

      const options: PromiseExecutionOptions = {
        timeout: 5000,
        concurrency: 1,
        onError,
      };

      await processBatch(items, processor, options);

      // Should not call onError since no errors
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('safePromiseAll', () => {
    it('should handle all successful promises', async () => {
      const promises = [
        Promise.resolve('result1'),
        Promise.resolve('result2'),
        Promise.resolve('result3'),
      ];

      const result = await safePromiseAll(promises);

      expect(result.successCount).toBe(3);
      expect(result.errors).toEqual([]);
      expect(result.results).toEqual(['result1', 'result2', 'result3']);
    });

    it('should handle mixed success/failure', async () => {
      const promises = [
        Promise.resolve('success1'),
        Promise.reject(new Error('error1')),
        Promise.resolve('success2'),
        Promise.reject(new Error('error2')),
      ];

      const result = await safePromiseAll(promises);

      expect(result.successCount).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(result.results).toEqual(['success1', null, 'success2', null]);

      expect(result.errors[0]).toEqual({
        index: 1,
        error: expect.any(Error),
      });
      expect(result.errors[0]?.error.message).toBe('error1');

      expect(result.errors[1]).toEqual({
        index: 3,
        error: expect.any(Error),
      });
      expect(result.errors[1]?.error.message).toBe('error2');
    });

    it('should handle empty promise array', async () => {
      const result = await safePromiseAll([]);

      expect(result.successCount).toBe(0);
      expect(result.errors).toEqual([]);
      expect(result.results).toEqual([]);
    });

    it('should handle timeout option', async () => {
      vi.useFakeTimers();

      try {
        const promises = [
          Promise.resolve('fast'),
          new Promise(resolve => setTimeout(() => resolve('slow'), 2000)),
        ];

        const resultPromise = safePromiseAll(promises, { timeout: 1000 });

        vi.advanceTimersByTime(1100);
        await vi.runAllTimersAsync();

        const result = await resultPromise;

        expect(result.successCount).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.results).toEqual(['fast', null]);
        expect(result.errors[0]?.error.message).toContain('timed out');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle continueOnError option', async () => {
      const promises = [
        Promise.resolve('success'),
        Promise.reject(new Error('test error')),
      ];

      const result = await safePromiseAll(promises, { continueOnError: true });

      expect(result.successCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.results).toEqual(['success', null]);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      vi.useFakeTimers();

      try {
        const operation = vi
          .fn()
          .mockRejectedValueOnce(new Error('attempt 1'))
          .mockRejectedValueOnce(new Error('attempt 2'))
          .mockResolvedValue('success on attempt 3');

        const resultPromise = retryWithBackoff(operation);

        // Fast forward through retry delays
        vi.advanceTimersByTime(5000);
        await vi.runAllTimersAsync();

        const result = await resultPromise;

        expect(result).toBe('success on attempt 3');
        expect(operation).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it.skip('should respect maxRetries limit', async () => {
      vi.useFakeTimers();

      try {
        // Use mockImplementation to avoid creating rejected promises during setup
        const operation = vi
          .fn()
          .mockImplementation(() => Promise.reject(new Error('always fails')));

        const resultPromise = retryWithBackoff(operation, { maxRetries: 2 });

        // Wait for the promise to complete
        vi.advanceTimersByTime(10000);
        await vi.runAllTimersAsync();

        // Properly catch the rejection to prevent unhandled promise rejection
        let error: Error | undefined;
        try {
          await resultPromise;
        } catch (e) {
          error = e as Error;
        }

        expect(error).toBeDefined();
        expect(error?.message).toBe('always fails');
        expect(operation).toHaveBeenCalledTimes(3); // Initial attempt + 2 retries
      } finally {
        vi.useRealTimers();
      }
    });

    it('should use custom backoff configuration', async () => {
      vi.useFakeTimers();

      try {
        const operation = vi
          .fn()
          .mockRejectedValueOnce(new Error('attempt 1'))
          .mockResolvedValue('success');

        const options = {
          initialDelay: 500,
          maxDelay: 2000,
          backoffMultiplier: 3,
        };

        const resultPromise = retryWithBackoff(operation, options);

        // Advance by initial delay
        vi.advanceTimersByTime(500);
        await vi.runAllTimersAsync();

        const result = await resultPromise;

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should respect maxDelay limit', async () => {
      vi.useFakeTimers();

      try {
        const operation = vi
          .fn()
          .mockRejectedValueOnce(new Error('attempt 1'))
          .mockRejectedValueOnce(new Error('attempt 2'))
          .mockResolvedValue('success');

        const options = {
          initialDelay: 1000,
          maxDelay: 1500,
          backoffMultiplier: 3,
          maxRetries: 3,
        };

        const resultPromise = retryWithBackoff(operation, options);

        // First delay: 1000ms
        vi.advanceTimersByTime(1000);
        await vi.runAllTimersAsync();

        // Second delay should be min(1000 * 3, 1500) = 1500ms
        vi.advanceTimersByTime(1500);
        await vi.runAllTimersAsync();

        const result = await resultPromise;

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it.skip('should use shouldRetry function', async () => {
      vi.useFakeTimers();

      try {
        let callCount = 0;
        const operation = vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('retryable error'));
          } else if (callCount === 2) {
            return Promise.reject(new Error('non-retryable error'));
          }
          return Promise.resolve('success');
        });

        const shouldRetry = vi
          .fn()
          .mockImplementation((error: Error, _attempt: number) => {
            return !error.message.includes('non-retryable');
          });

        const resultPromise = retryWithBackoff(operation, {
          shouldRetry,
          maxRetries: 5,
        });

        vi.advanceTimersByTime(5000);
        await vi.runAllTimersAsync();

        // Properly catch the rejection to prevent unhandled promise rejection
        let error: Error | undefined;
        try {
          await resultPromise;
        } catch (e) {
          error = e as Error;
        }

        expect(error).toBeDefined();
        expect(error?.message).toBe('non-retryable error');
        expect(operation).toHaveBeenCalledTimes(2);
        expect(shouldRetry).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle non-Error rejection values', async () => {
      vi.useFakeTimers();

      try {
        const operation = vi
          .fn()
          .mockRejectedValueOnce('string error')
          .mockResolvedValue('success');

        const resultPromise = retryWithBackoff(operation);

        vi.advanceTimersByTime(2000);
        await vi.runAllTimersAsync();

        const result = await resultPromise;

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle shouldRetry with non-Error values', async () => {
      vi.useFakeTimers();

      try {
        const operation = vi.fn().mockRejectedValue('string error');
        const shouldRetry = vi.fn().mockReturnValue(false);

        const resultPromise = retryWithBackoff(operation, {
          shouldRetry,
          maxRetries: 3,
        });

        await expect(resultPromise).rejects.toThrow('string error');
        expect(operation).toHaveBeenCalledTimes(1);
        expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error), 0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should calculate exponential backoff correctly', async () => {
      const delays: number[] = [];

      // Mock setTimeout to capture delay values
      const setTimeoutSpy = vi
        .spyOn(global, 'setTimeout')
        .mockImplementation(
          (
            callback: () => void,
            delay: number | undefined
          ): ReturnType<typeof setTimeout> => {
            delays.push(delay ?? 0);
            // Use setImmediate to execute callback without blocking
            setImmediate(callback);
            return {} as ReturnType<typeof setTimeout>;
          }
        );

      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('first'))
        .mockRejectedValueOnce(new Error('second'))
        .mockRejectedValueOnce(new Error('third'))
        .mockRejectedValueOnce(new Error('final'));

      const options = {
        initialDelay: 100,
        backoffMultiplier: 2,
        maxRetries: 3,
      };

      try {
        await retryWithBackoff(operation, options);
      } catch (error) {
        // Expected to fail after all retries
        expect((error as Error).message).toBe('final');
      }

      expect(operation).toHaveBeenCalledTimes(4); // Initial + 3 retries
      expect(delays).toEqual([100, 200, 400]); // Exponential backoff: 100, 200, 400

      setTimeoutSpy.mockRestore();
    });

    it('should handle zero maxRetries', async () => {
      const operation = vi
        .fn()
        .mockRejectedValue(new Error('immediate failure'));

      await expect(
        retryWithBackoff(operation, { maxRetries: 0 })
      ).rejects.toThrow('immediate failure');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle default options', async () => {
      const operation = vi.fn().mockResolvedValue('default success');

      const result = await retryWithBackoff(operation);

      expect(result).toBe('default success');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Integration Tests', () => {
    it('should work together in complex scenarios', async () => {
      vi.useFakeTimers();

      try {
        // Simulate processing a batch where some operations need retries
        const items = ['item1', 'item2', 'item3'];

        const processor = async (item: string, index: number) => {
          return await retryWithBackoff(
            async () => {
              if (item === 'item2' && index === 1) {
                // Simulate intermittent failure
                const rand = Math.random();
                if (rand > 0.7) {
                  throw new Error('Random failure');
                }
              }
              return `processed-${item}`;
            },
            { maxRetries: 2, initialDelay: 100 }
          );
        };

        const resultPromise = processBatch(items, processor, { timeout: 5000 });

        // Fast forward through retries
        vi.advanceTimersByTime(1000);
        await vi.runAllTimersAsync();

        const result = await resultPromise;

        expect(result.successCount + result.errorCount).toBe(3);
        expect(result.results).toHaveLength(3);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

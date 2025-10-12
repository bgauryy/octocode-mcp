import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeWithErrorIsolation } from '../../src/utils/promiseUtils';
import type { PromiseExecutionOptions } from '../../src/types';

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
});

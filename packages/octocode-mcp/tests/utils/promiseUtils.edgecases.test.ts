import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeWithErrorIsolation } from '../../src/utils/promiseUtils.js';

describe('promiseUtils - Edge Cases and Complete Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Concurrency Limiting - Undefined Promise Functions', () => {
    it('should handle undefined promise function in middle of array with concurrency', async () => {
      const promises = [
        () => Promise.resolve('first'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        undefined as any, // Intentionally undefined
        () => Promise.resolve('third'),
        () => Promise.resolve('fourth'),
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
        timeout: 1000,
      });

      expect(results).toHaveLength(4);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.data).toBe('first');

      expect(results[1]!.success).toBe(false);
      expect(results[1]!.error?.message).toContain('not a function');

      expect(results[2]!.success).toBe(true);
      expect(results[2]!.data).toBe('third');

      expect(results[3]!.success).toBe(true);
      expect(results[3]!.data).toBe('fourth');
    });

    it('should handle null promise function with concurrency', async () => {
      const promises = [
        () => Promise.resolve('first'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        null as any,
        () => Promise.resolve('third'),
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
        timeout: 1000,
      });

      expect(results[1]!.success).toBe(false);
      expect(results[1]!.error?.message).toContain('not a function');
      expect(results[1]!.index).toBe(1);
    });

    it('should handle multiple undefined functions with concurrency', async () => {
      const promises = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        undefined as any,
        () => Promise.resolve('second'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        undefined as any,
        () => Promise.resolve('fourth'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        undefined as any,
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
        timeout: 1000,
      });

      expect(results).toHaveLength(5);
      expect(results[0]!.success).toBe(false);
      expect(results[1]!.success).toBe(true);
      expect(results[2]!.success).toBe(false);
      expect(results[3]!.success).toBe(true);
      expect(results[4]!.success).toBe(false);
    });

    it('should handle all undefined functions with concurrency', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const promises = [undefined as any, undefined as any, undefined as any];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
        timeout: 1000,
      });

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('not a function');
        expect(result.index).toBe(index);
      });
    });

    it('should handle undefined at start with concurrency', async () => {
      const promises = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        undefined as any,
        () => Promise.resolve('second'),
        () => Promise.resolve('third'),
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 1,
        timeout: 1000,
      });

      expect(results[0]!.success).toBe(false);
      expect(results[1]!.success).toBe(true);
      expect(results[2]!.success).toBe(true);
    });

    it('should handle undefined at end with concurrency', async () => {
      const promises = [
        () => Promise.resolve('first'),
        () => Promise.resolve('second'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        undefined as any,
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
        timeout: 1000,
      });

      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(true);
      expect(results[2]!.success).toBe(false);
    });
  });

  describe('Concurrency Limiting - Error Handling in executeNext', () => {
    it('should handle errors thrown in promise execution with concurrency', async () => {
      const promises = [
        () => Promise.resolve('first'),
        () => {
          throw new Error('Sync error in promise function');
        },
        () => Promise.resolve('third'),
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
        timeout: 1000,
      });

      expect(results).toHaveLength(3);
      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(false);
      expect(results[1]!.error?.message).toContain('Sync error');
      expect(results[2]!.success).toBe(true);
    });

    it('should handle non-Error objects thrown in promise function with concurrency', async () => {
      const promises = [
        () => Promise.resolve('first'),
        () => {
          // eslint-disable-next-line no-throw-literal
          throw 'String error';
        },
        () => Promise.resolve('third'),
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
        timeout: 1000,
      });

      expect(results[1]!.success).toBe(false);
      expect(results[1]!.error).toBeInstanceOf(Error);
      expect(results[1]!.error?.message).toContain('String error');
    });

    it('should handle rejected promises with concurrency', async () => {
      const promises = [
        () => Promise.resolve('first'),
        () => Promise.reject(new Error('Rejection error')),
        () => Promise.resolve('third'),
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
        timeout: 1000,
      });

      expect(results[1]!.success).toBe(false);
      expect(results[1]!.error?.message).toBe('Rejection error');
    });

    it('should handle mix of undefined and errors with concurrency', async () => {
      const promises = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        undefined as any,
        () => Promise.reject(new Error('Rejection')),
        () => Promise.resolve('success'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        null as any,
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
        timeout: 1000,
      });

      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error?.message).toContain('not a function');
      expect(results[1]!.success).toBe(false);
      expect(results[1]!.error?.message).toBe('Rejection');
      expect(results[2]!.success).toBe(true);
      expect(results[3]!.success).toBe(false);
      expect(results[3]!.error?.message).toContain('not a function');
    });
  });

  describe('Concurrency Limiting - Complex Scenarios', () => {
    it('should handle concurrency with very large number of promises', async () => {
      const count = 100;
      const promises = Array.from(
        { length: count },
        (_, i) => () => Promise.resolve(i)
      );

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 10,
        timeout: 5000,
      });

      expect(results).toHaveLength(count);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.data).toBe(index);
        expect(result.index).toBe(index);
      });
    });

    it('should handle concurrency=1 with errors in sequence', async () => {
      const executionOrder: number[] = [];

      const promises = [
        () => {
          executionOrder.push(0);
          return Promise.resolve('first');
        },
        () => {
          executionOrder.push(1);
          return Promise.reject(new Error('Second failed'));
        },
        () => {
          executionOrder.push(2);
          return Promise.resolve('third');
        },
        () => {
          executionOrder.push(3);
          throw new Error('Fourth threw');
        },
        () => {
          executionOrder.push(4);
          return Promise.resolve('fifth');
        },
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 1,
        timeout: 1000,
      });

      expect(executionOrder).toEqual([0, 1, 2, 3, 4]);
      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(false);
      expect(results[2]!.success).toBe(true);
      expect(results[3]!.success).toBe(false);
      expect(results[4]!.success).toBe(true);
    });

    it('should handle workers completing at different rates', async () => {
      const delays = [50, 10, 100, 20, 80, 30];

      const promises = delays.map(
        (delay, idx) => () =>
          new Promise(resolve => {
            setTimeout(() => resolve(`result-${idx}`), delay);
          })
      );

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 3,
        timeout: 5000,
      });

      expect(results).toHaveLength(6);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.data).toBe(`result-${index}`);
      });
    });

    it('should handle partial failures with concurrency', async () => {
      const promises = [
        () => Promise.resolve('ok1'),
        () => Promise.reject(new Error('fail1')),
        () => Promise.resolve('ok2'),
        () => Promise.reject(new Error('fail2')),
        () => Promise.resolve('ok3'),
        () => Promise.reject(new Error('fail3')),
      ];

      const errorCollector: Error[] = [];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
        timeout: 1000,
        onError: (error: Error) => {
          errorCollector.push(error);
        },
      });

      expect(results.filter(r => r.success)).toHaveLength(3);
      expect(results.filter(r => !r.success)).toHaveLength(3);
      expect(errorCollector).toHaveLength(3);
    });

    it('should handle timeout with concurrency limiting', async () => {
      const promises = [
        () => Promise.resolve('fast'),
        () => new Promise(resolve => setTimeout(() => resolve('slow'), 2000)),
        () => Promise.resolve('fast2'),
        () => new Promise(resolve => setTimeout(() => resolve('slow2'), 2000)),
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
        timeout: 500,
      });

      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(false);
      expect(results[1]!.error?.message).toContain('timed out');
      expect(results[2]!.success).toBe(true);
      expect(results[3]!.success).toBe(false);
      expect(results[3]!.error?.message).toContain('timed out');
    });

    it('should maintain correct indices with mixed undefined and errors', async () => {
      const promises = [
        () => Promise.resolve('idx0'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        undefined as any,
        () => Promise.reject(new Error('idx2-error')),
        () => Promise.resolve('idx3'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        null as any,
        () => Promise.resolve('idx5'),
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 3,
        timeout: 1000,
      });

      expect(results[0]!.index).toBe(0);
      expect(results[1]!.index).toBe(1);
      expect(results[2]!.index).toBe(2);
      expect(results[3]!.index).toBe(3);
      expect(results[4]!.index).toBe(4);
      expect(results[5]!.index).toBe(5);
    });
  });

  describe('Concurrency Limiting - Worker Pool Behavior', () => {
    it('should not exceed concurrency limit', async () => {
      let activeCount = 0;
      let maxActiveCount = 0;

      const promises = Array.from({ length: 10 }, () => () => {
        activeCount++;
        maxActiveCount = Math.max(maxActiveCount, activeCount);

        return new Promise(resolve => {
          setTimeout(() => {
            activeCount--;
            resolve('done');
          }, 10);
        });
      });

      await executeWithErrorIsolation(promises, {
        concurrency: 3,
        timeout: 5000,
      });

      expect(maxActiveCount).toBeLessThanOrEqual(3);
    });

    it('should process all promises even with errors in workers', async () => {
      const processedIndices: number[] = [];

      const promises = Array.from({ length: 8 }, (_, index) => () => {
        processedIndices.push(index);
        if (index % 3 === 0) {
          return Promise.reject(new Error(`Error at ${index}`));
        }
        return Promise.resolve(`Success at ${index}`);
      });

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
        timeout: 1000,
      });

      expect(processedIndices.sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(results).toHaveLength(8);
    });

    it('should handle worker starting with undefined promise', async () => {
      const promises = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        undefined as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        undefined as any,
        () => Promise.resolve('third'),
        () => Promise.resolve('fourth'),
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 2,
        timeout: 1000,
      });

      expect(results[0]!.success).toBe(false);
      expect(results[1]!.success).toBe(false);
      expect(results[2]!.success).toBe(true);
      expect(results[3]!.success).toBe(true);
    });

    it('should handle single worker with many promises', async () => {
      const count = 20;
      const promises = Array.from(
        { length: count },
        (_, i) => () => Promise.resolve(i)
      );

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 1,
        timeout: 5000,
      });

      expect(results).toHaveLength(count);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.index).toBe(index);
      });
    });
  });

  describe('Edge Case: onError callback with concurrency', () => {
    it('should call onError for each failure with concurrency', async () => {
      const errors: Array<{ error: Error; index: number }> = [];

      const promises = [
        () => Promise.resolve('ok'),
        () => Promise.reject(new Error('Error 1')),
        () => Promise.reject(new Error('Error 2')),
        () => Promise.resolve('ok2'),
        () => Promise.reject(new Error('Error 3')),
      ];

      await executeWithErrorIsolation(promises, {
        concurrency: 2,
        timeout: 1000,
        onError: (error: Error, index: number) => {
          errors.push({ error, index });
        },
      });

      expect(errors).toHaveLength(3);
      expect(errors[0]!.index).toBe(1);
      expect(errors[0]!.error.message).toBe('Error 1');
      expect(errors[1]!.index).toBe(2);
      expect(errors[1]!.error.message).toBe('Error 2');
      expect(errors[2]!.index).toBe(4);
      expect(errors[2]!.error.message).toBe('Error 3');
    });

    it('should call onError for undefined promises with concurrency', async () => {
      const errors: number[] = [];

      const promises = [
        () => Promise.resolve('ok'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        undefined as any,
        () => Promise.resolve('ok2'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        null as any,
      ];

      await executeWithErrorIsolation(promises, {
        concurrency: 2,
        timeout: 1000,
        onError: (_error: Error, index: number) => {
          errors.push(index);
        },
      });

      expect(errors).toContain(1);
      expect(errors).toContain(3);
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle concurrency exactly equal to promise count', async () => {
      const promises = [
        () => Promise.resolve(1),
        () => Promise.resolve(2),
        () => Promise.resolve(3),
      ];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 3,
        timeout: 1000,
      });

      expect(results).toHaveLength(3);
      results.forEach(result => expect(result.success).toBe(true));
    });

    it('should handle concurrency much larger than promise count', async () => {
      const promises = [() => Promise.resolve(1), () => Promise.resolve(2)];

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 100,
        timeout: 1000,
      });

      expect(results).toHaveLength(2);
      results.forEach(result => expect(result.success).toBe(true));
    });

    it('should handle very small concurrency with many promises', async () => {
      const promises = Array.from(
        { length: 50 },
        (_, i) => () => Promise.resolve(i)
      );

      const results = await executeWithErrorIsolation(promises, {
        concurrency: 1,
        timeout: 10000,
      });

      expect(results).toHaveLength(50);
      results.forEach(result => expect(result.success).toBe(true));
    });
  });
});

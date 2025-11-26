import { describe, it, expect } from 'vitest';
import { parallelLimit, settleAll } from '../../src/utils/promiseUtils.js';

describe('promiseUtils', () => {
  it('parallelLimit preserves order and respects limit', async () => {
    const items = [1, 2, 3, 4, 5];
    const calls: number[] = [];
    const start = Date.now();
    const results = await parallelLimit(items, 2, async (n) => {
      calls.push(n);
      await new Promise((r) => setTimeout(r, 10));
      return n * 2;
    });
    const duration = Date.now() - start;
    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(calls.length).toBe(5);
    expect(duration).toBeGreaterThanOrEqual(30); // executed in batches
  });

  it('settleAll returns both fulfilled and rejected results', async () => {
    const promises = [
      Promise.resolve(1),
      Promise.reject(new Error('nope')),
      Promise.resolve(3),
    ];
    const results = await settleAll(promises);
    const statuses = results.map((r) => r.status);
    expect(statuses.sort()).toEqual(
      ['fulfilled', 'fulfilled', 'rejected'].sort()
    );
  });
});

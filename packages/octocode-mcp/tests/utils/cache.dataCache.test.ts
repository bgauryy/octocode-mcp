import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateCacheKey,
  withDataCache,
  clearAllCache,
  getCacheStats,
} from '../../src/utils/cache';

describe('withDataCache typed data cache', () => {
  beforeEach(() => {
    clearAllCache();
  });

  it('caches successful values and returns cached on next call', async () => {
    let calls = 0;
    const op = async () => {
      calls += 1;
      return { value: `run-${calls}` } as const;
    };

    const key = generateCacheKey('gh-api-code', { test: 'data' });
    const r1 = await withDataCache(key, op);
    const r2 = await withDataCache(key, op);

    expect(calls).toBe(1);
    expect(r1).toEqual(r2);

    const stats = getCacheStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.sets).toBe(1);
  });

  it('respects skipCache and forceRefresh options', async () => {
    let calls = 0;
    const op = async () => {
      calls += 1;
      return { ok: true, run: calls } as const;
    };
    const key = generateCacheKey('gh-api-code', { mode: 'options' });

    // skipCache: always executes operation
    await withDataCache(key, op, { skipCache: true });
    await withDataCache(key, op, { skipCache: true });
    expect(calls).toBe(2);

    // Normal call caches
    await withDataCache(key, op);
    expect(calls).toBe(3);

    // Cached hit does not execute
    await withDataCache(key, op);
    expect(calls).toBe(3);

    // forceRefresh executes and overwrites cache
    await withDataCache(key, op, { forceRefresh: true });
    expect(calls).toBe(4);
  });

  it('uses shouldCache to decide whether to cache a value', async () => {
    let calls = 0;
    const op = async () => {
      calls += 1;
      // Alternate successful-like and error-like values
      return calls % 2 === 0
        ? { data: calls }
        : { error: 'e', data: null };
    };

    const key = generateCacheKey('gh-api-code', { mode: 'should' });

    // First returns error-like; should not be cached
    const a = await withDataCache(key, op, {
      shouldCache: v => !(v as { error?: unknown }).error,
    });
    expect((a as { error?: unknown }).error).toBeDefined();

    // Next returns data; should be cached
    const b = await withDataCache(key, op, {
      shouldCache: v => !(v as { error?: unknown }).error,
    });
    expect((b as { error?: unknown }).error).toBeUndefined();

    // Next call should hit cache and not increment calls
    const before = calls; // 2 so far
    const c = await withDataCache(key, op, {
      shouldCache: v => !(v as { error?: unknown }).error,
    });
    expect(c).toEqual(b);
    expect(calls).toBe(before); // no extra execution
  });
});



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
      return calls % 2 === 0 ? { data: calls } : { error: 'e', data: null };
    };

    const key = generateCacheKey('gh-api-code', { mode: 'should' });

    const a = await withDataCache(key, op, {
      shouldCache: v => !(v as { error?: unknown }).error,
    });
    expect(typeof (a as { error?: unknown }).error).toEqual('string');

    const b = await withDataCache(key, op, {
      shouldCache: v => !(v as { error?: unknown }).error,
    });
    expect((b as { error?: unknown }).error).toEqual(undefined);

    const before = calls;
    const c = await withDataCache(key, op, {
      shouldCache: v => !(v as { error?: unknown }).error,
    });
    expect(c).toEqual(b);
    expect(calls).toEqual(before);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withDataCache, clearAllCache } from '../../src/utils/cache.js';

describe('Cache Deduplication', () => {
  beforeEach(() => {
    clearAllCache();
    vi.clearAllMocks();
  });

  it('should deduplicate concurrent requests for the same key', async () => {
    const key = 'test-key';
    let callCount = 0;

    // Simulates a slow operation
    const operation = vi.fn(async () => {
      callCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
      return 'result';
    });

    // Launch 3 concurrent requests
    const promise1 = withDataCache(key, operation);
    const promise2 = withDataCache(key, operation);
    const promise3 = withDataCache(key, operation);

    const [result1, result2, result3] = await Promise.all([
      promise1,
      promise2,
      promise3,
    ]);

    expect(result1).toBe('result');
    expect(result2).toBe('result');
    expect(result3).toBe('result');

    // CRITICAL: Operation should only be called once
    expect(callCount).toBe(1);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should handle failures correctly and cleanup pending status', async () => {
    const key = 'error-key';
    const error = new Error('Fetch failed');

    const operation = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      throw error;
    });

    // Launch concurrent requests
    const promise1 = withDataCache(key, operation);
    const promise2 = withDataCache(key, operation);

    await expect(promise1).rejects.toThrow('Fetch failed');
    await expect(promise2).rejects.toThrow('Fetch failed');

    expect(operation).toHaveBeenCalledTimes(1);

    // Subsequent request should retry
    const operation2 = vi.fn(async () => 'success');
    const result = await withDataCache(key, operation2);
    expect(result).toBe('success');
  });

  it('should not deduplicate distinct keys', async () => {
    const operation = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return 'result';
    });

    await Promise.all([
      withDataCache('key1', operation),
      withDataCache('key2', operation),
    ]);

    expect(operation).toHaveBeenCalledTimes(2);
  });
});

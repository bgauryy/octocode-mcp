import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _getCacheStats,
  _resetCredentialsCache,
  getCachedCredentials,
  invalidateCredentialsCache,
  setCachedCredentials,
} from '../../src/credentials/credentialCache.js';

describe('credentials/credentialCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T10:00:00.000Z'));
    _resetCredentialsCache();
  });

  afterEach(() => {
    _resetCredentialsCache();
    vi.useRealTimers();
  });

  it('stores a negative cache entry for missing credentials', () => {
    setCachedCredentials('GitHub.com', null);

    expect(getCachedCredentials('github.com')).toBeNull();
    expect(_getCacheStats()).toEqual({
      size: 1,
      entries: [
        {
          hostname: 'github.com',
          age: 0,
          valid: true,
        },
      ],
    });
  });

  it('invalidates a cached missing entry for the hostname', () => {
    setCachedCredentials('github.com', null);

    invalidateCredentialsCache('https://github.com/');

    expect(getCachedCredentials('github.com')).toBeUndefined();
    expect(_getCacheStats().size).toBe(0);
  });
});

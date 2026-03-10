import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@coderabbitai/bitbucket', () => {
  const mockClient = {
    GET: vi.fn(),
    POST: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  };

  return {
    BitbucketCloud: {
      createBitbucketCloudClient: vi.fn(() => mockClient),
    },
    toBase64: vi.fn((str: string) => Buffer.from(str).toString('base64')),
  };
});

vi.mock('node-cache', async () => {
  const { vi } = await import('vitest');
  const mockGetFn = vi.fn();
  const mockSetFn = vi.fn();
  const mockDelFn = vi.fn();
  const mockFlushAllFn = vi.fn();

  class MockNodeCache {
    get = mockGetFn;
    set = mockSetFn;
    del = mockDelFn;
    flushAll = mockFlushAllFn;
  }

  return {
    default: MockNodeCache,
    __mockGet: mockGetFn,
    __mockSet: mockSetFn,
    __mockDel: mockDelFn,
    __mockFlushAll: mockFlushAllFn,
  };
});

import * as bbConfig from '../../src/bitbucketConfig.js';

vi.mock('../../src/bitbucketConfig.js', () => ({
  getBitbucketHost: vi.fn(() => 'https://api.bitbucket.org/2.0'),
  getBitbucketToken: vi.fn(() => 'test-token'),
  getBitbucketUsername: vi.fn(() => null),
}));

import {
  getBitbucketClient,
  clearBitbucketClients,
  clearBitbucketClient,
  getCachedDefaultBranch,
  cacheDefaultBranch,
  clearDefaultBranchCache,
  getAuthHeader,
} from '../../src/bitbucket/client.js';

import * as NodeCacheMock from 'node-cache';
const mockGet = (
  NodeCacheMock as unknown as Record<string, ReturnType<typeof vi.fn>>
).__mockGet!;
const mockFlushAll = (
  NodeCacheMock as unknown as Record<string, ReturnType<typeof vi.fn>>
).__mockFlushAll!;
const mockDel = (
  NodeCacheMock as unknown as Record<string, ReturnType<typeof vi.fn>>
).__mockDel!;

describe('Bitbucket Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    clearBitbucketClients();
    clearDefaultBranchCache();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getBitbucketClient', () => {
    it('should create a Bitbucket client', () => {
      mockGet.mockReturnValue(undefined);
      const client = getBitbucketClient();
      expect(client).toBeDefined();
      expect(client.GET).toBeDefined();
    });

    it('should return cached client on second call', () => {
      const mockCachedClient = { GET: vi.fn(), cached: true };
      mockGet.mockReturnValue(mockCachedClient);

      const client = getBitbucketClient();
      expect(client).toBe(mockCachedClient);
    });

    it('should throw if no token available', () => {
      vi.mocked(bbConfig.getBitbucketToken).mockReturnValue(null);
      mockGet.mockReturnValue(undefined);

      expect(() => getBitbucketClient()).toThrow('Bitbucket token not found');
    });
  });

  describe('getAuthHeader', () => {
    it('should return Bearer token when no username', () => {
      vi.mocked(bbConfig.getBitbucketToken).mockReturnValue('test-token');
      vi.mocked(bbConfig.getBitbucketUsername).mockReturnValue(null);

      const header = getAuthHeader();
      expect(header).toBe('Bearer test-token');
    });

    it('should return Basic auth when username is set', () => {
      vi.mocked(bbConfig.getBitbucketUsername).mockReturnValue('myuser');

      const header = getAuthHeader({ username: 'myuser', token: 'apppass' });
      expect(header).toContain('Basic ');
    });

    it('should throw if no token', () => {
      vi.mocked(bbConfig.getBitbucketToken).mockReturnValue(null);

      expect(() => getAuthHeader()).toThrow('Bitbucket token not found');
    });
  });

  describe('clearBitbucketClients', () => {
    it('should flush all cached clients', () => {
      clearBitbucketClients();
      expect(mockFlushAll).toHaveBeenCalled();
    });
  });

  describe('clearBitbucketClient', () => {
    it('should delete specific cached client', () => {
      clearBitbucketClient();
      expect(mockDel).toHaveBeenCalled();
    });
  });

  describe('Default Branch Cache', () => {
    it('should cache and retrieve default branch', () => {
      cacheDefaultBranch('workspace/repo', 'develop');
      expect(getCachedDefaultBranch('workspace/repo')).toBe('develop');
    });

    it('should return undefined for uncached project', () => {
      expect(getCachedDefaultBranch('unknown/repo')).toBeUndefined();
    });

    it('should clear all cached branches', () => {
      cacheDefaultBranch('ws/repo1', 'main');
      cacheDefaultBranch('ws/repo2', 'develop');
      clearDefaultBranchCache();
      expect(getCachedDefaultBranch('ws/repo1')).toBeUndefined();
      expect(getCachedDefaultBranch('ws/repo2')).toBeUndefined();
    });

    it('should evict oldest entry when cache is full', () => {
      for (let i = 0; i < 201; i++) {
        cacheDefaultBranch(`ws/repo${i}`, `branch${i}`);
      }
      expect(getCachedDefaultBranch('ws/repo0')).toBeUndefined();
      expect(getCachedDefaultBranch('ws/repo200')).toBe('branch200');
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock cache methods that will be referenced by the NodeCache mock
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockFlushAll = vi.fn();

// Mock @gitbeaker/rest before importing the module under test
vi.mock('@gitbeaker/rest', () => {
  const mockGitlabInstance = {
    Projects: {
      show: vi.fn(function () {}),
    },
    Users: {
      showCurrentUser: vi.fn(function () {}),
    },
  };

  const mockGitlabClass = vi.fn(function () {
    return mockGitlabInstance;
  });

  return {
    Gitlab: mockGitlabClass,
  };
});

// Mock node-cache with a class constructor
// Must use inline vi.fn() references that vitest can hoist properly
vi.mock('node-cache', async () => {
  const { vi } = await import('vitest');

  // Get the mock functions from the module scope via hoisting
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

// Import mocked dependencies
import { Gitlab } from '@gitbeaker/rest';
import * as nodeCacheMock from 'node-cache';

// Import module under test after mocks are set up
import {
  getGitlab,
  isGitLabConfigured,
  getConfiguredGitLabHost,
  clearGitLabClients,
  clearGitLabClient,
} from '../../src/gitlab/client.js';

const mockGitlab = vi.mocked(Gitlab);

// Access the mock functions from the mock module
const getMockCacheMethods = () => {
  const mock = nodeCacheMock as unknown as {
    __mockGet: ReturnType<typeof vi.fn>;
    __mockSet: ReturnType<typeof vi.fn>;
    __mockDel: ReturnType<typeof vi.fn>;
    __mockFlushAll: ReturnType<typeof vi.fn>;
  };
  return {
    get: mock.__mockGet,
    set: mock.__mockSet,
    del: mock.__mockDel,
    flushAll: mock.__mockFlushAll,
  };
};

describe('GitLab Client', () => {
  // Store original env values
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset environment variables
    delete process.env.GITLAB_TOKEN;
    delete process.env.GL_TOKEN;
    delete process.env.GITLAB_HOST;

    // Reset mock cache methods
    const mocks = getMockCacheMethods();
    mocks.get.mockReset();
    mocks.set.mockReset();
    mocks.del.mockReset();
    mocks.flushAll.mockReset();
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('getGitlab', () => {
    describe('token from environment variables', () => {
      it('should create GitLab client with GITLAB_TOKEN from env', async () => {
        process.env.GITLAB_TOKEN = 'glpat-test-token';
        getMockCacheMethods().get.mockReturnValue(undefined);

        await getGitlab();

        expect(mockGitlab).toHaveBeenCalledWith({
          host: 'https://gitlab.com',
          token: 'glpat-test-token',
        });
      });

      it('should create GitLab client with GL_TOKEN from env when GITLAB_TOKEN not set', async () => {
        process.env.GL_TOKEN = 'glpat-gl-token';
        getMockCacheMethods().get.mockReturnValue(undefined);

        await getGitlab();

        expect(mockGitlab).toHaveBeenCalledWith({
          host: 'https://gitlab.com',
          token: 'glpat-gl-token',
        });
      });

      it('should prefer GITLAB_TOKEN over GL_TOKEN', async () => {
        process.env.GITLAB_TOKEN = 'glpat-gitlab-token';
        process.env.GL_TOKEN = 'glpat-gl-token';
        getMockCacheMethods().get.mockReturnValue(undefined);

        await getGitlab();

        expect(mockGitlab).toHaveBeenCalledWith({
          host: 'https://gitlab.com',
          token: 'glpat-gitlab-token',
        });
      });

      it('should use GITLAB_HOST from environment', async () => {
        process.env.GITLAB_TOKEN = 'glpat-test-token';
        process.env.GITLAB_HOST = 'https://gitlab.mycompany.com';
        getMockCacheMethods().get.mockReturnValue(undefined);

        await getGitlab();

        expect(mockGitlab).toHaveBeenCalledWith({
          host: 'https://gitlab.mycompany.com',
          token: 'glpat-test-token',
        });
      });
    });

    describe('token from config', () => {
      it('should create GitLab client with token from config', async () => {
        getMockCacheMethods().get.mockReturnValue(undefined);

        await getGitlab({ token: 'glpat-config-token' });

        expect(mockGitlab).toHaveBeenCalledWith({
          host: 'https://gitlab.com',
          token: 'glpat-config-token',
        });
      });

      it('should use host from config', async () => {
        getMockCacheMethods().get.mockReturnValue(undefined);

        await getGitlab({
          token: 'glpat-config-token',
          host: 'https://gitlab.enterprise.com',
        });

        expect(mockGitlab).toHaveBeenCalledWith({
          host: 'https://gitlab.enterprise.com',
          token: 'glpat-config-token',
        });
      });

      it('should prefer config token over environment token', async () => {
        process.env.GITLAB_TOKEN = 'glpat-env-token';
        getMockCacheMethods().get.mockReturnValue(undefined);

        await getGitlab({ token: 'glpat-config-token' });

        expect(mockGitlab).toHaveBeenCalledWith({
          host: 'https://gitlab.com',
          token: 'glpat-config-token',
        });
      });

      it('should prefer config host over environment host', async () => {
        process.env.GITLAB_HOST = 'https://gitlab.env.com';
        process.env.GITLAB_TOKEN = 'glpat-test-token';
        getMockCacheMethods().get.mockReturnValue(undefined);

        await getGitlab({ host: 'https://gitlab.config.com' });

        expect(mockGitlab).toHaveBeenCalledWith({
          host: 'https://gitlab.config.com',
          token: 'glpat-test-token',
        });
      });
    });

    describe('error when no token', () => {
      it('should throw error when no token is available', async () => {
        getMockCacheMethods().get.mockReturnValue(undefined);

        await expect(getGitlab()).rejects.toThrow(
          'GitLab token not found. Set GITLAB_TOKEN or GL_TOKEN environment variable, ' +
            'or provide token in configuration.'
        );
      });

      it('should throw error when config has no token and env has no token', async () => {
        getMockCacheMethods().get.mockReturnValue(undefined);

        await expect(
          getGitlab({ host: 'https://gitlab.example.com' })
        ).rejects.toThrow('GitLab token not found');
      });
    });

    describe('client caching behavior', () => {
      it('should return cached client if available', async () => {
        const mockCachedClient = { cached: true };
        getMockCacheMethods().get.mockReturnValue(mockCachedClient);
        process.env.GITLAB_TOKEN = 'glpat-test-token';

        const result = await getGitlab();

        expect(result).toBe(mockCachedClient);
        expect(mockGitlab).not.toHaveBeenCalled();
      });

      it('should cache newly created client', async () => {
        process.env.GITLAB_TOKEN = 'glpat-test-token';
        getMockCacheMethods().get.mockReturnValue(undefined);

        await getGitlab();

        expect(getMockCacheMethods().set).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Object)
        );
      });

      it('should generate different cache keys for different hosts', async () => {
        process.env.GITLAB_TOKEN = 'glpat-test-token';
        getMockCacheMethods().get.mockReturnValue(undefined);

        await getGitlab({ host: 'https://gitlab1.com' });
        const firstCacheKey = getMockCacheMethods().set.mock.calls[0][0];

        await getGitlab({ host: 'https://gitlab2.com' });
        const secondCacheKey = getMockCacheMethods().set.mock.calls[1][0];

        expect(firstCacheKey).not.toBe(secondCacheKey);
      });

      it('should generate different cache keys for different tokens', async () => {
        getMockCacheMethods().get.mockReturnValue(undefined);

        await getGitlab({ token: 'glpat-token-1' });
        const firstCacheKey = getMockCacheMethods().set.mock.calls[0][0];

        await getGitlab({ token: 'glpat-token-2' });
        const secondCacheKey = getMockCacheMethods().set.mock.calls[1][0];

        expect(firstCacheKey).not.toBe(secondCacheKey);
      });

      it('should generate same cache key for same config', async () => {
        getMockCacheMethods().get.mockReturnValue(undefined);

        await getGitlab({
          token: 'glpat-test-token',
          host: 'https://gitlab.test.com',
        });
        const firstCacheKey = getMockCacheMethods().set.mock.calls[0][0];

        await getGitlab({
          token: 'glpat-test-token',
          host: 'https://gitlab.test.com',
        });
        const secondCacheKey = getMockCacheMethods().set.mock.calls[1][0];

        expect(firstCacheKey).toBe(secondCacheKey);
      });

      it('should use token hash in cache key', async () => {
        process.env.GITLAB_TOKEN = 'glpat-test-token';
        getMockCacheMethods().get.mockReturnValue(undefined);

        await getGitlab();

        // The cache key should include a hash of the token
        expect(getMockCacheMethods().set).toHaveBeenCalled();
        const cacheKey = getMockCacheMethods().set.mock.calls[0][0];
        expect(cacheKey).toContain('gitlab:');
      });
    });
  });

  describe('isGitLabConfigured', () => {
    it('should return true when GITLAB_TOKEN is set', () => {
      process.env.GITLAB_TOKEN = 'glpat-test-token';

      expect(isGitLabConfigured()).toBe(true);
    });

    it('should return true when GL_TOKEN is set', () => {
      process.env.GL_TOKEN = 'glpat-gl-token';

      expect(isGitLabConfigured()).toBe(true);
    });

    it('should return false when no token is set', () => {
      delete process.env.GITLAB_TOKEN;
      delete process.env.GL_TOKEN;

      expect(isGitLabConfigured()).toBe(false);
    });

    it('should return true when both tokens are set', () => {
      process.env.GITLAB_TOKEN = 'glpat-gitlab-token';
      process.env.GL_TOKEN = 'glpat-gl-token';

      expect(isGitLabConfigured()).toBe(true);
    });
  });

  describe('getConfiguredGitLabHost', () => {
    it('should return default host when GITLAB_HOST not set', () => {
      delete process.env.GITLAB_HOST;

      expect(getConfiguredGitLabHost()).toBe('https://gitlab.com');
    });

    it('should return GITLAB_HOST from environment', () => {
      process.env.GITLAB_HOST = 'https://gitlab.enterprise.com';

      expect(getConfiguredGitLabHost()).toBe('https://gitlab.enterprise.com');
    });

    it('should return custom host from environment', () => {
      process.env.GITLAB_HOST = 'https://gitlab.mycompany.io/api/v4';

      expect(getConfiguredGitLabHost()).toBe(
        'https://gitlab.mycompany.io/api/v4'
      );
    });
  });

  describe('clearGitLabClients', () => {
    it('should call flushAll on cache', () => {
      clearGitLabClients();

      expect(getMockCacheMethods().flushAll).toHaveBeenCalled();
    });

    it('should clear all cached instances', () => {
      clearGitLabClients();

      expect(getMockCacheMethods().flushAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearGitLabClient', () => {
    it('should delete specific client from cache without config', () => {
      process.env.GITLAB_TOKEN = 'glpat-test-token';

      clearGitLabClient();

      expect(getMockCacheMethods().del).toHaveBeenCalledWith(
        expect.any(String)
      );
    });

    it('should delete specific client from cache with config', () => {
      clearGitLabClient({
        token: 'glpat-specific-token',
        host: 'https://gitlab.specific.com',
      });

      expect(getMockCacheMethods().del).toHaveBeenCalledWith(
        expect.any(String)
      );
    });

    it('should generate correct cache key for deletion', () => {
      process.env.GITLAB_TOKEN = 'glpat-test-token';
      process.env.GITLAB_HOST = 'https://gitlab.test.com';

      clearGitLabClient();

      const deleteKey = getMockCacheMethods().del.mock.calls[0][0];
      expect(deleteKey).toContain('gitlab:');
      expect(deleteKey).toContain('https://gitlab.test.com');
    });

    it('should generate different delete keys for different configs', () => {
      clearGitLabClient({ token: 'token-1' });
      const firstDeleteKey = getMockCacheMethods().del.mock.calls[0][0];

      clearGitLabClient({ token: 'token-2' });
      const secondDeleteKey = getMockCacheMethods().del.mock.calls[1][0];

      expect(firstDeleteKey).not.toBe(secondDeleteKey);
    });
  });

  describe('cache key generation', () => {
    it('should include host in cache key', async () => {
      process.env.GITLAB_TOKEN = 'glpat-test-token';
      getMockCacheMethods().get.mockReturnValue(undefined);

      await getGitlab({ host: 'https://custom.gitlab.com' });

      const cacheKey = getMockCacheMethods().set.mock.calls[0][0];
      expect(cacheKey).toContain('https://custom.gitlab.com');
    });

    it('should use hashed token in cache key (not raw token)', async () => {
      const rawToken = 'glpat-super-secret-token';
      getMockCacheMethods().get.mockReturnValue(undefined);

      await getGitlab({ token: rawToken });

      const cacheKey = getMockCacheMethods().set.mock.calls[0][0];
      // The raw token should not appear in the cache key
      expect(cacheKey).not.toContain(rawToken);
      // But there should be a hash component
      expect(cacheKey).toMatch(/gitlab:.*:[\da-f]+/);
    });

    it('should use default hash when no token for cache key calculation', () => {
      // This tests the internal hashToken function with undefined
      // We need to test this through clearGitLabClient since getGitlab requires a token
      delete process.env.GITLAB_TOKEN;
      delete process.env.GL_TOKEN;

      // clearGitLabClient will use the cache key generation without throwing
      clearGitLabClient();

      const deleteKey = getMockCacheMethods().del.mock.calls[0][0];
      // Should contain 'default' when no token is available
      expect(deleteKey).toContain('default');
    });
  });

  describe('GitLabClient type', () => {
    it('should return instance of Gitlab', async () => {
      const mockInstance = { Projects: {}, Users: {} };
      getMockCacheMethods().get.mockReturnValue(undefined);
      // Use mockImplementationOnce to avoid breaking the constructor for subsequent tests
      mockGitlab.mockImplementationOnce(function () {
        return mockInstance as unknown as InstanceType<typeof Gitlab>;
      });
      process.env.GITLAB_TOKEN = 'glpat-test-token';

      const result = await getGitlab();

      expect(result).toBe(mockInstance);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string token as no token', async () => {
      process.env.GITLAB_TOKEN = '';
      getMockCacheMethods().get.mockReturnValue(undefined);

      await expect(getGitlab()).rejects.toThrow('GitLab token not found');
    });

    it('should handle empty config object', async () => {
      process.env.GITLAB_TOKEN = 'glpat-test-token';
      getMockCacheMethods().get.mockReturnValue(undefined);

      await getGitlab({});

      expect(mockGitlab).toHaveBeenCalledWith({
        host: 'https://gitlab.com',
        token: 'glpat-test-token',
      });
    });

    it('should handle config with only host', async () => {
      process.env.GITLAB_TOKEN = 'glpat-test-token';
      getMockCacheMethods().get.mockReturnValue(undefined);

      await getGitlab({ host: 'https://custom.gitlab.com' });

      expect(mockGitlab).toHaveBeenCalledWith({
        host: 'https://custom.gitlab.com',
        token: 'glpat-test-token',
      });
    });

    it('should handle config with only token', async () => {
      getMockCacheMethods().get.mockReturnValue(undefined);

      await getGitlab({ token: 'glpat-config-only-token' });

      expect(mockGitlab).toHaveBeenCalledWith({
        host: 'https://gitlab.com',
        token: 'glpat-config-only-token',
      });
    });

    it('should handle undefined config', async () => {
      process.env.GITLAB_TOKEN = 'glpat-test-token';
      getMockCacheMethods().get.mockReturnValue(undefined);

      await getGitlab(undefined);

      expect(mockGitlab).toHaveBeenCalledWith({
        host: 'https://gitlab.com',
        token: 'glpat-test-token',
      });
    });
  });

  describe('concurrent access', () => {
    it('should handle multiple concurrent getGitlab calls', async () => {
      process.env.GITLAB_TOKEN = 'glpat-test-token';
      getMockCacheMethods().get.mockReturnValue(undefined);

      // Call getGitlab multiple times concurrently
      const promises = [getGitlab(), getGitlab(), getGitlab()];

      const results = await Promise.all(promises);

      // All should return successfully
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });

    it('should handle multiple different configs concurrently', async () => {
      getMockCacheMethods().get.mockReturnValue(undefined);

      const promises = [
        getGitlab({ token: 'token-1', host: 'https://gitlab1.com' }),
        getGitlab({ token: 'token-2', host: 'https://gitlab2.com' }),
        getGitlab({ token: 'token-3', host: 'https://gitlab3.com' }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(mockGitlab).toHaveBeenCalledTimes(3);
    });
  });
});

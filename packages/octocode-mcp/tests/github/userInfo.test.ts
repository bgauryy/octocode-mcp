import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Create hoisted mocks
const mockGetOctokit = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithDataCache = vi.hoisted(() => vi.fn());

// Set up mocks
vi.mock('../../src/github/client.js', () => ({
  getOctokit: mockGetOctokit,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withDataCache: mockWithDataCache,
}));

// Import after mocks are set up
import {
  getAuthenticatedUser,
  getRateLimitStatus,
  shouldProceedWithAPICall,
  withRateLimitedAPI,
  getUserContext,
} from '../../src/github/userInfo.js';

describe('GitHub User Info', () => {
  let mockOctokit: {
    rest: {
      users: { getAuthenticated: ReturnType<typeof vi.fn> };
      rateLimit: { get: ReturnType<typeof vi.fn> };
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock Octokit instance
    mockOctokit = {
      rest: {
        users: { getAuthenticated: vi.fn() },
        rateLimit: { get: vi.fn() },
      },
    };
    mockGetOctokit.mockResolvedValue(mockOctokit);

    // Setup default cache behavior - execute the operation directly
    mockWithDataCache.mockImplementation(
      async (_cacheKey: string, operation: () => Promise<unknown>) => {
        return await operation();
      }
    );

    mockGenerateCacheKey.mockReturnValue('test-cache-key');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getAuthenticatedUser', () => {
    it('should fetch and return user information', async () => {
      const mockUserData = {
        login: 'testuser',
        id: 12345,
        name: 'Test User',
        email: 'test@example.com',
        company: 'Test Company',
        type: 'User',
        plan: {
          name: 'pro',
          space: 976562499,
          private_repos: 9999,
        },
      };

      mockOctokit.rest.users.getAuthenticated.mockResolvedValue({
        data: mockUserData,
      });

      const result = await getAuthenticatedUser('session-123');

      expect(result).toEqual({
        login: 'testuser',
        id: 12345,
        name: 'Test User',
        email: 'test@example.com',
        company: 'Test Company',
        type: 'User',
        plan: {
          name: 'pro',
          space: 976562499,
          private_repos: 9999,
        },
      });
      expect(mockOctokit.rest.users.getAuthenticated).toHaveBeenCalled();
    });

    it('should return null on API error', async () => {
      mockOctokit.rest.users.getAuthenticated.mockRejectedValue(
        new Error('Unauthorized')
      );

      const result = await getAuthenticatedUser('session-123');

      expect(result).toBeNull();
    });

    it('should use caching with session ID', async () => {
      const mockUserData = {
        login: 'testuser',
        id: 12345,
        name: 'Test User',
        email: null,
        company: null,
        type: 'User',
        plan: null,
      };

      mockOctokit.rest.users.getAuthenticated.mockResolvedValue({
        data: mockUserData,
      });

      await getAuthenticatedUser('session-456');

      expect(mockGenerateCacheKey).toHaveBeenCalledWith(
        'github-user',
        {},
        'session-456'
      );
      expect(mockWithDataCache).toHaveBeenCalled();
    });

    it('should handle user without plan', async () => {
      const mockUserData = {
        login: 'freeuser',
        id: 67890,
        name: 'Free User',
        email: null,
        company: null,
        type: 'User',
        plan: null,
      };

      mockOctokit.rest.users.getAuthenticated.mockResolvedValue({
        data: mockUserData,
      });

      const result = await getAuthenticatedUser();

      expect(result).toEqual({
        login: 'freeuser',
        id: 67890,
        name: 'Free User',
        email: null,
        company: null,
        type: 'User',
        plan: undefined, // null converted to undefined
      });
    });

    it('should handle organization user type', async () => {
      const mockOrgData = {
        login: 'testorg',
        id: 99999,
        name: 'Test Organization',
        email: 'org@example.com',
        company: null,
        type: 'Organization',
        plan: null,
      };

      mockOctokit.rest.users.getAuthenticated.mockResolvedValue({
        data: mockOrgData,
      });

      const result = await getAuthenticatedUser();

      expect(result?.type).toBe('Organization');
      expect(result?.login).toBe('testorg');
    });
  });

  describe('getRateLimitStatus', () => {
    it('should fetch and return rate limit information', async () => {
      const mockRateLimitData = {
        resources: {
          core: {
            limit: 5000,
            remaining: 4999,
            reset: 1372700873,
            used: 1,
          },
          search: {
            limit: 30,
            remaining: 18,
            reset: 1372697452,
            used: 12,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      mockOctokit.rest.rateLimit.get.mockResolvedValue({
        data: mockRateLimitData,
      });

      const result = await getRateLimitStatus();

      expect(result).toEqual({
        core: mockRateLimitData.resources.core,
        search: mockRateLimitData.resources.search,
        graphql: mockRateLimitData.resources.graphql,
      });
      expect(mockOctokit.rest.rateLimit.get).toHaveBeenCalled();
    });

    it('should return null on API error', async () => {
      mockOctokit.rest.rateLimit.get.mockRejectedValue(
        new Error('Network error')
      );

      const result = await getRateLimitStatus();

      expect(result).toBeNull();
    });
  });

  describe('shouldProceedWithAPICall', () => {
    it('should allow API call when sufficient requests remaining', async () => {
      const mockRateLimitData = {
        resources: {
          core: {
            limit: 5000,
            remaining: 4999,
            reset: 1372700873,
            used: 1,
          },
          search: {
            limit: 30,
            remaining: 18,
            reset: 1372697452,
            used: 12,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      mockOctokit.rest.rateLimit.get.mockResolvedValue({
        data: mockRateLimitData,
      });

      const result = await shouldProceedWithAPICall('core', 10);

      expect(result.canProceed).toBe(true);
      expect(result.rateLimitInfo).toBeDefined();
    });

    it('should block API call when insufficient requests remaining', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const mockRateLimitData = {
        resources: {
          core: {
            limit: 5000,
            remaining: 5,
            reset: resetTime,
            used: 4995,
          },
          search: {
            limit: 30,
            remaining: 18,
            reset: 1372697452,
            used: 12,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      mockOctokit.rest.rateLimit.get.mockResolvedValue({
        data: mockRateLimitData,
      });

      const result = await shouldProceedWithAPICall('core', 10);

      expect(result.canProceed).toBe(false);
      expect(result.waitTime).toBeGreaterThan(0);
      expect(result.rateLimitInfo).toBeDefined();
    });

    it('should check search rate limit', async () => {
      const mockRateLimitData = {
        resources: {
          core: {
            limit: 5000,
            remaining: 4999,
            reset: 1372700873,
            used: 1,
          },
          search: {
            limit: 30,
            remaining: 5,
            reset: 1372697452,
            used: 25,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      mockOctokit.rest.rateLimit.get.mockResolvedValue({
        data: mockRateLimitData,
      });

      const result = await shouldProceedWithAPICall('search', 10);

      expect(result.canProceed).toBe(false);
    });

    it('should check graphql rate limit', async () => {
      const mockRateLimitData = {
        resources: {
          core: {
            limit: 5000,
            remaining: 4999,
            reset: 1372700873,
            used: 1,
          },
          search: {
            limit: 30,
            remaining: 25,
            reset: 1372697452,
            used: 5,
          },
          graphql: {
            limit: 5000,
            remaining: 100,
            reset: 1372700873,
            used: 4900,
          },
        },
      };

      mockOctokit.rest.rateLimit.get.mockResolvedValue({
        data: mockRateLimitData,
      });

      const result = await shouldProceedWithAPICall('graphql', 50);

      expect(result.canProceed).toBe(true);
    });

    it('should proceed cautiously when rate limit info unavailable', async () => {
      mockOctokit.rest.rateLimit.get.mockRejectedValue(new Error('Error'));

      const result = await shouldProceedWithAPICall('core', 10);

      expect(result.canProceed).toBe(true);
      expect(result.rateLimitInfo).toBeUndefined();
    });

    it('should use default minRemaining of 10', async () => {
      const mockRateLimitData = {
        resources: {
          core: {
            limit: 5000,
            remaining: 15,
            reset: 1372700873,
            used: 4985,
          },
          search: {
            limit: 30,
            remaining: 25,
            reset: 1372697452,
            used: 5,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      mockOctokit.rest.rateLimit.get.mockResolvedValue({
        data: mockRateLimitData,
      });

      // Call without minRemaining parameter - should use default of 10
      const result = await shouldProceedWithAPICall('core');

      expect(result.canProceed).toBe(true); // 15 >= 10
    });
  });

  describe('withRateLimitedAPI', () => {
    it('should execute API call when rate limit allows', async () => {
      const mockRateLimitData = {
        resources: {
          core: {
            limit: 5000,
            remaining: 4999,
            reset: 1372700873,
            used: 1,
          },
          search: {
            limit: 30,
            remaining: 25,
            reset: 1372697452,
            used: 5,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      mockOctokit.rest.rateLimit.get.mockResolvedValue({
        data: mockRateLimitData,
      });

      const apiCall = vi.fn().mockResolvedValue({ data: 'success' });

      const result = await withRateLimitedAPI(apiCall);

      expect(result).toEqual({ data: 'success' });
      expect(apiCall).toHaveBeenCalled();
    });

    it('should throw error when rate limit exceeded and waitOnLimit is false', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600;
      const mockRateLimitData = {
        resources: {
          core: {
            limit: 5000,
            remaining: 0,
            reset: resetTime,
            used: 5000,
          },
          search: {
            limit: 30,
            remaining: 25,
            reset: 1372697452,
            used: 5,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      mockOctokit.rest.rateLimit.get.mockResolvedValue({
        data: mockRateLimitData,
      });

      const apiCall = vi.fn().mockResolvedValue({ data: 'success' });

      await expect(
        withRateLimitedAPI(apiCall, { type: 'core', minRemaining: 10 })
      ).rejects.toThrow('GitHub API rate limit exceeded');

      expect(apiCall).not.toHaveBeenCalled();
    });

    it('should wait and retry when rate limit exceeded and waitOnLimit is true', async () => {
      vi.useFakeTimers();

      const resetTime = Math.floor(Date.now() / 1000) + 2; // 2 seconds from now
      const mockRateLimitData1 = {
        resources: {
          core: {
            limit: 5000,
            remaining: 0,
            reset: resetTime,
            used: 5000,
          },
          search: {
            limit: 30,
            remaining: 25,
            reset: 1372697452,
            used: 5,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      const mockRateLimitData2 = {
        resources: {
          core: {
            limit: 5000,
            remaining: 5000,
            reset: resetTime + 3600,
            used: 0,
          },
          search: {
            limit: 30,
            remaining: 25,
            reset: 1372697452,
            used: 5,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      mockOctokit.rest.rateLimit.get
        .mockResolvedValueOnce({ data: mockRateLimitData1 })
        .mockResolvedValueOnce({ data: mockRateLimitData2 });

      const apiCall = vi.fn().mockResolvedValue({ data: 'success' });

      const promise = withRateLimitedAPI(apiCall, {
        type: 'core',
        minRemaining: 10,
        waitOnLimit: true,
      });

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(3000);

      const result = await promise;

      expect(result).toEqual({ data: 'success' });
      expect(apiCall).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should respect custom type and minRemaining options', async () => {
      const mockRateLimitData = {
        resources: {
          core: {
            limit: 5000,
            remaining: 4999,
            reset: 1372700873,
            used: 1,
          },
          search: {
            limit: 30,
            remaining: 25,
            reset: 1372697452,
            used: 5,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      mockOctokit.rest.rateLimit.get.mockResolvedValue({
        data: mockRateLimitData,
      });

      const apiCall = vi.fn().mockResolvedValue({ data: 'search results' });

      const result = await withRateLimitedAPI(apiCall, {
        type: 'search',
        minRemaining: 5,
      });

      expect(result).toEqual({ data: 'search results' });
      expect(apiCall).toHaveBeenCalled();
    });

    it('should cap wait time at 1 hour', async () => {
      vi.useFakeTimers();

      const resetTime = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now
      const mockRateLimitData1 = {
        resources: {
          core: {
            limit: 5000,
            remaining: 0,
            reset: resetTime,
            used: 5000,
          },
          search: {
            limit: 30,
            remaining: 25,
            reset: 1372697452,
            used: 5,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      const mockRateLimitData2 = {
        resources: {
          core: {
            limit: 5000,
            remaining: 5000,
            reset: resetTime + 3600,
            used: 0,
          },
          search: {
            limit: 30,
            remaining: 25,
            reset: 1372697452,
            used: 5,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      mockOctokit.rest.rateLimit.get
        .mockResolvedValueOnce({ data: mockRateLimitData1 })
        .mockResolvedValueOnce({ data: mockRateLimitData2 });

      const apiCall = vi.fn().mockResolvedValue({ data: 'success' });

      const promise = withRateLimitedAPI(apiCall, {
        type: 'core',
        minRemaining: 10,
        waitOnLimit: true,
      });

      // Fast-forward by 1 hour (max wait time)
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

      const result = await promise;

      expect(result).toEqual({ data: 'success' });
      expect(apiCall).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('getUserContext', () => {
    it('should return user info and rate limits', async () => {
      const mockUserData = {
        login: 'testuser',
        id: 12345,
        name: 'Test User',
        email: 'test@example.com',
        company: 'Test Company',
        type: 'User',
        plan: null,
      };

      const mockRateLimitData = {
        resources: {
          core: {
            limit: 5000,
            remaining: 4999,
            reset: 1372700873,
            used: 1,
          },
          search: {
            limit: 30,
            remaining: 25,
            reset: 1372697452,
            used: 5,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      mockOctokit.rest.users.getAuthenticated.mockResolvedValue({
        data: mockUserData,
      });
      mockOctokit.rest.rateLimit.get.mockResolvedValue({
        data: mockRateLimitData,
      });

      const result = await getUserContext();

      expect(result.user).toBeDefined();
      expect(result.user?.login).toBe('testuser');
      expect(result.rateLimits).toBeDefined();
      expect(result.rateLimits?.core.remaining).toBe(4999);
    });

    it('should include organization ID from environment', async () => {
      process.env.GITHUB_ORGANIZATION = 'test-org';

      const mockUserData = {
        login: 'testuser',
        id: 12345,
        name: 'Test User',
        email: null,
        company: null,
        type: 'User',
        plan: null,
      };

      const mockRateLimitData = {
        resources: {
          core: {
            limit: 5000,
            remaining: 4999,
            reset: 1372700873,
            used: 1,
          },
          search: {
            limit: 30,
            remaining: 25,
            reset: 1372697452,
            used: 5,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      mockOctokit.rest.users.getAuthenticated.mockResolvedValue({
        data: mockUserData,
      });
      mockOctokit.rest.rateLimit.get.mockResolvedValue({
        data: mockRateLimitData,
      });

      const result = await getUserContext();

      expect(result.organizationId).toBe('test-org');

      delete process.env.GITHUB_ORGANIZATION;
    });

    it('should handle user fetch failure gracefully', async () => {
      mockOctokit.rest.users.getAuthenticated.mockRejectedValue(
        new Error('Unauthorized')
      );

      const mockRateLimitData = {
        resources: {
          core: {
            limit: 5000,
            remaining: 4999,
            reset: 1372700873,
            used: 1,
          },
          search: {
            limit: 30,
            remaining: 25,
            reset: 1372697452,
            used: 5,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      mockOctokit.rest.rateLimit.get.mockResolvedValue({
        data: mockRateLimitData,
      });

      const result = await getUserContext();

      expect(result.user).toBeNull();
      expect(result.rateLimits).toBeDefined();
    });

    it('should handle rate limit fetch failure gracefully', async () => {
      const mockUserData = {
        login: 'testuser',
        id: 12345,
        name: 'Test User',
        email: null,
        company: null,
        type: 'User',
        plan: null,
      };

      mockOctokit.rest.users.getAuthenticated.mockResolvedValue({
        data: mockUserData,
      });
      mockOctokit.rest.rateLimit.get.mockRejectedValue(
        new Error('Network error')
      );

      const result = await getUserContext();

      expect(result.user).toBeDefined();
      expect(result.rateLimits).toBeNull();
    });

    it('should fetch both user and rate limits in parallel', async () => {
      const mockUserData = {
        login: 'testuser',
        id: 12345,
        name: 'Test User',
        email: null,
        company: null,
        type: 'User',
        plan: null,
      };

      const mockRateLimitData = {
        resources: {
          core: {
            limit: 5000,
            remaining: 4999,
            reset: 1372700873,
            used: 1,
          },
          search: {
            limit: 30,
            remaining: 25,
            reset: 1372697452,
            used: 5,
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: 1372700873,
            used: 0,
          },
        },
      };

      mockOctokit.rest.users.getAuthenticated.mockResolvedValue({
        data: mockUserData,
      });
      mockOctokit.rest.rateLimit.get.mockResolvedValue({
        data: mockRateLimitData,
      });

      const result = await getUserContext();

      // Both calls should have been made
      expect(mockOctokit.rest.users.getAuthenticated).toHaveBeenCalled();
      expect(mockOctokit.rest.rateLimit.get).toHaveBeenCalled();

      expect(result.user).toBeDefined();
      expect(result.rateLimits).toBeDefined();
    });
  });
});

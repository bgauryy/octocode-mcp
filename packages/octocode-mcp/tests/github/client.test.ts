import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getOctokit,
  OctokitWithThrottling,
  getDefaultBranch,
  clearCachedToken,
} from '../../src/github/client.js';

// Mock dependencies
vi.mock('../../src/serverConfig.js', () => ({
  getGitHubToken: vi.fn(),
  getServerConfig: vi.fn(() => ({
    timeout: 30000,
    version: '1.0.0',
  })),
}));

vi.mock('octokit', () => {
  const mockOctokitInstance = {
    rest: {
      repos: {
        get: vi.fn(),
      },
    },
  };

  const mockOctokitClass = vi
    .fn()
    .mockImplementation(() => mockOctokitInstance);
  (mockOctokitClass as unknown as { plugin: typeof vi.fn }).plugin = vi.fn(
    () => mockOctokitClass
  );

  return {
    Octokit: mockOctokitClass,
  };
});

vi.mock('@octokit/plugin-throttling', () => ({
  throttling: {},
}));

import { getGitHubToken, getServerConfig } from '../../src/serverConfig.js';
import { Octokit } from 'octokit';

const mockGetGitHubToken = vi.mocked(getGitHubToken);
const mockGetServerConfig = vi.mocked(getServerConfig);
const mockOctokit = vi.mocked(Octokit);

describe('GitHub Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCachedToken(); // Clear any cached instances

    // Setup default mocks
    mockGetServerConfig.mockReturnValue({
      version: '1.0.0',
      timeout: 30000,
      enableLogging: false,
      betaEnabled: false,
      maxRetries: 3,
    });
  });

  afterEach(() => {
    clearCachedToken();
  });

  describe('getOctokit', () => {
    it('should create Octokit instance with token', async () => {
      const testToken = 'test-token';
      mockGetGitHubToken.mockResolvedValue(testToken);

      await getOctokit();

      expect(mockOctokit).toHaveBeenCalledWith({
        userAgent: 'octocode-mcp/6.0.0',
        baseUrl: 'https://api.github.com',
        request: { timeout: 30000 },
        throttle: {
          onRateLimit: expect.any(Function),
          onSecondaryRateLimit: expect.any(Function),
        },
        auth: testToken,
      });
    });

    it('should create Octokit instance without token if none provided', async () => {
      mockGetGitHubToken.mockResolvedValue(null);

      await getOctokit();

      expect(mockOctokit).toHaveBeenCalledWith({
        userAgent: 'octocode-mcp/6.0.0',
        baseUrl: 'https://api.github.com',
        request: { timeout: 30000 },
        throttle: {
          onRateLimit: expect.any(Function),
          onSecondaryRateLimit: expect.any(Function),
        },
      });
    });

    it('should use provided auth token over config token', async () => {
      mockGetGitHubToken.mockResolvedValue('config-token');
      const authInfo = {
        token: 'auth-token',
        clientId: 'test-client',
        scopes: [],
      };

      await getOctokit(authInfo);

      expect(mockOctokit).toHaveBeenCalledWith({
        userAgent: 'octocode-mcp/6.0.0',
        baseUrl: 'https://api.github.com',
        request: { timeout: 30000 },
        throttle: {
          onRateLimit: expect.any(Function),
          onSecondaryRateLimit: expect.any(Function),
        },
        auth: 'auth-token',
      });
    });

    it('should reuse cached instance when no authInfo provided', async () => {
      mockGetGitHubToken.mockResolvedValue('test-token');

      const instance1 = await getOctokit();
      const instance2 = await getOctokit();

      expect(instance1).toBe(instance2);
      expect(mockOctokit).toHaveBeenCalledTimes(1);
    });

    it('should create new instance when authInfo is provided', async () => {
      mockGetGitHubToken.mockResolvedValue('config-token');

      await getOctokit();
      await getOctokit({
        token: 'new-token',
        clientId: 'test-client',
        scopes: [],
      });

      expect(mockOctokit).toHaveBeenCalledTimes(2);
    });

    it('should use server config timeout', async () => {
      mockGetGitHubToken.mockResolvedValue('test-token');
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        timeout: 60000,
        enableLogging: false,
        betaEnabled: false,
        maxRetries: 3,
      });

      await getOctokit();

      expect(mockOctokit).toHaveBeenCalledWith(
        expect.objectContaining({
          request: { timeout: 60000 },
        })
      );
    });
  });

  describe('clearCachedToken', () => {
    it('should clear cached Octokit instance', async () => {
      mockGetGitHubToken.mockResolvedValue('test-token');

      // Mock to return different objects for each call
      const mockInstance1 = { rest: { repos: { get: vi.fn() } } };
      const mockInstance2 = { rest: { repos: { get: vi.fn() } } };
      mockOctokit
        .mockReturnValueOnce(mockInstance1)
        .mockReturnValueOnce(mockInstance2);

      // Create instance
      const instance1 = await getOctokit();

      // Clear cache
      clearCachedToken();

      // Create new instance
      const instance2 = await getOctokit();

      expect(instance1).not.toBe(instance2);
      expect(mockOctokit).toHaveBeenCalledTimes(2);
    });
  });

  describe('getDefaultBranch', () => {
    let mockOctokitInstance: {
      rest: {
        repos: {
          get: ReturnType<typeof vi.fn>;
        };
      };
    };

    beforeEach(() => {
      // Clear cache before each test
      clearCachedToken();

      mockOctokitInstance = {
        rest: {
          repos: {
            get: vi.fn(),
          },
        },
      };

      mockOctokit.mockImplementation(() => mockOctokitInstance);
      mockGetGitHubToken.mockResolvedValue('test-token');
    });

    it('should fetch and cache default branch', async () => {
      const mockRepoResponse = {
        data: {
          default_branch: 'main',
        },
      };
      mockOctokitInstance.rest.repos.get.mockResolvedValue(mockRepoResponse);

      const result = await getDefaultBranch('owner', 'repo');

      expect(result).toBe('main');
      expect(mockOctokitInstance.rest.repos.get).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
      });
    });

    it('should return cached result on subsequent calls', async () => {
      const mockRepoResponse = {
        data: {
          default_branch: 'develop',
        },
      };
      mockOctokitInstance.rest.repos.get.mockResolvedValue(mockRepoResponse);

      // First call
      const result1 = await getDefaultBranch('testowner', 'testrepo');
      // Second call
      const result2 = await getDefaultBranch('testowner', 'testrepo');

      expect(result1).toBe('develop');
      expect(result2).toBe('develop');
      expect(mockOctokitInstance.rest.repos.get).toHaveBeenCalledTimes(1);
    });

    it('should use different cache keys for different repos', async () => {
      const mockRepoResponse1 = {
        data: { default_branch: 'main' },
      };
      const mockRepoResponse2 = {
        data: { default_branch: 'master' },
      };

      mockOctokitInstance.rest.repos.get
        .mockResolvedValueOnce(mockRepoResponse1)
        .mockResolvedValueOnce(mockRepoResponse2);

      const result1 = await getDefaultBranch('owner1', 'repo1');
      const result2 = await getDefaultBranch('owner2', 'repo2');

      expect(result1).toBe('main');
      expect(result2).toBe('master');
      expect(mockOctokitInstance.rest.repos.get).toHaveBeenCalledTimes(2);
    });

    it('should default to "main" when default_branch is null', async () => {
      const mockRepoResponse = {
        data: {
          default_branch: null,
        },
      };
      mockOctokitInstance.rest.repos.get.mockResolvedValue(mockRepoResponse);

      const result = await getDefaultBranch('owner', 'repo');

      expect(result).toBe('main');
    });

    it('should return null on error', async () => {
      mockOctokitInstance.rest.repos.get.mockRejectedValue(
        new Error('API Error')
      );

      const result = await getDefaultBranch('errorowner', 'errorrepo');

      expect(result).toBeNull();
    });

    it('should handle 404 errors gracefully', async () => {
      const error = new Error('Not Found') as Error & { status: number };
      error.status = 404;
      mockOctokitInstance.rest.repos.get.mockRejectedValue(error);

      const result = await getDefaultBranch(
        'notfoundowner',
        'nonexistent-repo'
      );

      expect(result).toBeNull();
    });

    it('should handle rate limiting errors gracefully', async () => {
      const error = new Error('Rate limited') as Error & { status: number };
      error.status = 403;
      mockOctokitInstance.rest.repos.get.mockRejectedValue(error);

      const result = await getDefaultBranch('ratelimitowner', 'ratelimitrepo');

      expect(result).toBeNull();
    });
  });

  describe('OctokitWithThrottling', () => {
    it('should export OctokitWithThrottling class', () => {
      expect(OctokitWithThrottling).toBeDefined();
      expect(typeof OctokitWithThrottling).toBe('function');
    });
  });

  describe('throttle configuration', () => {
    it('should configure throttling options correctly', async () => {
      mockGetGitHubToken.mockResolvedValue('test-token');

      await getOctokit();

      const callArgs = mockOctokit.mock.calls[0][0];
      expect(callArgs.throttle).toBeDefined();
      expect(typeof callArgs.throttle.onRateLimit).toBe('function');
      expect(typeof callArgs.throttle.onSecondaryRateLimit).toBe('function');
    });

    it('should return true for first retry on rate limit', async () => {
      mockGetGitHubToken.mockResolvedValue('test-token');

      await getOctokit();

      const callArgs = mockOctokit.mock.calls[0][0];
      const { onRateLimit } = callArgs.throttle;

      // First retry should return true
      expect(onRateLimit(3600, {}, {}, 0)).toBe(true);
      // Second retry should return false
      expect(onRateLimit(3600, {}, {}, 1)).toBe(false);
    });

    it('should return true for first retry on secondary rate limit', async () => {
      mockGetGitHubToken.mockResolvedValue('test-token');

      await getOctokit();

      const callArgs = mockOctokit.mock.calls[0][0];
      const { onSecondaryRateLimit } = callArgs.throttle;

      // First retry should return true
      expect(onSecondaryRateLimit(60, {}, {}, 0)).toBe(true);
      // Second retry should return false
      expect(onSecondaryRateLimit(60, {}, {}, 1)).toBe(false);
    });
  });
});

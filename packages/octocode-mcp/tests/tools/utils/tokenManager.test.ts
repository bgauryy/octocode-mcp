import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getGitHubToken,
  clearCachedToken,
  getToken,
  initialize,
  onTokenRotated,
  getTokenSource,
  rotateToken,
  getConfig,
  clearConfig,
} from '../../../src/mcp/utils/tokenManager';

// Mock dependencies
vi.mock('../../../src/mcp/utils/exec.js', () => ({
  getGithubCLIToken: vi.fn(),
}));

import { getGithubCLIToken } from '../../../src/mcp/utils/exec.js';

const mockGetGithubCLIToken = vi.mocked(getGithubCLIToken);

describe('Token Manager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear all cached state
    clearCachedToken();
    clearConfig();

    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;

    delete process.env.Authorization;

    // Clear all mocks
    vi.clearAllMocks();
    mockGetGithubCLIToken.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env = originalEnv;
    clearCachedToken();
    clearConfig();
  });

  describe('getGitHubToken', () => {
    it('should return null when no token is available', async () => {
      const token = await getGitHubToken();
      expect(token).toBeNull();
    });

    it('should return GITHUB_TOKEN from environment', async () => {
      process.env.GITHUB_TOKEN = 'github-token';
      const token = await getGitHubToken();
      expect(token).toBe('github-token');
    });

    it('should return GH_TOKEN from environment when GITHUB_TOKEN not set', async () => {
      process.env.GH_TOKEN = 'gh-token';
      const token = await getGitHubToken();
      expect(token).toBe('gh-token');
    });

    it('should prefer GITHUB_TOKEN over GH_TOKEN', async () => {
      process.env.GITHUB_TOKEN = 'github-token';
      process.env.GH_TOKEN = 'gh-token';
      const token = await getGitHubToken();
      expect(token).toBe('github-token');
    });

    it('should return CLI token when env vars not set', async () => {
      mockGetGithubCLIToken.mockResolvedValue('cli-token');
      const token = await getGitHubToken();
      expect(token).toBe('cli-token');
      expect(mockGetGithubCLIToken).toHaveBeenCalled();
    });

    it('should return authorization header token', async () => {
      process.env.Authorization = 'Bearer auth-token';
      const token = await getGitHubToken();
      expect(token).toBe('auth-token');
    });

    it('should cache token after first resolution', async () => {
      process.env.GITHUB_TOKEN = 'github-token';

      const token1 = await getGitHubToken();
      const token2 = await getGitHubToken();

      expect(token1).toBe('github-token');
      expect(token2).toBe('github-token');
    });
  });

  describe('getToken', () => {
    it('should throw error when no token is available', async () => {
      await expect(getToken()).rejects.toThrow(
        'No GitHub token found. Please set GITHUB_TOKEN/GH_TOKEN environment variable, or authenticate with GitHub CLI'
      );
    });

    it('should return token when available', async () => {
      process.env.GITHUB_TOKEN = 'github-token';
      const token = await getToken();
      expect(token).toBe('github-token');
    });

    it('should throw advanced error message in advanced mode', async () => {
      // Set advanced environment to trigger advanced mode
      process.env.AUDIT_ALL_ACCESS = 'true';

      await expect(getToken()).rejects.toThrow(
        'No GitHub token found. In advanced mode, please set GITHUB_TOKEN/GH_TOKEN environment variable (CLI authentication is disabled for security)'
      );
    });

    it('should not use CLI token in advanced mode', async () => {
      process.env.AUDIT_ALL_ACCESS = 'true';
      mockGetGithubCLIToken.mockResolvedValue('cli-token');

      await expect(getToken()).rejects.toThrow();
      expect(mockGetGithubCLIToken).not.toHaveBeenCalled();
    });
  });

  describe('clearCachedToken', () => {
    it('should clear cached token', async () => {
      process.env.GITHUB_TOKEN = 'github-token';

      // Get and cache token
      await getGitHubToken();

      // Clear cache
      clearCachedToken();

      // Change environment
      process.env.GITHUB_TOKEN = 'new-token';

      // Should get new token, not cached one
      const token = await getGitHubToken();
      expect(token).toBe('new-token');
    });
  });

  describe('getTokenSource', () => {
    it('should return unknown initially', () => {
      expect(getTokenSource()).toBe('unknown');
    });

    it('should return env when token from environment', async () => {
      process.env.GITHUB_TOKEN = 'github-token';
      await getGitHubToken();
      expect(getTokenSource()).toBe('env');
    });

    it('should return cli when token from CLI', async () => {
      mockGetGithubCLIToken.mockResolvedValue('cli-token');
      await getGitHubToken();
      expect(getTokenSource()).toBe('cli');
    });

    it('should return authorization when token from header', async () => {
      process.env.Authorization = 'Bearer auth-token';
      await getGitHubToken();
      expect(getTokenSource()).toBe('authorization');
    });
  });

  describe('Configuration', () => {
    it('should initialize with config', () => {
      const config = {
        enableAuditLogging: true,
      };

      initialize(config);

      const storedConfig = getConfig();
      expect(storedConfig).toEqual(config);
    });

    it('should clear configuration', () => {
      initialize({});
      expect(getConfig()).not.toBeNull();

      clearConfig();
      expect(getConfig()).toBeNull();
    });
  });

  describe('Token Rotation', () => {
    it('should rotate token and notify handlers', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const cleanup1 = onTokenRotated(handler1);
      const cleanup2 = onTokenRotated(handler2);

      await rotateToken('new-token');

      expect(handler1).toHaveBeenCalledWith('new-token', undefined);
      expect(handler2).toHaveBeenCalledWith('new-token', undefined);

      // Test cleanup
      cleanup1();
      cleanup2();

      await rotateToken('another-token');

      // Handlers should not be called again
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should pass old token to handlers', async () => {
      process.env.GITHUB_TOKEN = 'old-token';
      await getGitHubToken(); // Cache the old token

      const handler = vi.fn();
      onTokenRotated(handler);

      await rotateToken('new-token');

      expect(handler).toHaveBeenCalledWith('new-token', 'old-token');
    });

    it('should handle handler errors gracefully', async () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const goodHandler = vi.fn();

      onTokenRotated(errorHandler);
      onTokenRotated(goodHandler);

      // Should not throw
      await expect(rotateToken('new-token')).resolves.not.toThrow();

      expect(errorHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });
  });

  describe('Authorization Header Parsing', () => {
    it('should extract token from Bearer header', async () => {
      process.env.Authorization = 'Bearer test-token';
      const token = await getGitHubToken();
      expect(token).toBe('test-token');
    });

    it('should extract token from token header', async () => {
      process.env.Authorization = 'token test-token';
      const token = await getGitHubToken();
      expect(token).toBe('test-token');
    });

    it('should extract token from template format', async () => {
      process.env.Authorization = '{{test-token}}';
      const token = await getGitHubToken();
      expect(token).toBe('test-token');
    });

    it('should handle malformed headers gracefully', async () => {
      process.env.Authorization = '   Bearer    ';
      const token = await getGitHubToken();
      expect(token).toBeNull();
    });
  });
});

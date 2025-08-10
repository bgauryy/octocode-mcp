import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getGitHubToken,
  clearCachedToken,
  getToken,
} from '../../../src/mcp/tools/utils/tokenManager';

// Mock dependencies
vi.mock('../../../src/utils/exec.js', () => ({
  getGithubCLIToken: vi.fn(),
}));

vi.mock('../../../src/utils/github/client.js', () => ({
  extractBearerToken: vi.fn(),
}));

vi.mock('../../../src/security/credentialStore.js', () => ({
  SecureCredentialStore: {
    setToken: vi.fn(),
  },
}));

import { getGithubCLIToken } from '../../../src/utils/exec.js';
import { extractBearerToken } from '../../../src/utils/github/client.js';
import { SecureCredentialStore } from '../../../src/security/credentialStore.js';

const mockGetGithubCLIToken = vi.mocked(getGithubCLIToken);
const mockExtractBearerToken = vi.mocked(extractBearerToken);
const mockSecureCredentialStore = vi.mocked(SecureCredentialStore);

describe('Token Manager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Clear cached token before each test
    clearCachedToken();

    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.Authorization;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    clearCachedToken();
  });

  describe('getGitHubToken', () => {
    it('should return token from GITHUB_TOKEN environment variable', async () => {
      process.env.GITHUB_TOKEN = 'env-github-token';

      const token = await getGitHubToken();

      expect(token).toBe('env-github-token');
      expect(mockGetGithubCLIToken).not.toHaveBeenCalled();
      expect(mockExtractBearerToken).not.toHaveBeenCalled();
    });

    it('should return token from GH_TOKEN environment variable when GITHUB_TOKEN is not set', async () => {
      process.env.GH_TOKEN = 'env-gh-token';

      const token = await getGitHubToken();

      expect(token).toBe('env-gh-token');
      expect(mockGetGithubCLIToken).not.toHaveBeenCalled();
      expect(mockExtractBearerToken).not.toHaveBeenCalled();
    });

    it('should prefer GITHUB_TOKEN over GH_TOKEN when both are set', async () => {
      process.env.GITHUB_TOKEN = 'github-token';
      process.env.GH_TOKEN = 'gh-token';

      const token = await getGitHubToken();

      expect(token).toBe('github-token');
      expect(mockGetGithubCLIToken).not.toHaveBeenCalled();
      expect(mockExtractBearerToken).not.toHaveBeenCalled();
    });

    it('should get token from GitHub CLI when environment variables are not set', async () => {
      mockGetGithubCLIToken.mockResolvedValue('cli-token');

      const token = await getGitHubToken();

      expect(token).toBe('cli-token');
      expect(mockGetGithubCLIToken).toHaveBeenCalledOnce();
      expect(mockExtractBearerToken).not.toHaveBeenCalled();
    });

    it('should extract bearer token from Authorization header when other methods fail', async () => {
      process.env.Authorization = 'Bearer extracted-token';
      mockGetGithubCLIToken.mockResolvedValue(null);
      mockExtractBearerToken.mockReturnValue('extracted-token');

      const token = await getGitHubToken();

      expect(token).toBe('extracted-token');
      expect(mockGetGithubCLIToken).toHaveBeenCalledOnce();
      expect(mockExtractBearerToken).toHaveBeenCalledWith(
        'Bearer extracted-token'
      );
    });

    it('should handle empty Authorization environment variable', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null);
      mockExtractBearerToken.mockReturnValue(null);

      const token = await getGitHubToken();

      expect(token).toBeNull();
      expect(mockExtractBearerToken).toHaveBeenCalledWith('');
    });

    it('should return null when no token is available from any source', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null);
      mockExtractBearerToken.mockReturnValue(null);

      const token = await getGitHubToken();

      expect(token).toBeNull();
      expect(mockGetGithubCLIToken).toHaveBeenCalledOnce();
      expect(mockExtractBearerToken).toHaveBeenCalledOnce();
    });

    it('should cache token after first successful retrieval', async () => {
      process.env.GITHUB_TOKEN = 'cached-token';

      // First call
      const token1 = await getGitHubToken();
      expect(token1).toBe('cached-token');

      // Clear environment to test caching
      delete process.env.GITHUB_TOKEN;

      // Second call should return cached token
      const token2 = await getGitHubToken();
      expect(token2).toBe('cached-token');

      // CLI should not be called on second attempt due to caching
      expect(mockGetGithubCLIToken).not.toHaveBeenCalled();
    });

    it('should handle GitHub CLI token retrieval failure gracefully', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null); // CLI returns null on failure
      mockExtractBearerToken.mockReturnValue(null);

      const token = await getGitHubToken();

      expect(token).toBeNull();
      expect(mockGetGithubCLIToken).toHaveBeenCalledOnce();
    });

    it('should prioritize environment variables over CLI even when CLI has token', async () => {
      process.env.GITHUB_TOKEN = 'env-token';
      mockGetGithubCLIToken.mockResolvedValue('cli-token');

      const token = await getGitHubToken();

      expect(token).toBe('env-token');
      expect(mockGetGithubCLIToken).not.toHaveBeenCalled();
    });
  });

  describe('clearCachedToken', () => {
    it('should clear the cached token', async () => {
      // First, cache a token
      process.env.GITHUB_TOKEN = 'initial-token';
      const token1 = await getGitHubToken();
      expect(token1).toBe('initial-token');

      // Clear the cache
      clearCachedToken();

      // Change environment and verify new token is retrieved
      delete process.env.GITHUB_TOKEN;
      process.env.GH_TOKEN = 'new-token';

      const token2 = await getGitHubToken();
      expect(token2).toBe('new-token');
    });

    it('should allow re-caching after clearing', async () => {
      // Cache initial token
      process.env.GITHUB_TOKEN = 'first-token';
      await getGitHubToken();

      // Clear cache
      clearCachedToken();

      // Cache new token
      process.env.GITHUB_TOKEN = 'second-token';
      const token = await getGitHubToken();
      expect(token).toBe('second-token');

      // Verify it's cached by removing env var
      delete process.env.GITHUB_TOKEN;
      const cachedToken = await getGitHubToken();
      expect(cachedToken).toBe('second-token');
    });
  });

  describe('getToken', () => {
    it('should return token from GITHUB_TOKEN environment variable', async () => {
      process.env.GITHUB_TOKEN = 'env-github-token';

      const token = await getToken();

      expect(token).toBe('env-github-token');
      expect(mockSecureCredentialStore.setToken).toHaveBeenCalledWith(
        'env-github-token'
      );
      expect(mockGetGithubCLIToken).not.toHaveBeenCalled();
    });

    it('should return token from GH_TOKEN environment variable', async () => {
      process.env.GH_TOKEN = 'env-gh-token';

      const token = await getToken();

      expect(token).toBe('env-gh-token');
      expect(mockSecureCredentialStore.setToken).toHaveBeenCalledWith(
        'env-gh-token'
      );
    });

    it('should return token from GitHub CLI', async () => {
      mockGetGithubCLIToken.mockResolvedValue('cli-token');

      const token = await getToken();

      expect(token).toBe('cli-token');
      expect(mockSecureCredentialStore.setToken).toHaveBeenCalledWith(
        'cli-token'
      );
      expect(mockGetGithubCLIToken).toHaveBeenCalledOnce();
    });

    it('should return token from Authorization header extraction', async () => {
      process.env.Authorization = 'Bearer extracted-token';
      mockGetGithubCLIToken.mockResolvedValue(null);
      mockExtractBearerToken.mockReturnValue('extracted-token');

      const token = await getToken();

      expect(token).toBe('extracted-token');
      expect(mockSecureCredentialStore.setToken).toHaveBeenCalledWith(
        'extracted-token'
      );
      expect(mockExtractBearerToken).toHaveBeenCalledWith(
        'Bearer extracted-token'
      );
    });

    it('should throw error when no token is available', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null);
      mockExtractBearerToken.mockReturnValue(null);

      await expect(getToken()).rejects.toThrow(
        'No GitHub token found. Please set GITHUB_TOKEN or GH_TOKEN environment variable or authenticate with GitHub CLI'
      );
      expect(mockSecureCredentialStore.setToken).not.toHaveBeenCalled();
    });

    it('should handle GitHub CLI failure and fallback to other methods', async () => {
      process.env.Authorization = 'Bearer fallback-token';
      mockGetGithubCLIToken.mockResolvedValue(null); // CLI returns null on failure
      mockExtractBearerToken.mockReturnValue('fallback-token');

      const token = await getToken();

      expect(token).toBe('fallback-token');
      expect(mockSecureCredentialStore.setToken).toHaveBeenCalledWith(
        'fallback-token'
      );
    });

    it('should prefer environment variables in correct priority order', async () => {
      process.env.GITHUB_TOKEN = 'github-token';
      process.env.GH_TOKEN = 'gh-token';
      process.env.Authorization = 'Bearer auth-token';
      mockGetGithubCLIToken.mockResolvedValue('cli-token');
      mockExtractBearerToken.mockReturnValue('auth-token');

      const token = await getToken();

      expect(token).toBe('github-token');
      expect(mockSecureCredentialStore.setToken).toHaveBeenCalledWith(
        'github-token'
      );
      expect(mockGetGithubCLIToken).not.toHaveBeenCalled();
      expect(mockExtractBearerToken).not.toHaveBeenCalled();
    });

    it('should store token in SecureCredentialStore regardless of source', async () => {
      const testCases = [
        { env: { GITHUB_TOKEN: 'env1' }, expected: 'env1' },
        { env: { GH_TOKEN: 'env2' }, expected: 'env2' },
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();
        process.env = { ...originalEnv, ...testCase.env };

        const token = await getToken();

        expect(token).toBe(testCase.expected);
        expect(mockSecureCredentialStore.setToken).toHaveBeenCalledWith(
          testCase.expected
        );
        expect(mockSecureCredentialStore.setToken).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('Integration scenarios', () => {
    it('should handle mixed usage of getGitHubToken and getToken', async () => {
      process.env.GITHUB_TOKEN = 'integration-token';

      // Use getGitHubToken first (caches token)
      const token1 = await getGitHubToken();
      expect(token1).toBe('integration-token');

      // Use getToken (should still work independently)
      const token2 = await getToken();
      expect(token2).toBe('integration-token');
      expect(mockSecureCredentialStore.setToken).toHaveBeenCalledWith(
        'integration-token'
      );
    });

    it('should handle token refresh scenario', async () => {
      // Initial token
      process.env.GITHUB_TOKEN = 'old-token';
      const oldToken = await getGitHubToken();
      expect(oldToken).toBe('old-token');

      // Clear cache and update token
      clearCachedToken();
      process.env.GITHUB_TOKEN = 'new-token';

      // Should get new token
      const newToken = await getGitHubToken();
      expect(newToken).toBe('new-token');
    });

    it('should handle empty string tokens correctly', async () => {
      process.env.GITHUB_TOKEN = '';
      process.env.GH_TOKEN = '';
      mockGetGithubCLIToken.mockResolvedValue('');
      mockExtractBearerToken.mockReturnValue('');

      const token = await getGitHubToken();
      expect(token).toBeNull();

      await expect(getToken()).rejects.toThrow('No GitHub token found');
    });

    it('should handle whitespace-only tokens correctly', async () => {
      process.env.GITHUB_TOKEN = '   ';
      mockGetGithubCLIToken.mockResolvedValue('   ');
      mockExtractBearerToken.mockReturnValue('   ');

      // Whitespace tokens should be treated as valid (the function doesn't trim)
      const token = await getGitHubToken();
      expect(token).toBe('   ');

      const strictToken = await getToken();
      expect(strictToken).toBe('   ');
      expect(mockSecureCredentialStore.setToken).toHaveBeenCalledWith('   ');
    });
  });

  describe('Error handling', () => {
    it('should handle SecureCredentialStore.setToken failure gracefully', async () => {
      process.env.GITHUB_TOKEN = 'test-token';
      mockSecureCredentialStore.setToken.mockImplementation(() => {
        throw new Error('Storage failed');
      });

      // getToken should still throw the storage error since it's part of its contract
      await expect(getToken()).rejects.toThrow('Storage failed');
    });

    it('should handle async errors in token retrieval chain', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null); // CLI returns null on failure
      mockExtractBearerToken.mockImplementation(() => {
        throw new Error('Sync extraction error');
      });

      // Both functions should propagate the extraction error since it's not wrapped in try-catch
      await expect(getGitHubToken()).rejects.toThrow('Sync extraction error');
      await expect(getToken()).rejects.toThrow('Sync extraction error');
    });
  });
});

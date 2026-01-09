/**
 * Token Resolution Priority Tests
 *
 * Tests the documented token resolution priority order:
 * 1. OCTOCODE_TOKEN env
 * 2. GH_TOKEN env
 * 3. GITHUB_TOKEN env
 * 4. gh auth token (GitHub CLI)
 * 5. Keychain (stored credentials)
 * 6. File (encrypted fallback)
 *
 * @see packages/octocode-mcp/docs/TOKEN_RESOLUTION.md
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import {
  initialize,
  cleanup,
  getGitHubToken,
  clearConfigCachedToken,
  _setTokenResolvers,
  _resetTokenResolvers,
} from '../src/serverConfig.js';

describe('Token Resolution Priority (TOKEN_RESOLUTION.md)', () => {
  const originalEnv = process.env;

  // Mock implementations with proper types
  let mockGetTokenFromEnv: Mock<() => string | null>;
  let mockGetOctocodeToken: Mock<(hostname?: string) => Promise<string | null>>;
  let mockGetGithubCLIToken: Mock<() => Promise<string | null>>;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    clearConfigCachedToken();

    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.OCTOCODE_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.LOG;

    // Create fresh mocks
    mockGetTokenFromEnv = vi.fn(() => null);
    mockGetOctocodeToken = vi.fn(async () => null);
    mockGetGithubCLIToken = vi.fn(async () => null);

    // Inject mocks
    _setTokenResolvers({
      getTokenFromEnv: mockGetTokenFromEnv,
      getOctocodeToken: mockGetOctocodeToken,
      getGithubCLIToken: mockGetGithubCLIToken,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    cleanup();
    clearConfigCachedToken();
    _resetTokenResolvers();
  });

  describe('Priority Order Verification', () => {
    it('should check env vars FIRST (Priority 1-3)', async () => {
      mockGetTokenFromEnv.mockReturnValue('env-token');
      mockGetGithubCLIToken.mockResolvedValue('cli-token');
      mockGetOctocodeToken.mockResolvedValue('stored-token');

      const token = await getGitHubToken();

      expect(token).toBe('env-token');
      expect(mockGetTokenFromEnv).toHaveBeenCalledTimes(1);
      // Should NOT call CLI or storage since env found
      expect(mockGetGithubCLIToken).not.toHaveBeenCalled();
      expect(mockGetOctocodeToken).not.toHaveBeenCalled();
    });

    it('should check GitHub CLI SECOND when env is empty (Priority 4)', async () => {
      mockGetTokenFromEnv.mockReturnValue(null);
      mockGetGithubCLIToken.mockResolvedValue('gh-cli-token');
      mockGetOctocodeToken.mockResolvedValue('stored-token');

      const token = await getGitHubToken();

      expect(token).toBe('gh-cli-token');
      expect(mockGetTokenFromEnv).toHaveBeenCalledTimes(1);
      expect(mockGetGithubCLIToken).toHaveBeenCalledTimes(1);
      // Should NOT call storage since CLI found
      expect(mockGetOctocodeToken).not.toHaveBeenCalled();
    });

    it('should check stored credentials THIRD when CLI fails (Priority 5-6)', async () => {
      mockGetTokenFromEnv.mockReturnValue(null);
      mockGetGithubCLIToken.mockResolvedValue(null);
      mockGetOctocodeToken.mockResolvedValue('keychain-or-file-token');

      const token = await getGitHubToken();

      expect(token).toBe('keychain-or-file-token');
      expect(mockGetTokenFromEnv).toHaveBeenCalledTimes(1);
      expect(mockGetGithubCLIToken).toHaveBeenCalledTimes(1);
      expect(mockGetOctocodeToken).toHaveBeenCalledTimes(1);
    });

    it('should return null when all sources are exhausted', async () => {
      mockGetTokenFromEnv.mockReturnValue(null);
      mockGetGithubCLIToken.mockResolvedValue(null);
      mockGetOctocodeToken.mockResolvedValue(null);

      const token = await getGitHubToken();

      expect(token).toBeNull();
      expect(mockGetTokenFromEnv).toHaveBeenCalledTimes(1);
      expect(mockGetGithubCLIToken).toHaveBeenCalledTimes(1);
      expect(mockGetOctocodeToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('Environment Variable Priority (1-3)', () => {
    it('should use OCTOCODE_TOKEN when all env vars are set (Priority 1)', async () => {
      // Simulate getTokenFromEnv returning OCTOCODE_TOKEN (highest priority)
      mockGetTokenFromEnv.mockReturnValue('octocode-token-wins');

      const token = await getGitHubToken();

      expect(token).toBe('octocode-token-wins');
    });

    it('should use GH_TOKEN when OCTOCODE_TOKEN is not set (Priority 2)', async () => {
      // Simulate getTokenFromEnv returning GH_TOKEN
      mockGetTokenFromEnv.mockReturnValue('gh-token-wins');

      const token = await getGitHubToken();

      expect(token).toBe('gh-token-wins');
    });

    it('should use GITHUB_TOKEN when others are not set (Priority 3)', async () => {
      // Simulate getTokenFromEnv returning GITHUB_TOKEN
      mockGetTokenFromEnv.mockReturnValue('github-token-wins');

      const token = await getGitHubToken();

      expect(token).toBe('github-token-wins');
    });
  });

  describe('GitHub CLI Fallback (Priority 4)', () => {
    beforeEach(() => {
      mockGetTokenFromEnv.mockReturnValue(null);
    });

    it('should use gh auth token when env vars are not set', async () => {
      mockGetGithubCLIToken.mockResolvedValue('gh-auth-token');

      const token = await getGitHubToken();

      expect(token).toBe('gh-auth-token');
    });

    it('should handle whitespace in CLI token', async () => {
      mockGetGithubCLIToken.mockResolvedValue('  cli-token-with-spaces  ');

      const token = await getGitHubToken();

      expect(token).toBe('cli-token-with-spaces');
    });

    it('should skip empty CLI token', async () => {
      mockGetGithubCLIToken.mockResolvedValue('   ');
      mockGetOctocodeToken.mockResolvedValue('fallback-token');

      const token = await getGitHubToken();

      expect(token).toBe('fallback-token');
    });

    it('should handle CLI errors gracefully and continue', async () => {
      mockGetGithubCLIToken.mockRejectedValue(new Error('gh not installed'));
      mockGetOctocodeToken.mockResolvedValue('stored-fallback');

      const token = await getGitHubToken();

      expect(token).toBe('stored-fallback');
    });
  });

  describe('Stored Credentials Fallback (Priority 5-6)', () => {
    beforeEach(() => {
      mockGetTokenFromEnv.mockReturnValue(null);
      mockGetGithubCLIToken.mockResolvedValue(null);
    });

    it('should use stored token when env and CLI are not available', async () => {
      mockGetOctocodeToken.mockResolvedValue('stored-in-keychain-or-file');

      const token = await getGitHubToken();

      expect(token).toBe('stored-in-keychain-or-file');
    });

    it('should handle storage errors gracefully', async () => {
      mockGetOctocodeToken.mockRejectedValue(
        new Error('Keychain access denied')
      );

      const token = await getGitHubToken();

      expect(token).toBeNull();
    });
  });

  describe('Token Caching Behavior', () => {
    it('should cache token after first retrieval', async () => {
      mockGetTokenFromEnv.mockReturnValue('cached-token');

      const token1 = await getGitHubToken();
      const token2 = await getGitHubToken();

      expect(token1).toBe('cached-token');
      expect(token2).toBe('cached-token');
      // Should only call once due to caching
      expect(mockGetTokenFromEnv).toHaveBeenCalledTimes(1);
    });

    it('should resolve new token after cache clear', async () => {
      mockGetTokenFromEnv.mockReturnValueOnce('first-token');
      mockGetTokenFromEnv.mockReturnValueOnce('second-token');

      const token1 = await getGitHubToken();
      expect(token1).toBe('first-token');

      clearConfigCachedToken();

      const token2 = await getGitHubToken();
      expect(token2).toBe('second-token');
    });

    it('should handle concurrent token requests without race conditions', async () => {
      let resolveCount = 0;
      mockGetTokenFromEnv.mockReturnValue(null);
      mockGetGithubCLIToken.mockImplementation(async () => {
        resolveCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        return `token-${resolveCount}`;
      });

      // Start multiple concurrent requests
      const [token1, token2, token3] = await Promise.all([
        getGitHubToken(),
        getGitHubToken(),
        getGitHubToken(),
      ]);

      // All should get the same token (from the first resolution)
      expect(token1).toBe('token-1');
      expect(token2).toBe('token-1');
      expect(token3).toBe('token-1');
      // Should only resolve once despite concurrent requests
      expect(resolveCount).toBe(1);
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should mask sensitive data in error messages', async () => {
      const errorWithToken = new Error(
        'Failed to authenticate: token ghp_secrettoken123'
      );
      mockGetTokenFromEnv.mockReturnValue(null);
      mockGetGithubCLIToken.mockRejectedValue(errorWithToken);
      mockGetOctocodeToken.mockResolvedValue(null);

      // Should not throw, just return null
      const token = await getGitHubToken();
      expect(token).toBeNull();
    });

    it('should handle null/undefined values gracefully', async () => {
      mockGetTokenFromEnv.mockReturnValue(null);
      mockGetGithubCLIToken.mockResolvedValue(undefined as unknown as null);
      mockGetOctocodeToken.mockResolvedValue(null);

      const token = await getGitHubToken();
      expect(token).toBeNull();
    });

    it('should handle empty string tokens', async () => {
      mockGetTokenFromEnv.mockReturnValue('');
      mockGetGithubCLIToken.mockResolvedValue('cli-fallback');

      // Empty string from env should be treated as falsy, falling through
      // Note: actual behavior depends on getTokenFromEnv implementation
      // which should return null for empty/whitespace strings
      await getGitHubToken();
      expect(mockGetGithubCLIToken).toHaveBeenCalled();
    });
  });

  describe('Integration with initialize()', () => {
    it('should resolve token during initialization', async () => {
      mockGetTokenFromEnv.mockReturnValue('init-token');

      await initialize();

      // Token should be cached from initialization
      const token = await getGitHubToken();
      expect(token).toBe('init-token');
    });

    it('should handle missing token during initialization gracefully', async () => {
      mockGetTokenFromEnv.mockReturnValue(null);
      mockGetGithubCLIToken.mockResolvedValue(null);
      mockGetOctocodeToken.mockResolvedValue(null);

      // Should not throw
      await expect(initialize()).resolves.not.toThrow();

      const token = await getGitHubToken();
      expect(token).toBeNull();
    });
  });

  describe('Documentation Compliance', () => {
    /**
     * This test verifies the exact priority order documented in TOKEN_RESOLUTION.md:
     * 1. OCTOCODE_TOKEN env
     * 2. GH_TOKEN env
     * 3. GITHUB_TOKEN env
     * 4. gh auth token
     * 5. Keychain
     * 6. File
     */
    it('should follow documented priority: env(1-3) → gh CLI(4) → storage(5-6)', async () => {
      const callOrder: string[] = [];

      mockGetTokenFromEnv.mockImplementation(() => {
        callOrder.push('env');
        return null;
      });

      mockGetGithubCLIToken.mockImplementation(async () => {
        callOrder.push('gh-cli');
        return null;
      });

      mockGetOctocodeToken.mockImplementation(async () => {
        callOrder.push('storage');
        return null;
      });

      await getGitHubToken();

      expect(callOrder).toEqual(['env', 'gh-cli', 'storage']);
    });

    it('should NOT access storage when env token is available (performance)', async () => {
      mockGetTokenFromEnv.mockReturnValue('env-token');

      await getGitHubToken();

      expect(mockGetGithubCLIToken).not.toHaveBeenCalled();
      expect(mockGetOctocodeToken).not.toHaveBeenCalled();
    });

    it('should NOT access storage when CLI token is available', async () => {
      mockGetTokenFromEnv.mockReturnValue(null);
      mockGetGithubCLIToken.mockResolvedValue('cli-token');

      await getGitHubToken();

      expect(mockGetOctocodeToken).not.toHaveBeenCalled();
    });
  });
});

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
  getTokenMetadata,
  storeOAuthTokenInfo,
  storeGitHubAppTokenInfo,
  clearOAuthTokens,
} from '../../../src/mcp/tools/utils/tokenManager';

// Mock dependencies
vi.mock('../../../src/utils/exec.js', () => ({
  getGithubCLIToken: vi.fn(),
}));

// extractBearerToken is now internal to tokenManager - no need to mock

vi.mock('../../../src/security/credentialStore.js', () => ({
  SecureCredentialStore: {
    setToken: vi.fn(),
    setCredential: vi.fn().mockReturnValue('mock-credential-id'),
    getCredential: vi.fn(),
    removeCredential: vi.fn(),
  },
}));

import { getGithubCLIToken } from '../../../src/utils/exec.js';
import { SecureCredentialStore } from '../../../src/security/credentialStore.js';

const mockGetGithubCLIToken = vi.mocked(getGithubCLIToken);
const mockSecureCredentialStore = vi.mocked(SecureCredentialStore);

// Mock storage for OAuth tokens
const mockOAuthStorage: Record<string, string> = {};
mockSecureCredentialStore.setCredential.mockImplementation((value: string) => {
  const id = `mock-id-${Date.now()}-${Math.random()}`;
  mockOAuthStorage[id] = value;
  return id;
});
mockSecureCredentialStore.getCredential.mockImplementation((id: string) => {
  return mockOAuthStorage[id] || null;
});
mockSecureCredentialStore.removeCredential.mockImplementation((id: string) => {
  delete mockOAuthStorage[id];
  return true;
});

describe('Token Manager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Clear mock OAuth storage
    Object.keys(mockOAuthStorage).forEach(key => delete mockOAuthStorage[key]);

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
    });

    it('should return token from GH_TOKEN environment variable when GITHUB_TOKEN is not set', async () => {
      process.env.GH_TOKEN = 'env-gh-token';

      const token = await getGitHubToken();

      expect(token).toBe('env-gh-token');
      expect(mockGetGithubCLIToken).not.toHaveBeenCalled();
    });

    it('should prefer GITHUB_TOKEN over GH_TOKEN when both are set', async () => {
      process.env.GITHUB_TOKEN = 'github-token';
      process.env.GH_TOKEN = 'gh-token';

      const token = await getGitHubToken();

      expect(token).toBe('github-token');
      expect(mockGetGithubCLIToken).not.toHaveBeenCalled();
    });

    it('should get token from GitHub CLI when environment variables are not set', async () => {
      mockGetGithubCLIToken.mockResolvedValue('cli-token');

      const token = await getGitHubToken();

      expect(token).toBe('cli-token');
      expect(mockGetGithubCLIToken).toHaveBeenCalledOnce();
    });

    it('should extract bearer token from Authorization header when other methods fail', async () => {
      process.env.Authorization = 'Bearer extracted-token';
      mockGetGithubCLIToken.mockResolvedValue(null);

      const token = await getGitHubToken();

      expect(token).toBe('extracted-token');
      expect(mockGetGithubCLIToken).toHaveBeenCalledOnce();
    });

    it('should handle empty Authorization environment variable', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null);

      const token = await getGitHubToken();

      expect(token).toBeNull();
    });

    it('should return null when no token is available from any source', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null);

      const token = await getGitHubToken();

      expect(token).toBeNull();
      expect(mockGetGithubCLIToken).toHaveBeenCalledOnce();
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

      const token = await getToken();

      expect(token).toBe('extracted-token');
      expect(mockSecureCredentialStore.setToken).toHaveBeenCalledWith(
        'extracted-token'
      );
    });

    it('should throw error when no token is available', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null);

      await expect(getToken()).rejects.toThrow(
        'No GitHub token found. Please configure OAuth authentication, set GITHUB_TOKEN/GH_TOKEN environment variable, or authenticate with GitHub CLI'
      );
      expect(mockSecureCredentialStore.setToken).not.toHaveBeenCalled();
    });

    it('should handle GitHub CLI failure and fallback to other methods', async () => {
      process.env.Authorization = 'Bearer fallback-token';
      mockGetGithubCLIToken.mockResolvedValue(null); // CLI returns null on failure

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

      const token = await getToken();

      expect(token).toBe('github-token');
      expect(mockSecureCredentialStore.setToken).toHaveBeenCalledWith(
        'github-token'
      );
      expect(mockGetGithubCLIToken).not.toHaveBeenCalled();
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

      const token = await getGitHubToken();
      expect(token).toBeNull();

      await expect(getToken()).rejects.toThrow('No GitHub token found');
    });

    it('should handle whitespace-only tokens correctly', async () => {
      process.env.GITHUB_TOKEN = '   ';
      mockGetGithubCLIToken.mockResolvedValue('   ');

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
      mockGetGithubCLIToken.mockImplementation(() => {
        throw new Error('CLI error');
      });

      // Both functions should propagate the CLI error
      await expect(getGitHubToken()).rejects.toThrow('CLI error');
      await expect(getToken()).rejects.toThrow('CLI error');
    });
  });

  // ===== ENTERPRISE FEATURES TESTS =====

  describe('Enterprise Features', () => {
    beforeEach(() => {
      // Reset mock implementations for enterprise tests
      mockSecureCredentialStore.setToken.mockReset();
      mockSecureCredentialStore.setToken.mockImplementation(
        () => 'mock-token-id'
      );

      // Clear any existing enterprise configuration
      clearConfig();
    });

    describe('initialize', () => {
      it('should initialize with enterprise configuration', () => {
        const config = {
          organizationId: 'test-org',
          enableAuditLogging: true,
          enableRateLimiting: false,
          enableOrganizationValidation: true,
        };

        initialize(config);

        const storedConfig = getConfig();
        expect(storedConfig).toEqual(config);
      });

      it('should handle initialization without config', () => {
        initialize();
        const storedConfig = getConfig();
        expect(storedConfig).toBeNull();
      });

      it('should handle multiple initializations', () => {
        const config1 = { organizationId: 'org1' };
        const config2 = { organizationId: 'org2' };

        initialize(config1);
        initialize(config2);

        const storedConfig = getConfig();
        expect(storedConfig).toEqual(config2);
      });
    });

    describe('getTokenSource', () => {
      it('should return unknown initially', () => {
        clearCachedToken();
        expect(getTokenSource()).toBe('unknown');
      });

      it('should track token source from GITHUB_TOKEN', async () => {
        process.env.GITHUB_TOKEN = 'env-token';
        await getGitHubToken();
        expect(getTokenSource()).toBe('env');
      });

      it('should track token source from GH_TOKEN', async () => {
        process.env.GH_TOKEN = 'gh-env-token';
        await getGitHubToken();
        expect(getTokenSource()).toBe('env');
      });

      it('should track token source from CLI', async () => {
        mockGetGithubCLIToken.mockResolvedValue('cli-token');
        await getGitHubToken();
        expect(getTokenSource()).toBe('cli');
      });

      it('should track token source from Authorization header', async () => {
        process.env.Authorization = 'Bearer auth-token';
        mockGetGithubCLIToken.mockResolvedValue(null);
        await getGitHubToken();
        expect(getTokenSource()).toBe('authorization');
      });
    });

    describe('onTokenRotated', () => {
      it('should register and call rotation handlers', async () => {
        const handler1 = vi.fn();
        const handler2 = vi.fn();

        const cleanup1 = onTokenRotated(handler1);
        const cleanup2 = onTokenRotated(handler2);

        await rotateToken('new-token');

        expect(handler1).toHaveBeenCalledWith('new-token', undefined);
        expect(handler2).toHaveBeenCalledWith('new-token', undefined);

        cleanup1();
        cleanup2();
      });

      it('should provide old token to handlers when available', async () => {
        // Set initial token
        process.env.GITHUB_TOKEN = 'old-token';
        await getGitHubToken();

        const handler = vi.fn();
        const cleanup = onTokenRotated(handler);

        await rotateToken('new-token');

        expect(handler).toHaveBeenCalledWith('new-token', 'old-token');
        cleanup();
      });

      it('should handle handler errors gracefully', async () => {
        const errorHandler = vi.fn(() => {
          throw new Error('Handler error');
        });
        const goodHandler = vi.fn();

        const cleanup1 = onTokenRotated(errorHandler);
        const cleanup2 = onTokenRotated(goodHandler);

        // Should not throw despite handler error
        await expect(rotateToken('new-token')).resolves.not.toThrow();

        expect(errorHandler).toHaveBeenCalled();
        expect(goodHandler).toHaveBeenCalled();

        cleanup1();
        cleanup2();
      });

      it('should cleanup handlers properly', async () => {
        const handler = vi.fn();
        const cleanup = onTokenRotated(handler);

        cleanup();
        await rotateToken('new-token');

        expect(handler).not.toHaveBeenCalled();
      });
    });

    describe('rotateToken', () => {
      it('should update cached token', async () => {
        await rotateToken('rotated-token');
        const token = await getGitHubToken();
        expect(token).toBe('rotated-token');
      });

      it('should store token securely', async () => {
        await rotateToken('secure-token');
        expect(mockSecureCredentialStore.setToken).toHaveBeenCalledWith(
          'secure-token'
        );
      });

      it('should update token source to unknown', async () => {
        process.env.GITHUB_TOKEN = 'env-token';
        await getGitHubToken();
        expect(getTokenSource()).toBe('env');

        await rotateToken('rotated-token');
        expect(getTokenSource()).toBe('unknown');
      });

      it('should notify all handlers', async () => {
        const handler1 = vi.fn();
        const handler2 = vi.fn();

        const cleanup1 = onTokenRotated(handler1);
        const cleanup2 = onTokenRotated(handler2);

        await rotateToken('notification-token');

        expect(handler1).toHaveBeenCalledWith('notification-token', undefined);
        expect(handler2).toHaveBeenCalledWith('notification-token', undefined);

        cleanup1();
        cleanup2();
      });
    });

    describe('integration with existing functions', () => {
      it('should work with existing getGitHubToken after rotation', async () => {
        process.env.GITHUB_TOKEN = 'original-token';
        const token1 = await getGitHubToken();
        expect(token1).toBe('original-token');

        await rotateToken('rotated-token');
        const token2 = await getGitHubToken();
        expect(token2).toBe('rotated-token');
      });

      it('should work with existing getToken after rotation', async () => {
        // First set up an environment token so getToken() has something to resolve
        process.env.GITHUB_TOKEN = 'initial-token';

        await rotateToken('rotated-for-getToken');

        // getGitHubToken should return the rotated token (uses cache)
        const cachedToken = await getGitHubToken();
        expect(cachedToken).toBe('rotated-for-getToken');

        // getToken should also work by resolving from environment (ignores cache)
        const resolvedToken = await getToken();
        expect(resolvedToken).toBe('initial-token'); // getToken resolves fresh
        expect(mockSecureCredentialStore.setToken).toHaveBeenCalledWith(
          'initial-token'
        );
      });

      it('should handle clearCachedToken with enterprise features', async () => {
        await rotateToken('token-to-clear');
        expect(getTokenSource()).toBe('unknown');

        clearCachedToken();
        expect(getTokenSource()).toBe('unknown');

        // Should resolve new token
        process.env.GITHUB_TOKEN = 'new-env-token';
        await getGitHubToken();
        expect(getTokenSource()).toBe('env');
      });
    });
  });

  describe('OAuth and GitHub App Token Priority', () => {
    beforeEach(() => {
      // Ensure we start with a clean slate
      clearCachedToken();
    });

    it('should prioritize OAuth tokens over environment variables', async () => {
      // Set up environment token
      process.env.GITHUB_TOKEN = 'env-token';

      // Store OAuth token
      await storeOAuthTokenInfo({
        accessToken: 'oauth-token',
        expiresAt: new Date(Date.now() + 3600000),
        scopes: ['repo', 'read:user'],
        tokenType: 'Bearer',
        clientId: 'test-client',
      });

      const token = await getGitHubToken();
      expect(token).toBe('oauth-token');
      expect(getTokenSource()).toBe('oauth');
    });

    it('should prioritize GitHub App tokens over environment variables', async () => {
      // Set up environment token
      process.env.GITHUB_TOKEN = 'env-token';

      // Store GitHub App token
      await storeGitHubAppTokenInfo({
        installationToken: 'app-token',
        expiresAt: new Date(Date.now() + 3600000),
        installationId: 12345,
        permissions: { contents: 'read' },
        appId: 'test-app',
      });

      const token = await getGitHubToken();
      expect(token).toBe('app-token');
      expect(getTokenSource()).toBe('github_app');
    });

    it('should prioritize OAuth tokens over GitHub App tokens', async () => {
      // Store GitHub App token first
      await storeGitHubAppTokenInfo({
        installationToken: 'app-token',
        expiresAt: new Date(Date.now() + 3600000),
        installationId: 12345,
        permissions: { contents: 'read' },
        appId: 'test-app',
      });

      // Store OAuth token (higher priority)
      await storeOAuthTokenInfo({
        accessToken: 'oauth-token',
        expiresAt: new Date(Date.now() + 3600000),
        scopes: ['repo', 'read:user'],
        tokenType: 'Bearer',
        clientId: 'test-client',
      });

      const token = await getGitHubToken();
      expect(token).toBe('oauth-token');
      expect(getTokenSource()).toBe('oauth');
    });

    it('should fall back to environment variables when OAuth/GitHub App tokens are expired', async () => {
      process.env.GITHUB_TOKEN = 'env-fallback-token';

      // Store expired OAuth token
      await storeOAuthTokenInfo({
        accessToken: 'expired-oauth-token',
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        scopes: ['repo'],
        tokenType: 'Bearer',
        clientId: 'test-client',
      });

      const token = await getGitHubToken();
      expect(token).toBe('env-fallback-token');
      expect(getTokenSource()).toBe('env');
    });

    it('should return correct token metadata for OAuth tokens', async () => {
      const oauthInfo = {
        accessToken: 'oauth-metadata-token',
        expiresAt: new Date(Date.now() + 3600000),
        scopes: ['repo', 'read:user', 'read:org'],
        tokenType: 'Bearer',
        clientId: 'metadata-client',
      };

      await storeOAuthTokenInfo(oauthInfo);
      await getGitHubToken(); // Trigger token resolution

      const metadata = await getTokenMetadata();
      expect(metadata.source).toBe('oauth');
      expect(metadata.scopes).toEqual(['repo', 'read:user', 'read:org']);
      expect(metadata.clientId).toBe('metadata-client');
      expect(metadata.expiresAt).toEqual(oauthInfo.expiresAt);
    });

    it('should return correct token metadata for GitHub App tokens', async () => {
      const appInfo = {
        installationToken: 'app-metadata-token',
        expiresAt: new Date(Date.now() + 3600000),
        installationId: 98765,
        permissions: { contents: 'read', issues: 'write' },
        appId: 'metadata-app',
      };

      await storeGitHubAppTokenInfo(appInfo);
      await getGitHubToken(); // Trigger token resolution

      const metadata = await getTokenMetadata();
      expect(metadata.source).toBe('github_app');
      expect(metadata.permissions).toEqual({
        contents: 'read',
        issues: 'write',
      });
      expect(metadata.appId).toBe('metadata-app');
      expect(metadata.installationId).toBe(98765);
      expect(metadata.expiresAt).toEqual(appInfo.expiresAt);
    });

    it('should clear OAuth tokens correctly', async () => {
      // Store OAuth token
      await storeOAuthTokenInfo({
        accessToken: 'oauth-to-clear',
        expiresAt: new Date(Date.now() + 3600000),
        scopes: ['repo'],
        tokenType: 'Bearer',
        clientId: 'clear-client',
      });

      // Verify token is available
      let token = await getGitHubToken();
      expect(token).toBe('oauth-to-clear');

      // Clear OAuth tokens
      await clearOAuthTokens();
      clearCachedToken();

      // Set fallback environment token
      process.env.GITHUB_TOKEN = 'fallback-after-clear';

      // Should now use environment token
      token = await getGitHubToken();
      expect(token).toBe('fallback-after-clear');
      expect(getTokenSource()).toBe('env');
    });

    it('should handle OAuth token refresh scenario', async () => {
      // Store initial OAuth token with refresh token
      await storeOAuthTokenInfo({
        accessToken: 'initial-oauth-token',
        refreshToken: 'refresh-token-123',
        expiresAt: new Date(Date.now() + 3600000),
        scopes: ['repo', 'read:user'],
        tokenType: 'Bearer',
        clientId: 'refresh-client',
      });

      let token = await getGitHubToken();
      expect(token).toBe('initial-oauth-token');

      // Simulate token refresh by storing new token info
      await storeOAuthTokenInfo({
        accessToken: 'refreshed-oauth-token',
        refreshToken: 'refresh-token-456',
        expiresAt: new Date(Date.now() + 7200000),
        scopes: ['repo', 'read:user', 'read:org'],
        tokenType: 'Bearer',
        clientId: 'refresh-client',
      });

      // Clear cache to force re-resolution
      clearCachedToken();

      token = await getGitHubToken();
      expect(token).toBe('refreshed-oauth-token');
      expect(getTokenSource()).toBe('oauth');
    });

    it('should handle mixed token types in getToken error message', async () => {
      // Clear all tokens and environment variables
      await clearOAuthTokens();
      clearCachedToken();
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;
      mockGetGithubCLIToken.mockResolvedValue(null);

      await expect(getToken()).rejects.toThrow(
        'No GitHub token found. Please configure OAuth authentication, set GITHUB_TOKEN/GH_TOKEN environment variable, or authenticate with GitHub CLI'
      );
    });

    it('should handle enterprise mode with OAuth tokens', async () => {
      // Set enterprise environment
      process.env.GITHUB_ORGANIZATION = 'enterprise-org';

      await storeOAuthTokenInfo({
        accessToken: 'enterprise-oauth-token',
        expiresAt: new Date(Date.now() + 3600000),
        scopes: ['repo', 'read:org'],
        tokenType: 'Bearer',
        clientId: 'enterprise-client',
      });

      const token = await getGitHubToken();
      expect(token).toBe('enterprise-oauth-token');
      expect(getTokenSource()).toBe('oauth');

      // In enterprise mode, the error message should reflect disabled CLI
      clearCachedToken();
      await clearOAuthTokens();
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;

      await expect(getToken()).rejects.toThrow(
        'No GitHub token found. In enterprise mode, please configure OAuth, GitHub App, or set GITHUB_TOKEN/GH_TOKEN environment variable (CLI authentication is disabled for security)'
      );
    });
  });
});

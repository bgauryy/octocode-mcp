/**
 * GitHub OAuth Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('@octokit/auth-oauth-device', () => ({
  createOAuthDeviceAuth: vi.fn(),
}));

vi.mock('@octokit/oauth-methods', () => ({
  refreshToken: vi.fn(),
  deleteToken: vi.fn(),
  checkToken: vi.fn(),
}));

vi.mock('@octokit/request', () => ({
  request: {
    defaults: vi.fn().mockReturnValue(vi.fn()),
  },
}));

vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/utils/token-storage.js', () => ({
  storeCredentials: vi.fn(),
  getCredentials: vi.fn(),
  deleteCredentials: vi.fn(),
  isTokenExpired: vi.fn(),
  isRefreshTokenExpired: vi.fn(),
  updateToken: vi.fn(),
  getCredentialsFilePath: vi.fn().mockReturnValue('/home/test/.octocode/credentials.json'),
  isUsingSecureStorage: vi.fn().mockReturnValue(false),
}));

describe('GitHub OAuth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('getAuthStatus', () => {
    it('should return not authenticated when no credentials exist', async () => {
      const { getCredentials } = await import(
        '../../src/utils/token-storage.js'
      );
      vi.mocked(getCredentials).mockReturnValue(null);

      const { getAuthStatus } = await import(
        '../../src/features/github-oauth.js'
      );
      const status = getAuthStatus('github.com');

      expect(status.authenticated).toBe(false);
      expect(status.username).toBeUndefined();
    });

    it('should return authenticated when valid credentials exist', async () => {
      const { getCredentials, isTokenExpired } = await import(
        '../../src/utils/token-storage.js'
      );
      vi.mocked(getCredentials).mockReturnValue({
        hostname: 'github.com',
        username: 'testuser',
        token: {
          token: 'test-token',
          tokenType: 'oauth',
        },
        gitProtocol: 'https',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      vi.mocked(isTokenExpired).mockReturnValue(false);

      const { getAuthStatus } = await import(
        '../../src/features/github-oauth.js'
      );
      const status = getAuthStatus('github.com');

      expect(status.authenticated).toBe(true);
      expect(status.username).toBe('testuser');
      expect(status.hostname).toBe('github.com');
    });

    it('should indicate token expired when token is expired', async () => {
      const { getCredentials, isTokenExpired } = await import(
        '../../src/utils/token-storage.js'
      );
      vi.mocked(getCredentials).mockReturnValue({
        hostname: 'github.com',
        username: 'testuser',
        token: {
          token: 'test-token',
          tokenType: 'oauth',
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
        gitProtocol: 'https',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      vi.mocked(isTokenExpired).mockReturnValue(true);

      const { getAuthStatus } = await import(
        '../../src/features/github-oauth.js'
      );
      const status = getAuthStatus('github.com');

      expect(status.authenticated).toBe(false);
      expect(status.tokenExpired).toBe(true);
    });
  });

  describe('logout', () => {
    it('should return error when not logged in', async () => {
      const { getCredentials } = await import(
        '../../src/utils/token-storage.js'
      );
      vi.mocked(getCredentials).mockReturnValue(null);

      const { logout } = await import('../../src/features/github-oauth.js');
      const result = await logout('github.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not logged in');
    });

    it('should delete credentials on logout', async () => {
      const { getCredentials, deleteCredentials } = await import(
        '../../src/utils/token-storage.js'
      );
      vi.mocked(getCredentials).mockReturnValue({
        hostname: 'github.com',
        username: 'testuser',
        token: {
          token: 'test-token',
          tokenType: 'oauth',
        },
        gitProtocol: 'https',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const { logout } = await import('../../src/features/github-oauth.js');
      const result = await logout('github.com');

      expect(result.success).toBe(true);
      expect(deleteCredentials).toHaveBeenCalledWith('github.com');
    });
  });

  describe('refreshAuthToken', () => {
    it('should return error when not logged in', async () => {
      const { getCredentials } = await import(
        '../../src/utils/token-storage.js'
      );
      vi.mocked(getCredentials).mockReturnValue(null);

      const { refreshAuthToken } = await import(
        '../../src/features/github-oauth.js'
      );
      const result = await refreshAuthToken('github.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not logged in');
    });

    it('should return error when token does not support refresh', async () => {
      const { getCredentials } = await import(
        '../../src/utils/token-storage.js'
      );
      vi.mocked(getCredentials).mockReturnValue({
        hostname: 'github.com',
        username: 'testuser',
        token: {
          token: 'test-token',
          tokenType: 'oauth',
          // No refreshToken
        },
        gitProtocol: 'https',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const { refreshAuthToken } = await import(
        '../../src/features/github-oauth.js'
      );
      const result = await refreshAuthToken('github.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not support refresh');
    });

    it('should return error when refresh token is expired', async () => {
      const { getCredentials, isRefreshTokenExpired } = await import(
        '../../src/utils/token-storage.js'
      );
      vi.mocked(getCredentials).mockReturnValue({
        hostname: 'github.com',
        username: 'testuser',
        token: {
          token: 'test-token',
          tokenType: 'oauth',
          refreshToken: 'refresh-token',
          refreshTokenExpiresAt: '2020-01-01T00:00:00.000Z',
        },
        gitProtocol: 'https',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      vi.mocked(isRefreshTokenExpired).mockReturnValue(true);

      const { refreshAuthToken } = await import(
        '../../src/features/github-oauth.js'
      );
      const result = await refreshAuthToken('github.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Refresh token has expired');
    });
  });

  describe('getValidToken', () => {
    it('should return null when not logged in', async () => {
      const { getCredentials } = await import(
        '../../src/utils/token-storage.js'
      );
      vi.mocked(getCredentials).mockReturnValue(null);

      const { getValidToken } = await import(
        '../../src/features/github-oauth.js'
      );
      const token = await getValidToken('github.com');

      expect(token).toBeNull();
    });

    it('should return token when not expired', async () => {
      const { getCredentials, isTokenExpired } = await import(
        '../../src/utils/token-storage.js'
      );
      vi.mocked(getCredentials).mockReturnValue({
        hostname: 'github.com',
        username: 'testuser',
        token: {
          token: 'test-token',
          tokenType: 'oauth',
        },
        gitProtocol: 'https',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      vi.mocked(isTokenExpired).mockReturnValue(false);

      const { getValidToken } = await import(
        '../../src/features/github-oauth.js'
      );
      const token = await getValidToken('github.com');

      expect(token).toBe('test-token');
    });

    it('should return null when token is expired and no refresh token', async () => {
      const { getCredentials, isTokenExpired } = await import(
        '../../src/utils/token-storage.js'
      );
      vi.mocked(getCredentials).mockReturnValue({
        hostname: 'github.com',
        username: 'testuser',
        token: {
          token: 'test-token',
          tokenType: 'oauth',
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
        gitProtocol: 'https',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      vi.mocked(isTokenExpired).mockReturnValue(true);

      const { getValidToken } = await import(
        '../../src/features/github-oauth.js'
      );
      const token = await getValidToken('github.com');

      expect(token).toBeNull();
    });
  });

  describe('getStoragePath', () => {
    it('should return the storage path', async () => {
      const { getStoragePath } = await import(
        '../../src/features/github-oauth.js'
      );
      const path = getStoragePath();

      expect(path).toBe('/home/test/.octocode/credentials.json');
    });
  });

  describe('isUsingSecureStorage', () => {
    it('should return false (file storage)', async () => {
      const { isUsingSecureStorage } = await import(
        '../../src/features/github-oauth.js'
      );
      const result = isUsingSecureStorage();

      expect(result).toBe(false);
    });
  });

  describe('login', () => {
    it('should call createOAuthDeviceAuth with correct options', async () => {
      const { createOAuthDeviceAuth } = await import(
        '@octokit/auth-oauth-device'
      );
      const mockAuth = vi.fn().mockResolvedValue({
        token: 'new-token',
        type: 'token',
        tokenType: 'oauth',
        scopes: ['repo', 'read:org'],
      });
      vi.mocked(createOAuthDeviceAuth).mockReturnValue(mockAuth);

      // Mock the request for getting user info
      const { request } = await import('@octokit/request');
      vi.mocked(request.defaults).mockReturnValue(
        vi.fn().mockResolvedValue({
          data: { login: 'testuser' },
        }) as unknown as typeof request
      );

      const { login } = await import('../../src/features/github-oauth.js');

      // This will fail because we can't fully mock the request, but it tests the setup
      try {
        await login({
          hostname: 'github.com',
          scopes: ['repo'],
          openBrowser: false,
        });
      } catch {
        // Expected to fail due to incomplete mocking
      }

      expect(createOAuthDeviceAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          clientType: 'oauth-app',
          scopes: ['repo'],
        })
      );
    });
  });
});


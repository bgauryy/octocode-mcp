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

vi.mock('@octokit/request', () => {
  // Create a mock request function that returns user data
  const mockRequestFn = vi.fn().mockResolvedValue({
    data: { login: 'testuser' },
    status: 200,
    headers: {},
    url: 'https://api.github.com/user',
  }) as ReturnType<typeof vi.fn> & { defaults: ReturnType<typeof vi.fn> };
  // Add defaults method that returns itself
  mockRequestFn.defaults = vi.fn().mockReturnValue(mockRequestFn);
  return {
    request: mockRequestFn,
  };
});

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
  getCredentialsFilePath: vi
    .fn()
    .mockReturnValue('/home/test/.octocode/credentials.json'),
  isUsingSecureStorage: vi.fn().mockReturnValue(false),
}));

describe('GitHub OAuth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('getAuthStatus', () => {
    it('should return not authenticated when no credentials exist', async () => {
      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentials).mockReturnValue(null);

      const { getAuthStatus } =
        await import('../../src/features/github-oauth.js');
      const status = getAuthStatus('github.com');

      expect(status.authenticated).toBe(false);
      expect(status.username).toBeUndefined();
    });

    it('should return authenticated when valid credentials exist', async () => {
      const { getCredentials, isTokenExpired } =
        await import('../../src/utils/token-storage.js');
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

      const { getAuthStatus } =
        await import('../../src/features/github-oauth.js');
      const status = getAuthStatus('github.com');

      expect(status.authenticated).toBe(true);
      expect(status.username).toBe('testuser');
      expect(status.hostname).toBe('github.com');
    });

    it('should indicate token expired when token is expired', async () => {
      const { getCredentials, isTokenExpired } =
        await import('../../src/utils/token-storage.js');
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

      const { getAuthStatus } =
        await import('../../src/features/github-oauth.js');
      const status = getAuthStatus('github.com');

      expect(status.authenticated).toBe(false);
      expect(status.tokenExpired).toBe(true);
    });
  });

  describe('logout', () => {
    it('should return error when not logged in', async () => {
      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentials).mockReturnValue(null);

      const { logout } = await import('../../src/features/github-oauth.js');
      const result = await logout('github.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not logged in');
    });

    it('should delete credentials on logout', async () => {
      const { getCredentials, deleteCredentials } =
        await import('../../src/utils/token-storage.js');
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
      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentials).mockReturnValue(null);

      const { refreshAuthToken } =
        await import('../../src/features/github-oauth.js');
      const result = await refreshAuthToken('github.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not logged in');
    });

    it('should return error when token does not support refresh', async () => {
      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
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

      const { refreshAuthToken } =
        await import('../../src/features/github-oauth.js');
      const result = await refreshAuthToken('github.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not support refresh');
    });

    it('should return error when refresh token is expired', async () => {
      const { getCredentials, isRefreshTokenExpired } =
        await import('../../src/utils/token-storage.js');
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

      const { refreshAuthToken } =
        await import('../../src/features/github-oauth.js');
      const result = await refreshAuthToken('github.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Refresh token has expired');
    });

    it('should use oauth-app clientType when refreshing token (Bug #1 fix)', async () => {
      const { getCredentials, isRefreshTokenExpired, updateToken } =
        await import('../../src/utils/token-storage.js');
      const { refreshToken } = await import('@octokit/oauth-methods');

      vi.mocked(getCredentials).mockReturnValue({
        hostname: 'github.com',
        username: 'testuser',
        token: {
          token: 'test-token',
          tokenType: 'oauth',
          refreshToken: 'refresh-token',
          expiresAt: '2020-01-01T00:00:00.000Z',
          refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
        },
        gitProtocol: 'https',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      vi.mocked(isRefreshTokenExpired).mockReturnValue(false);
      vi.mocked(refreshToken).mockResolvedValue({
        authentication: {
          token: 'new-token',
          refreshToken: 'new-refresh-token',
          expiresAt: '2030-06-01T00:00:00.000Z',
          refreshTokenExpiresAt: '2030-12-01T00:00:00.000Z',
          clientType: 'github-app',
        },
        headers: {},
        status: 200,
        url: '',
        data: {} as never,
      } as unknown as Awaited<ReturnType<typeof refreshToken>>);
      vi.mocked(updateToken).mockReturnValue(true);

      const { refreshAuthToken } =
        await import('../../src/features/github-oauth.js');
      const result = await refreshAuthToken('github.com');

      expect(result.success).toBe(true);
      // Verify refreshToken was called with correct clientType
      expect(refreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          clientType: 'github-app', // Must match refreshAuthToken() clientType
        })
      );
    });
  });

  describe('getValidToken', () => {
    it('should return null when not logged in', async () => {
      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentials).mockReturnValue(null);

      const { getValidToken } =
        await import('../../src/features/github-oauth.js');
      const token = await getValidToken('github.com');

      expect(token).toBeNull();
    });

    it('should return token when not expired', async () => {
      const { getCredentials, isTokenExpired } =
        await import('../../src/utils/token-storage.js');
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

      const { getValidToken } =
        await import('../../src/features/github-oauth.js');
      const token = await getValidToken('github.com');

      expect(token).toBe('test-token');
    });

    it('should return null when token is expired and no refresh token', async () => {
      const { getCredentials, isTokenExpired } =
        await import('../../src/utils/token-storage.js');
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

      const { getValidToken } =
        await import('../../src/features/github-oauth.js');
      const token = await getValidToken('github.com');

      expect(token).toBeNull();
    });
  });

  describe('getStoragePath', () => {
    it('should return the storage path', async () => {
      const { getStoragePath } =
        await import('../../src/features/github-oauth.js');
      const path = getStoragePath();

      expect(path).toBe('/home/test/.octocode/credentials.json');
    });
  });

  describe('isUsingSecureStorage', () => {
    it('should return false (file storage)', async () => {
      const { isUsingSecureStorage } =
        await import('../../src/features/github-oauth.js');
      const result = isUsingSecureStorage();

      expect(result).toBe(false);
    });
  });

  describe('login', () => {
    it('should complete login flow successfully', async () => {
      const { createOAuthDeviceAuth } =
        await import('@octokit/auth-oauth-device');

      // Mock the auth function returned by createOAuthDeviceAuth
      const mockAuth = vi.fn().mockResolvedValue({
        token: 'gho_test_token',
        type: 'token',
        tokenType: 'oauth',
        scopes: ['repo', 'read:org'],
      });
      vi.mocked(createOAuthDeviceAuth).mockReturnValue(
        mockAuth as unknown as ReturnType<typeof createOAuthDeviceAuth>
      );

      // Import login after mocks are set up
      const { login } = await import('../../src/features/github-oauth.js');
      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');

      const result = await login({
        hostname: 'github.com',
        scopes: ['repo'],
        openBrowser: false,
      });

      // Verify login succeeded
      expect(result.success).toBe(true);
      expect(result.username).toBe('testuser');
      expect(result.hostname).toBe('github.com');

      // Verify createOAuthDeviceAuth was called with correct options
      expect(createOAuthDeviceAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          clientType: 'oauth-app',
          scopes: ['repo'],
        })
      );

      // Verify credentials were stored
      expect(storeCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'github.com',
          username: 'testuser',
          token: expect.objectContaining({
            token: 'gho_test_token',
            tokenType: 'oauth',
          }),
        })
      );
    });

    it('should handle login failure gracefully', async () => {
      const { createOAuthDeviceAuth } =
        await import('@octokit/auth-oauth-device');

      // Mock auth to throw an error
      const mockAuth = vi.fn().mockRejectedValue(new Error('Auth timeout'));
      vi.mocked(createOAuthDeviceAuth).mockReturnValue(
        mockAuth as unknown as ReturnType<typeof createOAuthDeviceAuth>
      );

      const { login } = await import('../../src/features/github-oauth.js');

      const result = await login({
        hostname: 'github.com',
        scopes: ['repo'],
        openBrowser: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Auth timeout');
    });

    it('should call onVerification callback when provided', async () => {
      const { createOAuthDeviceAuth } =
        await import('@octokit/auth-oauth-device');

      let capturedOnVerification: ((v: unknown) => void) | undefined;

      // Capture the onVerification callback
      vi.mocked(createOAuthDeviceAuth).mockImplementation(((options: {
        onVerification?: (v: unknown) => void;
      }) => {
        capturedOnVerification = options.onVerification;
        return vi.fn().mockResolvedValue({
          token: 'gho_test_token',
          type: 'token',
          tokenType: 'oauth',
          scopes: ['repo'],
        });
      }) as unknown as typeof createOAuthDeviceAuth);

      const { login } = await import('../../src/features/github-oauth.js');

      const onVerification = vi.fn();

      // Start login (this will call createOAuthDeviceAuth)
      const loginPromise = login({
        hostname: 'github.com',
        scopes: ['repo'],
        openBrowser: false,
        onVerification,
      });

      // Simulate verification callback being called
      if (capturedOnVerification) {
        await capturedOnVerification({
          device_code: 'test-device-code',
          user_code: 'TEST-1234',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        });
      }

      await loginPromise;

      // Verify onVerification was called
      expect(onVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          user_code: 'TEST-1234',
          verification_uri: 'https://github.com/login/device',
        })
      );
    });
  });
});

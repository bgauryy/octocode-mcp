/**
 * GitHub OAuth Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies

// Mock node:fs to prevent any real file operations
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  rmSync: vi.fn(),
  statSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
    stat: vi.fn(),
  },
}));

// Mock node:crypto to prevent real encryption
vi.mock('node:crypto', () => ({
  randomBytes: vi.fn().mockReturnValue(Buffer.alloc(32)),
  createCipheriv: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnValue('encrypted'),
    final: vi.fn().mockReturnValue(''),
    getAuthTag: vi.fn().mockReturnValue(Buffer.alloc(16)),
  }),
  createDecipheriv: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnValue('{}'),
    final: vi.fn().mockReturnValue(''),
    setAuthTag: vi.fn(),
  }),
}));
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

// Define ENV_TOKEN_VARS for proper priority order
const ENV_TOKEN_VARS = ['OCTOCODE_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'];

vi.mock('../../src/utils/token-storage.js', () => ({
  storeCredentials: vi
    .fn()
    .mockResolvedValue({ success: true, insecureStorageUsed: false }),
  getCredentials: vi.fn().mockResolvedValue(null),
  getCredentialsSync: vi.fn().mockReturnValue(null),
  deleteCredentials: vi.fn().mockResolvedValue({
    success: true,
    deletedFromKeyring: false,
    deletedFromFile: true,
  }),
  isTokenExpired: vi.fn(),
  isRefreshTokenExpired: vi.fn(),
  updateToken: vi.fn().mockResolvedValue(true),
  getCredentialsFilePath: vi
    .fn()
    .mockReturnValue('/home/test/.octocode/credentials.json'),
  isUsingSecureStorage: vi.fn().mockReturnValue(false),
  // Add hasEnvToken - checks if any env token is available
  hasEnvToken: vi.fn().mockImplementation(() => {
    for (const envVar of ENV_TOKEN_VARS) {
      const token = process.env[envVar];
      if (token && token.trim()) {
        return true;
      }
    }
    return false;
  }),
  // Add getTokenFromEnv - reads from env with priority order
  getTokenFromEnv: vi.fn().mockImplementation(() => {
    for (const envVar of ENV_TOKEN_VARS) {
      const token = process.env[envVar];
      if (token && token.trim()) {
        return token.trim();
      }
    }
    return null;
  }),
  // Add getEnvTokenSource - returns which env var has the token
  getEnvTokenSource: vi.fn().mockImplementation(() => {
    for (const envVar of ENV_TOKEN_VARS) {
      const token = process.env[envVar];
      if (token && token.trim()) {
        return `env:${envVar}`;
      }
    }
    return null;
  }),
  // Add resolveTokenFull - full priority chain resolution
  // Note: This mock needs to call the mocked getCredentials, so we make it a getter
  // that is replaced after module initialization
  resolveTokenFull: vi.fn(),
  // Centralized refresh from octocode-shared (re-exported via token-storage)
  refreshAuthToken: vi.fn(),
  // Token retrieval with auto-refresh from octocode-shared
  getTokenWithRefresh: vi
    .fn()
    .mockResolvedValue({ token: null, source: 'none' }),
}));

vi.mock('../../src/features/gh-auth.js', () => ({
  getGitHubCLIToken: vi.fn().mockReturnValue(null),
  checkGitHubAuth: vi.fn().mockReturnValue({
    installed: false,
    authenticated: false,
  }),
}));

describe('GitHub OAuth', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Set up resolveTokenFull mock implementation that uses other mocked functions
    const tokenStorage = await import('../../src/utils/token-storage.js');
    vi.mocked(tokenStorage.resolveTokenFull).mockImplementation(
      async (options?: {
        hostname?: string;
        clientId?: string;
        getGhCliToken?: (
          hostname?: string
        ) => string | null | Promise<string | null>;
      }) => {
        // Priority 1-3: Environment variables
        for (const envVar of ENV_TOKEN_VARS) {
          const token = process.env[envVar];
          if (token && token.trim()) {
            return {
              token: token.trim(),
              source: `env:${envVar}` as const,
              wasRefreshed: false,
            };
          }
        }

        // Priority 4-5: Octocode storage
        const credentials = await tokenStorage.getCredentials(
          options?.hostname ?? 'github.com'
        );
        if (credentials?.token?.token) {
          const isExpired = tokenStorage.isTokenExpired(credentials);
          if (!isExpired) {
            return {
              token: credentials.token.token,
              source: 'keychain' as const,
              wasRefreshed: false,
              username: credentials.username,
            };
          }
        }

        // Priority 6: gh CLI fallback
        if (options?.getGhCliToken) {
          const ghToken = await Promise.resolve(
            options.getGhCliToken(options?.hostname)
          );
          if (ghToken?.trim()) {
            return {
              token: ghToken.trim(),
              source: 'gh-cli' as const,
              wasRefreshed: false,
            };
          }
        }
        return null;
      }
    );

    // Set up refreshAuthToken mock - delegates to shared implementation
    vi.mocked(tokenStorage.refreshAuthToken).mockImplementation(
      async (hostname?: string, _clientId?: string) => {
        const credentials = await tokenStorage.getCredentials(
          hostname ?? 'github.com'
        );
        if (!credentials) {
          return {
            success: false,
            error: `Not logged in to ${hostname ?? 'github.com'}`,
          };
        }
        if (!credentials.token.refreshToken) {
          return {
            success: false,
            error:
              'Token does not support refresh (OAuth App tokens do not expire)',
          };
        }
        if (tokenStorage.isRefreshTokenExpired(credentials)) {
          return {
            success: false,
            error: 'Refresh token has expired. Please login again.',
          };
        }
        // Mock successful refresh - would be handled by @octokit/oauth-methods
        return {
          success: true,
          username: credentials.username,
          hostname: hostname ?? 'github.com',
        };
      }
    );

    // Set up getTokenWithRefresh mock - returns token with auto-refresh
    vi.mocked(tokenStorage.getTokenWithRefresh).mockImplementation(
      async (hostname?: string, _clientId?: string) => {
        const credentials = await tokenStorage.getCredentials(
          hostname ?? 'github.com'
        );
        if (!credentials?.token?.token) {
          return { token: null, source: 'none' as const };
        }
        const isExpired = tokenStorage.isTokenExpired(credentials);
        if (isExpired) {
          // Token expired - try refresh
          if (credentials.token.refreshToken) {
            const refreshResult = await tokenStorage.refreshAuthToken(
              hostname ?? 'github.com'
            );
            if (refreshResult.success) {
              // Return refreshed token
              return {
                token: credentials.token.token,
                source: 'refreshed' as const,
                username: credentials.username,
              };
            }
          }
          return { token: null, source: 'none' as const };
        }
        return {
          token: credentials.token.token,
          source: 'stored' as const,
          username: credentials.username,
        };
      }
    );
  });

  describe('getTokenType', () => {
    it('should return env:OCTOCODE_TOKEN for env source with OCTOCODE_TOKEN', async () => {
      const { getTokenType } =
        await import('../../src/features/github-oauth.js');
      expect(getTokenType('env', 'env:OCTOCODE_TOKEN')).toBe(
        'env:OCTOCODE_TOKEN'
      );
    });

    it('should return env:GH_TOKEN for env source with GH_TOKEN', async () => {
      const { getTokenType } =
        await import('../../src/features/github-oauth.js');
      expect(getTokenType('env', 'env:GH_TOKEN')).toBe('env:GH_TOKEN');
    });

    it('should return env:GITHUB_TOKEN for env source with GITHUB_TOKEN', async () => {
      const { getTokenType } =
        await import('../../src/features/github-oauth.js');
      expect(getTokenType('env', 'env:GITHUB_TOKEN')).toBe('env:GITHUB_TOKEN');
    });

    it('should return env:GITHUB_TOKEN for env source with no envSource specified', async () => {
      const { getTokenType } =
        await import('../../src/features/github-oauth.js');
      expect(getTokenType('env')).toBe('env:GITHUB_TOKEN');
    });

    it('should return gh-cli for gh-cli source', async () => {
      const { getTokenType } =
        await import('../../src/features/github-oauth.js');
      expect(getTokenType('gh-cli')).toBe('gh-cli');
    });

    it('should return octocode-storage for octocode source', async () => {
      const { getTokenType } =
        await import('../../src/features/github-oauth.js');
      expect(getTokenType('octocode')).toBe('octocode-storage');
    });

    it('should return none for none source', async () => {
      const { getTokenType } =
        await import('../../src/features/github-oauth.js');
      expect(getTokenType('none')).toBe('none');
    });
  });

  describe('getAuthStatus', () => {
    it('should return not authenticated when no credentials exist', async () => {
      const { getCredentialsSync } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentialsSync).mockReturnValue(null);

      const { getAuthStatus } =
        await import('../../src/features/github-oauth.js');
      const status = getAuthStatus('github.com');

      expect(status.authenticated).toBe(false);
      expect(status.username).toBeUndefined();
    });

    it('should return authenticated when valid credentials exist', async () => {
      const { getCredentialsSync, isTokenExpired } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentialsSync).mockReturnValue({
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
      const { getCredentialsSync, isTokenExpired } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentialsSync).mockReturnValue({
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

    it('should return authenticated when env token exists (priority 1)', async () => {
      const { hasEnvToken, getEnvTokenSource } =
        await import('../../src/utils/token-storage.js');

      // Mock env token as available
      vi.mocked(hasEnvToken).mockReturnValue(true);
      vi.mocked(getEnvTokenSource).mockReturnValue('env:GH_TOKEN');

      const { getAuthStatus } =
        await import('../../src/features/github-oauth.js');
      const status = getAuthStatus('github.com');

      expect(status.authenticated).toBe(true);
      expect(status.tokenSource).toBe('env');
      expect(status.envTokenSource).toBe('env:GH_TOKEN');
      // Env tokens don't provide username
      expect(status.username).toBeUndefined();
    });

    it('should prioritize env token over gh CLI and stored credentials', async () => {
      const { hasEnvToken, getEnvTokenSource, getCredentialsSync } =
        await import('../../src/utils/token-storage.js');
      const { checkGitHubAuth } = await import('../../src/features/gh-auth.js');

      // All sources available
      vi.mocked(hasEnvToken).mockReturnValue(true);
      vi.mocked(getEnvTokenSource).mockReturnValue('env:OCTOCODE_TOKEN');
      vi.mocked(getCredentialsSync).mockReturnValue({
        hostname: 'github.com',
        username: 'stored-user',
        token: { token: 'stored-token', tokenType: 'oauth' },
        gitProtocol: 'https',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      vi.mocked(checkGitHubAuth).mockReturnValue({
        installed: true,
        authenticated: true,
        username: 'gh-cli-user',
      });

      const { getAuthStatus } =
        await import('../../src/features/github-oauth.js');
      const status = getAuthStatus('github.com');

      // Env token should take priority
      expect(status.tokenSource).toBe('env');
      expect(status.envTokenSource).toBe('env:OCTOCODE_TOKEN');
    });

    it('should fall back to gh CLI when no env token', async () => {
      const { hasEnvToken, getCredentialsSync } =
        await import('../../src/utils/token-storage.js');
      const { checkGitHubAuth } = await import('../../src/features/gh-auth.js');

      vi.mocked(hasEnvToken).mockReturnValue(false);
      vi.mocked(getCredentialsSync).mockReturnValue(null);
      vi.mocked(checkGitHubAuth).mockReturnValue({
        installed: true,
        authenticated: true,
        username: 'gh-user',
      });

      const { getAuthStatus } =
        await import('../../src/features/github-oauth.js');
      const status = getAuthStatus('github.com');

      expect(status.authenticated).toBe(true);
      expect(status.tokenSource).toBe('gh-cli');
      expect(status.username).toBe('gh-user');
    });
  });

  describe('logout', () => {
    it('should return error when not logged in', async () => {
      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentials).mockResolvedValue(null);

      const { logout } = await import('../../src/features/github-oauth.js');
      const result = await logout('github.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not logged in');
    });

    it('should delete credentials on logout', async () => {
      const { getCredentials, deleteCredentials } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentials).mockResolvedValue({
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
      vi.mocked(getCredentials).mockResolvedValue(null);

      const { refreshAuthToken } =
        await import('../../src/features/github-oauth.js');
      const result = await refreshAuthToken('github.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not logged in');
    });

    it('should return error when token does not support refresh', async () => {
      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentials).mockResolvedValue({
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
      vi.mocked(getCredentials).mockResolvedValue({
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

    it('should delegate to shared refreshAuthToken and return success', async () => {
      // This test verifies CLI correctly delegates to octocode-shared's refreshAuthToken
      // The actual @octokit/oauth-methods call with github-app clientType is tested
      // in octocode-shared/tests/credentials/storage.test.ts
      const { getCredentials, isRefreshTokenExpired, refreshAuthToken } =
        await import('../../src/utils/token-storage.js');

      vi.mocked(getCredentials).mockResolvedValue({
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
      // The shared refreshAuthToken mock returns success when conditions are met
      vi.mocked(refreshAuthToken).mockResolvedValue({
        success: true,
        username: 'testuser',
        hostname: 'github.com',
      });

      const { refreshAuthToken: cliRefreshAuthToken } =
        await import('../../src/features/github-oauth.js');
      const result = await cliRefreshAuthToken('github.com');

      expect(result.success).toBe(true);
      expect(result.username).toBe('testuser');
      expect(result.hostname).toBe('github.com');
      // Verify shared refreshAuthToken was called (centralized logic)
      expect(refreshAuthToken).toHaveBeenCalled();
    });
  });

  describe('getValidToken', () => {
    it('should return null when not logged in', async () => {
      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentials).mockResolvedValue(null);

      const { getValidToken } =
        await import('../../src/features/github-oauth.js');
      const token = await getValidToken('github.com');

      expect(token).toBeNull();
    });

    it('should return token when not expired', async () => {
      const { getCredentials, isTokenExpired } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentials).mockResolvedValue({
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
      vi.mocked(getCredentials).mockResolvedValue({
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

      // Re-mock storeCredentials to return proper StoreResult
      vi.mocked(storeCredentials).mockResolvedValue({
        success: true,
        insecureStorageUsed: false,
      });

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
      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');

      // Re-mock storeCredentials
      vi.mocked(storeCredentials).mockResolvedValue({
        success: true,
        insecureStorageUsed: false,
      });

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

  describe('getToken', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset env before each test - clear ALL token env vars
      process.env = { ...originalEnv };
      delete process.env.OCTOCODE_TOKEN;
      delete process.env.GH_TOKEN;
      delete process.env.GITHUB_TOKEN;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return env var token in auto mode (priority: OCTOCODE_TOKEN > GH_TOKEN > GITHUB_TOKEN)', async () => {
      // Set environment variable (GITHUB_TOKEN is third in priority)
      process.env.GITHUB_TOKEN = 'env-token-123';

      const { getToken } = await import('../../src/features/github-oauth.js');
      const result = await getToken('github.com', 'auto');

      expect(result.token).toBe('env-token-123');
      expect(result.source).toBe('env');
    });

    it('should return gh CLI token when no env vars are set (auto mode)', async () => {
      const { getGitHubCLIToken } =
        await import('../../src/features/gh-auth.js');
      vi.mocked(getGitHubCLIToken).mockReturnValue('gh-cli-token-456');

      const { getToken } = await import('../../src/features/github-oauth.js');
      const result = await getToken('github.com', 'auto');

      expect(result.token).toBe('gh-cli-token-456');
      expect(result.source).toBe('gh-cli');
    });

    it('should return octocode token as final fallback (auto mode)', async () => {
      const { getGitHubCLIToken } =
        await import('../../src/features/gh-auth.js');
      vi.mocked(getGitHubCLIToken).mockReturnValue(null);

      const { getCredentials, isTokenExpired } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentials).mockResolvedValue({
        hostname: 'github.com',
        username: 'octocode-user',
        token: {
          token: 'octocode-token-789',
          tokenType: 'oauth',
        },
        gitProtocol: 'https',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      vi.mocked(isTokenExpired).mockReturnValue(false);

      const { getToken } = await import('../../src/features/github-oauth.js');
      const result = await getToken('github.com', 'auto');

      expect(result.token).toBe('octocode-token-789');
      expect(result.source).toBe('octocode');
    });

    it('should return none when no token sources available (auto mode)', async () => {
      const { getGitHubCLIToken } =
        await import('../../src/features/gh-auth.js');
      vi.mocked(getGitHubCLIToken).mockReturnValue(null);

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentials).mockResolvedValue(null);

      const { getToken } = await import('../../src/features/github-oauth.js');
      const result = await getToken('github.com', 'auto');

      expect(result.token).toBeNull();
      expect(result.source).toBe('none');
    });

    it('should only check octocode storage when source is octocode', async () => {
      // Set env var that should be ignored
      process.env.GITHUB_TOKEN = 'env-token-ignored';

      const { getGitHubCLIToken } =
        await import('../../src/features/gh-auth.js');
      vi.mocked(getGitHubCLIToken).mockReturnValue('gh-token-ignored');

      const { getCredentials, isTokenExpired } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentials).mockResolvedValue({
        hostname: 'github.com',
        username: 'octocode-user',
        token: {
          token: 'octocode-only-token',
          tokenType: 'oauth',
        },
        gitProtocol: 'https',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      vi.mocked(isTokenExpired).mockReturnValue(false);

      const { getToken } = await import('../../src/features/github-oauth.js');
      const result = await getToken('github.com', 'octocode');

      expect(result.token).toBe('octocode-only-token');
      expect(result.source).toBe('octocode');
    });

    it('should only check gh CLI when source is gh', async () => {
      // Set env var that should be ignored
      process.env.GITHUB_TOKEN = 'env-token-ignored';

      const { getGitHubCLIToken, checkGitHubAuth } =
        await import('../../src/features/gh-auth.js');
      vi.mocked(getGitHubCLIToken).mockReturnValue('gh-only-token');
      vi.mocked(checkGitHubAuth).mockReturnValue({
        installed: true,
        authenticated: true,
        username: 'gh-user',
      });

      const { getToken } = await import('../../src/features/github-oauth.js');
      const result = await getToken('github.com', 'gh');

      expect(result.token).toBe('gh-only-token');
      expect(result.source).toBe('gh-cli');
    });

    it('should prioritize GITHUB_TOKEN over gh CLI in auto mode', async () => {
      // Both env var and gh CLI available
      process.env.GITHUB_TOKEN = 'env-wins';

      const { getGitHubCLIToken } =
        await import('../../src/features/gh-auth.js');
      vi.mocked(getGitHubCLIToken).mockReturnValue('gh-loses');

      const { getToken } = await import('../../src/features/github-oauth.js');
      const result = await getToken('github.com', 'auto');

      // Env should win
      expect(result.token).toBe('env-wins');
      expect(result.source).toBe('env');
    });

    it('should prioritize octocode over gh CLI in auto mode', async () => {
      // Both gh CLI and octocode available, no env var
      // New priority: octocode storage wins over gh CLI
      const { getGitHubCLIToken, checkGitHubAuth } =
        await import('../../src/features/gh-auth.js');
      vi.mocked(getGitHubCLIToken).mockReturnValue('gh-loses');
      vi.mocked(checkGitHubAuth).mockReturnValue({
        installed: true,
        authenticated: true,
        username: 'gh-user',
      });

      const { getCredentials, isTokenExpired } =
        await import('../../src/utils/token-storage.js');
      vi.mocked(getCredentials).mockResolvedValue({
        hostname: 'github.com',
        username: 'octocode-user',
        token: {
          token: 'octocode-wins',
          tokenType: 'oauth',
        },
        gitProtocol: 'https',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      vi.mocked(isTokenExpired).mockReturnValue(false);

      const { getToken } = await import('../../src/features/github-oauth.js');
      const result = await getToken('github.com', 'auto');

      // octocode storage should win over gh CLI
      expect(result.token).toBe('octocode-wins');
      expect(result.source).toBe('octocode');
    });
  });
});

/**
 * Token Storage Tests for octocode-shared
 *
 * Basic tests for credential storage functionality.
 * More comprehensive tests are in octocode-cli which imports from this package.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

// Mock keychain to be unavailable - prevents real keychain access during tests
vi.mock('../../src/credentials/keychain.js', () => ({
  isKeychainAvailable: vi.fn().mockReturnValue(false),
  setPassword: vi.fn(),
  getPassword: vi.fn(),
  deletePassword: vi.fn(),
  findCredentials: vi.fn().mockReturnValue([]),
}));

// Mock @octokit/oauth-methods for token refresh tests
vi.mock('@octokit/oauth-methods', () => ({
  refreshToken: vi.fn(),
}));

// Mock @octokit/request
vi.mock('@octokit/request', () => ({
  request: {
    defaults: vi.fn().mockReturnValue(vi.fn()),
  },
}));

// Mock fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

// Mock crypto module
vi.mock('node:crypto', () => ({
  randomBytes: vi.fn(),
  createCipheriv: vi.fn(),
  createDecipheriv: vi.fn(),
}));

// Helper to create a valid test credential object
function createTestCredentials(overrides = {}) {
  return {
    hostname: 'github.com',
    username: 'testuser',
    token: {
      token: 'test-token',
      tokenType: 'oauth' as const,
    },
    gitProtocol: 'https' as const,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createMockCipher() {
  return {
    update: vi.fn().mockReturnValue('encrypted'),
    final: vi.fn().mockReturnValue(''),
    getAuthTag: vi.fn().mockReturnValue(Buffer.from('authtag1234567')),
  };
}

describe('Token Storage', () => {
  const mockKey = Buffer.alloc(32, 'a');
  const mockIv = Buffer.alloc(16, 'b');

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Setup crypto mocks
    vi.mocked(crypto.randomBytes).mockReturnValue(mockIv as unknown as void);

    // Ensure keychain is disabled
    const { _setSecureStorageAvailable, _resetSecureStorageState } =
      await import('../../src/credentials/storage.js');
    _resetSecureStorageState();
    _setSecureStorageAvailable(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('isSecureStorageAvailable', () => {
    it('should return false when keychain is unavailable', async () => {
      const { isSecureStorageAvailable, _setSecureStorageAvailable } =
        await import('../../src/credentials/storage.js');

      _setSecureStorageAvailable(false);
      expect(isSecureStorageAvailable()).toBe(false);
    });

    it('should return true when keychain is available', async () => {
      const { isSecureStorageAvailable, _setSecureStorageAvailable } =
        await import('../../src/credentials/storage.js');

      _setSecureStorageAvailable(true);
      expect(isSecureStorageAvailable()).toBe(true);
    });
  });

  describe('storeCredentials', () => {
    it('should write encrypted credentials to file when keychain unavailable', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey.toString('hex'));

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { storeCredentials } =
        await import('../../src/credentials/storage.js');

      const result = await storeCredentials(createTestCredentials());

      expect(result.success).toBe(true);
      expect(result.insecureStorageUsed).toBe(true);
    });

    it('should create .octocode directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey.toString('hex'));

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { storeCredentials } =
        await import('../../src/credentials/storage.js');

      await storeCredentials(createTestCredentials());

      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('getCredentials', () => {
    it('should return null when credentials file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentials } =
        await import('../../src/credentials/storage.js');
      const result = await getCredentials('github.com');

      expect(result).toBeNull();
    });

    it('should return credentials when they exist in file', async () => {
      const storedCreds = createTestCredentials();
      const store = { version: 1, credentials: { 'github.com': storedCreds } };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { getCredentials } =
        await import('../../src/credentials/storage.js');
      const result = await getCredentials('github.com');

      expect(result).toEqual(storedCreds);
    });
  });

  describe('getToken', () => {
    it('should return token string when credentials exist', async () => {
      const storedCreds = createTestCredentials();
      const store = { version: 1, credentials: { 'github.com': storedCreds } };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { getToken } = await import('../../src/credentials/storage.js');
      const result = await getToken('github.com');

      expect(result).toBe('test-token');
    });

    it('should return null when credentials do not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getToken } = await import('../../src/credentials/storage.js');
      const result = await getToken('github.com');

      expect(result).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for non-expiring tokens', async () => {
      const { isTokenExpired } =
        await import('../../src/credentials/storage.js');

      const credentials = createTestCredentials();
      expect(isTokenExpired(credentials)).toBe(false);
    });

    it('should return true for expired tokens', async () => {
      const { isTokenExpired } =
        await import('../../src/credentials/storage.js');

      const credentials = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
      });

      expect(isTokenExpired(credentials)).toBe(true);
    });

    it('should return false for tokens expiring more than 5 minutes from now', async () => {
      const { isTokenExpired } =
        await import('../../src/credentials/storage.js');

      const futureDate = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      const credentials = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          expiresAt: futureDate.toISOString(),
        },
      });

      expect(isTokenExpired(credentials)).toBe(false);
    });

    it('should return true for tokens expiring in less than 5 minutes', async () => {
      const { isTokenExpired } =
        await import('../../src/credentials/storage.js');

      const nearFuture = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes from now
      const credentials = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          expiresAt: nearFuture.toISOString(),
        },
      });

      expect(isTokenExpired(credentials)).toBe(true);
    });

    it('should return true for invalid date strings', async () => {
      const { isTokenExpired } =
        await import('../../src/credentials/storage.js');

      const credentials = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          expiresAt: 'invalid-date',
        },
      });

      expect(isTokenExpired(credentials)).toBe(true);
    });
  });

  describe('isRefreshTokenExpired', () => {
    it('should return false when no refresh token expiry', async () => {
      const { isRefreshTokenExpired } =
        await import('../../src/credentials/storage.js');

      const credentials = createTestCredentials();
      expect(isRefreshTokenExpired(credentials)).toBe(false);
    });

    it('should return true for expired refresh token', async () => {
      const { isRefreshTokenExpired } =
        await import('../../src/credentials/storage.js');

      const credentials = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          refreshToken: 'refresh-token',
          refreshTokenExpiresAt: '2020-01-01T00:00:00.000Z',
        },
      });

      expect(isRefreshTokenExpired(credentials)).toBe(true);
    });

    it('should return false for valid refresh token', async () => {
      const { isRefreshTokenExpired } =
        await import('../../src/credentials/storage.js');

      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day from now
      const credentials = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          refreshToken: 'refresh-token',
          refreshTokenExpiresAt: futureDate.toISOString(),
        },
      });

      expect(isRefreshTokenExpired(credentials)).toBe(false);
    });

    it('should return true for invalid refresh token date strings', async () => {
      const { isRefreshTokenExpired } =
        await import('../../src/credentials/storage.js');

      const credentials = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          refreshToken: 'refresh-token',
          refreshTokenExpiresAt: 'invalid-date',
        },
      });

      expect(isRefreshTokenExpired(credentials)).toBe(true);
    });
  });

  describe('TimeoutError', () => {
    it('should export TimeoutError class', async () => {
      const { TimeoutError } = await import('../../src/credentials/storage.js');

      expect(TimeoutError).toBeDefined();
      const error = new TimeoutError('test timeout');
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('test timeout');
    });
  });

  describe('constants', () => {
    it('should export storage path constants', async () => {
      const { OCTOCODE_DIR, CREDENTIALS_FILE, KEY_FILE } =
        await import('../../src/credentials/storage.js');

      expect(OCTOCODE_DIR).toContain('.octocode');
      expect(CREDENTIALS_FILE).toContain('credentials.json');
      expect(KEY_FILE).toContain('.key');
    });
  });

  describe('getTokenFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.OCTOCODE_TOKEN;
      delete process.env.GH_TOKEN;
      delete process.env.GITHUB_TOKEN;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return OCTOCODE_TOKEN when set', async () => {
      process.env.OCTOCODE_TOKEN = 'octocode-test-token';

      const { getTokenFromEnv } =
        await import('../../src/credentials/storage.js');
      expect(getTokenFromEnv()).toBe('octocode-test-token');
    });

    it('should return GH_TOKEN when OCTOCODE_TOKEN is not set', async () => {
      process.env.GH_TOKEN = 'gh-test-token';

      const { getTokenFromEnv } =
        await import('../../src/credentials/storage.js');
      expect(getTokenFromEnv()).toBe('gh-test-token');
    });

    it('should return GITHUB_TOKEN when others are not set', async () => {
      process.env.GITHUB_TOKEN = 'github-test-token';

      const { getTokenFromEnv } =
        await import('../../src/credentials/storage.js');
      expect(getTokenFromEnv()).toBe('github-test-token');
    });

    it('should prioritize OCTOCODE_TOKEN over GH_TOKEN', async () => {
      process.env.OCTOCODE_TOKEN = 'octocode-priority';
      process.env.GH_TOKEN = 'gh-lower-priority';

      const { getTokenFromEnv } =
        await import('../../src/credentials/storage.js');
      expect(getTokenFromEnv()).toBe('octocode-priority');
    });

    it('should prioritize OCTOCODE_TOKEN over GITHUB_TOKEN', async () => {
      process.env.OCTOCODE_TOKEN = 'octocode-priority';
      process.env.GITHUB_TOKEN = 'github-lower-priority';

      const { getTokenFromEnv } =
        await import('../../src/credentials/storage.js');
      expect(getTokenFromEnv()).toBe('octocode-priority');
    });

    it('should prioritize GH_TOKEN over GITHUB_TOKEN', async () => {
      process.env.GH_TOKEN = 'gh-priority';
      process.env.GITHUB_TOKEN = 'github-lower-priority';

      const { getTokenFromEnv } =
        await import('../../src/credentials/storage.js');
      expect(getTokenFromEnv()).toBe('gh-priority');
    });

    it('should return null when no env vars are set', async () => {
      const { getTokenFromEnv } =
        await import('../../src/credentials/storage.js');
      expect(getTokenFromEnv()).toBeNull();
    });

    it('should trim whitespace from token values', async () => {
      process.env.OCTOCODE_TOKEN = '  trimmed-token  ';

      const { getTokenFromEnv } =
        await import('../../src/credentials/storage.js');
      expect(getTokenFromEnv()).toBe('trimmed-token');
    });

    it('should skip empty or whitespace-only tokens', async () => {
      process.env.OCTOCODE_TOKEN = '   ';
      process.env.GH_TOKEN = 'fallback-token';

      const { getTokenFromEnv } =
        await import('../../src/credentials/storage.js');
      expect(getTokenFromEnv()).toBe('fallback-token');
    });
  });

  describe('getEnvTokenSource', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.OCTOCODE_TOKEN;
      delete process.env.GH_TOKEN;
      delete process.env.GITHUB_TOKEN;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return env:OCTOCODE_TOKEN when set', async () => {
      process.env.OCTOCODE_TOKEN = 'test-token';

      const { getEnvTokenSource } =
        await import('../../src/credentials/storage.js');
      expect(getEnvTokenSource()).toBe('env:OCTOCODE_TOKEN');
    });

    it('should return env:GH_TOKEN when OCTOCODE_TOKEN is not set', async () => {
      process.env.GH_TOKEN = 'test-token';

      const { getEnvTokenSource } =
        await import('../../src/credentials/storage.js');
      expect(getEnvTokenSource()).toBe('env:GH_TOKEN');
    });

    it('should return env:GITHUB_TOKEN when others are not set', async () => {
      process.env.GITHUB_TOKEN = 'test-token';

      const { getEnvTokenSource } =
        await import('../../src/credentials/storage.js');
      expect(getEnvTokenSource()).toBe('env:GITHUB_TOKEN');
    });

    it('should return null when no env vars are set', async () => {
      const { getEnvTokenSource } =
        await import('../../src/credentials/storage.js');
      expect(getEnvTokenSource()).toBeNull();
    });
  });

  describe('hasEnvToken', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.OCTOCODE_TOKEN;
      delete process.env.GH_TOKEN;
      delete process.env.GITHUB_TOKEN;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return true when OCTOCODE_TOKEN is set', async () => {
      process.env.OCTOCODE_TOKEN = 'test-token';

      const { hasEnvToken } = await import('../../src/credentials/storage.js');
      expect(hasEnvToken()).toBe(true);
    });

    it('should return true when GH_TOKEN is set', async () => {
      process.env.GH_TOKEN = 'test-token';

      const { hasEnvToken } = await import('../../src/credentials/storage.js');
      expect(hasEnvToken()).toBe(true);
    });

    it('should return true when GITHUB_TOKEN is set', async () => {
      process.env.GITHUB_TOKEN = 'test-token';

      const { hasEnvToken } = await import('../../src/credentials/storage.js');
      expect(hasEnvToken()).toBe(true);
    });

    it('should return false when no env vars are set', async () => {
      const { hasEnvToken } = await import('../../src/credentials/storage.js');
      expect(hasEnvToken()).toBe(false);
    });
  });

  describe('resolveToken', () => {
    const originalEnv = process.env;

    beforeEach(async () => {
      process.env = { ...originalEnv };
      delete process.env.OCTOCODE_TOKEN;
      delete process.env.GH_TOKEN;
      delete process.env.GITHUB_TOKEN;

      // Reset storage state
      const { _resetSecureStorageState, _setSecureStorageAvailable } =
        await import('../../src/credentials/storage.js');
      _resetSecureStorageState();
      _setSecureStorageAvailable(false);
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    describe('Priority 1-3: Environment Variables', () => {
      it('should return OCTOCODE_TOKEN with source env:OCTOCODE_TOKEN', async () => {
        process.env.OCTOCODE_TOKEN = 'env-octocode-token';

        const { resolveToken } =
          await import('../../src/credentials/storage.js');
        const result = await resolveToken();

        expect(result).toEqual({
          token: 'env-octocode-token',
          source: 'env:OCTOCODE_TOKEN',
        });
      });

      it('should return GH_TOKEN with source env:GH_TOKEN', async () => {
        process.env.GH_TOKEN = 'env-gh-token';

        const { resolveToken } =
          await import('../../src/credentials/storage.js');
        const result = await resolveToken();

        expect(result).toEqual({
          token: 'env-gh-token',
          source: 'env:GH_TOKEN',
        });
      });

      it('should return GITHUB_TOKEN with source env:GITHUB_TOKEN', async () => {
        process.env.GITHUB_TOKEN = 'env-github-token';

        const { resolveToken } =
          await import('../../src/credentials/storage.js');
        const result = await resolveToken();

        expect(result).toEqual({
          token: 'env-github-token',
          source: 'env:GITHUB_TOKEN',
        });
      });

      it('should prioritize OCTOCODE_TOKEN over all other env vars', async () => {
        process.env.OCTOCODE_TOKEN = 'octocode-wins';
        process.env.GH_TOKEN = 'gh-loses';
        process.env.GITHUB_TOKEN = 'github-loses';

        const { resolveToken } =
          await import('../../src/credentials/storage.js');
        const result = await resolveToken();

        expect(result?.token).toBe('octocode-wins');
        expect(result?.source).toBe('env:OCTOCODE_TOKEN');
      });

      it('should prioritize GH_TOKEN over GITHUB_TOKEN', async () => {
        process.env.GH_TOKEN = 'gh-wins';
        process.env.GITHUB_TOKEN = 'github-loses';

        const { resolveToken } =
          await import('../../src/credentials/storage.js');
        const result = await resolveToken();

        expect(result?.token).toBe('gh-wins');
        expect(result?.source).toBe('env:GH_TOKEN');
      });
    });

    describe('Priority 4-5: Stored Credentials (Keychain/File)', () => {
      it('should fall back to stored credentials when no env vars', async () => {
        const storedCreds = createTestCredentials();
        const store = {
          version: 1,
          credentials: { 'github.com': storedCreds },
        };

        vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return true;
          if (String(path).includes('credentials.json')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return mockKey.toString('hex');
          return 'iv:authtag:encrypted';
        });

        const mockDecipher = {
          update: vi.fn().mockReturnValue(JSON.stringify(store)),
          final: vi.fn().mockReturnValue(''),
          setAuthTag: vi.fn(),
        };
        vi.mocked(crypto.createDecipheriv).mockReturnValue(
          mockDecipher as unknown as crypto.DecipherGCM
        );

        const { resolveToken } =
          await import('../../src/credentials/storage.js');
        const result = await resolveToken();

        expect(result).toEqual({
          token: 'test-token',
          source: 'file', // Because keychain is unavailable
        });
      });

      it('should return keychain source when secure storage available', async () => {
        const storedCreds = createTestCredentials();
        const store = {
          version: 1,
          credentials: { 'github.com': storedCreds },
        };

        vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return true;
          if (String(path).includes('credentials.json')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return mockKey.toString('hex');
          return 'iv:authtag:encrypted';
        });

        const mockDecipher = {
          update: vi.fn().mockReturnValue(JSON.stringify(store)),
          final: vi.fn().mockReturnValue(''),
          setAuthTag: vi.fn(),
        };
        vi.mocked(crypto.createDecipheriv).mockReturnValue(
          mockDecipher as unknown as crypto.DecipherGCM
        );

        const { resolveToken, _setSecureStorageAvailable } =
          await import('../../src/credentials/storage.js');

        // Simulate keychain being available but empty
        // The token comes from file storage, but source shows keychain
        // if secure storage is available (as that's the preferred source)
        _setSecureStorageAvailable(true);
        const result = await resolveToken();

        expect(result?.token).toBe('test-token');
        expect(result?.source).toBe('keychain');
      });

      it('should return null when no token found anywhere', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const { resolveToken } =
          await import('../../src/credentials/storage.js');
        const result = await resolveToken();

        expect(result).toBeNull();
      });
    });

    describe('Environment Variables Skip Storage', () => {
      it('should NOT check storage when env var token is available', async () => {
        process.env.GITHUB_TOKEN = 'fast-env-token';

        const { resolveToken } =
          await import('../../src/credentials/storage.js');
        const result = await resolveToken();

        // Storage functions should not be called
        expect(fs.existsSync).not.toHaveBeenCalled();
        expect(fs.readFileSync).not.toHaveBeenCalled();
        expect(result?.token).toBe('fast-env-token');
      });
    });

    describe('Custom Hostname', () => {
      it('should use custom hostname for storage lookup', async () => {
        const storedCreds = createTestCredentials({
          hostname: 'github.mycompany.com',
        });
        const store = {
          version: 1,
          credentials: { 'github.mycompany.com': storedCreds },
        };

        vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return true;
          if (String(path).includes('credentials.json')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return mockKey.toString('hex');
          return 'iv:authtag:encrypted';
        });

        const mockDecipher = {
          update: vi.fn().mockReturnValue(JSON.stringify(store)),
          final: vi.fn().mockReturnValue(''),
          setAuthTag: vi.fn(),
        };
        vi.mocked(crypto.createDecipheriv).mockReturnValue(
          mockDecipher as unknown as crypto.DecipherGCM
        );

        const { resolveToken } =
          await import('../../src/credentials/storage.js');

        // Should return null for default github.com
        const defaultResult = await resolveToken('github.com');
        expect(defaultResult).toBeNull();

        // Should return token for custom hostname
        const customResult = await resolveToken('github.mycompany.com');
        expect(customResult?.token).toBe('test-token');
      });
    });

    describe('Expired Token Handling', () => {
      it('should return null for expired stored token', async () => {
        const storedCreds = createTestCredentials({
          token: {
            token: 'expired-token',
            tokenType: 'oauth' as const,
            expiresAt: '2020-01-01T00:00:00.000Z',
          },
        });
        const store = {
          version: 1,
          credentials: { 'github.com': storedCreds },
        };

        vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return true;
          if (String(path).includes('credentials.json')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return mockKey.toString('hex');
          return 'iv:authtag:encrypted';
        });

        const mockDecipher = {
          update: vi.fn().mockReturnValue(JSON.stringify(store)),
          final: vi.fn().mockReturnValue(''),
          setAuthTag: vi.fn(),
        };
        vi.mocked(crypto.createDecipheriv).mockReturnValue(
          mockDecipher as unknown as crypto.DecipherGCM
        );

        const { resolveToken } =
          await import('../../src/credentials/storage.js');
        const result = await resolveToken();

        expect(result).toBeNull();
      });
    });
  });

  describe('getTokenSync', () => {
    it('should return token string when credentials exist', async () => {
      const storedCreds = createTestCredentials();
      const store = { version: 1, credentials: { 'github.com': storedCreds } };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { getTokenSync } = await import('../../src/credentials/storage.js');
      const result = getTokenSync('github.com');

      expect(result).toBe('test-token');
    });

    it('should return null when credentials do not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getTokenSync } = await import('../../src/credentials/storage.js');
      const result = getTokenSync('github.com');

      expect(result).toBeNull();
    });

    it('should return null when token is expired', async () => {
      const storedCreds = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
      });
      const store = { version: 1, credentials: { 'github.com': storedCreds } };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { getTokenSync } = await import('../../src/credentials/storage.js');
      const result = getTokenSync('github.com');

      expect(result).toBeNull();
    });

    it('should return null when credentials exist but token is missing', async () => {
      const storedCreds = {
        ...createTestCredentials(),
        token: undefined,
      };
      const store = { version: 1, credentials: { 'github.com': storedCreds } };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { getTokenSync } = await import('../../src/credentials/storage.js');
      const result = getTokenSync('github.com');

      expect(result).toBeNull();
    });
  });

  describe('getToken', () => {
    it('should return null when token is expired', async () => {
      const storedCreds = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
      });
      const store = { version: 1, credentials: { 'github.com': storedCreds } };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { getToken } = await import('../../src/credentials/storage.js');
      const result = await getToken('github.com');

      expect(result).toBeNull();
    });
  });

  describe('refreshAuthToken', () => {
    it('should return error when not logged in', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { refreshAuthToken } =
        await import('../../src/credentials/storage.js');
      const result = await refreshAuthToken('github.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not logged in');
    });

    it('should return error when token has no refresh token', async () => {
      const storedCreds = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          // No refreshToken
        },
      });
      const store = { version: 1, credentials: { 'github.com': storedCreds } };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { refreshAuthToken } =
        await import('../../src/credentials/storage.js');
      const result = await refreshAuthToken('github.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not support refresh');
    });

    it('should return error when refresh token is expired', async () => {
      const storedCreds = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          refreshToken: 'expired-refresh-token',
          refreshTokenExpiresAt: '2020-01-01T00:00:00.000Z',
        },
      });
      const store = { version: 1, credentials: { 'github.com': storedCreds } };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { refreshAuthToken } =
        await import('../../src/credentials/storage.js');
      const result = await refreshAuthToken('github.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Refresh token has expired');
    });
  });

  describe('getTokenWithRefresh', () => {
    it('should return token when not expired', async () => {
      const storedCreds = createTestCredentials({
        token: {
          token: 'valid-token',
          tokenType: 'oauth' as const,
          // No expiry = never expires
        },
      });
      const store = { version: 1, credentials: { 'github.com': storedCreds } };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { getTokenWithRefresh } =
        await import('../../src/credentials/storage.js');
      const result = await getTokenWithRefresh('github.com');

      expect(result.token).toBe('valid-token');
      expect(result.source).toBe('stored');
      expect(result.username).toBe('testuser');
    });

    it('should return null with error when expired and no refresh token', async () => {
      const storedCreds = createTestCredentials({
        token: {
          token: 'expired-token',
          tokenType: 'oauth' as const,
          expiresAt: '2020-01-01T00:00:00.000Z',
          // No refreshToken
        },
      });
      const store = { version: 1, credentials: { 'github.com': storedCreds } };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { getTokenWithRefresh } =
        await import('../../src/credentials/storage.js');
      const result = await getTokenWithRefresh('github.com');

      expect(result.token).toBeNull();
      expect(result.source).toBe('none');
      expect(result.refreshError).toContain('no refresh token');
    });

    it('should return null when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getTokenWithRefresh } =
        await import('../../src/credentials/storage.js');
      const result = await getTokenWithRefresh('github.com');

      expect(result.token).toBeNull();
      expect(result.source).toBe('none');
    });
  });

  describe('resolveTokenWithRefresh', () => {
    const originalEnv = process.env;

    beforeEach(async () => {
      process.env = { ...originalEnv };
      delete process.env.OCTOCODE_TOKEN;
      delete process.env.GH_TOKEN;
      delete process.env.GITHUB_TOKEN;

      const { _resetSecureStorageState, _setSecureStorageAvailable } =
        await import('../../src/credentials/storage.js');
      _resetSecureStorageState();
      _setSecureStorageAvailable(false);
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return env token without refresh attempt', async () => {
      process.env.GITHUB_TOKEN = 'env-token';

      const { resolveTokenWithRefresh } =
        await import('../../src/credentials/storage.js');
      const result = await resolveTokenWithRefresh();

      expect(result?.token).toBe('env-token');
      expect(result?.source).toBe('env:GITHUB_TOKEN');
      expect(result?.wasRefreshed).toBe(false);
    });

    it('should return stored token with wasRefreshed=false when valid', async () => {
      const storedCreds = createTestCredentials({
        token: {
          token: 'stored-token',
          tokenType: 'oauth' as const,
        },
      });
      const store = { version: 1, credentials: { 'github.com': storedCreds } };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { resolveTokenWithRefresh } =
        await import('../../src/credentials/storage.js');
      const result = await resolveTokenWithRefresh();

      expect(result?.token).toBe('stored-token');
      expect(result?.wasRefreshed).toBe(false);
      expect(result?.username).toBe('testuser');
    });

    it('should return null when no token found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { resolveTokenWithRefresh } =
        await import('../../src/credentials/storage.js');
      const result = await resolveTokenWithRefresh();

      expect(result).toBeNull();
    });

    it('should return refresh error when token expired and no refresh token', async () => {
      const storedCreds = createTestCredentials({
        token: {
          token: 'expired-token',
          tokenType: 'oauth' as const,
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
      });
      const store = { version: 1, credentials: { 'github.com': storedCreds } };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { resolveTokenWithRefresh } =
        await import('../../src/credentials/storage.js');
      const result = await resolveTokenWithRefresh();

      expect(result?.token).toBe('');
      expect(result?.source).toBeNull();
      expect(result?.refreshError).toContain('no refresh token');
    });
  });

  describe('resolveTokenFull', () => {
    const originalEnv = process.env;

    beforeEach(async () => {
      process.env = { ...originalEnv };
      delete process.env.OCTOCODE_TOKEN;
      delete process.env.GH_TOKEN;
      delete process.env.GITHUB_TOKEN;

      const { _resetSecureStorageState, _setSecureStorageAvailable } =
        await import('../../src/credentials/storage.js');
      _resetSecureStorageState();
      _setSecureStorageAvailable(false);
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    describe('Priority 1-3: Environment Variables', () => {
      it('should return OCTOCODE_TOKEN with highest priority', async () => {
        process.env.OCTOCODE_TOKEN = 'octocode-env-token';
        process.env.GH_TOKEN = 'gh-env-token';
        process.env.GITHUB_TOKEN = 'github-env-token';

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull();

        expect(result?.token).toBe('octocode-env-token');
        expect(result?.source).toBe('env:OCTOCODE_TOKEN');
        expect(result?.wasRefreshed).toBe(false);
      });

      it('should return GH_TOKEN when OCTOCODE_TOKEN not set', async () => {
        process.env.GH_TOKEN = 'gh-env-token';
        process.env.GITHUB_TOKEN = 'github-env-token';

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull();

        expect(result?.token).toBe('gh-env-token');
        expect(result?.source).toBe('env:GH_TOKEN');
      });

      it('should return GITHUB_TOKEN when others not set', async () => {
        process.env.GITHUB_TOKEN = 'github-env-token';

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull();

        expect(result?.token).toBe('github-env-token');
        expect(result?.source).toBe('env:GITHUB_TOKEN');
      });

      it('should skip storage check when env token available', async () => {
        process.env.GITHUB_TOKEN = 'fast-env-token';

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull();

        // Storage should not be accessed
        expect(fs.existsSync).not.toHaveBeenCalled();
        expect(result?.token).toBe('fast-env-token');
      });
    });

    describe('Priority 4-5: Stored Credentials with Refresh', () => {
      it('should return stored token when env vars not set', async () => {
        const storedCreds = createTestCredentials({
          token: {
            token: 'stored-token',
            tokenType: 'oauth' as const,
          },
        });
        const store = {
          version: 1,
          credentials: { 'github.com': storedCreds },
        };

        vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return true;
          if (String(path).includes('credentials.json')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return mockKey.toString('hex');
          return 'iv:authtag:encrypted';
        });

        const mockDecipher = {
          update: vi.fn().mockReturnValue(JSON.stringify(store)),
          final: vi.fn().mockReturnValue(''),
          setAuthTag: vi.fn(),
        };
        vi.mocked(crypto.createDecipheriv).mockReturnValue(
          mockDecipher as unknown as crypto.DecipherGCM
        );

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull();

        expect(result?.token).toBe('stored-token');
        expect(result?.source).toBe('file');
        expect(result?.username).toBe('testuser');
      });

      it('should return keychain source when secure storage available', async () => {
        const storedCreds = createTestCredentials();
        const store = {
          version: 1,
          credentials: { 'github.com': storedCreds },
        };

        vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return true;
          if (String(path).includes('credentials.json')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return mockKey.toString('hex');
          return 'iv:authtag:encrypted';
        });

        const mockDecipher = {
          update: vi.fn().mockReturnValue(JSON.stringify(store)),
          final: vi.fn().mockReturnValue(''),
          setAuthTag: vi.fn(),
        };
        vi.mocked(crypto.createDecipheriv).mockReturnValue(
          mockDecipher as unknown as crypto.DecipherGCM
        );

        const { resolveTokenFull, _setSecureStorageAvailable } =
          await import('../../src/credentials/storage.js');

        _setSecureStorageAvailable(true);
        const result = await resolveTokenFull();

        expect(result?.token).toBe('test-token');
        expect(result?.source).toBe('keychain');
      });
    });

    describe('Priority 6: gh CLI Fallback', () => {
      it('should call getGhCliToken when no env or stored token', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const mockGetGhCliToken = vi.fn().mockReturnValue('gh-cli-token');

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull({
          getGhCliToken: mockGetGhCliToken,
        });

        expect(mockGetGhCliToken).toHaveBeenCalledWith('github.com');
        expect(result?.token).toBe('gh-cli-token');
        expect(result?.source).toBe('gh-cli');
      });

      it('should pass custom hostname to getGhCliToken', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const mockGetGhCliToken = vi.fn().mockReturnValue('enterprise-token');

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull({
          hostname: 'github.mycompany.com',
          getGhCliToken: mockGetGhCliToken,
        });

        expect(mockGetGhCliToken).toHaveBeenCalledWith('github.mycompany.com');
        expect(result?.token).toBe('enterprise-token');
      });

      it('should handle async getGhCliToken callback', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const mockGetGhCliToken = vi
          .fn()
          .mockResolvedValue('async-gh-cli-token');

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull({
          getGhCliToken: mockGetGhCliToken,
        });

        expect(result?.token).toBe('async-gh-cli-token');
        expect(result?.source).toBe('gh-cli');
      });

      it('should trim whitespace from gh CLI token', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const mockGetGhCliToken = vi
          .fn()
          .mockReturnValue('  gh-token-with-whitespace  ');

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull({
          getGhCliToken: mockGetGhCliToken,
        });

        expect(result?.token).toBe('gh-token-with-whitespace');
      });

      it('should skip gh CLI when it returns null', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const mockGetGhCliToken = vi.fn().mockReturnValue(null);

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull({
          getGhCliToken: mockGetGhCliToken,
        });

        expect(result).toBeNull();
      });

      it('should skip gh CLI when it returns empty string', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const mockGetGhCliToken = vi.fn().mockReturnValue('   ');

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull({
          getGhCliToken: mockGetGhCliToken,
        });

        expect(result).toBeNull();
      });

      it('should handle gh CLI errors gracefully', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const mockGetGhCliToken = vi
          .fn()
          .mockRejectedValue(new Error('gh CLI not installed'));

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull({
          getGhCliToken: mockGetGhCliToken,
        });

        expect(result).toBeNull();
      });

      it('should NOT call getGhCliToken when env token available', async () => {
        process.env.GITHUB_TOKEN = 'env-token';

        const mockGetGhCliToken = vi.fn().mockReturnValue('gh-cli-token');

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull({
          getGhCliToken: mockGetGhCliToken,
        });

        expect(mockGetGhCliToken).not.toHaveBeenCalled();
        expect(result?.token).toBe('env-token');
      });

      it('should NOT call getGhCliToken when stored token available', async () => {
        const storedCreds = createTestCredentials();
        const store = {
          version: 1,
          credentials: { 'github.com': storedCreds },
        };

        vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return true;
          if (String(path).includes('credentials.json')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return mockKey.toString('hex');
          return 'iv:authtag:encrypted';
        });

        const mockDecipher = {
          update: vi.fn().mockReturnValue(JSON.stringify(store)),
          final: vi.fn().mockReturnValue(''),
          setAuthTag: vi.fn(),
        };
        vi.mocked(crypto.createDecipheriv).mockReturnValue(
          mockDecipher as unknown as crypto.DecipherGCM
        );

        const mockGetGhCliToken = vi.fn().mockReturnValue('gh-cli-token');

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull({
          getGhCliToken: mockGetGhCliToken,
        });

        expect(mockGetGhCliToken).not.toHaveBeenCalled();
        expect(result?.token).toBe('test-token');
      });

      it('should include refresh error when falling back to gh CLI', async () => {
        const storedCreds = createTestCredentials({
          token: {
            token: 'expired-token',
            tokenType: 'oauth' as const,
            expiresAt: '2020-01-01T00:00:00.000Z',
          },
        });
        const store = {
          version: 1,
          credentials: { 'github.com': storedCreds },
        };

        vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return true;
          if (String(path).includes('credentials.json')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return mockKey.toString('hex');
          return 'iv:authtag:encrypted';
        });

        const mockDecipher = {
          update: vi.fn().mockReturnValue(JSON.stringify(store)),
          final: vi.fn().mockReturnValue(''),
          setAuthTag: vi.fn(),
        };
        vi.mocked(crypto.createDecipheriv).mockReturnValue(
          mockDecipher as unknown as crypto.DecipherGCM
        );

        const mockGetGhCliToken = vi.fn().mockReturnValue('gh-cli-fallback');

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull({
          getGhCliToken: mockGetGhCliToken,
        });

        expect(result?.token).toBe('gh-cli-fallback');
        expect(result?.source).toBe('gh-cli');
        expect(result?.refreshError).toContain('no refresh token');
      });
    });

    describe('No Token Found', () => {
      it('should return null when all sources exhausted', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull();

        expect(result).toBeNull();
      });

      it('should return refresh error when token expired and no gh CLI', async () => {
        const storedCreds = createTestCredentials({
          token: {
            token: 'expired-token',
            tokenType: 'oauth' as const,
            expiresAt: '2020-01-01T00:00:00.000Z',
          },
        });
        const store = {
          version: 1,
          credentials: { 'github.com': storedCreds },
        };

        vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return true;
          if (String(path).includes('credentials.json')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return mockKey.toString('hex');
          return 'iv:authtag:encrypted';
        });

        const mockDecipher = {
          update: vi.fn().mockReturnValue(JSON.stringify(store)),
          final: vi.fn().mockReturnValue(''),
          setAuthTag: vi.fn(),
        };
        vi.mocked(crypto.createDecipheriv).mockReturnValue(
          mockDecipher as unknown as crypto.DecipherGCM
        );

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull();

        expect(result?.token).toBe('');
        expect(result?.source).toBeNull();
        expect(result?.refreshError).toContain('no refresh token');
      });
    });

    describe('Custom Options', () => {
      it('should use default hostname when not specified', async () => {
        process.env.GITHUB_TOKEN = 'env-token';

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');
        const result = await resolveTokenFull({});

        expect(result?.token).toBe('env-token');
      });

      it('should use custom hostname for storage lookup', async () => {
        const storedCreds = createTestCredentials({
          hostname: 'github.enterprise.com',
        });
        const store = {
          version: 1,
          credentials: { 'github.enterprise.com': storedCreds },
        };

        vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return true;
          if (String(path).includes('credentials.json')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return mockKey.toString('hex');
          return 'iv:authtag:encrypted';
        });

        const mockDecipher = {
          update: vi.fn().mockReturnValue(JSON.stringify(store)),
          final: vi.fn().mockReturnValue(''),
          setAuthTag: vi.fn(),
        };
        vi.mocked(crypto.createDecipheriv).mockReturnValue(
          mockDecipher as unknown as crypto.DecipherGCM
        );

        const { resolveTokenFull } =
          await import('../../src/credentials/storage.js');

        // Default hostname should not find the enterprise token
        const defaultResult = await resolveTokenFull();
        expect(defaultResult).toBeNull();

        // Custom hostname should find it
        const customResult = await resolveTokenFull({
          hostname: 'github.enterprise.com',
        });
        expect(customResult?.token).toBe('test-token');
      });
    });
  });

  describe('Credentials Cache', () => {
    it('should cache credentials after first fetch', async () => {
      const credentials = createTestCredentials();
      const store = {
        version: 1,
        credentials: { 'github.com': credentials },
      };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { getCredentials, _getCacheStats, _resetCredentialsCache } =
        await import('../../src/credentials/storage.js');

      // Reset cache first
      _resetCredentialsCache();

      // First call - should fetch from storage
      const result1 = await getCredentials('github.com');
      expect(result1?.token.token).toBe('test-token');

      // Check cache has entry
      const stats1 = _getCacheStats();
      expect(stats1.size).toBe(1);
      expect(stats1.entries[0].hostname).toBe('github.com');
      expect(stats1.entries[0].valid).toBe(true);

      // Second call - should use cache (decipher not called again)
      vi.mocked(crypto.createDecipheriv).mockClear();
      const result2 = await getCredentials('github.com');
      expect(result2?.token.token).toBe('test-token');

      // Decipher should not be called for cached read
      // (Note: this depends on implementation - cache prevents file read)
    });

    it('should bypass cache when option is set', async () => {
      const credentials = createTestCredentials();
      const store = {
        version: 1,
        credentials: { 'github.com': credentials },
      };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { getCredentials, _resetCredentialsCache } =
        await import('../../src/credentials/storage.js');

      // Reset cache first
      _resetCredentialsCache();

      // First call - populates cache
      await getCredentials('github.com');

      // Clear mock to track new calls
      vi.mocked(crypto.createDecipheriv).mockClear();
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      // Bypass cache - should fetch from storage again
      const result = await getCredentials('github.com', { bypassCache: true });
      expect(result?.token.token).toBe('test-token');

      // Decipher should be called for bypassed read
      expect(crypto.createDecipheriv).toHaveBeenCalled();
    });

    it('should invalidate cache on storeCredentials', async () => {
      const credentials = createTestCredentials();
      const store = {
        version: 1,
        credentials: { 'github.com': credentials },
      };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const {
        getCredentials,
        storeCredentials,
        _getCacheStats,
        _resetCredentialsCache,
      } = await import('../../src/credentials/storage.js');

      // Reset cache first
      _resetCredentialsCache();

      // Populate cache
      await getCredentials('github.com');
      expect(_getCacheStats().size).toBe(1);

      // Store new credentials - should invalidate cache
      await storeCredentials(credentials);

      // Cache should be empty for this hostname (invalidated)
      const stats = _getCacheStats();
      expect(
        stats.entries.find(e => e.hostname === 'github.com')
      ).toBeUndefined();
    });

    it('should invalidate cache on deleteCredentials', async () => {
      const credentials = createTestCredentials();
      const store = {
        version: 1,
        credentials: { 'github.com': credentials },
      };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const {
        getCredentials,
        deleteCredentials,
        _getCacheStats,
        _resetCredentialsCache,
      } = await import('../../src/credentials/storage.js');

      // Reset cache first
      _resetCredentialsCache();

      // Populate cache
      await getCredentials('github.com');
      expect(_getCacheStats().size).toBe(1);

      // Delete credentials - should invalidate cache
      await deleteCredentials('github.com');

      // Cache should be empty for this hostname
      const stats = _getCacheStats();
      expect(
        stats.entries.find(e => e.hostname === 'github.com')
      ).toBeUndefined();
    });

    it('should invalidate all cache entries with invalidateCredentialsCache()', async () => {
      const credentials1 = createTestCredentials({ hostname: 'github.com' });
      const credentials2 = createTestCredentials({
        hostname: 'github.enterprise.com',
      });
      const store = {
        version: 1,
        credentials: {
          'github.com': credentials1,
          'github.enterprise.com': credentials2,
        },
      };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const {
        getCredentials,
        invalidateCredentialsCache,
        _getCacheStats,
        _resetCredentialsCache,
      } = await import('../../src/credentials/storage.js');

      // Reset cache first
      _resetCredentialsCache();

      // Populate cache with both hosts
      await getCredentials('github.com');
      await getCredentials('github.enterprise.com');
      expect(_getCacheStats().size).toBe(2);

      // Invalidate all
      invalidateCredentialsCache();

      // Cache should be empty
      expect(_getCacheStats().size).toBe(0);
    });

    it('should invalidate specific hostname with invalidateCredentialsCache(hostname)', async () => {
      const credentials1 = createTestCredentials({ hostname: 'github.com' });
      const credentials2 = createTestCredentials({
        hostname: 'github.enterprise.com',
      });
      const store = {
        version: 1,
        credentials: {
          'github.com': credentials1,
          'github.enterprise.com': credentials2,
        },
      };

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockReturnValue(JSON.stringify(store)),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const {
        getCredentials,
        invalidateCredentialsCache,
        _getCacheStats,
        _resetCredentialsCache,
      } = await import('../../src/credentials/storage.js');

      // Reset cache first
      _resetCredentialsCache();

      // Populate cache with both hosts
      await getCredentials('github.com');
      await getCredentials('github.enterprise.com');
      expect(_getCacheStats().size).toBe(2);

      // Invalidate only github.com
      invalidateCredentialsCache('github.com');

      // Only enterprise should remain
      const stats = _getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.entries[0].hostname).toBe('github.enterprise.com');
    });
  });
});

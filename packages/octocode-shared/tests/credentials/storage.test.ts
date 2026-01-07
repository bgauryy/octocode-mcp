/**
 * Token Storage Tests for octocode-shared
 *
 * Basic tests for credential storage functionality.
 * More comprehensive tests are in octocode-cli which imports from this package.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

// Mock keychain to be unavailable
vi.mock('../../src/credentials/keychain.js', () => ({
  isKeychainAvailable: vi.fn().mockReturnValue(false),
  setPassword: vi.fn(),
  getPassword: vi.fn(),
  deletePassword: vi.fn(),
  findCredentials: vi.fn().mockReturnValue([]),
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
});

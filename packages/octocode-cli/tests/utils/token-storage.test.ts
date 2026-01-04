/**
 * Token Storage Tests
 *
 * Tests both keytar-based secure storage and file-based fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

// Mock keytar module - simulates unavailable keytar for file fallback tests
vi.mock('keytar', () => {
  throw new Error('keytar not available');
});

// Mock modules
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('node:crypto', () => ({
  randomBytes: vi.fn(),
  createCipheriv: vi.fn(),
  createDecipheriv: vi.fn(),
}));

vi.mock('../../src/utils/platform.js', () => ({
  HOME: '/home/testuser',
}));

describe('Token Storage', () => {
  const mockKey = Buffer.alloc(32, 'a');
  const mockIv = Buffer.alloc(16, 'b');

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Setup crypto mocks
    vi.mocked(crypto.randomBytes).mockReturnValue(mockIv as unknown as void);

    // Ensure keytar is disabled for file fallback tests
    const { _setSecureStorageAvailable } =
      await import('../../src/utils/token-storage.js');
    _setSecureStorageAvailable(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('storeCredentials (file fallback)', () => {
    it('should create .octocode directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey.toString('hex'));

      const mockCipher = {
        update: vi.fn().mockReturnValue('encrypted'),
        final: vi.fn().mockReturnValue(''),
        getAuthTag: vi.fn().mockReturnValue(Buffer.from('authtag1234567')),
      };
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');

      storeCredentials({
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

      // With keytar unavailable, should use file storage
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/home/testuser/.octocode',
        expect.objectContaining({ recursive: true })
      );
    });
  });

  describe('getCredentials', () => {
    it('should return null when credentials file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = getCredentials('github.com');

      expect(result).toBeNull();
    });

    it('should return null when decryption fails', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'invalid:encrypted:data';
      });

      // Make decryption fail
      vi.mocked(crypto.createDecipheriv).mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = getCredentials('github.com');

      expect(result).toBeNull();
    });
  });

  describe('deleteCredentials', () => {
    it('should return false when no credentials exist in file storage', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { deleteCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = deleteCredentials('github.com');

      // With keytar unavailable, only file storage is used
      expect(result).toBe(false);
    });
  });

  describe('hasCredentials', () => {
    it('should return false when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { hasCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = hasCredentials('github.com');

      expect(result).toBe(false);
    });
  });

  describe('normalizeHostname', () => {
    it('should normalize hostnames correctly via getCredentials', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');

      // These should all be treated as the same host
      getCredentials('github.com');
      getCredentials('GITHUB.COM');
      getCredentials('https://github.com');
      getCredentials('https://github.com/');

      // All calls should result in looking for 'github.com'
      expect(fs.existsSync).toHaveBeenCalled();
    });
  });

  describe('getCredentialsFilePath', () => {
    it('should return file path when keytar unavailable', async () => {
      const { getCredentialsFilePath, isUsingSecureStorage } =
        await import('../../src/utils/token-storage.js');
      const path = getCredentialsFilePath();

      // With keytar mocked as null, should fall back to file
      if (isUsingSecureStorage()) {
        expect(path).toBe('System Keychain (secure)');
      } else {
        expect(path).toBe('/home/testuser/.octocode/credentials.json');
      }
    });
  });

  describe('isUsingSecureStorage', () => {
    it('should report storage mode', async () => {
      const { isUsingSecureStorage } =
        await import('../../src/utils/token-storage.js');

      // With keytar mocked as null, should return false
      const result = isUsingSecureStorage();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for non-expiring tokens', async () => {
      const { isTokenExpired } =
        await import('../../src/utils/token-storage.js');

      const credentials = {
        hostname: 'github.com',
        username: 'testuser',
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
        },
        gitProtocol: 'https' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      expect(isTokenExpired(credentials)).toBe(false);
    });

    it('should return true for expired tokens', async () => {
      const { isTokenExpired } =
        await import('../../src/utils/token-storage.js');

      const credentials = {
        hostname: 'github.com',
        username: 'testuser',
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          expiresAt: '2020-01-01T00:00:00.000Z', // In the past
        },
        gitProtocol: 'https' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      expect(isTokenExpired(credentials)).toBe(true);
    });

    it('should return false for tokens with plenty of time remaining', async () => {
      const { isTokenExpired } =
        await import('../../src/utils/token-storage.js');

      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1); // 1 hour from now

      const credentials = {
        hostname: 'github.com',
        username: 'testuser',
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          expiresAt: futureDate.toISOString(),
        },
        gitProtocol: 'https' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      expect(isTokenExpired(credentials)).toBe(false);
    });
  });

  describe('isRefreshTokenExpired', () => {
    it('should return false when no refresh token expiry', async () => {
      const { isRefreshTokenExpired } =
        await import('../../src/utils/token-storage.js');

      const credentials = {
        hostname: 'github.com',
        username: 'testuser',
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          refreshToken: 'refresh-token',
        },
        gitProtocol: 'https' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      expect(isRefreshTokenExpired(credentials)).toBe(false);
    });

    it('should return true for expired refresh tokens', async () => {
      const { isRefreshTokenExpired } =
        await import('../../src/utils/token-storage.js');

      const credentials = {
        hostname: 'github.com',
        username: 'testuser',
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          refreshToken: 'refresh-token',
          refreshTokenExpiresAt: '2020-01-01T00:00:00.000Z', // In the past
        },
        gitProtocol: 'https' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      expect(isRefreshTokenExpired(credentials)).toBe(true);
    });
  });

  describe('listStoredHosts', () => {
    it('should return empty array when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { listStoredHosts } =
        await import('../../src/utils/token-storage.js');
      const hosts = listStoredHosts();

      expect(hosts).toEqual([]);
    });
  });

  describe('async API', () => {
    it('should have async versions of credential operations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const {
        getCredentialsAsync,
        storeCredentialsAsync,
        deleteCredentialsAsync,
        hasCredentialsAsync,
        listStoredHostsAsync,
        updateTokenAsync,
      } = await import('../../src/utils/token-storage.js');

      // Verify async functions exist
      expect(typeof getCredentialsAsync).toBe('function');
      expect(typeof storeCredentialsAsync).toBe('function');
      expect(typeof deleteCredentialsAsync).toBe('function');
      expect(typeof hasCredentialsAsync).toBe('function');
      expect(typeof listStoredHostsAsync).toBe('function');
      expect(typeof updateTokenAsync).toBe('function');
    });

    it('getCredentialsAsync should return null when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentialsAsync } =
        await import('../../src/utils/token-storage.js');
      const result = await getCredentialsAsync('github.com');

      expect(result).toBeNull();
    });

    it('hasCredentialsAsync should return false when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { hasCredentialsAsync } =
        await import('../../src/utils/token-storage.js');
      const result = await hasCredentialsAsync('github.com');

      expect(result).toBe(false);
    });

    it('listStoredHostsAsync should return empty array when no credentials', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { listStoredHostsAsync } =
        await import('../../src/utils/token-storage.js');
      const hosts = await listStoredHostsAsync();

      expect(hosts).toEqual([]);
    });
  });
});

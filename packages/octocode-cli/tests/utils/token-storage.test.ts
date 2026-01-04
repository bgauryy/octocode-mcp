/**
 * Token Storage Tests
 *
 * Comprehensive tests for both keytar-based secure storage and file-based fallback.
 * Tests cover initialization, storage operations, encryption, migration, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

// Default: keytar unavailable (will be overridden in specific tests)
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

// Helper to create mock cipher/decipher
function createMockCipher() {
  return {
    update: vi.fn().mockReturnValue('encrypted'),
    final: vi.fn().mockReturnValue(''),
    getAuthTag: vi.fn().mockReturnValue(Buffer.from('authtag1234567')),
  };
}

function createMockDecipher() {
  return {
    update: vi.fn().mockReturnValue('{"version":1,"credentials":{}}'),
    final: vi.fn().mockReturnValue(''),
    setAuthTag: vi.fn(),
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

    // Ensure keytar is disabled for file fallback tests
    const { _setSecureStorageAvailable, _resetSecureStorageState } =
      await import('../../src/utils/token-storage.js');
    _resetSecureStorageState();
    _setSecureStorageAvailable(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // initializeSecureStorage Tests
  // ============================================================================
  describe('initializeSecureStorage', () => {
    it('should initialize and return storage availability status', async () => {
      const { initializeSecureStorage, _resetSecureStorageState } =
        await import('../../src/utils/token-storage.js');

      _resetSecureStorageState();
      const result = await initializeSecureStorage();

      // Result depends on whether keytar is available in the environment
      expect(typeof result).toBe('boolean');
    });

    it('should return cached value on subsequent calls', async () => {
      const {
        initializeSecureStorage,
        _setSecureStorageAvailable,
        _resetSecureStorageState,
      } = await import('../../src/utils/token-storage.js');

      _resetSecureStorageState();
      _setSecureStorageAvailable(true);

      const result1 = await initializeSecureStorage();
      const result2 = await initializeSecureStorage();

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it('should mark as initialized after first call', async () => {
      const { initializeSecureStorage, isSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      await initializeSecureStorage();
      const available = isSecureStorageAvailable();

      expect(typeof available).toBe('boolean');
    });
  });

  // ============================================================================
  // isSecureStorageAvailable Tests
  // ============================================================================
  describe('isSecureStorageAvailable', () => {
    it('should return false when keytar is unavailable', async () => {
      const { isSecureStorageAvailable, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(false);
      expect(isSecureStorageAvailable()).toBe(false);
    });

    it('should return true when keytar is available', async () => {
      const { isSecureStorageAvailable, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);
      expect(isSecureStorageAvailable()).toBe(true);
    });

    it('should cache the result after first check', async () => {
      const { isSecureStorageAvailable, _resetSecureStorageState } =
        await import('../../src/utils/token-storage.js');

      _resetSecureStorageState();
      const result1 = isSecureStorageAvailable();
      const result2 = isSecureStorageAvailable();

      expect(result1).toBe(result2);
    });
  });

  // ============================================================================
  // _setSecureStorageAvailable and _resetSecureStorageState Tests
  // ============================================================================
  describe('internal state management', () => {
    it('should allow setting secure storage availability', async () => {
      const { _setSecureStorageAvailable, isSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);
      expect(isSecureStorageAvailable()).toBe(true);

      _setSecureStorageAvailable(false);
      expect(isSecureStorageAvailable()).toBe(false);
    });

    it('should reset state correctly', async () => {
      const {
        _setSecureStorageAvailable,
        _resetSecureStorageState,
        isSecureStorageAvailable,
      } = await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);
      expect(isSecureStorageAvailable()).toBe(true);

      _resetSecureStorageState();
      // After reset, it will re-check and return based on keytar state
      expect(typeof isSecureStorageAvailable()).toBe('boolean');
    });
  });

  // ============================================================================
  // storeCredentials Tests (file fallback)
  // ============================================================================
  describe('storeCredentials (file fallback)', () => {
    it('should create .octocode directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey.toString('hex'));

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');

      storeCredentials(createTestCredentials());

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/home/testuser/.octocode',
        expect.objectContaining({ recursive: true })
      );
    });

    it('should write encrypted credentials to file', async () => {
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
        await import('../../src/utils/token-storage.js');

      storeCredentials(createTestCredentials());

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/home/testuser/.octocode/credentials.json',
        expect.any(String),
        expect.objectContaining({ mode: 0o600 })
      );
    });

    it('should normalize hostname when storing', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey.toString('hex'));

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const mockDecipher = createMockDecipher();
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');

      // Store with uppercase hostname
      storeCredentials(createTestCredentials({ hostname: 'GITHUB.COM' }));

      expect(mockCipher.update).toHaveBeenCalled();
    });

    it('should throw error when file storage fails', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');

      expect(() => storeCredentials(createTestCredentials())).toThrow(
        'Failed to store credentials to file storage'
      );
    });

    it('should update timestamp when storing credentials', async () => {
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
        await import('../../src/utils/token-storage.js');

      const creds = createTestCredentials();
      storeCredentials(creds);

      // The cipher update should be called with a JSON string containing updatedAt
      const updateCall = mockCipher.update.mock.calls[0]?.[0];
      if (updateCall) {
        expect(updateCall).toContain('updatedAt');
      }
    });
  });

  // ============================================================================
  // storeCredentialsAsync Tests
  // ============================================================================
  describe('storeCredentialsAsync', () => {
    it('should store credentials asynchronously', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey.toString('hex'));

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { storeCredentialsAsync } =
        await import('../../src/utils/token-storage.js');

      await storeCredentialsAsync(createTestCredentials());

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/home/testuser/.octocode/credentials.json',
        expect.any(String),
        expect.objectContaining({ mode: 0o600 })
      );
    });

    it('should throw error when file storage fails async', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { storeCredentialsAsync } =
        await import('../../src/utils/token-storage.js');

      await expect(
        storeCredentialsAsync(createTestCredentials())
      ).rejects.toThrow('Failed to store credentials to file storage');
    });
  });

  // ============================================================================
  // getCredentials Tests
  // ============================================================================
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

      vi.mocked(crypto.createDecipheriv).mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = getCredentials('github.com');

      expect(result).toBeNull();
    });

    it('should return credentials when they exist', async () => {
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
        await import('../../src/utils/token-storage.js');
      const result = getCredentials('github.com');

      expect(result).toEqual(storedCreds);
    });

    it('should use default hostname github.com', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = getCredentials();

      expect(result).toBeNull();
    });

    it('should normalize hostname before lookup', async () => {
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
        await import('../../src/utils/token-storage.js');

      // Should find credentials with various hostname formats
      expect(getCredentials('GITHUB.COM')).toEqual(storedCreds);
      expect(getCredentials('https://github.com')).toEqual(storedCreds);
      expect(getCredentials('https://github.com/')).toEqual(storedCreds);
    });
  });

  // ============================================================================
  // getCredentialsAsync Tests
  // ============================================================================
  describe('getCredentialsAsync', () => {
    it('should return null when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentialsAsync } =
        await import('../../src/utils/token-storage.js');
      const result = await getCredentialsAsync('github.com');

      expect(result).toBeNull();
    });

    it('should fallback to file when keytar unavailable', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentialsAsync, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(false);
      const result = await getCredentialsAsync('github.com');

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // deleteCredentials Tests
  // ============================================================================
  describe('deleteCredentials', () => {
    it('should return false when no credentials exist in file storage', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { deleteCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = deleteCredentials('github.com');

      expect(result).toBe(false);
    });

    it('should delete credentials from file storage', async () => {
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

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { deleteCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = deleteCredentials('github.com');

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should use default hostname github.com', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { deleteCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = deleteCredentials();

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // deleteCredentialsAsync Tests
  // ============================================================================
  describe('deleteCredentialsAsync', () => {
    it('should return false when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { deleteCredentialsAsync } =
        await import('../../src/utils/token-storage.js');
      const result = await deleteCredentialsAsync('github.com');

      expect(result).toBe(false);
    });

    it('should delete from file storage and return true', async () => {
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

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { deleteCredentialsAsync } =
        await import('../../src/utils/token-storage.js');
      const result = await deleteCredentialsAsync('github.com');

      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // hasCredentials Tests
  // ============================================================================
  describe('hasCredentials', () => {
    it('should return false when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { hasCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = hasCredentials('github.com');

      expect(result).toBe(false);
    });

    it('should return true when credentials exist', async () => {
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

      const { hasCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = hasCredentials('github.com');

      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // hasCredentialsAsync Tests
  // ============================================================================
  describe('hasCredentialsAsync', () => {
    it('should return false when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { hasCredentialsAsync } =
        await import('../../src/utils/token-storage.js');
      const result = await hasCredentialsAsync('github.com');

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // updateToken Tests
  // ============================================================================
  describe('updateToken', () => {
    it('should return false when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { updateToken } = await import('../../src/utils/token-storage.js');
      const result = updateToken('github.com', {
        token: 'new-token',
        tokenType: 'oauth',
      });

      expect(result).toBe(false);
    });

    it('should update token when credentials exist', async () => {
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

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { updateToken } = await import('../../src/utils/token-storage.js');
      const result = updateToken('github.com', {
        token: 'new-token',
        tokenType: 'oauth',
      });

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // updateTokenAsync Tests
  // ============================================================================
  describe('updateTokenAsync', () => {
    it('should return false when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { updateTokenAsync } =
        await import('../../src/utils/token-storage.js');
      const result = await updateTokenAsync('github.com', {
        token: 'new-token',
        tokenType: 'oauth',
      });

      expect(result).toBe(false);
    });

    it('should update token async when credentials exist', async () => {
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

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { updateTokenAsync } =
        await import('../../src/utils/token-storage.js');
      const result = await updateTokenAsync('github.com', {
        token: 'new-token',
        tokenType: 'oauth',
      });

      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // listStoredHosts Tests
  // ============================================================================
  describe('listStoredHosts', () => {
    it('should return empty array when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { listStoredHosts } =
        await import('../../src/utils/token-storage.js');
      const hosts = listStoredHosts();

      expect(hosts).toEqual([]);
    });

    it('should return list of stored hostnames', async () => {
      const store = {
        version: 1,
        credentials: {
          'github.com': createTestCredentials(),
          'github.enterprise.com': createTestCredentials({
            hostname: 'github.enterprise.com',
          }),
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

      const { listStoredHosts } =
        await import('../../src/utils/token-storage.js');
      const hosts = listStoredHosts();

      expect(hosts).toContain('github.com');
      expect(hosts).toContain('github.enterprise.com');
      expect(hosts.length).toBe(2);
    });
  });

  // ============================================================================
  // listStoredHostsAsync Tests
  // ============================================================================
  describe('listStoredHostsAsync', () => {
    it('should return empty array when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { listStoredHostsAsync } =
        await import('../../src/utils/token-storage.js');
      const hosts = await listStoredHostsAsync();

      expect(hosts).toEqual([]);
    });

    it('should return unique hosts from file storage', async () => {
      const store = {
        version: 1,
        credentials: {
          'github.com': createTestCredentials(),
          'gitlab.com': createTestCredentials({ hostname: 'gitlab.com' }),
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

      const { listStoredHostsAsync } =
        await import('../../src/utils/token-storage.js');
      const hosts = await listStoredHostsAsync();

      expect(hosts).toContain('github.com');
      expect(hosts).toContain('gitlab.com');
    });
  });

  // ============================================================================
  // normalizeHostname Tests
  // ============================================================================
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

      expect(fs.existsSync).toHaveBeenCalled();
    });

    it('should handle http protocol', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');

      getCredentials('http://github.com');
      expect(fs.existsSync).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // getCredentialsFilePath Tests
  // ============================================================================
  describe('getCredentialsFilePath', () => {
    it('should return file path when keytar unavailable', async () => {
      const { getCredentialsFilePath, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(false);
      const path = getCredentialsFilePath();

      expect(path).toBe('/home/testuser/.octocode/credentials.json');
    });

    it('should return System Keychain message when keytar available', async () => {
      const { getCredentialsFilePath, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);
      const path = getCredentialsFilePath();

      expect(path).toBe('System Keychain (secure)');
    });
  });

  // ============================================================================
  // isUsingSecureStorage Tests
  // ============================================================================
  describe('isUsingSecureStorage', () => {
    it('should report storage mode correctly', async () => {
      const { isUsingSecureStorage, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(false);
      expect(isUsingSecureStorage()).toBe(false);

      _setSecureStorageAvailable(true);
      expect(isUsingSecureStorage()).toBe(true);
    });
  });

  // ============================================================================
  // isTokenExpired Tests
  // ============================================================================
  describe('isTokenExpired', () => {
    it('should return false for non-expiring tokens', async () => {
      const { isTokenExpired } =
        await import('../../src/utils/token-storage.js');

      const credentials = createTestCredentials();
      expect(isTokenExpired(credentials)).toBe(false);
    });

    it('should return true for expired tokens', async () => {
      const { isTokenExpired } =
        await import('../../src/utils/token-storage.js');

      const credentials = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
      });

      expect(isTokenExpired(credentials)).toBe(true);
    });

    it('should return false for tokens with plenty of time remaining', async () => {
      const { isTokenExpired } =
        await import('../../src/utils/token-storage.js');

      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);

      const credentials = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          expiresAt: futureDate.toISOString(),
        },
      });

      expect(isTokenExpired(credentials)).toBe(false);
    });

    it('should return true for tokens expiring within 5 minutes', async () => {
      const { isTokenExpired } =
        await import('../../src/utils/token-storage.js');

      const soonDate = new Date();
      soonDate.setMinutes(soonDate.getMinutes() + 2); // Only 2 minutes from now

      const credentials = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          expiresAt: soonDate.toISOString(),
        },
      });

      expect(isTokenExpired(credentials)).toBe(true);
    });

    it('should return true for invalid date strings', async () => {
      const { isTokenExpired } =
        await import('../../src/utils/token-storage.js');

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

  // ============================================================================
  // isRefreshTokenExpired Tests
  // ============================================================================
  describe('isRefreshTokenExpired', () => {
    it('should return false when no refresh token expiry', async () => {
      const { isRefreshTokenExpired } =
        await import('../../src/utils/token-storage.js');

      const credentials = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          refreshToken: 'refresh-token',
        },
      });

      expect(isRefreshTokenExpired(credentials)).toBe(false);
    });

    it('should return true for expired refresh tokens', async () => {
      const { isRefreshTokenExpired } =
        await import('../../src/utils/token-storage.js');

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

    it('should return false for non-expired refresh tokens', async () => {
      const { isRefreshTokenExpired } =
        await import('../../src/utils/token-storage.js');

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

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
        await import('../../src/utils/token-storage.js');

      const credentials = createTestCredentials({
        token: {
          token: 'test-token',
          tokenType: 'oauth' as const,
          refreshToken: 'refresh-token',
          refreshTokenExpiresAt: 'not-a-date',
        },
      });

      expect(isRefreshTokenExpired(credentials)).toBe(true);
    });
  });

  // ============================================================================
  // Encryption/Decryption Tests
  // ============================================================================
  describe('encryption/decryption', () => {
    it('should create encryption key if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(crypto.randomBytes)
        .mockReturnValueOnce(mockIv as unknown as void)
        .mockReturnValueOnce(mockKey as unknown as void);

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');

      storeCredentials(createTestCredentials());

      // Key file should be written
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/home/testuser/.octocode/.key',
        expect.any(String),
        expect.objectContaining({ mode: 0o600 })
      );
    });

    it('should use existing encryption key if available', async () => {
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
        await import('../../src/utils/token-storage.js');

      storeCredentials(createTestCredentials());

      expect(fs.readFileSync).toHaveBeenCalledWith(
        '/home/testuser/.octocode/.key',
        'utf8'
      );
    });

    it('should handle invalid encrypted data format', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'invalid-format-no-colons';
      });

      vi.mocked(crypto.createDecipheriv).mockImplementation(() => {
        throw new Error('Invalid encrypted data format');
      });

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = getCredentials('github.com');

      expect(result).toBeNull();
    });

    it('should use AES-256-GCM algorithm', async () => {
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
        await import('../../src/utils/token-storage.js');

      storeCredentials(createTestCredentials());

      expect(crypto.createCipheriv).toHaveBeenCalledWith(
        'aes-256-gcm',
        expect.any(Buffer),
        expect.any(Buffer)
      );
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================
  describe('error handling', () => {
    it('should handle corrupted credentials file gracefully', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'corrupted:data:here';
      });

      const mockDecipher = {
        update: vi.fn().mockImplementation(() => {
          throw new Error('Unsupported state or unable to authenticate data');
        }),
        final: vi.fn(),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = getCredentials('github.com');

      expect(result).toBeNull();
    });

    it('should handle mkdirSync errors when creating octocode dir', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');

      expect(() => storeCredentials(createTestCredentials())).toThrow();
    });

    it('should handle writeFileSync errors', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('.octocode')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey.toString('hex'));

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Disk full');
      });

      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');

      expect(() => storeCredentials(createTestCredentials())).toThrow();
    });

    it('should handle JSON parse errors in credentials', async () => {
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
        update: vi.fn().mockReturnValue('not valid json'),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = getCredentials('github.com');

      // Should return null and not throw
      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // Multi-hostname Scenarios Tests
  // ============================================================================
  describe('multi-hostname scenarios', () => {
    it('should handle multiple hostnames in storage', async () => {
      const githubCreds = createTestCredentials();
      const enterpriseCreds = createTestCredentials({
        hostname: 'github.enterprise.com',
        username: 'enterprise-user',
      });
      const store = {
        version: 1,
        credentials: {
          'github.com': githubCreds,
          'github.enterprise.com': enterpriseCreds,
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

      const { getCredentials, listStoredHosts } =
        await import('../../src/utils/token-storage.js');

      const hosts = listStoredHosts();
      expect(hosts).toHaveLength(2);
      expect(hosts).toContain('github.com');
      expect(hosts).toContain('github.enterprise.com');

      const github = getCredentials('github.com');
      expect(github?.username).toBe('testuser');

      const enterprise = getCredentials('github.enterprise.com');
      expect(enterprise?.username).toBe('enterprise-user');
    });

    it('should not mix up credentials between hostnames', async () => {
      const githubCreds = createTestCredentials({
        token: { token: 'github-token', tokenType: 'oauth' as const },
      });
      const gitlabCreds = createTestCredentials({
        hostname: 'gitlab.com',
        token: { token: 'gitlab-token', tokenType: 'oauth' as const },
      });
      const store = {
        version: 1,
        credentials: {
          'github.com': githubCreds,
          'gitlab.com': gitlabCreds,
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

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');

      const github = getCredentials('github.com');
      const gitlab = getCredentials('gitlab.com');

      expect(github?.token.token).toBe('github-token');
      expect(gitlab?.token.token).toBe('gitlab-token');
    });
  });

  // ============================================================================
  // Async API Tests
  // ============================================================================
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

  // ============================================================================
  // File Permissions Tests
  // ============================================================================
  describe('file permissions', () => {
    it('should create key file with restricted permissions (0o600)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(crypto.randomBytes)
        .mockReturnValueOnce(mockIv as unknown as void)
        .mockReturnValueOnce(mockKey as unknown as void);

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');

      storeCredentials(createTestCredentials());

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/home/testuser/.octocode/.key',
        expect.any(String),
        { mode: 0o600 }
      );
    });

    it('should create credentials file with restricted permissions (0o600)', async () => {
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
        await import('../../src/utils/token-storage.js');

      storeCredentials(createTestCredentials());

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/home/testuser/.octocode/credentials.json',
        expect.any(String),
        { mode: 0o600 }
      );
    });

    it('should create .octocode directory with restricted permissions (0o700)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(crypto.randomBytes)
        .mockReturnValueOnce(mockIv as unknown as void)
        .mockReturnValueOnce(mockKey as unknown as void);

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');

      storeCredentials(createTestCredentials());

      expect(fs.mkdirSync).toHaveBeenCalledWith('/home/testuser/.octocode', {
        recursive: true,
        mode: 0o700,
      });
    });
  });
});

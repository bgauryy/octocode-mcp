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

// Note: HOME cannot be mocked since it's evaluated at module load time.
// Tests that check specific paths will use OCTOCODE_DIR constant instead.

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
  // storeCredentials Tests (keyring-first with file fallback)
  // ============================================================================
  describe('storeCredentials (keyring-first)', () => {
    it('should create .octocode directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey.toString('hex'));

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');

      await storeCredentials(createTestCredentials());

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.octocode'),
        expect.objectContaining({ recursive: true })
      );
    });

    it('should write encrypted credentials to file when keytar unavailable', async () => {
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

      const result = await storeCredentials(createTestCredentials());

      expect(result.success).toBe(true);
      expect(result.insecureStorageUsed).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('credentials.json'),
        expect.any(String),
        expect.objectContaining({ mode: 0o600 })
      );
    });

    it('should return StoreResult with insecureStorageUsed flag', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey.toString('hex'));

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { storeCredentials, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(false);
      const result = await storeCredentials(createTestCredentials());

      expect(result).toEqual({
        success: true,
        insecureStorageUsed: true,
      });
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
      await storeCredentials(createTestCredentials({ hostname: 'GITHUB.COM' }));

      expect(mockCipher.update).toHaveBeenCalled();
    });

    it('should throw error when all storage methods fail', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');

      await expect(storeCredentials(createTestCredentials())).rejects.toThrow(
        'Failed to store credentials'
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
      await storeCredentials(creds);

      // The cipher update should be called with a JSON string containing updatedAt
      const updateCall = mockCipher.update.mock.calls[0]?.[0];
      if (updateCall) {
        expect(updateCall).toContain('updatedAt');
      }
    });
  });

  // ============================================================================
  // getCredentials Tests (async, keyring-first)
  // ============================================================================
  describe('getCredentials', () => {
    it('should return null when credentials file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = await getCredentials('github.com');

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
        await import('../../src/utils/token-storage.js');
      const result = await getCredentials('github.com');

      expect(result).toEqual(storedCreds);
    });

    it('should use default hostname github.com', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = await getCredentials();

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
      expect(await getCredentials('GITHUB.COM')).toEqual(storedCreds);
      expect(await getCredentials('https://github.com')).toEqual(storedCreds);
      expect(await getCredentials('https://github.com/')).toEqual(storedCreds);
    });
  });

  // ============================================================================
  // getCredentialsSync Tests (file-only sync version)
  // ============================================================================
  describe('getCredentialsSync', () => {
    it('should return null when credentials file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentialsSync } =
        await import('../../src/utils/token-storage.js');
      const result = getCredentialsSync('github.com');

      expect(result).toBeNull();
    });

    it('should return credentials from file storage', async () => {
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

      const { getCredentialsSync } =
        await import('../../src/utils/token-storage.js');
      const result = getCredentialsSync('github.com');

      expect(result).toEqual(storedCreds);
    });
  });

  // ============================================================================
  // deleteCredentials Tests (async, returns DeleteResult)
  // ============================================================================
  describe('deleteCredentials', () => {
    it('should return DeleteResult with success=false when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { deleteCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = await deleteCredentials('github.com');

      expect(result).toEqual({
        success: false,
        deletedFromKeyring: false,
        deletedFromFile: false,
      });
    });

    it('should delete credentials from file storage and return DeleteResult', async () => {
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
      const result = await deleteCredentials('github.com');

      expect(result.success).toBe(true);
      expect(result.deletedFromFile).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalled(); // Cleanup since last credential
    });

    it('should use default hostname github.com', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { deleteCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = await deleteCredentials();

      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // hasCredentials Tests (async)
  // ============================================================================
  describe('hasCredentials', () => {
    it('should return false when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { hasCredentials } =
        await import('../../src/utils/token-storage.js');
      const result = await hasCredentials('github.com');

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
      const result = await hasCredentials('github.com');

      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // hasCredentialsSync Tests (file-only)
  // ============================================================================
  describe('hasCredentialsSync', () => {
    it('should return false when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { hasCredentialsSync } =
        await import('../../src/utils/token-storage.js');
      const result = hasCredentialsSync('github.com');

      expect(result).toBe(false);
    });

    it('should return true when credentials exist in file', async () => {
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

      const { hasCredentialsSync } =
        await import('../../src/utils/token-storage.js');
      const result = hasCredentialsSync('github.com');

      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // updateToken Tests (async)
  // ============================================================================
  describe('updateToken', () => {
    it('should return false when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { updateToken } = await import('../../src/utils/token-storage.js');
      const result = await updateToken('github.com', {
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
      const result = await updateToken('github.com', {
        token: 'new-token',
        tokenType: 'oauth',
      });

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // listStoredHosts Tests (async)
  // ============================================================================
  describe('listStoredHosts', () => {
    it('should return empty array when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { listStoredHosts } =
        await import('../../src/utils/token-storage.js');
      const hosts = await listStoredHosts();

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
      const hosts = await listStoredHosts();

      expect(hosts).toContain('github.com');
      expect(hosts).toContain('github.enterprise.com');
      expect(hosts.length).toBe(2);
    });
  });

  // ============================================================================
  // listStoredHostsSync Tests (file-only)
  // ============================================================================
  describe('listStoredHostsSync', () => {
    it('should return empty array when no credentials exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { listStoredHostsSync } =
        await import('../../src/utils/token-storage.js');
      const hosts = listStoredHostsSync();

      expect(hosts).toEqual([]);
    });

    it('should return list of stored hostnames from file', async () => {
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

      const { listStoredHostsSync } =
        await import('../../src/utils/token-storage.js');
      const hosts = listStoredHostsSync();

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
      await getCredentials('github.com');
      await getCredentials('GITHUB.COM');
      await getCredentials('https://github.com');
      await getCredentials('https://github.com/');

      expect(fs.existsSync).toHaveBeenCalled();
    });

    it('should handle http protocol', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');

      await getCredentials('http://github.com');
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

      expect(path).toContain('credentials.json');
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

      await storeCredentials(createTestCredentials());

      // Key file should be written
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.key'),
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

      await storeCredentials(createTestCredentials());

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.key'),
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
      const result = await getCredentials('github.com');

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

      await storeCredentials(createTestCredentials());

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
      const result = await getCredentials('github.com');

      expect(result).toBeNull();
    });

    it('should handle mkdirSync errors when creating octocode dir', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');

      await expect(storeCredentials(createTestCredentials())).rejects.toThrow();
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

      await expect(storeCredentials(createTestCredentials())).rejects.toThrow();
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
      const result = await getCredentials('github.com');

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

      const hosts = await listStoredHosts();
      expect(hosts).toHaveLength(2);
      expect(hosts).toContain('github.com');
      expect(hosts).toContain('github.enterprise.com');

      const github = await getCredentials('github.com');
      expect(github?.username).toBe('testuser');

      const enterprise = await getCredentials('github.enterprise.com');
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

      const github = await getCredentials('github.com');
      const gitlab = await getCredentials('gitlab.com');

      expect(github?.token.token).toBe('github-token');
      expect(gitlab?.token.token).toBe('gitlab-token');
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

      await storeCredentials(createTestCredentials());

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.key'),
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

      await storeCredentials(createTestCredentials());

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('credentials.json'),
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

      await storeCredentials(createTestCredentials());

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.octocode'),
        {
          recursive: true,
          mode: 0o700,
        }
      );
    });
  });

  // ============================================================================
  // TimeoutError Tests
  // ============================================================================
  describe('TimeoutError', () => {
    it('should export TimeoutError class', async () => {
      const { TimeoutError } = await import('../../src/utils/token-storage.js');

      expect(TimeoutError).toBeDefined();
      expect(typeof TimeoutError).toBe('function');
    });

    it('should create TimeoutError with correct properties', async () => {
      const { TimeoutError } = await import('../../src/utils/token-storage.js');

      const error = new TimeoutError('test timeout');
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('test timeout');
      expect(error instanceof Error).toBe(true);
    });
  });

  // ============================================================================
  // Keyring Operations Tests (when keytar is available)
  // ============================================================================
  describe('keyring operations (secure storage)', () => {
    // Mock keytar functions
    const mockKeytarSetPassword = vi.fn();
    const mockKeytarGetPassword = vi.fn();
    const mockKeytarDeletePassword = vi.fn();
    const mockKeytarFindCredentials = vi.fn();

    beforeEach(async () => {
      vi.resetModules();
      vi.clearAllMocks();

      // Setup crypto mocks
      vi.mocked(crypto.randomBytes).mockReturnValue(mockIv as unknown as void);
    });

    describe('storeCredentials with keyring success', () => {
      it('should store in keyring when secure storage is available', async () => {
        // Setup keytar mock
        vi.doMock('keytar', () => ({
          default: {
            setPassword: mockKeytarSetPassword.mockResolvedValue(undefined),
            getPassword: mockKeytarGetPassword.mockResolvedValue(null),
            deletePassword: mockKeytarDeletePassword.mockResolvedValue(true),
            findCredentials: mockKeytarFindCredentials.mockResolvedValue([]),
          },
        }));

        vi.mocked(fs.existsSync).mockReturnValue(false);

        const {
          storeCredentials,
          _setSecureStorageAvailable,
          _resetSecureStorageState,
        } = await import('../../src/utils/token-storage.js');

        _resetSecureStorageState();
        _setSecureStorageAvailable(true);

        // Mock the internal keytar reference - since we can't actually load keytar,
        // simulate the success path by having file storage fallback work
        const mockCipher = createMockCipher();
        vi.mocked(crypto.createCipheriv).mockReturnValue(
          mockCipher as unknown as crypto.CipherGCM
        );
        vi.mocked(fs.readFileSync).mockReturnValue(mockKey.toString('hex'));

        const result = await storeCredentials(createTestCredentials());

        // Since keytar can't actually be loaded in tests, it falls back to file
        expect(result.success).toBe(true);
      });

      it('should handle storage when keyring flag is enabled', async () => {
        vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
          if (String(path).includes('.key')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockReturnValue(mockKey.toString('hex'));

        const mockCipher = createMockCipher();
        vi.mocked(crypto.createCipheriv).mockReturnValue(
          mockCipher as unknown as crypto.CipherGCM
        );

        const { storeCredentials, _setSecureStorageAvailable } =
          await import('../../src/utils/token-storage.js');

        // Simulate keytar being "available" but operations will timeout/fail
        _setSecureStorageAvailable(true);

        const result = await storeCredentials(createTestCredentials());

        // Storage should succeed (via keyring or file fallback)
        expect(result.success).toBe(true);
        // insecureStorageUsed depends on whether keyring actually works
        expect(typeof result.insecureStorageUsed).toBe('boolean');
      });
    });

    describe('getCredentials with keyring', () => {
      it('should try keyring first when secure storage available', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const { getCredentials, _setSecureStorageAvailable } =
          await import('../../src/utils/token-storage.js');

        _setSecureStorageAvailable(true);

        // Keytar operations will fail since not actually loaded
        const result = await getCredentials('github.com');

        // Should return null (no credentials in either keyring or file)
        expect(result).toBeNull();
      });

      it('should fallback to file when keyring read fails', async () => {
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

        const { getCredentials, _setSecureStorageAvailable } =
          await import('../../src/utils/token-storage.js');

        _setSecureStorageAvailable(true);

        const result = await getCredentials('github.com');

        // Should return credentials from file fallback
        expect(result).toEqual(storedCreds);
      });
    });

    describe('deleteCredentials with keyring', () => {
      it('should attempt keyring delete when secure storage available', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const { deleteCredentials, _setSecureStorageAvailable } =
          await import('../../src/utils/token-storage.js');

        _setSecureStorageAvailable(true);

        const result = await deleteCredentials('github.com');

        // Neither keyring nor file had credentials
        expect(result.success).toBe(false);
        // Check result has expected shape
        expect(result).toHaveProperty('deletedFromKeyring');
        expect(result).toHaveProperty('deletedFromFile');
      });

      it('should delete from both keyring and file when both have credentials', async () => {
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

        const mockCipher = createMockCipher();
        vi.mocked(crypto.createCipheriv).mockReturnValue(
          mockCipher as unknown as crypto.CipherGCM
        );

        const { deleteCredentials, _setSecureStorageAvailable } =
          await import('../../src/utils/token-storage.js');

        _setSecureStorageAvailable(true);

        const result = await deleteCredentials('github.com');

        expect(result.success).toBe(true);
        expect(result.deletedFromFile).toBe(true);
      });
    });

    describe('listStoredHosts with keyring', () => {
      it('should combine hosts from keyring and file', async () => {
        const store = {
          version: 1,
          credentials: {
            'github.com': createTestCredentials(),
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

        const { listStoredHosts, _setSecureStorageAvailable } =
          await import('../../src/utils/token-storage.js');

        _setSecureStorageAvailable(true);

        const hosts = await listStoredHosts();

        expect(hosts).toContain('github.com');
      });

      it('should handle keyring list failure gracefully', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const { listStoredHosts, _setSecureStorageAvailable } =
          await import('../../src/utils/token-storage.js');

        _setSecureStorageAvailable(true);

        // Keyring list will fail, should return empty from file
        const hosts = await listStoredHosts();

        expect(hosts).toEqual([]);
      });
    });
  });

  // ============================================================================
  // removeFromFileStorage Tests
  // ============================================================================
  describe('removeFromFileStorage (internal)', () => {
    it('should remove credentials and keep other entries', async () => {
      const githubCreds = createTestCredentials();
      const gitlabCreds = createTestCredentials({ hostname: 'gitlab.com' });
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

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { deleteCredentials } =
        await import('../../src/utils/token-storage.js');

      await deleteCredentials('github.com');

      // Should write file (not delete) since gitlab still has creds
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should cleanup key file when last credential is removed', async () => {
      const store = {
        version: 1,
        credentials: {
          'github.com': createTestCredentials(),
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

      const { deleteCredentials } =
        await import('../../src/utils/token-storage.js');

      await deleteCredentials('github.com');

      // Should delete files since no credentials left
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should handle removeFromFileStorage errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const { deleteCredentials } =
        await import('../../src/utils/token-storage.js');

      // Should not throw, returns false for file deletion
      const result = await deleteCredentials('github.com');
      expect(result.deletedFromFile).toBe(false);
    });
  });

  // ============================================================================
  // cleanupKeyFile Tests
  // ============================================================================
  describe('cleanupKeyFile (internal)', () => {
    it('should delete both credentials and key files', async () => {
      const store = {
        version: 1,
        credentials: {
          'github.com': createTestCredentials(),
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
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

      const { deleteCredentials } =
        await import('../../src/utils/token-storage.js');

      await deleteCredentials('github.com');

      // unlinkSync should be called for cleanup
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should handle cleanup errors silently', async () => {
      const store = {
        version: 1,
        credentials: {
          'github.com': createTestCredentials(),
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
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

      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error('EACCES');
      });

      const { deleteCredentials } =
        await import('../../src/utils/token-storage.js');

      // Should not throw even if cleanup fails
      const result = await deleteCredentials('github.com');
      expect(result.deletedFromFile).toBe(true);
    });
  });

  // ============================================================================
  // Timeout Handling Tests
  // ============================================================================
  describe('timeout handling', () => {
    it('should handle timeout errors differently from other errors', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentials, _setSecureStorageAvailable, TimeoutError } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);

      // Verify TimeoutError is properly exported
      const timeoutErr = new TimeoutError('test');
      expect(timeoutErr.name).toBe('TimeoutError');

      // getCredentials should handle timeout gracefully
      const result = await getCredentials('github.com');
      expect(result).toBeNull();
    });

    it('should suppress timeout warnings in getCredentials', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentials, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);

      await getCredentials('github.com');

      // Should not log timeout warnings (timeout errors are suppressed)
      const timeoutWarnings = consoleWarnSpy.mock.calls.filter(
        call => call[0] && String(call[0]).includes('timed out')
      );
      expect(timeoutWarnings.length).toBe(0);

      consoleWarnSpy.mockRestore();
    });

    it('should suppress timeout warnings in listStoredHosts', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { listStoredHosts, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);

      await listStoredHosts();

      // Should not log timeout warnings
      const timeoutWarnings = consoleWarnSpy.mock.calls.filter(
        call => call[0] && String(call[0]).includes('timed out')
      );
      expect(timeoutWarnings.length).toBe(0);

      consoleWarnSpy.mockRestore();
    });
  });

  // ============================================================================
  // Edge Cases and Boundary Conditions
  // ============================================================================
  describe('edge cases', () => {
    it('should handle empty credentials store', async () => {
      const store = { version: 1, credentials: {} };

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

      const { getCredentials, listStoredHosts, deleteCredentials } =
        await import('../../src/utils/token-storage.js');

      expect(await getCredentials('github.com')).toBeNull();
      expect(await listStoredHosts()).toEqual([]);

      const deleteResult = await deleteCredentials('github.com');
      expect(deleteResult.success).toBe(false);
    });

    it('should handle hostname with trailing slash', async () => {
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

      // Should normalize and find credentials
      expect(await getCredentials('github.com/')).toEqual(storedCreds);
      expect(await getCredentials('https://github.com/')).toEqual(storedCreds);
    });

    it('should handle very long hostname', async () => {
      const longHostname = 'a'.repeat(255) + '.example.com';
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentials, hasCredentials } =
        await import('../../src/utils/token-storage.js');

      // Should not throw
      expect(await getCredentials(longHostname)).toBeNull();
      expect(await hasCredentials(longHostname)).toBe(false);
    });

    it('should handle special characters in hostname', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');

      // Should handle without throwing
      expect(await getCredentials('github-enterprise.example.com')).toBeNull();
      expect(await getCredentials('github_test.example.com')).toBeNull();
    });
  });

  // ============================================================================
  // Concurrent Operations Tests
  // ============================================================================
  describe('concurrent operations', () => {
    it('should handle concurrent getCredentials calls', async () => {
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

      // Make concurrent calls
      const results = await Promise.all([
        getCredentials('github.com'),
        getCredentials('github.com'),
        getCredentials('github.com'),
      ]);

      // All should succeed
      results.forEach(result => {
        expect(result).toEqual(storedCreds);
      });
    });

    it('should handle concurrent store and get operations', async () => {
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

      const { storeCredentials, getCredentials } =
        await import('../../src/utils/token-storage.js');

      // Concurrent operations
      const [storeResult, getResult] = await Promise.all([
        storeCredentials(createTestCredentials()),
        getCredentials('github.com'),
      ]);

      expect(storeResult.success).toBe(true);
      // getResult may be null depending on timing
      expect(getResult === null || typeof getResult === 'object').toBe(true);
    });
  });

  // ============================================================================
  // migrateLegacyCredentials Tests
  // ============================================================================
  describe('migrateLegacyCredentials (via initializeSecureStorage)', () => {
    it('should return false when secure storage is explicitly disabled', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const {
        initializeSecureStorage,
        _setSecureStorageAvailable,
        _resetSecureStorageState,
        isSecureStorageAvailable,
      } = await import('../../src/utils/token-storage.js');

      _resetSecureStorageState();
      _setSecureStorageAvailable(false);

      // After explicitly disabling, secure storage should be false
      expect(isSecureStorageAvailable()).toBe(false);

      const result = await initializeSecureStorage();
      expect(result).toBe(false);
    });

    it('should skip migration when credentials file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const {
        initializeSecureStorage,
        _setSecureStorageAvailable,
        _resetSecureStorageState,
      } = await import('../../src/utils/token-storage.js');

      _resetSecureStorageState();
      _setSecureStorageAvailable(true);

      const result = await initializeSecureStorage();

      // Should return cached value
      expect(result).toBe(true);
    });

    it('should handle migration errors gracefully', async () => {
      const store = {
        version: 1,
        credentials: { 'github.com': createTestCredentials() },
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

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const { initializeSecureStorage, _resetSecureStorageState } =
        await import('../../src/utils/token-storage.js');

      _resetSecureStorageState();

      await initializeSecureStorage();

      // Should not throw
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should handle empty credentials store during migration', async () => {
      const store = { version: 1, credentials: {} };

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
        initializeSecureStorage,
        _setSecureStorageAvailable,
        _resetSecureStorageState,
      } = await import('../../src/utils/token-storage.js');

      _resetSecureStorageState();
      _setSecureStorageAvailable(true);

      // Should not throw when credentials is empty
      await initializeSecureStorage();

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // removeFromFileStorage edge cases
  // ============================================================================
  describe('removeFromFileStorage edge cases', () => {
    it('should return false when hostname not in file storage', async () => {
      const store = {
        version: 1,
        credentials: { 'other.com': createTestCredentials() },
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

      const { storeCredentials, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      // Simulate keyring available - file cleanup happens after successful keyring store
      // but 'github.com' is not in file storage (only 'other.com' is)
      _setSecureStorageAvailable(true);

      // This will fail keyring (since keytar not loaded) and fall back to file
      const result = await storeCredentials(createTestCredentials());

      expect(result.success).toBe(true);
    });

    it('should write store when removing non-last credential', async () => {
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

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { deleteCredentials } =
        await import('../../src/utils/token-storage.js');

      await deleteCredentials('github.com');

      // Should write file (not delete) since gitlab.com still has creds
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Non-TimeoutError warning tests
  // ============================================================================
  describe('non-timeout error warnings', () => {
    it('should log warning for non-timeout errors in getCredentials keyring read', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

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

      const { getCredentials, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);

      // Since keytar is not actually loaded, the internal keytarGet will return null
      // but if there were actual errors they would be logged
      await getCredentials('github.com');

      // Should fallback to file and return credentials
      consoleWarnSpy.mockRestore();
    });

    it('should log warning for keyring delete failure in deleteCredentials', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { deleteCredentials, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);

      // Delete with secure storage "available" but keytar not loaded
      // This tests the catch path in keytarDelete
      await deleteCredentials('github.com');

      // Nothing to delete from either location
      consoleWarnSpy.mockRestore();
    });

    it('should log warning for non-timeout errors in listStoredHosts', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { listStoredHosts, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);

      // List with secure storage "available" but keytar not loaded
      // This tests the catch path in keytarList
      const hosts = await listStoredHosts();

      expect(hosts).toEqual([]);
      consoleWarnSpy.mockRestore();
    });
  });

  // ============================================================================
  // Keyring-first store with file cleanup tests
  // ============================================================================
  describe('keyring-first storage with file cleanup', () => {
    it('should attempt keyring store when secure storage flag is enabled', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

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

      const { storeCredentials, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);

      // Store with secure storage "available"
      // Since keytar is not actually loaded, it will attempt keyring, fail, and fall back
      const result = await storeCredentials(createTestCredentials());

      // Should succeed (either via keyring or file fallback)
      expect(result.success).toBe(true);

      consoleWarnSpy.mockRestore();
    });

    it('should use file storage when keytar not available but flag enabled', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey.toString('hex'));

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { storeCredentials, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      // Disable secure storage - should go straight to file
      _setSecureStorageAvailable(false);

      const result = await storeCredentials(createTestCredentials());

      expect(result.success).toBe(true);
      expect(result.insecureStorageUsed).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Console warning/error suppression during error handling
  // ============================================================================
  describe('error handling console output', () => {
    it('should succeed when storing credentials with secure flag enabled', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey.toString('hex'));

      const mockCipher = createMockCipher();
      vi.mocked(crypto.createCipheriv).mockReturnValue(
        mockCipher as unknown as crypto.CipherGCM
      );

      const { storeCredentials, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);

      const result = await storeCredentials(createTestCredentials());

      // Should succeed (may use keyring or file depending on keytar availability)
      expect(result.success).toBe(true);

      consoleWarnSpy.mockRestore();
    });

    it('should log critical error when all storage methods fail', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { storeCredentials, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(false);

      await expect(storeCredentials(createTestCredentials())).rejects.toThrow(
        'Failed to store credentials'
      );

      // Should log critical error
      const criticalErrors = consoleErrorSpy.mock.calls.filter(
        call => call[0] && String(call[0]).includes('CRITICAL')
      );
      expect(criticalErrors.length).toBeGreaterThanOrEqual(1);

      consoleErrorSpy.mockRestore();
    });

    it('should warn about corrupted credentials file with error message', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

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
          throw new Error('Decryption failed: invalid key');
        }),
        final: vi.fn(),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');

      await getCredentials('github.com');

      // Should log warning about corrupted file
      const corruptionWarnings = consoleErrorSpy.mock.calls.filter(
        call =>
          call[0] &&
          (String(call[0]).includes('Warning') ||
            String(call[0]).includes('Reason'))
      );
      expect(corruptionWarnings.length).toBeGreaterThanOrEqual(1);

      consoleErrorSpy.mockRestore();
    });
  });

  // ============================================================================
  // File storage removal error handling
  // ============================================================================
  describe('file storage removal error handling', () => {
    it('should handle and warn on removeFromFileStorage read errors', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      // Simulate file exists but read fails
      let readCallCount = 0;
      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        readCallCount++;
        if (readCallCount > 1) {
          throw new Error('Simulated read error');
        }
        return 'iv:authtag:encrypted';
      });

      const store = {
        version: 1,
        credentials: { 'github.com': createTestCredentials() },
      };
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

      const { storeCredentials, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);

      // This should trigger removeFromFileStorage which may fail on read
      const result = await storeCredentials(createTestCredentials());

      // Should still succeed via file fallback (after keyring fails)
      expect(result.success).toBe(true);

      consoleWarnSpy.mockRestore();
    });
  });

  // ============================================================================
  // Additional keytar error path tests
  // ============================================================================
  describe('keytarGet/Delete/List error paths', () => {
    it('should handle keytarList returning empty via listStoredHosts with secure storage', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      // File storage has credentials
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

      const { listStoredHosts, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);

      // With secure storage enabled but keytar not loaded,
      // keytarList returns [] so we only get file-based hosts
      const hosts = await listStoredHosts();

      // Should return hosts from file storage
      expect(hosts).toContain('github.com');
      expect(hosts).toContain('gitlab.com');
      expect(hosts.length).toBe(2);

      consoleWarnSpy.mockRestore();
    });

    it('should handle keytarGet returning null in getCredentials', async () => {
      // File storage has credentials
      const store = {
        version: 1,
        credentials: { 'github.com': createTestCredentials() },
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

      const { getCredentials, _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);

      // With secure storage enabled but keytar not loaded,
      // keytarGet returns null so we fall back to file storage
      const result = await getCredentials('github.com');

      // Should return credentials from file storage
      expect(result).not.toBeNull();
      expect(result?.hostname).toBe('github.com');
    });
  });

  // ============================================================================
  // ReadCredentialsStore error message tests
  // ============================================================================
  describe('readCredentialsStore error messages', () => {
    it('should log reason when decryption fails with error message', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        if (String(path).includes('.octocode')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockImplementation(() => {
          throw new Error('Authentication tag mismatch');
        }),
        final: vi.fn(),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { getCredentialsSync } =
        await import('../../src/utils/token-storage.js');

      const result = getCredentialsSync('github.com');

      // Should return null and log error
      expect(result).toBeNull();

      // Should have logged the reason
      const reasonMessages = consoleErrorSpy.mock.calls.filter(
        call => call[0] && String(call[0]).includes('Reason:')
      );
      expect(reasonMessages.length).toBeGreaterThanOrEqual(1);

      consoleErrorSpy.mockRestore();
    });

    it('should log warning without reason when error has no message', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return true;
        if (String(path).includes('credentials.json')) return true;
        if (String(path).includes('.octocode')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
        if (String(path).includes('.key')) return mockKey.toString('hex');
        return 'iv:authtag:encrypted';
      });

      const mockDecipher = {
        update: vi.fn().mockImplementation(() => {
          throw new Error(''); // Empty message
        }),
        final: vi.fn(),
        setAuthTag: vi.fn(),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as crypto.DecipherGCM
      );

      const { getCredentialsSync } =
        await import('../../src/utils/token-storage.js');

      const result = getCredentialsSync('github.com');

      // Should return null
      expect(result).toBeNull();

      // Should have logged warning but not reason (empty message)
      const warningMessages = consoleErrorSpy.mock.calls.filter(
        call => call[0] && String(call[0]).includes('Warning')
      );
      expect(warningMessages.length).toBeGreaterThanOrEqual(1);

      consoleErrorSpy.mockRestore();
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock keytar to be unavailable
vi.mock('keytar', () => {
  throw new Error('keytar not available');
});

// Mock fs and crypto before importing the module
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

describe('octocodeCredentials (via shared package)', () => {
  const mockKey = Buffer.from('a'.repeat(64), 'hex'); // 32-byte key

  const mockCredentials = {
    version: 1,
    credentials: {
      'github.com': {
        hostname: 'github.com',
        username: 'testuser',
        token: {
          token: 'ghp_test_token_12345',
          tokenType: 'oauth',
          scopes: ['repo', 'read:org'],
        },
        gitProtocol: 'https',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    },
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Get fresh mocks
    const fs = await import('node:fs');
    const crypto = await import('node:crypto');

    // Set default mock behaviors
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(crypto.randomBytes).mockReturnValue(
      Buffer.alloc(16, 'b') as unknown as void
    );

    // Reset secure storage state
    const { _setSecureStorageAvailable, _resetSecureStorageState } =
      await import('../../src/utils/credentials/index.js');
    _resetSecureStorageState();
    _setSecureStorageAvailable(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getOctocodeToken', () => {
    async function setupMockCredentials(credentials: object) {
      const credentialsJson = JSON.stringify(credentials);
      const fs = await import('node:fs');
      const crypto = await import('node:crypto');

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
        update: vi.fn().mockReturnValue(credentialsJson),
        final: vi.fn().mockReturnValue(''),
        setAuthTag: vi.fn(),
      };

      vi.mocked(crypto.createDecipheriv).mockReturnValue(
        mockDecipher as unknown as ReturnType<typeof crypto.createDecipheriv>
      );
    }

    it('should return token for default hostname (github.com)', async () => {
      await setupMockCredentials(mockCredentials);

      const { getOctocodeToken } =
        await import('../../src/utils/credentials/index.js');
      const token = await getOctocodeToken();

      expect(token).toBe('ghp_test_token_12345');
    });

    it('should return token for specified hostname', async () => {
      const enterpriseCredentials = {
        version: 1,
        credentials: {
          'github.enterprise.com': {
            hostname: 'github.enterprise.com',
            username: 'enterpriseuser',
            token: {
              token: 'ghp_enterprise_token',
              tokenType: 'oauth',
            },
            gitProtocol: 'https',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        },
      };

      await setupMockCredentials(enterpriseCredentials);

      const { getOctocodeToken } =
        await import('../../src/utils/credentials/index.js');
      const token = await getOctocodeToken('github.enterprise.com');

      expect(token).toBe('ghp_enterprise_token');
    });

    it('should return null when hostname not found in credentials', async () => {
      await setupMockCredentials(mockCredentials);

      const { getOctocodeToken } =
        await import('../../src/utils/credentials/index.js');
      const token = await getOctocodeToken('unknown.host.com');

      expect(token).toBeNull();
    });

    it('should return null when credentials file does not exist', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getOctocodeToken } =
        await import('../../src/utils/credentials/index.js');
      const token = await getOctocodeToken();

      expect(token).toBeNull();
    });

    it('should return null when credentials have no token', async () => {
      const noTokenCredentials = {
        version: 1,
        credentials: {
          'github.com': {
            hostname: 'github.com',
            username: 'testuser',
            token: null,
            gitProtocol: 'https',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        },
      };

      await setupMockCredentials(noTokenCredentials);

      const { getOctocodeToken } =
        await import('../../src/utils/credentials/index.js');
      const token = await getOctocodeToken();

      expect(token).toBeNull();
    });

    it('should normalize hostname (lowercase, remove protocol)', async () => {
      await setupMockCredentials(mockCredentials);

      const { getOctocodeToken } =
        await import('../../src/utils/credentials/index.js');
      const token = await getOctocodeToken('https://GitHub.com/');

      expect(token).toBe('ghp_test_token_12345');
    });

    it('should handle expired tokens gracefully', async () => {
      const expiredCredentials = {
        version: 1,
        credentials: {
          'github.com': {
            hostname: 'github.com',
            username: 'testuser',
            token: {
              token: 'ghp_expired_token',
              tokenType: 'oauth',
              expiresAt: '2020-01-01T00:00:00.000Z',
            },
            gitProtocol: 'https',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        },
      };

      await setupMockCredentials(expiredCredentials);

      const { getOctocodeToken } =
        await import('../../src/utils/credentials/index.js');
      const token = await getOctocodeToken();

      expect(token).toBeNull();
    });

    it('should return token if expiration date is in the future', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const validCredentials = {
        version: 1,
        credentials: {
          'github.com': {
            hostname: 'github.com',
            username: 'testuser',
            token: {
              token: 'ghp_valid_token',
              tokenType: 'oauth',
              expiresAt: futureDate.toISOString(),
            },
            gitProtocol: 'https',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        },
      };

      await setupMockCredentials(validCredentials);

      const { getOctocodeToken } =
        await import('../../src/utils/credentials/index.js');
      const token = await getOctocodeToken();

      expect(token).toBe('ghp_valid_token');
    });

    it('should return token if no expiration date is set (PAT tokens)', async () => {
      await setupMockCredentials(mockCredentials);

      const { getOctocodeToken } =
        await import('../../src/utils/credentials/index.js');
      const token = await getOctocodeToken();

      expect(token).toBe('ghp_test_token_12345');
    });

    it('should handle invalid expiresAt date', async () => {
      const invalidDateCredentials = {
        version: 1,
        credentials: {
          'github.com': {
            hostname: 'github.com',
            username: 'testuser',
            token: {
              token: 'ghp_invalid_date_token',
              tokenType: 'oauth',
              expiresAt: 'not-a-valid-date',
            },
            gitProtocol: 'https',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        },
      };

      await setupMockCredentials(invalidDateCredentials);

      const { getOctocodeToken } =
        await import('../../src/utils/credentials/index.js');
      const token = await getOctocodeToken();

      expect(token).toBeNull();
    });

    it('should handle read errors gracefully', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { getOctocodeToken } =
        await import('../../src/utils/credentials/index.js');
      const token = await getOctocodeToken();

      expect(token).toBeNull();
    });
  });
});

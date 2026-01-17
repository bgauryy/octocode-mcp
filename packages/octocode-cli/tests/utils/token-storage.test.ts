import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock octocode-shared with all the credential functions
vi.mock('octocode-shared', () => ({
  // Core credential functions
  initializeSecureStorage: vi.fn().mockResolvedValue(false),
  isSecureStorageAvailable: vi.fn().mockReturnValue(false),
  isUsingSecureStorage: vi.fn().mockReturnValue(false),
  storeCredentials: vi
    .fn()
    .mockResolvedValue({ success: true, insecureStorageUsed: true }),
  getCredentials: vi.fn().mockResolvedValue(null),
  getCredentialsSync: vi.fn().mockReturnValue(null),
  deleteCredentials: vi.fn().mockResolvedValue({
    success: true,
    deletedFromSecure: false,
    deletedFromFile: false,
  }),
  updateToken: vi
    .fn()
    .mockResolvedValue({ success: true, insecureStorageUsed: true }),
  listStoredHosts: vi.fn().mockResolvedValue([]),
  listStoredHostsSync: vi.fn().mockReturnValue([]),
  hasCredentials: vi.fn().mockResolvedValue(false),
  hasCredentialsSync: vi.fn().mockReturnValue(false),
  isTokenExpired: vi.fn().mockReturnValue(false),
  isRefreshTokenExpired: vi.fn().mockReturnValue(false),
  refreshAuthToken: vi
    .fn()
    .mockResolvedValue({ success: false, error: 'Mock' }),
  getTokenWithRefresh: vi
    .fn()
    .mockResolvedValue({ token: null, source: 'none' }),
  getCredentialsFilePath: vi
    .fn()
    .mockReturnValue('/mock/.octocode/credentials.json'),
  getTokenFromEnv: vi.fn().mockReturnValue(null),
  getEnvTokenSource: vi.fn().mockReturnValue(null),
  hasEnvToken: vi.fn().mockReturnValue(false),
  ENV_TOKEN_VARS: ['OCTOCODE_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'],
  resolveTokenFull: vi.fn().mockResolvedValue(null),
  TimeoutError: class TimeoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TimeoutError';
    }
  },
  _setSecureStorageAvailable: vi.fn(),
  _resetSecureStorageState: vi.fn(),
  // Platform values needed by some tests
  isWindows: false,
  isMac: true,
  isLinux: false,
  HOME: '/Users/test',
}));

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

describe('Token Storage (re-exports from octocode-shared)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset mock return values after clearAllMocks
    const shared = await import('octocode-shared');
    vi.mocked(shared.initializeSecureStorage).mockResolvedValue(false);
    vi.mocked(shared.isSecureStorageAvailable).mockReturnValue(false);
    vi.mocked(shared.isUsingSecureStorage).mockReturnValue(false);
    vi.mocked(shared.storeCredentials).mockResolvedValue({
      success: true,
      insecureStorageUsed: true,
    });
    vi.mocked(shared.getCredentials).mockResolvedValue(null);
    vi.mocked(shared.getCredentialsSync).mockReturnValue(null);
    vi.mocked(shared.deleteCredentials).mockResolvedValue({
      success: true,
      deletedFromSecure: false,
      deletedFromFile: false,
    });
    vi.mocked(shared.updateToken).mockResolvedValue({
      success: true,
      insecureStorageUsed: true,
    });
    vi.mocked(shared.listStoredHosts).mockResolvedValue([]);
    vi.mocked(shared.listStoredHostsSync).mockReturnValue([]);
    vi.mocked(shared.hasCredentials).mockResolvedValue(false);
    vi.mocked(shared.hasCredentialsSync).mockReturnValue(false);
    vi.mocked(shared.isTokenExpired).mockReturnValue(false);
    vi.mocked(shared.isRefreshTokenExpired).mockReturnValue(false);
    vi.mocked(shared.refreshAuthToken).mockResolvedValue({
      success: false,
      error: 'Mock',
    });
    vi.mocked(shared.getTokenWithRefresh).mockResolvedValue({
      token: null,
      source: 'none',
    });
    vi.mocked(shared.getCredentialsFilePath).mockReturnValue(
      '/mock/.octocode/credentials.json'
    );
    vi.mocked(shared.getTokenFromEnv).mockReturnValue(null);
    vi.mocked(shared.getEnvTokenSource).mockReturnValue(null);
    vi.mocked(shared.hasEnvToken).mockReturnValue(false);
    vi.mocked(shared.resolveTokenFull).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initializeSecureStorage', () => {
    it('should initialize and return storage availability status', async () => {
      const { initializeSecureStorage } =
        await import('../../src/utils/token-storage.js');

      const result = await initializeSecureStorage();

      expect(typeof result).toBe('boolean');
    });

    it('should call the underlying shared implementation', async () => {
      const shared = await import('octocode-shared');
      const { initializeSecureStorage } =
        await import('../../src/utils/token-storage.js');

      await initializeSecureStorage();

      expect(shared.initializeSecureStorage).toHaveBeenCalled();
    });
  });

  describe('isSecureStorageAvailable', () => {
    it('should return false when keytar is unavailable', async () => {
      const { isSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      expect(isSecureStorageAvailable()).toBe(false);
    });

    it('should call the underlying shared implementation', async () => {
      const shared = await import('octocode-shared');
      const { isSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      isSecureStorageAvailable();

      expect(shared.isSecureStorageAvailable).toHaveBeenCalled();
    });
  });

  describe('internal state management', () => {
    it('should allow setting secure storage availability', async () => {
      const { _setSecureStorageAvailable } =
        await import('../../src/utils/token-storage.js');

      _setSecureStorageAvailable(true);
      _setSecureStorageAvailable(false);

      const shared = await import('octocode-shared');
      expect(shared._setSecureStorageAvailable).toHaveBeenCalledWith(true);
      expect(shared._setSecureStorageAvailable).toHaveBeenCalledWith(false);
    });

    it('should reset state correctly', async () => {
      const { _resetSecureStorageState } =
        await import('../../src/utils/token-storage.js');

      _resetSecureStorageState();

      const shared = await import('octocode-shared');
      expect(shared._resetSecureStorageState).toHaveBeenCalled();
    });
  });

  describe('storeCredentials', () => {
    it('should store credentials and return result', async () => {
      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');

      const result = await storeCredentials(createTestCredentials());

      expect(result.success).toBe(true);
      expect(result.insecureStorageUsed).toBe(true);
    });

    it('should call the underlying shared implementation with credentials', async () => {
      const shared = await import('octocode-shared');
      const { storeCredentials } =
        await import('../../src/utils/token-storage.js');
      const creds = createTestCredentials();

      await storeCredentials(creds);

      expect(shared.storeCredentials).toHaveBeenCalledWith(creds);
    });
  });

  describe('getCredentials', () => {
    it('should return null when credentials do not exist', async () => {
      const { getCredentials } =
        await import('../../src/utils/token-storage.js');

      const result = await getCredentials('github.com');

      expect(result).toBeNull();
    });

    it('should return credentials when they exist', async () => {
      const shared = await import('octocode-shared');
      const testCreds = createTestCredentials();
      vi.mocked(shared.getCredentials).mockResolvedValueOnce(testCreds);

      const { getCredentials } =
        await import('../../src/utils/token-storage.js');

      const result = await getCredentials('github.com');

      expect(result).toEqual(testCreds);
      expect(shared.getCredentials).toHaveBeenCalledWith('github.com');
    });
  });

  describe('getCredentialsSync', () => {
    it('should return null when credentials do not exist', async () => {
      const { getCredentialsSync } =
        await import('../../src/utils/token-storage.js');

      const result = getCredentialsSync('github.com');

      expect(result).toBeNull();
    });

    it('should return credentials from sync call', async () => {
      const shared = await import('octocode-shared');
      const testCreds = createTestCredentials();
      vi.mocked(shared.getCredentialsSync).mockReturnValueOnce(testCreds);

      const { getCredentialsSync } =
        await import('../../src/utils/token-storage.js');

      const result = getCredentialsSync('github.com');

      expect(result).toEqual(testCreds);
    });
  });

  describe('deleteCredentials', () => {
    it('should delete credentials and return result', async () => {
      const shared = await import('octocode-shared');
      vi.mocked(shared.deleteCredentials).mockResolvedValueOnce({
        success: true,
        deletedFromSecure: false,
        deletedFromFile: true,
      });

      const { deleteCredentials } =
        await import('../../src/utils/token-storage.js');

      const result = await deleteCredentials('github.com');

      expect(result.success).toBe(true);
      expect(shared.deleteCredentials).toHaveBeenCalledWith('github.com');
    });
  });

  describe('hasCredentials', () => {
    it('should return true when credentials exist', async () => {
      const shared = await import('octocode-shared');
      vi.mocked(shared.hasCredentials).mockResolvedValueOnce(true);

      const { hasCredentials } =
        await import('../../src/utils/token-storage.js');

      const result = await hasCredentials('github.com');

      expect(result).toBe(true);
    });

    it('should return false when credentials do not exist', async () => {
      const { hasCredentials } =
        await import('../../src/utils/token-storage.js');

      const result = await hasCredentials('unknown.host');

      expect(result).toBe(false);
    });
  });

  describe('hasCredentialsSync', () => {
    it('should return true when credentials exist', async () => {
      const shared = await import('octocode-shared');
      vi.mocked(shared.hasCredentialsSync).mockReturnValueOnce(true);

      const { hasCredentialsSync } =
        await import('../../src/utils/token-storage.js');

      const result = hasCredentialsSync('github.com');

      expect(result).toBe(true);
    });
  });

  describe('updateToken', () => {
    it('should update token and return result', async () => {
      const shared = await import('octocode-shared');
      vi.mocked(shared.updateToken).mockResolvedValueOnce({
        success: true,
        insecureStorageUsed: true,
      });

      const { updateToken } = await import('../../src/utils/token-storage.js');

      const newToken = { token: 'new-token', tokenType: 'oauth' as const };
      const result = await updateToken('github.com', newToken);

      expect(result.success).toBe(true);
      expect(shared.updateToken).toHaveBeenCalledWith('github.com', newToken);
    });
  });

  describe('listStoredHosts', () => {
    it('should return list of stored hostnames', async () => {
      const shared = await import('octocode-shared');
      vi.mocked(shared.listStoredHosts).mockResolvedValueOnce([
        'github.com',
        'github.enterprise.com',
      ]);

      const { listStoredHosts } =
        await import('../../src/utils/token-storage.js');

      const result = await listStoredHosts();

      expect(result).toEqual(['github.com', 'github.enterprise.com']);
    });
  });

  describe('listStoredHostsSync', () => {
    it('should return list of stored hostnames from sync call', async () => {
      const shared = await import('octocode-shared');
      vi.mocked(shared.listStoredHostsSync).mockReturnValueOnce(['github.com']);

      const { listStoredHostsSync } =
        await import('../../src/utils/token-storage.js');

      const result = listStoredHostsSync();

      expect(result).toEqual(['github.com']);
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for non-expired token', async () => {
      const { isTokenExpired } =
        await import('../../src/utils/token-storage.js');

      const result = isTokenExpired(createTestCredentials());

      expect(result).toBe(false);
    });

    it('should call the underlying shared implementation', async () => {
      const shared = await import('octocode-shared');
      const { isTokenExpired } =
        await import('../../src/utils/token-storage.js');
      const creds = createTestCredentials();

      isTokenExpired(creds);

      expect(shared.isTokenExpired).toHaveBeenCalledWith(creds);
    });
  });

  describe('getTokenFromEnv', () => {
    it('should return null when no env token', async () => {
      const { getTokenFromEnv } =
        await import('../../src/utils/token-storage.js');

      const result = getTokenFromEnv();

      expect(result).toBeNull();
    });

    it('should call the underlying shared implementation', async () => {
      const shared = await import('octocode-shared');
      const { getTokenFromEnv } =
        await import('../../src/utils/token-storage.js');

      getTokenFromEnv();

      expect(shared.getTokenFromEnv).toHaveBeenCalled();
    });
  });

  describe('getEnvTokenSource', () => {
    it('should return null when no env token', async () => {
      const shared = await import('octocode-shared');
      const { getEnvTokenSource } =
        await import('../../src/utils/token-storage.js');

      const result = getEnvTokenSource();

      expect(result).toBeNull();
      expect(shared.getEnvTokenSource).toHaveBeenCalled();
    });
  });

  describe('hasEnvToken', () => {
    it('should return false when no env token', async () => {
      const { hasEnvToken } = await import('../../src/utils/token-storage.js');

      const result = hasEnvToken();

      expect(result).toBe(false);
    });
  });

  describe('resolveTokenFull', () => {
    it('should return null when no token available', async () => {
      const { resolveTokenFull } =
        await import('../../src/utils/token-storage.js');

      const result = await resolveTokenFull();

      expect(result).toBeNull();
    });

    it('should return token when available', async () => {
      const shared = await import('octocode-shared');
      vi.mocked(shared.resolveTokenFull).mockResolvedValueOnce({
        token: 'test-token',
        source: 'env:GITHUB_TOKEN',
        wasRefreshed: false,
      });

      const { resolveTokenFull } =
        await import('../../src/utils/token-storage.js');

      const result = await resolveTokenFull();

      expect(result).toEqual({
        token: 'test-token',
        source: 'env:GITHUB_TOKEN',
        wasRefreshed: false,
      });
    });
  });

  describe('getCredentialsFilePath', () => {
    it('should return the credentials file path', async () => {
      const { getCredentialsFilePath } =
        await import('../../src/utils/token-storage.js');

      const result = getCredentialsFilePath();

      expect(result).toBe('/mock/.octocode/credentials.json');
    });
  });

  describe('ENV_TOKEN_VARS', () => {
    it('should export the env token variable names', async () => {
      const { ENV_TOKEN_VARS } =
        await import('../../src/utils/token-storage.js');

      expect(ENV_TOKEN_VARS).toEqual([
        'OCTOCODE_TOKEN',
        'GH_TOKEN',
        'GITHUB_TOKEN',
      ]);
    });
  });

  describe('TimeoutError', () => {
    it('should export TimeoutError class', async () => {
      const { TimeoutError } = await import('../../src/utils/token-storage.js');

      const error = new TimeoutError('Test timeout');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('Test timeout');
    });
  });
});

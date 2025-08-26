import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initialize,
  cleanup,
  getGitHubToken,
  getToken,
  clearCachedToken,
  getServerConfig,
  isBetaEnabled,
  isSamplingEnabled,
} from '../src/serverConfig.js';

// Mock dependencies
vi.mock('../src/utils/exec.js', () => ({
  getGithubCLIToken: vi.fn(),
}));

vi.mock('../src/security/credentialStore.js', () => ({
  SecureCredentialStore: {
    setToken: vi.fn(),
    getToken: vi.fn(),
    removeCredential: vi.fn(),
  },
}));

import { getGithubCLIToken } from '../src/utils/exec.js';
import { SecureCredentialStore } from '../src/security/credentialStore.js';

const mockGetGithubCLIToken = vi.mocked(getGithubCLIToken);
const mockSecureCredentialStore = vi.mocked(SecureCredentialStore);

describe('ServerConfig - Simplified Version', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    clearCachedToken();

    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.Authorization;
    delete process.env.BETA;
    delete process.env.ENABLE_LOGGING;

    // Setup default secure store behavior
    mockSecureCredentialStore.setToken.mockReturnValue('token-id-123');
    mockSecureCredentialStore.getToken.mockReturnValue(null);
    mockSecureCredentialStore.removeCredential.mockReturnValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
    cleanup();
    clearCachedToken();
  });

  describe('Configuration Initialization', () => {
    it('should initialize with default config', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null);

      await initialize();
      const config = getServerConfig();

      expect(config.version).toBeDefined();
      expect(config.timeout).toBe(30000);
      expect(config.maxRetries).toBe(3);
      expect(config.enableLogging).toBe(false);
      expect(config.betaEnabled).toBe(false);
    });

    it('should initialize with environment variables', async () => {
      process.env.BETA = '1';
      process.env.ENABLE_LOGGING = 'true';
      process.env.REQUEST_TIMEOUT = '60000';
      process.env.MAX_RETRIES = '5';
      mockGetGithubCLIToken.mockResolvedValue(null);

      await initialize();
      const config = getServerConfig();

      expect(config.betaEnabled).toBe(true);
      expect(config.enableLogging).toBe(true);
      expect(config.timeout).toBe(60000);
      expect(config.maxRetries).toBe(5);
    });

    it('should throw when accessing config before initialization', () => {
      expect(() => getServerConfig()).toThrow(
        'Configuration not initialized. Call initialize() first.'
      );
    });

    it('should not re-initialize when already initialized', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null);

      await initialize();
      const config1 = getServerConfig();

      await initialize(); // Second call
      const config2 = getServerConfig();

      expect(config1).toBe(config2); // Same reference
    });
  });

  describe('Token Resolution', () => {
    it('should get token from GitHub CLI first', async () => {
      process.env.GITHUB_TOKEN = 'env-token';
      mockGetGithubCLIToken.mockResolvedValue('cli-token');

      const token = await getGitHubToken();

      expect(token).toBe('cli-token');
      expect(mockGetGithubCLIToken).toHaveBeenCalled();
    });

    it('should fall back to GITHUB_TOKEN env var', async () => {
      process.env.GITHUB_TOKEN = 'env-github-token';
      mockGetGithubCLIToken.mockResolvedValue(null);

      const token = await getGitHubToken();

      expect(token).toBe('env-github-token');
    });

    it('should return null when no token found', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null);

      const token = await getGitHubToken();

      expect(token).toBeNull();
    });

    it('should cache token after first retrieval', async () => {
      mockGetGithubCLIToken.mockResolvedValue('cached-token');

      const token1 = await getGitHubToken();
      expect(token1).toBe('cached-token');

      // Clear mock to verify caching
      mockGetGithubCLIToken.mockClear();

      const token2 = await getGitHubToken();
      expect(token2).toBe('cached-token');
      expect(mockGetGithubCLIToken).not.toHaveBeenCalled();
    });

    it('should clear cache properly', async () => {
      mockGetGithubCLIToken.mockResolvedValue('initial-token');

      // Cache a token
      await getGitHubToken();

      // Clear cache and change mock
      clearCachedToken();
      mockGetGithubCLIToken.mockResolvedValue('new-token');

      const token = await getGitHubToken();
      expect(token).toBe('new-token');
    });
  });

  describe('getToken with Error Throwing', () => {
    it('should return token when available', async () => {
      process.env.GITHUB_TOKEN = 'available-token';
      mockGetGithubCLIToken.mockResolvedValue(null);

      const token = await getToken();

      expect(token).toBe('available-token');
      // Note: simplified implementation doesn't use SecureCredentialStore
    });

    it('should throw when no token available', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null);

      await expect(getToken()).rejects.toThrow(
        'No GitHub token found. Please authenticate with GitHub CLI (gh auth login) or set GITHUB_TOKEN/GH_TOKEN environment variable'
      );
    });
  });

  describe('Beta Features', () => {
    it('should detect beta features correctly', async () => {
      process.env.BETA = '1';
      mockGetGithubCLIToken.mockResolvedValue(null);

      await initialize();

      expect(isBetaEnabled()).toBe(true);
      expect(isSamplingEnabled()).toBe(true);
    });

    it('should handle disabled beta features', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null);

      await initialize();

      expect(isBetaEnabled()).toBe(false);
      expect(isSamplingEnabled()).toBe(false);
    });

    it('should handle various beta flag formats', async () => {
      const testCases = [
        { value: '1', expected: true },
        { value: 'true', expected: true },
        { value: 'TRUE', expected: true },
        { value: 'false', expected: false },
        { value: '0', expected: false },
        { value: '', expected: false },
      ];

      for (const testCase of testCases) {
        cleanup();
        process.env.BETA = testCase.value;
        mockGetGithubCLIToken.mockResolvedValue(null);

        await initialize();

        expect(isBetaEnabled()).toBe(testCase.expected);
        expect(isSamplingEnabled()).toBe(testCase.expected);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle GitHub CLI errors gracefully', async () => {
      mockGetGithubCLIToken.mockRejectedValue(new Error('CLI error'));
      process.env.GITHUB_TOKEN = 'fallback-token';

      const token = await getGitHubToken();

      expect(token).toBe('fallback-token');
    });

    it('should handle empty string tokens correctly', async () => {
      mockGetGithubCLIToken.mockResolvedValue('');
      process.env.GITHUB_TOKEN = '';

      const token = await getGitHubToken();
      expect(token).toBeNull();
    });

    it('should handle whitespace-only tokens', async () => {
      mockGetGithubCLIToken.mockResolvedValue('   ');

      const token = await getGitHubToken();
      expect(token).toBeNull(); // Trimmed to empty
    });
  });

  describe('Cleanup and State Management', () => {
    it('should reset state properly', async () => {
      process.env.GITHUB_TOKEN = 'test-token';
      mockGetGithubCLIToken.mockResolvedValue(null);

      await initialize();
      expect(getServerConfig()).toBeDefined();

      cleanup();
      expect(() => getServerConfig()).toThrow();
    });

    it('should handle multiple cleanup calls', () => {
      expect(() => {
        cleanup();
        cleanup();
        cleanup();
      }).not.toThrow();
    });
  });

  describe('Environment Variable Parsing', () => {
    it('should parse tool arrays correctly', async () => {
      process.env.ENABLE_TOOLS = 'tool1,tool2,tool3';
      process.env.DISABLE_TOOLS = 'tool4, tool5 , tool6';
      mockGetGithubCLIToken.mockResolvedValue(null);

      await initialize();
      const config = getServerConfig();

      expect(config.enableTools).toEqual(['tool1', 'tool2', 'tool3']);
      expect(config.disableTools).toEqual(['tool4', 'tool5', 'tool6']);
    });

    it('should handle empty tool arrays', async () => {
      process.env.ENABLE_TOOLS = '';
      process.env.DISABLE_TOOLS = '   ';
      mockGetGithubCLIToken.mockResolvedValue(null);

      await initialize();
      const config = getServerConfig();

      expect(config.enableTools).toBeUndefined();
      expect(config.disableTools).toBeUndefined();
    });

    it('should handle malformed numbers gracefully', async () => {
      process.env.REQUEST_TIMEOUT = 'not-a-number';
      process.env.MAX_RETRIES = '-5';
      mockGetGithubCLIToken.mockResolvedValue(null);

      await initialize();
      const config = getServerConfig();

      expect(config.timeout).toBe(30000); // Falls back to default 30000
      expect(config.maxRetries).toBe(0); // Math.max(0, -5) = 0
    });
  });
});

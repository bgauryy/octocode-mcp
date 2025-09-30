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
  isLoggingEnabled,
} from '../src/serverConfig.js';

// Mock dependencies
vi.mock('../src/utils/exec.js', () => ({
  getGithubCLIToken: vi.fn(),
}));

import { getGithubCLIToken } from '../src/utils/exec.js';

const mockGetGithubCLIToken = vi.mocked(getGithubCLIToken);

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
    delete process.env.TOOLS_TO_RUN;
    delete process.env.ENABLE_TOOLS;
    delete process.env.DISABLE_TOOLS;
    delete process.env.LOG;
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
        'Configuration not initialized. Call initialize() and await its completion before calling getServerConfig().'
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

  describe('Logging Configuration', () => {
    it('should enable logging by default when LOG is not set', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null);
      delete process.env.LOG;

      await initialize();

      expect(isLoggingEnabled()).toBe(true);
      expect(getServerConfig().loggingEnabled).toBe(true);
    });

    it('should enable logging when LOG is set to true', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null);
      process.env.LOG = 'true';

      await initialize();

      expect(isLoggingEnabled()).toBe(true);
      expect(getServerConfig().loggingEnabled).toBe(true);
    });

    it('should disable logging when LOG is set to false', async () => {
      mockGetGithubCLIToken.mockResolvedValue(null);
      process.env.LOG = 'false';

      await initialize();

      expect(isLoggingEnabled()).toBe(false);
      expect(getServerConfig().loggingEnabled).toBe(false);
    });

    it('should handle various LOG flag formats', async () => {
      const testCases = [
        {
          value: undefined,
          expected: true,
          description: 'undefined (default)',
        },
        { value: 'true', expected: true, description: 'true' },
        { value: 'TRUE', expected: true, description: 'TRUE' },
        { value: 'false', expected: false, description: 'false' },
        { value: 'FALSE', expected: false, description: 'FALSE' },
        { value: 'False', expected: false, description: 'False' },
        { value: '1', expected: true, description: '1 (truthy)' },
        { value: '0', expected: true, description: '0 (not false string)' },
        { value: '', expected: true, description: 'empty string' },
        { value: 'anything', expected: true, description: 'any other value' },
      ];

      for (const testCase of testCases) {
        cleanup();
        if (testCase.value === undefined) {
          delete process.env.LOG;
        } else {
          process.env.LOG = testCase.value;
        }
        mockGetGithubCLIToken.mockResolvedValue(null);

        await initialize();

        expect(isLoggingEnabled()).toBe(testCase.expected);
        expect(getServerConfig().loggingEnabled).toBe(testCase.expected);
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
      process.env.TOOLS_TO_RUN = 'onlyTool1, onlyTool2';
      mockGetGithubCLIToken.mockResolvedValue(null);

      await initialize();
      const config = getServerConfig();

      expect(config.enableTools).toEqual(['tool1', 'tool2', 'tool3']);
      expect(config.disableTools).toEqual(['tool4', 'tool5', 'tool6']);
      expect(config.toolsToRun).toEqual(['onlyTool1', 'onlyTool2']);
    });

    it('should handle empty tool arrays', async () => {
      process.env.ENABLE_TOOLS = '';
      process.env.DISABLE_TOOLS = '   ';
      process.env.TOOLS_TO_RUN = '';
      mockGetGithubCLIToken.mockResolvedValue(null);

      await initialize();
      const config = getServerConfig();

      expect(config.enableTools).toBeUndefined();
      expect(config.disableTools).toBeUndefined();
      expect(config.toolsToRun).toBeUndefined();
    });

    it('should parse toolsToRun correctly', async () => {
      process.env.TOOLS_TO_RUN =
        'github_search_code,github_search_pull_requests , github_fetch_content';
      mockGetGithubCLIToken.mockResolvedValue(null);

      await initialize();
      const config = getServerConfig();

      expect(config.toolsToRun).toEqual([
        'github_search_code',
        'github_search_pull_requests',
        'github_fetch_content',
      ]);
    });

    it('should handle toolsToRun with single tool', async () => {
      process.env.TOOLS_TO_RUN = 'github_search_code';
      mockGetGithubCLIToken.mockResolvedValue(null);

      await initialize();
      const config = getServerConfig();

      expect(config.toolsToRun).toEqual(['github_search_code']);
    });

    it('should filter out empty strings from toolsToRun', async () => {
      process.env.TOOLS_TO_RUN = 'tool1,,tool2, ,tool3';
      mockGetGithubCLIToken.mockResolvedValue(null);

      await initialize();
      const config = getServerConfig();

      expect(config.toolsToRun).toEqual(['tool1', 'tool2', 'tool3']);
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

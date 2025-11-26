import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
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

// Helper function to create mock process
function createMockProcess() {
  const mockProcess = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  mockProcess.stdout = new EventEmitter();
  mockProcess.stderr = new EventEmitter();
  mockProcess.kill = vi.fn();
  return mockProcess as unknown as ChildProcess;
}

// Helper function to mock spawn with success
function mockSpawnSuccess(token: string) {
  const mockProcess = createMockProcess();
  vi.mocked(spawn).mockReturnValue(mockProcess);
  setTimeout(() => {
    mockProcess.stdout!.emit('data', token + '\n');
    mockProcess.emit('close', 0);
  }, 10);
  return mockProcess;
}

// Helper function to mock spawn with failure
function mockSpawnFailure() {
  const mockProcess = createMockProcess();
  vi.mocked(spawn).mockReturnValue(mockProcess);
  setTimeout(() => {
    mockProcess.emit('close', 1);
  }, 10);
  return mockProcess;
}

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
    delete process.env.TOOLS_TO_RUN;
    delete process.env.ENABLE_TOOLS;
    delete process.env.DISABLE_TOOLS;
    delete process.env.LOG;
    delete process.env.TEST_GITHUB_TOKEN;
  });

  afterEach(() => {
    // Ensure cache is cleared between tests
    clearCachedToken();
  });

  afterEach(() => {
    process.env = originalEnv;
    cleanup();
    clearCachedToken();
  });

  describe('Configuration Initialization', () => {
    it('should initialize with default config', async () => {
      await initialize();
      const config = getServerConfig();

      expect(typeof config.version).toEqual('string');
      expect(config.timeout).toEqual(30000);
      expect(config.maxRetries).toEqual(3);
      expect(config.enableLogging).toEqual(true);
      expect(config.betaEnabled).toEqual(false);
    });

    it('should initialize with environment variables', async () => {
      process.env.BETA = '1';
      process.env.REQUEST_TIMEOUT = '60000';
      process.env.MAX_RETRIES = '5';

      await initialize();
      const config = getServerConfig();

      expect(config.betaEnabled).toBe(true);
      expect(config.enableLogging).toBe(true);
      expect(config.timeout).toBe(60000);
      expect(config.maxRetries).toBe(5);
    });

    it('should disable enableLogging when LOG is false', async () => {
      process.env.LOG = 'false';

      await initialize();
      const config = getServerConfig();

      expect(config.enableLogging).toBe(false);
    });

    it('should throw when accessing config before initialization', () => {
      expect(() => getServerConfig()).toThrow(
        'Configuration not initialized. Call initialize() and await its completion before calling getServerConfig().'
      );
    });

    it('should not re-initialize when already initialized', async () => {
      await initialize();
      const config1 = getServerConfig();

      await initialize(); // Second call
      const config2 = getServerConfig();

      expect(config1).toBe(config2); // Same reference
    });

    it('should use default GitHub API URL', async () => {
      await initialize();
      const config = getServerConfig();

      expect(config.githubApiUrl).toBe('https://api.github.com');
    });

    it('should use custom GitHub API URL from environment', async () => {
      process.env.GITHUB_API_URL = 'https://github.company.com/api/v3';

      await initialize();
      const config = getServerConfig();

      expect(config.githubApiUrl).toBe('https://github.company.com/api/v3');
    });
  });

  describe('Token Resolution', () => {
    it('should get token from GitHub CLI first', async () => {
      delete process.env.GITHUB_TOKEN;
      clearCachedToken();
      cleanup();

      mockSpawnSuccess('cli-token');
      const token = await getGitHubToken();

      expect(token).toBe('cli-token');
    });

    it('should fall back to GITHUB_TOKEN env var', async () => {
      process.env.GITHUB_TOKEN = 'env-github-token';
      clearCachedToken();

      mockSpawnFailure();
      const token = await getGitHubToken();

      expect(token).toBe('env-github-token');
    });

    it('should return null when no token found', async () => {
      delete process.env.GITHUB_TOKEN;
      clearCachedToken();

      mockSpawnFailure();
      const token = await getGitHubToken();
      expect(token).toBeNull();
    });

    it('should cache token after first retrieval', async () => {
      delete process.env.GITHUB_TOKEN;
      clearCachedToken();

      mockSpawnSuccess('cached-token');
      const token1 = await getGitHubToken();
      expect(token1).toBe('cached-token');

      // Token should be cached now
      const token2 = await getGitHubToken();
      expect(token2).toBe('cached-token');
    });

    it('should clear cache properly', async () => {
      delete process.env.GITHUB_TOKEN;
      clearCachedToken();

      mockSpawnSuccess('initial-token');
      await getGitHubToken();

      // Clear cache and get new token
      clearCachedToken();
      mockSpawnSuccess('new-token');
      const token = await getGitHubToken();
      expect(token).toBe('new-token');
    });
  });

  describe('getToken with Error Throwing', () => {
    it('should return token when available', async () => {
      process.env.GITHUB_TOKEN = 'available-token';
      clearCachedToken();
      mockSpawnFailure();

      const token = await getToken();

      expect(token).toBe('available-token');
    });

    it('should throw when no token available', async () => {
      delete process.env.GITHUB_TOKEN;
      clearCachedToken();
      mockSpawnFailure();

      await expect(getToken()).rejects.toThrow(
        'No GitHub token found. Please authenticate with GitHub CLI (gh auth login) or set GITHUB_TOKEN/GH_TOKEN environment variable'
      );
    });
  });

  describe('Beta Features', () => {
    it('should detect beta features correctly', async () => {
      process.env.BETA = '1';
      mockSpawnFailure();

      await initialize();

      expect(isBetaEnabled()).toBe(true);
      expect(isSamplingEnabled()).toBe(true);
    });

    it('should handle disabled beta features', async () => {
      mockSpawnFailure();

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
        mockSpawnFailure();

        await initialize();

        expect(isBetaEnabled()).toBe(testCase.expected);
        expect(isSamplingEnabled()).toBe(testCase.expected);
      }
    });
  });

  describe('Logging Configuration', () => {
    it('should enable logging by default when LOG is not set', async () => {
      delete process.env.LOG;
      mockSpawnFailure();

      await initialize();

      expect(isLoggingEnabled()).toBe(true);
      expect(getServerConfig().loggingEnabled).toBe(true);
    });

    it('should enable logging when LOG is set to true', async () => {
      process.env.LOG = 'true';
      mockSpawnFailure();

      await initialize();

      expect(isLoggingEnabled()).toBe(true);
      expect(getServerConfig().loggingEnabled).toBe(true);
    });

    it('should disable logging when LOG is set to false', async () => {
      process.env.LOG = 'false';
      mockSpawnFailure();

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
        mockSpawnFailure();

        await initialize();

        expect(isLoggingEnabled()).toBe(testCase.expected);
        expect(getServerConfig().loggingEnabled).toBe(testCase.expected);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle GitHub CLI errors gracefully', async () => {
      process.env.GITHUB_TOKEN = 'fallback-token';
      clearCachedToken();
      mockSpawnFailure();

      const token = await getGitHubToken();

      expect(token).toBe('fallback-token');
    });

    it('should handle empty string tokens correctly', async () => {
      delete process.env.GITHUB_TOKEN;
      clearCachedToken();

      mockSpawnSuccess('   \n  ');
      const token = await getGitHubToken();
      expect(token).toBeNull();
    });

    it('should handle whitespace-only tokens', async () => {
      delete process.env.GITHUB_TOKEN;
      clearCachedToken();

      mockSpawnSuccess('   \n\t  ');
      const token = await getGitHubToken();
      expect(token).toBeNull(); // Trimmed to empty
    });
  });

  describe('Cleanup and State Management', () => {
    it('should reset state properly', async () => {
      process.env.GITHUB_TOKEN = 'test-token';
      mockSpawnFailure();

      await initialize();
      const config = getServerConfig();
      expect(typeof config).toEqual('object');

      cleanup();
      let didThrow = false;
      try {
        getServerConfig();
      } catch (e) {
        didThrow = true;
      }
      expect(didThrow).toEqual(true);
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
      mockSpawnFailure();

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
      mockSpawnFailure();

      await initialize();
      const config = getServerConfig();

      expect(config.enableTools).toEqual(undefined);
      expect(config.disableTools).toEqual(undefined);
      expect(config.toolsToRun).toEqual(undefined);
    });

    it('should parse toolsToRun correctly', async () => {
      process.env.TOOLS_TO_RUN =
        'github_search_code,github_search_pull_requests , github_fetch_content';
      mockSpawnFailure();

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
      mockSpawnFailure();

      await initialize();
      const config = getServerConfig();

      expect(config.toolsToRun).toEqual(['github_search_code']);
    });

    it('should filter out empty strings from toolsToRun', async () => {
      process.env.TOOLS_TO_RUN = 'tool1,,tool2, ,tool3';
      mockSpawnFailure();

      await initialize();
      const config = getServerConfig();

      expect(config.toolsToRun).toEqual(['tool1', 'tool2', 'tool3']);
    });

    it('should handle malformed numbers gracefully', async () => {
      process.env.REQUEST_TIMEOUT = 'not-a-number';
      process.env.MAX_RETRIES = '-5';
      mockSpawnFailure();

      await initialize();
      const config = getServerConfig();

      expect(config.timeout).toBe(30000); // Falls back to default 30000
      expect(config.maxRetries).toBe(0); // Math.max(0, -5) = 0
    });
  });
});

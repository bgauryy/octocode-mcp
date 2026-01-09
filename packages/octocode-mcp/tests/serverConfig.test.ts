import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import {
  initialize,
  cleanup,
  getGitHubToken,
  getToken,
  clearConfigCachedToken,
  getServerConfig,
  isLoggingEnabled,
  _setResolveTokenFn,
  _resetResolveTokenFn,
} from '../src/serverConfig.js';

// Mock function for resolve token (returns ResolvedToken | null)
const mockResolveToken = vi.fn();

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

// Helper function to mock token resolution
// Returns { token, source } or null
function mockTokenResolution(
  token: string | null,
  source: string = 'env:GITHUB_TOKEN'
) {
  if (token) {
    mockResolveToken.mockResolvedValue({ token, source });
  } else {
    mockResolveToken.mockResolvedValue(null);
  }
}

describe('ServerConfig - Simplified Version', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    clearConfigCachedToken();

    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.Authorization;
    delete process.env.TOOLS_TO_RUN;
    delete process.env.ENABLE_TOOLS;
    delete process.env.DISABLE_TOOLS;
    delete process.env.LOG;
    delete process.env.TEST_GITHUB_TOKEN;
    delete process.env.ENABLE_LOCAL;
    delete process.env.LOCAL;
    delete process.env.GITHUB_API_URL;
    delete process.env.REQUEST_TIMEOUT;
    delete process.env.MAX_RETRIES;

    // Set up injectable mock for token resolution
    _setResolveTokenFn(mockResolveToken);
    mockResolveToken.mockResolvedValue(null);
  });

  afterEach(() => {
    // Ensure cache is cleared between tests
    clearConfigCachedToken();
  });

  afterEach(() => {
    process.env = originalEnv;
    cleanup();
    clearConfigCachedToken();
    _resetResolveTokenFn();
  });

  describe('Configuration Initialization', () => {
    it('should initialize with default config', async () => {
      await initialize();
      const config = getServerConfig();

      expect(typeof config.version).toEqual('string');
      expect(config.timeout).toEqual(30000);
      expect(config.maxRetries).toEqual(3);
      expect(config.enableLogging).toEqual(true);
    });

    it('should initialize with environment variables', async () => {
      process.env.REQUEST_TIMEOUT = '60000';
      process.env.MAX_RETRIES = '5';

      await initialize();
      const config = getServerConfig();

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
    it('should prioritize GITHUB_TOKEN env var over CLI token', async () => {
      process.env.GITHUB_TOKEN = 'env-github-token';
      clearConfigCachedToken();
      cleanup();

      // Mock resolveToken to return env token (simulating env var priority)
      mockTokenResolution('env-github-token', 'env:GITHUB_TOKEN');
      mockSpawnSuccess('cli-token');
      const token = await getGitHubToken();

      // GITHUB_TOKEN takes priority even when CLI token is available
      expect(token).toBe('env-github-token');
    });

    it('should fall back to CLI token when GITHUB_TOKEN is not set', async () => {
      delete process.env.GITHUB_TOKEN;
      clearConfigCachedToken();
      cleanup();

      mockSpawnSuccess('cli-token');
      const token = await getGitHubToken();

      expect(token).toBe('cli-token');
    });

    it('should return null when no token found', async () => {
      delete process.env.GITHUB_TOKEN;
      clearConfigCachedToken();

      mockSpawnFailure();
      const token = await getGitHubToken();
      expect(token).toBeNull();
    });

    it('should cache token after first retrieval', async () => {
      delete process.env.GITHUB_TOKEN;
      clearConfigCachedToken();

      mockSpawnSuccess('cached-token');
      const token1 = await getGitHubToken();
      expect(token1).toBe('cached-token');

      // Token should be cached now
      const token2 = await getGitHubToken();
      expect(token2).toBe('cached-token');
    });

    it('should clear cache properly', async () => {
      delete process.env.GITHUB_TOKEN;
      clearConfigCachedToken();

      mockSpawnSuccess('initial-token');
      await getGitHubToken();

      // Clear cache and get new token
      clearConfigCachedToken();
      mockSpawnSuccess('new-token');
      const token = await getGitHubToken();
      expect(token).toBe('new-token');
    });
  });

  describe('octocode-cli Credential Fallback', () => {
    it('should use octocode-cli token when GITHUB_TOKEN and gh CLI are unavailable', async () => {
      delete process.env.GITHUB_TOKEN;
      clearConfigCachedToken();

      // gh CLI fails
      mockSpawnFailure();
      // octocode-cli has token
      mockTokenResolution('octocode-stored-token');

      const token = await getGitHubToken();

      expect(token).toBe('octocode-stored-token');
    });

    it('should prioritize GITHUB_TOKEN over octocode-cli token', async () => {
      process.env.GITHUB_TOKEN = 'env-token';
      clearConfigCachedToken();

      // Mock resolveToken to return env token (simulating priority)
      mockTokenResolution('env-token', 'env:GITHUB_TOKEN');
      mockSpawnFailure();

      const token = await getGitHubToken();

      expect(token).toBe('env-token');
    });

    it('should prioritize gh CLI token over octocode-cli token', async () => {
      delete process.env.GITHUB_TOKEN;
      clearConfigCachedToken();

      // Mock resolveToken to return null so gh CLI fallback is used
      mockTokenResolution(null);
      mockSpawnSuccess('gh-cli-token');

      const token = await getGitHubToken();

      expect(token).toBe('gh-cli-token');
    });

    it('should return null when all token sources fail', async () => {
      delete process.env.GITHUB_TOKEN;
      clearConfigCachedToken();

      mockSpawnFailure();
      mockTokenResolution(null);

      const token = await getGitHubToken();

      expect(token).toBeNull();
    });

    it('should handle octocode-cli token with whitespace', async () => {
      delete process.env.GITHUB_TOKEN;
      clearConfigCachedToken();

      mockSpawnFailure();
      // Token is returned trimmed by resolveToken
      mockTokenResolution('octocode-token-with-spaces');

      const token = await getGitHubToken();

      expect(token).toBe('octocode-token-with-spaces');
    });

    it('should skip empty octocode-cli token', async () => {
      delete process.env.GITHUB_TOKEN;
      clearConfigCachedToken();

      mockSpawnFailure();
      // Empty/whitespace tokens resolve to null
      mockTokenResolution(null);

      const token = await getGitHubToken();

      expect(token).toBeNull();
    });

    it('should handle octocode-cli errors gracefully', async () => {
      delete process.env.GITHUB_TOKEN;
      clearConfigCachedToken();

      mockSpawnFailure();
      mockResolveToken.mockRejectedValue(new Error('Read error'));

      const token = await getGitHubToken();

      expect(token).toBeNull();
    });
  });

  describe('getToken with Error Throwing', () => {
    it('should return token when available', async () => {
      process.env.GITHUB_TOKEN = 'available-token';
      clearConfigCachedToken();
      // Mock resolveToken to return the env token
      mockTokenResolution('available-token', 'env:GITHUB_TOKEN');
      mockSpawnFailure();

      const token = await getToken();

      expect(token).toBe('available-token');
    });

    it('should throw when no token available', async () => {
      delete process.env.GITHUB_TOKEN;
      clearConfigCachedToken();
      mockSpawnFailure();

      await expect(getToken()).rejects.toThrow(
        'No GitHub token found. Please authenticate with GitHub CLI (gh auth login) or set GITHUB_TOKEN/GH_TOKEN environment variable'
      );
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
        { value: '0', expected: false, description: '0 (falsy)' },
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
      clearConfigCachedToken();
      // Mock resolveToken to return env token
      mockTokenResolution('fallback-token', 'env:GITHUB_TOKEN');
      mockSpawnFailure();

      const token = await getGitHubToken();

      expect(token).toBe('fallback-token');
    });

    it('should handle empty string tokens correctly', async () => {
      delete process.env.GITHUB_TOKEN;
      clearConfigCachedToken();

      mockSpawnSuccess('   \n  ');
      const token = await getGitHubToken();
      expect(token).toBeNull();
    });

    it('should handle whitespace-only tokens', async () => {
      delete process.env.GITHUB_TOKEN;
      clearConfigCachedToken();

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
      } catch {
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

  describe('ENABLE_LOCAL Configuration', () => {
    beforeEach(() => {
      delete process.env.ENABLE_LOCAL;
      delete process.env.LOCAL;
    });

    it('should default to false when ENABLE_LOCAL is not set', async () => {
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(false);
    });

    it('should enable local when ENABLE_LOCAL is "true"', async () => {
      process.env.ENABLE_LOCAL = 'true';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(true);
    });

    it('should enable local when ENABLE_LOCAL is "1"', async () => {
      process.env.ENABLE_LOCAL = '1';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(true);
    });

    it('should handle ENABLE_LOCAL with leading/trailing whitespace', async () => {
      process.env.ENABLE_LOCAL = '  true  ';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(true);
    });

    it('should handle ENABLE_LOCAL with tabs and newlines', async () => {
      process.env.ENABLE_LOCAL = '\t true \n';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(true);
    });

    it('should handle ENABLE_LOCAL with uppercase', async () => {
      process.env.ENABLE_LOCAL = 'TRUE';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(true);
    });

    it('should handle ENABLE_LOCAL with mixed case', async () => {
      process.env.ENABLE_LOCAL = 'TrUe';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(true);
    });

    it('should handle ENABLE_LOCAL with whitespace and uppercase', async () => {
      process.env.ENABLE_LOCAL = '  TRUE  ';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(true);
    });

    it('should handle ENABLE_LOCAL = "1" with whitespace', async () => {
      process.env.ENABLE_LOCAL = ' 1 ';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(true);
    });

    it('should return false for invalid ENABLE_LOCAL values', async () => {
      const invalidValues = [
        'false',
        'FALSE',
        '0',
        'no',
        'yes',
        'enabled',
        '',
        '   ',
      ];

      for (const value of invalidValues) {
        cleanup();
        delete process.env.ENABLE_LOCAL;
        delete process.env.LOCAL;
        process.env.ENABLE_LOCAL = value;
        mockSpawnFailure();
        await initialize();
        expect(getServerConfig().enableLocal).toBe(false);
      }
    });

    it('should use LOCAL as fallback when ENABLE_LOCAL is not set', async () => {
      delete process.env.ENABLE_LOCAL;
      process.env.LOCAL = 'true';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(true);
    });

    it('should use LOCAL = "1" as fallback', async () => {
      delete process.env.ENABLE_LOCAL;
      process.env.LOCAL = '1';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(true);
    });

    it('should handle LOCAL with whitespace', async () => {
      delete process.env.ENABLE_LOCAL;
      process.env.LOCAL = '  true  ';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(true);
    });

    it('should prefer ENABLE_LOCAL over LOCAL when both are set', async () => {
      process.env.ENABLE_LOCAL = 'true';
      process.env.LOCAL = 'false';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(true);
    });

    it('should use LOCAL if ENABLE_LOCAL is empty', async () => {
      process.env.ENABLE_LOCAL = '';
      process.env.LOCAL = 'true';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(true);
    });

    it('should use LOCAL if ENABLE_LOCAL is whitespace-only', async () => {
      process.env.ENABLE_LOCAL = '   ';
      process.env.LOCAL = '1';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(true);
    });

    it('should return false if both ENABLE_LOCAL and LOCAL are false', async () => {
      process.env.ENABLE_LOCAL = 'false';
      process.env.LOCAL = 'false';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().enableLocal).toBe(false);
    });
  });

  describe('LOG Configuration with Whitespace', () => {
    beforeEach(() => {
      delete process.env.LOG;
    });

    it('should handle LOG with leading/trailing whitespace for false', async () => {
      process.env.LOG = '  false  ';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().loggingEnabled).toBe(false);
    });

    it('should handle LOG with tabs for false', async () => {
      process.env.LOG = '\tfalse\t';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().loggingEnabled).toBe(false);
    });

    it('should handle LOG = "0" as false', async () => {
      process.env.LOG = '0';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().loggingEnabled).toBe(false);
    });

    it('should handle LOG = " 0 " with whitespace as false', async () => {
      process.env.LOG = ' 0 ';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().loggingEnabled).toBe(false);
    });

    it('should handle LOG = "FALSE" uppercase as false', async () => {
      process.env.LOG = 'FALSE';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().loggingEnabled).toBe(false);
    });

    it('should handle LOG = "  FALSE  " with whitespace and uppercase', async () => {
      process.env.LOG = '  FALSE  ';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().loggingEnabled).toBe(false);
    });

    it('should default to true for non-false values', async () => {
      const trueValues = ['true', 'TRUE', '1', 'yes', 'enabled', 'anything'];

      for (const value of trueValues) {
        cleanup();
        delete process.env.LOG;
        process.env.LOG = value;
        mockSpawnFailure();
        await initialize();
        expect(getServerConfig().loggingEnabled).toBe(true);
      }
    });
  });

  describe('Numeric Configuration with Whitespace', () => {
    it('should handle REQUEST_TIMEOUT with whitespace', async () => {
      process.env.REQUEST_TIMEOUT = '  60000  ';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().timeout).toBe(60000);
    });

    it('should handle MAX_RETRIES with whitespace', async () => {
      process.env.MAX_RETRIES = '  5  ';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().maxRetries).toBe(5);
    });

    it('should handle REQUEST_TIMEOUT with tabs', async () => {
      process.env.REQUEST_TIMEOUT = '\t45000\t';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().timeout).toBe(45000);
    });
  });

  describe('GITHUB_API_URL Configuration', () => {
    beforeEach(() => {
      delete process.env.GITHUB_API_URL;
    });

    it('should handle GITHUB_API_URL with trailing whitespace', async () => {
      process.env.GITHUB_API_URL = 'https://github.company.com/api/v3  ';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().githubApiUrl).toBe(
        'https://github.company.com/api/v3'
      );
    });

    it('should handle GITHUB_API_URL with leading whitespace', async () => {
      process.env.GITHUB_API_URL = '  https://github.company.com/api/v3';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().githubApiUrl).toBe(
        'https://github.company.com/api/v3'
      );
    });

    it('should handle GITHUB_API_URL with both leading and trailing whitespace', async () => {
      process.env.GITHUB_API_URL = '  https://github.company.com/api/v3  ';
      mockSpawnFailure();
      await initialize();
      expect(getServerConfig().githubApiUrl).toBe(
        'https://github.company.com/api/v3'
      );
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle all configs with various whitespace simultaneously', async () => {
      process.env.ENABLE_LOCAL = '  true  ';
      process.env.LOG = '  false  ';
      process.env.GITHUB_API_URL = '  https://custom.api.com  ';
      process.env.REQUEST_TIMEOUT = '  45000  ';
      process.env.MAX_RETRIES = '  7  ';
      process.env.TOOLS_TO_RUN = '  tool1  ,  tool2  ';
      mockSpawnFailure();

      await initialize();
      const config = getServerConfig();

      expect(config.enableLocal).toBe(true);
      expect(config.loggingEnabled).toBe(false);
      expect(config.githubApiUrl).toBe('https://custom.api.com');
      expect(config.timeout).toBe(45000);
      expect(config.maxRetries).toBe(7);
      expect(config.toolsToRun).toEqual(['tool1', 'tool2']);
    });

    it('should handle unicode whitespace characters', async () => {
      // Non-breaking space and other unicode whitespace
      process.env.ENABLE_LOCAL = '\u00A0true\u00A0';
      mockSpawnFailure();
      await initialize();
      // Note: trim() handles regular whitespace, unicode may vary
      expect(getServerConfig().enableLocal).toBe(true);
    });
  });
});

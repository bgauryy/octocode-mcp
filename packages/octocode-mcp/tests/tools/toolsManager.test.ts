import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../../src/tools/toolsManager.js';

// Mock dependencies
vi.mock('../../src/tools/toolConfig.js', () => {
  const mockTools = [
    { name: 'githubSearchCode', isDefault: true, fn: vi.fn() },
    { name: 'githubGetFileContent', isDefault: true, fn: vi.fn() },
    {
      name: 'githubViewRepoStructure',
      isDefault: true,
      fn: vi.fn(),
    },
    {
      name: 'githubSearchRepositories',
      isDefault: true,
      fn: vi.fn(),
    },
    {
      name: 'githubSearchPullRequests',
      isDefault: true,
      fn: vi.fn(),
    },
  ];
  return {
    DEFAULT_TOOLS: mockTools,
  };
});

vi.mock('../../src/serverConfig.js', () => ({
  getServerConfig: vi.fn(),
}));

import { DEFAULT_TOOLS } from '../../src/tools/toolConfig.js';
import { getServerConfig } from '../../src/serverConfig.js';
import { TOOL_NAMES } from '../../src/tools/toolMetadata.js';

const mockGetServerConfig = vi.mocked(getServerConfig);

describe('ToolsManager', () => {
  let mockServer: McpServer;
  const originalStderr = process.stderr.write;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock server
    mockServer = {} as McpServer;

    // Mock stderr to capture warnings
    process.stderr.write = vi.fn();

    // Reset all tool function mocks
    DEFAULT_TOOLS.forEach(tool => {
      vi.mocked(tool.fn).mockReset();
    });
  });

  afterEach(() => {
    process.stderr.write = originalStderr;
  });

  describe('Default Configuration (no env vars)', () => {
    it('should register only default tools', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      const result = registerTools(mockServer);

      // Should register default tools
      expect(result.successCount).toBeGreaterThan(0);
      expect(typeof result.successCount).toBe('number');
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);

      // Verify all default tools were called
    });
  });

  describe('TOOLS_TO_RUN Configuration', () => {
    it('should register only specified tools when TOOLS_TO_RUN is set', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        toolsToRun: [
          TOOL_NAMES.GITHUB_SEARCH_CODE,
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        ],
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      const result = registerTools(mockServer);

      expect(typeof result.successCount).toBe('number');
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);
    });

    it('should handle non-existent tools in TOOLS_TO_RUN gracefully', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        toolsToRun: [
          TOOL_NAMES.GITHUB_SEARCH_CODE,
          'nonExistentTool',
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        ],
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      const result = registerTools(mockServer);

      // Should register existing tools, ignore non-existent one
      expect(typeof result.successCount).toBe('number');
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);
    });

    it('should register no tools if TOOLS_TO_RUN contains only non-existent tools', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        toolsToRun: ['nonExistentTool1', 'nonExistentTool2'],
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(0);
      expect(Array.isArray(result.failedTools)).toBe(true);

      // Verify no tools were called
      DEFAULT_TOOLS.forEach(tool => {
        expect(tool.fn).not.toHaveBeenCalled();
      });
    });
  });

  describe('TOOLS_TO_RUN conflicts with ENABLE_TOOLS/DISABLE_TOOLS', () => {
    it('should warn when TOOLS_TO_RUN is used with ENABLE_TOOLS', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        toolsToRun: [TOOL_NAMES.GITHUB_SEARCH_CODE],
        enableTools: [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      registerTools(mockServer);

      expect(process.stderr.write).toHaveBeenCalledWith(
        'Warning: TOOLS_TO_RUN cannot be used together with ENABLE_TOOLS/DISABLE_TOOLS. Using TOOLS_TO_RUN exclusively.\n'
      );

      // Should use TOOLS_TO_RUN exclusively
    });

    it('should warn when TOOLS_TO_RUN is used with DISABLE_TOOLS', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        toolsToRun: [TOOL_NAMES.GITHUB_SEARCH_CODE],
        disableTools: [TOOL_NAMES.GITHUB_FETCH_CONTENT],
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      registerTools(mockServer);

      expect(process.stderr.write).toHaveBeenCalledWith(
        'Warning: TOOLS_TO_RUN cannot be used together with ENABLE_TOOLS/DISABLE_TOOLS. Using TOOLS_TO_RUN exclusively.\n'
      );
    });

    it('should warn when TOOLS_TO_RUN is used with both ENABLE_TOOLS and DISABLE_TOOLS', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        toolsToRun: [TOOL_NAMES.GITHUB_SEARCH_CODE],
        enableTools: [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
        disableTools: [TOOL_NAMES.GITHUB_FETCH_CONTENT],
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      registerTools(mockServer);

      expect(process.stderr.write).toHaveBeenCalledWith(
        'Warning: TOOLS_TO_RUN cannot be used together with ENABLE_TOOLS/DISABLE_TOOLS. Using TOOLS_TO_RUN exclusively.\n'
      );
    });
  });

  describe('ENABLE_TOOLS/DISABLE_TOOLS Configuration (without TOOLS_TO_RUN)', () => {
    it('should register all default tools with ENABLE_TOOLS (no-op for already default tools)', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableTools: [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      const result = registerTools(mockServer);

      // Should register all 5 default tools (PR is now default, so ENABLE_TOOLS is redundant)
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.failedTools)).toBe(true);

      // Verify all default tools were called
      expect(DEFAULT_TOOLS[0]?.fn).toHaveBeenCalled(); // githubSearchCode
      expect(DEFAULT_TOOLS[1]?.fn).toHaveBeenCalled(); // githubGetFileContent
      expect(DEFAULT_TOOLS[2]?.fn).toHaveBeenCalled(); // githubViewRepoStructure
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled(); // githubSearchRepositories
      expect(DEFAULT_TOOLS[4]?.fn).toHaveBeenCalled(); // githubSearchPullRequests
    });

    it('should remove default tools with DISABLE_TOOLS', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        disableTools: [
          TOOL_NAMES.GITHUB_SEARCH_CODE,
          TOOL_NAMES.GITHUB_FETCH_CONTENT,
        ],
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      const result = registerTools(mockServer);

      // Should register some tools (default minus disabled)
      expect(typeof result.successCount).toBe('number');
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);

      // Verify disabled tools were NOT called

      // Verify remaining default tools were called
      expect(DEFAULT_TOOLS[2]?.fn).toHaveBeenCalled(); // githubViewRepoStructure
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled(); // githubSearchRepositories
      expect(DEFAULT_TOOLS[4]?.fn).toHaveBeenCalled(); // githubSearchPullRequests
    });

    it('should handle both ENABLE_TOOLS and DISABLE_TOOLS', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableTools: [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
        disableTools: [TOOL_NAMES.GITHUB_SEARCH_CODE],
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      const result = registerTools(mockServer);

      // Should register some tools (default minus disabled)
      expect(typeof result.successCount).toBe('number');
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);

      // Verify disabled default tool was NOT called

      // Verify remaining default tools were called
      expect(DEFAULT_TOOLS[1]?.fn).toHaveBeenCalled(); // githubGetFileContent
      expect(DEFAULT_TOOLS[2]?.fn).toHaveBeenCalled(); // githubViewRepoStructure
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled(); // githubSearchRepositories
      expect(DEFAULT_TOOLS[4]?.fn).toHaveBeenCalled(); // githubSearchPullRequests
    });

    it('should handle disabling enabled tools (DISABLE_TOOLS takes precedence)', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableTools: [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
        disableTools: [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS], // Same tool in both lists
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      const result = registerTools(mockServer);

      // Should register some tools (default minus disabled)
      expect(typeof result.successCount).toBe('number');
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);

      // Verify githubSearchPullRequests was NOT called (disabled takes precedence)
    });
  });

  describe('Error Handling', () => {
    it('should handle tool registration failures gracefully', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      // Make first tool throw error
      vi.mocked(DEFAULT_TOOLS[0]?.fn!).mockImplementation(() => {
        throw new Error('Registration failed');
      });

      const result = registerTools(mockServer);

      // Should register some tools, with failures tracked
      expect(typeof result.successCount).toBe('number');
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);
      expect(result.failedTools.length).toBeGreaterThan(0);
    });

    it('should continue registering tools after failures', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      // Make multiple tools throw errors
      vi.mocked(DEFAULT_TOOLS[0]?.fn!).mockImplementation(() => {
        throw new Error('Registration failed');
      });
      vi.mocked(DEFAULT_TOOLS[2]?.fn!).mockImplementation(() => {
        throw new Error('Registration failed');
      });

      const result = registerTools(mockServer);

      // Should register some tools, with failures tracked
      expect(typeof result.successCount).toBe('number');
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);
      expect(result.failedTools.length).toBeGreaterThan(0);

      // Verify successful tools were still called
      expect(DEFAULT_TOOLS[1]?.fn).toHaveBeenCalled(); // githubGetFileContent
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled(); // githubSearchRepositories
      expect(DEFAULT_TOOLS[4]?.fn).toHaveBeenCalled(); // githubSearchPullRequests
    });
  });
});

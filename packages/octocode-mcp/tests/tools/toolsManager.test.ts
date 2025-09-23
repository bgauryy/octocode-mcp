import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../../src/tools/toolsManager.js';

// Mock dependencies
vi.mock('../../src/tools/tools.js', () => {
  const mockTools = [
    { name: 'githubSearchCode', isDefault: true, fn: vi.fn() },
    { name: 'githubGetFileContent', isDefault: true, fn: vi.fn() },
    { name: 'githubViewRepoStructure', isDefault: true, fn: vi.fn() },
    { name: 'githubSearchRepositories', isDefault: true, fn: vi.fn() },
    { name: 'githubSearchCommits', isDefault: false, fn: vi.fn() },
    { name: 'githubSearchPullRequests', isDefault: false, fn: vi.fn() },
  ];
  return {
    DEFAULT_TOOLS: mockTools,
  };
});

vi.mock('../../src/serverConfig.js', () => ({
  getServerConfig: vi.fn(),
}));

import { DEFAULT_TOOLS } from '../../src/tools/tools.js';
import { getServerConfig } from '../../src/serverConfig.js';

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
        enableLogging: false,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
      });

      const result = registerTools(mockServer);

      // Should register 4 default tools
      expect(result.successCount).toBe(4);
      expect(result.failedTools).toEqual([]);

      // Verify default tools were called
      expect(DEFAULT_TOOLS[0]?.fn).toHaveBeenCalledWith(mockServer); // githubSearchCode
      expect(DEFAULT_TOOLS[1]?.fn).toHaveBeenCalledWith(mockServer); // githubGetFileContent
      expect(DEFAULT_TOOLS[2]?.fn).toHaveBeenCalledWith(mockServer); // githubViewRepoStructure
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalledWith(mockServer); // githubSearchRepositories

      // Verify non-default tools were NOT called
      expect(DEFAULT_TOOLS[4]?.fn).not.toHaveBeenCalled(); // githubSearchCommits
      expect(DEFAULT_TOOLS[5]?.fn).not.toHaveBeenCalled(); // githubSearchPullRequests
    });
  });

  describe('TOOLS_TO_RUN Configuration', () => {
    it('should register only specified tools when TOOLS_TO_RUN is set', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        toolsToRun: ['githubSearchCode', 'githubSearchCommits'],
        enableLogging: false,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
      });

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(2);
      expect(result.failedTools).toEqual([]);

      // Verify only specified tools were called
      expect(DEFAULT_TOOLS[0]?.fn).toHaveBeenCalledWith(mockServer); // githubSearchCode
      expect(DEFAULT_TOOLS[4]?.fn).toHaveBeenCalledWith(mockServer); // githubSearchCommits

      // Verify other tools were NOT called
      expect(DEFAULT_TOOLS[1]?.fn).not.toHaveBeenCalled(); // githubGetFileContent
      expect(DEFAULT_TOOLS[2]?.fn).not.toHaveBeenCalled(); // githubViewRepoStructure
      expect(DEFAULT_TOOLS[3]?.fn).not.toHaveBeenCalled(); // githubSearchRepositories
      expect(DEFAULT_TOOLS[5]?.fn).not.toHaveBeenCalled(); // githubSearchPullRequests
    });

    it('should handle non-existent tools in TOOLS_TO_RUN gracefully', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        toolsToRun: [
          'githubSearchCode',
          'nonExistentTool',
          'githubSearchCommits',
        ],
        enableLogging: false,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
      });

      const result = registerTools(mockServer);

      // Should register 2 existing tools, ignore non-existent one
      expect(result.successCount).toBe(2);
      expect(result.failedTools).toEqual([]);

      expect(DEFAULT_TOOLS[0]?.fn).toHaveBeenCalledWith(mockServer); // githubSearchCode
      expect(DEFAULT_TOOLS[4]?.fn).toHaveBeenCalledWith(mockServer); // githubSearchCommits
    });

    it('should register no tools if TOOLS_TO_RUN contains only non-existent tools', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        toolsToRun: ['nonExistentTool1', 'nonExistentTool2'],
        enableLogging: false,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
      });

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(0);
      expect(result.failedTools).toEqual([]);

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
        toolsToRun: ['githubSearchCode'],
        enableTools: ['githubSearchCommits'],
        enableLogging: false,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
      });

      registerTools(mockServer);

      expect(process.stderr.write).toHaveBeenCalledWith(
        'Warning: TOOLS_TO_RUN cannot be used together with ENABLE_TOOLS/DISABLE_TOOLS. Using TOOLS_TO_RUN exclusively.\n'
      );

      // Should use TOOLS_TO_RUN exclusively
      expect(DEFAULT_TOOLS[0]?.fn).toHaveBeenCalledWith(mockServer); // githubSearchCode
      expect(DEFAULT_TOOLS[4]?.fn).not.toHaveBeenCalled(); // githubSearchCommits
    });

    it('should warn when TOOLS_TO_RUN is used with DISABLE_TOOLS', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        toolsToRun: ['githubSearchCode'],
        disableTools: ['githubGetFileContent'],
        enableLogging: false,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
      });

      registerTools(mockServer);

      expect(process.stderr.write).toHaveBeenCalledWith(
        'Warning: TOOLS_TO_RUN cannot be used together with ENABLE_TOOLS/DISABLE_TOOLS. Using TOOLS_TO_RUN exclusively.\n'
      );
    });

    it('should warn when TOOLS_TO_RUN is used with both ENABLE_TOOLS and DISABLE_TOOLS', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        toolsToRun: ['githubSearchCode'],
        enableTools: ['githubSearchCommits'],
        disableTools: ['githubGetFileContent'],
        enableLogging: false,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
      });

      registerTools(mockServer);

      expect(process.stderr.write).toHaveBeenCalledWith(
        'Warning: TOOLS_TO_RUN cannot be used together with ENABLE_TOOLS/DISABLE_TOOLS. Using TOOLS_TO_RUN exclusively.\n'
      );
    });
  });

  describe('ENABLE_TOOLS/DISABLE_TOOLS Configuration (without TOOLS_TO_RUN)', () => {
    it('should add non-default tools with ENABLE_TOOLS', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        enableTools: ['githubSearchPullRequests', 'githubSearchCommits'],
        enableLogging: false,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
      });

      const result = registerTools(mockServer);

      // Should register 4 default tools + 2 enabled tools = 6 tools
      expect(result.successCount).toBe(6);
      expect(result.failedTools).toEqual([]);

      // Verify all default tools were called
      expect(DEFAULT_TOOLS[0]?.fn).toHaveBeenCalled(); // githubSearchCode
      expect(DEFAULT_TOOLS[1]?.fn).toHaveBeenCalled(); // githubGetFileContent
      expect(DEFAULT_TOOLS[2]?.fn).toHaveBeenCalled(); // githubViewRepoStructure
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled(); // githubSearchRepositories

      // Verify enabled tools were called
      expect(DEFAULT_TOOLS[4]?.fn).toHaveBeenCalled(); // githubSearchCommits
      expect(DEFAULT_TOOLS[5]?.fn).toHaveBeenCalled(); // githubSearchPullRequests
    });

    it('should remove default tools with DISABLE_TOOLS', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        disableTools: ['githubSearchCode', 'githubGetFileContent'],
        enableLogging: false,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
      });

      const result = registerTools(mockServer);

      // Should register 4 default tools - 2 disabled tools = 2 tools
      expect(result.successCount).toBe(2);
      expect(result.failedTools).toEqual([]);

      // Verify disabled tools were NOT called
      expect(DEFAULT_TOOLS[0]?.fn).not.toHaveBeenCalled(); // githubSearchCode
      expect(DEFAULT_TOOLS[1]?.fn).not.toHaveBeenCalled(); // githubGetFileContent

      // Verify remaining default tools were called
      expect(DEFAULT_TOOLS[2]?.fn).toHaveBeenCalled(); // githubViewRepoStructure
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled(); // githubSearchRepositories
    });

    it('should handle both ENABLE_TOOLS and DISABLE_TOOLS', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        enableTools: ['githubSearchCommits'],
        disableTools: ['githubSearchCode'],
        enableLogging: false,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
      });

      const result = registerTools(mockServer);

      // Should register (4 default - 1 disabled + 1 enabled) = 4 tools
      expect(result.successCount).toBe(4);
      expect(result.failedTools).toEqual([]);

      // Verify disabled default tool was NOT called
      expect(DEFAULT_TOOLS[0]?.fn).not.toHaveBeenCalled(); // githubSearchCode

      // Verify remaining default tools were called
      expect(DEFAULT_TOOLS[1]?.fn).toHaveBeenCalled(); // githubGetFileContent
      expect(DEFAULT_TOOLS[2]?.fn).toHaveBeenCalled(); // githubViewRepoStructure
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled(); // githubSearchRepositories

      // Verify enabled tool was called
      expect(DEFAULT_TOOLS[4]?.fn).toHaveBeenCalled(); // githubSearchCommits
    });

    it('should handle disabling enabled tools (DISABLE_TOOLS takes precedence)', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        enableTools: ['githubSearchCommits'],
        disableTools: ['githubSearchCommits'], // Same tool in both lists
        enableLogging: false,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
      });

      const result = registerTools(mockServer);

      // Should register 4 default tools (githubSearchCommits should be disabled)
      expect(result.successCount).toBe(4);
      expect(result.failedTools).toEqual([]);

      // Verify githubSearchCommits was NOT called (disabled takes precedence)
      expect(DEFAULT_TOOLS[4]?.fn).not.toHaveBeenCalled(); // githubSearchCommits
    });
  });

  describe('Error Handling', () => {
    it('should handle tool registration failures gracefully', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        enableLogging: false,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
      });

      // Make first tool throw error
      vi.mocked(DEFAULT_TOOLS[0]?.fn!).mockImplementation(() => {
        throw new Error('Registration failed');
      });

      const result = registerTools(mockServer);

      // Should register 3 successful tools, 1 failed
      expect(result.successCount).toBe(3);
      expect(result.failedTools).toEqual(['githubSearchCode']);
    });

    it('should continue registering tools after failures', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        enableLogging: false,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
      });

      // Make multiple tools throw errors
      vi.mocked(DEFAULT_TOOLS[0]?.fn!).mockImplementation(() => {
        throw new Error('Registration failed');
      });
      vi.mocked(DEFAULT_TOOLS[2]?.fn!).mockImplementation(() => {
        throw new Error('Registration failed');
      });

      const result = registerTools(mockServer);

      // Should register 2 successful tools, 2 failed
      expect(result.successCount).toBe(2);
      expect(result.failedTools).toEqual([
        'githubSearchCode',
        'githubViewRepoStructure',
      ]);

      // Verify successful tools were still called
      expect(DEFAULT_TOOLS[1]?.fn).toHaveBeenCalled(); // githubGetFileContent
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled(); // githubSearchRepositories
    });
  });
});

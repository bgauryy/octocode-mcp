import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../../src/tools/toolsManager.js';

// Mock toolMetadata module
vi.mock('../../src/tools/toolMetadata.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/tools/toolMetadata.js')
  >('../../src/tools/toolMetadata.js');
  return {
    ...actual,
    isToolAvailableSync: vi.fn(),
    TOOL_NAMES: {
      GITHUB_FETCH_CONTENT: 'githubGetFileContent',
      GITHUB_SEARCH_CODE: 'githubSearchCode',
      GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
      GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
      GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
    },
    DESCRIPTIONS: new Proxy(
      {},
      {
        get: (_target, prop: string) => {
          return `Description for ${prop}`;
        },
      }
    ),
  };
});

// Mock toolConfig
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
import { isToolAvailableSync } from '../../src/tools/toolMetadata.js';

const mockGetServerConfig = vi.mocked(getServerConfig);
const mockIsToolAvailableSync = vi.mocked(isToolAvailableSync);

describe('ToolsManager - Metadata Availability', () => {
  let mockServer: McpServer;
  const originalStderr = process.stderr.write;

  beforeEach(() => {
    vi.clearAllMocks();

    mockServer = {} as McpServer;

    // Mock stderr to capture warnings
    process.stderr.write = vi.fn();

    // Reset all tool function mocks
    DEFAULT_TOOLS.forEach(tool => {
      vi.mocked(tool.fn).mockReset();
    });

    // Default config
    mockGetServerConfig.mockReturnValue({
      version: '1.0.0',
      githubApiUrl: 'https://api.github.com',
      enableLogging: true,
      betaEnabled: false,
      timeout: 30000,
      maxRetries: 3,
      loggingEnabled: true,
    });
  });

  afterEach(() => {
    process.stderr.write = originalStderr;
  });

  describe('All Tools Available in Metadata', () => {
    it('should register all tools when all are available in metadata', () => {
      // All tools are available
      mockIsToolAvailableSync.mockReturnValue(true);

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(5);
      expect(result.failedTools).toEqual([]);

      // Verify all tools were called
      DEFAULT_TOOLS.forEach(tool => {
        expect(tool.fn).toHaveBeenCalledWith(mockServer, undefined);
      });

      // No stderr output for missing metadata
      expect(process.stderr.write).not.toHaveBeenCalled();
    });
  });

  describe('Single Tool Missing from Metadata', () => {
    it('should skip githubSearchCode when not in metadata', () => {
      mockIsToolAvailableSync.mockImplementation((toolName: string) => {
        return toolName !== 'githubSearchCode';
      });

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(4);
      expect(result.failedTools).toEqual([]);

      // Verify githubSearchCode was NOT called
      expect(DEFAULT_TOOLS[0]?.fn).not.toHaveBeenCalled();

      // Verify other tools were called
      expect(DEFAULT_TOOLS[1]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[2]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[4]?.fn).toHaveBeenCalled();

      // No stderr output (silent skip)
      expect(process.stderr.write).not.toHaveBeenCalled();
    });

    it('should skip githubGetFileContent when not in metadata', () => {
      mockIsToolAvailableSync.mockImplementation((toolName: string) => {
        return toolName !== 'githubGetFileContent';
      });

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(4);
      expect(result.failedTools).toEqual([]);

      expect(DEFAULT_TOOLS[1]?.fn).not.toHaveBeenCalled();
      expect(DEFAULT_TOOLS[0]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[2]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[4]?.fn).toHaveBeenCalled();

      expect(process.stderr.write).not.toHaveBeenCalled();
    });

    it('should skip githubViewRepoStructure when not in metadata', () => {
      mockIsToolAvailableSync.mockImplementation((toolName: string) => {
        return toolName !== 'githubViewRepoStructure';
      });

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(4);
      expect(result.failedTools).toEqual([]);

      expect(DEFAULT_TOOLS[2]?.fn).not.toHaveBeenCalled();
      expect(DEFAULT_TOOLS[0]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[1]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[4]?.fn).toHaveBeenCalled();

      expect(process.stderr.write).not.toHaveBeenCalled();
    });

    it('should skip githubSearchRepositories when not in metadata', () => {
      mockIsToolAvailableSync.mockImplementation((toolName: string) => {
        return toolName !== 'githubSearchRepositories';
      });

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(4);
      expect(result.failedTools).toEqual([]);

      expect(DEFAULT_TOOLS[3]?.fn).not.toHaveBeenCalled();
      expect(DEFAULT_TOOLS[0]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[1]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[2]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[4]?.fn).toHaveBeenCalled();

      expect(process.stderr.write).not.toHaveBeenCalled();
    });

    it('should skip githubSearchPullRequests when not in metadata', () => {
      mockIsToolAvailableSync.mockImplementation((toolName: string) => {
        return toolName !== 'githubSearchPullRequests';
      });

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(4);
      expect(result.failedTools).toEqual([]);

      expect(DEFAULT_TOOLS[4]?.fn).not.toHaveBeenCalled();
      expect(DEFAULT_TOOLS[0]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[1]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[2]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled();

      expect(process.stderr.write).not.toHaveBeenCalled();
    });
  });

  describe('Multiple Tools Missing from Metadata', () => {
    it('should skip multiple tools when not in metadata', () => {
      mockIsToolAvailableSync.mockImplementation((toolName: string) => {
        return (
          toolName !== 'githubSearchCode' &&
          toolName !== 'githubSearchPullRequests'
        );
      });

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(3);
      expect(result.failedTools).toEqual([]);

      expect(DEFAULT_TOOLS[0]?.fn).not.toHaveBeenCalled(); // githubSearchCode
      expect(DEFAULT_TOOLS[4]?.fn).not.toHaveBeenCalled(); // githubSearchPullRequests

      expect(DEFAULT_TOOLS[1]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[2]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled();

      expect(process.stderr.write).not.toHaveBeenCalled();
    });

    it('should skip all but one tool when most are missing from metadata', () => {
      mockIsToolAvailableSync.mockImplementation((toolName: string) => {
        return toolName === 'githubSearchCode';
      });

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(1);
      expect(result.failedTools).toEqual([]);

      expect(DEFAULT_TOOLS[0]?.fn).toHaveBeenCalled(); // githubSearchCode

      expect(DEFAULT_TOOLS[1]?.fn).not.toHaveBeenCalled();
      expect(DEFAULT_TOOLS[2]?.fn).not.toHaveBeenCalled();
      expect(DEFAULT_TOOLS[3]?.fn).not.toHaveBeenCalled();
      expect(DEFAULT_TOOLS[4]?.fn).not.toHaveBeenCalled();

      expect(process.stderr.write).not.toHaveBeenCalled();
    });
  });

  describe('No Tools Available in Metadata', () => {
    it('should register no tools when all are missing from metadata', () => {
      mockIsToolAvailableSync.mockReturnValue(false);

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(0);
      expect(result.failedTools).toEqual([]);

      // Verify no tools were called
      DEFAULT_TOOLS.forEach(tool => {
        expect(tool.fn).not.toHaveBeenCalled();
      });

      expect(process.stderr.write).not.toHaveBeenCalled();
    });
  });

  describe('Metadata Availability with TOOLS_TO_RUN', () => {
    it('should skip tools not in metadata even when specified in TOOLS_TO_RUN', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        toolsToRun: ['githubSearchCode', 'githubGetFileContent'],
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      // githubSearchCode is not in metadata
      mockIsToolAvailableSync.mockImplementation((toolName: string) => {
        return toolName !== 'githubSearchCode';
      });

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(1); // Only githubGetFileContent
      expect(result.failedTools).toEqual([]);

      expect(DEFAULT_TOOLS[0]?.fn).not.toHaveBeenCalled(); // githubSearchCode (not in metadata)
      expect(DEFAULT_TOOLS[1]?.fn).toHaveBeenCalled(); // githubGetFileContent

      // Should log for tools not in TOOLS_TO_RUN (but ARE in metadata)
      expect(process.stderr.write).toHaveBeenCalledWith(
        'Tool githubViewRepoStructure not specified in TOOLS_TO_RUN configuration\n'
      );
      expect(process.stderr.write).toHaveBeenCalledWith(
        'Tool githubSearchRepositories not specified in TOOLS_TO_RUN configuration\n'
      );
      expect(process.stderr.write).toHaveBeenCalledWith(
        'Tool githubSearchPullRequests not specified in TOOLS_TO_RUN configuration\n'
      );
      // Should NOT log for githubSearchCode (not in metadata - skipped silently)
      expect(process.stderr.write).not.toHaveBeenCalledWith(
        expect.stringContaining('githubSearchCode')
      );
    });

    it('should register no tools when TOOLS_TO_RUN specifies tools not in metadata', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        toolsToRun: ['githubSearchCode', 'githubGetFileContent'],
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      // None of the specified tools are in metadata
      mockIsToolAvailableSync.mockReturnValue(false);

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(0);
      expect(result.failedTools).toEqual([]);

      DEFAULT_TOOLS.forEach(tool => {
        expect(tool.fn).not.toHaveBeenCalled();
      });

      expect(process.stderr.write).not.toHaveBeenCalled();
    });
  });

  describe('Metadata Availability with DISABLE_TOOLS', () => {
    it('should respect both metadata availability and DISABLE_TOOLS', () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        disableTools: ['githubGetFileContent'],
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
      });

      // githubSearchCode is not in metadata, githubGetFileContent is disabled
      mockIsToolAvailableSync.mockImplementation((toolName: string) => {
        return toolName !== 'githubSearchCode';
      });

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(3); // 5 - 1 (not in metadata) - 1 (disabled)
      expect(result.failedTools).toEqual([]);

      expect(DEFAULT_TOOLS[0]?.fn).not.toHaveBeenCalled(); // githubSearchCode (not in metadata)
      expect(DEFAULT_TOOLS[1]?.fn).not.toHaveBeenCalled(); // githubGetFileContent (disabled)

      expect(DEFAULT_TOOLS[2]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[4]?.fn).toHaveBeenCalled();

      // Should log disabled tool but not missing metadata
      expect(process.stderr.write).toHaveBeenCalledWith(
        'Tool githubGetFileContent disabled by DISABLE_TOOLS configuration\n'
      );
    });
  });

  describe('Error Handling with Missing Metadata', () => {
    it('should handle registration errors for available tools', () => {
      mockIsToolAvailableSync.mockReturnValue(true);

      // Make first tool throw error
      vi.mocked(DEFAULT_TOOLS[0]?.fn!).mockImplementation(() => {
        throw new Error('Registration failed');
      });

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(4);
      expect(result.failedTools).toEqual(['githubSearchCode']);

      // Other tools should still be called
      expect(DEFAULT_TOOLS[1]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[2]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[4]?.fn).toHaveBeenCalled();
    });

    it('should not add missing metadata tools to failedTools', () => {
      // Some tools not in metadata
      mockIsToolAvailableSync.mockImplementation((toolName: string) => {
        return toolName !== 'githubSearchCode';
      });

      // Make another tool throw error
      vi.mocked(DEFAULT_TOOLS[1]?.fn!).mockImplementation(() => {
        throw new Error('Registration failed');
      });

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(3);
      // Only the tool that threw error should be in failedTools
      expect(result.failedTools).toEqual(['githubGetFileContent']);

      expect(DEFAULT_TOOLS[0]?.fn).not.toHaveBeenCalled(); // Not in metadata
      expect(DEFAULT_TOOLS[2]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[3]?.fn).toHaveBeenCalled();
      expect(DEFAULT_TOOLS[4]?.fn).toHaveBeenCalled();
    });
  });

  describe('Metadata Availability Check Edge Cases', () => {
    it('should handle isToolAvailableSync returning undefined gracefully', () => {
      mockIsToolAvailableSync.mockReturnValue(undefined as unknown as boolean);

      const result = registerTools(mockServer);

      // Undefined should be treated as false (not available)
      expect(result.successCount).toBe(0);
      expect(result.failedTools).toEqual([]);

      DEFAULT_TOOLS.forEach(tool => {
        expect(tool.fn).not.toHaveBeenCalled();
      });
    });

    it('should handle isToolAvailableSync throwing error gracefully', () => {
      mockIsToolAvailableSync.mockImplementation(() => {
        throw new Error('Metadata check failed');
      });

      const result = registerTools(mockServer);

      // Should treat as unavailable and skip all tools
      expect(result.successCount).toBe(0);
      expect(result.failedTools).toEqual([]);

      DEFAULT_TOOLS.forEach(tool => {
        expect(tool.fn).not.toHaveBeenCalled();
      });
    });
  });
});

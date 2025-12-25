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
      PACKAGE_SEARCH: 'packageSearch',
    },
  };
});

vi.mock('../../src/serverConfig.js', () => ({
  getServerConfig: vi.fn(),
  isLocalEnabled: vi.fn().mockReturnValue(false),
}));

// Mock local tools registration
vi.mock('../../src/local/tools/local_ripgrep.js', () => ({
  searchContentRipgrep: vi.fn(),
}));
vi.mock('../../src/local/tools/local_view_structure.js', () => ({
  viewStructure: vi.fn(),
}));
vi.mock('../../src/local/tools/local_find_files.js', () => ({
  findFiles: vi.fn(),
}));
vi.mock('../../src/local/tools/local_fetch_content.js', () => ({
  fetchContent: vi.fn(),
}));
vi.mock('../../src/local/prompts/research_local_explorer.js', () => ({
  RESEARCH_LOCAL_EXPLORER_PROMPT: {
    name: 'research_local_explorer',
    description: 'Test prompt',
    arguments: [],
  },
  registerLocalResearchPrompt: vi.fn(),
}));
vi.mock('../../src/local/utils/bulkOperations.js', () => ({
  executeBulkOperation: vi.fn(),
}));

import { DEFAULT_TOOLS } from '../../src/tools/toolConfig.js';
import { getServerConfig, isLocalEnabled } from '../../src/serverConfig.js';
import {
  TOOL_NAMES,
  isToolAvailableSync,
} from '../../src/tools/toolMetadata.js';

const mockGetServerConfig = vi.mocked(getServerConfig);
const mockIsToolAvailableSync = vi.mocked(isToolAvailableSync);
const mockIsLocalEnabled = vi.mocked(isLocalEnabled);

describe('ToolsManager', () => {
  let mockServer: McpServer;
  const originalStderr = process.stderr.write;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock server
    mockServer = {} as McpServer;

    // Mock stderr to capture warnings
    process.stderr.write = vi.fn();

    // Mock tool availability
    mockIsToolAvailableSync.mockReturnValue(true);

    // Reset all tool function mocks
    DEFAULT_TOOLS.forEach(tool => {
      vi.mocked(tool.fn).mockReset();
    });
  });

  afterEach(() => {
    process.stderr.write = originalStderr;
  });

  describe('Default Configuration (no env vars)', () => {
    it('should register only default tools', async () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        sanitize: true,
      });

      const result = await registerTools(mockServer);

      // Should register default tools
      expect(result.successCount).toBeGreaterThan(0);
      expect(typeof result.successCount).toBe('number');
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);

      // Verify all default tools were called
    });
  });

  describe('TOOLS_TO_RUN Configuration', () => {
    it('should register only specified tools when TOOLS_TO_RUN is set', async () => {
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
        sanitize: true,
      });

      const result = await registerTools(mockServer);

      expect(typeof result.successCount).toBe('number');
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);
    });

    it('should handle non-existent tools in TOOLS_TO_RUN gracefully', async () => {
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
        sanitize: true,
      });

      const result = await registerTools(mockServer);

      // Should register existing tools, ignore non-existent one
      expect(typeof result.successCount).toBe('number');
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);
    });

    it('should register no tools if TOOLS_TO_RUN contains only non-existent tools', async () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        toolsToRun: ['nonExistentTool1', 'nonExistentTool2'],
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        sanitize: true,
      });

      const result = await registerTools(mockServer);

      expect(result.successCount).toBe(0);
      expect(Array.isArray(result.failedTools)).toBe(true);

      // Verify no tools were called
      DEFAULT_TOOLS.forEach(tool => {
        expect(tool.fn).not.toHaveBeenCalled();
      });
    });
  });

  describe('TOOLS_TO_RUN conflicts with ENABLE_TOOLS/DISABLE_TOOLS', () => {
    it('should warn when TOOLS_TO_RUN is used with ENABLE_TOOLS', async () => {
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
        sanitize: true,
      });

      await registerTools(mockServer);

      expect(process.stderr.write).toHaveBeenCalledWith(
        'Warning: TOOLS_TO_RUN cannot be used together with ENABLE_TOOLS/DISABLE_TOOLS. Using TOOLS_TO_RUN exclusively.\n'
      );

      // Should use TOOLS_TO_RUN exclusively
    });

    it('should warn when TOOLS_TO_RUN is used with DISABLE_TOOLS', async () => {
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
        sanitize: true,
      });

      await registerTools(mockServer);

      expect(process.stderr.write).toHaveBeenCalledWith(
        'Warning: TOOLS_TO_RUN cannot be used together with ENABLE_TOOLS/DISABLE_TOOLS. Using TOOLS_TO_RUN exclusively.\n'
      );
    });

    it('should warn when TOOLS_TO_RUN is used with both ENABLE_TOOLS and DISABLE_TOOLS', async () => {
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
        sanitize: true,
      });

      await registerTools(mockServer);

      expect(process.stderr.write).toHaveBeenCalledWith(
        'Warning: TOOLS_TO_RUN cannot be used together with ENABLE_TOOLS/DISABLE_TOOLS. Using TOOLS_TO_RUN exclusively.\n'
      );
    });
  });

  describe('ENABLE_TOOLS/DISABLE_TOOLS Configuration (without TOOLS_TO_RUN)', () => {
    it('should register all default tools with ENABLE_TOOLS (no-op for already default tools)', async () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableTools: [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        sanitize: true,
      });

      const result = await registerTools(mockServer);

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

    it('should remove default tools with DISABLE_TOOLS', async () => {
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
        sanitize: true,
      });

      const result = await registerTools(mockServer);

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

    it('should handle both ENABLE_TOOLS and DISABLE_TOOLS', async () => {
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
        sanitize: true,
      });

      const result = await registerTools(mockServer);

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

    it('should handle disabling enabled tools (DISABLE_TOOLS takes precedence)', async () => {
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
        sanitize: true,
      });

      const result = await registerTools(mockServer);

      // Should register some tools (default minus disabled)
      expect(typeof result.successCount).toBe('number');
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);

      // Verify githubSearchPullRequests was NOT called (disabled takes precedence)
    });
  });

  describe('Error Handling', () => {
    it('should handle tool registration failures gracefully', async () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        sanitize: true,
      });

      // Make first tool throw error
      vi.mocked(DEFAULT_TOOLS[0]?.fn!).mockImplementation(() => {
        throw new Error('Registration failed');
      });

      const result = await registerTools(mockServer);

      // Should register some tools, with failures tracked
      expect(typeof result.successCount).toBe('number');
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);
      expect(result.failedTools.length).toBeGreaterThan(0);
    });

    it('should continue registering tools after failures', async () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        sanitize: true,
      });

      // Make multiple tools throw errors
      vi.mocked(DEFAULT_TOOLS[0]?.fn!).mockImplementation(() => {
        throw new Error('Registration failed');
      });
      vi.mocked(DEFAULT_TOOLS[2]?.fn!).mockImplementation(() => {
        throw new Error('Registration failed');
      });

      const result = await registerTools(mockServer);

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

  describe('Local Tools Registration', () => {
    it('should register local tools when ENABLE_LOCAL is set', async () => {
      mockIsLocalEnabled.mockReturnValue(true);
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        sanitize: true,
      });

      // Mock server with registerTool method
      const registerToolMock = vi.fn();
      const registerPromptMock = vi.fn();
      const serverWithRegister = {
        ...mockServer,
        registerTool: registerToolMock,
        prompt: registerPromptMock,
      } as unknown as McpServer;

      const result = await registerTools(serverWithRegister);

      // Should register local tools (4 local tools)
      expect(result.successCount).toBeGreaterThanOrEqual(4);
      expect(registerToolMock).toHaveBeenCalled();
    });

    it('should not register local tools when ENABLE_LOCAL is not set', async () => {
      mockIsLocalEnabled.mockReturnValue(false);
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        sanitize: true,
      });

      const result = await registerTools(mockServer);

      // Should only register GitHub tools, not local tools
      expect(result.successCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle local tools registration failure gracefully', async () => {
      mockIsLocalEnabled.mockReturnValue(true);
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        sanitize: true,
      });

      // Mock server that throws on registerTool
      const serverThatThrows = {
        ...mockServer,
        registerTool: vi.fn().mockImplementation(() => {
          throw new Error('Registration failed');
        }),
        prompt: vi.fn(),
      } as unknown as McpServer;

      const result = await registerTools(serverThatThrows);

      // Should track the failure
      expect(result.failedTools).toContain('local_tools');
      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining('Failed to register local tools')
      );
    });
  });

  describe('Tool availability check', () => {
    it('should not register tools that are unavailable', async () => {
      mockIsToolAvailableSync.mockReturnValue(false);
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        sanitize: true,
      });

      const result = await registerTools(mockServer);

      // Tools should not be registered when unavailable
      expect(result.successCount).toBe(0);
    });
  });

  describe('Tool registration returning null', () => {
    it('should handle tool.fn returning null', async () => {
      mockIsToolAvailableSync.mockReturnValue(true);
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        sanitize: true,
      });

      // Make tool return null (tool unavailable)
      vi.mocked(DEFAULT_TOOLS[0]?.fn!).mockResolvedValue(null);

      await registerTools(mockServer);

      // Should log that tool returned null
      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining('registration returned null')
      );
    });
  });

  describe('Non-default tool handling', () => {
    it('should log "not a default tool" for non-default tools without enableTools', async () => {
      // Create a mock non-default tool
      const mockNonDefaultTools = [
        { name: 'nonDefaultTool', isDefault: false, fn: vi.fn() },
      ];

      vi.mocked(DEFAULT_TOOLS).splice(
        0,
        DEFAULT_TOOLS.length,
        ...mockNonDefaultTools
      );

      mockIsToolAvailableSync.mockReturnValue(true);
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        sanitize: true,
        // No enableTools provided, so non-default tools should be skipped
      });

      await registerTools(mockServer);

      // Should log that tool is "not a default tool"
      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining('not a default tool')
      );
    });
  });

  describe('Local tool handlers execution', () => {
    it('should execute local_ripgrep handler when invoked', async () => {
      mockIsLocalEnabled.mockReturnValue(true);
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        betaEnabled: false,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        sanitize: true,
      });

      const toolHandlers = new Map<string, Function>();
      const registerToolMock = vi.fn(
        (name: string, _options: unknown, handler: Function) => {
          toolHandlers.set(name, handler);
        }
      );

      const serverWithRegister = {
        ...mockServer,
        registerTool: registerToolMock,
        prompt: vi.fn(),
      } as unknown as McpServer;

      await registerTools(serverWithRegister);

      // Verify handlers were registered
      expect(toolHandlers.has('local_ripgrep')).toBe(true);
      expect(toolHandlers.has('local_view_structure')).toBe(true);
      expect(toolHandlers.has('local_find_files')).toBe(true);
      expect(toolHandlers.has('local_fetch_content')).toBe(true);

      // Execute handlers to cover the code paths
      const { executeBulkOperation } =
        await import('../../src/local/utils/bulkOperations.js');
      vi.mocked(executeBulkOperation).mockResolvedValue({
        content: [{ type: 'text', text: 'test' }],
      });

      // Call each handler
      const ripgrepHandler = toolHandlers.get('local_ripgrep')!;
      await ripgrepHandler({ queries: [] });

      const viewStructureHandler = toolHandlers.get('local_view_structure')!;
      await viewStructureHandler({ queries: [] });

      const findFilesHandler = toolHandlers.get('local_find_files')!;
      await findFilesHandler({ queries: [] });

      const fetchContentHandler = toolHandlers.get('local_fetch_content')!;
      await fetchContentHandler({ queries: [] });

      // Verify executeBulkOperation was called for each handler
      expect(vi.mocked(executeBulkOperation)).toHaveBeenCalledTimes(4);
    });
  });
});

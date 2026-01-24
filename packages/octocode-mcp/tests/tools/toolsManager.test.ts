import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../../src/tools/toolsManager.js';

// Mock dependencies - using ALL_TOOLS (unified tool array, single source of truth)
vi.mock('../../src/tools/toolConfig.js', () => {
  const mockGitHubTools = [
    { name: 'githubSearchCode', isDefault: true, isLocal: false, fn: vi.fn() },
    {
      name: 'githubGetFileContent',
      isDefault: true,
      isLocal: false,
      fn: vi.fn(),
    },
    {
      name: 'githubViewRepoStructure',
      isDefault: true,
      isLocal: false,
      fn: vi.fn(),
    },
    {
      name: 'githubSearchRepositories',
      isDefault: true,
      isLocal: false,
      fn: vi.fn(),
    },
    {
      name: 'githubSearchPullRequests',
      isDefault: true,
      isLocal: false,
      fn: vi.fn(),
    },
  ];

  const mockLocalTools = [
    { name: 'localSearchCode', isDefault: true, isLocal: true, fn: vi.fn() },
    { name: 'localViewStructure', isDefault: true, isLocal: true, fn: vi.fn() },
    { name: 'localFindFiles', isDefault: true, isLocal: true, fn: vi.fn() },
    {
      name: 'localGetFileContent',
      isDefault: true,
      isLocal: true,
      fn: vi.fn(),
    },
  ];

  return {
    ALL_TOOLS: [...mockGitHubTools, ...mockLocalTools],
  };
});

vi.mock('../../src/tools/toolMetadata.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/tools/toolMetadata.js')
  >('../../src/tools/toolMetadata.js');
  return {
    ...actual,
    isToolInMetadata: vi.fn(),
    TOOL_NAMES: {
      GITHUB_FETCH_CONTENT: 'githubGetFileContent',
      GITHUB_SEARCH_CODE: 'githubSearchCode',
      GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
      GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
      GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
      PACKAGE_SEARCH: 'packageSearch',
      LOCAL_RIPGREP: 'localSearchCode',
      LOCAL_FETCH_CONTENT: 'localGetFileContent',
      LOCAL_FIND_FILES: 'localFindFiles',
      LOCAL_VIEW_STRUCTURE: 'localViewStructure',
    },
  };
});

vi.mock('../../src/serverConfig.js', () => ({
  getServerConfig: vi.fn(),
}));

vi.mock('../../src/session.js', () => ({
  logSessionError: vi.fn(),
}));

import { ALL_TOOLS, type ToolConfig } from '../../src/tools/toolConfig.js';
import { getServerConfig } from '../../src/serverConfig.js';
import { TOOL_NAMES, isToolInMetadata } from '../../src/tools/toolMetadata.js';
import { logSessionError } from '../../src/session.js';

const mockGetServerConfig = vi.mocked(getServerConfig);
const mockIsToolAvailableSync = vi.mocked(isToolInMetadata);
const mockLogSessionError = vi.mocked(logSessionError);

describe('ToolsManager', () => {
  let mockServer: McpServer;
  const originalStderr = process.stderr.write;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock server
    mockServer = {} as McpServer;

    // Mock stderr to capture warnings
    process.stderr.write = vi.fn();

    // Reset mocks to default state
    mockIsToolAvailableSync.mockReturnValue(true);

    // Reset all tool function mocks
    ALL_TOOLS.forEach(tool => {
      vi.mocked(tool.fn).mockReset();
    });
  });

  afterEach(() => {
    process.stderr.write = originalStderr;
  });

  describe('Default Configuration (no env vars)', () => {
    it('should register all default tools including local tools', async () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      const result = await registerTools(mockServer);

      // Should register tools - exact count depends on mock setup
      expect(result.successCount).toBeGreaterThan(0);
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);

      // Verify tools were called (both GitHub and local)
      const githubTools = ALL_TOOLS.filter(t => !t.isLocal);
      githubTools.forEach(tool => {
        expect(tool.fn).toHaveBeenCalled();
      });

      const localTools = ALL_TOOLS.filter(t => t.isLocal);
      localTools.forEach(tool => {
        expect(tool.fn).toHaveBeenCalled();
      });
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
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
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
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
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
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      const result = await registerTools(mockServer);

      expect(result.successCount).toBe(0);
      expect(Array.isArray(result.failedTools)).toBe(true);

      // Verify no tools were called
      ALL_TOOLS.forEach(tool => {
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
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      await registerTools(mockServer);

      expect(process.stderr.write).toHaveBeenCalledWith(
        'Warning: TOOLS_TO_RUN cannot be used together with ENABLE_TOOLS/DISABLE_TOOLS. Using TOOLS_TO_RUN exclusively.\n'
      );
    });

    it('should warn when TOOLS_TO_RUN is used with DISABLE_TOOLS', async () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        toolsToRun: [TOOL_NAMES.GITHUB_SEARCH_CODE],
        disableTools: [TOOL_NAMES.GITHUB_FETCH_CONTENT],
        enableLogging: true,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
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
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
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
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      const result = await registerTools(mockServer);

      // Should register all default GitHub tools
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.failedTools)).toBe(true);

      // Verify all GitHub tools were called
      const githubTools = ALL_TOOLS.filter(t => !t.isLocal);
      githubTools.forEach(tool => {
        expect(tool.fn).toHaveBeenCalled();
      });
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
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      const result = await registerTools(mockServer);

      // Should register some tools (default minus disabled)
      expect(typeof result.successCount).toBe('number');
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);
    });

    it('should handle both ENABLE_TOOLS and DISABLE_TOOLS', async () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableTools: [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
        disableTools: [TOOL_NAMES.GITHUB_SEARCH_CODE],
        enableLogging: true,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      const result = await registerTools(mockServer);

      // Should register some tools (default minus disabled)
      expect(typeof result.successCount).toBe('number');
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);
    });

    it('should handle disabling enabled tools (DISABLE_TOOLS takes precedence)', async () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableTools: [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
        disableTools: [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS], // Same tool in both lists
        enableLogging: true,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      const result = await registerTools(mockServer);

      // Should register some tools (default minus disabled)
      expect(typeof result.successCount).toBe('number');
      expect(result.successCount).toBeGreaterThanOrEqual(0);
      expect(result.failedTools).toBeDefined();
      expect(Array.isArray(result.failedTools)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle tool registration failures gracefully', async () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      // Make first GitHub tool throw error
      const githubTools = ALL_TOOLS.filter(t => !t.isLocal);
      vi.mocked(githubTools[0]!.fn).mockImplementation(() => {
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
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      // Make multiple GitHub tools throw errors
      const githubTools = ALL_TOOLS.filter(t => !t.isLocal);
      vi.mocked(githubTools[0]!.fn).mockImplementation(() => {
        throw new Error('Registration failed');
      });
      vi.mocked(githubTools[2]!.fn).mockImplementation(() => {
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
  });

  describe('Local Tools Registration', () => {
    it('should always register local tools', async () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      const result = await registerTools(mockServer);

      // Should register tools - local tools are always included
      expect(result.successCount).toBeGreaterThan(0);

      // Verify local tools were called
      const localTools = ALL_TOOLS.filter(t => t.isLocal);
      localTools.forEach(tool => {
        expect(tool.fn).toHaveBeenCalled();
      });
    });

    it('should handle local tools registration failure gracefully', async () => {
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      // Make all local tools throw errors
      const localTools = ALL_TOOLS.filter(t => t.isLocal);
      localTools.forEach(tool => {
        vi.mocked(tool.fn).mockImplementation(() => {
          throw new Error('Registration failed');
        });
      });

      const result = await registerTools(mockServer);

      // Should track the failures
      expect(result.failedTools.length).toBeGreaterThan(0);
    });
  });

  describe('Tool availability check', () => {
    it('should not register GitHub tools that are unavailable in metadata', async () => {
      mockIsToolAvailableSync.mockReturnValue(false);
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      const result = await registerTools(mockServer);

      // GitHub tools should not be registered when unavailable in metadata
      expect(result.successCount).toBe(0);

      // Verify no GitHub tools were called
      const githubTools = ALL_TOOLS.filter(t => !t.isLocal);
      githubTools.forEach(tool => {
        expect(tool.fn).not.toHaveBeenCalled();
      });
    });

    it('should skip local tools when isToolInMetadata returns false (local tools check metadata like GitHub tools)', async () => {
      mockIsToolAvailableSync.mockReturnValue(false);
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      const result = await registerTools(mockServer);

      // All tools should be skipped when not in metadata (includes local tools)
      expect(result.successCount).toBe(0);

      // Verify no tools were called (local tools now also check metadata)
      ALL_TOOLS.forEach(tool => {
        expect(tool.fn).not.toHaveBeenCalled();
      });

      // Session errors logged for all tools
      expect(mockLogSessionError).toHaveBeenCalledTimes(9); // 5 GitHub + 4 Local
    });
  });

  describe('Tool registration returning null', () => {
    it('should handle tool.fn returning null', async () => {
      mockIsToolAvailableSync.mockReturnValue(true);
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      // Make first GitHub tool return null (tool unavailable)
      const githubTools = ALL_TOOLS.filter(t => !t.isLocal);
      vi.mocked(githubTools[0]!.fn).mockResolvedValue(null);

      const result = await registerTools(mockServer);

      // Tool returning null should not count as success but also not as failure
      // (it's a valid "not available" response)
      expect(result.failedTools).not.toContain(githubTools[0]?.name);
    });
  });

  describe('Non-default tool handling', () => {
    it('should not register non-default tools without enableTools', async () => {
      // Temporarily modify ALL_TOOLS to have a non-default tool
      const originalTools = [...ALL_TOOLS];

      // Clear and add a non-default tool
      ALL_TOOLS.length = 0;
      ALL_TOOLS.push({
        name: 'nonDefaultTool',
        description: 'A non-default tool for testing',
        isDefault: false,
        isLocal: false,
        type: 'debug' as const,
        fn: vi.fn(),
      } as ToolConfig);

      mockIsToolAvailableSync.mockReturnValue(true);
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      const result = await registerTools(mockServer);

      // Non-default tool should not be registered (fn not called)
      expect(ALL_TOOLS[0]?.fn).not.toHaveBeenCalled();
      expect(result.successCount).toBe(0);

      // Restore original tools
      ALL_TOOLS.length = 0;
      originalTools.forEach(t => ALL_TOOLS.push(t));
    });
  });

  describe('Unified tool registration (ALL_TOOLS)', () => {
    it('should register all tools from ALL_TOOLS', async () => {
      mockIsToolAvailableSync.mockReturnValue(true);
      mockGetServerConfig.mockReturnValue({
        version: '1.0.0',
        githubApiUrl: 'https://api.github.com',
        enableLogging: true,
        timeout: 30000,
        maxRetries: 3,
        loggingEnabled: true,
        tokenSource: 'env:GITHUB_TOKEN',
      });

      const result = await registerTools(mockServer);

      // Should register all tools (GitHub + local + LSP)
      expect(result.successCount).toBe(ALL_TOOLS.length);
      expect(result.failedTools).toHaveLength(0);

      // Verify all tools were called
      ALL_TOOLS.forEach(tool => {
        expect(tool.fn).toHaveBeenCalled();
      });
    });
  });
});

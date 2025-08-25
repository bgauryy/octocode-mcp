import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  McpServer,
  RegisteredTool,
} from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock all tool registration functions
vi.mock('../../src/mcp/tools/github_search_code.js');
vi.mock('../../src/mcp/tools/github_fetch_content.js');
vi.mock('../../src/mcp/tools/github_search_repos.js');
vi.mock('../../src/mcp/tools/github_search_commits.js');
vi.mock('../../src/mcp/tools/github_search_pull_requests.js');
vi.mock('../../src/mcp/tools/package_search.js');
vi.mock('../../src/mcp/tools/github_view_repo_structure.js');

// Mock audit logger
vi.mock('../../src/security/auditLogger.js', () => ({
  logToolEvent: vi.fn(),
  AuditLogger: {
    initialize: vi.fn(),
  },
}));

// Mock config helper functions
vi.mock('../../config.js', () => ({
  getToolsToRun: vi.fn(),
  getEnableTools: vi.fn(),
  getDisableTools: vi.fn(),
}));

import { registerTools } from '../../src/mcp/tools/toolsManager.js';

// Import config helper mocks
import {
  getToolsToRun,
  getEnableTools,
  getDisableTools,
} from '../../config.js';

// Import the mocked functions for verification
import { registerGitHubSearchCodeTool } from '../../src/mcp/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../../src/mcp/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../../src/mcp/tools/github_search_repos.js';
import { registerSearchGitHubCommitsTool } from '../../src/mcp/tools/github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from '../../src/mcp/tools/github_search_pull_requests.js';
import { registerPackageSearchTool } from '../../src/mcp/tools/package_search.js';
import { registerViewGitHubRepoStructureTool } from '../../src/mcp/tools/github_view_repo_structure.js';
import { logToolEvent, AuditLogger } from '../../src/security/auditLogger.js';

const mockRegisterGitHubSearchCodeTool = vi.mocked(
  registerGitHubSearchCodeTool
);
const mockRegisterFetchGitHubFileContentTool = vi.mocked(
  registerFetchGitHubFileContentTool
);
const mockRegisterSearchGitHubReposTool = vi.mocked(
  registerSearchGitHubReposTool
);
const mockRegisterSearchGitHubCommitsTool = vi.mocked(
  registerSearchGitHubCommitsTool
);
const mockRegisterSearchGitHubPullRequestsTool = vi.mocked(
  registerSearchGitHubPullRequestsTool
);
const mockRegisterPackageSearchTool = vi.mocked(registerPackageSearchTool);
const mockRegisterViewGitHubRepoStructureTool = vi.mocked(
  registerViewGitHubRepoStructureTool
);

const mockLogToolEvent = vi.mocked(logToolEvent);
const mockAuditLogger = vi.mocked(AuditLogger);

// Config helper mocks
const mockGetToolsToRun = vi.mocked(getToolsToRun);
const mockGetEnableTools = vi.mocked(getEnableTools);
const mockGetDisableTools = vi.mocked(getDisableTools);

describe('registerTools', () => {
  let originalEnvVars: Record<string, string | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processStderrWriteSpy: any;

  const mockServer = {
    setRequestHandler: vi.fn(),
  } as unknown as McpServer;

  beforeEach(() => {
    // Save original environment variables
    originalEnvVars = { ...process.env };

    // Clear environment variables

    delete process.env.TOOLS_TO_RUN;

    // Reset mocks
    vi.clearAllMocks();

    // Setup default config mock returns
    mockGetToolsToRun.mockReturnValue(undefined);
    mockGetEnableTools.mockReturnValue(undefined);
    mockGetDisableTools.mockReturnValue(undefined);

    // Ensure all mocks are properly reset to not throw errors
    mockRegisterGitHubSearchCodeTool.mockImplementation(
      () => ({}) as RegisteredTool
    );
    mockRegisterFetchGitHubFileContentTool.mockImplementation(
      () => ({}) as RegisteredTool
    );
    mockRegisterSearchGitHubReposTool.mockImplementation(
      () => ({}) as RegisteredTool
    );
    mockRegisterSearchGitHubCommitsTool.mockImplementation(
      () => ({}) as RegisteredTool
    );
    mockRegisterSearchGitHubPullRequestsTool.mockImplementation(
      () => ({}) as RegisteredTool
    );
    mockRegisterPackageSearchTool.mockImplementation(
      () => ({}) as RegisteredTool
    );
    mockRegisterViewGitHubRepoStructureTool.mockImplementation(
      () => ({}) as RegisteredTool
    );

    // Mock process.stderr.write to avoid console output during tests
    processStderrWriteSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    // Clear audit logger mocks
    mockLogToolEvent.mockClear();
    mockAuditLogger.initialize.mockClear();
  });

  afterEach(() => {
    // Restore original environment variables
    process.env = { ...originalEnvVars };
    processStderrWriteSpy?.mockRestore();
  });

  it('should register only default tools when no TOOLS_TO_RUN is specified', () => {
    const result = registerTools(mockServer);

    expect(result.successCount).toBe(4);
    expect(result.failedTools).toHaveLength(0);

    // Verify default tools were called
    expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(mockServer);
    expect(mockRegisterFetchGitHubFileContentTool).toHaveBeenCalledWith(
      mockServer
    );
    expect(mockRegisterSearchGitHubReposTool).toHaveBeenCalledWith(mockServer);
    expect(mockRegisterViewGitHubRepoStructureTool).toHaveBeenCalledWith(
      mockServer
    );

    // Verify non-default tools were NOT called
    expect(mockRegisterSearchGitHubCommitsTool).not.toHaveBeenCalled();
    expect(mockRegisterSearchGitHubPullRequestsTool).not.toHaveBeenCalled();
    expect(mockRegisterPackageSearchTool).not.toHaveBeenCalled();
  });

  it('should handle tool registration failures gracefully', () => {
    // Mock one tool to throw an error
    mockRegisterGitHubSearchCodeTool.mockImplementation(() => {
      throw new Error('Mock registration error');
    });

    const result = registerTools(mockServer);

    expect(result.successCount).toBe(3); // 3 remaining default tools
    expect(result.failedTools).toEqual(['githubSearchCode']);
  });

  it('should show appropriate exclusion messages for non-default tools', () => {
    const result = registerTools(mockServer);

    expect(result.successCount).toBe(4); // Only default tools

    // Verify non-default tools show "not a default tool" message
    expect(processStderrWriteSpy).toHaveBeenCalledWith(
      'Tool githubSearchCommits not a default tool\n'
    );
    expect(processStderrWriteSpy).toHaveBeenCalledWith(
      'Tool githubSearchPullRequests not a default tool\n'
    );
    expect(processStderrWriteSpy).toHaveBeenCalledWith(
      'Tool packageSearch not a default tool\n'
    );
  });

  it('should enable non-default tools with ENABLE_TOOLS', () => {
    // Mock enabled tools
    mockGetEnableTools.mockReturnValue([
      'packageSearch',
      'githubSearchCommits',
    ]);

    const result = registerTools(mockServer);

    expect(result.successCount).toBe(6); // 4 default + 2 enabled
    expect(result.failedTools).toHaveLength(0);

    // Verify default tools were called
    expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(mockServer);
    expect(mockRegisterFetchGitHubFileContentTool).toHaveBeenCalledWith(
      mockServer
    );
    expect(mockRegisterSearchGitHubReposTool).toHaveBeenCalledWith(mockServer);
    expect(mockRegisterViewGitHubRepoStructureTool).toHaveBeenCalledWith(
      mockServer
    );

    // Verify enabled tools were called
    expect(mockRegisterPackageSearchTool).toHaveBeenCalledWith(mockServer);
    expect(mockRegisterSearchGitHubCommitsTool).toHaveBeenCalledWith(
      mockServer
    );

    // Verify non-enabled tool was NOT called
    expect(mockRegisterSearchGitHubPullRequestsTool).not.toHaveBeenCalled();
  });

  it('should disable tools with DISABLE_TOOLS', () => {
    // Mock disabled tools
    mockGetDisableTools.mockReturnValue(['githubSearchCode', 'packageSearch']);

    const result = registerTools(mockServer);

    expect(result.successCount).toBe(3); // 4 default - 1 disabled = 3
    expect(result.failedTools).toHaveLength(0);

    // Verify non-disabled default tools were called
    expect(mockRegisterFetchGitHubFileContentTool).toHaveBeenCalledWith(
      mockServer
    );
    expect(mockRegisterSearchGitHubReposTool).toHaveBeenCalledWith(mockServer);
    expect(mockRegisterViewGitHubRepoStructureTool).toHaveBeenCalledWith(
      mockServer
    );

    // Verify disabled tools were NOT called
    expect(mockRegisterGitHubSearchCodeTool).not.toHaveBeenCalled();
    expect(mockRegisterPackageSearchTool).not.toHaveBeenCalled();

    // Verify disable message
    expect(processStderrWriteSpy).toHaveBeenCalledWith(
      'Tool githubSearchCode disabled by DISABLE_TOOLS configuration\n'
    );
  });

  it('should handle ENABLE_TOOLS and DISABLE_TOOLS together (DISABLE takes priority)', () => {
    // Mock both enabled and disabled tools
    mockGetEnableTools.mockReturnValue([
      'packageSearch',
      'githubSearchCommits',
    ]);
    mockGetDisableTools.mockReturnValue(['githubSearchCode', 'packageSearch']); // packageSearch disabled despite being enabled

    const result = registerTools(mockServer);

    expect(result.successCount).toBe(4); // 4 default - 1 disabled + 1 enabled = 4
    expect(result.failedTools).toHaveLength(0);

    // Verify non-disabled default tools were called
    expect(mockRegisterFetchGitHubFileContentTool).toHaveBeenCalledWith(
      mockServer
    );
    expect(mockRegisterSearchGitHubReposTool).toHaveBeenCalledWith(mockServer);
    expect(mockRegisterViewGitHubRepoStructureTool).toHaveBeenCalledWith(
      mockServer
    );

    // Verify enabled tool was called (and not disabled)
    expect(mockRegisterSearchGitHubCommitsTool).toHaveBeenCalledWith(
      mockServer
    );

    // Verify disabled tools were NOT called (even if in enableTools)
    expect(mockRegisterGitHubSearchCodeTool).not.toHaveBeenCalled();
    expect(mockRegisterPackageSearchTool).not.toHaveBeenCalled();

    // Verify disable messages
    expect(processStderrWriteSpy).toHaveBeenCalledWith(
      'Tool githubSearchCode disabled by DISABLE_TOOLS configuration\n'
    );
    expect(processStderrWriteSpy).toHaveBeenCalledWith(
      'Tool packageSearch disabled by DISABLE_TOOLS configuration\n'
    );
  });

  describe('audit logging', () => {
    it('should initialize audit logger and log registration events', () => {
      const result = registerTools(mockServer);

      // Verify audit logger is initialized
      expect(mockAuditLogger.initialize).toHaveBeenCalledOnce();

      // Verify registration start event
      expect(mockLogToolEvent).toHaveBeenCalledWith('registration_start');

      // Verify registration complete event
      expect(mockLogToolEvent).toHaveBeenCalledWith('registration_complete');

      expect(result.successCount).toBe(4);
    });

    it('should log successful tool registrations', () => {
      registerTools(mockServer);

      // Verify successful registration events for default tools
      expect(mockLogToolEvent).toHaveBeenCalledWith('githubSearchCode');
      expect(mockLogToolEvent).toHaveBeenCalledWith('githubGetFileContent');
      expect(mockLogToolEvent).toHaveBeenCalledWith('githubViewRepoStructure');
      expect(mockLogToolEvent).toHaveBeenCalledWith('githubSearchRepositories');
    });

    it('should log skipped tool registrations', () => {
      registerTools(mockServer);

      // Verify skipped registration events for non-default tools
      expect(mockLogToolEvent).toHaveBeenCalledWith('githubSearchCommits_skipped');
      expect(mockLogToolEvent).toHaveBeenCalledWith('githubSearchPullRequests_skipped');
      expect(mockLogToolEvent).toHaveBeenCalledWith('packageSearch_skipped');
    });

    it('should log disabled tool registrations', () => {
      mockGetDisableTools.mockReturnValue(['githubSearchCode']);

      registerTools(mockServer);

      // Verify disabled registration event
      expect(mockLogToolEvent).toHaveBeenCalledWith('githubSearchCode_skipped');
    });

    it('should log failed tool registrations', () => {
      // Mock one tool to throw an error
      mockRegisterGitHubSearchCodeTool.mockImplementation(() => {
        throw new Error('Mock registration error');
      });

      const result = registerTools(mockServer);

      // Verify failed registration event
      expect(mockLogToolEvent).toHaveBeenCalledWith('githubSearchCode_failed');

      expect(result.failedTools).toEqual(['githubSearchCode']);
    });
  });

  describe('TOOLS_TO_RUN exclusive mode', () => {
    it('should run ONLY the tools specified in TOOLS_TO_RUN', () => {
      // Mock TOOLS_TO_RUN with specific tools (mix of default and non-default)
      mockGetToolsToRun.mockReturnValue([
        'packageSearch', // non-default
        'githubSearchCode', // default
        'githubSearchCommits', // non-default
      ]);

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(3); // Only the 3 specified tools
      expect(result.failedTools).toHaveLength(0);

      // Verify ONLY the specified tools were called
      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(mockServer);
      expect(mockRegisterPackageSearchTool).toHaveBeenCalledWith(mockServer);
      expect(mockRegisterSearchGitHubCommitsTool).toHaveBeenCalledWith(
        mockServer
      );

      // Verify other tools (even defaults) were NOT called
      expect(mockRegisterFetchGitHubFileContentTool).not.toHaveBeenCalled();
      expect(mockRegisterSearchGitHubReposTool).not.toHaveBeenCalled();
      expect(mockRegisterViewGitHubRepoStructureTool).not.toHaveBeenCalled();
      expect(mockRegisterSearchGitHubPullRequestsTool).not.toHaveBeenCalled();

      // Verify exclusion messages for tools not in TOOLS_TO_RUN
      expect(processStderrWriteSpy).toHaveBeenCalledWith(
        'Tool githubGetFileContent not in TOOLS_TO_RUN list (exclusive mode)\n'
      );
      expect(processStderrWriteSpy).toHaveBeenCalledWith(
        'Tool githubSearchRepositories not in TOOLS_TO_RUN list (exclusive mode)\n'
      );
    });

    it('should ignore ENABLE_TOOLS when TOOLS_TO_RUN is specified', () => {
      // Set both TOOLS_TO_RUN and ENABLE_TOOLS
      mockGetToolsToRun.mockReturnValue(['packageSearch']);
      mockGetEnableTools.mockReturnValue(['githubSearchCommits']); // Should be ignored

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(1); // Only packageSearch from TOOLS_TO_RUN
      expect(result.failedTools).toHaveLength(0);

      // Verify only the TOOLS_TO_RUN tool was called
      expect(mockRegisterPackageSearchTool).toHaveBeenCalledWith(mockServer);

      // Verify ENABLE_TOOLS tool was NOT called
      expect(mockRegisterSearchGitHubCommitsTool).not.toHaveBeenCalled();

      // Verify default tools were NOT called
      expect(mockRegisterGitHubSearchCodeTool).not.toHaveBeenCalled();
      expect(mockRegisterFetchGitHubFileContentTool).not.toHaveBeenCalled();
    });

    it('should ignore DISABLE_TOOLS in TOOLS_TO_RUN mode (truly exclusive)', () => {
      // Set TOOLS_TO_RUN with a tool that's also disabled - should still run it
      mockGetToolsToRun.mockReturnValue(['packageSearch', 'githubSearchCode']);
      mockGetDisableTools.mockReturnValue(['githubSearchCode']); // Should be ignored in TOOLS_TO_RUN mode

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(2); // Both tools from TOOLS_TO_RUN (DISABLE_TOOLS ignored)
      expect(result.failedTools).toHaveLength(0);

      // Verify BOTH tools were called (DISABLE_TOOLS ignored in TOOLS_TO_RUN mode)
      expect(mockRegisterPackageSearchTool).toHaveBeenCalledWith(mockServer);
      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(mockServer);

      // Verify no disable message (DISABLE_TOOLS ignored)
      expect(processStderrWriteSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('disabled by DISABLE_TOOLS')
      );
    });

    it('should handle empty TOOLS_TO_RUN array by falling back to standard mode', () => {
      // Empty array should fall back to standard behavior
      mockGetToolsToRun.mockReturnValue([]);

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(4); // Default tools
      expect(result.failedTools).toHaveLength(0);

      // Verify default tools were called
      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(mockServer);
      expect(mockRegisterFetchGitHubFileContentTool).toHaveBeenCalledWith(
        mockServer
      );
      expect(mockRegisterSearchGitHubReposTool).toHaveBeenCalledWith(
        mockServer
      );
      expect(mockRegisterViewGitHubRepoStructureTool).toHaveBeenCalledWith(
        mockServer
      );
    });

    it('should handle invalid tool names in TOOLS_TO_RUN gracefully', () => {
      // Include a non-existent tool name
      mockGetToolsToRun.mockReturnValue([
        'packageSearch', // valid
        'nonExistentTool', // invalid - should be ignored
        'githubSearchCode', // valid
      ]);

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(2); // Only the valid tools
      expect(result.failedTools).toHaveLength(0);

      // Verify valid tools were called
      expect(mockRegisterPackageSearchTool).toHaveBeenCalledWith(mockServer);
      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(mockServer);

      // Invalid tool name is simply ignored (no error)
    });
  });

  describe('DISABLE_TOOLS only works in standard mode', () => {
    it('should respect DISABLE_TOOLS in standard mode (not TOOLS_TO_RUN)', () => {
      // No TOOLS_TO_RUN - standard mode
      mockGetToolsToRun.mockReturnValue(undefined);
      mockGetEnableTools.mockReturnValue(['packageSearch']);
      mockGetDisableTools.mockReturnValue(['githubSearchCode']); // Should work in standard mode

      const result = registerTools(mockServer);

      expect(result.successCount).toBe(4); // 4 default - 1 disabled + 1 enabled = 4
      expect(result.failedTools).toHaveLength(0);

      // Verify enabled tool was called
      expect(mockRegisterPackageSearchTool).toHaveBeenCalledWith(mockServer);

      // Verify disabled default tool was NOT called
      expect(mockRegisterGitHubSearchCodeTool).not.toHaveBeenCalled();

      // Verify other default tools were called
      expect(mockRegisterFetchGitHubFileContentTool).toHaveBeenCalledWith(
        mockServer
      );
      expect(mockRegisterSearchGitHubReposTool).toHaveBeenCalledWith(
        mockServer
      );
      expect(mockRegisterViewGitHubRepoStructureTool).toHaveBeenCalledWith(
        mockServer
      );

      // Verify disable message
      expect(processStderrWriteSpy).toHaveBeenCalledWith(
        'Tool githubSearchCode disabled by DISABLE_TOOLS configuration\n'
      );
    });
  });
});

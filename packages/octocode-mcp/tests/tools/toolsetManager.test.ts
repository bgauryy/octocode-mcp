import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  McpServer,
  RegisteredTool,
} from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock all tool registration functions
vi.mock('../../src/tools/github_search_code.js');
vi.mock('../../src/tools/github_fetch_content.js');
vi.mock('../../src/tools/github_search_repos.js');
vi.mock('../../src/tools/github_search_commits.js');
vi.mock('../../src/tools/github_search_pull_requests.js');
vi.mock('../../src/tools/package_search.js');
vi.mock('../../src/tools/github_view_repo_structure.js');

// Mock audit logger
vi.mock('../../src/security/auditLogger.js', () => ({
  logToolEvent: vi.fn(),
  AuditLogger: {
    initialize: vi.fn(),
  },
}));

// Mock server config
vi.mock('../../src/config/serverConfig.js', () => ({
  getServerConfig: vi.fn(),
}));

import { registerTools } from '../../src/tools/toolsManager.js';

// Import config mock
import { getServerConfig } from '../../src/config/serverConfig.js';

// Import the mocked functions for verification
import { registerGitHubSearchCodeTool } from '../../src/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../../src/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';
import { registerSearchGitHubCommitsTool } from '../../src/tools/github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from '../../src/tools/github_search_pull_requests.js';
import { registerPackageSearchTool } from '../../src/tools/package_search.js';
import { registerViewGitHubRepoStructureTool } from '../../src/tools/github_view_repo_structure.js';
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

// Config mock
const mockGetServerConfig = vi.mocked(getServerConfig);

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

    // Reset mocks
    vi.clearAllMocks();

    // Setup default config mock returns
    mockGetServerConfig.mockReturnValue({
      version: '4.0.5',
      enableTools: undefined,
      disableTools: undefined,
      enableLogging: false,
      timeout: 30000,
      maxRetries: 3,
    });

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
    mockGetServerConfig.mockReturnValue({
      version: '4.0.5',
      enableTools: ['packageSearch', 'githubSearchCommits'],
      disableTools: undefined,
      enableLogging: false,
      timeout: 30000,
      maxRetries: 3,
    });

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
    mockGetServerConfig.mockReturnValue({
      version: '4.0.5',
      enableTools: undefined,
      disableTools: ['githubSearchCode', 'packageSearch'],
      enableLogging: false,
      timeout: 30000,
      maxRetries: 3,
    });

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
    mockGetServerConfig.mockReturnValue({
      version: '4.0.5',
      enableTools: ['packageSearch', 'githubSearchCommits'],
      disableTools: ['githubSearchCode', 'packageSearch'], // packageSearch disabled despite being enabled
      enableLogging: false,
      timeout: 30000,
      maxRetries: 3,
    });

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
      expect(mockLogToolEvent).toHaveBeenCalledWith(
        'githubSearchCommits_skipped'
      );
      expect(mockLogToolEvent).toHaveBeenCalledWith(
        'githubSearchPullRequests_skipped'
      );
      expect(mockLogToolEvent).toHaveBeenCalledWith('packageSearch_skipped');
    });

    it('should log disabled tool registrations', () => {
      mockGetServerConfig.mockReturnValue({
        version: '4.0.5',
        enableTools: undefined,
        disableTools: ['githubSearchCode'],
        enableLogging: false,
        timeout: 30000,
        maxRetries: 3,
      });

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
});

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
  getEnableTools: vi.fn(),
  getDisableTools: vi.fn(),
  isEnterpriseMode: vi.fn(),
  getEnterpriseConfig: vi.fn(),
}));

import { registerTools } from '../../src/mcp/tools/toolsManager.js';

// Import config helper mocks
import {
  getEnableTools,
  getDisableTools,
  isEnterpriseMode,
  getEnterpriseConfig,
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
const mockGetEnableTools = vi.mocked(getEnableTools);
const mockGetDisableTools = vi.mocked(getDisableTools);
const mockIsEnterpriseMode = vi.mocked(isEnterpriseMode);
const mockGetEnterpriseConfig = vi.mocked(getEnterpriseConfig);

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
    delete process.env.GITHUB_ORGANIZATION;
    delete process.env.TOOLS_TO_RUN;

    // Reset mocks
    vi.clearAllMocks();

    // Setup default config mock returns
    mockGetEnableTools.mockReturnValue(undefined);
    mockGetDisableTools.mockReturnValue(undefined);
    mockIsEnterpriseMode.mockReturnValue(false);
    mockGetEnterpriseConfig.mockReturnValue({
      organizationId: undefined,
      ssoEnforcement: false,
      auditLogging: false,
      rateLimiting: false,
      tokenValidation: false,
      permissionValidation: false,
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

  it('should enable auth tools when GITHUB_ORGANIZATION is set', () => {
    // Mock enterprise mode
    mockIsEnterpriseMode.mockReturnValue(true);
    mockGetEnterpriseConfig.mockReturnValue({
      organizationId: 'test-org',
      ssoEnforcement: false,
      auditLogging: false,
      rateLimiting: false,
      tokenValidation: false,
      permissionValidation: false,
    });

    const result = registerTools(mockServer);

    expect(result.successCount).toBe(4); // Only default tools
    expect(processStderrWriteSpy).toHaveBeenCalledWith(
      '🔒 Enterprise mode active: auth tools enabled\n'
    );
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
      expect(mockLogToolEvent).toHaveBeenCalledWith(
        'registration_start',
        'success',
        {
          totalTools: 7,
          enableTools: [],
          disableTools: [],
        }
      );

      // Verify registration complete event
      expect(mockLogToolEvent).toHaveBeenCalledWith(
        'registration_complete',
        'success',
        {
          successCount: 4,
          failedCount: 0,
          failedTools: [],
          totalTools: 7,
        }
      );

      expect(result.successCount).toBe(4);
    });

    it('should log successful tool registrations', () => {
      registerTools(mockServer);

      // Verify successful registration events for default tools
      expect(mockLogToolEvent).toHaveBeenCalledWith(
        'registration_success',
        'success',
        {
          toolName: 'githubSearchCode',
          isDefault: true,
          explicitlyEnabled: false,
        }
      );

      expect(mockLogToolEvent).toHaveBeenCalledWith(
        'registration_success',
        'success',
        {
          toolName: 'githubGetFileContent',
          isDefault: true,
          explicitlyEnabled: false,
        }
      );
    });

    it('should log skipped tool registrations', () => {
      registerTools(mockServer);

      // Verify skipped registration events for non-default tools
      expect(mockLogToolEvent).toHaveBeenCalledWith(
        'registration_skipped',
        'success',
        {
          toolName: 'githubSearchCommits',
          reason: 'not a default tool',
          isDefault: false,
          explicitlyDisabled: false,
        }
      );

      expect(mockLogToolEvent).toHaveBeenCalledWith(
        'registration_skipped',
        'success',
        {
          toolName: 'packageSearch',
          reason: 'not a default tool',
          isDefault: false,
          explicitlyDisabled: false,
        }
      );
    });

    it('should log disabled tool registrations', () => {
      mockGetDisableTools.mockReturnValue(['githubSearchCode']);

      registerTools(mockServer);

      // Verify disabled registration event
      expect(mockLogToolEvent).toHaveBeenCalledWith(
        'registration_skipped',
        'success',
        {
          toolName: 'githubSearchCode',
          reason: 'disabled by DISABLE_TOOLS configuration',
          isDefault: true,
          explicitlyDisabled: true,
        }
      );
    });

    it('should log failed tool registrations', () => {
      // Mock one tool to throw an error
      mockRegisterGitHubSearchCodeTool.mockImplementation(() => {
        throw new Error('Mock registration error');
      });

      const result = registerTools(mockServer);

      // Verify failed registration event
      expect(mockLogToolEvent).toHaveBeenCalledWith(
        'registration_failed',
        'failure',
        {
          toolName: 'githubSearchCode',
          error: 'Mock registration error',
          isDefault: true,
        }
      );

      expect(result.failedTools).toEqual(['githubSearchCode']);
    });

    it('should log enterprise mode activation', () => {
      mockIsEnterpriseMode.mockReturnValue(true);
      mockGetEnterpriseConfig.mockReturnValue({
        organizationId: 'test-org',
        ssoEnforcement: false,
        auditLogging: false,
        rateLimiting: false,
        tokenValidation: false,
        permissionValidation: false,
      });

      registerTools(mockServer);

      // Verify enterprise mode event
      expect(mockLogToolEvent).toHaveBeenCalledWith(
        'enterprise_mode_activated',
        'success',
        {
          organization: 'test-org',
          authToolsEnabled: true,
        }
      );
    });
  });
});

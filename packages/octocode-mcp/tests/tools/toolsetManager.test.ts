import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock all tool registration functions
vi.mock('../../src/mcp/tools/github_search_code.js');
vi.mock('../../src/mcp/tools/github_fetch_content.js');
vi.mock('../../src/mcp/tools/github_search_repos.js');
vi.mock('../../src/mcp/tools/github_search_commits.js');
vi.mock('../../src/mcp/tools/github_search_pull_requests.js');
vi.mock('../../src/mcp/tools/package_search/package_search.js');
vi.mock('../../src/mcp/tools/github_view_repo_structure.js');

import {
  ToolsetManager,
  registerTools,
  ToolsetConfig,
  ToolRegistrationConfig,
  initializeToolsets,
  getEnabledTools,
  isToolEnabled,
  DEFAULT_TOOLSETS,
} from '../../src/mcp/tools/toolsets/toolsetManager.js';
import { ServerConfig } from '../../src/config/serverConfig.js';
import { TOOL_NAMES } from '../../src/mcp/tools/utils/toolConstants.js';
import { registerGitHubSearchCodeTool } from '../../src/mcp/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../../src/mcp/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../../src/mcp/tools/github_search_repos.js';
import { registerSearchGitHubCommitsTool } from '../../src/mcp/tools/github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from '../../src/mcp/tools/github_search_pull_requests.js';
import { registerPackageSearchTool } from '../../src/mcp/tools/package_search/package_search.js';
import { registerViewGitHubRepoStructureTool } from '../../src/mcp/tools/github_view_repo_structure.js';

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

describe('ToolsetManager', () => {
  let originalEnvVars: Record<string, string | undefined>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processStderrWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Store original environment variables
    originalEnvVars = {
      GITHUB_ORGANIZATION: process.env.GITHUB_ORGANIZATION,
      AUDIT_ALL_ACCESS: process.env.AUDIT_ALL_ACCESS,
      RATE_LIMIT_API_HOUR: process.env.RATE_LIMIT_API_HOUR,
      RATE_LIMIT_AUTH_HOUR: process.env.RATE_LIMIT_AUTH_HOUR,
      RATE_LIMIT_TOKEN_HOUR: process.env.RATE_LIMIT_TOKEN_HOUR,
    };

    // Clear environment variables completely
    delete process.env.GITHUB_ORGANIZATION;
    delete process.env.AUDIT_ALL_ACCESS;
    delete process.env.RATE_LIMIT_API_HOUR;
    delete process.env.RATE_LIMIT_AUTH_HOUR;
    delete process.env.RATE_LIMIT_TOKEN_HOUR;

    // Reset ToolsetManager state completely
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ToolsetManager as any).toolsets = new Map();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ToolsetManager as any).initialized = false;

    // Mock console and stderr to capture messages
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processStderrWriteSpy = vi
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .spyOn(process.stderr, 'write' as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(() => true) as any;

    // Mock tool registration functions
    mockRegisterGitHubSearchCodeTool.mockImplementation(() => {});
    mockRegisterFetchGitHubFileContentTool.mockImplementation(() => {});
    mockRegisterSearchGitHubReposTool.mockImplementation(() => {});
    mockRegisterSearchGitHubCommitsTool.mockImplementation(() => {});
    mockRegisterSearchGitHubPullRequestsTool.mockImplementation(() => {});
    mockRegisterPackageSearchTool.mockImplementation(() => {});
    mockRegisterViewGitHubRepoStructureTool.mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore environment variables
    for (const [key, value] of Object.entries(originalEnvVars)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }

    consoleErrorSpy?.mockRestore();
    processStderrWriteSpy?.mockRestore();
  });

  describe('Default Configuration', () => {
    it('should have correct default toolsets', () => {
      expect(DEFAULT_TOOLSETS).toHaveLength(4);

      const reposToolset = DEFAULT_TOOLSETS.find(t => t.name === 'repos');
      expect(reposToolset).toEqual({
        name: 'repos',
        description: 'GitHub Repository related tools',
        enabled: true,
        readOnly: false,
        tools: [
          'githubSearchCode',
          'githubGetFileContent',
          'githubViewRepoStructure',
        ],
        category: 'core',
      });

      const searchToolset = DEFAULT_TOOLSETS.find(t => t.name === 'search');
      expect(searchToolset).toEqual({
        name: 'search',
        description: 'GitHub Search and Discovery tools',
        enabled: true,
        readOnly: true,
        tools: [
          'githubSearchRepositories',
          'githubSearchCommits',
          'githubSearchPullRequests',
        ],
        category: 'core',
      });

      const packagesToolset = DEFAULT_TOOLSETS.find(t => t.name === 'packages');
      expect(packagesToolset).toEqual({
        name: 'packages',
        description: 'Package registry tools',
        enabled: true,
        readOnly: true,
        tools: ['packageSearch'],
        category: 'core',
      });

      const enterpriseToolset = DEFAULT_TOOLSETS.find(
        t => t.name === 'enterprise'
      );
      expect(enterpriseToolset).toEqual({
        name: 'enterprise',
        description: 'Enterprise security and audit tools',
        enabled: false,
        readOnly: false,
        tools: ['audit_logger', 'rate_limiter', 'organization_manager'],
        category: 'enterprise',
      });
    });
  });

  describe('Initialization', () => {
    it('should initialize with default settings', () => {
      // When no enabledToolsets is specified, it enables ALL toolsets including enterprise
      ToolsetManager.initialize();

      expect(ToolsetManager.getEnabledToolsets()).toHaveLength(4); // repos, search, packages, enterprise (all enabled by default)
      const enabledToolsets = ToolsetManager.getEnabledToolsets();
      const toolsetNames = enabledToolsets.map(t => t.name);
      expect(toolsetNames).toEqual([
        'repos',
        'search',
        'packages',
        'enterprise',
      ]);

      expect(ToolsetManager.getEnabledTools()).toEqual([
        'githubSearchCode',
        'githubGetFileContent',
        'githubViewRepoStructure',
        'githubSearchRepositories',
        'githubSearchCommits',
        'githubSearchPullRequests',
        'packageSearch',
        'audit_logger',
        'rate_limiter',
        'organization_manager',
      ]);
    });

    it('should not reinitialize if already initialized', () => {
      ToolsetManager.initialize(['repos']);
      expect(ToolsetManager.getEnabledToolsets()).toHaveLength(1);

      // Try to reinitialize with different settings
      ToolsetManager.initialize(['search', 'packages']);
      expect(ToolsetManager.getEnabledToolsets()).toHaveLength(1); // Should still be 1
    });

    it('should enable specific toolsets only', () => {
      ToolsetManager.initialize(['repos']);

      const enabledToolsets = ToolsetManager.getEnabledToolsets();
      expect(enabledToolsets).toHaveLength(1);
      expect(enabledToolsets[0]?.name).toBe('repos');
    });

    it('should enable all toolsets when "all" is specified', () => {
      ToolsetManager.initialize(['all']);

      const enabledToolsets = ToolsetManager.getEnabledToolsets();
      expect(enabledToolsets).toHaveLength(4); // Including enterprise
    });

    it('should apply readOnly mode globally', () => {
      ToolsetManager.initialize(undefined, true);

      const enabledToolsets = ToolsetManager.getEnabledToolsets();
      for (const toolset of enabledToolsets) {
        expect(toolset.readOnly).toBe(true);
      }
    });

    it('should preserve individual readOnly settings when global is false', () => {
      ToolsetManager.initialize(undefined, false);

      const reposToolset = ToolsetManager.getEnabledToolsets().find(
        t => t.name === 'repos'
      );
      const searchToolset = ToolsetManager.getEnabledToolsets().find(
        t => t.name === 'search'
      );

      expect(reposToolset?.readOnly).toBe(false);
      expect(searchToolset?.readOnly).toBe(true); // This one is readOnly by default
    });

    it('should enable enterprise toolset with GITHUB_ORGANIZATION', () => {
      process.env.GITHUB_ORGANIZATION = 'my-org';
      ToolsetManager.initialize();

      const enterpriseToolset = ToolsetManager.getEnabledToolsets().find(
        t => t.name === 'enterprise'
      );
      expect(enterpriseToolset?.enabled).toBe(true);
    });

    it('should enable enterprise toolset with AUDIT_ALL_ACCESS', () => {
      process.env.AUDIT_ALL_ACCESS = 'true';
      ToolsetManager.initialize();

      const enterpriseToolset = ToolsetManager.getEnabledToolsets().find(
        t => t.name === 'enterprise'
      );
      expect(enterpriseToolset?.enabled).toBe(true);
    });

    it('should enable enterprise toolset with rate limiting env vars', () => {
      process.env.RATE_LIMIT_API_HOUR = '1000';
      ToolsetManager.initialize();

      const enterpriseToolset = ToolsetManager.getEnabledToolsets().find(
        t => t.name === 'enterprise'
      );
      expect(enterpriseToolset?.enabled).toBe(true);
    });
  });

  describe('Toolset Management', () => {
    beforeEach(() => {
      ToolsetManager.initialize();
    });

    it('should register custom toolset', () => {
      const customToolset: ToolsetConfig = {
        name: 'custom',
        description: 'Custom toolset',
        enabled: true,
        readOnly: false,
        tools: ['customTool1', 'customTool2'],
        category: 'experimental',
      };

      ToolsetManager.registerToolset(customToolset);

      const stats = ToolsetManager.getStats();
      expect(stats.totalToolsets).toBe(5); // 4 default + 1 custom
    });

    it('should enable toolsets by name', () => {
      // Force reset state to ensure clean test
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ToolsetManager as any).toolsets = new Map();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ToolsetManager as any).initialized = false;

      // Initialize with explicit toolsets excluding enterprise
      ToolsetManager.initialize(['repos', 'search', 'packages']);

      // Initially enterprise should be disabled
      expect(ToolsetManager.isToolEnabled('audit_logger')).toBe(false);

      ToolsetManager.enableToolsets(['enterprise']);
      expect(ToolsetManager.isToolEnabled('audit_logger')).toBe(true);
    });

    it('should enable all toolsets with "all"', () => {
      ToolsetManager.enableToolsets(['all']);

      const stats = ToolsetManager.getStats();
      expect(stats.enabledToolsets).toBe(4); // All toolsets enabled
    });

    it('should get correct toolset for tool', () => {
      const toolset = ToolsetManager.getToolsetForTool('githubSearchCode');
      expect(toolset?.name).toBe('repos');

      const noToolset = ToolsetManager.getToolsetForTool('nonExistentTool');
      expect(noToolset).toBeNull();
    });

    it('should return correct statistics', () => {
      const stats = ToolsetManager.getStats();

      expect(stats.totalToolsets).toBe(4);
      expect(stats.enabledToolsets).toBe(4); // repos, search, packages, enterprise (all enabled)
      expect(stats.totalTools).toBe(10); // All tools across all toolsets
      expect(stats.enabledTools).toBe(10); // All tools in enabled toolsets
      expect(stats.readOnlyMode).toBe(true); // search and packages are readOnly
    });
  });

  describe('Tool Enablement', () => {
    it('should check if tool is enabled - positive cases', () => {
      ToolsetManager.initialize();

      expect(ToolsetManager.isToolEnabled('githubSearchCode')).toBe(true);
      expect(ToolsetManager.isToolEnabled('githubSearchRepositories')).toBe(
        true
      );
      expect(ToolsetManager.isToolEnabled('packageSearch')).toBe(true);
    });

    it('should check if tool is enabled - negative cases', () => {
      // Initialize with specific toolsets to exclude enterprise
      ToolsetManager.initialize(['repos', 'search', 'packages']);

      expect(ToolsetManager.isToolEnabled('audit_logger')).toBe(false); // Enterprise disabled
      expect(ToolsetManager.isToolEnabled('nonExistentTool')).toBe(false);
    });

    it('should check if tool is enabled with specific toolsets', () => {
      ToolsetManager.initialize(['repos']);

      expect(ToolsetManager.isToolEnabled('githubSearchCode')).toBe(true);
      expect(ToolsetManager.isToolEnabled('githubSearchRepositories')).toBe(
        false
      ); // search toolset disabled
    });
  });

  describe('Convenience Functions', () => {
    it('should initialize toolsets via convenience function', () => {
      initializeToolsets(['repos'], true);

      expect(ToolsetManager.getEnabledToolsets()).toHaveLength(1);
      expect(ToolsetManager.getEnabledToolsets()[0]?.readOnly).toBe(true);
    });

    it('should get enabled tools via convenience function', () => {
      ToolsetManager.initialize(['repos']);

      const tools = getEnabledTools();
      expect(tools).toEqual([
        'githubSearchCode',
        'githubGetFileContent',
        'githubViewRepoStructure',
      ]);
    });

    it('should check tool enablement via convenience function', () => {
      ToolsetManager.initialize(['repos']);

      expect(isToolEnabled('githubSearchCode')).toBe(true);
      expect(isToolEnabled('githubSearchRepositories')).toBe(false);
    });
  });
});

describe('registerTools Function', () => {
  let mockServer: McpServer;
  let processStderrWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockServer = {
      setRequestHandler: vi.fn(),
      connect: vi.fn(),
      close: vi.fn(),
    } as unknown as McpServer;

    // Reset ToolsetManager
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ToolsetManager as any).toolsets = new Map();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ToolsetManager as any).initialized = false;

    processStderrWriteSpy = vi
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .spyOn(process.stderr, 'write' as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(() => true) as any;

    // Mock all tool registration functions to succeed
    mockRegisterGitHubSearchCodeTool.mockImplementation(() => {});
    mockRegisterFetchGitHubFileContentTool.mockImplementation(() => {});
    mockRegisterSearchGitHubReposTool.mockImplementation(() => {});
    mockRegisterSearchGitHubCommitsTool.mockImplementation(() => {});
    mockRegisterSearchGitHubPullRequestsTool.mockImplementation(() => {});
    mockRegisterPackageSearchTool.mockImplementation(() => {});
    mockRegisterViewGitHubRepoStructureTool.mockImplementation(() => {});
  });

  afterEach(() => {
    processStderrWriteSpy?.mockRestore();
  });

  describe('All Tools Scenarios', () => {
    it('should register all tools when inclusiveTools is empty', () => {
      ToolsetManager.initialize(); // Enable default toolsets

      const config: ToolRegistrationConfig = {
        serverConfig: {} as ServerConfig,
        userConfig: {
          toolsToRun: undefined, // Empty means all tools
        },
      };

      const result = registerTools(mockServer, config);

      expect(result.successCount).toBe(7);
      expect(result.failedTools).toHaveLength(0);

      // Verify all tools were called
      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(mockServer);
      expect(mockRegisterFetchGitHubFileContentTool).toHaveBeenCalledWith(
        mockServer
      );
      expect(mockRegisterSearchGitHubReposTool).toHaveBeenCalledWith(
        mockServer
      );
      expect(mockRegisterSearchGitHubCommitsTool).toHaveBeenCalledWith(
        mockServer
      );
      expect(mockRegisterSearchGitHubPullRequestsTool).toHaveBeenCalledWith(
        mockServer
      );
      expect(mockRegisterPackageSearchTool).toHaveBeenCalledWith(mockServer);
      expect(mockRegisterViewGitHubRepoStructureTool).toHaveBeenCalledWith(
        mockServer
      );
    });

    it('should register all tools when runAllTools is true despite toolset restrictions', () => {
      ToolsetManager.initialize(['repos']); // Only repos toolset enabled

      const config: ToolRegistrationConfig = {
        serverConfig: {} as ServerConfig,
        userConfig: {
          toolsToRun: undefined, // Empty means all tools
        },
      };

      const result = registerTools(mockServer, config);

      // Should only register tools from enabled toolsets
      expect(result.successCount).toBe(3); // Only repos tools
      expect(result.failedTools).toHaveLength(0);

      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(mockServer);
      expect(mockRegisterFetchGitHubFileContentTool).toHaveBeenCalledWith(
        mockServer
      );
      expect(mockRegisterViewGitHubRepoStructureTool).toHaveBeenCalledWith(
        mockServer
      );

      // These should not be called because their toolsets are disabled
      expect(mockRegisterSearchGitHubReposTool).not.toHaveBeenCalled();
      expect(mockRegisterSearchGitHubCommitsTool).not.toHaveBeenCalled();
      expect(mockRegisterSearchGitHubPullRequestsTool).not.toHaveBeenCalled();
      expect(mockRegisterPackageSearchTool).not.toHaveBeenCalled();
    });
  });

  describe('Selective Tools Scenarios', () => {
    it('should register only specified tools', () => {
      ToolsetManager.initialize();

      const config: ToolRegistrationConfig = {
        serverConfig: {} as ServerConfig,
        userConfig: {
          toolsToRun: `${TOOL_NAMES.GITHUB_SEARCH_CODE},${TOOL_NAMES.PACKAGE_SEARCH}`,
        },
      };

      const result = registerTools(mockServer, config);

      expect(result.successCount).toBe(2);
      expect(result.failedTools).toHaveLength(0);

      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(mockServer);
      expect(mockRegisterPackageSearchTool).toHaveBeenCalledWith(mockServer);

      // Others should not be called
      expect(mockRegisterFetchGitHubFileContentTool).not.toHaveBeenCalled();
      expect(mockRegisterSearchGitHubReposTool).not.toHaveBeenCalled();
    });

    it('should respect toolset configuration even with specific tools requested', () => {
      ToolsetManager.initialize(['repos']); // Only repos enabled

      const config: ToolRegistrationConfig = {
        serverConfig: {} as ServerConfig,
        userConfig: {
          toolsToRun: `${TOOL_NAMES.GITHUB_SEARCH_CODE},${TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES}`,
        },
      };

      const result = registerTools(mockServer, config);

      expect(result.successCount).toBe(1); // Only githubSearchCode (repos toolset)
      expect(result.failedTools).toHaveLength(0);

      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(mockServer);
      expect(mockRegisterSearchGitHubReposTool).not.toHaveBeenCalled(); // search toolset disabled

      // Should log that the tool was disabled by toolset configuration
      expect(processStderrWriteSpy).toHaveBeenCalledWith(
        `Tool ${TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES} disabled by toolset configuration\n`
      );
    });

    it('should log excluded tools', () => {
      ToolsetManager.initialize();

      const config: ToolRegistrationConfig = {
        serverConfig: {} as ServerConfig,
        userConfig: {
          toolsToRun: TOOL_NAMES.GITHUB_SEARCH_CODE,
        },
      };

      registerTools(mockServer, config);

      // Should log that other tools were excluded
      expect(processStderrWriteSpy).toHaveBeenCalledWith(
        `Tool ${TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES} excluded by TOOLS_TO_RUN configuration\n`
      );
      expect(processStderrWriteSpy).toHaveBeenCalledWith(
        `Tool ${TOOL_NAMES.GITHUB_FETCH_CONTENT} excluded by TOOLS_TO_RUN configuration\n`
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle tool registration errors', () => {
      ToolsetManager.initialize();

      // Make some tools throw errors
      mockRegisterGitHubSearchCodeTool.mockImplementation(() => {
        throw new Error('Registration failed');
      });
      mockRegisterPackageSearchTool.mockImplementation(() => {
        throw new Error('Another failure');
      });

      const config: ToolRegistrationConfig = {
        serverConfig: {} as ServerConfig,
        userConfig: {
          toolsToRun: undefined, // Empty means all tools
        },
      };

      const result = registerTools(mockServer, config);

      expect(result.successCount).toBe(5); // 7 total - 2 failed
      expect(result.failedTools).toEqual([
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        TOOL_NAMES.PACKAGE_SEARCH,
      ]);
    });

    it('should continue registering tools after failures', () => {
      ToolsetManager.initialize();

      // Make first tool fail
      mockRegisterGitHubSearchCodeTool.mockImplementation(() => {
        throw new Error('Registration failed');
      });

      const config: ToolRegistrationConfig = {
        serverConfig: {} as ServerConfig,
        userConfig: {
          toolsToRun: undefined, // Empty means all tools
        },
      };

      const result = registerTools(mockServer, config);

      expect(result.successCount).toBe(6); // 6 successful
      expect(result.failedTools).toEqual([TOOL_NAMES.GITHUB_SEARCH_CODE]);

      // Other tools should still be registered
      expect(mockRegisterFetchGitHubFileContentTool).toHaveBeenCalledWith(
        mockServer
      );
      expect(mockRegisterSearchGitHubReposTool).toHaveBeenCalledWith(
        mockServer
      );
    });

    it('should handle all tools failing', () => {
      ToolsetManager.initialize();

      // Make all tools throw errors
      const mockError = new Error('Registration failed');
      mockRegisterGitHubSearchCodeTool.mockImplementation(() => {
        throw mockError;
      });
      mockRegisterFetchGitHubFileContentTool.mockImplementation(() => {
        throw mockError;
      });
      mockRegisterSearchGitHubReposTool.mockImplementation(() => {
        throw mockError;
      });
      mockRegisterSearchGitHubCommitsTool.mockImplementation(() => {
        throw mockError;
      });
      mockRegisterSearchGitHubPullRequestsTool.mockImplementation(() => {
        throw mockError;
      });
      mockRegisterPackageSearchTool.mockImplementation(() => {
        throw mockError;
      });
      mockRegisterViewGitHubRepoStructureTool.mockImplementation(() => {
        throw mockError;
      });

      const config: ToolRegistrationConfig = {
        serverConfig: {} as ServerConfig,
        userConfig: {
          toolsToRun: undefined, // Empty means all tools
        },
      };

      const result = registerTools(mockServer, config);

      expect(result.successCount).toBe(0);
      expect(result.failedTools).toHaveLength(7);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle mixed valid/invalid tool names', () => {
      ToolsetManager.initialize();

      const config: ToolRegistrationConfig = {
        serverConfig: {} as ServerConfig,
        userConfig: {
          toolsToRun: `${TOOL_NAMES.GITHUB_SEARCH_CODE},nonExistentTool,${TOOL_NAMES.PACKAGE_SEARCH},anotherInvalidTool`,
        },
      };

      const result = registerTools(mockServer, config);

      expect(result.successCount).toBe(2); // Only valid tools
      expect(result.failedTools).toHaveLength(0);

      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(mockServer);
      expect(mockRegisterPackageSearchTool).toHaveBeenCalledWith(mockServer);
    });

    it('should handle empty toolsets configuration', () => {
      // Pass non-existent toolset names to disable all toolsets
      ToolsetManager.initialize(['nonexistent']);

      const config: ToolRegistrationConfig = {
        serverConfig: {} as ServerConfig,
        userConfig: {
          toolsToRun: undefined, // Empty means all tools
        },
      };

      const result = registerTools(mockServer, config);

      expect(result.successCount).toBe(0);
      expect(result.failedTools).toHaveLength(0);
    });

    it('should handle readOnly configuration in config object', () => {
      ToolsetManager.initialize();

      const config: ToolRegistrationConfig = {
        serverConfig: { readOnly: true } as ServerConfig,
        userConfig: {
          toolsToRun: undefined, // Empty means all tools
        },
      };

      const result = registerTools(mockServer, config);

      expect(result.successCount).toBe(7);
      expect(result.failedTools).toHaveLength(0);
    });
  });

  describe('Tool Name Validation', () => {
    it('should handle all valid tool names', () => {
      ToolsetManager.initialize();

      const allValidToolNames = [
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        TOOL_NAMES.GITHUB_FETCH_CONTENT,
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        TOOL_NAMES.PACKAGE_SEARCH,
      ];

      const config: ToolRegistrationConfig = {
        serverConfig: {} as ServerConfig,
        userConfig: {
          toolsToRun: allValidToolNames.join(','),
        },
      };

      const result = registerTools(mockServer, config);

      expect(result.successCount).toBe(7);
      expect(result.failedTools).toHaveLength(0);
    });

    it('should handle single tool registration', () => {
      ToolsetManager.initialize();

      const config: ToolRegistrationConfig = {
        serverConfig: {} as ServerConfig,
        userConfig: {
          toolsToRun: TOOL_NAMES.GITHUB_SEARCH_CODE,
        },
      };

      const result = registerTools(mockServer, config);

      expect(result.successCount).toBe(1);
      expect(result.failedTools).toHaveLength(0);
      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(mockServer);
    });

    it('should handle duplicate tool names in inclusiveTools', () => {
      ToolsetManager.initialize();

      const config: ToolRegistrationConfig = {
        serverConfig: {} as ServerConfig,
        userConfig: {
          toolsToRun: `${TOOL_NAMES.GITHUB_SEARCH_CODE},${TOOL_NAMES.GITHUB_SEARCH_CODE},${TOOL_NAMES.PACKAGE_SEARCH}`,
        },
      };

      const result = registerTools(mockServer, config);

      expect(result.successCount).toBe(2); // Should not register duplicates
      expect(result.failedTools).toHaveLength(0);
      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledTimes(1); // Called only once
    });
  });

  describe('Enterprise Toolset Integration', () => {
    it('should not register enterprise tools when toolset is disabled', () => {
      ToolsetManager.initialize(); // Enterprise disabled by default

      const config: ToolRegistrationConfig = {
        serverConfig: {} as ServerConfig,
        userConfig: {
          toolsToRun: 'audit_logger', // Not a real tool, but testing the concept
        },
      };

      const result = registerTools(mockServer, config);

      expect(result.successCount).toBe(0);
      expect(result.failedTools).toHaveLength(0);
    });

    it('should handle enterprise toolset activation', () => {
      process.env.GITHUB_ORGANIZATION = 'test-org';
      ToolsetManager.initialize(); // Should enable enterprise

      const enterpriseToolset = ToolsetManager.getEnabledToolsets().find(
        t => t.name === 'enterprise'
      );
      expect(enterpriseToolset?.enabled).toBe(true);
    });
  });
});

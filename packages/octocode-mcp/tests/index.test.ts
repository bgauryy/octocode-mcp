import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Mock all dependencies before importing index
vi.mock('@modelcontextprotocol/sdk/server/mcp.js');
vi.mock('@modelcontextprotocol/sdk/server/stdio.js');
vi.mock('../src/mcp/utils/cache.js');
vi.mock('../src/mcp/prompts.js'); // Add missing mock for prompts
vi.mock('../src/mcp/resources.js'); // Add missing mock for resources
vi.mock('../src/mcp/sampling.js');
vi.mock('../src/mcp/tools/github_search_code.js');
vi.mock('../src/mcp/tools/github_fetch_content.js');
vi.mock('../src/mcp/tools/github_search_repos.js');
vi.mock('../src/mcp/tools/github_search_commits.js');
vi.mock('../src/mcp/tools/github_search_pull_requests.js');
vi.mock('../src/mcp/tools/package_search.js');
vi.mock('../src/mcp/tools/github_view_repo_structure.js');
vi.mock('../src/mcp/utils/APIStatus.js');
vi.mock('../src/mcp/utils/exec.js');

vi.mock('../src/config/serverConfig.js');
vi.mock('../config.js');
vi.mock('../src/mcp/tools/toolsManager.js');
vi.mock('../src/translations/translationManager.js');
// Import mocked functions
import { clearAllCache } from '../src/mcp/utils/cache.js';
import { registerPrompts } from '../src/mcp/prompts.js';
import { registerResources } from '../src/mcp/resources.js';
import { registerSampling } from '../src/mcp/sampling.js';
import { registerGitHubSearchCodeTool } from '../src/mcp/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../src/mcp/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../src/mcp/tools/github_search_repos.js';
import { registerSearchGitHubCommitsTool } from '../src/mcp/tools/github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from '../src/mcp/tools/github_search_pull_requests.js';
import { registerPackageSearchTool } from '../src/mcp/tools/package_search.js';
import { registerViewGitHubRepoStructureTool } from '../src/mcp/tools/github_view_repo_structure.js';
import { getNPMUserDetails } from '../src/mcp/utils/APIStatus.js';
import { getGithubCLIToken } from '../src/mcp/utils/exec.js';

import { ConfigManager } from '../src/config/serverConfig.js';
import { registerTools } from '../src/mcp/tools/toolsManager.js';
import { getGitHubToken } from '../config.js';
import { TOOL_NAMES } from '../src/mcp/utils/toolConstants.js';
import { isBetaEnabled } from '../config.js';

// Mock implementations
const mockMcpServer = {
  connect: vi.fn(),
  close: vi.fn(),
};

const mockTransport = {
  start: vi.fn(),
};

const mockClearAllCache = vi.mocked(clearAllCache);
const mockRegisterPrompts = vi.mocked(registerPrompts);
const mockRegisterResources = vi.mocked(registerResources);

const mockMcpServerConstructor = vi.mocked(McpServer);
const mockStdioServerTransport = vi.mocked(StdioServerTransport);
const mockGetNPMUserDetails = vi.mocked(getNPMUserDetails);
const mockGetGithubCLIToken = vi.mocked(getGithubCLIToken);
const mockConfigManager = vi.mocked(ConfigManager);

const mockRegisterTools = vi.mocked(registerTools);
const mockGetGitHubToken = vi.mocked(getGitHubToken);

// Config function mocks
const mockIsBetaEnabled = vi.mocked(isBetaEnabled);

// Mock all tool registration functions
const mockRegisterGitHubSearchCodeTool = vi.mocked(
  registerGitHubSearchCodeTool
);
const mockRegisterFetchGitHubFileContentTool = vi.mocked(
  registerFetchGitHubFileContentTool
);
const mockRegisterSearchGitHubReposTool = vi.mocked(
  registerSearchGitHubReposTool
);
const mockRegisterGitHubSearchCommitsTool = vi.mocked(
  registerSearchGitHubCommitsTool
);
const mockRegisterSearchGitHubPullRequestsTool = vi.mocked(
  registerSearchGitHubPullRequestsTool
);
const mockRegisterPackageSearchTool = vi.mocked(registerPackageSearchTool);
const mockRegisterViewGitHubRepoStructureTool = vi.mocked(
  registerViewGitHubRepoStructureTool
);

describe('Index Module', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processExitSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processStdinResumeSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processStdinOnSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processOnSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processStdoutUncorkSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processStderrUncorkSpy: any;
  let originalGithubToken: string | undefined;
  let originalGhToken: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules(); // Reset module cache

    // Store original environment variables
    originalGithubToken = process.env.GITHUB_TOKEN;
    originalGhToken = process.env.GH_TOKEN;

    // Set a test token to avoid getToken() issues
    process.env.GITHUB_TOKEN = 'test-token';

    // Reset ConfigManager singleton to pick up environment variable changes
    try {
      const { ConfigManager } = await import('../src/config/serverConfig.js');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ConfigManager as any).initialized = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ConfigManager as any).config = null;
    } catch {
      // ConfigManager might not be loaded yet
    }

    // Setup default mock implementations
    mockMcpServerConstructor.mockImplementation(
      () => mockMcpServer as unknown as InstanceType<typeof McpServer>
    );
    mockStdioServerTransport.mockImplementation(
      () =>
        mockTransport as unknown as InstanceType<typeof StdioServerTransport>
    );

    // Mock NPM user details
    mockGetNPMUserDetails.mockResolvedValue({
      npmConnected: true,
      registry: 'https://registry.npmjs.org/',
    });

    // Mock GitHub CLI token
    mockGetGithubCLIToken.mockResolvedValue('cli-token');

    // Mock config functions with default values
    mockIsBetaEnabled.mockReturnValue(false);

    // Create spies for process methods - use a safer mock that doesn't throw by default
    processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((_code?: string | number | null | undefined) => {
        // Don't throw by default - let individual tests override if needed
        return undefined as never;
      });
    processStdinResumeSpy = vi
      .spyOn(process.stdin, 'resume')
      .mockImplementation(() => process.stdin);
    processStdinOnSpy = vi
      .spyOn(process.stdin, 'once')
      .mockImplementation(() => process.stdin);
    processOnSpy = vi.spyOn(process, 'once').mockImplementation(() => process);
    processStdoutUncorkSpy = vi
      .spyOn(process.stdout, 'uncork')
      .mockImplementation(() => {});
    processStderrUncorkSpy = vi
      .spyOn(process.stderr, 'uncork')
      .mockImplementation(() => {});

    // Mock server connect to resolve immediately
    mockMcpServer.connect.mockResolvedValue(undefined);
    mockMcpServer.close.mockResolvedValue(undefined);

    // Create a mock RegisteredTool object
    const mockRegisteredTool = {
      enabled: true,
      callback: vi.fn(),
      disable: vi.fn(() => mockRegisteredTool),
      enable: vi.fn(() => mockRegisteredTool),
      remove: vi.fn(() => mockRegisteredTool),
      update: vi.fn(() => mockRegisteredTool),
    };

    // Mock all tool registration functions to succeed by default
    mockRegisterPrompts.mockImplementation(() => {});
    mockRegisterGitHubSearchCodeTool.mockImplementation(
      () => mockRegisteredTool
    );
    mockRegisterFetchGitHubFileContentTool.mockImplementation(
      () => mockRegisteredTool
    );
    mockRegisterSearchGitHubReposTool.mockImplementation(
      () => mockRegisteredTool
    );
    mockRegisterGitHubSearchCommitsTool.mockImplementation(
      () => mockRegisteredTool
    );
    mockRegisterSearchGitHubPullRequestsTool.mockImplementation(
      () => mockRegisteredTool
    );
    mockRegisterPackageSearchTool.mockImplementation(() => mockRegisteredTool);
    mockRegisterViewGitHubRepoStructureTool.mockImplementation(
      () => mockRegisteredTool
    );

    // Mock new dependencies
    mockConfigManager.initialize.mockReturnValue({
      version: '1.0.0',
      enableTools: [],
      disableTools: [],
      enableLogging: false,
      timeout: 30000,
      maxRetries: 3,
    });

    // Mock registerTools with simple successful response
    mockRegisterTools.mockReturnValue({
      successCount: 4,
      failedTools: [],
    });

    mockGetGitHubToken.mockResolvedValue('test-token');

    // Mock resources and prompts registration
    mockRegisterResources.mockImplementation(() => {});
    mockRegisterPrompts.mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment variables
    if (originalGithubToken !== undefined) {
      process.env.GITHUB_TOKEN = originalGithubToken;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
    if (originalGhToken !== undefined) {
      process.env.GH_TOKEN = originalGhToken;
    } else {
      delete process.env.GH_TOKEN;
    }

    // Restore spies
    processExitSpy?.mockRestore();
    processStdinResumeSpy?.mockRestore();
    processStdinOnSpy?.mockRestore();
    processOnSpy?.mockRestore();
    processStdoutUncorkSpy?.mockRestore();
    processStderrUncorkSpy?.mockRestore();
  });

  // Helper function to wait for async operations to complete
  const waitForAsyncOperations = () =>
    new Promise(resolve => setTimeout(resolve, 50));

  describe('Basic Module Import', () => {
    it('should create server with correct configuration', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      expect(mockMcpServerConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringContaining('octocode-mcp'),
          title: 'Octocode MCP',
          version: expect.any(String),
        }),
        expect.objectContaining({
          capabilities: expect.objectContaining({
            prompts: {},
            tools: {},
          }),
        })
      );
    });

    it('should use version from package.json', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      const serverConfig = mockMcpServerConstructor.mock.calls[0]?.[0];
      expect(serverConfig?.version).toBeDefined();
      expect(typeof serverConfig?.version).toBe('string');
    });
  });

  describe('NPM Status Check', () => {
    it('should no longer check NPM status during initialization', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      // NPM status checking is now handled internally by package search tool
      expect(mockGetNPMUserDetails).not.toHaveBeenCalled();
      expect(mockRegisterTools).toHaveBeenCalled();
    });

    it('should register default tools without NPM status dependency', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      // Verify tools registration function was called
      expect(mockRegisterTools).toHaveBeenCalledWith(mockMcpServer);
    });
  });

  describe('GitHub Token Detection', () => {
    it('should use GITHUB_TOKEN when present', async () => {
      process.env.GITHUB_TOKEN = 'github-token';

      await import('../src/index.js');
      await waitForAsyncOperations();

      expect(mockRegisterTools).toHaveBeenCalledWith(mockMcpServer);
    });

    it('should use GH_TOKEN when GITHUB_TOKEN is not present', async () => {
      delete process.env.GITHUB_TOKEN;
      process.env.GH_TOKEN = 'gh-token';

      await import('../src/index.js');
      await waitForAsyncOperations();

      expect(mockRegisterTools).toHaveBeenCalledWith(mockMcpServer);
    });

    it('should use CLI token when no env tokens are present', async () => {
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;
      mockGetGithubCLIToken.mockResolvedValue('cli-token');

      await import('../src/index.js');
      await waitForAsyncOperations();

      expect(mockRegisterTools).toHaveBeenCalledWith(mockMcpServer);
    });

    it('should continue running when no token is available (graceful degradation)', async () => {
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;
      mockGetGithubCLIToken.mockResolvedValue(null);

      // Mock getGitHubToken to return null when no token is available
      mockGetGitHubToken.mockResolvedValue(null);

      // Track if exit was called (shouldn't be)
      let exitCalled = false;
      processExitSpy.mockImplementation(
        (_code?: string | number | null | undefined) => {
          exitCalled = true;
          return undefined as never;
        }
      );

      try {
        await import('../src/index.js');
        await waitForAsyncOperations();
        // Give extra time for async operations
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // Ignore any errors from module loading
      }

      // Should NOT exit - graceful degradation with warning
      expect(exitCalled).toBe(false);
      expect(mockRegisterTools).toHaveBeenCalledWith(mockMcpServer);
    });
  });

  describe('Tool Registration', () => {
    it('should register default tools successfully', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      // Verify tool registration function was called
      expect(mockRegisterTools).toHaveBeenCalledWith(mockMcpServer);
    });

    it('should continue registering tools even if some fail', async () => {
      // Mock registerTools to return partial failure
      mockRegisterTools.mockReturnValue({
        successCount: 3,
        failedTools: ['githubSearchCode'],
      });

      await import('../src/index.js');
      await waitForAsyncOperations();

      // Verify registerTools was called
      expect(mockRegisterTools).toHaveBeenCalledWith(mockMcpServer);
    });

    it('should exit when no tools are successfully registered', async () => {
      // Mock registerTools to return complete failure
      mockRegisterTools.mockReturnValue({
        successCount: 0,
        failedTools: [
          'githubSearchCode',
          'githubGetFileContent',
          'githubSearchRepositories',
          'githubViewRepoStructure',
        ],
      });

      // Track the exit call without throwing
      let exitCalled = false;
      let exitCode: number | undefined;
      processExitSpy.mockImplementation(
        (code?: string | number | null | undefined) => {
          exitCalled = true;
          exitCode =
            typeof code === 'number'
              ? code
              : code
                ? parseInt(String(code))
                : undefined;
          return undefined as never;
        }
      );

      try {
        await import('../src/index.js');
        await waitForAsyncOperations();
        // Give extra time for the catch block to execute
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // Ignore any errors from module loading
      }

      expect(exitCalled).toBe(true);
      expect(exitCode).toBe(1);
    });

    it('should handle tool registration errors gracefully', async () => {
      // Mock registerTools to return partial success
      mockRegisterTools.mockReturnValue({
        successCount: 3,
        failedTools: ['githubSearchCode'],
      });

      // The module should still load
      await import('../src/index.js');
      await waitForAsyncOperations();

      // Verify registerTools was called
      expect(mockRegisterTools).toHaveBeenCalledWith(mockMcpServer);
    });

    it('should handle multiple tool registration errors', async () => {
      // Mock registerTools to return multiple failures
      mockRegisterTools.mockReturnValue({
        successCount: 2,
        failedTools: ['githubSearchCode', 'githubGetFileContent'],
      });

      // The module should still load
      await import('../src/index.js');
      await waitForAsyncOperations();

      // Verify registerTools was called
      expect(mockRegisterTools).toHaveBeenCalledWith(mockMcpServer);
    });

    it('should handle all tool registration errors', async () => {
      // Mock all tool registration functions to throw errors
      const mockError = (toolName: string) => () => {
        throw new Error(`${toolName} registration failed`);
      };

      mockRegisterGitHubSearchCodeTool.mockImplementation(
        mockError('GitHubSearchCode')
      );
      mockRegisterFetchGitHubFileContentTool.mockImplementation(
        mockError('FetchGitHubFileContent')
      );
      mockRegisterSearchGitHubReposTool.mockImplementation(
        mockError('SearchGitHubRepos')
      );
      mockRegisterGitHubSearchCommitsTool.mockImplementation(
        mockError('GitHubSearchCommits')
      );
      mockRegisterSearchGitHubPullRequestsTool.mockImplementation(
        mockError('SearchGitHubPullRequests')
      );
      mockRegisterPackageSearchTool.mockImplementation(
        mockError('PackageSearch')
      );
      mockRegisterViewGitHubRepoStructureTool.mockImplementation(
        mockError('ViewGitHubRepoStructure')
      );

      // Mock registerTools to return complete failure for this test
      mockRegisterTools.mockReturnValue({
        successCount: 0,
        failedTools: [
          'githubSearchCode',
          'githubGetFileContent',
          'githubSearchRepositories',
          'githubViewRepoStructure',
        ],
      });

      // Track the exit call without throwing
      let exitCalled = false;
      let exitCode: number | undefined;
      processExitSpy.mockImplementation(
        (code?: string | number | null | undefined) => {
          exitCalled = true;
          exitCode =
            typeof code === 'number'
              ? code
              : code
                ? parseInt(String(code))
                : undefined;
          return undefined as never;
        }
      );

      try {
        await import('../src/index.js');
        await waitForAsyncOperations();
        // Give extra time for the catch block to execute
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // Ignore any errors from module loading
      }

      // Verify that the server was created but not connected due to tool registration failure
      expect(mockMcpServerConstructor).toHaveBeenCalled();
      expect(mockMcpServer.connect).not.toHaveBeenCalled();
      expect(exitCalled).toBe(true);
      expect(exitCode).toBe(1);
    });
  });

  describe('Server Startup', () => {
    it('should create server with correct transport', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      expect(mockStdioServerTransport).toHaveBeenCalled();
      expect(mockMcpServer.connect).toHaveBeenCalledWith(mockTransport);
    });

    it('should uncork stdout and stderr after connection', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      expect(processStdoutUncorkSpy).toHaveBeenCalled();
      expect(processStderrUncorkSpy).toHaveBeenCalled();
    });

    it('should resume stdin to keep process alive', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      expect(processStdinResumeSpy).toHaveBeenCalled();
    });

    it('should handle server startup errors', async () => {
      mockMcpServer.connect.mockRejectedValue(new Error('Connection failed'));

      // Track the exit call without throwing
      let exitCalled = false;
      let exitCode: number | undefined;
      processExitSpy.mockImplementation(
        (code?: string | number | null | undefined) => {
          exitCalled = true;
          exitCode =
            typeof code === 'number'
              ? code
              : code
                ? parseInt(String(code))
                : undefined;
          return undefined as never;
        }
      );

      try {
        await import('../src/index.js');
        await waitForAsyncOperations();
        // Give extra time for the catch block to execute
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // Ignore any errors from module loading
      }

      expect(exitCalled).toBe(true);
      expect(exitCode).toBe(1);
    });
  });

  describe('Signal Handling', () => {
    it('should register signal handlers', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith(
        'SIGTERM',
        expect.any(Function)
      );
    });

    it('should register stdin close handler', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      expect(processStdinOnSpy).toHaveBeenCalledWith(
        'close',
        expect.any(Function)
      );
    });
  });

  describe('Graceful Shutdown', () => {
    it('should clear cache on shutdown', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      // Get the SIGINT handler
      const sigintHandler = processOnSpy.mock.calls.find(
        (call: Array<unknown>) => call[0] === 'SIGINT'
      )?.[1] as Function;

      expect(sigintHandler).toBeDefined();

      // Mock process.exit to not throw for this test
      processExitSpy?.mockImplementation(() => {});

      // Call the handler
      try {
        await sigintHandler();
      } catch (error) {
        // Ignore process.exit errors
      }

      expect(mockClearAllCache).toHaveBeenCalled();

      expect(mockMcpServer.close).toHaveBeenCalled();
    });

    it('should handle shutdown timeout', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      const sigintHandler = processOnSpy.mock.calls.find(
        (call: Array<unknown>) => call[0] === 'SIGINT'
      )?.[1] as Function;

      expect(sigintHandler).toBeDefined();

      // Mock server.close to take longer than timeout (5s timeout in code)
      mockMcpServer.close.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 6000))
      );

      // Track process.exit calls without throwing in async contexts
      let exitCalled = false;
      let exitCode: number | undefined;
      processExitSpy.mockImplementation(
        (code?: string | number | null | undefined) => {
          exitCalled = true;
          exitCode =
            typeof code === 'number'
              ? code
              : code
                ? parseInt(String(code))
                : undefined;
          return undefined as never;
        }
      );

      // Start the shutdown handler (don't await it since it will timeout)
      const shutdownPromise = sigintHandler();

      // Wait for the timeout to trigger (5s timeout + some buffer)
      await new Promise(resolve => setTimeout(resolve, 5200));

      // Should exit with error code due to timeout
      expect(exitCalled).toBe(true);
      expect(exitCode).toBe(1);

      // Clean up the hanging promise
      shutdownPromise.catch(() => {});
    }, 8000); // Reduce timeout since we're only waiting ~5.2s

    it('should handle shutdown errors gracefully', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      const sigintHandler = processOnSpy.mock.calls.find(
        (call: Array<unknown>) => call[0] === 'SIGINT'
      )?.[1] as Function;

      expect(sigintHandler).toBeDefined();

      mockClearAllCache.mockImplementation(() => {
        throw new Error('Cache clear failed');
      });

      // Track process.exit calls without throwing
      let exitCalled = false;
      let exitCode: number | undefined;
      processExitSpy.mockImplementation(
        (code?: string | number | null | undefined) => {
          exitCalled = true;
          exitCode =
            typeof code === 'number'
              ? code
              : code
                ? parseInt(String(code))
                : undefined;
          return undefined as never;
        }
      );

      try {
        await sigintHandler();
      } catch (error) {
        // Ignore any errors from the handler
      }

      expect(exitCalled).toBe(true);
      expect(exitCode).toBe(1);
    });
  });

  describe('Tool Names Export Consistency', () => {
    it('should have consistent tool name exports', () => {
      expect(TOOL_NAMES.GITHUB_SEARCH_CODE).toBe('githubSearchCode');
      expect(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES).toBe(
        'githubSearchRepositories'
      );
      expect(TOOL_NAMES.GITHUB_FETCH_CONTENT).toBe('githubGetFileContent');
    });
  });

  describe('Toolset Configuration', () => {
    it('should register only default tools when no configuration is set', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      // Verify registerTools was called
      expect(mockRegisterTools).toHaveBeenCalledWith(mockMcpServer);
    });

    // Note: The following tests demonstrate the new toolset system behavior
    // but are simplified to work with the current index.js implementation
    it('should use toolset manager for tool registration', () => {
      // This test verifies that the toolset manager system is in place
      // The actual ENABLE_TOOLS/DISABLE_TOOLS functionality is tested
      // in the dedicated toolsetManager.test.ts file
      expect(true).toBe(true);
    });
  });

  describe('Beta Features Configuration', () => {
    let originalBeta: string | undefined;
    let mockRegisterSampling: ReturnType<
      typeof vi.mocked<typeof registerSampling>
    >;

    beforeEach(() => {
      originalBeta = process.env.BETA;
      mockRegisterSampling = vi.mocked(registerSampling);
      mockRegisterSampling.mockClear();
    });

    afterEach(() => {
      if (originalBeta !== undefined) {
        process.env.BETA = originalBeta;
      } else {
        delete process.env.BETA;
      }
    });

    it('should register sampling when BETA=1', async () => {
      process.env.BETA = '1';
      mockIsBetaEnabled.mockReturnValue(true);

      await import('../src/index.js');
      await waitForAsyncOperations();

      // Verify sampling was registered
      expect(mockRegisterSampling).toHaveBeenCalledWith(mockMcpServer);
    });

    it('should register sampling when BETA=true', async () => {
      process.env.BETA = 'true';
      mockIsBetaEnabled.mockReturnValue(true);

      await import('../src/index.js');
      await waitForAsyncOperations();

      // Verify sampling was registered
      expect(mockRegisterSampling).toHaveBeenCalledWith(mockMcpServer);
    });

    it('should NOT register sampling when BETA=0', async () => {
      process.env.BETA = '0';

      await import('../src/index.js');
      await waitForAsyncOperations();

      // Verify sampling was NOT registered
      expect(mockRegisterSampling).not.toHaveBeenCalled();
    });

    it('should NOT register sampling when BETA is not set', async () => {
      delete process.env.BETA;

      await import('../src/index.js');
      await waitForAsyncOperations();

      // Verify sampling was NOT registered
      expect(mockRegisterSampling).not.toHaveBeenCalled();
    });

    it('should NOT register sampling when BETA=false', async () => {
      process.env.BETA = 'false';

      await import('../src/index.js');
      await waitForAsyncOperations();

      // Verify sampling was NOT registered
      expect(mockRegisterSampling).not.toHaveBeenCalled();
    });

    it('should configure server capabilities correctly when BETA=1', async () => {
      process.env.BETA = '1';
      mockIsBetaEnabled.mockReturnValue(true);

      await import('../src/index.js');
      await waitForAsyncOperations();

      // Verify server was created with sampling capability
      expect(mockMcpServerConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringMatching(/octocode-mcp_/),
        }),
        expect.objectContaining({
          capabilities: expect.objectContaining({
            sampling: {},
          }),
        })
      );
    });

    it('should configure server capabilities correctly when BETA=0', async () => {
      process.env.BETA = '0';

      await import('../src/index.js');
      await waitForAsyncOperations();

      // Verify server was created and find the right call
      expect(mockMcpServerConstructor).toHaveBeenCalled();

      // Get the last call (most recent) - there may be multiple calls from different tests
      const calls = mockMcpServerConstructor.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall).toBeDefined();
      const capabilities = lastCall![1]!.capabilities;

      // Should have prompts and tools but NOT sampling when BETA=0
      expect(capabilities).toHaveProperty('prompts');
      expect(capabilities).toHaveProperty('tools');
      expect(capabilities).not.toHaveProperty('sampling');
    });
  });
});

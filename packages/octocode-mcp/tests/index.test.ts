import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Mock all dependencies before importing index
vi.mock('@modelcontextprotocol/sdk/server/mcp.js');
vi.mock('@modelcontextprotocol/sdk/server/stdio.js');
vi.mock('../src/utils/cache.js');
vi.mock('../src/mcp/tools/github_search_code.js');
vi.mock('../src/mcp/tools/github_fetch_content.js');
vi.mock('../src/mcp/tools/github_search_repos.js');
vi.mock('../src/mcp/tools/github_search_commits.js');
vi.mock('../src/mcp/tools/github_search_pull_requests.js');
vi.mock('../src/mcp/tools/package_search/package_search.js');
vi.mock('../src/mcp/tools/github_view_repo_structure.js');
vi.mock('../src/mcp/tools/utils/APIStatus.js');
vi.mock('../src/utils/exec.js');

// Import mocked functions
import { clearAllCache } from '../src/utils/cache.js';
import { registerGitHubSearchCodeTool } from '../src/mcp/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../src/mcp/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../src/mcp/tools/github_search_repos.js';
import { registerSearchGitHubCommitsTool } from '../src/mcp/tools/github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from '../src/mcp/tools/github_search_pull_requests.js';
import { registerPackageSearchTool } from '../src/mcp/tools/package_search/package_search.js';
import { registerViewGitHubRepoStructureTool } from '../src/mcp/tools/github_view_repo_structure.js';
import { getNPMUserDetails } from '../src/mcp/tools/utils/APIStatus.js';
import { getGithubCLIToken } from '../src/utils/exec.js';
import {
  TOOL_NAMES,
  ToolOptions,
} from '../src/mcp/tools/utils/toolConstants.js';

// Mock implementations
const mockMcpServer = {
  connect: vi.fn(),
  close: vi.fn(),
};

const mockTransport = {
  start: vi.fn(),
};

const mockClearAllCache = vi.mocked(clearAllCache);
const mockMcpServerConstructor = vi.mocked(McpServer);
const mockStdioServerTransport = vi.mocked(StdioServerTransport);
const mockGetNPMUserDetails = vi.mocked(getNPMUserDetails);
const mockGetGithubCLIToken = vi.mocked(getGithubCLIToken);

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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules(); // Reset module cache

    // Store original environment variables
    originalGithubToken = process.env.GITHUB_TOKEN;
    originalGhToken = process.env.GH_TOKEN;

    // Set a test token to avoid getToken() issues
    process.env.GITHUB_TOKEN = 'test-token';

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

    // Create spies for process methods
    processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null | undefined) => {
        // Throw an error to simulate process exit for testing
        throw new Error(`process.exit called with code ${code}`);
      });
    processStdinResumeSpy = vi
      .spyOn(process.stdin, 'resume')
      .mockImplementation(() => process.stdin);
    processStdinOnSpy = vi
      .spyOn(process.stdin, 'on')
      .mockImplementation(() => process.stdin);
    processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    processStdoutUncorkSpy = vi
      .spyOn(process.stdout, 'uncork')
      .mockImplementation(() => {});
    processStderrUncorkSpy = vi
      .spyOn(process.stderr, 'uncork')
      .mockImplementation(() => {});

    // Mock server connect to resolve immediately
    mockMcpServer.connect.mockResolvedValue(undefined);
    mockMcpServer.close.mockResolvedValue(undefined);

    // Mock all tool registration functions to succeed by default
    mockRegisterGitHubSearchCodeTool.mockImplementation(() => {});
    mockRegisterFetchGitHubFileContentTool.mockImplementation(() => {});
    mockRegisterSearchGitHubReposTool.mockImplementation(() => {});
    mockRegisterGitHubSearchCommitsTool.mockImplementation(() => {});
    mockRegisterSearchGitHubPullRequestsTool.mockImplementation(() => {});
    mockRegisterPackageSearchTool.mockImplementation(() => {});
    mockRegisterViewGitHubRepoStructureTool.mockImplementation(() => {});
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
          name: 'octocode',
          version: expect.any(String),
          description: expect.stringContaining(
            'Expert GitHub code research assistant'
          ),
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
    it('should check NPM status during initialization', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      expect(mockGetNPMUserDetails).toHaveBeenCalled();
    });

    it('should handle NPM status check failure gracefully', async () => {
      mockGetNPMUserDetails.mockRejectedValue(new Error('NPM check failed'));

      await import('../src/index.js');
      await waitForAsyncOperations();

      // Should still continue with tool registration
      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalled();
    });

    it('should pass correct tool options based on NPM status', async () => {
      mockGetNPMUserDetails.mockResolvedValue({
        npmConnected: false,
        registry: 'https://registry.npmjs.org/',
      });

      await import('../src/index.js');
      await waitForAsyncOperations();

      const expectedOptions: ToolOptions = {
        npmEnabled: false,
        ghToken: 'test-token',
      };

      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(
        mockMcpServer,
        expectedOptions
      );
    });
  });

  describe('GitHub Token Detection', () => {
    it('should use GITHUB_TOKEN when present', async () => {
      process.env.GITHUB_TOKEN = 'github-token';

      await import('../src/index.js');
      await waitForAsyncOperations();

      const expectedOptions: ToolOptions = {
        npmEnabled: true,
        ghToken: 'github-token',
      };

      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(
        mockMcpServer,
        expectedOptions
      );
    });

    it('should use GH_TOKEN when GITHUB_TOKEN is not present', async () => {
      delete process.env.GITHUB_TOKEN;
      process.env.GH_TOKEN = 'gh-token';

      await import('../src/index.js');
      await waitForAsyncOperations();

      const expectedOptions: ToolOptions = {
        npmEnabled: true,
        ghToken: 'gh-token',
      };

      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(
        mockMcpServer,
        expectedOptions
      );
    });

    it('should use CLI token when no env tokens are present', async () => {
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;
      mockGetGithubCLIToken.mockResolvedValue('cli-token');

      await import('../src/index.js');
      await waitForAsyncOperations();

      const expectedOptions: ToolOptions = {
        npmEnabled: true,
        ghToken: 'cli-token',
      };

      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(
        mockMcpServer,
        expectedOptions
      );
    });

    it('should exit when no token is available', async () => {
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;
      mockGetGithubCLIToken.mockResolvedValue(null);

      await import('../src/index.js');
      await waitForAsyncOperations();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Tool Registration', () => {
    it('should register all tools successfully with options', async () => {
      await import('../src/index.js');
      await waitForAsyncOperations();

      const expectedOptions: ToolOptions = {
        npmEnabled: true,
        ghToken: 'test-token',
      };

      // Verify all tool registration functions were called with server and options
      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(
        mockMcpServer,
        expectedOptions
      );
      expect(mockRegisterFetchGitHubFileContentTool).toHaveBeenCalledWith(
        mockMcpServer,
        expectedOptions
      );
      expect(mockRegisterSearchGitHubReposTool).toHaveBeenCalledWith(
        mockMcpServer,
        expectedOptions
      );
      expect(mockRegisterGitHubSearchCommitsTool).toHaveBeenCalledWith(
        mockMcpServer,
        expectedOptions
      );
      expect(mockRegisterSearchGitHubPullRequestsTool).toHaveBeenCalledWith(
        mockMcpServer,
        expectedOptions
      );
      expect(mockRegisterPackageSearchTool).toHaveBeenCalledWith(
        mockMcpServer,
        expectedOptions
      );
      expect(mockRegisterViewGitHubRepoStructureTool).toHaveBeenCalledWith(
        mockMcpServer,
        expectedOptions
      );
    });

    it('should continue registering tools even if some fail', async () => {
      // Make first tool registration fail
      mockRegisterGitHubSearchCodeTool.mockImplementation(() => {
        throw new Error('Registration failed');
      });

      await import('../src/index.js');
      await waitForAsyncOperations();

      // Verify other tools were still attempted
      expect(mockRegisterFetchGitHubFileContentTool).toHaveBeenCalled();
      expect(mockRegisterSearchGitHubReposTool).toHaveBeenCalled();
    });

    it('should exit when no tools are successfully registered', async () => {
      // Make all tool registrations fail
      mockRegisterGitHubSearchCodeTool.mockImplementation(() => {
        throw new Error('Registration failed');
      });
      mockRegisterFetchGitHubFileContentTool.mockImplementation(() => {
        throw new Error('Registration failed');
      });
      mockRegisterSearchGitHubReposTool.mockImplementation(() => {
        throw new Error('Registration failed');
      });
      mockRegisterGitHubSearchCommitsTool.mockImplementation(() => {
        throw new Error('Registration failed');
      });
      mockRegisterSearchGitHubPullRequestsTool.mockImplementation(() => {
        throw new Error('Registration failed');
      });
      mockRegisterPackageSearchTool.mockImplementation(() => {
        throw new Error('Registration failed');
      });
      mockRegisterViewGitHubRepoStructureTool.mockImplementation(() => {
        throw new Error('Registration failed');
      });

      // Import the module and wait for the async operations to complete
      let exitCalled = false;
      processExitSpy.mockImplementation(() => {
        exitCalled = true;
        throw new Error('process.exit called with code 1');
      });

      try {
        await import('../src/index.js');
        await waitForAsyncOperations();
        // Give extra time for the catch block to execute
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // Expected - process.exit throws
      }

      expect(exitCalled).toBe(true);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle tool registration errors gracefully', async () => {
      // Mock a tool registration function to throw an error
      mockRegisterGitHubSearchCodeTool.mockImplementation(() => {
        throw new Error('Tool registration failed');
      });

      // The module should still load and register other tools
      await import('../src/index.js');

      // Verify that other tools were still registered
      expect(mockRegisterFetchGitHubFileContentTool).toHaveBeenCalled();
      expect(mockRegisterSearchGitHubReposTool).toHaveBeenCalled();
    });

    it('should handle multiple tool registration errors', async () => {
      // Mock multiple tool registration functions to throw errors
      mockRegisterGitHubSearchCodeTool.mockImplementation(() => {
        throw new Error('Tool 1 registration failed');
      });
      mockRegisterFetchGitHubFileContentTool.mockImplementation(() => {
        throw new Error('Tool 2 registration failed');
      });

      // The module should still load and register other tools
      await import('../src/index.js');

      // Verify that other tools were still registered
      expect(mockRegisterSearchGitHubReposTool).toHaveBeenCalled();
      expect(mockRegisterGitHubSearchCommitsTool).toHaveBeenCalled();
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

      // When all tools fail, the server should not start
      let exitCalled = false;
      processExitSpy.mockImplementation(() => {
        exitCalled = true;
        throw new Error('process.exit called with code 1');
      });

      try {
        await import('../src/index.js');
        await waitForAsyncOperations();
        // Give extra time for the catch block to execute
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // Expected - process.exit throws
      }

      // Verify that the server was created but not connected due to tool registration failure
      expect(mockMcpServerConstructor).toHaveBeenCalled();
      expect(mockMcpServer.connect).not.toHaveBeenCalled();
      expect(exitCalled).toBe(true);
      expect(processExitSpy).toHaveBeenCalledWith(1);
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

      // Import the module and wait for the async operations to complete
      let exitCalled = false;
      processExitSpy.mockImplementation(() => {
        exitCalled = true;
        throw new Error('process.exit called with code 1');
      });

      try {
        await import('../src/index.js');
        await waitForAsyncOperations();
        // Give extra time for the catch block to execute
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // Expected - process.exit throws
      }

      expect(exitCalled).toBe(true);
      expect(processExitSpy).toHaveBeenCalledWith(1);
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

      // Mock server.close to take longer than timeout
      mockMcpServer.close.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 6000))
      );

      await expect(async () => {
        await sigintHandler();
      }).rejects.toThrow('process.exit called with code 1');

      // Should exit with error code due to timeout
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

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

      try {
        await sigintHandler();
      } catch (error) {
        // Expected to throw due to process.exit
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
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
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Mock all dependencies before importing index
vi.mock('@modelcontextprotocol/sdk/server/mcp.js');
vi.mock('@modelcontextprotocol/sdk/server/stdio.js');
vi.mock('../src/utils/cache.js');
vi.mock('../src/mcp/tools/api_status_check.js');
vi.mock('../src/mcp/tools/github_search_code.js');
vi.mock('../src/mcp/tools/github_fetch_content.js');
vi.mock('../src/mcp/tools/github_search_repos.js');
vi.mock('../src/mcp/tools/github_search_commits.js');
vi.mock('../src/mcp/tools/github_search_pull_requests.js');
vi.mock('../src/mcp/tools/package_search.js');
vi.mock('../src/mcp/tools/github_view_repo_structure.js');
vi.mock('../src/mcp/tools/github_search_issues.js');
vi.mock('../src/mcp/tools/npm_view_package.js');

// Import mocked functions
import { clearAllCache } from '../src/utils/cache.js';
import { registerApiStatusCheckTool } from '../src/mcp/tools/api_status_check.js';
import { registerGitHubSearchCodeTool } from '../src/mcp/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../src/mcp/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../src/mcp/tools/github_search_repos.js';
import { registerGitHubSearchCommitsTool } from '../src/mcp/tools/github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from '../src/mcp/tools/github_search_pull_requests.js';
import {
  registerNpmSearchTool,
  NPM_PACKAGE_SEARCH_TOOL_NAME,
} from '../src/mcp/tools/package_search.js';
import {
  registerViewRepositoryStructureTool,
  GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
} from '../src/mcp/tools/github_view_repo_structure.js';
import { registerSearchGitHubIssuesTool } from '../src/mcp/tools/github_search_issues.js';
import {
  GITHUB_SEARCH_ISSUES_TOOL_NAME,
  GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
  GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
  GITHUB_SEARCH_COMMITS_TOOL_NAME,
  GITHUB_GET_FILE_CONTENT_TOOL_NAME,
  API_STATUS_CHECK_TOOL_NAME,
  GITHUB_SEARCH_CODE_TOOL_NAME,
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

// Mock all tool registration functions
const mockRegisterApiStatusCheckTool = vi.mocked(registerApiStatusCheckTool);
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
  registerGitHubSearchCommitsTool
);
const mockRegisterSearchGitHubPullRequestsTool = vi.mocked(
  registerSearchGitHubPullRequestsTool
);
const mockRegisterNpmSearchTool = vi.mocked(registerNpmSearchTool);
const mockRegisterViewRepositoryStructureTool = vi.mocked(
  registerViewRepositoryStructureTool
);
const mockRegisterSearchGitHubIssuesTool = vi.mocked(
  registerSearchGitHubIssuesTool
);

describe('Index Module', () => {
  let processExitSpy: any;
  let processStdinResumeSpy: any;
  let processStdinOnSpy: any;
  let processStdoutUncorkSpy: any;
  let processStderrUncorkSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    mockMcpServerConstructor.mockImplementation(() => mockMcpServer as any);
    mockStdioServerTransport.mockImplementation(() => mockTransport as any);

    // Create spies for process methods
    processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null | undefined) => {
        if (code && code !== 0) {
          throw new Error('process.exit called');
        }
        return undefined as never;
      });
    processStdinResumeSpy = vi
      .spyOn(process.stdin, 'resume')
      .mockImplementation(() => process.stdin);
    processStdinOnSpy = vi
      .spyOn(process.stdin, 'on')
      .mockImplementation(() => process.stdin);
    processStdoutUncorkSpy = vi
      .spyOn(process.stdout, 'uncork')
      .mockImplementation(() => {});
    processStderrUncorkSpy = vi
      .spyOn(process.stderr, 'uncork')
      .mockImplementation(() => {});

    // Mock all tool registration functions to succeed by default
    mockRegisterApiStatusCheckTool.mockImplementation(() => {});
    mockRegisterGitHubSearchCodeTool.mockImplementation(() => {});
    mockRegisterFetchGitHubFileContentTool.mockImplementation(() => {});
    mockRegisterSearchGitHubReposTool.mockImplementation(() => {});
    mockRegisterGitHubSearchCommitsTool.mockImplementation(() => {});
    mockRegisterSearchGitHubPullRequestsTool.mockImplementation(() => {});
    mockRegisterNpmSearchTool.mockImplementation(() => {});
    mockRegisterViewRepositoryStructureTool.mockImplementation(() => {});
    mockRegisterSearchGitHubIssuesTool.mockImplementation(() => {});

    mockMcpServer.connect.mockResolvedValue(undefined);
    mockMcpServer.close.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Restore all spies
    processExitSpy?.mockRestore();
    processStdinResumeSpy?.mockRestore();
    processStdinOnSpy?.mockRestore();
    processStdoutUncorkSpy?.mockRestore();
    processStderrUncorkSpy?.mockRestore();
    vi.resetModules();
  });

  describe('Server Configuration', () => {
    it('should have correct server configuration', async () => {
      // Import the module to trigger execution
      await import('../src/index.js');

      expect(mockMcpServerConstructor).toHaveBeenCalledWith({
        name: 'octocode-mcp',
        version: expect.any(String),
        description: expect.stringContaining('expert code research engineer'),
      });
    });

    it('should use version from package.json', async () => {
      await import('../src/index.js');

      const serverConfig = mockMcpServerConstructor.mock.calls[0][0];
      expect(serverConfig.version).toBeDefined();
      expect(typeof serverConfig.version).toBe('string');
    });
  });

  describe('Tool Registration', () => {
    it('should register all tools successfully', async () => {
      await import('../src/index.js');

      // Verify all tool registration functions were called
      expect(mockRegisterApiStatusCheckTool).toHaveBeenCalledWith(
        mockMcpServer
      );
      expect(mockRegisterGitHubSearchCodeTool).toHaveBeenCalledWith(
        mockMcpServer
      );
      expect(mockRegisterFetchGitHubFileContentTool).toHaveBeenCalledWith(
        mockMcpServer
      );
      expect(mockRegisterSearchGitHubReposTool).toHaveBeenCalledWith(
        mockMcpServer
      );
      expect(mockRegisterGitHubSearchCommitsTool).toHaveBeenCalledWith(
        mockMcpServer
      );
      expect(mockRegisterSearchGitHubPullRequestsTool).toHaveBeenCalledWith(
        mockMcpServer
      );
      expect(mockRegisterNpmSearchTool).toHaveBeenCalledWith(mockMcpServer);
      expect(mockRegisterViewRepositoryStructureTool).toHaveBeenCalledWith(
        mockMcpServer
      );
      expect(mockRegisterSearchGitHubIssuesTool).toHaveBeenCalledWith(
        mockMcpServer
      );
    });

    it('should continue registering tools even if some fail', async () => {
      // Make some tool registrations fail
      mockRegisterApiStatusCheckTool.mockImplementation(() => {
        throw new Error('Tool registration failed');
      });
      mockRegisterGitHubSearchCodeTool.mockImplementation(() => {
        throw new Error('Another tool registration failed');
      });

      // Should not throw and should continue with other tools
      await import('../src/index.js');

      // Verify other tools were still attempted
      expect(mockRegisterFetchGitHubFileContentTool).toHaveBeenCalled();
      expect(mockRegisterSearchGitHubReposTool).toHaveBeenCalled();
    });

    it('should throw error if no tools are successfully registered', async () => {
      // Make all tool registrations fail
      const mockFunctions = [
        mockRegisterApiStatusCheckTool,
        mockRegisterGitHubSearchCodeTool,
        mockRegisterFetchGitHubFileContentTool,
        mockRegisterSearchGitHubReposTool,
        mockRegisterGitHubSearchCommitsTool,
        mockRegisterSearchGitHubPullRequestsTool,
        mockRegisterNpmSearchTool,
        mockRegisterViewRepositoryStructureTool,
        mockRegisterSearchGitHubIssuesTool,
      ];

      mockFunctions.forEach(mockFn => {
        mockFn.mockImplementation(() => {
          throw new Error('Tool registration failed');
        });
      });

      // Allow process.exit to be called without throwing for this test
      processExitSpy.mockImplementation(() => {});

      // Should exit with error code
      await import('../src/index.js');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Server Startup', () => {
    it('should create server with correct transport', async () => {
      await import('../src/index.js');

      expect(mockStdioServerTransport).toHaveBeenCalled();
      expect(mockMcpServer.connect).toHaveBeenCalledWith(mockTransport);
    });

    it('should uncork stdout and stderr after connection', async () => {
      await import('../src/index.js');

      expect(processStdoutUncorkSpy).toHaveBeenCalled();
      expect(processStderrUncorkSpy).toHaveBeenCalled();
    });

    it('should resume stdin to keep process alive', async () => {
      await import('../src/index.js');

      expect(processStdinResumeSpy).toHaveBeenCalled();
    });

    it('should handle server startup errors', async () => {
      // Allow process.exit to be called without throwing for this test
      processExitSpy.mockImplementation(() => {});

      mockMcpServer.connect.mockRejectedValue(new Error('Connection failed'));

      await import('../src/index.js');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Signal Handling', () => {
    it('should register signal handlers', async () => {
      const processOnSpy = vi
        .spyOn(process, 'on')
        .mockImplementation(() => process);

      await import('../src/index.js');

      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith(
        'SIGTERM',
        expect.any(Function)
      );
      expect(processOnSpy).toHaveBeenCalledWith(
        'uncaughtException',
        expect.any(Function)
      );
      expect(processOnSpy).toHaveBeenCalledWith(
        'unhandledRejection',
        expect.any(Function)
      );

      processOnSpy.mockRestore();
    });

    it('should register stdin close handler', async () => {
      await import('../src/index.js');

      expect(processStdinOnSpy).toHaveBeenCalledWith(
        'close',
        expect.any(Function)
      );
    });
  });

  describe('Graceful Shutdown', () => {
    it('should clear cache on shutdown', async () => {
      // Allow process.exit to be called without throwing for this test
      processExitSpy.mockImplementation(() => {});

      // Get the SIGINT handler
      const processOnSpy = vi
        .spyOn(process, 'on')
        .mockImplementation(() => process);
      await import('../src/index.js');

      const sigintHandler = processOnSpy.mock.calls.find(
        call => call[0] === 'SIGINT'
      )?.[1] as Function;

      expect(sigintHandler).toBeDefined();

      // Call the handler
      await sigintHandler();

      expect(mockClearAllCache).toHaveBeenCalled();
      expect(mockMcpServer.close).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(0);

      processOnSpy.mockRestore();
    });

    it('should handle shutdown timeout', async () => {
      // Allow process.exit to be called without throwing for this test
      processExitSpy.mockImplementation(() => {});

      // Make server close hang
      mockMcpServer.close.mockImplementation(
        () =>
          new Promise(_resolve => {
            // Never resolve to simulate timeout
          })
      );

      const processOnSpy = vi
        .spyOn(process, 'on')
        .mockImplementation(() => process);
      await import('../src/index.js');

      const sigintHandler = processOnSpy.mock.calls.find(
        call => call[0] === 'SIGINT'
      )?.[1] as Function;

      // Call the handler with timeout
      await sigintHandler();

      // Should exit with error code due to timeout
      expect(processExitSpy).toHaveBeenCalledWith(1);

      processOnSpy.mockRestore();
    });

    it('should handle shutdown errors gracefully', async () => {
      // Allow process.exit to be called without throwing for this test
      processExitSpy.mockImplementation(() => {});

      // Make server close throw error
      mockMcpServer.close.mockRejectedValue(new Error('Close failed'));

      const processOnSpy = vi
        .spyOn(process, 'on')
        .mockImplementation(() => process);
      await import('../src/index.js');

      const sigintHandler = processOnSpy.mock.calls.find(
        call => call[0] === 'SIGINT'
      )?.[1] as Function;

      // Call the handler
      await sigintHandler();

      expect(processExitSpy).toHaveBeenCalledWith(1);

      processOnSpy.mockRestore();
    });
  });

  describe('Tool Names Export Consistency', () => {
    it('should have consistent tool name exports', () => {
      // Verify all expected tool names are defined
      expect(API_STATUS_CHECK_TOOL_NAME).toBeDefined();
      expect(GITHUB_SEARCH_CODE_TOOL_NAME).toBeDefined();
      expect(GITHUB_GET_FILE_CONTENT_TOOL_NAME).toBeDefined();
      expect(GITHUB_SEARCH_REPOSITORIES_TOOL_NAME).toBeDefined();
      expect(GITHUB_SEARCH_COMMITS_TOOL_NAME).toBeDefined();
      expect(GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME).toBeDefined();
      expect(NPM_PACKAGE_SEARCH_TOOL_NAME).toBeDefined();
      expect(GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME).toBeDefined();
      expect(GITHUB_SEARCH_ISSUES_TOOL_NAME).toBeDefined();

      // Verify they are all strings
      const toolNames = [
        API_STATUS_CHECK_TOOL_NAME,
        GITHUB_SEARCH_CODE_TOOL_NAME,
        GITHUB_GET_FILE_CONTENT_TOOL_NAME,
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        GITHUB_SEARCH_COMMITS_TOOL_NAME,
        GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
        NPM_PACKAGE_SEARCH_TOOL_NAME,
        GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
        GITHUB_SEARCH_ISSUES_TOOL_NAME,
      ];

      toolNames.forEach(name => {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      });

      // Verify all tool names are unique
      const uniqueNames = new Set(toolNames);
      expect(uniqueNames.size).toBe(toolNames.length);
    });
  });
});

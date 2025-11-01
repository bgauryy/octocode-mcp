import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolInvocationCallback } from '../../src/types.js';
import { registerGitHubSearchCodeTool } from '../../src/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../../src/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';
import { registerSearchGitHubPullRequestsTool } from '../../src/tools/github_search_pull_requests.js';
import { registerViewGitHubRepoStructureTool } from '../../src/tools/github_view_repo_structure.js';
import { registerTools } from '../../src/tools/toolsManager.js';

// Mock dependencies
vi.mock('../../src/github/codeSearch.js', () => ({
  searchGitHubCodeAPI: vi.fn().mockResolvedValue({
    data: { items: [], repository: { name: 'test-repo' } },
  }),
}));

vi.mock('../../src/github/fileOperations.js', () => ({
  fetchGitHubFileContentAPI: vi.fn().mockResolvedValue({
    data: { content: 'test content', path: 'test.ts' },
  }),
  viewGitHubRepositoryStructureAPI: vi
    .fn()
    .mockResolvedValue({ files: [], folders: { folders: [] } }),
}));

vi.mock('../../src/github/repoSearch.js', () => ({
  searchGitHubReposAPI: vi
    .fn()
    .mockResolvedValue({ data: { repositories: [] } }),
}));

vi.mock('../../src/github/pullRequestSearch.js', () => ({
  searchGitHubPullRequestsAPI: vi
    .fn()
    .mockResolvedValue({ pull_requests: [], total_count: 0 }),
}));

vi.mock('../../src/serverConfig.js', () => ({
  getServerConfig: vi.fn().mockReturnValue({
    version: '1.0.0',
    enableLogging: false,
    betaEnabled: false,
    timeout: 30000,
    maxRetries: 3,
    loggingEnabled: false,
  }),
  isSamplingEnabled: vi.fn().mockReturnValue(false),
}));

describe('Tool Invocation Callback', () => {
  let server: McpServer;
  let mockCallback: ReturnType<typeof vi.fn<ToolInvocationCallback>>;

  beforeEach(() => {
    server = new McpServer({
      name: 'test-server',
      version: '1.0.0',
    });
    mockCallback = vi.fn<ToolInvocationCallback>().mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register github_search_code with callback', () => {
      const tool = registerGitHubSearchCodeTool(server, mockCallback);
      expect(tool).toBeDefined();
    });

    it('should register github_search_code without callback', () => {
      const tool = registerGitHubSearchCodeTool(server);
      expect(tool).toBeDefined();
    });

    it('should register github_fetch_content with callback', () => {
      const tool = registerFetchGitHubFileContentTool(server, mockCallback);
      expect(tool).toBeDefined();
    });

    it('should register github_search_repos with callback', () => {
      const tool = registerSearchGitHubReposTool(server, mockCallback);
      expect(tool).toBeDefined();
    });

    it('should register github_search_pull_requests with callback', () => {
      const tool = registerSearchGitHubPullRequestsTool(server, mockCallback);
      expect(tool).toBeDefined();
    });

    it('should register github_view_repo_structure with callback', () => {
      const tool = registerViewGitHubRepoStructureTool(server, mockCallback);
      expect(tool).toBeDefined();
    });
  });

  describe('registerTools with callback', () => {
    it('should pass callback to all registered tools', () => {
      const result = registerTools(server, mockCallback);

      expect(result.successCount).toBeGreaterThan(0);
      expect(result.failedTools).toHaveLength(0);
    });

    it('should work without callback', () => {
      const result = registerTools(server);

      expect(result.successCount).toBeGreaterThan(0);
      expect(result.failedTools).toHaveLength(0);
    });
  });

  describe('Type safety', () => {
    it('should accept properly typed callback', () => {
      const typedCallback: ToolInvocationCallback = async (
        toolName: string,
        queries: unknown[]
      ) => {
        expect(typeof toolName).toBe('string');
        expect(Array.isArray(queries)).toBe(true);
      };

      const tool = registerGitHubSearchCodeTool(server, typedCallback);
      expect(tool).toBeDefined();
    });

    it('should accept undefined callback', () => {
      const tool = registerGitHubSearchCodeTool(server, undefined);
      expect(tool).toBeDefined();
    });
  });
});

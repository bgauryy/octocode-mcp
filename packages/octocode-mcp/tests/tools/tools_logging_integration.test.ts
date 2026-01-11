import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TOOL_NAMES } from '../../src/tools/toolMetadata.js';

// Mock the session logging
const mockLogToolCall = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../src/session.js', () => ({
  logToolCall: mockLogToolCall,
  initializeSession: vi.fn(() => ({
    getSessionId: () => 'test-session-id',
  })),
  getSessionManager: vi.fn(() => null),
  logSessionInit: vi.fn(),
  logSessionError: vi.fn(),
  resetSessionManager: vi.fn(),
}));

// Mock GitHub API calls
vi.mock('../../src/github/index.js', () => ({
  searchGitHubCodeAPI: vi.fn(async () => ({
    success: true,
    results: [],
    totalCount: 0,
  })),
  fetchGitHubFileContentAPI: vi.fn(async () => ({
    success: true,
    content: 'test content',
    path: 'test.js',
  })),
  searchGitHubReposAPI: vi.fn(async () => ({
    success: true,
    items: [],
    totalCount: 0,
  })),
  viewGitHubRepositoryStructureAPI: vi.fn(async () => ({
    success: true,
    files: [],
    folders: [],
  })),
  searchGitHubPullRequestsAPI: vi.fn(async () => ({
    success: true,
    items: [],
    totalCount: 0,
  })),
}));

// Mock content sanitizer
vi.mock('../../src/security/contentSanitizer.js', () => ({
  ContentSanitizer: {
    validateInputParameters: vi.fn(params => ({
      isValid: true,
      sanitizedParams: params,
      warnings: [],
      hasSecrets: false,
    })),
    sanitizeContent: vi.fn(content => ({
      content,
      hasSecrets: false,
      secretsDetected: [],
      warnings: [],
    })),
  },
}));

// Mock server config
vi.mock('../../src/serverConfig.js', () => ({
  getGitHubToken: vi.fn(async () => 'test-token'),
  isLoggingEnabled: vi.fn(() => true),
}));

// Import tools after mocks are set up
import { registerGitHubSearchCodeTool } from '../../src/tools/github_search_code/github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../../src/tools/github_fetch_content/github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos/github_search_repos.js';
import { registerViewGitHubRepoStructureTool } from '../../src/tools/github_view_repo_structure/github_view_repo_structure.js';
import { registerSearchGitHubPullRequestsTool } from '../../src/tools/github_search_pull_requests/github_search_pull_requests.js';
import { createMockMcpServer } from '../fixtures/mcp-fixtures.js';

describe('Tools Logging Integration - Repo/Owner Tracking', () => {
  let mockServer: ReturnType<typeof createMockMcpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockMcpServer();
  });

  describe('github_search_code', () => {
    it('should log repo and owner from queries', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const args = {
        queries: [
          {
            id: 'test1',
            owner: 'facebook',
            repo: 'react',
            keywordsToSearch: ['useState'],
          },
        ],
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, args);

      expect(mockLogToolCall).toHaveBeenCalledWith(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        ['facebook/react'],
        undefined,
        undefined,
        undefined
      );
    });
  });

  describe('github_fetch_content', () => {
    it('should log repo and owner from queries', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const args = {
        queries: [
          {
            id: 'test1',
            owner: 'torvalds',
            repo: 'linux',
            path: 'README.md',
            fullContent: true,
          },
        ],
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_FETCH_CONTENT, args);

      expect(mockLogToolCall).toHaveBeenCalledWith(
        TOOL_NAMES.GITHUB_FETCH_CONTENT,
        ['torvalds/linux'],
        undefined,
        undefined,
        undefined
      );
    });

    it('should log each query individually when multiple queries provided', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const args = {
        queries: [
          {
            id: 'test1',
            owner: 'microsoft',
            repo: 'typescript',
            path: 'src/compiler/checker.ts',
            fullContent: true,
          },
          {
            id: 'test2',
            owner: 'facebook',
            repo: 'react',
            path: 'packages/react/index.js',
            fullContent: true,
          },
        ],
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_FETCH_CONTENT, args);

      // Bulk operations now log each query individually
      expect(mockLogToolCall).toHaveBeenCalledTimes(2);
      expect(mockLogToolCall).toHaveBeenNthCalledWith(
        1,
        TOOL_NAMES.GITHUB_FETCH_CONTENT,
        ['microsoft/typescript'],
        undefined,
        undefined,
        undefined
      );
      expect(mockLogToolCall).toHaveBeenNthCalledWith(
        2,
        TOOL_NAMES.GITHUB_FETCH_CONTENT,
        ['facebook/react'],
        undefined,
        undefined,
        undefined
      );
    });
  });

  describe('github_search_repositories', () => {
    it('should log repo and owner from queries when specified', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const args = {
        queries: [
          {
            id: 'test1',
            owner: 'google',
            repo: 'tensorflow',
          },
        ],
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, args);

      expect(mockLogToolCall).toHaveBeenCalledWith(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        ['google/tensorflow'],
        undefined,
        undefined,
        undefined
      );
    });
  });

  describe('github_view_repo_structure', () => {
    it('should log repo and owner from queries', async () => {
      registerViewGitHubRepoStructureTool(mockServer.server);

      const args = {
        queries: [
          {
            id: 'test1',
            owner: 'vuejs',
            repo: 'vue',
            branch: 'main',
            path: '',
          },
        ],
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE, args);

      expect(mockLogToolCall).toHaveBeenCalledWith(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        ['vuejs/vue'],
        undefined,
        undefined,
        undefined
      );
    });

    it('should log each query individually when exploring multiple repos', async () => {
      registerViewGitHubRepoStructureTool(mockServer.server);

      const args = {
        queries: [
          {
            id: 'test1',
            owner: 'angular',
            repo: 'angular',
            branch: 'main',
            path: 'packages',
          },
          {
            id: 'test2',
            owner: 'sveltejs',
            repo: 'svelte',
            branch: 'master',
            path: 'src',
          },
        ],
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE, args);

      // Bulk operations now log each query individually
      expect(mockLogToolCall).toHaveBeenCalledTimes(2);
      expect(mockLogToolCall).toHaveBeenNthCalledWith(
        1,
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        ['angular/angular'],
        undefined,
        undefined,
        undefined
      );
      expect(mockLogToolCall).toHaveBeenNthCalledWith(
        2,
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        ['sveltejs/svelte'],
        undefined,
        undefined,
        undefined
      );
    });
  });

  describe('github_search_pull_requests', () => {
    it('should log repo and owner from queries', async () => {
      registerSearchGitHubPullRequestsTool(mockServer.server);

      const args = {
        queries: [
          {
            id: 'test1',
            owner: 'nodejs',
            repo: 'node',
            state: 'open' as const,
          },
        ],
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS, args);

      expect(mockLogToolCall).toHaveBeenCalledWith(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        ['nodejs/node'],
        undefined,
        undefined,
        undefined
      );
    });

    it('should log repo and owner when fetching specific PR', async () => {
      registerSearchGitHubPullRequestsTool(mockServer.server);

      const args = {
        queries: [
          {
            id: 'test1',
            owner: 'rust-lang',
            repo: 'rust',
            prNumber: 12345,
          },
        ],
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS, args);

      expect(mockLogToolCall).toHaveBeenCalledWith(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        ['rust-lang/rust'],
        undefined,
        undefined,
        undefined
      );
    });
  });

  describe('All Tools Logging Summary', () => {
    it('should verify all GitHub tools use withSecurityValidation and log correctly', async () => {
      const testCases = [
        {
          name: 'github_search_code',
          register: registerGitHubSearchCodeTool,
          toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
          args: {
            queries: [
              {
                id: 'test',
                owner: 'test-owner',
                repo: 'test-repo',
                keywordsToSearch: ['test'],
              },
            ],
          },
        },
        {
          name: 'github_fetch_content',
          register: registerFetchGitHubFileContentTool,
          toolName: TOOL_NAMES.GITHUB_FETCH_CONTENT,
          args: {
            queries: [
              {
                id: 'test',
                owner: 'test-owner',
                repo: 'test-repo',
                path: 'test.js',
                fullContent: true,
              },
            ],
          },
        },
        {
          name: 'github_search_repositories',
          register: registerSearchGitHubReposTool,
          toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
          args: {
            queries: [{ id: 'test', owner: 'test-owner', repo: 'test-repo' }],
          },
        },
        {
          name: 'github_view_repo_structure',
          register: registerViewGitHubRepoStructureTool,
          toolName: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
          args: {
            queries: [
              {
                id: 'test',
                owner: 'test-owner',
                repo: 'test-repo',
                branch: 'main',
              },
            ],
          },
        },
        {
          name: 'github_search_pull_requests',
          register: registerSearchGitHubPullRequestsTool,
          toolName: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          args: {
            queries: [
              {
                id: 'test',
                owner: 'test-owner',
                repo: 'test-repo',
                state: 'open' as const,
              },
            ],
          },
        },
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();
        const server = createMockMcpServer();

        testCase.register(server.server);
        await server.callTool(testCase.toolName, testCase.args);

        expect(mockLogToolCall).toHaveBeenCalledWith(
          testCase.toolName,
          ['test-owner/test-repo'],
          undefined,
          undefined,
          undefined
        );
      }
    });
  });
});

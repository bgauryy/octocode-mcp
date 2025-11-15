/**
 * Comprehensive Response Structure Tests
 *
 * Tests all tools to ensure they properly handle all combinations of:
 * - hasResults: queries that returned results
 * - empty: queries that ran but found no matches
 * - failed: queries that encountered errors
 *
 * Combinations tested:
 * 1. hasResults only
 */

import { getTextContent } from '../utils/testHelpers.js';
/* 2. empty only
 * 3. failed only
 * 4. hasResults + empty
 * 5. hasResults + failed
 * 6. empty + failed
 * 7. hasResults + empty + failed
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Mock GitHub client first
const mockOctokit = vi.hoisted(() => ({
  rest: {
    search: {
      code: vi.fn(),
      repos: vi.fn(),
      issuesAndPullRequests: vi.fn(),
    },
    repos: {
      getContent: vi.fn(),
    },
  },
}));

vi.mock('../../src/github/client.js', () => ({
  getOctokit: vi.fn(() => mockOctokit),
}));

// Mock cache to prevent interference
vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(() => 'test-cache-key'),
  withDataCache: vi.fn(async (_key: string, fn: () => unknown) => {
    return await fn();
  }),
}));

const mockSearchGitHubCodeAPI = vi.hoisted(() => vi.fn());
const mockFetchGitHubFileContentAPI = vi.hoisted(() => vi.fn());
const mockSearchGitHubReposAPI = vi.hoisted(() => vi.fn());
const mockSearchGitHubPullRequestsAPI = vi.hoisted(() => vi.fn());
const mockViewGitHubRepositoryStructureAPI = vi.hoisted(() => vi.fn());

// Mock specific GitHub module files (not the barrel export)
vi.mock('../../src/github/codeSearch.js', () => ({
  searchGitHubCodeAPI: mockSearchGitHubCodeAPI,
}));

vi.mock('../../src/github/fileOperations.js', () => ({
  fetchGitHubFileContentAPI: mockFetchGitHubFileContentAPI,
  viewGitHubRepositoryStructureAPI: mockViewGitHubRepositoryStructureAPI,
}));

vi.mock('../../src/github/repoSearch.js', () => ({
  searchGitHubReposAPI: mockSearchGitHubReposAPI,
}));

vi.mock('../../src/github/pullRequestSearch.js', () => ({
  searchGitHubPullRequestsAPI: mockSearchGitHubPullRequestsAPI,
  fetchGitHubPullRequestByNumberAPI: vi.fn(),
  transformPullRequestItemFromREST: vi.fn(),
}));

const mockGetServerConfig = vi.hoisted(() => vi.fn());
const mockIsSamplingEnabled = vi.hoisted(() => vi.fn());
const mockGetGitHubToken = vi.hoisted(() => vi.fn());

vi.mock('../../src/serverConfig.js', () => ({
  initialize: vi.fn(),
  getServerConfig: mockGetServerConfig,
  isSamplingEnabled: mockIsSamplingEnabled,
  isLoggingEnabled: vi.fn(() => false),
  getGitHubToken: mockGetGitHubToken,
}));

// Mock session module to prevent timeouts
const mockLogToolCall = vi.hoisted(() => vi.fn());
vi.mock('../../src/session.js', () => ({
  logToolCall: mockLogToolCall,
  getSessionManager: vi.fn(() => null),
  SessionManager: vi.fn(),
}));

import { registerGitHubSearchCodeTool } from '../../src/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../../src/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';
import { registerSearchGitHubPullRequestsTool } from '../../src/tools/github_search_pull_requests.js';
import { registerViewGitHubRepoStructureTool } from '../../src/tools/github_view_repo_structure.js';
import { TOOL_NAMES } from '../../src/constants.js';

describe('Response Structure - All Tools', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    vi.clearAllMocks();

    // Mock server configuration
    mockGetServerConfig.mockReturnValue({
      version: '4.0.5',
      enableTools: [],
      disableTools: [],
      enableLogging: false,
      betaEnabled: false,
      timeout: 30000,
      maxRetries: 3,
      loggingEnabled: false,
    });
    mockIsSamplingEnabled.mockReturnValue(false);
    // Return a test token for authentication
    mockGetGitHubToken.mockResolvedValue('test-token');
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('GitHub Search Code Tool', () => {
    beforeEach(() => {
      registerGitHubSearchCodeTool(mockServer.server);
    });

    it('should handle hasResults queries only', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValueOnce({
        data: {
          total_count: 1,
          items: [
            {
              path: 'file1.js',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [{ context: 'test', positions: [] }],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          {
            keywordsToSearch: ['test'],
            reasoning: 'Test hasResults',
          },
        ],
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('reasoning: "Test hasResults"');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('1 hasResults');
    });

    it('should handle empty queries only', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValueOnce({
        data: {
          total_count: 0,
          items: [],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          {
            keywordsToSearch: ['nonexistent'],
            reasoning: 'Test empty',
          },
        ],
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('reasoning: "Test empty"');
      expect(responseText).toContain('emptyStatusHints:');
      expect(responseText).toContain('1 empty');
    });

    it('should handle failed queries only', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValueOnce({
        error: 'API error',
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          {
            keywordsToSearch: ['error'],
            reasoning: 'Test failed',
          },
        ],
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('reasoning: "Test failed"');
      expect(responseText).toContain('errorStatusHints:');
      expect(responseText).toContain('1 failed');
    });

    it('should handle successful + empty combination', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: {
            total_count: 1,
            items: [
              {
                path: 'file1.js',
                repository: { nameWithOwner: 'test/repo', url: '' },
                matches: [{ context: 'test', positions: [] }],
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: {
            total_count: 0,
            items: [],
          },
          status: 200,
        });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          { keywordsToSearch: ['found'], reasoning: 'Will succeed' },
          { keywordsToSearch: ['notfound'], reasoning: 'Will be empty' },
        ],
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 hasResults, 1 empty');
    });

    it('should handle successful + failed combination', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: {
            total_count: 1,
            items: [
              {
                path: 'file1.js',
                repository: { nameWithOwner: 'test/repo', url: '' },
                matches: [{ context: 'test', positions: [] }],
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          error: 'API error',
          status: 500,
        });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          { keywordsToSearch: ['found'], reasoning: 'Will succeed' },
          { keywordsToSearch: ['error'], reasoning: 'Will fail' },
        ],
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 hasResults, 1 failed');
    });

    it('should handle empty + failed combination', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: {
            total_count: 0,
            items: [],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          error: 'API error',
          status: 500,
        });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          { keywordsToSearch: ['notfound'], reasoning: 'Will be empty' },
          { keywordsToSearch: ['error'], reasoning: 'Will fail' },
        ],
      });

      const responseText = getTextContent(result.content);
      expect(responseText).not.toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 empty, 1 failed');
    });

    it('should handle successful + empty + failed combination', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: {
            total_count: 1,
            items: [
              {
                path: 'file1.js',
                repository: { nameWithOwner: 'test/repo', url: '' },
                matches: [{ context: 'test', positions: [] }],
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: {
            total_count: 0,
            items: [],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          error: 'API error',
          status: 500,
        });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          { keywordsToSearch: ['found'], reasoning: 'Will succeed' },
          { keywordsToSearch: ['notfound'], reasoning: 'Will be empty' },
          { keywordsToSearch: ['error'], reasoning: 'Will fail' },
        ],
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 hasResults, 1 empty, 1 failed');
    });
  });

  describe('GitHub Fetch Content Tool', () => {
    beforeEach(() => {
      registerFetchGitHubFileContentTool(mockServer.server);
    });

    it('should handle successful queries only', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValueOnce({
        data: {
          repository: 'test/repo',
          path: 'file.js',
          branch: 'main',
          content: 'console.log("test")',
          contentLength: 20,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_FETCH_CONTENT,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              path: 'file.js',
              reasoning: 'Test successful',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 hasResults');
    });

    it('should handle failed queries only', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValueOnce({
        error: 'File not found',
        status: 404,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_FETCH_CONTENT,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              path: 'missing.js',
              reasoning: 'Test failed',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      expect(responseText).not.toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 failed');
    });

    it('should handle successful + failed combination', async () => {
      mockFetchGitHubFileContentAPI
        .mockResolvedValueOnce({
          data: {
            repository: 'test/repo',
            path: 'file.js',
            branch: 'main',
            content: 'console.log("test")',
            contentLength: 20,
            minified: false,
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          error: 'File not found',
          status: 404,
        });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_FETCH_CONTENT,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              path: 'file.js',
              reasoning: 'Will succeed',
            },
            {
              owner: 'test',
              repo: 'repo',
              path: 'missing.js',
              reasoning: 'Will fail',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 hasResults, 1 failed');
    });
  });

  describe('GitHub Search Repositories Tool', () => {
    beforeEach(() => {
      registerSearchGitHubReposTool(mockServer.server);
    });

    it('should handle successful queries only', async () => {
      mockSearchGitHubReposAPI.mockResolvedValueOnce({
        data: {
          repositories: [
            {
              owner: 'test',
              repo: 'repo',
              stars: 100,
              description: 'Test',
              url: 'https://github.com/test/repo',
              updatedAt: '01/01/2024',
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['test'],
              reasoning: 'Test successful',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 hasResults');
    });

    it('should handle empty queries only', async () => {
      mockSearchGitHubReposAPI.mockResolvedValueOnce({
        data: {
          repositories: [],
        },
        status: 200,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['nonexistent'],
              reasoning: 'Test empty',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      expect(responseText).not.toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 empty');
    });

    it('should handle successful + empty + failed combination', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                owner: 'test',
                repo: 'repo',
                stars: 100,
                description: 'Test',
                url: 'https://github.com/test/repo',
                updatedAt: '01/01/2024',
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: {
            repositories: [],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          error: 'API error',
          status: 500,
        });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            { keywordsToSearch: ['found'], reasoning: 'Will succeed' },
            { keywordsToSearch: ['notfound'], reasoning: 'Will be empty' },
            { keywordsToSearch: ['error'], reasoning: 'Will fail' },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 hasResults, 1 empty, 1 failed');
    });
  });

  describe('GitHub Search Pull Requests Tool', () => {
    beforeEach(() => {
      registerSearchGitHubPullRequestsTool(mockServer.server);
    });

    it('should handle successful queries only', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValueOnce({
        pull_requests: [{ number: 1, title: 'PR', url: 'url' }],
        total_count: 1,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              query: 'test',
              reasoning: 'Test successful',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 hasResults');
    });

    it('should handle empty queries only', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValueOnce({
        pull_requests: [],
        total_count: 0,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              query: 'nonexistent',
              reasoning: 'Test empty',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      expect(responseText).not.toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 empty');
    });

    it('should handle successful + empty + failed combination', async () => {
      mockSearchGitHubPullRequestsAPI
        .mockResolvedValueOnce({
          pull_requests: [{ number: 1, title: 'PR', url: 'url' }],
          total_count: 1,
        })
        .mockResolvedValueOnce({
          pull_requests: [],
          total_count: 0,
        })
        .mockResolvedValueOnce({
          error: 'API error',
        });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            { query: 'found', reasoning: 'Will succeed' },
            { query: 'notfound', reasoning: 'Will be empty' },
            { query: 'error', reasoning: 'Will fail' },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 hasResults, 1 empty, 1 failed');
    });
  });

  describe('GitHub View Repository Structure Tool', () => {
    beforeEach(() => {
      registerViewGitHubRepoStructureTool(mockServer.server);
    });

    it('should handle successful queries only', async () => {
      mockViewGitHubRepositoryStructureAPI.mockResolvedValueOnce({
        files: [{ path: '/README.md', size: 100 }],
        folders: { folders: [{ path: '/src' }] },
        summary: {
          totalFiles: 1,
          totalDirectories: 1,
        },
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              reasoning: 'Test successful',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 hasResults');
    });

    it('should handle empty queries only', async () => {
      mockViewGitHubRepositoryStructureAPI.mockResolvedValueOnce({
        files: [],
        folders: { folders: [] },
        summary: {
          totalFiles: 0,
          totalDirectories: 0,
        },
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              reasoning: 'Test empty',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      expect(responseText).not.toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 empty');
    });

    it('should handle successful + empty + failed combination', async () => {
      mockViewGitHubRepositoryStructureAPI
        .mockResolvedValueOnce({
          files: [{ path: '/README.md', size: 100 }],
          folders: { folders: [{ path: '/src' }] },
          summary: {
            totalFiles: 1,
            totalDirectories: 1,
          },
        })
        .mockResolvedValueOnce({
          files: [],
          folders: { folders: [] },
          summary: {
            totalFiles: 0,
            totalDirectories: 0,
          },
        })
        .mockResolvedValueOnce({
          error: 'Repository not found',
        });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo1',
              branch: 'main',
              reasoning: 'Will succeed',
            },
            {
              owner: 'test',
              repo: 'empty',
              branch: 'main',
              reasoning: 'Will be empty',
            },
            {
              owner: 'test',
              repo: 'missing',
              branch: 'main',
              reasoning: 'Will fail',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 hasResults, 1 empty, 1 failed');
    });
  });

  describe('Hints Organization', () => {
    beforeEach(() => {
      registerGitHubSearchCodeTool(mockServer.server);
    });

    it('should include hints for each result type', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: {
            total_count: 1,
            items: [
              {
                path: 'file1.js',
                repository: { nameWithOwner: 'test/repo', url: '' },
                matches: [{ context: 'test', positions: [] }],
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: {
            total_count: 0,
            items: [],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          error: 'API error',
          status: 500,
        });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          { keywordsToSearch: ['found'], reasoning: 'Will succeed' },
          { keywordsToSearch: ['notfound'], reasoning: 'Will be empty' },
          { keywordsToSearch: ['error'], reasoning: 'Will fail' },
        ],
      });

      const responseText = getTextContent(result.content);

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('emptyStatusHints:');
      expect(responseText).toContain('errorStatusHints:');

      expect(responseText).toMatch(/hasResultsStatusHints:[\s\S]*-/);
    });

    it('should only include hint sections for result types that exist', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValueOnce({
        data: {
          total_count: 1,
          items: [
            {
              path: 'file1.js',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [{ context: 'test', positions: [] }],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['found'], reasoning: 'Will succeed' }],
      });

      const responseText = getTextContent(result.content);

      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
    });
  });
});

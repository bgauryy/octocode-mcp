import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';
import { getTextContent } from '../utils/testHelpers.js';

const mockGetProvider = vi.hoisted(() => vi.fn());
const mockGetGitHubToken = vi.hoisted(() => vi.fn());

vi.mock('../../src/providers/factory.js', () => ({
  getProvider: mockGetProvider,
}));

vi.mock('../../src/utils/http/cache.js', () => ({
  generateCacheKey: vi.fn(),
  withCache: vi.fn(),
}));

vi.mock('../../src/tools/utils/tokenManager.js', () => ({
  getGitHubToken: mockGetGitHubToken,
}));

vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
  getGitHubToken: mockGetGitHubToken,
  getActiveProviderConfig: vi.fn(() => ({
    provider: 'github',
    baseUrl: undefined,
    token: 'mock-token',
  })),
  getServerConfig: vi.fn(() => ({
    version: '1.0.0',
    enableLogging: true,
    timeout: 30000,
    maxRetries: 3,
    loggingEnabled: false,
  })),
}));

import { registerSearchGitHubPullRequestsTool } from '../../src/tools/github_search_pull_requests/github_search_pull_requests.js';
import { TOOL_NAMES } from '../../src/tools/toolMetadata.js';

// Helper to create mock PR response
function createMockPRProviderResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      items: [
        {
          id: 456,
          number: 456,
          title: 'Test PR',
          state: 'open',
          draft: false,
          merged: false,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-01T00:00:00Z',
          closedAt: null,
          mergedAt: null,
          author: { login: 'testuser', id: '1' },
          assignees: [],
          labels: [],
          head: { ref: 'feature-branch', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          body: 'Test PR description',
          comments: 0,
          reviewComments: 0,
          additions: 10,
          deletions: 5,
          changedFiles: 2,
          url: 'https://github.com/test/repo/pull/456',
          repository: { id: '1', name: 'test/repo', url: '' },
        },
      ],
      totalCount: 1,
      pagination: { currentPage: 1, totalPages: 1, hasMore: false },
      ...overrides,
    },
    status: 200,
    provider: 'github',
  };
}

describe('GitHub Search Pull Requests Tool', () => {
  let mockServer: MockMcpServer;
  let mockProvider: {
    searchCode: ReturnType<typeof vi.fn>;
    getFileContent: ReturnType<typeof vi.fn>;
    searchRepos: ReturnType<typeof vi.fn>;
    searchPullRequests: ReturnType<typeof vi.fn>;
    getRepoStructure: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockServer = createMockMcpServer();

    mockProvider = {
      searchCode: vi.fn(),
      getFileContent: vi.fn(),
      searchRepos: vi.fn(),
      searchPullRequests: vi.fn(),
      getRepoStructure: vi.fn(),
    };
    mockGetProvider.mockReturnValue(mockProvider);

    registerSearchGitHubPullRequestsTool(mockServer.server);
    vi.clearAllMocks();
    mockGetProvider.mockReturnValue(mockProvider);
    mockGetGitHubToken.mockResolvedValue('test-token');
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Basic Search', () => {
    it('should search for pull requests and return results', async () => {
      mockProvider.searchPullRequests.mockResolvedValue(
        createMockPRProviderResponse()
      );

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              state: 'open',
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Test PR');
    });

    it('should handle no results', async () => {
      mockProvider.searchPullRequests.mockResolvedValue({
        data: {
          items: [],
          totalCount: 0,
          pagination: { currentPage: 1, totalPages: 0, hasMore: false },
        },
        status: 200,
        provider: 'github',
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              state: 'open',
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('empty');
    });
  });

  describe('Filters', () => {
    it('should filter by state', async () => {
      mockProvider.searchPullRequests.mockResolvedValue(
        createMockPRProviderResponse()
      );

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              state: 'closed',
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
    });

    it('should filter by author', async () => {
      mockProvider.searchPullRequests.mockResolvedValue(
        createMockPRProviderResponse()
      );

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              author: 'testuser',
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
    });

    it('should handle merged filter', async () => {
      mockProvider.searchPullRequests.mockResolvedValue(
        createMockPRProviderResponse()
      );

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              merged: true,
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
    });
  });

  describe('PR Number lookup', () => {
    it('should fetch specific PR by number', async () => {
      mockProvider.searchPullRequests.mockResolvedValue(
        createMockPRProviderResponse()
      );

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              prNumber: 456,
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('456');
    });
  });

  describe('Bulk queries', () => {
    it('should handle multiple queries', async () => {
      mockProvider.searchPullRequests
        .mockResolvedValueOnce(createMockPRProviderResponse())
        .mockResolvedValueOnce({
          data: {
            items: [
              {
                id: 789,
                number: 789,
                title: 'Second PR',
                state: 'closed',
                merged: true,
                draft: false,
                createdAt: '2023-01-02T00:00:00Z',
                updatedAt: '2023-01-02T00:00:00Z',
                closedAt: '2023-01-03T00:00:00Z',
                mergedAt: '2023-01-03T00:00:00Z',
                author: { login: 'user2', id: '2' },
                assignees: [],
                labels: [],
                head: { ref: 'fix-branch', sha: 'ghi789' },
                base: { ref: 'main', sha: 'jkl012' },
                body: 'Fix description',
                comments: 2,
                reviewComments: 1,
                additions: 5,
                deletions: 3,
                changedFiles: 1,
                url: 'https://github.com/test/repo/pull/789',
                repository: { id: '1', name: 'test/repo', url: '' },
              },
            ],
            totalCount: 1,
            pagination: { currentPage: 1, totalPages: 1, hasMore: false },
          },
          status: 200,
          provider: 'github',
        });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            { owner: 'test', repo: 'repo', state: 'open' },
            { owner: 'test', repo: 'repo', state: 'closed' },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Test PR');
      expect(responseText).toContain('Second PR');
    });
  });

  describe('Error handling', () => {
    it('should handle API errors', async () => {
      mockProvider.searchPullRequests.mockResolvedValue({
        error: 'Not found',
        status: 404,
        provider: 'github',
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              owner: 'nonexistent',
              repo: 'repo',
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('error');
    });

    it('should handle provider exceptions', async () => {
      mockProvider.searchPullRequests.mockRejectedValue(
        new Error('Network error')
      );

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('error');
    });
  });

  describe('Pagination', () => {
    it('should handle paginated results', async () => {
      mockProvider.searchPullRequests.mockResolvedValue({
        data: {
          items: [createMockPRProviderResponse().data.items[0]],
          totalCount: 50,
          pagination: { currentPage: 1, totalPages: 5, hasMore: true },
        },
        status: 200,
        provider: 'github',
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              limit: 10,
              page: 1,
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
    });
  });

  describe('Query text search', () => {
    it('should search by query string', async () => {
      mockProvider.searchPullRequests.mockResolvedValue(
        createMockPRProviderResponse()
      );

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              query: 'fix bug',
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
    });
  });

  describe('Validation', () => {
    it('should return error when query is too long (>256 chars)', async () => {
      const longQuery = 'a'.repeat(300);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              query: longQuery,
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Query too long');
    });

    it('should return error when no valid search params provided', async () => {
      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              // No owner, repo, author, assignee, query, or prNumber
              state: 'open',
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('At least one valid search parameter');
    });

    it('should handle multiple queries where only first has long query', async () => {
      const longQuery = 'a'.repeat(300);
      mockProvider.searchPullRequests.mockResolvedValue(
        createMockPRProviderResponse()
      );

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              query: longQuery,
            },
            {
              owner: 'test',
              repo: 'repo',
              state: 'open',
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Query too long');
      expect(responseText).toContain('Test PR');
    });
  });

  describe('Pagination hints', () => {
    it('should show Previous page hint when on page > 1', async () => {
      mockProvider.searchPullRequests.mockResolvedValue({
        data: {
          items: [createMockPRProviderResponse().data.items[0]],
          totalCount: 100,
          pagination: {
            currentPage: 3,
            totalPages: 10,
            hasMore: true,
            entriesPerPage: 10,
            totalEntries: 100,
          },
        },
        status: 200,
        provider: 'github',
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              page: 3,
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Previous: page=2');
      expect(responseText).toContain('Next: page=4');
    });

    it('should show Final page hint when on last page', async () => {
      mockProvider.searchPullRequests.mockResolvedValue({
        data: {
          items: [createMockPRProviderResponse().data.items[0]],
          totalCount: 30,
          pagination: {
            currentPage: 3,
            totalPages: 3,
            hasMore: false,
            entriesPerPage: 10,
            totalEntries: 30,
          },
        },
        status: 200,
        provider: 'github',
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              page: 3,
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Final page');
      expect(responseText).toContain('Previous: page=2');
    });

    it('should show jump hints when totalPages > 2', async () => {
      mockProvider.searchPullRequests.mockResolvedValue({
        data: {
          items: [createMockPRProviderResponse().data.items[0]],
          totalCount: 50,
          pagination: {
            currentPage: 1,
            totalPages: 5,
            hasMore: true,
            entriesPerPage: 10,
            totalEntries: 50,
          },
        },
        status: 200,
        provider: 'github',
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain(
        'Jump to: page=1 (first) or page=5 (last)'
      );
    });
  });
});

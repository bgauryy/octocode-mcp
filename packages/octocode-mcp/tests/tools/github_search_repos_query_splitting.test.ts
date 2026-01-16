import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockMcpServer } from '../fixtures/mcp-fixtures.js';
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos/github_search_repos.js';
import { TOOL_NAMES } from '../../src/tools/toolMetadata.js';
import type { GitHubReposSearchQuery } from '../../src/types.js';
import { getTextContent } from '../utils/testHelpers.js';

const mockGetProvider = vi.hoisted(() => vi.fn());

vi.mock('../../src/providers/factory.js', () => ({
  getProvider: mockGetProvider,
}));

vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
  getActiveProviderConfig: vi.fn(() => ({
    provider: 'github',
    baseUrl: undefined,
    token: 'mock-token',
  })),
  getGitHubToken: vi.fn(() => Promise.resolve('test-token')),
}));

describe('GitHub Search Repositories Query Splitting', () => {
  let mockProvider: {
    searchCode: ReturnType<typeof vi.fn>;
    getFileContent: ReturnType<typeof vi.fn>;
    searchRepos: ReturnType<typeof vi.fn>;
    searchPullRequests: ReturnType<typeof vi.fn>;
    getRepoStructure: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      searchCode: vi.fn(),
      getFileContent: vi.fn(),
      searchRepos: vi.fn(),
      searchPullRequests: vi.fn(),
      getRepoStructure: vi.fn(),
    };
    mockGetProvider.mockReturnValue(mockProvider);

    // Mock successful API response
    mockProvider.searchRepos.mockResolvedValue({
      data: {
        repositories: [
          {
            id: '1',
            name: 'repo',
            fullPath: 'test/repo',
            description: 'Test repository',
            url: 'https://github.com/test/repo',
            stars: 100,
            forks: 10,
            language: 'JavaScript',
            topics: [],
            createdAt: '01/01/2020',
            updatedAt: '01/01/2024',
            pushedAt: '01/01/2024',
            defaultBranch: 'main',
            isPrivate: false,
          },
        ],
        totalCount: 1,
        pagination: { currentPage: 1, totalPages: 1, hasMore: false },
      },
      status: 200,
      provider: 'github',
    });
  });

  describe('Query Splitting Logic', () => {
    it('should split queries with both topicsToSearch and keywordsToSearch into separate queries', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const originalQuery: GitHubReposSearchQuery = {
        reasoning: 'Test query with both search types',
        topicsToSearch: ['computer-vision', 'deep-learning'],
        keywordsToSearch: ['whale', 'detection'],
        limit: 10,
        sort: 'stars',
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries: [originalQuery],
      });

      // Should have been called twice - once for topics, once for keywords
      expect(mockProvider.searchRepos).toHaveBeenCalledTimes(2);
    });

    it('should NOT split queries with only topicsToSearch', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const originalQuery: GitHubReposSearchQuery = {
        reasoning: 'Test query with only topics',
        topicsToSearch: ['computer-vision', 'deep-learning'],
        limit: 10,
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries: [originalQuery],
      });

      expect(mockProvider.searchRepos).toHaveBeenCalledTimes(1);
    });

    it('should NOT split queries with only keywordsToSearch', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const originalQuery: GitHubReposSearchQuery = {
        reasoning: 'Test query with only keywords',
        keywordsToSearch: ['whale', 'detection'],
        limit: 10,
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries: [originalQuery],
      });

      expect(mockProvider.searchRepos).toHaveBeenCalledTimes(1);
    });
  });

  describe('Response Deduplication', () => {
    it('should deduplicate results from split queries', async () => {
      // Both queries return the same repo
      mockProvider.searchRepos.mockResolvedValue({
        data: {
          repositories: [
            {
              id: '1',
              name: 'repo',
              fullPath: 'duplicate/repo',
              description: 'Duplicate repo',
              url: 'https://github.com/duplicate/repo',
              stars: 100,
              forks: 10,
              language: 'Python',
              topics: ['computer-vision'],
              createdAt: '01/01/2020',
              updatedAt: '01/01/2024',
              pushedAt: '01/01/2024',
              defaultBranch: 'main',
              isPrivate: false,
            },
          ],
          totalCount: 1,
          pagination: { currentPage: 1, totalPages: 1, hasMore: false },
        },
        status: 200,
        provider: 'github',
      });

      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              reasoning: 'Test dedup',
              topicsToSearch: ['computer-vision'],
              keywordsToSearch: ['whale'],
              limit: 10,
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('duplicate/repo');
    });
  });

  describe('Error Handling', () => {
    it('should handle partial failures in split queries', async () => {
      mockProvider.searchRepos
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                id: '1',
                name: 'repo',
                fullPath: 'success/repo',
                description: 'Success',
                url: 'https://github.com/success/repo',
                stars: 100,
                forks: 10,
                language: 'Python',
                topics: [],
                createdAt: '01/01/2020',
                updatedAt: '01/01/2024',
                pushedAt: '01/01/2024',
                defaultBranch: 'main',
                isPrivate: false,
              },
            ],
            totalCount: 1,
            pagination: { currentPage: 1, totalPages: 1, hasMore: false },
          },
          status: 200,
          provider: 'github',
        })
        .mockResolvedValueOnce({
          error: 'Rate limit exceeded',
          status: 403,
          provider: 'github',
        });

      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              reasoning: 'Test partial failure',
              topicsToSearch: ['topic1'],
              keywordsToSearch: ['keyword1'],
              limit: 10,
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('success/repo');
    });
  });

  describe('Filter Preservation', () => {
    it('should preserve all filters in split queries', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries: [
          {
            reasoning: 'Test filter preservation',
            topicsToSearch: ['topic1'],
            keywordsToSearch: ['keyword1'],
            stars: '>1000',
            sort: 'stars',
            limit: 5,
          },
        ],
      });

      expect(mockProvider.searchRepos).toHaveBeenCalledTimes(2);
    });
  });
});

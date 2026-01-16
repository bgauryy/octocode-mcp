import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';
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
  getGitHubToken: vi.fn(() => Promise.resolve('mock-token')),
  getServerConfig: vi.fn(() => ({
    version: '1.0.0',
    enableLogging: true,
    timeout: 30000,
    maxRetries: 3,
    loggingEnabled: false,
  })),
}));

import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos/github_search_repos.js';
import { TOOL_NAMES } from '../../src/tools/toolMetadata.js';

describe('GitHub Search Repos Tool - Comprehensive Status Tests', () => {
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

    vi.clearAllMocks();
    mockGetProvider.mockReturnValue(mockProvider);
    registerSearchGitHubReposTool(mockServer.server);
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  describe('Status: hasResults', () => {
    it('should return hasResults status when API returns repositories', async () => {
      mockProvider.searchRepos.mockResolvedValue({
        data: {
          repositories: [
            {
              id: '1',
              name: 'react',
              fullPath: 'facebook/react',
              description: 'A declarative JavaScript library',
              url: 'https://github.com/facebook/react',
              stars: 200000,
              forks: 40000,
              language: 'JavaScript',
              topics: ['javascript', 'react'],
              createdAt: '2024-01-15',
              updatedAt: '2024-01-15',
              pushedAt: '2024-01-15',
              defaultBranch: 'main',
              isPrivate: false,
            },
            {
              id: '2',
              name: 'next.js',
              fullPath: 'vercel/next.js',
              description: 'The React Framework',
              url: 'https://github.com/vercel/next.js',
              stars: 100000,
              forks: 20000,
              language: 'JavaScript',
              topics: ['nextjs', 'react'],
              createdAt: '2024-01-14',
              updatedAt: '2024-01-14',
              pushedAt: '2024-01-14',
              defaultBranch: 'main',
              isPrivate: false,
            },
          ],
          totalCount: 2,
          pagination: { currentPage: 1, totalPages: 1, hasMore: false },
        },
        status: 200,
        provider: 'github',
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['react'],
              limit: 2,
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('facebook/react');
      expect(responseText).toContain('vercel/next.js');
    });

    it('should handle single repository result', async () => {
      mockProvider.searchRepos.mockResolvedValue({
        data: {
          repositories: [
            {
              id: '1',
              name: 'TypeScript',
              fullPath: 'microsoft/TypeScript',
              description: 'TypeScript language',
              url: 'https://github.com/microsoft/TypeScript',
              stars: 90000,
              forks: 12000,
              language: 'TypeScript',
              topics: ['typescript'],
              createdAt: '2024-01-15',
              updatedAt: '2024-01-15',
              pushedAt: '2024-01-15',
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

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [{ keywordsToSearch: ['typescript'] }],
        }
      );

      const responseText = getTextContent(result.content);
      expect(result.isError).toBe(false);
      expect(responseText).toContain('microsoft/TypeScript');
    });
  });

  describe('Status: empty', () => {
    it('should return empty status when no repositories found', async () => {
      mockProvider.searchRepos.mockResolvedValue({
        data: {
          repositories: [],
          totalCount: 0,
          pagination: { currentPage: 1, totalPages: 0, hasMore: false },
        },
        status: 200,
        provider: 'github',
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['veryrandomnonexistent123'],
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      expect(result.isError).toBe(false);
      expect(responseText).toContain('empty');
    });
  });

  describe('Status: error', () => {
    it('should return error status when API fails', async () => {
      mockProvider.searchRepos.mockResolvedValue({
        error: 'Rate limit exceeded',
        status: 403,
        provider: 'github',
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [{ keywordsToSearch: ['test'] }],
        }
      );

      const responseText = getTextContent(result.content);
      expect(result.isError).toBe(false);
      expect(responseText).toContain('error');
    });
  });

  describe('Filters', () => {
    it('should handle stars filter', async () => {
      mockProvider.searchRepos.mockResolvedValue({
        data: {
          repositories: [
            {
              id: '1',
              name: 'repo',
              fullPath: 'popular/repo',
              description: 'Popular repo',
              url: 'https://github.com/popular/repo',
              stars: 50000,
              forks: 5000,
              language: 'JavaScript',
              topics: [],
              createdAt: '2024-01-15',
              updatedAt: '2024-01-15',
              pushedAt: '2024-01-15',
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

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['popular'],
              stars: '>10000',
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
    });

    it('should handle owner filter', async () => {
      mockProvider.searchRepos.mockResolvedValue({
        data: {
          repositories: [
            {
              id: '1',
              name: 'react',
              fullPath: 'facebook/react',
              description: 'React',
              url: 'https://github.com/facebook/react',
              stars: 200000,
              forks: 40000,
              language: 'JavaScript',
              topics: [],
              createdAt: '2024-01-15',
              updatedAt: '2024-01-15',
              pushedAt: '2024-01-15',
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

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              owner: 'facebook',
              keywordsToSearch: ['react'],
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('facebook');
    });

    it('should handle topics filter', async () => {
      mockProvider.searchRepos.mockResolvedValue({
        data: {
          repositories: [
            {
              id: '1',
              name: 'cli',
              fullPath: 'awesome/cli',
              description: 'CLI tool',
              url: 'https://github.com/awesome/cli',
              stars: 5000,
              forks: 500,
              language: 'TypeScript',
              topics: ['cli', 'typescript'],
              createdAt: '2024-01-15',
              updatedAt: '2024-01-15',
              pushedAt: '2024-01-15',
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

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              topicsToSearch: ['cli', 'typescript'],
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
    });
  });

  describe('Bulk queries', () => {
    it('should handle multiple queries', async () => {
      mockProvider.searchRepos
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                id: '1',
                name: 'react',
                fullPath: 'facebook/react',
                description: 'React',
                url: 'https://github.com/facebook/react',
                stars: 200000,
                forks: 40000,
                language: 'JavaScript',
                topics: [],
                createdAt: '2024-01-15',
                updatedAt: '2024-01-15',
                pushedAt: '2024-01-15',
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
          data: {
            repositories: [
              {
                id: '2',
                name: 'vue',
                fullPath: 'vuejs/vue',
                description: 'Vue',
                url: 'https://github.com/vuejs/vue',
                stars: 180000,
                forks: 30000,
                language: 'JavaScript',
                topics: [],
                createdAt: '2024-01-15',
                updatedAt: '2024-01-15',
                pushedAt: '2024-01-15',
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

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            { keywordsToSearch: ['react'] },
            { keywordsToSearch: ['vue'] },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('react');
      expect(responseText).toContain('vue');
    });
  });

  describe('Pagination', () => {
    it('should handle paginated results', async () => {
      mockProvider.searchRepos.mockResolvedValue({
        data: {
          repositories: [
            {
              id: '1',
              name: 'repo',
              fullPath: 'test/repo',
              description: 'Test',
              url: 'https://github.com/test/repo',
              stars: 100,
              forks: 10,
              language: 'JavaScript',
              topics: [],
              createdAt: '2024-01-15',
              updatedAt: '2024-01-15',
              pushedAt: '2024-01-15',
              defaultBranch: 'main',
              isPrivate: false,
            },
          ],
          totalCount: 100,
          pagination: { currentPage: 2, totalPages: 10, hasMore: true },
        },
        status: 200,
        provider: 'github',
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['test'],
              page: 2,
              limit: 10,
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
    });
  });

  describe('Exception handling', () => {
    it('should handle provider exceptions', async () => {
      mockProvider.searchRepos.mockRejectedValue(new Error('Network error'));

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [{ keywordsToSearch: ['test'] }],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('error');
    });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

const mockSearchGitHubReposAPI = vi.hoisted(() => vi.fn());

vi.mock('../../src/github/index.js', () => ({
  searchGitHubReposAPI: mockSearchGitHubReposAPI,
}));

vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
}));

import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';

describe('GitHub Search Repos Tool - Comprehensive Status Tests', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    vi.clearAllMocks();
    registerSearchGitHubReposTool(mockServer.server);
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  describe('Status: hasResults', () => {
    it('should return hasResults status when API returns repositories', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [
            {
              repository: 'facebook/react',
              stars: 200000,
              description: 'A declarative JavaScript library',
              url: 'https://github.com/facebook/react',
              updatedAt: '2024-01-15',
            },
            {
              repository: 'vercel/next.js',
              stars: 100000,
              description: 'The React Framework',
              url: 'https://github.com/vercel/next.js',
              updatedAt: '2024-01-14',
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            keywordsToSearch: ['react'],
            limit: 2,
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(result.isError).toBe(false);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('repositories:');
      expect(responseText).toContain('facebook/react');
      expect(responseText).toContain('vercel/next.js');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('1 hasResults');
    });

    it('should handle single repository result', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [
            {
              repository: 'microsoft/TypeScript',
              stars: 90000,
              description: 'TypeScript is a superset of JavaScript',
              url: 'https://github.com/microsoft/TypeScript',
              updatedAt: '2024-01-10',
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            keywordsToSearch: ['typescript'],
            limit: 1,
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(result.isError).toBe(false);
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('microsoft/TypeScript');
      expect(responseText).toContain('1 hasResults');
    });

    it('should include all repository fields in response', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [
            {
              repository: 'nodejs/node',
              stars: 95000,
              description: 'Node.js JavaScript runtime',
              url: 'https://github.com/nodejs/node',
              updatedAt: '2024-01-20',
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            keywordsToSearch: ['nodejs'],
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(responseText).toContain('repository: "nodejs/node"');
      expect(responseText).toContain('stars: 95000');
      expect(responseText).toContain(
        'description: "Node.js JavaScript runtime"'
      );
      expect(responseText).toContain('url: "https://github.com/nodejs/node"');
      expect(responseText).toContain('updatedAt: "2024-01-20"');
    });
  });

  describe('Status: empty', () => {
    it('should return empty status when API returns no repositories', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [],
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            keywordsToSearch: ['nonexistent-repo-xyz123'],
            limit: 5,
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(result.isError).toBe(false);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('emptyStatusHints:');
      expect(responseText).toContain('1 empty');
    });

    it('should handle empty repositories array', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [],
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            topicsToSearch: ['nonexistent-topic-xyz'],
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(result.isError).toBe(false);
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('emptyStatusHints:');
    });
  });

  describe('Status: error', () => {
    it('should return error status when API returns error', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        error: 'API rate limit exceeded',
        type: 'rateLimit',
        status: 429,
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            keywordsToSearch: ['test'],
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(result.isError).toBe(false);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('error: "API rate limit exceeded"');
      expect(responseText).toContain('errorStatusHints:');
      expect(responseText).toContain('1 failed');
    });

    it('should handle exception thrown during API call', async () => {
      mockSearchGitHubReposAPI.mockRejectedValue(
        new Error('Network connection failed')
      );

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            keywordsToSearch: ['test'],
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(result.isError).toBe(false);
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('error: "Network connection failed"');
      expect(responseText).toContain('errorStatusHints:');
    });
  });

  describe('Multiple queries - same status', () => {
    it('should handle multiple queries all with hasResults', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'facebook/react',
                stars: 200000,
                description: 'React library',
                url: 'https://github.com/facebook/react',
                updatedAt: '2024-01-15',
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'angular/angular',
                stars: 85000,
                description: 'Angular framework',
                url: 'https://github.com/angular/angular',
                updatedAt: '2024-01-14',
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'vuejs/vue',
                stars: 195000,
                description: 'Vue.js framework',
                url: 'https://github.com/vuejs/vue',
                updatedAt: '2024-01-13',
              },
            ],
          },
          status: 200,
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          { keywordsToSearch: ['react'] },
          { keywordsToSearch: ['angular'] },
          { keywordsToSearch: ['vue'] },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(result.isError).toBe(false);
      expect(responseText).toContain('3 hasResults');
      expect(responseText).toContain('facebook/react');
      expect(responseText).toContain('angular/angular');
      expect(responseText).toContain('vuejs/vue');
    });

    it('should handle multiple queries all with empty status', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({ data: { repositories: [] }, status: 200 })
        .mockResolvedValueOnce({ data: { repositories: [] }, status: 200 })
        .mockResolvedValueOnce({ data: { repositories: [] }, status: 200 });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          { keywordsToSearch: ['xyz123'] },
          { keywordsToSearch: ['abc456'] },
          { keywordsToSearch: ['def789'] },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(result.isError).toBe(false);
      expect(responseText).toContain('3 empty');
      expect(responseText).toContain('emptyStatusHints:');
    });

    it('should handle multiple queries all with error status', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({
          error: 'Rate limit 1',
          type: 'rateLimit',
          status: 429,
        })
        .mockResolvedValueOnce({
          error: 'Rate limit 2',
          type: 'rateLimit',
          status: 429,
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          { keywordsToSearch: ['test1'] },
          { keywordsToSearch: ['test2'] },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(result.isError).toBe(false);
      expect(responseText).toContain('2 failed');
      expect(responseText).toContain('errorStatusHints:');
    });
  });

  describe('Multiple queries - mixed statuses', () => {
    it('should handle hasResults + empty mix', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'test/repo1',
                stars: 100,
                description: 'Test',
                url: 'https://github.com/test/repo1',
                updatedAt: '2024-01-01',
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({ data: { repositories: [] }, status: 200 });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          { keywordsToSearch: ['react'] },
          { keywordsToSearch: ['xyz'] },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(result.isError).toBe(false);
      expect(responseText).toContain('1 hasResults');
      expect(responseText).toContain('1 empty');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('emptyStatusHints:');
    });

    it('should handle hasResults + error mix', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'test/repo',
                stars: 50,
                description: 'Test',
                url: 'https://github.com/test/repo',
                updatedAt: '2024-01-01',
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          error: 'API error',
          type: 'api',
          status: 500,
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          { keywordsToSearch: ['test1'] },
          { keywordsToSearch: ['test2'] },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(result.isError).toBe(false);
      expect(responseText).toContain('1 hasResults');
      expect(responseText).toContain('1 failed');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('errorStatusHints:');
    });

    it('should handle empty + error mix', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({ data: { repositories: [] }, status: 200 })
        .mockResolvedValueOnce({
          error: 'Not found',
          type: 'notFound',
          status: 404,
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [{ keywordsToSearch: ['xyz'] }, { keywordsToSearch: ['abc'] }],
      });

      const responseText = result.content[0]?.text as string;

      expect(result.isError).toBe(false);
      expect(responseText).toContain('1 empty');
      expect(responseText).toContain('1 failed');
      expect(responseText).toContain('emptyStatusHints:');
      expect(responseText).toContain('errorStatusHints:');
    });

    it('should handle all three status types in single response', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'owner/repo',
                stars: 10,
                description: 'Test',
                url: 'https://github.com/owner/repo',
                updatedAt: '2024-01-01',
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({ data: { repositories: [] }, status: 200 })
        .mockResolvedValueOnce({
          error: 'Server error',
          type: 'server',
          status: 500,
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          { keywordsToSearch: ['test'] },
          { keywordsToSearch: ['nonexistent'] },
          { keywordsToSearch: ['error'] },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(result.isError).toBe(false);
      expect(responseText).toContain('1 hasResults');
      expect(responseText).toContain('1 empty');
      expect(responseText).toContain('1 failed');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('emptyStatusHints:');
      expect(responseText).toContain('errorStatusHints:');
    });
  });

  describe('Research fields propagation', () => {
    it('should propagate researchGoal from query to result', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [
            {
              repository: 'test/repo',
              stars: 100,
              description: 'Test',
              url: 'https://github.com/test/repo',
              updatedAt: '2024-01-01',
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            keywordsToSearch: ['test'],
            researchGoal: 'Find testing frameworks',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(responseText).toContain('researchGoal: "Find testing frameworks"');
    });

    it('should propagate reasoning from query to result', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: { repositories: [] },
        status: 200,
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            keywordsToSearch: ['test'],
            reasoning: 'Searching for popular repos',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(responseText).toContain(
        'reasoning: "Searching for popular repos"'
      );
    });

    it('should propagate researchSuggestions from query to result', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        error: 'API error',
        type: 'api',
        status: 500,
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            keywordsToSearch: ['test'],
            researchSuggestions: ['Try different keywords', 'Check API status'],
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(responseText).toContain('researchSuggestions:');
      expect(responseText).toContain('- "Try different keywords"');
      expect(responseText).toContain('- "Check API status"');
    });
  });

  describe('Empty queries handling', () => {
    it('should handle empty queries array', async () => {
      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [],
      });

      const responseText = result.content[0]?.text as string;

      expect(result.isError).toBe(false);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('0 results');
    });
  });

  describe('Query splitting expansion', () => {
    it('should split queries with both topicsToSearch and keywordsToSearch', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'topic/repo',
                stars: 1000,
                description: 'Topic result',
                url: 'https://github.com/topic/repo',
                updatedAt: '2024-01-01',
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'keyword/repo',
                stars: 2000,
                description: 'Keyword result',
                url: 'https://github.com/keyword/repo',
                updatedAt: '2024-01-02',
              },
            ],
          },
          status: 200,
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            topicsToSearch: ['javascript'],
            keywordsToSearch: ['framework'],
            reasoning: 'Find JS frameworks',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(result.isError).toBe(false);
      // Should have 2 results (query was split into topics and keywords)
      expect(responseText).toContain('2 hasResults');
      expect(responseText).toContain('topic/repo');
      expect(responseText).toContain('keyword/repo');
      expect(responseText).toContain(
        'Find JS frameworks (topics-based search)'
      );
      expect(responseText).toContain(
        'Find JS frameworks (keywords-based search)'
      );
    });
  });
});

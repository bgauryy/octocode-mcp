import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteGitHubCommand = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: mockExecuteGitHubCommand,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

// Import after mocking
import { registerSearchGitHubReposTool } from '../../src/mcp/tools/github_search_repos.js';

describe('GitHub Search Repositories Tool - Bulk Queries', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    // Create mock server using the fixture
    mockServer = createMockMcpServer();

    // Clear all mocks
    vi.clearAllMocks();

    // Default cache behavior
    // @ts-expect-error - mockWithCache is not typed
    mockWithCache.mockImplementation(async (key, fn) => await fn());
    mockGenerateCacheKey.mockReturnValue('test-cache-key');
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search repositories tool', () => {
      registerSearchGitHubReposTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'githubSearchRepositories',
        expect.objectContaining({
          description: expect.stringContaining('BULK QUERY MODE'),
          inputSchema: expect.objectContaining({
            queries: expect.any(Object),
          }),
          annotations: expect.objectContaining({
            title: 'GitHub Repository Search - Bulk Queries Only (Optimized)',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          }),
        }),
        expect.any(Function)
      );
    });
  });

  describe('Single Query Functionality', () => {
    beforeEach(() => {
      registerSearchGitHubReposTool(mockServer.server);
    });

    it('should handle successful single repository search', async () => {
      const mockGitHubResponse = {
        result: [
          {
            name: 'test-repo',
            fullName: 'owner/test-repo',
            description: 'Test repository',
            language: 'TypeScript',
            stargazersCount: 100,
            forksCount: 10,
            updatedAt: '2024-01-01T00:00:00Z',
            createdAt: '2024-01-01T00:00:00Z',
            url: 'https://github.com/owner/test-repo',
            owner: { login: 'owner' },
            isPrivate: false,
            license: { name: 'MIT' },
            hasIssues: true,
            openIssuesCount: 5,
            isArchived: false,
            isFork: false,
            visibility: 'public',
          },
        ],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            id: 'test-query',
            exactQuery: 'test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.results).toHaveLength(1);
      expect(resultData.results[0].queryId).toBe('test-query');
      expect(resultData.results[0].fallbackTriggered).toBe(false);
      expect(resultData.results[0].result.total_count).toBe(1);
      expect(resultData.summary.totalQueries).toBe(1);
      expect(resultData.summary.successfulQueries).toBe(1);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'repos',
          '"test"',
          '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
          '--limit=30',
        ],
        { cache: false }
      );
    });

    it('should handle query with queryTerms', async () => {
      const mockGitHubResponse = {
        result: [],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            queryTerms: ['cli', 'shell'],
          },
        ],
      });

      expect(result.isError).toBe(false);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'repos',
          'cli',
          'shell',
          '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
          '--limit=30',
        ],
        { cache: false }
      );
    });

    it('should handle filter-only queries', async () => {
      const mockGitHubResponse = {
        result: [],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            owner: 'microsoft',
            language: 'go',
            stars: '>=1000',
          },
        ],
      });

      expect(result.isError).toBe(false);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'repos',
          '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
          '--owner=microsoft',
          '--language=go',
          '--stars=>=1000',
          '--limit=30',
        ],
        { cache: false }
      );
    });

    it('should handle complex filters combination', async () => {
      const mockGitHubResponse = {
        result: [],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            exactQuery: 'machine learning',
            owner: ['microsoft', 'google'],
            language: 'python',
            topic: ['ai', 'ml'],
            stars: '>=1000',
            forks: '100..500',
            'good-first-issues': '>=5',
            'help-wanted-issues': '>=3',
            followers: '>=500',
            license: ['MIT', 'Apache-2.0'],
            visibility: 'public',
            archived: false,
            'include-forks': 'false',
            created: '>=2023-01-01',
            updated: '>=2024-01-01',
            size: '>=100',
            'number-topics': '>=3',
            match: ['name', 'description'],
            sort: 'stars',
            order: 'desc',
            limit: 50,
          },
        ],
      });

      expect(result.isError).toBe(false);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'repos',
          '"machine learning"',
          '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
          '--owner=microsoft,google',
          '--language=python',
          '--forks=100..500',
          '--topic=ai,ml',
          '--number-topics=>=3',
          '--stars=>=1000',
          '--archived=false',
          '--include-forks=false',
          '--visibility=public',
          '--license=MIT,Apache-2.0',
          '--created=>=2023-01-01',
          '--updated=>=2024-01-01',
          '--size=>=100',
          '--good-first-issues=>=5',
          '--help-wanted-issues=>=3',
          '--followers=>=500',
          '--match=name,description',
          '--sort=stars',
          '--order=desc',
          '--limit=50',
        ],
        { cache: false }
      );
    });

    it('should handle no results found', async () => {
      const mockGitHubResponse = {
        result: [],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            exactQuery: 'nonexistent',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.results).toHaveLength(1);
      expect(resultData.results[0].error).toContain('No repositories found');
    });

    it('should handle search errors', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Search failed: API rate limit exceeded' }],
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            exactQuery: 'test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.results).toHaveLength(1);
      expect(resultData.results[0].error).toContain(
        'Search failed: API rate limit exceeded'
      );
      expect(resultData.summary.successfulQueries).toBe(0);
    });
  });

  describe('Multiple Queries Functionality', () => {
    beforeEach(() => {
      registerSearchGitHubReposTool(mockServer.server);
    });

    it('should handle multiple successful queries', async () => {
      const mockGitHubResponse1 = {
        result: [
          {
            name: 'test-repo-1',
            fullName: 'owner/test-repo-1',
            stargazersCount: 100,
            forksCount: 10,
          },
        ],
      };

      const mockGitHubResponse2 = {
        result: [
          {
            name: 'test-repo-2',
            fullName: 'owner/test-repo-2',
            stargazersCount: 200,
            forksCount: 20,
          },
        ],
      };

      // Mock different responses for each call
      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockGitHubResponse1) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockGitHubResponse2) }],
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            id: 'query1',
            exactQuery: 'react',
          },
          {
            id: 'query2',
            exactQuery: 'vue',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.results).toHaveLength(2);
      expect(resultData.results[0].queryId).toBe('query1');
      expect(resultData.results[1].queryId).toBe('query2');
      expect(resultData.summary.totalQueries).toBe(2);
      expect(resultData.summary.successfulQueries).toBe(2);
      expect(resultData.summary.totalRepositories).toBe(2);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledTimes(2);
    });

    it('should handle maximum 5 queries', async () => {
      const mockGitHubResponse = {
        result: [{ name: 'test-repo', stargazersCount: 100 }],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          { id: 'q1', exactQuery: 'react' },
          { id: 'q2', exactQuery: 'vue' },
          { id: 'q3', exactQuery: 'angular' },
          { id: 'q4', exactQuery: 'svelte' },
          { id: 'q5', exactQuery: 'ember' },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.results).toHaveLength(5);
      expect(resultData.summary.totalQueries).toBe(5);
      expect(resultData.summary.successfulQueries).toBe(5);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledTimes(5);
    });

    it('should handle mixed success and failure', async () => {
      const mockGitHubResponse = {
        result: [{ name: 'test-repo', stargazersCount: 100 }],
      };

      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockGitHubResponse) }],
        })
        .mockResolvedValueOnce({
          isError: true,
          content: [{ text: 'API error' }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify({ result: [] }) }],
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          { id: 'success', exactQuery: 'react' },
          { id: 'error', exactQuery: 'invalid-query' },
          { id: 'no-results', exactQuery: 'very-specific-nonexistent' },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.results).toHaveLength(3);
      expect(resultData.summary.totalQueries).toBe(3);
      expect(resultData.summary.successfulQueries).toBe(1);

      // Check individual results
      const successResult = resultData.results.find(
        (r: any) => r.queryId === 'success'
      );
      expect(successResult.error).toBeUndefined();

      const errorResult = resultData.results.find(
        (r: any) => r.queryId === 'error'
      );
      expect(errorResult.error).toBe('API error');

      const noResultsResult = resultData.results.find(
        (r: any) => r.queryId === 'no-results'
      );
      expect(noResultsResult.error).toContain('No repositories found');
    });
  });

  describe('Fallback Functionality', () => {
    beforeEach(() => {
      registerSearchGitHubReposTool(mockServer.server);
    });

    it('should trigger fallback when original query returns no results', async () => {
      const emptyResponse = { result: [] };
      const fallbackResponse = {
        result: [{ name: 'fallback-repo', stargazersCount: 50 }],
      };

      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(emptyResponse) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(fallbackResponse) }],
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            id: 'fallback-test',
            exactQuery: 'very-specific-term',
            language: 'rust',
            fallbackParams: {
              language: 'javascript',
              exactQuery: 'general-term',
            },
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.results).toHaveLength(1);
      expect(resultData.results[0].fallbackTriggered).toBe(true);
      expect(resultData.results[0].result.total_count).toBe(1);
      expect(resultData.summary.queriesWithFallback).toBe(1);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledTimes(2);

      // Check original query
      expect(mockExecuteGitHubCommand).toHaveBeenNthCalledWith(
        1,
        'search',
        expect.arrayContaining(['"very-specific-term"', '--language=rust']),
        { cache: false }
      );

      // Check fallback query
      expect(mockExecuteGitHubCommand).toHaveBeenNthCalledWith(
        2,
        'search',
        expect.arrayContaining(['"general-term"', '--language=javascript']),
        { cache: false }
      );
    });

    it('should trigger fallback when original query fails', async () => {
      const fallbackResponse = {
        result: [{ name: 'fallback-repo', stargazersCount: 50 }],
      };

      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: true,
          content: [{ text: 'Original query failed' }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(fallbackResponse) }],
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            id: 'fallback-on-error',
            exactQuery: 'invalid-query',
            fallbackParams: {
              exactQuery: 'valid-query',
            },
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.results).toHaveLength(1);
      expect(resultData.results[0].fallbackTriggered).toBe(true);
      expect(resultData.results[0].result.total_count).toBe(1);
      expect(resultData.summary.successfulQueries).toBe(1);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledTimes(2);
    });

    it('should not trigger fallback when original query succeeds', async () => {
      const successResponse = {
        result: [{ name: 'original-repo', stargazersCount: 100 }],
      };

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(successResponse) }],
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            id: 'no-fallback-needed',
            exactQuery: 'successful-query',
            fallbackParams: {
              exactQuery: 'fallback-query',
            },
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.results).toHaveLength(1);
      expect(resultData.results[0].fallbackTriggered).toBe(false);
      expect(resultData.results[0].result.total_count).toBe(1);
      expect(resultData.summary.queriesWithFallback).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledTimes(1);
    });

    it('should handle fallback failure', async () => {
      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: true,
          content: [{ text: 'Original query failed' }],
        })
        .mockResolvedValueOnce({
          isError: true,
          content: [{ text: 'Fallback query also failed' }],
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            id: 'both-fail',
            exactQuery: 'invalid-query',
            fallbackParams: {
              exactQuery: 'also-invalid-query',
            },
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.results).toHaveLength(1);
      expect(resultData.results[0].fallbackTriggered).toBe(true);
      expect(resultData.results[0].error).toBe('Fallback query also failed');
      expect(resultData.summary.successfulQueries).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledTimes(2);
    });

    it('should filter out null values in fallback params', async () => {
      const fallbackResponse = {
        result: [{ name: 'fallback-repo', stargazersCount: 50 }],
      };

      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify({ result: [] }) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(fallbackResponse) }],
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            exactQuery: 'specific-term',
            language: 'rust',
            fallbackParams: {
              language: null,
              exactQuery: 'general-term',
              stars: null,
            },
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);
      expect(resultData.results[0].fallbackTriggered).toBe(true);

      // Check that fallback query doesn't include null parameters
      expect(mockExecuteGitHubCommand).toHaveBeenNthCalledWith(
        2,
        'search',
        expect.arrayContaining(['"general-term"']),
        { cache: false }
      );

      // Should not contain language parameter since it was null in fallbackParams
      // but the original language=rust should still be there from the original query
      const fallbackCall = mockExecuteGitHubCommand.mock.calls[1][1];
      expect(
        fallbackCall.some((arg: string) => arg.includes('--language=rust'))
      ).toBe(true);
    });

    // Add a new test to check actual null filtering
    it('should filter out null values when original query has no language', async () => {
      const fallbackResponse = {
        result: [{ name: 'fallback-repo', stargazersCount: 50 }],
      };

      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify({ result: [] }) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(fallbackResponse) }],
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            exactQuery: 'specific-term',
            // no language in original query
            fallbackParams: {
              language: null,
              exactQuery: 'general-term',
              stars: null,
            },
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);
      expect(resultData.results[0].fallbackTriggered).toBe(true);

      // Check that fallback query doesn't include null parameters
      const fallbackCall = mockExecuteGitHubCommand.mock.calls[1][1];
      expect(
        fallbackCall.some((arg: string) => arg.includes('--language'))
      ).toBe(false);
    });
  });

  describe('Validation and Error Handling', () => {
    beforeEach(() => {
      registerSearchGitHubReposTool(mockServer.server);
    });

    it('should require at least one search parameter', async () => {
      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            id: 'no-params',
            // No search parameters provided
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.results).toHaveLength(1);
      expect(resultData.results[0].error).toContain(
        'At least one search parameter required'
      );
      expect(resultData.summary.successfulQueries).toBe(0);
    });

    it('should allow filter-only queries', async () => {
      const mockGitHubResponse = {
        result: [],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            owner: 'microsoft',
            language: 'go',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);
      expect(resultData.results[0].error).toContain('No repositories found');
    });

    it('should handle unexpected errors gracefully', async () => {
      mockExecuteGitHubCommand.mockRejectedValue(
        new Error('Unexpected network error')
      );

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            exactQuery: 'test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.results).toHaveLength(1);
      // Error happens in searchGitHubRepos catch block, which returns the generic search failed error
      expect(resultData.results[0].error).toBe(
        'Repository search failed - check connection or query'
      );
    });

    it('should generate query IDs when not provided', async () => {
      const mockGitHubResponse = {
        result: [],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          { exactQuery: 'test1' },
          { exactQuery: 'test2' },
          { exactQuery: 'test3' },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.results).toHaveLength(3);
      expect(resultData.results[0].queryId).toBe('query_1');
      expect(resultData.results[1].queryId).toBe('query_2');
      expect(resultData.results[2].queryId).toBe('query_3');
    });
  });

  describe('Data Analysis and Formatting', () => {
    beforeEach(() => {
      registerSearchGitHubReposTool(mockServer.server);
    });

    it('should properly analyze and format repository data', async () => {
      // Use dates that are within the last 30 days
      const now = new Date();
      const recentDate1 = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const recentDate2 = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000); // 15 days ago

      const mockGitHubResponse = {
        result: [
          {
            name: 'repo1',
            fullName: 'owner/repo1',
            description: 'First test repo',
            language: 'TypeScript',
            stargazersCount: 1500,
            forksCount: 100,
            updatedAt: recentDate1.toISOString(),
            createdAt: '2023-06-01T00:00:00Z',
            url: 'https://github.com/owner/repo1',
            owner: { login: 'owner' },
            isPrivate: false,
            license: { name: 'MIT' },
            hasIssues: true,
            openIssuesCount: 25,
            isArchived: false,
            isFork: false,
            visibility: 'public',
          },
          {
            name: 'repo2',
            fullName: 'owner/repo2',
            description: 'Second test repo',
            language: 'JavaScript',
            stargazersCount: 800,
            forksCount: 50,
            updatedAt: recentDate2.toISOString(),
            createdAt: '2023-08-01T00:00:00Z',
            url: 'https://github.com/owner/repo2',
            owner: { login: 'owner' },
            isPrivate: false,
            license: { name: 'Apache-2.0' },
            hasIssues: true,
            openIssuesCount: 10,
            isArchived: false,
            isFork: false,
            visibility: 'public',
          },
        ],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            exactQuery: 'test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);
      const queryResult = resultData.results[0].result;

      expect(queryResult.total_count).toBe(2);
      expect(queryResult.repositories).toHaveLength(2);
      expect(queryResult.summary.languages).toEqual([
        'TypeScript',
        'JavaScript',
      ]);
      expect(queryResult.summary.avgStars).toBe(1150); // (1500 + 800) / 2
      expect(queryResult.summary.recentlyUpdated).toBe(2); // Both updated within 30 days

      // Check repository formatting
      const repo1 = queryResult.repositories[0];
      expect(repo1.name).toBe('owner/repo1');
      expect(repo1.stars).toBe(1500);
      expect(repo1.description).toBe('First test repo');
      expect(repo1.language).toBe('TypeScript');
      expect(repo1.forks).toBe(100);
      expect(repo1.license).toBe('MIT');
      expect(repo1.createdAt).toBe('01/06/2023');
      // Don't check exact updatedAt format since it's dynamic
    });

    it('should handle repositories with missing fields', async () => {
      const mockGitHubResponse = {
        result: [
          {
            name: 'minimal-repo',
            // Missing many optional fields
          },
        ],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            exactQuery: 'test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);
      const repo = resultData.results[0].result.repositories[0];

      expect(repo.name).toBe('minimal-repo');
      expect(repo.stars).toBe(0);
      expect(repo.description).toBe('No description');
      expect(repo.language).toBe('Unknown');
      expect(repo.forks).toBe(0);
      expect(repo.license).toBe(null);
      expect(repo.isPrivate).toBe(false);
      expect(repo.isArchived).toBe(false);
      expect(repo.isFork).toBe(false);
      expect(repo.hasIssues).toBe(false);
      expect(repo.openIssuesCount).toBe(0);
      expect(repo.visibility).toBe('public');
    });

    it('should calculate summary statistics correctly', async () => {
      const emptyResponse = { result: [] };
      const oneRepoResponse = { result: [{ stargazersCount: 100 }] };
      const twoReposResponse = {
        result: [{ stargazersCount: 200 }, { stargazersCount: 300 }],
      };

      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(emptyResponse) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(oneRepoResponse) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(twoReposResponse) }],
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          { id: 'empty', exactQuery: 'nothing' },
          { id: 'one', exactQuery: 'single' },
          { id: 'two', exactQuery: 'multiple' },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.summary.totalQueries).toBe(3);
      expect(resultData.summary.successfulQueries).toBe(2); // Both oneRepo and twoRepos are successful
      expect(resultData.summary.totalRepositories).toBe(3); // 0 + 1 + 2
    });
  });

  describe('Parameter Validation and Edge Cases', () => {
    beforeEach(() => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockGitHubResponse = {
        result: [],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });
    });

    it('should handle all numeric parameter formats', async () => {
      await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            exactQuery: 'test',
            stars: 1000,
            forks: '>=100',
            'good-first-issues': '10..20',
            'help-wanted-issues': '<=5',
            followers: '>500',
            'number-topics': '<10',
          },
        ],
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining([
          '--stars=1000',
          '--forks=>=100',
          '--good-first-issues=10..20',
          '--help-wanted-issues=<=5',
          '--followers=>500',
          '--number-topics=<10',
        ]),
        { cache: false }
      );
    });

    it('should handle array parameters correctly', async () => {
      await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            exactQuery: 'test',
            owner: ['microsoft', 'google', 'facebook'],
            topic: ['javascript', 'react', 'frontend'],
            license: ['MIT', 'Apache-2.0', 'BSD-3-Clause'],
            match: ['name', 'description', 'readme'],
          },
        ],
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining([
          '--owner=microsoft,google,facebook',
          '--topic=javascript,react,frontend',
          '--license=MIT,Apache-2.0,BSD-3-Clause',
          '--match=name,description,readme',
        ]),
        { cache: false }
      );
    });

    it('should handle date parameter formats', async () => {
      await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            exactQuery: 'test',
            created: '>2023-01-01',
            updated: '2023-01-01..2023-12-31',
          },
        ],
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining([
          '--created=>2023-01-01',
          '--updated=2023-01-01..2023-12-31',
        ]),
        { cache: false }
      );
    });

    it('should handle all boolean parameter values', async () => {
      await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            exactQuery: 'test',
            archived: true,
          },
        ],
      });

      await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            exactQuery: 'test2',
            archived: false,
          },
        ],
      });

      expect(mockExecuteGitHubCommand).toHaveBeenNthCalledWith(
        1,
        'search',
        expect.arrayContaining(['--archived=true']),
        { cache: false }
      );

      expect(mockExecuteGitHubCommand).toHaveBeenNthCalledWith(
        2,
        'search',
        expect.arrayContaining(['--archived=false']),
        { cache: false }
      );
    });

    it('should handle all enum parameter values', async () => {
      const visibilityValues = ['public', 'private', 'internal'];
      const includeForksValues = ['false', 'true', 'only'];
      const sortValues = [
        'forks',
        'help-wanted-issues',
        'stars',
        'updated',
        'best-match',
      ];
      const orderValues = ['asc', 'desc'];
      const matchValues = [
        ['name'],
        ['description'],
        ['readme'],
        ['name', 'description'],
      ];

      for (const visibility of visibilityValues) {
        await mockServer.callTool('githubSearchRepositories', {
          queries: [{ exactQuery: 'test', visibility: visibility as any }],
        });
      }

      for (const includeForks of includeForksValues) {
        await mockServer.callTool('githubSearchRepositories', {
          queries: [
            { exactQuery: 'test', 'include-forks': includeForks as any },
          ],
        });
      }

      for (const sort of sortValues) {
        await mockServer.callTool('githubSearchRepositories', {
          queries: [{ exactQuery: 'test', sort: sort as any }],
        });
      }

      for (const order of orderValues) {
        await mockServer.callTool('githubSearchRepositories', {
          queries: [{ exactQuery: 'test', order: order as any }],
        });
      }

      for (const match of matchValues) {
        await mockServer.callTool('githubSearchRepositories', {
          queries: [{ exactQuery: 'test', match: match as any }],
        });
      }

      // Verify all calls were made
      expect(mockExecuteGitHubCommand).toHaveBeenCalledTimes(
        visibilityValues.length +
          includeForksValues.length +
          sortValues.length +
          orderValues.length +
          matchValues.length
      );
    });

    it('should filter out null and undefined values', async () => {
      await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            exactQuery: 'test',
            language: null,
            stars: undefined,
            owner: 'microsoft',
            topic: null,
            forks: '>=100',
          } as any,
        ],
      });

      const callArgs = mockExecuteGitHubCommand.mock.calls[0][1];

      // Should include non-null values
      expect(callArgs).toContain('--owner=microsoft');
      expect(callArgs).toContain('--forks=>=100');

      // Should not include null/undefined values
      expect(callArgs.some((arg: string) => arg.includes('--language'))).toBe(
        false
      );
      expect(callArgs.some((arg: string) => arg.includes('--stars'))).toBe(
        false
      );
      expect(callArgs.some((arg: string) => arg.includes('--topic'))).toBe(
        false
      );
    });

    it('should handle limit boundary values', async () => {
      // Test minimum
      await mockServer.callTool('githubSearchRepositories', {
        queries: [{ exactQuery: 'test', limit: 1 }],
      });

      // Test maximum
      await mockServer.callTool('githubSearchRepositories', {
        queries: [{ exactQuery: 'test', limit: 100 }],
      });

      expect(mockExecuteGitHubCommand).toHaveBeenNthCalledWith(
        1,
        'search',
        expect.arrayContaining(['--limit=1']),
        { cache: false }
      );

      expect(mockExecuteGitHubCommand).toHaveBeenNthCalledWith(
        2,
        'search',
        expect.arrayContaining(['--limit=100']),
        { cache: false }
      );
    });

    it('should apply default limit when not specified', async () => {
      await mockServer.callTool('githubSearchRepositories', {
        queries: [{ exactQuery: 'test' }],
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--limit=30']),
        { cache: false }
      );
    });
  });

  describe('Complex Integration Scenarios', () => {
    beforeEach(() => {
      registerSearchGitHubReposTool(mockServer.server);
    });

    it('should handle realistic research workflow', async () => {
      // Simulate a research workflow with different query types
      const responses = [
        { result: [{ name: 'react', stargazersCount: 200000 }] }, // Popular framework
        { result: [] }, // No results for specific query
        { result: [{ name: 'nextjs', stargazersCount: 100000 }] }, // Fallback success
        { result: [{ name: 'vue', stargazersCount: 150000 }] }, // Alternative framework
        { result: [{ name: 'beginner-project', stargazersCount: 50 }] }, // Beginner-friendly
      ];

      // Mock responses including fallback
      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(responses[0]) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(responses[1]) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(responses[2]) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(responses[3]) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(responses[4]) }],
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            id: 'popular-framework',
            exactQuery: 'react',
            language: 'javascript',
            stars: '>=10000',
          },
          {
            id: 'specific-with-fallback',
            exactQuery: 'very-specific-react-library',
            language: 'typescript',
            fallbackParams: {
              exactQuery: 'nextjs',
              language: 'javascript',
            },
          },
          {
            id: 'alternative-framework',
            queryTerms: ['frontend', 'framework'],
            language: 'javascript',
            'include-forks': 'false',
          },
          {
            id: 'beginner-friendly',
            topic: 'learning',
            'good-first-issues': '>=5',
            language: 'javascript',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.results).toHaveLength(4);
      expect(resultData.summary.totalQueries).toBe(4);
      expect(resultData.summary.successfulQueries).toBe(4); // All queries succeed (including via fallback)
      expect(resultData.summary.queriesWithFallback).toBe(1);
      expect(resultData.summary.totalRepositories).toBe(4);

      // Verify fallback was triggered for the specific query
      const specificQuery = resultData.results.find(
        (r: any) => r.queryId === 'specific-with-fallback'
      );
      expect(specificQuery.fallbackTriggered).toBe(true);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledTimes(5); // 4 original + 1 fallback
    });

    it('should handle error recovery scenarios', async () => {
      mockExecuteGitHubCommand
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({
          isError: true,
          content: [{ text: 'Rate limit exceeded' }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: [{ name: 'fallback-success', stargazersCount: 50 }],
              }),
            },
          ],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify({ result: [] }) }],
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            id: 'network-error',
            exactQuery: 'test1',
          },
          {
            id: 'api-error',
            exactQuery: 'test2',
            fallbackParams: {
              exactQuery: 'fallback2',
            },
          },
          {
            id: 'no-results',
            exactQuery: 'test3',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const resultData = JSON.parse(result.content[0].text as string);

      expect(resultData.results).toHaveLength(3);
      expect(resultData.summary.totalQueries).toBe(3);
      expect(resultData.summary.successfulQueries).toBe(1); // Only fallback succeeded

      const networkErrorResult = resultData.results.find(
        (r: any) => r.queryId === 'network-error'
      );
      // Error happens in searchGitHubRepos catch block, which returns the generic search failed error
      expect(networkErrorResult.error).toBe(
        'Repository search failed - check connection or query'
      );

      const apiErrorResult = resultData.results.find(
        (r: any) => r.queryId === 'api-error'
      );
      expect(apiErrorResult.fallbackTriggered).toBe(true);
      expect(apiErrorResult.result.total_count).toBe(1);
    });
  });
});

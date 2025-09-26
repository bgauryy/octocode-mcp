import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockMcpServer } from '../fixtures/mcp-fixtures.js';
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';
import { TOOL_NAMES } from '../../src/constants.js';
import { GitHubReposSearchQuery } from '../../src/scheme/github_search_repos.js';

// Mock the searchGitHubReposAPI to capture the actual queries being made
vi.mock('../../src/github/index.js', () => ({
  searchGitHubReposAPI: vi.fn(),
}));

import { searchGitHubReposAPI } from '../../src/github/index.js';

describe('GitHub Search Repositories Query Splitting', () => {
  const mockSearchGitHubReposAPI = vi.mocked(searchGitHubReposAPI);

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock successful API response
    mockSearchGitHubReposAPI.mockResolvedValue({
      data: {
        repositories: [
          {
            repository: 'test/repo',
            stars: 100,
            description: 'Test repository',
            url: 'https://github.com/test/repo',
            updatedAt: '01/01/2024',
          },
        ],
      },
      status: 200,
      headers: {},
    });
  });

  describe('Query Splitting Logic', () => {
    it('should split queries with both topicsToSearch and keywordsToSearch into separate queries', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const originalQuery: GitHubReposSearchQuery = {
        id: 'test_query',
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
      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(2);

      const calls = mockSearchGitHubReposAPI.mock.calls;

      // First call should be topics-based query
      const topicsQuery = calls[0]?.[0];
      expect(topicsQuery?.id).toBe('test_query_topics');
      expect(topicsQuery?.reasoning).toBe(
        'Test query with both search types (topics-based search)'
      );
      expect(topicsQuery?.topicsToSearch).toEqual([
        'computer-vision',
        'deep-learning',
      ]);
      expect(topicsQuery?.keywordsToSearch).toBeUndefined();
      expect(topicsQuery?.limit).toBe(10);
      expect(topicsQuery?.sort).toBe('stars');

      // Second call should be keywords-based query
      const keywordsQuery = calls[1]?.[0];
      expect(keywordsQuery?.id).toBe('test_query_keywords');
      expect(keywordsQuery?.reasoning).toBe(
        'Test query with both search types (keywords-based search)'
      );
      expect(keywordsQuery?.keywordsToSearch).toEqual(['whale', 'detection']);
      expect(keywordsQuery?.topicsToSearch).toBeUndefined();
      expect(keywordsQuery?.limit).toBe(10);
      expect(keywordsQuery?.sort).toBe('stars');
    });

    it('should NOT split queries with only topicsToSearch', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const originalQuery: GitHubReposSearchQuery = {
        id: 'topics_only',
        reasoning: 'Test query with only topics',
        topicsToSearch: ['computer-vision', 'deep-learning'],
        limit: 10,
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries: [originalQuery],
      });

      // Should have been called only once
      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(1);

      const call = mockSearchGitHubReposAPI.mock.calls[0]?.[0];
      expect(call?.id).toBe('topics_only');
      expect(call?.topicsToSearch).toEqual([
        'computer-vision',
        'deep-learning',
      ]);
      expect(call?.keywordsToSearch).toBeUndefined();
    });

    it('should NOT split queries with only keywordsToSearch', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const originalQuery: GitHubReposSearchQuery = {
        id: 'keywords_only',
        reasoning: 'Test query with only keywords',
        keywordsToSearch: ['whale', 'detection'],
        limit: 10,
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries: [originalQuery],
      });

      // Should have been called only once
      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(1);

      const call = mockSearchGitHubReposAPI.mock.calls[0]?.[0];
      expect(call?.id).toBe('keywords_only');
      expect(call?.keywordsToSearch).toEqual(['whale', 'detection']);
      expect(call?.topicsToSearch).toBeUndefined();
    });

    it('should handle multiple queries with mixed splitting requirements', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const queries: GitHubReposSearchQuery[] = [
        {
          id: 'both_types',
          reasoning: 'Query with both types',
          topicsToSearch: ['ai'],
          keywordsToSearch: ['whale'],
          limit: 5,
        },
        {
          id: 'topics_only',
          reasoning: 'Query with topics only',
          topicsToSearch: ['machine-learning'],
          limit: 5,
        },
        {
          id: 'keywords_only',
          reasoning: 'Query with keywords only',
          keywordsToSearch: ['detection'],
          limit: 5,
        },
      ];

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries,
      });

      // Should have been called 4 times:
      // - both_types splits into 2 calls
      // - topics_only: 1 call
      // - keywords_only: 1 call
      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(4);

      const calls = mockSearchGitHubReposAPI.mock.calls;
      const queryIds = calls.map(call => call[0]?.id).filter(Boolean);

      expect(queryIds).toContain('both_types_topics');
      expect(queryIds).toContain('both_types_keywords');
      expect(queryIds).toContain('topics_only');
      expect(queryIds).toContain('keywords_only');
    });

    it('should preserve all other query parameters when splitting', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const originalQuery: GitHubReposSearchQuery = {
        id: 'complex_query',
        reasoning: 'Complex query with many parameters',
        topicsToSearch: ['ai'],
        keywordsToSearch: ['whale'],
        limit: 15,
        sort: 'updated',
        stars: '>=100',
        language: 'python',
        owner: 'test-org',
        created: '>=2020-01-01',
        updated: '>=2023-01-01',
        size: '>=1000',
        match: ['name', 'description'],
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries: [originalQuery],
      });

      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(2);

      const calls = mockSearchGitHubReposAPI.mock.calls;

      // Both queries should preserve all other parameters
      calls.forEach(call => {
        const query = call[0];
        expect(query?.limit).toBe(15);
        expect(query?.sort).toBe('updated');
        expect(query?.stars).toBe('>=100');
        expect(query?.language).toBe('python');
        expect(query?.owner).toBe('test-org');
        expect(query?.created).toBe('>=2020-01-01');
        expect(query?.updated).toBe('>=2023-01-01');
        expect(query?.size).toBe('>=1000');
        expect(query?.match).toEqual(['name', 'description']);
      });
    });

    it('should handle topicsToSearch as string (not array)', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const originalQuery: GitHubReposSearchQuery = {
        id: 'string_topics',
        reasoning: 'Query with string topics',
        topicsToSearch: 'computer-vision',
        keywordsToSearch: ['whale'],
        limit: 10,
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries: [originalQuery],
      });

      // Should still split because topicsToSearch is truthy
      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(2);

      const calls = mockSearchGitHubReposAPI.mock.calls;
      const topicsQuery = calls.find(call =>
        call[0]?.id?.includes('_topics')
      )?.[0];
      const keywordsQuery = calls.find(call =>
        call[0]?.id?.includes('_keywords')
      )?.[0];

      expect(topicsQuery?.topicsToSearch).toBe('computer-vision');
      expect(keywordsQuery?.keywordsToSearch).toEqual(['whale']);
    });

    it('should handle empty arrays correctly', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const originalQuery: GitHubReposSearchQuery = {
        id: 'empty_arrays',
        reasoning: 'Query with empty arrays',
        topicsToSearch: [],
        keywordsToSearch: [],
        limit: 10,
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries: [originalQuery],
      });

      // Should NOT split because both arrays are empty
      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(1);

      const call = mockSearchGitHubReposAPI.mock.calls[0]?.[0];
      expect(call?.id).toBe('empty_arrays');
      expect(call?.topicsToSearch).toEqual([]);
      expect(call?.keywordsToSearch).toEqual([]);
    });

    it('should generate default reasoning when original reasoning is missing', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const originalQuery: GitHubReposSearchQuery = {
        id: 'no_reasoning',
        topicsToSearch: ['ai'],
        keywordsToSearch: ['whale'],
        limit: 10,
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries: [originalQuery],
      });

      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(2);

      const calls = mockSearchGitHubReposAPI.mock.calls;
      const topicsQuery = calls.find(call =>
        call[0]?.id?.includes('_topics')
      )?.[0];
      const keywordsQuery = calls.find(call =>
        call[0]?.id?.includes('_keywords')
      )?.[0];

      expect(topicsQuery?.reasoning).toBe('Topics-based repository search');
      expect(keywordsQuery?.reasoning).toBe('Keywords-based repository search');
    });

    it('should handle queries without explicit IDs', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const originalQuery: GitHubReposSearchQuery = {
        reasoning: 'Query without ID',
        topicsToSearch: ['ai'],
        keywordsToSearch: ['whale'],
        limit: 10,
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries: [originalQuery],
      });

      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(2);

      const calls = mockSearchGitHubReposAPI.mock.calls;
      const queryIds = calls.map(call => call[0]?.id).filter(Boolean);

      // Should generate IDs based on array index
      expect(queryIds).toContain('query_0_topics');
      expect(queryIds).toContain('query_0_keywords');
    });
  });

  describe('Response Structure', () => {
    it('should return results from both split queries in the response', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              id: 'whale_detection',
              reasoning: 'Search for whale detection repositories',
              topicsToSearch: ['computer-vision'],
              keywordsToSearch: ['whale', 'detection'],
              limit: 5,
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);

      const responseText = result.content[0]?.text as string;

      // Should contain results from both split queries
      expect(responseText).toContain('whale_detection_topics');
      expect(responseText).toContain('whale_detection_keywords');
      expect(responseText).toContain('topics-based search');
      expect(responseText).toContain('keywords-based search');
    });
  });
});

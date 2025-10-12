import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockMcpServer } from '../fixtures/mcp-fixtures.js';
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';
import { TOOL_NAMES } from '../../src/constants.js';
import type { GitHubReposSearchQuery } from '../../src/types.js';

// Mock the searchGitHubReposAPI to capture the actual queries being made
vi.mock('../../src/github/repoSearch.js', () => ({
  searchGitHubReposAPI: vi.fn(),
}));

vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
  getGitHubToken: vi.fn(() => Promise.resolve('test-token')),
}));

import { searchGitHubReposAPI } from '../../src/github/repoSearch.js';

describe('GitHub Search Repositories Query Splitting', () => {
  const mockSearchGitHubReposAPI = vi.mocked(searchGitHubReposAPI);

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock successful API response
    mockSearchGitHubReposAPI.mockResolvedValue({
      data: {
        repositories: [
          {
            owner: 'test',
            repo: 'repo',
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
      expect(call?.keywordsToSearch).toEqual(['whale', 'detection']);
      expect(call?.topicsToSearch).toBeUndefined();
    });

    it('should handle multiple queries with mixed splitting requirements', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const queries: GitHubReposSearchQuery[] = [
        {
          reasoning: 'Query with both types',
          topicsToSearch: ['ai'],
          keywordsToSearch: ['whale'],
          limit: 5,
        },
        {
          reasoning: 'Query with topics only',
          topicsToSearch: ['machine-learning'],
          limit: 5,
        },
        {
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

      const topicsCount = calls.filter(
        call => call[0]?.topicsToSearch && !call[0]?.keywordsToSearch
      ).length;
      const keywordsCount = calls.filter(
        call => call[0]?.keywordsToSearch && !call[0]?.topicsToSearch
      ).length;
      expect(topicsCount).toBe(2); // from both_types and topics_only
      expect(keywordsCount).toBe(2); // from both_types and keywords_only
    });

    it('should preserve all other query parameters when splitting', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const originalQuery: GitHubReposSearchQuery = {
        reasoning: 'Complex query with many parameters',
        topicsToSearch: ['ai'],
        keywordsToSearch: ['whale'],
        limit: 15,
        sort: 'updated',
        stars: '>=100',
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
        reasoning: 'Query with string topics',
        topicsToSearch: ['computer-vision'],
        keywordsToSearch: ['whale'],
        limit: 10,
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries: [originalQuery],
      });

      // Should still split because topicsToSearch is truthy
      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(2);

      const calls = mockSearchGitHubReposAPI.mock.calls;

      // Find topics query (has topicsToSearch, no keywordsToSearch)
      const topicsQuery = calls.find(
        call => call[0]?.topicsToSearch && !call[0]?.keywordsToSearch
      )?.[0];
      // Find keywords query (has keywordsToSearch, no topicsToSearch)
      const keywordsQuery = calls.find(
        call => call[0]?.keywordsToSearch && !call[0]?.topicsToSearch
      )?.[0];

      expect(topicsQuery?.topicsToSearch).toEqual(['computer-vision']);
      expect(keywordsQuery?.keywordsToSearch).toEqual(['whale']);
    });

    it('should handle empty arrays correctly', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const originalQuery: GitHubReposSearchQuery = {
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
      expect(call?.topicsToSearch).toEqual([]);
      expect(call?.keywordsToSearch).toEqual([]);
    });

    it('should generate default reasoning when original reasoning is missing', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const originalQuery: GitHubReposSearchQuery = {
        topicsToSearch: ['ai'],
        keywordsToSearch: ['whale'],
        limit: 10,
      };

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries: [originalQuery],
      });

      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(2);

      const calls = mockSearchGitHubReposAPI.mock.calls;
      // Find topics query (has topicsToSearch, no keywordsToSearch)
      const topicsQuery = calls.find(
        call => call[0]?.topicsToSearch && !call[0]?.keywordsToSearch
      )?.[0];
      // Find keywords query (has keywordsToSearch, no topicsToSearch)
      const keywordsQuery = calls.find(
        call => call[0]?.keywordsToSearch && !call[0]?.topicsToSearch
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

      // Should generate calls with arrays preserved; we don't enforce changing types
      calls.forEach(call => {
        if (call[0]?.topicsToSearch) {
          expect(
            Array.isArray(call[0]?.topicsToSearch) ||
              typeof call[0]?.topicsToSearch === 'string'
          ).toBe(true);
        }
        if (call[0]?.keywordsToSearch) {
          expect(
            Array.isArray(call[0]?.keywordsToSearch) ||
              typeof call[0]?.keywordsToSearch === 'string'
          ).toBe(true);
        }
      });
    });
  });

  describe('Complex Multi-Query Splitting', () => {
    it('should correctly split all queries with both keywordsToSearch and topicsToSearch from whale detection example', async () => {
      const mockServer = createMockMcpServer();
      registerSearchGitHubReposTool(mockServer.server);

      const queries: GitHubReposSearchQuery[] = [
        {
          keywordsToSearch: ['whale', 'detection', 'AI'],
          topicsToSearch: [
            'computer-vision',
            'machine-learning',
            'deep-learning',
          ],
          sort: 'stars',
          limit: 20,
          reasoning:
            'Search for repositories specifically focused on whale detection using AI and computer vision',
        },
        {
          keywordsToSearch: ['marine', 'mammal', 'detection'],
          topicsToSearch: ['computer-vision', 'object-detection'],
          sort: 'stars',
          limit: 20,
          reasoning:
            'Find repositories for marine mammal detection which would include whales',
        },
        {
          keywordsToSearch: ['underwater', 'computer', 'vision'],
          topicsToSearch: ['opencv', 'tensorflow', 'pytorch'],
          sort: 'stars',
          limit: 20,
          reasoning:
            'Look for underwater computer vision projects that might include whale detection',
        },
        {
          keywordsToSearch: ['ocean', 'wildlife', 'detection'],
          topicsToSearch: ['yolo', 'object-detection', 'deep-learning'],
          sort: 'stars',
          limit: 20,
          reasoning:
            'Search for ocean wildlife detection systems that could detect whales',
        },
        {
          keywordsToSearch: ['cetacean', 'detection'],
          sort: 'stars',
          limit: 15,
          reasoning:
            'Search for cetacean (whale and dolphin) specific detection repositories',
        },
      ];

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries,
      });

      // Should be called 9 times total:
      // - whale_detection_ai: 2 (split)
      // - marine_mammal_detection: 2 (split)
      // - underwater_computer_vision: 2 (split)
      // - ocean_wildlife_detection: 2 (split)
      // - cetacean_detection: 1 (no split - only keywords)
      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(9);

      const calls = mockSearchGitHubReposAPI.mock.calls;

      // Verify whale_detection_ai was split correctly
      const whaleDetectionTopics = calls.find(
        call =>
          call[0]?.topicsToSearch &&
          !call[0]?.keywordsToSearch &&
          call[0]?.reasoning?.includes('whale detection using AI')
      )?.[0];
      const whaleDetectionKeywords = calls.find(
        call =>
          call[0]?.keywordsToSearch &&
          !call[0]?.topicsToSearch &&
          call[0]?.reasoning?.includes('whale detection using AI')
      )?.[0];

      expect(whaleDetectionTopics).toEqual({
        topicsToSearch: [
          'computer-vision',
          'machine-learning',
          'deep-learning',
        ],
        reasoning:
          'Search for repositories specifically focused on whale detection using AI and computer vision (topics-based search)',
        limit: 20,
        sort: 'stars',
      });

      expect(whaleDetectionKeywords).toEqual({
        keywordsToSearch: ['whale', 'detection', 'AI'],
        reasoning:
          'Search for repositories specifically focused on whale detection using AI and computer vision (keywords-based search)',
        limit: 20,
        sort: 'stars',
      });

      const marineMammalTopics = calls.find(
        call =>
          call[0]?.topicsToSearch &&
          !call[0]?.keywordsToSearch &&
          call[0]?.reasoning?.includes('marine mammal')
      )?.[0];
      const marineMammalKeywords = calls.find(
        call =>
          call[0]?.keywordsToSearch &&
          !call[0]?.topicsToSearch &&
          call[0]?.reasoning?.includes('marine mammal')
      )?.[0];

      expect(marineMammalTopics).toEqual({
        topicsToSearch: ['computer-vision', 'object-detection'],
        reasoning:
          'Find repositories for marine mammal detection which would include whales (topics-based search)',
        limit: 20,
        sort: 'stars',
      });

      expect(marineMammalKeywords).toEqual({
        keywordsToSearch: ['marine', 'mammal', 'detection'],
        reasoning:
          'Find repositories for marine mammal detection which would include whales (keywords-based search)',
        limit: 20,
        sort: 'stars',
      });

      const underwaterTopics = calls.find(
        call =>
          call[0]?.topicsToSearch &&
          !call[0]?.keywordsToSearch &&
          call[0]?.reasoning?.includes('underwater')
      )?.[0];
      const underwaterKeywords = calls.find(
        call =>
          call[0]?.keywordsToSearch &&
          !call[0]?.topicsToSearch &&
          call[0]?.reasoning?.includes('underwater')
      )?.[0];

      expect(underwaterTopics).toEqual({
        topicsToSearch: ['opencv', 'tensorflow', 'pytorch'],
        reasoning:
          'Look for underwater computer vision projects that might include whale detection (topics-based search)',
        limit: 20,
        sort: 'stars',
      });

      expect(underwaterKeywords).toEqual({
        keywordsToSearch: ['underwater', 'computer', 'vision'],
        reasoning:
          'Look for underwater computer vision projects that might include whale detection (keywords-based search)',
        limit: 20,
        sort: 'stars',
      });

      const oceanWildlifeTopics = calls.find(
        call =>
          call[0]?.topicsToSearch &&
          !call[0]?.keywordsToSearch &&
          call[0]?.reasoning?.includes('ocean wildlife')
      )?.[0];
      const oceanWildlifeKeywords = calls.find(
        call =>
          call[0]?.keywordsToSearch &&
          !call[0]?.topicsToSearch &&
          call[0]?.reasoning?.includes('ocean wildlife')
      )?.[0];

      expect(oceanWildlifeTopics).toEqual({
        topicsToSearch: ['yolo', 'object-detection', 'deep-learning'],
        reasoning:
          'Search for ocean wildlife detection systems that could detect whales (topics-based search)',
        limit: 20,
        sort: 'stars',
      });

      expect(oceanWildlifeKeywords).toEqual({
        keywordsToSearch: ['ocean', 'wildlife', 'detection'],
        reasoning:
          'Search for ocean wildlife detection systems that could detect whales (keywords-based search)',
        limit: 20,
        sort: 'stars',
      });

      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(9);

      // Verify each call has either topics OR keywords, not both
      calls.forEach(call => {
        const query = call[0];
        const hasTopics = !!query?.topicsToSearch;
        const hasKeywords = !!query?.keywordsToSearch;

        // Each query should have exactly one type of search
        expect(hasTopics || hasKeywords).toBe(true);
        if (hasTopics && hasKeywords) {
          throw new Error('Query should not have both topics and keywords');
        }
      });
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
              reasoning: 'Search for whale detection repositories',
              topicsToSearch: ['computer-vision'],
              keywordsToSearch: ['whale', 'detection'],
              limit: 5,
            },
          ],
        }
      );

      const responseText = result.content[0]?.text as string;

      expect(result).toEqual({
        isError: false,
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      });

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('2 hasResults');
      expect(responseText).toContain('topics-based search');
      expect(responseText).toContain('keywords-based search');
    });
  });
});

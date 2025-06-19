import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

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
import { registerSearchGitHubIssuesTool } from '../../src/mcp/tools/github_search_issues.js';

describe('GitHub Search Issues Tool', () => {
  let mockServer: McpServer;

  beforeEach(() => {
    // Create a mock server with a tool method
    mockServer = {
      tool: vi.fn(),
    } as any;

    // Clear all mocks
    vi.clearAllMocks();

    // Default implementation for withCache - just execute the function
    mockWithCache.mockImplementation(
      async (key: string, fn: () => Promise<CallToolResult>) => fn()
    );

    // Default cache key generation
    mockGenerateCacheKey.mockReturnValue('test-cache-key');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search issues tool with correct parameters', () => {
      registerSearchGitHubIssuesTool(mockServer);

      expect(mockServer.tool).toHaveBeenCalledWith(
        'github_search_issues',
        expect.any(String),
        expect.objectContaining({
          query: expect.any(Object),
          owner: expect.any(Object),
          repo: expect.any(Object),
          app: expect.any(Object),
          archived: expect.any(Object),
          assignee: expect.any(Object),
          author: expect.any(Object),
          closed: expect.any(Object),
          commenter: expect.any(Object),
          comments: expect.any(Object),
          created: expect.any(Object),
          includePrs: expect.any(Object),
          interactions: expect.any(Object),
          involves: expect.any(Object),
          labels: expect.any(Object),
          language: expect.any(Object),
          locked: expect.any(Object),
          match: expect.any(Object),
          mentions: expect.any(Object),
          milestone: expect.any(Object),
          noAssignee: expect.any(Object),
          noLabel: expect.any(Object),
          noMilestone: expect.any(Object),
          noProject: expect.any(Object),
          project: expect.any(Object),
          reactions: expect.any(Object),
          state: expect.any(Object),
          teamMentions: expect.any(Object),
          updated: expect.any(Object),
          visibility: expect.any(Object),
          sort: expect.any(Object),
          order: expect.any(Object),
          limit: expect.any(Object),
        }),
        expect.objectContaining({
          title: 'Search Issues for Problem Discovery and Solutions',
          description: expect.any(String),
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        }),
        expect.any(Function)
      );
    });
  });

  describe('Successful Issue Searches', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerSearchGitHubIssuesTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should perform basic issue search', async () => {
      const mockApiResponse = {
        total_count: 1,
        incomplete_results: false,
        items: [
          {
            number: 123,
            title: 'Bug in component rendering',
            state: 'open',
            user: { login: 'developer1' },
            repository_url: 'https://api.github.com/repos/facebook/react',
            labels: [{ name: 'bug' }, { name: 'priority-high' }],
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
            html_url: 'https://github.com/facebook/react/issues/123',
            comments: 5,
            reactions: { total_count: 3 },
          },
        ],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: 'bug rendering',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.searchType).toBe('issues');
      expect(data.query).toBe('bug rendering');
      expect(data.results).toHaveLength(1);
      expect(data.results[0]).toEqual({
        number: 123,
        title: 'Bug in component rendering',
        state: 'open',
        author: 'developer1',
        repository: 'facebook/react',
        labels: ['bug', 'priority-high'],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        url: 'https://github.com/facebook/react/issues/123',
        comments: 5,
        reactions: 3,
      });
      expect(data.metadata.total_count).toBe(1);
      expect(data.metadata.incomplete_results).toBe(false);
    });

    it('should handle repository-specific search', async () => {
      const mockApiResponse = {
        total_count: 0,
        incomplete_results: false,
        items: [],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'memory leak',
        owner: 'facebook',
        repo: 'react',
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [
          expect.stringContaining(
            'search/issues?q=' +
              encodeURIComponent('memory leak repo:facebook/react')
          ),
        ],
        { cache: false }
      );
    });

    it('should handle organization-wide search', async () => {
      const mockApiResponse = {
        total_count: 0,
        incomplete_results: false,
        items: [],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'performance',
        owner: 'microsoft',
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [
          expect.stringContaining(
            'search/issues?q=' + encodeURIComponent('performance org:microsoft')
          ),
        ],
        { cache: false }
      );
    });

    it('should handle complex search with multiple filters', async () => {
      const mockApiResponse = {
        total_count: 0,
        incomplete_results: false,
        items: [],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'typescript error',
        author: 'developer1',
        assignee: 'maintainer1',
        state: 'open',
        labels: 'bug',
        language: 'typescript',
        created: '>2023-01-01',
        sort: 'created',
        order: 'desc',
        limit: 10,
      });

      const expectedQuery = encodeURIComponent(
        'typescript error author:developer1 assignee:maintainer1 language:typescript state:open created:>2023-01-01 label:"bug"'
      );

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [
          expect.stringContaining(
            `search/issues?q=${expectedQuery}&per_page=10&sort=created&order=desc`
          ),
        ],
        { cache: false }
      );
    });

    it('should handle boolean qualifiers', async () => {
      const mockApiResponse = {
        total_count: 0,
        incomplete_results: false,
        items: [],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'help wanted',
        noAssignee: true,
        noLabel: true,
        noMilestone: true,
        archived: false,
        locked: true,
        visibility: 'public',
      });

      const expectedQuery = encodeURIComponent(
        'help wanted no:assignee no:label no:milestone archived:false is:locked is:public'
      );

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [expect.stringContaining(`search/issues?q=${expectedQuery}`)],
        { cache: false }
      );
    });

    it('should handle milestone and mentions filters', async () => {
      const mockApiResponse = {
        total_count: 0,
        incomplete_results: false,
        items: [],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'feature request',
        milestone: 'v2.0',
        mentions: 'developer1',
        commenter: 'reviewer1',
        involves: 'contributor1',
      });

      const expectedQuery = encodeURIComponent(
        'feature request mentions:developer1 commenter:reviewer1 involves:contributor1 milestone:"v2.0"'
      );

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [expect.stringContaining(`search/issues?q=${expectedQuery}`)],
        { cache: false }
      );
    });

    it('should handle issues with missing optional fields', async () => {
      const mockApiResponse = {
        total_count: 1,
        incomplete_results: false,
        items: [
          {
            number: 456,
            title: 'Issue without optional fields',
            state: 'closed',
            // Missing user, repository_url, labels, reactions
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
            html_url: 'https://github.com/example/repo/issues/456',
            comments: 0,
          },
        ],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: 'test issue',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0]).toEqual({
        number: 456,
        title: 'Issue without optional fields',
        state: 'closed',
        author: '',
        repository: 'unknown',
        labels: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        url: 'https://github.com/example/repo/issues/456',
        comments: 0,
        reactions: 0,
      });
    });

    it('should handle date and numeric filters', async () => {
      const mockApiResponse = {
        total_count: 0,
        incomplete_results: false,
        items: [],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'stale issues',
        created: '<2022-01-01',
        updated: '>2023-01-01',
        closed: '2023-01-15',
        comments: 5,
        reactions: 10,
        interactions: 15,
      });

      const expectedQuery = encodeURIComponent(
        'stale issues created:<2022-01-01 updated:>2023-01-01 closed:2023-01-15'
      );

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [expect.stringContaining(`search/issues?q=${expectedQuery}`)],
        { cache: false }
      );
    });
  });

  describe('Empty Results', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerSearchGitHubIssuesTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should handle empty search results', async () => {
      const mockApiResponse = {
        total_count: 0,
        incomplete_results: false,
        items: [],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: 'nonexistent-issue-pattern',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results).toEqual([]);
      expect(data.metadata.total_count).toBe(0);
    });
  });

  describe('Error Handling', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerSearchGitHubIssuesTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should handle GitHub CLI execution errors', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'GitHub CLI error: Authentication required' }],
      });

      const result = await toolHandler({
        query: 'test issue',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('GitHub CLI error');
    });

    it('should handle malformed JSON responses', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: 'invalid json response',
          },
        ],
      });

      const result = await toolHandler({
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Failed to search GitHub issues'
      );
    });

    it('should handle network timeout errors', async () => {
      const timeoutError = new Error('Network timeout');
      mockExecuteGitHubCommand.mockRejectedValue(timeoutError);

      const result = await toolHandler({
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Failed to search GitHub issues'
      );
    });

    it('should handle API rate limit errors', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'API rate limit exceeded' }],
      });

      const result = await toolHandler({
        query: 'popular issue',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('API rate limit exceeded');
    });
  });

  describe('Input Validation', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerSearchGitHubIssuesTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should reject empty query', async () => {
      const result = await toolHandler({
        query: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Search query is required and cannot be empty'
      );
    });

    it('should reject whitespace-only query', async () => {
      const result = await toolHandler({
        query: '   ',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Search query is required and cannot be empty'
      );
    });

    it('should reject overly long query', async () => {
      const longQuery = 'a'.repeat(300); // 300 characters

      const result = await toolHandler({
        query: longQuery,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Search query is too long. Please limit to 256 characters or less.'
      );
    });

    it('should accept valid query length', async () => {
      const validQuery = 'a'.repeat(256); // Exactly 256 characters

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify({
                total_count: 0,
                incomplete_results: false,
                items: [],
              }),
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: validQuery,
      });

      expect(result.isError).toBe(false);
    });

    it('should handle special characters in query', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify({
                total_count: 0,
                incomplete_results: false,
                items: [],
              }),
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'error: "undefined is not a function" & crash',
      });

      const expectedQuery = encodeURIComponent(
        'error: "undefined is not a function" & crash'
      );

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [expect.stringContaining(`search/issues?q=${expectedQuery}`)],
        { cache: false }
      );
    });

    it('should enforce limit boundaries', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify({
                total_count: 0,
                incomplete_results: false,
                items: [],
              }),
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      // Test with limit over 100 (should be capped at 100)
      await toolHandler({
        query: 'test',
        limit: 150,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [expect.stringContaining('per_page=100')],
        { cache: false }
      );
    });
  });

  describe('Caching', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerSearchGitHubIssuesTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should use cache for issue searches', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify({
                total_count: 0,
                incomplete_results: false,
                items: [],
              }),
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'test issue',
        state: 'open',
      });

      expect(mockGenerateCacheKey).toHaveBeenCalledWith('gh-issues', {
        query: 'test issue',
        state: 'open',
      });
      expect(mockWithCache).toHaveBeenCalledWith(
        'test-cache-key',
        expect.any(Function)
      );
    });

    it('should generate different cache keys for different parameters', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify({
                total_count: 0,
                incomplete_results: false,
                items: [],
              }),
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      // First search
      await toolHandler({
        query: 'bug',
        state: 'open',
      });

      // Second search with different parameters
      await toolHandler({
        query: 'bug',
        state: 'closed',
      });

      expect(mockGenerateCacheKey).toHaveBeenCalledTimes(2);
      expect(mockGenerateCacheKey).toHaveBeenNthCalledWith(1, 'gh-issues', {
        query: 'bug',
        state: 'open',
      });
      expect(mockGenerateCacheKey).toHaveBeenNthCalledWith(2, 'gh-issues', {
        query: 'bug',
        state: 'closed',
      });
    });
  });

  describe('URL Encoding', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerSearchGitHubIssuesTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should properly encode complex queries for API calls', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify({
                total_count: 0,
                incomplete_results: false,
                items: [],
              }),
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'memory leak in React hooks',
        labels: 'bug & performance',
        milestone: 'v2.0 release',
      });

      // Verify that the query is properly URL encoded
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [
          expect.stringContaining(
            encodeURIComponent(
              'memory leak in React hooks label:"bug & performance" milestone:"v2.0 release"'
            )
          ),
        ],
        { cache: false }
      );
    });
  });
});

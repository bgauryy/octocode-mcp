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
import { registerSearchGitHubPullRequestsTool } from '../../src/mcp/tools/github_search_pull_requests.js';

describe('GitHub Search Pull Requests Tool', () => {
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
    it('should register the GitHub search pull requests tool with correct parameters', () => {
      registerSearchGitHubPullRequestsTool(mockServer);

      expect(mockServer.tool).toHaveBeenCalledWith(
        'github_search_pull_requests',
        expect.any(String),
        expect.objectContaining({
          query: expect.any(Object),
          owner: expect.any(Object),
          repo: expect.any(Object),
          author: expect.any(Object),
          assignee: expect.any(Object),
          mentions: expect.any(Object),
          commenter: expect.any(Object),
          involves: expect.any(Object),
          reviewedBy: expect.any(Object),
          reviewRequested: expect.any(Object),
          state: expect.any(Object),
          head: expect.any(Object),
          base: expect.any(Object),
          language: expect.any(Object),
          created: expect.any(Object),
          updated: expect.any(Object),
          mergedAt: expect.any(Object),
          closed: expect.any(Object),
          draft: expect.any(Object),
          limit: expect.any(Object),
          sort: expect.any(Object),
          order: expect.any(Object),
        }),
        expect.objectContaining({
          title: 'github_search_pull_requests',
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

  describe('Successful Pull Request Searches', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerSearchGitHubPullRequestsTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should perform basic pull request search', async () => {
      const mockApiResponse = {
        total_count: 1,
        incomplete_results: false,
        items: [
          {
            number: 456,
            title: 'Add new feature for user authentication',
            state: 'open',
            user: { login: 'contributor1' },
            repository_url: 'https://api.github.com/repos/facebook/react',
            labels: [{ name: 'enhancement' }, { name: 'authentication' }],
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
            html_url: 'https://github.com/facebook/react/pull/456',
            comments: 3,
            reactions: { total_count: 5 },
            draft: false,
            merged_at: null,
            closed_at: null,
            head: { ref: 'feature/auth' },
            base: { ref: 'main' },
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
        query: 'authentication feature',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.searchType).toBe('prs');
      expect(data.query).toBe('authentication feature');
      expect(data.results).toHaveLength(1);
      expect(data.results[0]).toEqual({
        number: 456,
        title: 'Add new feature for user authentication',
        state: 'open',
        author: 'contributor1',
        repository: 'facebook/react',
        labels: ['enhancement', 'authentication'],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        url: 'https://github.com/facebook/react/pull/456',
        comments: 3,
        reactions: 5,
        draft: false,
        head: 'feature/auth',
        base: 'main',
      });
      expect(data.metadata.total_count).toBe(1);
      expect(data.metadata.incomplete_results).toBe(false);

      // Verify type:pr is automatically added
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [
          expect.stringContaining(
            encodeURIComponent('authentication feature type:pr')
          ),
        ],
        { cache: false }
      );
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
        query: 'bug fix',
        owner: 'microsoft',
        repo: 'vscode',
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [
          expect.stringContaining(
            'search/issues?q=' +
              encodeURIComponent('bug fix repo:microsoft/vscode type:pr')
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
        query: 'performance improvement',
        owner: 'facebook',
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [
          expect.stringContaining(
            'search/issues?q=' +
              encodeURIComponent('performance improvement org:facebook type:pr')
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
        query: 'typescript refactor',
        author: 'developer1',
        assignee: 'maintainer1',
        state: 'open',
        language: 'typescript',
        created: '>2023-01-01',
        head: 'feature/refactor',
        base: 'main',
        draft: false,
        sort: 'created',
        order: 'desc',
        limit: 10,
      });

      const expectedQuery = encodeURIComponent(
        'typescript refactor author:developer1 assignee:maintainer1 state:open created:>2023-01-01 language:typescript head:feature/refactor base:main draft:false type:pr'
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

    it('should handle review-related filters', async () => {
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
        query: 'code review',
        reviewedBy: 'reviewer1',
        reviewRequested: 'team-leads',
        mentions: 'contributor1',
        commenter: 'tester1',
        involves: 'manager1',
      });

      const expectedQuery = encodeURIComponent(
        'code review mentions:contributor1 commenter:tester1 involves:manager1 reviewed-by:reviewer1 review-requested:team-leads type:pr'
      );

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [expect.stringContaining(`search/issues?q=${expectedQuery}`)],
        { cache: false }
      );
    });

    it('should handle date filters', async () => {
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
        query: 'hotfix',
        created: '>2023-01-01',
        updated: '<2023-12-31',
        closed: '2023-06-15',
        mergedAt: '>2023-06-01',
      });

      const expectedQuery = encodeURIComponent(
        'hotfix created:>2023-01-01 updated:<2023-12-31 closed:2023-06-15 merged:>2023-06-01 type:pr'
      );

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [expect.stringContaining(`search/issues?q=${expectedQuery}`)],
        { cache: false }
      );
    });

    it('should handle draft pull requests', async () => {
      const mockApiResponse = {
        total_count: 1,
        incomplete_results: false,
        items: [
          {
            number: 789,
            title: 'WIP: New experimental feature',
            state: 'open',
            user: { login: 'developer2' },
            repository_url: 'https://api.github.com/repos/example/repo',
            labels: [{ name: 'work-in-progress' }],
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
            html_url: 'https://github.com/example/repo/pull/789',
            comments: 1,
            reactions: { total_count: 0 },
            draft: true,
            merged_at: null,
            closed_at: null,
            head: { ref: 'experimental' },
            base: { ref: 'develop' },
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
        query: 'experimental',
        draft: true,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].draft).toBe(true);
      expect(data.results[0].head).toBe('experimental');
      expect(data.results[0].base).toBe('develop');
    });

    it('should handle merged pull requests', async () => {
      const mockApiResponse = {
        total_count: 1,
        incomplete_results: false,
        items: [
          {
            number: 101,
            title: 'Fix critical security vulnerability',
            state: 'closed',
            user: { login: 'security-team' },
            repository_url: 'https://api.github.com/repos/company/app',
            labels: [{ name: 'security' }, { name: 'critical' }],
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-03T00:00:00Z',
            html_url: 'https://github.com/company/app/pull/101',
            comments: 8,
            reactions: { total_count: 12 },
            draft: false,
            merged_at: '2023-01-03T00:00:00Z',
            closed_at: '2023-01-03T00:00:00Z',
            head: { ref: 'security/fix-vuln' },
            base: { ref: 'main' },
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
        query: 'security fix',
        state: 'closed',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0]).toEqual({
        number: 101,
        title: 'Fix critical security vulnerability',
        state: 'closed',
        author: 'security-team',
        repository: 'company/app',
        labels: ['security', 'critical'],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-03T00:00:00Z',
        url: 'https://github.com/company/app/pull/101',
        comments: 8,
        reactions: 12,
        draft: false,
        merged_at: '2023-01-03T00:00:00Z',
        closed_at: '2023-01-03T00:00:00Z',
        head: 'security/fix-vuln',
        base: 'main',
      });
    });

    it('should handle pull requests with missing optional fields', async () => {
      const mockApiResponse = {
        total_count: 1,
        incomplete_results: false,
        items: [
          {
            number: 999,
            title: 'Simple documentation update',
            state: 'open',
            // Missing user, repository_url, labels, reactions, head, base
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
            html_url: 'https://github.com/example/docs/pull/999',
            comments: 0,
            draft: false,
            merged_at: null,
            closed_at: null,
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
        query: 'documentation',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0]).toEqual({
        number: 999,
        title: 'Simple documentation update',
        state: 'open',
        author: '',
        repository: 'unknown',
        labels: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        url: 'https://github.com/example/docs/pull/999',
        comments: 0,
        reactions: 0,
        draft: false,
        // merged_at, closed_at, head, base should not be present
      });

      // Verify optional fields are not included when null/undefined
      expect(data.results[0]).not.toHaveProperty('merged_at');
      expect(data.results[0]).not.toHaveProperty('closed_at');
      expect(data.results[0]).not.toHaveProperty('head');
      expect(data.results[0]).not.toHaveProperty('base');
    });
  });

  describe('Empty Results', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerSearchGitHubPullRequestsTool(mockServer);
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
        query: 'nonexistent-pr-pattern',
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
      registerSearchGitHubPullRequestsTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should handle GitHub CLI execution errors', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'GitHub CLI error: Authentication required' }],
      });

      const result = await toolHandler({
        query: 'test pr',
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
        'Failed to search GitHub pull requests'
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
        'Failed to search GitHub pull requests'
      );
    });

    it('should handle API rate limit errors', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'API rate limit exceeded' }],
      });

      const result = await toolHandler({
        query: 'popular pr',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('API rate limit exceeded');
    });
  });

  describe('Input Validation', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerSearchGitHubPullRequestsTool(mockServer);
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
        query: 'fix: "Cannot read property" & memory leak',
      });

      const expectedQuery = encodeURIComponent(
        'fix: "Cannot read property" & memory leak type:pr'
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
      registerSearchGitHubPullRequestsTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should use cache for pull request searches', async () => {
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
        query: 'test pr',
        state: 'open',
      });

      expect(mockGenerateCacheKey).toHaveBeenCalledWith('gh-prs', {
        query: 'test pr',
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
        query: 'feature',
        state: 'open',
      });

      // Second search with different parameters
      await toolHandler({
        query: 'feature',
        state: 'closed',
      });

      expect(mockGenerateCacheKey).toHaveBeenCalledTimes(2);
      expect(mockGenerateCacheKey).toHaveBeenNthCalledWith(1, 'gh-prs', {
        query: 'feature',
        state: 'open',
      });
      expect(mockGenerateCacheKey).toHaveBeenNthCalledWith(2, 'gh-prs', {
        query: 'feature',
        state: 'closed',
      });
    });
  });

  describe('URL Encoding', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerSearchGitHubPullRequestsTool(mockServer);
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
        query: 'refactor: API & database optimization',
        reviewedBy: 'senior-dev',
        head: 'feature/api-optimization',
      });

      // Verify that the query is properly URL encoded
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [
          expect.stringContaining(
            encodeURIComponent(
              'refactor: API & database optimization reviewed-by:senior-dev head:feature/api-optimization type:pr'
            )
          ),
        ],
        { cache: false }
      );
    });
  });

  describe('Type Qualifier', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerSearchGitHubPullRequestsTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should always add type:pr qualifier to search only pull requests', async () => {
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
        query: 'simple search',
      });

      // Verify type:pr is automatically added
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        [expect.stringContaining(encodeURIComponent('simple search type:pr'))],
        { cache: false }
      );
    });
  });
});

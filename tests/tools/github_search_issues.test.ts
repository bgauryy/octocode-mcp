import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
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
import { registerSearchGitHubIssuesTool } from '../../src/mcp/tools/github_search_issues.js';

describe('GitHub Search Issues Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    // Create mock server using the fixture
    mockServer = createMockMcpServer();

    // Register the tool for all tests
    registerSearchGitHubIssuesTool(mockServer.server);

    // Clear all mocks
    vi.clearAllMocks();

    // Default implementation for withCache - just execute the function
    mockWithCache.mockImplementation(
      // @ts-expect-error - mockWithCache is not typed
      async (key: string, fn: () => Promise<CallToolResult>) => fn()
    );

    // Default cache key generation
    mockGenerateCacheKey.mockReturnValue('test-cache-key');
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search issues tool with correct parameters', () => {
      registerSearchGitHubIssuesTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'githubSearchIssues',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Successful Issue Searches', () => {
    it('should perform basic issue search', async () => {
      const mockApiResponse = {
        total_count: 1,
        incomplete_results: false,
        items: [
          {
            number: 123,
            title: 'Bug in rendering component',
            state: 'open',
            user: { login: 'developer1' },
            repository_url: 'https://api.github.com/repos/facebook/react',
            labels: [{ name: 'bug' }, { name: 'component' }],
            created_at: '2023-01-15T10:30:00Z',
            updated_at: '2023-01-16T14:20:00Z',
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
              result: mockApiResponse, // Direct object, not JSON string
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'bug rendering',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results).toBeDefined();
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

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'memory leak',
        owner: 'facebook',
        repo: 'react',
      });

      // Empty results should return an error
      expect(result.isError).toBe(true);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'issues',
          'memory leak',
          '--repo',
          'facebook/react',
          '--limit',
          '25',
          '--json',
          'assignees,author,authorAssociation,closedAt,commentsCount,createdAt,id,isLocked,isPullRequest,labels,number,repository,state,title,updatedAt,url',
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

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'performance',
        owner: 'microsoft',
      });

      // Empty results should return an error
      expect(result.isError).toBe(true);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'issues',
          'performance',
          '--owner',
          'microsoft',
          '--limit',
          '25',
          '--json',
          'assignees,author,authorAssociation,closedAt,commentsCount,createdAt,id,isLocked,isPullRequest,labels,number,repository,state,title,updatedAt,url',
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

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'typescript error',
        author: 'developer1',
        assignee: 'maintainer1',
        state: 'open',
        label: 'bug',
        language: 'typescript',
        created: '>2023-01-01',
        sort: 'created',
        order: 'desc',
        limit: 10,
      });

      // Empty results should return an error
      expect(result.isError).toBe(true);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'issues',
          'typescript error',
          '--assignee',
          'maintainer1',
          '--author',
          'developer1',
          '--created',
          '>2023-01-01',
          '--label',
          'bug',
          '--language',
          'typescript',
          '--state',
          'open',
          '--sort',
          'created',
          '--order',
          'desc',
          '--limit',
          '10',
          '--json',
          'assignees,author,authorAssociation,closedAt,commentsCount,createdAt,id,isLocked,isPullRequest,labels,number,repository,state,title,updatedAt,url',
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

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'help wanted',
        'no-assignee': true,
        'no-label': true,
        'no-milestone': true,
        archived: false,
        locked: true,
        visibility: 'public',
      });

      // Empty results should return an error
      expect(result.isError).toBe(true);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'issues',
          'help wanted',
          '--archived',
          'false',
          '--locked',
          '--no-assignee',
          '--no-label',
          '--no-milestone',
          '--visibility',
          'public',
          '--limit',
          '25',
          '--json',
          'assignees,author,authorAssociation,closedAt,commentsCount,createdAt,id,isLocked,isPullRequest,labels,number,repository,state,title,updatedAt,url',
        ],
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

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'documentation',
        milestone: 'v2.0',
        mentions: 'maintainer',
        'team-mentions': 'core-team',
      });

      // Empty results should return an error
      expect(result.isError).toBe(true);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'issues',
          'documentation',
          '--mentions',
          'maintainer',
          '--milestone',
          'v2.0',
          '--team-mentions',
          'core-team',
          '--limit',
          '25',
          '--json',
          'assignees,author,authorAssociation,closedAt,commentsCount,createdAt,id,isLocked,isPullRequest,labels,number,repository,state,title,updatedAt,url',
        ],
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
            title: 'Issue with minimal data',
            state: 'closed',
            // Missing user, labels, reactions
            repository_url: 'https://api.github.com/repos/test/repo',
            created_at: '2023-02-01T00:00:00Z',
            updated_at: '2023-02-02T00:00:00Z',
            html_url: 'https://github.com/test/repo/issues/456',
            comments: 0,
          },
        ],
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: mockApiResponse, // Direct object, not JSON string
              command: 'gh api search/issues',
              type: 'github',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'minimal data',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results).toBeDefined();
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

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'stale issues',
        created: '<2022-01-01',
        updated: '>2023-01-01',
        closed: '2023-01-15',
        comments: 5,
        reactions: 10,
        interactions: 15,
      });

      // Empty results should return an error
      expect(result.isError).toBe(true);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'issues',
          'stale issues',
          '--closed',
          '2023-01-15',
          '--comments',
          '5',
          '--created',
          '<2022-01-01',
          '--interactions',
          '15',
          '--reactions',
          '10',
          '--updated',
          '>2023-01-01',
          '--limit',
          '25',
          '--json',
          'assignees,author,authorAssociation,closedAt,commentsCount,createdAt,id,isLocked,isPullRequest,labels,number,repository,state,title,updatedAt,url',
        ],
        { cache: false }
      );
    });
  });

  describe('Empty Results', () => {
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

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'nonexistent issue query',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No issues found');
    });
  });

  describe('Error Handling', () => {
    it('should handle GitHub CLI execution errors', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'GitHub CLI error: Authentication required' }],
      });

      const result = await mockServer.callTool('githubSearchIssues', {
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

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Issue search failed');
    });

    it('should handle network timeout errors', async () => {
      const timeoutError = new Error('Network timeout');
      mockExecuteGitHubCommand.mockRejectedValue(timeoutError);

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Issue search failed');
    });

    it('should handle API rate limit errors', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'API rate limit exceeded' }],
      });

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'popular issue',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('API rate limit exceeded');
    });
  });

  describe('Input Validation', () => {
    it('should reject empty query', async () => {
      const result = await mockServer.callTool('githubSearchIssues', {
        query: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Query required - provide search keywords'
      );
    });

    it('should reject whitespace-only query', async () => {
      const result = await mockServer.callTool('githubSearchIssues', {
        query: '   ',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Query required - provide search keywords'
      );
    });

    it('should reject overly long query', async () => {
      const longQuery = 'a'.repeat(300); // 300 characters

      const result = await mockServer.callTool('githubSearchIssues', {
        query: longQuery,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Query too long (max 256 chars)'
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

      const result = await mockServer.callTool('githubSearchIssues', {
        query: validQuery,
      });

      // Empty results should return an error
      expect(result.isError).toBe(true);
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

      await mockServer.callTool('githubSearchIssues', {
        query: 'error: "undefined is not a function" & crash',
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'issues',
          'error: "undefined is not a function"  crash',
          '--limit',
          '25',
          '--json',
          'assignees,author,authorAssociation,closedAt,commentsCount,createdAt,id,isLocked,isPullRequest,labels,number,repository,state,title,updatedAt,url',
        ],
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
      await mockServer.callTool('githubSearchIssues', {
        query: 'test',
        limit: 150,
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'issues',
          'test',
          '--limit',
          '100',
          '--json',
          'assignees,author,authorAssociation,closedAt,commentsCount,createdAt,id,isLocked,isPullRequest,labels,number,repository,state,title,updatedAt,url',
        ],
        { cache: false }
      );
    });
  });

  describe('Caching', () => {
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

      await mockServer.callTool('githubSearchIssues', {
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
      await mockServer.callTool('githubSearchIssues', {
        query: 'bug',
        state: 'open',
      });

      // Second search with different parameters
      await mockServer.callTool('githubSearchIssues', {
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

  describe('Complex Query Handling', () => {
    it('should properly handle complex queries with special characters', async () => {
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

      await mockServer.callTool('githubSearchIssues', {
        query: 'memory leak in React hooks',
        label: 'bug & performance',
        milestone: 'v2.0 release',
      });

      // Verify that the query is properly handled by CLI
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'issues',
          'memory leak in React hooks',
          '--label',
          'bug  performance',
          '--milestone',
          'v2.0 release',
          '--limit',
          '25',
          '--json',
          'assignees,author,authorAssociation,closedAt,commentsCount,createdAt,id,isLocked,isPullRequest,labels,number,repository,state,title,updatedAt,url',
        ],
        { cache: false }
      );
    });
  });
});

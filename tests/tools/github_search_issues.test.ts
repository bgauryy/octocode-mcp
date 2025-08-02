import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteGitHubCommand = vi.hoisted(() => vi.fn());
const mockSearchGitHubIssuesAPI = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: mockExecuteGitHubCommand,
}));

vi.mock('../../src/utils/githubAPI.js', () => ({
  searchGitHubIssuesAPI: mockSearchGitHubIssuesAPI,
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

    // Default API mock behavior - return error so CLI takes precedence
    mockSearchGitHubIssuesAPI.mockResolvedValue({
      isError: true,
      content: [{ text: JSON.stringify({ error: 'API error' }) }],
    });
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
    mockSearchGitHubIssuesAPI.mockReset();
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
      expect(result.content[0].text as string).toContain('No issues found');
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
      expect(result.content[0].text as string).toContain('No issues found');
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
      expect(result.content[0].text as string).toContain('Issue search failed');
    });

    it('should handle network timeout errors', async () => {
      const timeoutError = new Error('Network timeout');
      mockExecuteGitHubCommand.mockRejectedValue(timeoutError);

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text as string).toContain('Issue search failed');
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
      expect(result.content[0].text as string).toContain('No issues found');
    });
  });

  describe('Input Validation', () => {
    it('should reject empty query', async () => {
      const result = await mockServer.callTool('githubSearchIssues', {
        query: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text as string).toContain(
        'Query required - provide search keywords'
      );
    });

    it('should reject whitespace-only query', async () => {
      const result = await mockServer.callTool('githubSearchIssues', {
        query: '   ',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text as string).toContain(
        'Query required - provide search keywords'
      );
    });

    it('should reject overly long query', async () => {
      const longQuery = 'a'.repeat(300); // 300 characters

      const result = await mockServer.callTool('githubSearchIssues', {
        query: longQuery,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text as string).toContain(
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
          'error: "undefined is not a function" & crash',
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
          'bug & performance',
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

  describe('Content Sanitization', () => {
    it('should sanitize GitHub tokens from issue responses', async () => {
      const mockResponseWithTokens = {
        items: [
          {
            id: 1,
            number: 1,
            title: 'Issue with authentication',
            body: 'Using token ghp_1234567890abcdefghijklmnopqrstuvwxyz123456 in CI pipeline',
            user: {
              login: 'testuser',
            },
            html_url: 'https://github.com/test/repo/issues/1',
            state: 'open',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
            labels: [],
            repository: {
              nameWithOwner: 'test/repo',
            },
          },
        ],
        total_count: 1,
      };

      // Mock the initial search
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh api /search/issues',
              result: mockResponseWithTokens,
              timestamp: new Date().toISOString(),
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      // Mock the detailed issue fetch
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh api /repos/test/repo/issues/1',
              result: {
                number: 1,
                title: 'Issue with authentication',
                body: 'Using token ghp_1234567890abcdefghijklmnopqrstuvwxyz123456 in CI pipeline',
                state: 'open',
                created_at: '2023-01-01T00:00:00Z',
                updated_at: '2023-01-01T00:00:00Z',
              },
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'authentication',
      });

      const response = JSON.parse(result.content[0].text as string);
      expect(response.results[0].body).not.toContain(
        'ghp_1234567890abcdefghijklmnopqrstuvwxyz123456'
      );
      expect(response.results[0].body).toContain('[REDACTED-GITHUBTOKENS]');
    });

    it('should sanitize API keys from issue responses', async () => {
      const mockResponseWithApiKeys = {
        items: [
          {
            id: 2,
            number: 2,
            title: 'API configuration issue',
            body: 'OpenAI API key: sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO\nAWS key: AKIAIOSFODNN7EXAMPLE',
            user: {
              login: 'testuser',
            },
            html_url: 'https://github.com/test/repo/issues/2',
            state: 'open',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
            labels: [],
            repository: {
              nameWithOwner: 'test/repo',
            },
          },
        ],
        total_count: 1,
      };

      // Mock the initial search
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh api /search/issues',
              result: mockResponseWithApiKeys,
              timestamp: new Date().toISOString(),
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      // Mock the detailed issue fetch
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh api /repos/test/repo/issues/2',
              result: {
                number: 2,
                title: 'API configuration issue',
                body: 'OpenAI API key: sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO\nAWS key: AKIAIOSFODNN7EXAMPLE',
                state: 'open',
                created_at: '2023-01-01T00:00:00Z',
                updated_at: '2023-01-01T00:00:00Z',
              },
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'API configuration',
      });

      const response = JSON.parse(result.content[0].text as string);
      expect(response.results[0].body).not.toContain(
        'sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO'
      );
      expect(response.results[0].body).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(response.results[0].body).toContain('[REDACTED-OPENAIAPIKEY]');
      expect(response.results[0].body).toContain('[REDACTED-AWSACCESSKEYID]');
    });

    it('should sanitize database connection strings from issue responses', async () => {
      const mockResponseWithDbCredentials = {
        items: [
          {
            id: 3,
            number: 3,
            title: 'Database connection error',
            body: 'Connection string: postgresql://user:password123@localhost:5432/mydb',
            user: {
              login: 'testuser',
            },
            html_url: 'https://github.com/test/repo/issues/3',
            state: 'open',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
            labels: [],
            repository: {
              nameWithOwner: 'test/repo',
            },
          },
        ],
        total_count: 1,
      };

      // Mock the initial search
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh api /search/issues',
              result: mockResponseWithDbCredentials,
              timestamp: new Date().toISOString(),
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      // Mock the detailed issue fetch
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh api /repos/test/repo/issues/3',
              result: {
                number: 3,
                title: 'Database connection error',
                body: 'Connection string: postgresql://user:password123@localhost:5432/mydb',
                state: 'open',
                created_at: '2023-01-01T00:00:00Z',
                updated_at: '2023-01-01T00:00:00Z',
              },
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'database connection',
      });

      const response = JSON.parse(result.content[0].text as string);
      expect(response.results[0].body).not.toContain(
        'postgresql://user:password123@localhost:5432/mydb'
      );
      expect(response.results[0].body).toContain(
        '[REDACTED-POSTGRESQLCONNECTIONSTRING]'
      );
    });

    it('should sanitize private keys from issue responses', async () => {
      const mockResponseWithPrivateKey = {
        items: [
          {
            id: 4,
            number: 4,
            title: 'SSH key issue',
            body: `SSH private key:
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA7YQnm/eSVyv24Bn5p7vSpJLPWdNw5MzQs1sVJQ==
-----END RSA PRIVATE KEY-----`,
            user: {
              login: 'testuser',
            },
            html_url: 'https://github.com/test/repo/issues/4',
            state: 'open',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
            labels: [],
            repository: {
              nameWithOwner: 'test/repo',
            },
          },
        ],
        total_count: 1,
      };

      // Mock the initial search
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh api /search/issues',
              result: mockResponseWithPrivateKey,
              timestamp: new Date().toISOString(),
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      // Mock the detailed issue fetch
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh api /repos/test/repo/issues/4',
              result: {
                number: 4,
                title: 'SSH key issue',
                body: `SSH private key:
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA7YQnm/eSVyv24Bn5p7vSpJLPWdNw5MzQs1sVJQ==
-----END RSA PRIVATE KEY-----`,
                state: 'open',
                created_at: '2023-01-01T00:00:00Z',
                updated_at: '2023-01-01T00:00:00Z',
              },
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'SSH key',
      });

      const response = JSON.parse(result.content[0].text as string);
      expect(response.results[0].body).not.toContain(
        'MIIEpAIBAAKCAQEA7YQnm/eSVyv24Bn5p7vSpJLPWdNw5MzQs1sVJQ'
      );
      expect(response.results[0].body).toContain('[REDACTED-RSAPRIVATEKEY]');
    });

    it('should sanitize multiple types of sensitive data in single issue', async () => {
      const mockResponseWithMixedSecrets = {
        items: [
          {
            id: 5,
            number: 5,
            title: 'Configuration dump',
            body: `Config file contents:
GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz123456
OPENAI_API_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
DATABASE_URL=mongodb://admin:secret@cluster0.mongodb.net:27017/app`,
            user: {
              login: 'testuser',
            },
            html_url: 'https://github.com/test/repo/issues/5',
            state: 'open',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
            labels: [],
            repository: {
              nameWithOwner: 'test/repo',
            },
          },
        ],
        total_count: 1,
      };

      // Mock the initial search
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh api /search/issues',
              result: mockResponseWithMixedSecrets,
              timestamp: new Date().toISOString(),
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      // Mock the detailed issue fetch
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh api /repos/test/repo/issues/5',
              result: {
                number: 5,
                title: 'Configuration dump',
                body: `Config file contents:
GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz123456
OPENAI_API_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
DATABASE_URL=mongodb://admin:secret@cluster0.mongodb.net:27017/app`,
                state: 'open',
                created_at: '2023-01-01T00:00:00Z',
                updated_at: '2023-01-01T00:00:00Z',
              },
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'configuration',
      });

      const response = JSON.parse(result.content[0].text as string);
      const issueBody = response.results[0].body;

      // Verify all secrets are redacted
      expect(issueBody).not.toContain(
        'ghp_1234567890abcdefghijklmnopqrstuvwxyz123456'
      );
      expect(issueBody).not.toContain(
        'sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO'
      );
      expect(issueBody).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(issueBody).not.toContain(
        'mongodb://admin:secret@cluster0.mongodb.net:27017/app'
      );

      // Verify redacted placeholders are present
      expect(issueBody).toContain('[REDACTED-GITHUBTOKENS]');
      expect(issueBody).toContain('[REDACTED-OPENAIAPIKEY]');
      expect(issueBody).toContain('[REDACTED-AWSACCESSKEYID]');
      expect(issueBody).toContain('[REDACTED-MONGODBCONNECTIONSTRING]');

      // Verify non-sensitive content is preserved
      expect(issueBody).toContain('Config file contents:');
      expect(issueBody).toContain('GITHUB_TOKEN=');
      expect(issueBody).toContain('OPENAI_API_KEY=');
    });

    it('should preserve clean content without secrets', async () => {
      const mockCleanResponse = {
        items: [
          {
            id: 6,
            number: 6,
            title: 'Regular issue',
            body: 'This is a normal issue description without any sensitive information.',
            user: {
              login: 'testuser',
            },
            html_url: 'https://github.com/test/repo/issues/6',
            state: 'open',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
            labels: [],
            repository: {
              nameWithOwner: 'test/repo',
            },
          },
        ],
        total_count: 1,
      };

      // Mock the initial search
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh api /search/issues',
              result: mockCleanResponse,
              timestamp: new Date().toISOString(),
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      // Mock the detailed issue fetch
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: 'gh api /repos/test/repo/issues/6',
              result: {
                number: 6,
                title: 'Regular issue',
                body: 'This is a normal issue description without any sensitive information.',
                state: 'open',
                created_at: '2023-01-01T00:00:00Z',
                updated_at: '2023-01-01T00:00:00Z',
              },
              type: 'github',
            }),
          },
        ],
        isError: false,
      });

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'regular issue',
      });

      const response = JSON.parse(result.content[0].text as string);
      expect(response.results[0].body).toBe(
        'This is a normal issue description without any sensitive information.'
      );
    });
  });
});

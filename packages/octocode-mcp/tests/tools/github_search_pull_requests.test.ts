import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockSearchGitHubPullRequestsAPI = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/github/githubAPI.js', () => ({
  searchGitHubPullRequestsAPI: mockSearchGitHubPullRequestsAPI,
}));

// Import after mocking
import { registerSearchGitHubPullRequestsTool } from '../../src/tools/github_search_pull_requests.js';

// Helper function to create standard mock response in CallToolResult format
function createMockPRResponse(overrides: Record<string, unknown> = {}) {
  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          data: {
            total_count: 1,
            incomplete_results: false,
            pull_requests: [
              {
                id: 456,
                number: 456,
                title: 'Test PR',
                state: 'open',
                draft: false,
                merged: false,
                created_at: '2023-01-01T00:00:00Z',
                updated_at: '2023-01-01T00:00:00Z',
                closed_at: null,
                merged_at: null,
                user: {
                  login: 'testuser',
                  id: 1,
                  avatar_url: '',
                  html_url: '',
                },
                assignees: [],
                labels: [],
                milestone: null,
                head: {
                  ref: 'feature-branch',
                  sha: 'abc123',
                  repo: {
                    id: 1,
                    name: 'test-repo',
                    full_name: 'test/test-repo',
                    owner: { login: 'test', id: 1 },
                    private: false,
                    html_url: 'https://github.com/test/test-repo',
                    default_branch: 'main',
                  },
                },
                base: {
                  ref: 'main',
                  sha: 'def456',
                  repo: {
                    id: 1,
                    name: 'test-repo',
                    full_name: 'test/test-repo',
                    owner: { login: 'test', id: 1 },
                    private: false,
                    html_url: 'https://github.com/test/test-repo',
                    default_branch: 'main',
                  },
                },
                body: 'Test PR description',
                comments: 0,
                review_comments: 0,
                commits: 1,
                additions: 10,
                deletions: 5,
                changed_files: 2,
                url: 'https://api.github.com/repos/test/test-repo/pulls/456',
                html_url: 'https://github.com/test/test-repo/pull/456',
                ...overrides,
              },
            ],
          },
          meta: { status: 200 },
        }),
      },
    ],
  };
}

describe('GitHub Search Pull Requests Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    registerSearchGitHubPullRequestsTool(mockServer.server);

    // Reset all mocks
    vi.clearAllMocks();



    // Setup default successful API response using helper
    mockSearchGitHubPullRequestsAPI.mockResolvedValue(createMockPRResponse());
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Parameter Validation', () => {
    it('should accept filter-only searches', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [
          {
            owner: 'facebook',
            repo: 'react',
            state: 'open',
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'facebook',
          repo: 'react',
          state: 'open',
        })
      );
    });

    it('should reject empty queries array', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [],
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.hints).toContain(
        'Provide at least one search query with owner/repo or prNumber'
      );
    });

    it('should reject missing queries parameter', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);
      // Schema validation doesn't provide custom hints for missing required fields
      expect(Array.isArray(response.hints)).toBe(true);
    });

    it('should accept query-based searches', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [
          {
            query: 'bug fix',
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'bug fix',
        })
      );
    });

    it('should reject overly long queries', async () => {
      const longQuery = 'a'.repeat(300);
      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [
          {
            query: longQuery,
          },
        ],
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.hints).toContain(
        'Use shorter, more focused search terms'
      );
    });

    it('should reject too many queries', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: Array(6).fill({ query: 'test' }),
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.hints).toContain('Maximum 5 queries allowed per request');
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful pull request search', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [
          {
            query: 'feature',
            owner: 'test',
            repo: 'repo',
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'feature',
          owner: 'test',
          repo: 'repo',
        })
      );
    });

    it('should pass through all search parameters', async () => {
      const searchParams = {
        query: 'test',
        owner: 'microsoft',
        repo: 'vscode',
        state: 'open',
        sort: 'created',
        order: 'desc',
        limit: 50,
      };

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [searchParams],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining(searchParams)
      );
    });

    it('should handle array parameters', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [
          {
            owner: ['facebook', 'microsoft'],
            repo: ['react', 'vscode'],
            label: ['bug', 'enhancement'],
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: ['facebook', 'microsoft'],
          repo: ['react', 'vscode'],
          label: ['bug', 'enhancement'],
        })
      );
    });

    it('should handle boolean filters', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            draft: true,
            merged: false,
            locked: false,
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test',
          repo: 'repo',
          draft: true,
          merged: false,
          locked: false,
        })
      );
    });

    it('should handle date range filters', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            created: '>2023-01-01',
            updated: '2023-01-01..2023-12-31',
            closed: '<2023-06-01',
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test',
          repo: 'repo',
          created: '>2023-01-01',
          updated: '2023-01-01..2023-12-31',
          closed: '<2023-06-01',
        })
      );
    });

    it('should handle numeric range filters', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            comments: '>5',
            reactions: '10..50',
            interactions: '<100',
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test',
          repo: 'repo',
          comments: '>5',
          reactions: '10..50',
          interactions: '<100',
        })
      );
    });

    it('should handle expensive options with warnings', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            getFileChanges: true,
            withComments: true,
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test',
          repo: 'repo',
          getFileChanges: true,
          withComments: true,
        })
      );
    });
  });

  describe('Bulk Operations', () => {
    it('should handle multiple queries', async () => {
      const queries = [
        { owner: 'test1', repo: 'repo1', query: 'feature' },
        { owner: 'test2', repo: 'repo2', query: 'bug' },
      ];

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries,
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledTimes(2);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining(queries[0])
      );
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining(queries[1])
      );
    });

    it('should handle partial failures in bulk operations', async () => {
      const queries = [
        { owner: 'test1', repo: 'repo1', query: 'feature' },
        { owner: 'test2', repo: 'repo2', query: 'bug' },
      ];

      // First query succeeds, second fails
      mockSearchGitHubPullRequestsAPI
        .mockResolvedValueOnce(createMockPRResponse())
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.meta.successfulOperations).toBe(1);
      expect(response.meta.failedOperations).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValue({
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'API rate limit exceeded',
              meta: {
                error: 'API rate limit exceeded',
                status: 429,
                type: 'http',
              },
              hints: ['Wait before retrying', 'Check rate limit status'],
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [{ query: 'test' }],
      });

      expect(result.isError).toBe(false); // Bulk operations don't fail on individual errors
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data[0].data.error).toBe('API rate limit exceeded');
    });

    it('should handle network errors', async () => {
      mockSearchGitHubPullRequestsAPI.mockRejectedValue(
        new Error('Network error')
      );

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [{ query: 'test' }],
      });

      expect(result.isError).toBe(false); // Bulk operations don't fail on individual errors
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data[0].data.error).toBe('Network error');
    });
  });

  describe('Content Sanitization', () => {
    it('should sanitize GitHub tokens in PR titles and bodies', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValue(
        createMockPRResponse({
          title: 'Fix token leak',
          body: 'Removed token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        })
      );

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [{ query: 'token' }],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);

      // Check that the token was sanitized
      expect(response.data[0].data.pull_requests[0].body).not.toContain('ghp_');
      expect(response.data[0].data.pull_requests[0].body).toContain(
        '[REDACTED-GITHUBTOKENS]'
      );
    });

    it('should sanitize OpenAI keys in PR content', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValue(
        createMockPRResponse({
          title: 'Update API integration',
          body: 'Using key: sk-1234567890abcdefT3BlbkFJ1234567890abcdef',
        })
      );

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [{ query: 'api' }],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);

      // Check that the API key was sanitized
      expect(response.data[0].data.pull_requests[0].body).not.toContain(
        'T3BlbkFJ'
      );
      expect(response.data[0].data.pull_requests[0].body).toContain(
        '[REDACTED-OPENAIAPIKEY]'
      );
    });

    it('should handle PRs with no sensitive content', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValue(
        createMockPRResponse({
          title: 'Clean PR',
          body: 'This is a normal PR description without sensitive information.',
        })
      );

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [{ query: 'clean' }],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);

      // Check that clean content is preserved
      expect(response.data[0].data.pull_requests[0].body).toBe(
        'This is a normal PR description without sensitive information.'
      );
    });
  });

  describe('PR number fetching', () => {
    it('should fetch specific PR by number when owner, repo, and prNumber are provided', async () => {
      const args = {
        owner: 'test-owner',
        repo: 'test-repo',
        prNumber: 123,
      };

      const mockResponse = {
        total_count: 1,
        incomplete_results: false,
        pull_requests: [
          {
            number: 123,
            title: 'Test PR',
            state: 'open',
            author: 'test-user',
            repository: 'test-owner/test-repo',
            url: 'https://github.com/test-owner/test-repo/pull/123',
          },
        ],
      };

      mockSearchGitHubPullRequestsAPI.mockResolvedValue({
        isError: false,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              data: mockResponse,
              meta: { status: 200 },
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [args],
      });

      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(args);
      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data[0].data).toEqual(mockResponse);
    });

    it('should handle errors when fetching specific PR by number', async () => {
      const args = {
        owner: 'test-owner',
        repo: 'test-repo',
        prNumber: 999,
      };

      const mockError = {
        error: 'Failed to fetch pull request #999: Not Found',
        status: 404,
        hints: [
          'Verify that pull request #999 exists in test-owner/test-repo',
          'Check if you have access to this repository',
          'Ensure the PR number is correct',
        ],
      };

      mockSearchGitHubPullRequestsAPI.mockResolvedValue({
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: mockError.error,
              meta: {
                error: mockError.error,
                status: mockError.status,
                type: 'http',
              },
              hints: mockError.hints,
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [args],
      });

      expect(result.isError).toBe(false); // Bulk operations don't fail on individual errors
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data[0].data.error).toBe(mockError.error);
      expect(response.data[0].data.hints).toEqual(
        expect.arrayContaining(mockError.hints)
      );
    });
  });
});

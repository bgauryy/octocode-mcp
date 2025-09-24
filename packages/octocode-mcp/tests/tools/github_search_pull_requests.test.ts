import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockSearchGitHubPullRequestsAPI = vi.hoisted(() => vi.fn());
const mockGetGitHubToken = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/github/index.js', () => ({
  searchGitHubPullRequestsAPI: mockSearchGitHubPullRequestsAPI,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(),
  withCache: vi.fn(),
}));

vi.mock('../../src/tools/utils/tokenManager.js', () => ({
  getGitHubToken: mockGetGitHubToken,
}));

// Import after mocking
import { registerSearchGitHubPullRequestsTool } from '../../src/tools/github_search_pull_requests.js';

// Helper function to create standard mock response
function createMockPRResponse(overrides: Record<string, unknown> = {}) {
  return {
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
  };
}

describe('GitHub Search Pull Requests Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    registerSearchGitHubPullRequestsTool(mockServer.server);

    // Reset all mocks
    vi.clearAllMocks();

    // Mock token manager to return test token
    mockGetGitHubToken.mockResolvedValue('test-token');

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
        }),
        undefined,
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
    });

    it('should pass authInfo and userContext to GitHub API', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [
          {
            owner: 'auth-test-owner',
            repo: 'auth-test-repo',
            state: 'open',
          },
        ],
      });

      expect(result.isError).toBe(false);

      // Verify the API was called with authInfo and userContext
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledTimes(1);
      const apiCall = mockSearchGitHubPullRequestsAPI.mock.calls[0];

      // Should be called with (queryArgs, authInfo, userContext)
      expect(apiCall).toBeDefined();
      expect(apiCall).toHaveLength(3);
      expect(apiCall?.[1]).toEqual(undefined); // authInfo (now undefined)
      expect(apiCall?.[2]).toEqual({
        userId: 'anonymous',
        userLogin: 'anonymous',
        isEnterpriseMode: false,
        sessionId: undefined,
      }); // userContext
    });

    it('should reject empty queries array', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [],
      });

      expect(result.isError).toBe(true);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('hints:');
      expect(responseText).toContain('Provide at least one search query');
    });

    it('should reject missing queries parameter', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {});

      expect(result.isError).toBe(true);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('hints:');
      expect(responseText).toContain('Provide at least one search query');
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
        }),
        undefined,
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
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
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('hints:');
      expect(responseText).toContain('Use shorter, more focused search terms');
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
        }),
        undefined,
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
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
        expect.objectContaining(searchParams),
        undefined,
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
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
        }),
        undefined,
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
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
        }),
        undefined,
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
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
        }),
        undefined,
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
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
        }),
        undefined,
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
    });

    it('should handle expensive options with warnings', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            getCommitData: true,
            withComments: true,
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test',
          repo: 'repo',
          getCommitData: true,
          withComments: true,
        }),
        undefined,
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
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
        expect.objectContaining(queries[0]),
        undefined,
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining(queries[1]),
        undefined,
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
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
      const responseText = result.content[0]?.text as string;
      // Meta field removed - operation counts no longer tracked in response
      expect(responseText).toContain('data:');
      expect(responseText).toContain('hints:');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValue({
        error: 'API rate limit exceeded',
        status: 429,
        hints: ['Wait before retrying', 'Check rate limit status'],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [{ query: 'test' }],
      });

      expect(result.isError).toBe(false); // Bulk operations don't fail on individual errors
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('error:');
      expect(responseText).toContain('API rate limit exceeded');
    });

    it('should handle network errors', async () => {
      mockSearchGitHubPullRequestsAPI.mockRejectedValue(
        new Error('Network error')
      );

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [{ query: 'test' }],
      });

      expect(result.isError).toBe(false); // Bulk operations don't fail on individual errors
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('error:');
      expect(responseText).toContain('Network error');
    });
  });

  describe('Content Sanitization', () => {
    it('should sanitize GitHub tokens in PR titles and bodies', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValue(
        createMockPRResponse({
          title: 'Fix token leak',
          body: 'Removed token: [REDACTED-GITHUBTOKENS]',
        })
      );

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [{ query: 'token' }],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;

      // Check that the token was sanitized
      expect(responseText).toContain('data:');
      expect(responseText).not.toContain('ghp_');
      expect(responseText).toContain('[REDACTED-GITHUBTOKENS]');
    });

    it('should sanitize OpenAI keys in PR content', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValue(
        createMockPRResponse({
          title: 'Update API integration',
          body: 'Using key: [REDACTED-OPENAIAPIKEY]',
        })
      );

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [{ query: 'api' }],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;

      // Check that the API key was sanitized
      expect(responseText).toContain('data:');
      expect(responseText).not.toContain('T3BlbkFJ');
      expect(responseText).toContain('[REDACTED-OPENAIAPIKEY]');
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
      const responseText = result.content[0]?.text as string;

      // Check that clean content is preserved
      expect(responseText).toContain('data:');
      expect(responseText).toContain(
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

      mockSearchGitHubPullRequestsAPI.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [args],
      });

      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          prNumber: 123,
          id: expect.any(String),
        }),
        undefined,
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('data:');
      expect(responseText).toContain('Test PR');
      expect(responseText).toContain('test-user');
      expect(responseText).toContain('number: 123');
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

      mockSearchGitHubPullRequestsAPI.mockResolvedValue(mockError);

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [args],
      });

      expect(result.isError).toBe(false); // Bulk operations don't fail on individual errors
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('error:');
      expect(responseText).toContain('pull request #999');
      expect(responseText).toContain('hints:');
    });
  });
});

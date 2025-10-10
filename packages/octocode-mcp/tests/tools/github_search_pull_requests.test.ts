import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockSearchGitHubPullRequestsAPI = vi.hoisted(() => vi.fn());
const mockGetGitHubToken = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/github/pullRequestSearch.js', () => ({
  searchGitHubPullRequestsAPI: mockSearchGitHubPullRequestsAPI,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(),
  withCache: vi.fn(),
}));

vi.mock('../../src/tools/utils/tokenManager.js', () => ({
  getGitHubToken: mockGetGitHubToken,
}));

vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
  getGitHubToken: mockGetGitHubToken,
  getServerConfig: vi.fn(() => ({
    version: '1.0.0',
    enableLogging: false,
    betaEnabled: false,
    timeout: 30000,
    maxRetries: 3,
    loggingEnabled: false,
  })),
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
      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [
            {
              owner: 'facebook',
              repo: 'react',
              state: 'open',
            },
          ],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result).toEqual({
        isError: false,
        content: [
          {
            type: 'text',
            text: result.content[0]?.text as string,
          },
        ],
      });

      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'facebook',
          repo: 'react',
          state: 'open',
        }),
        expect.objectContaining({
          token: 'mock-test-token',
        }),
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: 'test-session-id',
        })
      );
    });

    it('should pass authInfo and userContext to GitHub API', async () => {
      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [
            {
              owner: 'auth-test-owner',
              repo: 'auth-test-repo',
              state: 'open',
            },
          ],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false);

      // Verify the API was called with authInfo and userContext
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledTimes(1);
      const apiCall = mockSearchGitHubPullRequestsAPI.mock.calls[0];

      // Should be called with (queryArgs, authInfo, userContext)
      expect(apiCall).toBeDefined();
      expect(apiCall).toHaveLength(3);
      expect(apiCall?.[1]).toEqual(
        expect.objectContaining({ token: 'mock-test-token' })
      ); // authInfo
      expect(apiCall?.[2]).toEqual({
        userId: 'anonymous',
        userLogin: 'anonymous',
        isEnterpriseMode: false,
        sessionId: 'test-session-id',
      }); // userContext
    });

    it('should handle empty queries array gracefully', async () => {
      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      // Empty arrays now return 0 results instead of error
      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('Bulk response with 0 results');
      expect(responseText).toContain('results:');
    });

    it('should handle missing queries parameter gracefully', async () => {
      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {},
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      // Missing parameter now returns 0 results instead of error
      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('Bulk response with 0 results');
      expect(responseText).toContain('results:');
    });

    it('should accept query-based searches', async () => {
      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [
            {
              query: 'bug fix',
            },
          ],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'bug fix',
        }),
        expect.objectContaining({
          token: 'mock-test-token',
        }),
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: 'test-session-id',
        })
      );
    });

    it('should reject overly long queries', async () => {
      const longQuery = 'a'.repeat(300);
      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [
            {
              query: longQuery,
            },
          ],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      // Validation errors now go through bulkOperations flow, so isError is false
      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('1 failed');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain(
        'error: "Query too long. Maximum 256 characters allowed."'
      );
      expect(responseText).toContain('errorStatusHints:');
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful pull request search', async () => {
      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [
            {
              query: 'feature',
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'feature',
          owner: 'test',
          repo: 'repo',
        }),
        expect.objectContaining({
          token: 'mock-test-token',
        }),
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: 'test-session-id',
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

      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [searchParams],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining(searchParams),
        expect.objectContaining({
          token: 'mock-test-token',
        }),
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: 'test-session-id',
        })
      );
    });

    it('should handle array parameters', async () => {
      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [
            {
              owner: ['facebook', 'microsoft'],
              repo: ['react', 'vscode'],
              label: ['bug', 'enhancement'],
            },
          ],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: ['facebook', 'microsoft'],
          repo: ['react', 'vscode'],
          label: ['bug', 'enhancement'],
        }),
        expect.objectContaining({
          token: 'mock-test-token',
        }),
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: 'test-session-id',
        })
      );
    });

    it('should handle boolean filters', async () => {
      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              draft: true,
              merged: false,
            },
          ],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test',
          repo: 'repo',
          draft: true,
          merged: false,
        }),
        expect.objectContaining({
          token: 'mock-test-token',
        }),
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: 'test-session-id',
        })
      );
    });

    it('should handle date range filters', async () => {
      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              created: '>2023-01-01',
              updated: '2023-01-01..2023-12-31',
              closed: '<2023-06-01',
            },
          ],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test',
          repo: 'repo',
          created: '>2023-01-01',
          updated: '2023-01-01..2023-12-31',
          closed: '<2023-06-01',
        }),
        expect.objectContaining({
          token: 'mock-test-token',
        }),
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: 'test-session-id',
        })
      );
    });

    it('should handle numeric range filters', async () => {
      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              comments: '>5',
              reactions: '10..50',
              interactions: '<100',
            },
          ],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test',
          repo: 'repo',
          comments: '>5',
          reactions: '10..50',
          interactions: '<100',
        }),
        expect.objectContaining({
          token: 'mock-test-token',
        }),
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: 'test-session-id',
        })
      );
    });

    it('should handle expensive options with warnings', async () => {
      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              getCommitData: true,
              withComments: true,
            },
          ],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test',
          repo: 'repo',
          getCommitData: true,
          withComments: true,
        }),
        expect.objectContaining({
          token: 'mock-test-token',
        }),
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: 'test-session-id',
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

      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries,
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledTimes(2);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining(queries[0]),
        expect.objectContaining({
          token: 'mock-test-token',
        }),
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: 'test-session-id',
        })
      );
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining(queries[1]),
        expect.objectContaining({
          token: 'mock-test-token',
        }),
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: 'test-session-id',
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

      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries,
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      // New bulk structure
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('errorStatusHints:');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValue({
        error: 'API rate limit exceeded',
        status: 429,
        hints: ['Wait before retrying', 'Check rate limit status'],
      });

      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [{ query: 'test' }],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false); // Bulk operations don't fail on individual errors
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('error:');
      expect(responseText).toContain('API rate limit exceeded');
      expect(responseText).toContain('errorStatusHints:');
    });

    it('should handle network errors', async () => {
      mockSearchGitHubPullRequestsAPI.mockRejectedValue(
        new Error('Network error')
      );

      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [{ query: 'test' }],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false); // Bulk operations don't fail on individual errors
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('error:');
      expect(responseText).toContain('Network error');
      expect(responseText).toContain('errorStatusHints:');
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

      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [{ query: 'token' }],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;

      // Check that the token was sanitized
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
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

      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [{ query: 'api' }],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;

      // Check that the API key was sanitized
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
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

      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [{ query: 'clean' }],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;

      // Check that clean content is preserved
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
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

      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [args],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          prNumber: 123,
        }),
        expect.objectContaining({
          token: 'mock-test-token',
        }),
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: 'test-session-id',
        })
      );
      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
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

      const result = await mockServer.callTool(
        'githubSearchPullRequests',
        {
          queries: [args],
        },
        {
          authInfo: { token: 'mock-test-token' },
          sessionId: 'test-session-id',
        }
      );

      expect(result.isError).toBe(false); // Bulk operations don't fail on individual errors
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('error:');
      expect(responseText).toContain('pull request #999');
      expect(responseText).toContain('errorStatusHints:');
    });
  });
});

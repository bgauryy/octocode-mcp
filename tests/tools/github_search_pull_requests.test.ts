import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockSearchGitHubPullRequestsAPI = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/githubAPI.js', () => ({
  searchGitHubPullRequestsAPI: mockSearchGitHubPullRequestsAPI,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(),
  withCache: vi.fn(),
}));

// Import after mocking
import { registerSearchGitHubPullRequestsTool } from '../../src/mcp/tools/github_search_pull_requests.js';

// Helper function to create standard mock response
function createMockPRResponse(overrides: any = {}) {
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
    registerSearchGitHubPullRequestsTool(mockServer.server, {
      npmEnabled: false,
      ghToken: 'test-token',
    });

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
        owner: 'facebook',
        repo: 'react',
        state: 'open',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'facebook',
          repo: 'react',
          state: 'open',
        }),
        'test-token'
      );
    });

    it('should reject empty parameters', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.hints).toContain(
        'Provide a search query or filters (owner, repo, author, assignee)'
      );
    });

    it('should accept query-based searches', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'bug fix',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'bug fix',
        }),
        'test-token'
      );
    });

    it('should reject overly long queries', async () => {
      const longQuery = 'a'.repeat(300);
      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: longQuery,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.hints).toContain(
        'Use shorter, more focused search terms'
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful pull request search', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'feature',
        owner: 'test',
        repo: 'repo',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'feature',
          owner: 'test',
          repo: 'repo',
        }),
        'test-token'
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
        searchParams
      );

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining(searchParams),
        'test-token'
      );
    });

    it('should handle array parameters', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        owner: ['facebook', 'microsoft'],
        repo: ['react', 'vscode'],
        label: ['bug', 'enhancement'],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: ['facebook', 'microsoft'],
          repo: ['react', 'vscode'],
          label: ['bug', 'enhancement'],
        }),
        'test-token'
      );
    });

    it('should handle boolean filters', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        owner: 'test',
        repo: 'repo',
        draft: true,
        merged: false,
        locked: false,
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
        'test-token'
      );
    });

    it('should handle date range filters', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        owner: 'test',
        repo: 'repo',
        created: '>2023-01-01',
        updated: '2023-01-01..2023-12-31',
        closed: '<2023-06-01',
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
        'test-token'
      );
    });

    it('should handle numeric range filters', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        owner: 'test',
        repo: 'repo',
        comments: '>5',
        reactions: '10..50',
        interactions: '<100',
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
        'test-token'
      );
    });

    it('should handle expensive options with warnings', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        owner: 'test',
        repo: 'repo',
        getCommitData: true,
        withComments: true,
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test',
          repo: 'repo',
          getCommitData: true,
          withComments: true,
        }),
        'test-token'
      );
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
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('API rate limit exceeded');
    });

    it('should handle network errors', async () => {
      mockSearchGitHubPullRequestsAPI.mockRejectedValue(
        new Error('Network error')
      );

      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.hints).toContain(
        'Check your internet connection and retry the request'
      );
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
        query: 'token',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);

      // Check that the token was sanitized
      expect(response.data.pull_requests[0].body).not.toContain('ghp_');
      expect(response.data.pull_requests[0].body).toContain(
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
        query: 'api',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);

      // Check that the API key was sanitized
      expect(response.data.pull_requests[0].body).not.toContain('T3BlbkFJ');
      expect(response.data.pull_requests[0].body).toContain(
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
        query: 'clean',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);

      // Check that clean content is preserved
      expect(response.data.pull_requests[0].body).toBe(
        'This is a normal PR description without sensitive information.'
      );
    });
  });
});

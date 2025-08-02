import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());
const mockSearchGitHubPullRequestsAPI = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

vi.mock('../../src/utils/githubAPI.js', () => ({
  searchGitHubPullRequestsAPI: mockSearchGitHubPullRequestsAPI,
}));

// Import after mocking - only import what exists now
import { registerSearchGitHubPullRequestsTool } from '../../src/mcp/tools/github_search_pull_requests.js';

describe('GitHub Search Pull Requests Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    // Create mock server using the fixture
    mockServer = createMockMcpServer();

    // Clear all mocks
    vi.clearAllMocks();

    // Default cache behavior
    // @ts-expect-error - mockWithCache is not typed
    mockWithCache.mockImplementation(async (key, fn) => await fn());
    mockGenerateCacheKey.mockReturnValue('test-cache-key');

    // Default successful API mock behavior
    mockSearchGitHubPullRequestsAPI.mockResolvedValue({
      isError: false,
      content: [
        {
          text: JSON.stringify({
            results: [
              {
                number: 123,
                title: 'Test PR',
                state: 'open',
                html_url: 'https://github.com/test/repo/pull/123',
                user: { login: 'testuser' },
                created_at: '2023-01-01T00:00:00Z',
                updated_at: '2023-01-01T01:00:00Z',
              },
            ],
            total_count: 1,
          }),
        },
      ],
    });

    // Register tool with API options
    registerSearchGitHubPullRequestsTool(mockServer.server, {
      npmEnabled: false,
    });
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search pull requests tool', () => {
      // Tool is already registered in beforeEach
      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'githubSearchPullRequests',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Parameter Validation', () => {
    it('should reject queries that are too long', async () => {
      const longQuery = 'a'.repeat(300);

      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: longQuery,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text as string).toContain('Query too long');
    });

    it('should require either query or filters', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text as string).toContain(
        'No search query or filters provided'
      );
    });

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
        undefined
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValue({
        isError: true,
        content: [
          {
            text: JSON.stringify({
              error: 'API rate limit exceeded',
              results: [],
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      // The API error is passed through directly in the new implementation
      expect(result.content[0].text as string).toContain(
        'API rate limit exceeded'
      );
    });

    it('should handle API exceptions', async () => {
      mockSearchGitHubPullRequestsAPI.mockRejectedValue(
        new Error('Network error')
      );

      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text as string).toContain('PR search failed');
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful pull request search', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'fix',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'fix',
        }),
        undefined
      );

      const response = JSON.parse(result.content[0].text as string);
      expect(response.results).toHaveLength(1);
      expect(response.results[0].title).toBe('Test PR');
    });

    it('should pass through all search parameters', async () => {
      const searchParams = {
        query: 'bug fix',
        owner: 'facebook',
        repo: 'react',
        state: 'closed' as const,
        author: 'testuser',
        limit: 50,
        sort: 'updated' as const,
        order: 'asc' as const,
      };

      await mockServer.callTool('githubSearchPullRequests', searchParams);

      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining(searchParams),
        undefined
      );
    });

    it('should handle array parameters', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        owner: ['org1', 'org2'],
        repo: ['repo1', 'repo2'],
        label: ['bug', 'feature'],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: ['org1', 'org2'],
          repo: ['repo1', 'repo2'],
          label: ['bug', 'feature'],
        }),
        undefined
      );
    });

    it('should handle boolean filters', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'test',
        draft: true,
        merged: false,
        locked: false,
        'no-assignee': true,
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'test',
          draft: true,
          merged: false,
          locked: false,
          'no-assignee': true,
        }),
        undefined
      );
    });

    it('should handle date range filters', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'test',
        created: '>2023-01-01',
        updated: '2023-01-01..2023-12-31',
        'merged-at': '<2023-06-01',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'test',
          created: '>2023-01-01',
          updated: '2023-01-01..2023-12-31',
          'merged-at': '<2023-06-01',
        }),
        undefined
      );
    });

    it('should handle numeric range filters', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'test',
        comments: '>10',
        reactions: '5..50',
        interactions: 100,
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'test',
          comments: '>10',
          reactions: '5..50',
          interactions: 100,
        }),
        undefined
      );
    });

    it('should handle expensive options with warnings', async () => {
      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'test',
        getCommitData: true,
        withComments: true,
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'test',
          getCommitData: true,
          withComments: true,
        }),
        undefined
      );
    });
  });

  describe('Content Sanitization', () => {
    it('should sanitize GitHub tokens in PR titles and bodies', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              results: [
                {
                  number: 123,
                  title: 'Fix auth with token [REDACTED-GITHUBTOKENS]',
                  body: 'Updated token: [REDACTED-GITHUBTOKENS]',
                  html_url: 'https://github.com/test/repo/pull/123',
                  user: { login: 'testuser' },
                  created_at: '2023-01-01T00:00:00Z',
                },
              ],
              total_count: 1,
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'token',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);

      expect(response.results[0].title).not.toContain('ghp_1234567890abcdef');
      expect(response.results[0].body).not.toContain('ghp_abcdef1234567890');
      expect(response.results[0].title).toContain('[REDACTED-GITHUBTOKENS]');
      expect(response.results[0].body).toContain('[REDACTED-GITHUBTOKENS]');
    });

    it('should sanitize OpenAI keys in PR content', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              results: [
                {
                  number: 456,
                  title: 'Add OpenAI integration',
                  body: 'API key: [REDACTED-OPENAIAPIKEY]',
                  html_url: 'https://github.com/test/repo/pull/456',
                  user: { login: 'testuser' },
                  created_at: '2023-01-01T00:00:00Z',
                },
              ],
              total_count: 1,
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'openai',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);

      expect(response.results[0].body).not.toContain('sk-1234567890abcdef');
      expect(response.results[0].body).toContain('[REDACTED-OPENAIAPIKEY]');
    });

    it('should handle PRs with no sensitive content', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              results: [
                {
                  number: 789,
                  title: 'Update README',
                  body: 'Simple documentation update',
                  html_url: 'https://github.com/test/repo/pull/789',
                  user: { login: 'testuser' },
                  created_at: '2023-01-01T00:00:00Z',
                },
              ],
              total_count: 1,
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'readme',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);

      expect(response.results[0].title).toBe('Update README');
      expect(response.results[0].body).toBe('Simple documentation update');
    });
  });
});

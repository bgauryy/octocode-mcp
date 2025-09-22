import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockSearchGitHubCommitsAPI = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());
const mockGetGitHubToken = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/github/index.js', () => ({
  searchGitHubCommitsAPI: mockSearchGitHubCommitsAPI,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

vi.mock('../../src/tools/utils/tokenManager.js', () => ({
  getGitHubToken: mockGetGitHubToken,
}));

// Import after mocking
import { registerSearchGitHubCommitsTool } from '../../src/tools/github_search_commits.js';

describe('GitHub Search Commits Tool', () => {
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

    // Mock token manager to return test token
    mockGetGitHubToken.mockResolvedValue('test-token');

    // Default successful API mock behavior - return GitHubCommitSearchResult
    mockSearchGitHubCommitsAPI.mockResolvedValue({
      commits: [
        {
          sha: 'abc123',
          commit: {
            message: 'Test commit',
            author: {
              name: 'testuser',
              email: 'test@example.com',
              date: '2023-01-01T00:00:00Z',
            },
            committer: {
              name: 'testuser',
              email: 'test@example.com',
              date: '2023-01-01T00:00:00Z',
            },
          },
          author: {
            login: 'testuser',
            id: '12345',
            type: 'User',
            url: 'https://github.com/testuser',
          },
          repository: {
            name: 'test-repo',
            fullName: 'test/test-repo',
            url: 'https://github.com/test/test-repo',
          },
          url: 'https://github.com/test/test-repo/commit/abc123',
        },
      ],
      total_count: 1,
      incomplete_results: false,
    });

    // Register tool with API options
    registerSearchGitHubCommitsTool(mockServer.server);
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search commits tool', () => {
      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'githubSearchCommits',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Parameter Validation', () => {
    it('should require at least one search parameter', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.hints).toBeDefined();
      expect(response.hints).toContain(
        'Provide at least one commit search query with search terms or filters'
      );
    });

    it('should validate queryTerms array', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            queryTerms: [],
          },
        ],
      });

      expect(result.isError).toBe(false); // Bulk operations don't fail at top level
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data[0].data.error).toContain(
        'At least one search parameter or filter is required'
      );
      expect(response.data[0].data.hints).toContain(
        'Provide search terms (queryTerms) or filters (author, hash, dates)'
      );
    });

    it('should accept filter-only searches', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            author: 'testuser',
            owner: 'facebook',
            repo: 'react',
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          author: 'testuser',
          owner: 'facebook',
          repo: 'react',
        }),
        undefined,
        expect.objectContaining({
          isEnterpriseMode: false,
          userId: 'anonymous',
          userLogin: 'anonymous',
        })
      );
    });
  });

  describe('Query Types', () => {
    it('should handle multiple queryTerms (AND logic)', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            queryTerms: ['readme', 'typo'],
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          queryTerms: ['readme', 'typo'],
        }),
        undefined,
        expect.objectContaining({
          isEnterpriseMode: false,
          userId: 'anonymous',
          userLogin: 'anonymous',
        })
      );
    });

    it('should handle orTerms (OR logic)', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            orTerms: ['fix', 'bug', 'parser'],
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          orTerms: ['fix', 'bug', 'parser'],
        }),
        undefined,
        expect.objectContaining({
          isEnterpriseMode: false,
          userId: 'anonymous',
          userLogin: 'anonymous',
        })
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful commit search', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            queryTerms: ['fix'],
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          queryTerms: ['fix'],
        }),
        undefined,
        expect.objectContaining({
          isEnterpriseMode: false,
          userId: 'anonymous',
          userLogin: 'anonymous',
        })
      );

      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data[0].data.commits).toHaveLength(1);
      expect(response.data[0].data.commits[0].commit.message).toBe(
        'Test commit'
      );
    });

    it('should handle no results found', async () => {
      mockSearchGitHubCommitsAPI.mockResolvedValue({
        commits: [],
        total_count: 0,
        incomplete_results: false,
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            queryTerms: ['nonexistent'],
          },
        ],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data[0].data.commits).toHaveLength(0);
    });

    it('should handle search errors', async () => {
      mockSearchGitHubCommitsAPI.mockResolvedValue({
        error: 'API error',
        type: 'http',
        status: 500,
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            queryTerms: ['test'],
          },
        ],
      });

      expect(result.isError).toBe(false); // Bulk operations don't fail at top level
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data[0].data.error).toContain('API error');
    });

    it('should handle API exceptions', async () => {
      mockSearchGitHubCommitsAPI.mockRejectedValue(new Error('Network error'));

      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            queryTerms: ['test'],
          },
        ],
      });

      expect(result.isError).toBe(false); // Bulk operations don't fail at top level
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data[0].data.error).toContain('Failed to search commits');
    });

    it('should handle getChangesContent parameter', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            queryTerms: ['fix'],
            owner: 'owner',
            repo: 'repo',
            getChangesContent: true,
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          queryTerms: ['fix'],
          owner: 'owner',
          repo: 'repo',
          getChangesContent: true,
        }),
        undefined,
        expect.objectContaining({
          isEnterpriseMode: false,
          userId: 'anonymous',
          userLogin: 'anonymous',
        })
      );
    });

    it('should pass authInfo and userContext to GitHub API', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            queryTerms: ['auth-test'],
            owner: 'test-owner',
            repo: 'test-repo',
          },
        ],
      });

      expect(result.isError).toBe(false);

      // Verify the API was called with authInfo and userContext
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledTimes(1);
      const apiCall = mockSearchGitHubCommitsAPI.mock.calls[0];

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

    it('should handle filter-only search without query', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            author: 'testuser',
            'committer-date': '>2023-01-01',
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          author: 'testuser',
          'committer-date': '>2023-01-01',
        }),
        undefined,
        expect.objectContaining({
          isEnterpriseMode: false,
          userId: 'anonymous',
          userLogin: 'anonymous',
        })
      );
    });

    it('should handle date-based filter without query', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            'author-date': '>2023-01-01',
            owner: 'facebook',
            repo: 'react',
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          'author-date': '>2023-01-01',
          owner: 'facebook',
          repo: 'react',
        }),
        undefined,
        expect.objectContaining({
          isEnterpriseMode: false,
          userId: 'anonymous',
          userLogin: 'anonymous',
        })
      );
    });

    it('should handle hash-based filter without query', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            hash: 'abc123def456',
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          hash: 'abc123def456',
        }),
        undefined,
        expect.objectContaining({
          isEnterpriseMode: false,
          userId: 'anonymous',
          userLogin: 'anonymous',
        })
      );
    });

    it('should handle author-name filter without query', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            'author-name': 'John Doe',
            owner: 'facebook',
            repo: 'react',
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          'author-name': 'John Doe',
          owner: 'facebook',
          repo: 'react',
        }),
        undefined,
        expect.objectContaining({
          isEnterpriseMode: false,
          userId: 'anonymous',
          userLogin: 'anonymous',
        })
      );
    });
  });

  describe('Content Sanitization', () => {
    it('should sanitize GitHub tokens from commit messages', async () => {
      mockSearchGitHubCommitsAPI.mockResolvedValue({
        commits: [
          {
            sha: 'abc123',
            commit: {
              message: 'Fix auth with token [REDACTED-GITHUBTOKENS]',
              author: {
                name: 'testuser',
                email: 'test@example.com',
                date: '2023-01-01T00:00:00Z',
              },
              committer: {
                name: 'testuser',
                email: 'test@example.com',
                date: '2023-01-01T00:00:00Z',
              },
            },
            author: {
              login: 'testuser',
              id: '12345',
              type: 'User',
              url: 'https://github.com/testuser',
            },
            repository: {
              name: 'test-repo',
              fullName: 'test/test-repo',
              url: 'https://github.com/test/test-repo',
            },
            url: 'https://github.com/test/test-repo/commit/abc123',
          },
        ],
        total_count: 1,
        incomplete_results: false,
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            queryTerms: ['token'],
          },
        ],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data[0].data.commits[0].commit.message).not.toContain(
        'ghp_'
      );
      expect(response.data[0].data.commits[0].commit.message).toContain(
        '[REDACTED-GITHUBTOKENS]'
      );
    });

    it('should sanitize API keys from commit messages', async () => {
      mockSearchGitHubCommitsAPI.mockResolvedValue({
        commits: [
          {
            sha: 'def456',
            commit: {
              message: 'Update API key: [REDACTED-OPENAIAPIKEY]',
              author: {
                name: 'developer',
                email: 'dev@example.com',
                date: '2023-01-02T00:00:00Z',
              },
              committer: {
                name: 'developer',
                email: 'dev@example.com',
                date: '2023-01-02T00:00:00Z',
              },
            },
            author: {
              login: 'developer',
              id: '67890',
              type: 'User',
              url: 'https://github.com/developer',
            },
            repository: {
              name: 'test-repo',
              fullName: 'test/test-repo',
              url: 'https://github.com/test/test-repo',
            },
            url: 'https://github.com/test/test-repo/commit/def456',
          },
        ],
        total_count: 1,
        incomplete_results: false,
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            queryTerms: ['api', 'key'],
          },
        ],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      const commitMessage = response.data[0].data.commits[0].commit.message;
      expect(commitMessage).not.toContain('sk-');
      expect(commitMessage).toContain('[REDACTED-OPENAIAPIKEY]');
    });

    it('should preserve clean commit content without secrets', async () => {
      mockSearchGitHubCommitsAPI.mockResolvedValue({
        commits: [
          {
            sha: 'clean123',
            commit: {
              message: 'Add user profile feature',
              author: {
                name: 'developer',
                email: 'dev@example.com',
                date: '2023-01-03T00:00:00Z',
              },
              committer: {
                name: 'developer',
                email: 'dev@example.com',
                date: '2023-01-03T00:00:00Z',
              },
            },
            author: {
              login: 'developer',
              id: '22222',
              type: 'User',
              url: 'https://github.com/developer',
            },
            repository: {
              name: 'test-repo',
              fullName: 'test/test-repo',
              url: 'https://github.com/test/test-repo',
            },
            url: 'https://github.com/test/test-repo/commit/clean123',
          },
        ],
        total_count: 1,
        incomplete_results: false,
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        queries: [
          {
            queryTerms: ['profile'],
          },
        ],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      expect(response.data[0].data.commits[0].commit.message).toBe(
        'Add user profile feature'
      );
    });
  });
});

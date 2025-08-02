import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockSearchGitHubCommitsAPI = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/githubAPI.js', () => ({
  searchGitHubCommitsAPI: mockSearchGitHubCommitsAPI,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

// Import after mocking
import { registerGitHubSearchCommitsTool } from '../../src/mcp/tools/github_search_commits.js';

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

    // Default successful API mock behavior
    mockSearchGitHubCommitsAPI.mockResolvedValue({
      isError: false,
      content: [
        {
          text: JSON.stringify({
            commits: [
              {
                sha: 'abc123',
                message: 'Test commit',
                author: 'testuser',
                date: '01/01/23',
                url: 'abc123',
              },
            ],
            total_count: 1,
          }),
        },
      ],
    });

    // Register tool with API options
    registerGitHubSearchCommitsTool(mockServer.server, {
      npmEnabled: false,
    });
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
      expect(result.content[0].text as string).toContain(
        'At least one search parameter required'
      );
    });

    it('should not allow exactQuery with queryTerms', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'bug fix',
        queryTerms: ['bug', 'fix'],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text as string).toContain(
        'exactQuery cannot be combined with queryTerms'
      );
    });

    it('should accept filter-only searches', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        author: 'testuser',
        owner: 'facebook',
        repo: 'react',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          author: 'testuser',
          owner: 'facebook',
          repo: 'react',
        }),
        undefined
      );
    });
  });

  describe('Query Types', () => {
    it('should handle multiple queryTerms (AND logic)', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        queryTerms: ['readme', 'typo'],
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          queryTerms: ['readme', 'typo'],
        }),
        undefined
      );
    });

    it('should handle exactQuery (phrase search)', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'fix bug in parser',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          exactQuery: 'fix bug in parser',
        }),
        undefined
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful commit search', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'fix',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          exactQuery: 'fix',
        }),
        undefined
      );

      const response = JSON.parse(result.content[0].text as string);
      expect(response.commits).toHaveLength(1);
      expect(response.commits[0].message).toBe('Test commit');
    });

    it('should handle no results found', async () => {
      mockSearchGitHubCommitsAPI.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              commits: [],
              total_count: 0,
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'nonexistent',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.commits).toHaveLength(0);
    });

    it('should handle search errors', async () => {
      mockSearchGitHubCommitsAPI.mockResolvedValue({
        isError: true,
        content: [{ text: JSON.stringify({ error: 'API error' }) }],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text as string).toContain('API error');
    });

    it('should handle API exceptions', async () => {
      mockSearchGitHubCommitsAPI.mockRejectedValue(new Error('Network error'));

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text as string).toContain(
        'Commit search failed'
      );
    });

    it('should handle getChangesContent parameter', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'fix',
        owner: 'owner',
        repo: 'repo',
        getChangesContent: true,
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          exactQuery: 'fix',
          owner: 'owner',
          repo: 'repo',
          getChangesContent: true,
        }),
        undefined
      );
    });

    it('should handle filter-only search without query', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        author: 'testuser',
        'committer-date': '>2023-01-01',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          author: 'testuser',
          'committer-date': '>2023-01-01',
        }),
        undefined
      );
    });

    it('should handle date-based filter without query', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        'author-date': '>2023-01-01',
        owner: 'facebook',
        repo: 'react',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          'author-date': '>2023-01-01',
          owner: 'facebook',
          repo: 'react',
        }),
        undefined
      );
    });

    it('should handle hash-based filter without query', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        hash: 'abc123def456',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          hash: 'abc123def456',
        }),
        undefined
      );
    });

    it('should handle author-name filter without query', async () => {
      const result = await mockServer.callTool('githubSearchCommits', {
        'author-name': 'John Doe',
        owner: 'facebook',
        repo: 'react',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubCommitsAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          'author-name': 'John Doe',
          owner: 'facebook',
          repo: 'react',
        }),
        undefined
      );
    });
  });

  describe('Content Sanitization', () => {
    it('should sanitize GitHub tokens from commit messages', async () => {
      mockSearchGitHubCommitsAPI.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              commits: [
                {
                  sha: 'abc123',
                  message: 'Fix auth with token [REDACTED-GITHUBTOKENS]',
                  author: 'testuser',
                  date: '01/01/23',
                  url: 'abc123',
                },
              ],
              total_count: 1,
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'token',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.commits[0].message).not.toContain('ghp_');
      expect(response.commits[0].message).toContain('[REDACTED-GITHUBTOKENS]');
    });

    it('should sanitize API keys from commit messages', async () => {
      mockSearchGitHubCommitsAPI.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              commits: [
                {
                  sha: 'def456',
                  message: 'Update API key: [REDACTED-OPENAIAPIKEY]',
                  author: 'developer',
                  date: '02/01/23',
                  url: 'def456',
                },
              ],
              total_count: 1,
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'api key',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      const commitMessage = response.commits[0].message;
      expect(commitMessage).not.toContain('sk-');
      expect(commitMessage).toContain('[REDACTED-OPENAIAPIKEY]');
    });

    it('should preserve clean commit content without secrets', async () => {
      mockSearchGitHubCommitsAPI.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              commits: [
                {
                  sha: 'clean123',
                  message: 'Add user profile feature',
                  author: 'developer',
                  date: '03/01/23',
                  url: 'clean123',
                },
              ],
              total_count: 1,
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        exactQuery: 'profile',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.commits[0].message).toBe('Add user profile feature');
    });
  });
});

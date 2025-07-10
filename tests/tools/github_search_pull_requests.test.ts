import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search pull requests tool', () => {
      registerSearchGitHubPullRequestsTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'githubSearchPullRequests',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful pull request search', async () => {
      registerSearchGitHubPullRequestsTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify({
          total_count: 1,
          items: [
            {
              number: 123,
              title: 'Fix bug in component',
              state: 'open',
              html_url: 'https://github.com/owner/repo/pull/123',
              user: { login: 'testuser' },
              repository: {
                full_name: 'owner/repo',
                html_url: 'https://github.com/owner/repo',
              },
            },
          ],
        }),
        command: 'gh search prs fix --limit=25 --json',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'fix',
      });

      expect(result.isError).toBe(true);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        ['search/issues?q=fix%20type%3Apr&per_page=30'],
        { cache: false }
      );
    });

    it('should handle no results found', async () => {
      registerSearchGitHubPullRequestsTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify({
          total_count: 0,
          items: [],
        }),
        command: 'gh search prs nonexistent --limit=25 --json',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'nonexistent',
      });

      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('should handle search errors', async () => {
      registerSearchGitHubPullRequestsTool(mockServer.server);

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Search failed' }],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Search failed');
    });

    it('should handle getCommitData parameter for repo-specific searches', async () => {
      registerSearchGitHubPullRequestsTool(mockServer.server);

      const mockPRListResponse = {
        result: [
          {
            number: 123,
            title: 'Fix bug in component',
            state: 'open',
            author: { login: 'testuser' },
            headRefOid: 'abc123',
            baseRefOid: 'def456',
            url: 'https://github.com/owner/repo/pull/123',
            createdAt: '2023-01-01T00:00:00Z',
            updatedAt: '2023-01-02T00:00:00Z',
            comments: 5,
            isDraft: false,
            labels: [],
          },
        ],
        command: 'gh pr list --repo owner/repo --json ...',
        type: 'github',
      };

      const mockCommitsResponse = {
        result: {
          commits: [
            {
              oid: 'abc123',
              messageHeadline: 'Fix bug in component',
              authors: [{ login: 'testuser', name: 'Test User' }],
              authoredDate: '2023-01-01T00:00:00Z',
            },
          ],
        },
        command: 'gh pr view 123 --json commits --repo owner/repo',
        type: 'github',
      };

      const mockCommitDetailResponse = {
        result: {
          files: [
            {
              filename: 'src/component.js',
              status: 'modified',
              additions: 10,
              deletions: 5,
              changes: 15,
              patch: '@@ -1,5 +1,10 @@\n console.log("hello");',
            },
          ],
          stats: {
            additions: 10,
            deletions: 5,
            total: 15,
          },
        },
        command: 'gh api repos/owner/repo/commits/abc123',
        type: 'github',
      };

      // Mock PR list call
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockPRListResponse) }],
      });

      // Mock commits fetch call
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockCommitsResponse) }],
      });

      // Mock commit detail call
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockCommitDetailResponse) }],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'fix',
        owner: 'owner',
        repo: 'repo',
        getCommitData: true,
      });

      expect(result.isError).toBe(false);

      // Should call PR list first
      expect(mockExecuteGitHubCommand).toHaveBeenNthCalledWith(
        1,
        'pr',
        expect.arrayContaining(['list', '--repo', 'owner/repo']),
        { cache: false }
      );

      // Should call commits API second
      expect(mockExecuteGitHubCommand).toHaveBeenNthCalledWith(
        2,
        'pr',
        expect.arrayContaining([
          'view',
          '123',
          '--json',
          'commits',
          '--repo',
          'owner/repo',
        ]),
        { cache: false }
      );

      // Should call commit detail API third
      expect(mockExecuteGitHubCommand).toHaveBeenNthCalledWith(
        3,
        'api',
        ['repos/owner/repo/commits/abc123'],
        { cache: false }
      );

      // Result should contain commit information
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].commits).toBeDefined();
      expect(data.results[0].commits.total_count).toBe(1);
      expect(data.results[0].commits.commits[0].sha).toBe('abc123');
      expect(data.results[0].commits.commits[0].message).toBe(
        'Fix bug in component'
      );
      expect(data.results[0].commits.commits[0].diff).toBeDefined();
      expect(data.results[0].commits.commits[0].diff.changed_files).toBe(1);
      expect(data.results[0].commits.commits[0].diff.files[0].filename).toBe(
        'src/component.js'
      );
    });
  });
});

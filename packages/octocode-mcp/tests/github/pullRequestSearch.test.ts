import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Create hoisted mocks
const mockGetOctokit = vi.hoisted(() => vi.fn());
const mockHandleGitHubAPIError = vi.hoisted(() => vi.fn());
const mockBuildPullRequestSearchQuery = vi.hoisted(() => vi.fn());
const mockShouldUseSearchForPRs = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithDataCache = vi.hoisted(() => vi.fn());
const mockContentSanitizer = vi.hoisted(() => ({
  sanitizeContent: vi.fn(),
}));

// Set up mocks
vi.mock('../../src/github/client.js', () => ({
  getOctokit: mockGetOctokit,
  OctokitWithThrottling: class MockOctokit {},
}));

vi.mock('../../src/github/errors.js', () => ({
  handleGitHubAPIError: mockHandleGitHubAPIError,
}));

vi.mock('../../src/github/queryBuilders.js', () => ({
  buildPullRequestSearchQuery: mockBuildPullRequestSearchQuery,
  shouldUseSearchForPRs: mockShouldUseSearchForPRs,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withDataCache: mockWithDataCache,
}));

vi.mock('../../src/security/contentSanitizer.js', () => ({
  ContentSanitizer: mockContentSanitizer,
}));

// Import after mocks are set up
import {
  searchGitHubPullRequestsAPI,
  fetchGitHubPullRequestByNumberAPI,
  transformPullRequestItemFromREST,
} from '../../src/github/pullRequestSearch.js';

describe('Pull Request Search', () => {
  let mockOctokit: {
    rest: {
      search: { issuesAndPullRequests: ReturnType<typeof vi.fn> };
      pulls: {
        list: ReturnType<typeof vi.fn>;
        get: ReturnType<typeof vi.fn>;
        listFiles: ReturnType<typeof vi.fn>;
      };
      issues: { listComments: ReturnType<typeof vi.fn> };
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock Octokit instance
    mockOctokit = {
      rest: {
        search: { issuesAndPullRequests: vi.fn() },
        pulls: {
          list: vi.fn(),
          get: vi.fn(),
          listFiles: vi.fn(),
        },
        issues: { listComments: vi.fn() },
      },
    };
    mockGetOctokit.mockResolvedValue(mockOctokit);

    // Setup default cache behavior - execute the operation directly
    mockWithDataCache.mockImplementation(
      async (_cacheKey: string, operation: () => Promise<unknown>) => {
        return await operation();
      }
    );

    // Setup default error handler
    mockHandleGitHubAPIError.mockReturnValue({
      error: 'API Error',
      type: 'http',
    });

    // Setup default content sanitizer
    mockContentSanitizer.sanitizeContent.mockImplementation(
      (content: string) => ({
        content,
        warnings: [],
      })
    );

    // Setup default query builder
    mockBuildPullRequestSearchQuery.mockReturnValue(
      'repo:test/test is:pr state:open'
    );
    mockShouldUseSearchForPRs.mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('searchGitHubPullRequestsAPI', () => {
    it('should fetch specific PR by number when prNumber is provided', async () => {
      const mockPR = {
        number: 123,
        title: 'Test PR',
        state: 'open',
        draft: false,
        user: { login: 'testuser' },
        labels: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        closed_at: null,
        html_url: 'https://github.com/test/repo/pull/123',
        head: { ref: 'feature', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        body: 'Test description',
      };

      mockOctokit.rest.pulls.get.mockResolvedValue({ data: mockPR });

      const result = await searchGitHubPullRequestsAPI({
        owner: 'test',
        repo: 'repo',
        prNumber: 123,
      });

      expect(result.pull_requests).toHaveLength(1);
      expect(result.pull_requests?.[0]?.number).toBe(123);
      expect(result.total_count).toBe(1);
      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        pull_number: 123,
      });
    });

    it('should use REST API for simple repo searches', async () => {
      mockShouldUseSearchForPRs.mockReturnValue(false);

      const mockPRs = [
        {
          number: 1,
          title: 'PR 1',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          labels: [],
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
          closed_at: null,
          html_url: 'https://github.com/test/repo/pull/1',
          head: { ref: 'feature1', sha: 'abc1' },
          base: { ref: 'main', sha: 'def1' },
          body: 'Description 1',
        },
      ];

      mockOctokit.rest.pulls.list.mockResolvedValue({ data: mockPRs });

      const result = await searchGitHubPullRequestsAPI({
        owner: 'test',
        repo: 'repo',
        state: 'open',
      });

      expect(result.pull_requests).toHaveLength(1);
      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        state: 'open',
        per_page: 30,
        sort: 'created',
        direction: 'desc',
      });
    });

    it('should use Search API for complex queries', async () => {
      mockShouldUseSearchForPRs.mockReturnValue(true);
      mockBuildPullRequestSearchQuery.mockReturnValue(
        'repo:test/repo is:pr bug'
      );

      const mockSearchResult = {
        total_count: 1,
        incomplete_results: false,
        items: [
          {
            number: 2,
            title: 'Bug fix',
            state: 'open',
            draft: false,
            user: { login: 'user2' },
            labels: [{ name: 'bug' }],
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
            closed_at: null,
            html_url: 'https://github.com/test/repo/pull/2',
            body: 'Bug fix description',
            pull_request: {},
          },
        ],
      };

      mockOctokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: mockSearchResult,
      });

      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          number: 2,
          head: { ref: 'bugfix', sha: 'abc2' },
          base: { ref: 'main', sha: 'def2' },
          draft: false,
        },
      });

      const result = await searchGitHubPullRequestsAPI({
        owner: 'test',
        repo: 'repo',
        query: 'bug',
      });

      expect(result.pull_requests).toHaveLength(1);
      expect(result.total_count).toBe(1);
      expect(mockOctokit.rest.search.issuesAndPullRequests).toHaveBeenCalled();
    });

    it('should return error when no valid search parameters provided', async () => {
      mockBuildPullRequestSearchQuery.mockReturnValue(null);
      mockShouldUseSearchForPRs.mockReturnValue(true);

      const result = await searchGitHubPullRequestsAPI({});

      expect(result.error).toContain('No valid search parameters provided');
      expect(result.pull_requests).toHaveLength(0);
    });

    it('should handle API errors gracefully', async () => {
      mockOctokit.rest.pulls.list.mockRejectedValue(new Error('API Error'));
      mockHandleGitHubAPIError.mockReturnValue({
        error: 'Failed to fetch PRs',
        type: 'http',
      });

      const result = await searchGitHubPullRequestsAPI({
        owner: 'test',
        repo: 'repo',
      });

      expect(result.error).toContain('Pull request list failed');
      expect(result.pull_requests).toHaveLength(0);
    });

    it('should fetch file changes when withContent is true', async () => {
      const mockPR = {
        number: 123,
        title: 'Test PR',
        state: 'open',
        draft: false,
        user: { login: 'testuser' },
        labels: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        closed_at: null,
        html_url: 'https://github.com/test/repo/pull/123',
        head: { ref: 'feature', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        body: 'Test description',
      };

      const mockFiles = [
        {
          filename: 'test.ts',
          status: 'modified',
          additions: 10,
          deletions: 5,
          changes: 15,
          patch: '@@ -1,5 +1,10 @@...',
        },
      ];

      mockOctokit.rest.pulls.get.mockResolvedValue({ data: mockPR });
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({ data: mockFiles });

      const result = await searchGitHubPullRequestsAPI({
        owner: 'test',
        repo: 'repo',
        prNumber: 123,
        withContent: true,
      });

      expect(result.pull_requests).toHaveLength(1);
      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        pull_number: 123,
      });
    });

    it('should fetch comments when withComments is true', async () => {
      const mockPR = {
        number: 123,
        title: 'Test PR',
        state: 'open',
        draft: false,
        user: { login: 'testuser' },
        labels: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        closed_at: null,
        html_url: 'https://github.com/test/repo/pull/123',
        head: { ref: 'feature', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        body: 'Test description',
      };

      const mockComments = [
        {
          id: 1,
          user: { login: 'commenter1' },
          body: 'Great work!',
          created_at: '2023-01-03T00:00:00Z',
          updated_at: '2023-01-03T00:00:00Z',
        },
      ];

      mockOctokit.rest.pulls.get.mockResolvedValue({ data: mockPR });
      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: mockComments,
      });

      const result = await searchGitHubPullRequestsAPI({
        owner: 'test',
        repo: 'repo',
        prNumber: 123,
        withComments: true,
      });

      expect(result.pull_requests).toHaveLength(1);
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        issue_number: 123,
      });
    });

    it('should sanitize PR title and body', async () => {
      mockShouldUseSearchForPRs.mockReturnValue(false);

      const mockPR = {
        number: 123,
        title: 'Test PR with secret',
        state: 'open',
        draft: false,
        user: { login: 'testuser' },
        labels: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        closed_at: null,
        html_url: 'https://github.com/test/repo/pull/123',
        head: { ref: 'feature', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        body: 'Description with token: ghp_secrettoken123',
      };

      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [mockPR] });

      mockContentSanitizer.sanitizeContent.mockImplementation(
        (content: string) => ({
          content: content.replace('ghp_secrettoken123', '[REDACTED]'),
          warnings: ['Secret detected'],
        })
      );

      await searchGitHubPullRequestsAPI({
        owner: 'test',
        repo: 'repo',
      });

      expect(mockContentSanitizer.sanitizeContent).toHaveBeenCalledWith(
        'Test PR with secret'
      );
      expect(mockContentSanitizer.sanitizeContent).toHaveBeenCalledWith(
        'Description with token: ghp_secrettoken123'
      );
    });

    it('should handle REST API with head/base filters', async () => {
      mockShouldUseSearchForPRs.mockReturnValue(false);

      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      await searchGitHubPullRequestsAPI({
        owner: 'test',
        repo: 'repo',
        head: 'feature-branch',
        base: 'main',
      });

      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith(
        expect.objectContaining({
          head: 'feature-branch',
          base: 'main',
        })
      );
    });

    it('should use correct sort parameter for Search API', async () => {
      mockShouldUseSearchForPRs.mockReturnValue(true);
      mockBuildPullRequestSearchQuery.mockReturnValue('repo:test/repo is:pr');

      mockOctokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: {
          total_count: 0,
          incomplete_results: false,
          items: [],
        },
      });

      await searchGitHubPullRequestsAPI({
        owner: 'test',
        repo: 'repo',
        sort: 'updated',
      });

      expect(
        mockOctokit.rest.search.issuesAndPullRequests
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: 'updated',
        })
      );
    });

    it('should filter out non-PR items from search results', async () => {
      mockShouldUseSearchForPRs.mockReturnValue(true);
      mockBuildPullRequestSearchQuery.mockReturnValue('repo:test/repo is:pr');

      const mockSearchResult = {
        total_count: 2,
        incomplete_results: false,
        items: [
          {
            number: 1,
            title: 'Issue 1',
            state: 'open',
            user: { login: 'user1' },
            labels: [],
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
            closed_at: null,
            html_url: 'https://github.com/test/repo/issues/1',
            body: 'Issue description',
            // No pull_request field - this is an issue, not a PR
          },
          {
            number: 2,
            title: 'PR 2',
            state: 'open',
            user: { login: 'user2' },
            labels: [],
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
            closed_at: null,
            html_url: 'https://github.com/test/repo/pull/2',
            body: 'PR description',
            pull_request: {}, // This is a PR
          },
        ],
      };

      mockOctokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: mockSearchResult,
      });

      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          number: 2,
          head: { ref: 'feature', sha: 'abc' },
          base: { ref: 'main', sha: 'def' },
          draft: false,
        },
      });

      const result = await searchGitHubPullRequestsAPI({
        owner: 'test',
        repo: 'repo',
      });

      // Should only include the PR, not the issue
      expect(result.pull_requests).toHaveLength(1);
      expect(result.pull_requests?.[0]?.number).toBe(2);
    });

    it('should handle limit parameter correctly', async () => {
      mockShouldUseSearchForPRs.mockReturnValue(false);
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      await searchGitHubPullRequestsAPI({
        owner: 'test',
        repo: 'repo',
        limit: 50,
      });

      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith(
        expect.objectContaining({
          per_page: 50,
        })
      );
    });

    it('should respect max limit of 100', async () => {
      mockShouldUseSearchForPRs.mockReturnValue(false);
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      await searchGitHubPullRequestsAPI({
        owner: 'test',
        repo: 'repo',
        limit: 500, // Should be capped at 100
      });

      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith(
        expect.objectContaining({
          per_page: 100, // Capped at 100
        })
      );
    });
  });

  describe('fetchGitHubPullRequestByNumberAPI', () => {
    it('should fetch specific PR with caching', async () => {
      const mockPR = {
        number: 456,
        title: 'Specific PR',
        state: 'closed',
        draft: false,
        merged_at: '2023-01-10T00:00:00Z',
        user: { login: 'testuser' },
        labels: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        closed_at: '2023-01-10T00:00:00Z',
        html_url: 'https://github.com/test/repo/pull/456',
        head: { ref: 'feature', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        body: 'PR description',
      };

      mockOctokit.rest.pulls.get.mockResolvedValue({ data: mockPR });

      const result = await fetchGitHubPullRequestByNumberAPI({
        owner: 'test',
        repo: 'repo',
        prNumber: 456,
      });

      expect(result.pull_requests).toHaveLength(1);
      expect(result.pull_requests?.[0]?.number).toBe(456);
      expect(result.pull_requests?.[0]?.merged).toBe(true);
      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        pull_number: 456,
      });
    });

    it('should return error when PR not found', async () => {
      mockOctokit.rest.pulls.get.mockRejectedValue(new Error('Not Found'));
      mockHandleGitHubAPIError.mockReturnValue({
        error: 'Not Found',
        type: 'http',
      });

      const result = await fetchGitHubPullRequestByNumberAPI({
        owner: 'test',
        repo: 'repo',
        prNumber: 999,
      });

      expect(result.error).toContain('Failed to fetch pull request #999');
      expect(result.hints).toContain(
        'Verify that pull request #999 exists in test/repo'
      );
    });
  });

  describe('transformPullRequestItemFromREST', () => {
    it('should transform REST API PR item correctly', async () => {
      const mockItem = {
        number: 789,
        title: 'Transform Test',
        state: 'open',
        draft: true,
        user: { login: 'testuser' },
        labels: [{ name: 'bug' }, { name: 'enhancement' }],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        closed_at: null,
        html_url: 'https://github.com/test/repo/pull/789',
        head: { ref: 'feature', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        body: 'Test body',
      };

      const result = await transformPullRequestItemFromREST(
        mockItem,
        { owner: 'test', repo: 'repo' },
        mockOctokit
      );

      expect(result.number).toBe(789);
      expect(result.title).toBe('Transform Test');
      expect(result.state).toBe('open');
      expect(result.draft).toBe(true);
      expect(result.author).toBe('testuser');
      expect(result.labels).toEqual(['bug', 'enhancement']);
    });

    it('should fetch file changes when withContent is true', async () => {
      const mockItem = {
        number: 790,
        title: 'With Content',
        state: 'open',
        draft: false,
        user: { login: 'testuser' },
        labels: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        closed_at: null,
        html_url: 'https://github.com/test/repo/pull/790',
        head: { ref: 'feature', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        body: 'Test body',
      };

      const mockFiles = [
        {
          filename: 'src/test.ts',
          status: 'modified',
          additions: 20,
          deletions: 10,
          changes: 30,
          patch: '@@ -1,10 +1,20 @@...',
        },
      ];

      mockOctokit.rest.pulls.listFiles.mockResolvedValue({ data: mockFiles });

      const result = await transformPullRequestItemFromREST(
        mockItem,
        { owner: 'test', repo: 'repo', withContent: true },
        mockOctokit
      );

      expect(result.file_changes).toBeDefined();
      expect(result.file_changes?.total_count).toBe(1);
      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalled();
    });

    it('should fetch comments when withComments is true', async () => {
      const mockItem = {
        number: 791,
        title: 'With Comments',
        state: 'open',
        draft: false,
        user: { login: 'testuser' },
        labels: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        closed_at: null,
        html_url: 'https://github.com/test/repo/pull/791',
        head: { ref: 'feature', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        body: 'Test body',
      };

      const mockComments = [
        {
          id: 1,
          user: { login: 'reviewer1' },
          body: 'Looks good!',
          created_at: '2023-01-03T00:00:00Z',
          updated_at: '2023-01-03T00:00:00Z',
        },
      ];

      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: mockComments,
      });

      const result = await transformPullRequestItemFromREST(
        mockItem,
        { owner: 'test', repo: 'repo', withComments: true },
        mockOctokit
      );

      expect(result.comments).toBeDefined();
      expect(result.comments).toHaveLength(1);
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalled();
    });

    it('should handle sanitization warnings', async () => {
      const mockItem = {
        number: 792,
        title: 'Secret in title: ghp_token123',
        state: 'open',
        draft: false,
        user: { login: 'testuser' },
        labels: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        closed_at: null,
        html_url: 'https://github.com/test/repo/pull/792',
        head: { ref: 'feature', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        body: 'Body with secret: sk-openai123',
      };

      mockContentSanitizer.sanitizeContent.mockImplementation(
        (content: string) => ({
          content: content.replace(/ghp_\w+|sk-\w+/g, '[REDACTED]'),
          warnings: ['Secret detected'],
        })
      );

      const result = await transformPullRequestItemFromREST(
        mockItem,
        { owner: 'test', repo: 'repo' },
        mockOctokit
      );

      expect(result._sanitization_warnings).toBeDefined();
      expect(result._sanitization_warnings).toContain('Secret detected');
    });

    it('should handle failed file changes fetch gracefully', async () => {
      const mockItem = {
        number: 793,
        title: 'Failed File Fetch',
        state: 'open',
        draft: false,
        user: { login: 'testuser' },
        labels: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        closed_at: null,
        html_url: 'https://github.com/test/repo/pull/793',
        head: { ref: 'feature', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        body: 'Test body',
      };

      mockOctokit.rest.pulls.listFiles.mockRejectedValue(
        new Error('Failed to fetch files')
      );

      const result = await transformPullRequestItemFromREST(
        mockItem,
        { owner: 'test', repo: 'repo', withContent: true },
        mockOctokit
      );

      // Should complete without file_changes
      expect(result.number).toBe(793);
      expect(result.file_changes).toBeUndefined();
    });

    it('should handle failed comments fetch gracefully', async () => {
      const mockItem = {
        number: 794,
        title: 'Failed Comments Fetch',
        state: 'open',
        draft: false,
        user: { login: 'testuser' },
        labels: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        closed_at: null,
        html_url: 'https://github.com/test/repo/pull/794',
        head: { ref: 'feature', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        body: 'Test body',
      };

      mockOctokit.rest.issues.listComments.mockRejectedValue(
        new Error('Failed to fetch comments')
      );

      const result = await transformPullRequestItemFromREST(
        mockItem,
        { owner: 'test', repo: 'repo', withComments: true },
        mockOctokit
      );

      // Should complete with empty comments array
      expect(result.number).toBe(794);
      expect(result.comments).toEqual([]);
    });
  });
});

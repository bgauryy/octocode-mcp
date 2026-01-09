import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchGitHubPullRequestsAPI } from '../../src/github/pullRequestSearch.js';
import { getOctokit } from '../../src/github/client.js';
import { clearAllCache } from '../../src/utils/http/cache.js';

vi.mock('../../src/github/client.js');
vi.mock('../../src/session.js', () => ({
  logSessionError: vi.fn(() => Promise.resolve()),
}));

describe('Pull Request Search - Pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllCache();
  });

  const createMockOctokit = (mocks: {
    issuesAndPullRequests?: ReturnType<typeof vi.fn>;
    pullsList?: ReturnType<typeof vi.fn>;
    pullsGet?: ReturnType<typeof vi.fn>;
    pullsListFiles?: ReturnType<typeof vi.fn>;
  }) => ({
    rest: {
      search: {
        issuesAndPullRequests:
          mocks.issuesAndPullRequests ||
          vi.fn().mockResolvedValue({ data: { items: [], total_count: 0 } }),
      },
      pulls: {
        list: mocks.pullsList || vi.fn().mockResolvedValue({ data: [] }),
        get: mocks.pullsGet || vi.fn().mockResolvedValue({ data: {} }),
        listFiles:
          mocks.pullsListFiles || vi.fn().mockResolvedValue({ data: [] }),
      },
    },
  });

  const createMockSearchResponse = (totalCount: number, itemCount: number) => ({
    data: {
      total_count: totalCount,
      incomplete_results: false,
      items: Array.from({ length: itemCount }, (_, i) => ({
        number: i + 1,
        title: `PR ${i + 1}`,
        state: 'open',
        user: { login: `user${i}` },
        html_url: `https://github.com/owner/repo/pull/${i + 1}`,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        labels: [],
        pull_request: {
          url: `https://api.github.com/repos/owner/repo/pulls/${i + 1}`,
        },
      })),
    },
  });

  const createMockRESTResponse = (itemCount: number) => ({
    data: Array.from({ length: itemCount }, (_, i) => ({
      number: i + 1,
      title: `PR ${i + 1}`,
      state: 'open',
      user: { login: `user${i}` },
      html_url: `https://github.com/owner/repo/pull/${i + 1}`,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      labels: [],
      head: { ref: 'feature', sha: 'abc123' },
      base: { ref: 'main', sha: 'def456' },
    })),
  });

  describe('GitHub Search API pagination', () => {
    describe('page parameter', () => {
      it('should pass page parameter to GitHub API (default page=1)', async () => {
        const searchMock = vi
          .fn()
          .mockResolvedValue(createMockSearchResponse(50, 5));

        vi.mocked(getOctokit).mockResolvedValue(
          createMockOctokit({
            issuesAndPullRequests: searchMock,
          }) as unknown as ReturnType<typeof getOctokit>
        );

        await searchGitHubPullRequestsAPI({
          query: 'fix bug',
          limit: 5,
        });

        expect(searchMock).toHaveBeenCalledWith(
          expect.objectContaining({
            page: 1,
            per_page: 5,
          })
        );
      });

      it('should pass custom page parameter to GitHub API', async () => {
        const searchMock = vi
          .fn()
          .mockResolvedValue(createMockSearchResponse(50, 5));

        vi.mocked(getOctokit).mockResolvedValue(
          createMockOctokit({
            issuesAndPullRequests: searchMock,
          }) as unknown as ReturnType<typeof getOctokit>
        );

        await searchGitHubPullRequestsAPI({
          query: 'fix bug',
          limit: 5,
          page: 3,
        });

        expect(searchMock).toHaveBeenCalledWith(
          expect.objectContaining({
            page: 3,
            per_page: 5,
          })
        );
      });
    });

    describe('pagination metadata in response', () => {
      it('should include pagination info with currentPage', async () => {
        const searchMock = vi
          .fn()
          .mockResolvedValue(createMockSearchResponse(100, 5));

        vi.mocked(getOctokit).mockResolvedValue(
          createMockOctokit({
            issuesAndPullRequests: searchMock,
          }) as unknown as ReturnType<typeof getOctokit>
        );

        const result = await searchGitHubPullRequestsAPI({
          query: 'fix bug',
          limit: 5,
          page: 2,
        });

        expect(result.pagination).toBeDefined();
        expect(result.pagination?.currentPage).toBe(2);
      });

      it('should calculate totalPages correctly', async () => {
        const searchMock = vi
          .fn()
          .mockResolvedValue(createMockSearchResponse(95, 10));

        vi.mocked(getOctokit).mockResolvedValue(
          createMockOctokit({
            issuesAndPullRequests: searchMock,
          }) as unknown as ReturnType<typeof getOctokit>
        );

        const result = await searchGitHubPullRequestsAPI({
          query: 'fix bug',
          limit: 10,
          page: 1,
        });

        expect(result.pagination?.totalPages).toBe(10); // 95/10 = 9.5, ceil = 10
        expect(result.pagination?.totalMatches).toBe(95);
      });

      it('should cap totalPages at 10 (GitHub 1000 result limit)', async () => {
        const searchMock = vi
          .fn()
          .mockResolvedValue(createMockSearchResponse(5000, 10));

        vi.mocked(getOctokit).mockResolvedValue(
          createMockOctokit({
            issuesAndPullRequests: searchMock,
          }) as unknown as ReturnType<typeof getOctokit>
        );

        const result = await searchGitHubPullRequestsAPI({
          query: 'fix bug',
          limit: 100,
          page: 1,
        });

        // 5000 results, but GitHub caps at 1000, so 1000/100 = 10 pages max
        expect(result.pagination?.totalPages).toBe(10);
        expect(result.pagination?.totalMatches).toBe(1000); // Capped at 1000
      });

      it('should set hasMore=true when more pages exist', async () => {
        const searchMock = vi
          .fn()
          .mockResolvedValue(createMockSearchResponse(50, 5));

        vi.mocked(getOctokit).mockResolvedValue(
          createMockOctokit({
            issuesAndPullRequests: searchMock,
          }) as unknown as ReturnType<typeof getOctokit>
        );

        const result = await searchGitHubPullRequestsAPI({
          query: 'fix bug',
          limit: 5,
          page: 1,
        });

        expect(result.pagination?.hasMore).toBe(true);
        expect(result.pagination?.totalPages).toBe(10);
      });

      it('should set hasMore=false on last page', async () => {
        const searchMock = vi
          .fn()
          .mockResolvedValue(createMockSearchResponse(50, 5));

        vi.mocked(getOctokit).mockResolvedValue(
          createMockOctokit({
            issuesAndPullRequests: searchMock,
          }) as unknown as ReturnType<typeof getOctokit>
        );

        const result = await searchGitHubPullRequestsAPI({
          query: 'fix bug',
          limit: 5,
          page: 10,
        });

        expect(result.pagination?.hasMore).toBe(false);
        expect(result.pagination?.currentPage).toBe(10);
        expect(result.pagination?.totalPages).toBe(10);
      });

      it('should include perPage in pagination info', async () => {
        const searchMock = vi
          .fn()
          .mockResolvedValue(createMockSearchResponse(100, 7));

        vi.mocked(getOctokit).mockResolvedValue(
          createMockOctokit({
            issuesAndPullRequests: searchMock,
          }) as unknown as ReturnType<typeof getOctokit>
        );

        const result = await searchGitHubPullRequestsAPI({
          query: 'fix bug',
          limit: 7,
          page: 1,
        });

        expect(result.pagination?.perPage).toBe(7);
      });
    });
  });

  describe('REST API pagination', () => {
    it('should pass page parameter to REST API', async () => {
      const pullsListMock = vi
        .fn()
        .mockResolvedValue(createMockRESTResponse(5));

      vi.mocked(getOctokit).mockResolvedValue(
        createMockOctokit({
          pullsList: pullsListMock,
        }) as unknown as ReturnType<typeof getOctokit>
      );

      await searchGitHubPullRequestsAPI({
        owner: 'facebook',
        repo: 'react',
        state: 'open',
        limit: 5,
        page: 2,
      });

      expect(pullsListMock).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          per_page: 5,
        })
      );
    });

    it('should estimate hasMore based on results length', async () => {
      const pullsListMock = vi
        .fn()
        .mockResolvedValue(createMockRESTResponse(5)); // Full page

      vi.mocked(getOctokit).mockResolvedValue(
        createMockOctokit({
          pullsList: pullsListMock,
        }) as unknown as ReturnType<typeof getOctokit>
      );

      const result = await searchGitHubPullRequestsAPI({
        owner: 'facebook',
        repo: 'react',
        state: 'open',
        limit: 5,
        page: 1,
      });

      expect(result.pagination?.hasMore).toBe(true); // Got full page, might be more
      expect(result.pagination?.currentPage).toBe(1);
    });

    it('should set hasMore=false when results are less than limit', async () => {
      const pullsListMock = vi
        .fn()
        .mockResolvedValue(createMockRESTResponse(3)); // Less than limit

      vi.mocked(getOctokit).mockResolvedValue(
        createMockOctokit({
          pullsList: pullsListMock,
        }) as unknown as ReturnType<typeof getOctokit>
      );

      const result = await searchGitHubPullRequestsAPI({
        owner: 'facebook',
        repo: 'react',
        state: 'open',
        limit: 5,
        page: 1,
      });

      expect(result.pagination?.hasMore).toBe(false); // Got less than limit, no more
    });
  });

  describe('caching with pagination', () => {
    it('should cache different pages separately', async () => {
      const searchMock = vi
        .fn()
        .mockResolvedValue(createMockSearchResponse(100, 5));

      vi.mocked(getOctokit).mockResolvedValue(
        createMockOctokit({
          issuesAndPullRequests: searchMock,
        }) as unknown as ReturnType<typeof getOctokit>
      );

      // First call - page 1
      await searchGitHubPullRequestsAPI({
        query: 'fix bug',
        limit: 5,
        page: 1,
      });

      // Second call - page 2
      await searchGitHubPullRequestsAPI({
        query: 'fix bug',
        limit: 5,
        page: 2,
      });

      // Both pages should trigger API calls (different cache keys)
      expect(searchMock).toHaveBeenCalledTimes(2);
    });

    it('should return cached result for same page', async () => {
      const searchMock = vi
        .fn()
        .mockResolvedValue(createMockSearchResponse(100, 5));

      vi.mocked(getOctokit).mockResolvedValue(
        createMockOctokit({
          issuesAndPullRequests: searchMock,
        }) as unknown as ReturnType<typeof getOctokit>
      );

      // First call
      await searchGitHubPullRequestsAPI({
        query: 'fix bug',
        limit: 5,
        page: 1,
      });

      // Second call with same params
      await searchGitHubPullRequestsAPI({
        query: 'fix bug',
        limit: 5,
        page: 1,
      });

      // Should only call API once (second is cached)
      expect(searchMock).toHaveBeenCalledTimes(1);
    });

    it('should not cache context fields (mainResearchGoal, researchGoal, reasoning)', async () => {
      const searchMock = vi
        .fn()
        .mockResolvedValue(createMockSearchResponse(100, 5));

      vi.mocked(getOctokit).mockResolvedValue(
        createMockOctokit({
          issuesAndPullRequests: searchMock,
        }) as unknown as ReturnType<typeof getOctokit>
      );

      // First call with context
      await searchGitHubPullRequestsAPI({
        query: 'fix bug',
        limit: 5,
        page: 1,
        mainResearchGoal: 'Goal 1',
        researchGoal: 'Research 1',
        reasoning: 'Reason 1',
      });

      // Second call with different context
      await searchGitHubPullRequestsAPI({
        query: 'fix bug',
        limit: 5,
        page: 1,
        mainResearchGoal: 'Different Goal',
        researchGoal: 'Different Research',
        reasoning: 'Different Reason',
      });

      // Should only call API once (context fields don't affect cache)
      expect(searchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle single page of results', async () => {
      const searchMock = vi
        .fn()
        .mockResolvedValue(createMockSearchResponse(3, 3));

      vi.mocked(getOctokit).mockResolvedValue(
        createMockOctokit({
          issuesAndPullRequests: searchMock,
        }) as unknown as ReturnType<typeof getOctokit>
      );

      const result = await searchGitHubPullRequestsAPI({
        query: 'fix bug',
        limit: 5,
        page: 1,
      });

      expect(result.pagination?.totalPages).toBe(1);
      expect(result.pagination?.hasMore).toBe(false);
    });

    it('should handle zero results', async () => {
      const searchMock = vi
        .fn()
        .mockResolvedValue(createMockSearchResponse(0, 0));

      vi.mocked(getOctokit).mockResolvedValue(
        createMockOctokit({
          issuesAndPullRequests: searchMock,
        }) as unknown as ReturnType<typeof getOctokit>
      );

      const result = await searchGitHubPullRequestsAPI({
        query: 'nonexistent',
        limit: 5,
        page: 1,
      });

      expect(result.pagination?.totalPages).toBe(0);
      expect(result.pagination?.totalMatches).toBe(0);
      expect(result.pagination?.hasMore).toBe(false);
    });

    it('should use default limit when not specified', async () => {
      const searchMock = vi
        .fn()
        .mockResolvedValue(createMockSearchResponse(100, 30));

      vi.mocked(getOctokit).mockResolvedValue(
        createMockOctokit({
          issuesAndPullRequests: searchMock,
        }) as unknown as ReturnType<typeof getOctokit>
      );

      const result = await searchGitHubPullRequestsAPI({
        query: 'fix bug',
        page: 1,
      });

      expect(result.pagination?.perPage).toBe(30);
      expect(searchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          per_page: 30,
        })
      );
    });

    it('should cap per_page at 100', async () => {
      const searchMock = vi
        .fn()
        .mockResolvedValue(createMockSearchResponse(100, 100));

      vi.mocked(getOctokit).mockResolvedValue(
        createMockOctokit({
          issuesAndPullRequests: searchMock,
        }) as unknown as ReturnType<typeof getOctokit>
      );

      await searchGitHubPullRequestsAPI({
        query: 'fix bug',
        limit: 150, // Request more than allowed
        page: 1,
      });

      expect(searchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          per_page: 100, // Should be capped at 100
        })
      );
    });
  });
});

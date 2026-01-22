import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Create hoisted mocks
const mockGetGitlab = vi.hoisted(() => vi.fn());
const mockHandleGitLabAPIError = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithDataCache = vi.hoisted(() => vi.fn());

// Set up mocks
vi.mock('../../src/gitlab/client.js', () => ({
  getGitlab: mockGetGitlab,
}));

vi.mock('../../src/gitlab/errors.js', () => ({
  handleGitLabAPIError: mockHandleGitLabAPIError,
}));

vi.mock('../../src/utils/http/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withDataCache: mockWithDataCache,
}));

// Import after mocks are set up
import {
  searchGitLabMergeRequestsAPI,
  getGitLabMRNotes,
  getGitLabMRChanges,
  transformGitLabMergeRequest,
  type GitLabMRSearchResult,
} from '../../src/gitlab/mergeRequests.js';
import type {
  GitLabMergeRequest,
  GitLabMRNote,
} from '../../src/gitlab/types.js';

describe('GitLab Merge Requests', () => {
  let mockGitlab: {
    MergeRequests: {
      show: ReturnType<typeof vi.fn>;
      all: ReturnType<typeof vi.fn>;
      showChanges: ReturnType<typeof vi.fn>;
    };
    MergeRequestNotes: {
      all: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock GitLab client instance
    mockGitlab = {
      MergeRequests: {
        show: vi.fn(),
        all: vi.fn(),
        showChanges: vi.fn(),
      },
      MergeRequestNotes: {
        all: vi.fn(),
      },
    };
    mockGetGitlab.mockResolvedValue(mockGitlab);

    // Setup default cache behavior - execute the operation directly
    mockGenerateCacheKey.mockReturnValue('test-cache-key');
    mockWithDataCache.mockImplementation(
      async (_cacheKey: string, operation: () => Promise<unknown>) => {
        return await operation();
      }
    );

    // Setup default error handler
    mockHandleGitLabAPIError.mockReturnValue({
      error: 'API Error',
      type: 'http',
      status: 500,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // searchGitLabMergeRequestsAPI Tests
  // ============================================================================

  describe('searchGitLabMergeRequestsAPI', () => {
    describe('fetch specific MR by iid', () => {
      it('should fetch specific MR when projectId and iid are provided', async () => {
        const mockMR: Partial<GitLabMergeRequest> = {
          id: 1001,
          iid: 42,
          project_id: 123,
          title: 'Test MR',
          description: 'Test description',
          state: 'opened',
          author: {
            id: 1,
            username: 'testuser',
            name: 'Test User',
            avatar_url: 'https://gitlab.com/avatar.png',
            web_url: 'https://gitlab.com/testuser',
          },
          assignees: [],
          labels: ['bug', 'urgent'],
          source_branch: 'feature/test',
          target_branch: 'main',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
          web_url: 'https://gitlab.com/test/repo/-/merge_requests/42',
          draft: false,
          work_in_progress: false,
        };

        mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);

        const result = await searchGitLabMergeRequestsAPI({
          projectId: 123,
          iid: 42,
        });

        expect(result).toHaveProperty('data');
        const data = (result as { data: GitLabMRSearchResult }).data;
        expect(data.mergeRequests).toHaveLength(1);
        expect(data.mergeRequests[0]).toEqual(mockMR);
        expect(data.pagination).toEqual({
          currentPage: 1,
          totalPages: 1,
          perPage: 1,
          totalMatches: 1,
          hasMore: false,
        });
        expect(mockGitlab.MergeRequests.show).toHaveBeenCalledWith(123, 42);
      });

      it('should include status 200 in response for specific MR fetch', async () => {
        const mockMR: Partial<GitLabMergeRequest> = {
          id: 1001,
          iid: 42,
          title: 'Test MR',
          state: 'opened',
          author: {
            id: 1,
            username: 'testuser',
            name: 'Test User',
            avatar_url: '',
            web_url: '',
          },
          assignees: [],
          labels: [],
        };

        mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);

        const result = await searchGitLabMergeRequestsAPI({
          projectId: 'group/project',
          iid: 42,
        });

        expect(result).toHaveProperty('status', 200);
      });

      it('should work with string projectId (URL-encoded path)', async () => {
        const mockMR: Partial<GitLabMergeRequest> = {
          id: 1001,
          iid: 99,
          title: 'URL Encoded Project MR',
          state: 'merged',
          author: {
            id: 1,
            username: 'testuser',
            name: 'Test User',
            avatar_url: '',
            web_url: '',
          },
          assignees: [],
          labels: [],
        };

        mockGitlab.MergeRequests.show.mockResolvedValue(mockMR);

        const result = await searchGitLabMergeRequestsAPI({
          projectId: 'my-group%2Fmy-project',
          iid: 99,
        });

        expect(result).toHaveProperty('data');
        expect(mockGitlab.MergeRequests.show).toHaveBeenCalledWith(
          'my-group%2Fmy-project',
          99
        );
      });
    });

    describe('search with various filters', () => {
      it('should search with state filter', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = [
          {
            id: 1,
            iid: 10,
            title: 'Open MR 1',
            state: 'opened',
            author: {
              id: 1,
              username: 'user1',
              name: 'User One',
              avatar_url: '',
              web_url: '',
            },
            assignees: [],
            labels: [],
          },
          {
            id: 2,
            iid: 11,
            title: 'Open MR 2',
            state: 'opened',
            author: {
              id: 2,
              username: 'user2',
              name: 'User Two',
              avatar_url: '',
              web_url: '',
            },
            assignees: [],
            labels: [],
          },
        ];

        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        const result = await searchGitLabMergeRequestsAPI({
          projectId: 123,
          state: 'opened',
        });

        expect(result).toHaveProperty('data');
        const data = (result as { data: GitLabMRSearchResult }).data;
        expect(data.mergeRequests).toHaveLength(2);
        expect(mockGitlab.MergeRequests.all).toHaveBeenCalledWith(
          expect.objectContaining({
            projectId: 123,
            state: 'opened',
          })
        );
      });

      it('should search with author filter', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = [
          {
            id: 1,
            iid: 10,
            title: 'Author MR',
            state: 'opened',
            author: {
              id: 1,
              username: 'specific-author',
              name: 'Specific Author',
              avatar_url: '',
              web_url: '',
            },
            assignees: [],
            labels: [],
          },
        ];

        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        const result = await searchGitLabMergeRequestsAPI({
          projectId: 123,
          authorUsername: 'specific-author',
        });

        expect(result).toHaveProperty('data');
        expect(mockGitlab.MergeRequests.all).toHaveBeenCalledWith(
          expect.objectContaining({
            authorUsername: 'specific-author',
          })
        );
      });

      it('should search with assignee filter', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = [
          {
            id: 1,
            iid: 10,
            title: 'Assigned MR',
            state: 'opened',
            author: {
              id: 1,
              username: 'author',
              name: 'Author',
              avatar_url: '',
              web_url: '',
            },
            assignees: [
              { id: 2, username: 'assignee-user', name: 'Assignee User' },
            ],
            labels: [],
          },
        ];

        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        const result = await searchGitLabMergeRequestsAPI({
          projectId: 123,
          assigneeUsername: 'assignee-user',
        });

        expect(result).toHaveProperty('data');
        expect(mockGitlab.MergeRequests.all).toHaveBeenCalledWith(
          expect.objectContaining({
            assigneeUsername: 'assignee-user',
          })
        );
      });

      it('should search with labels filter', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = [
          {
            id: 1,
            iid: 10,
            title: 'Labeled MR',
            state: 'opened',
            author: {
              id: 1,
              username: 'author',
              name: 'Author',
              avatar_url: '',
              web_url: '',
            },
            assignees: [],
            labels: ['bug', 'priority::high'],
          },
        ];

        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        const result = await searchGitLabMergeRequestsAPI({
          projectId: 123,
          labels: ['bug', 'priority::high'],
        });

        expect(result).toHaveProperty('data');
        expect(mockGitlab.MergeRequests.all).toHaveBeenCalledWith(
          expect.objectContaining({
            labels: 'bug,priority::high',
          })
        );
      });

      it('should search with source and target branch filters', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = [
          {
            id: 1,
            iid: 10,
            title: 'Branch MR',
            state: 'opened',
            source_branch: 'feature/new-feature',
            target_branch: 'develop',
            author: {
              id: 1,
              username: 'author',
              name: 'Author',
              avatar_url: '',
              web_url: '',
            },
            assignees: [],
            labels: [],
          },
        ];

        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        const result = await searchGitLabMergeRequestsAPI({
          projectId: 123,
          sourceBranch: 'feature/new-feature',
          targetBranch: 'develop',
        });

        expect(result).toHaveProperty('data');
        expect(mockGitlab.MergeRequests.all).toHaveBeenCalledWith(
          expect.objectContaining({
            sourceBranch: 'feature/new-feature',
            targetBranch: 'develop',
          })
        );
      });

      it('should search with date filters', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = [];
        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        const result = await searchGitLabMergeRequestsAPI({
          projectId: 123,
          createdAfter: '2023-01-01T00:00:00Z',
          updatedAfter: '2023-06-01T00:00:00Z',
        });

        expect(result).toHaveProperty('data');
        expect(mockGitlab.MergeRequests.all).toHaveBeenCalledWith(
          expect.objectContaining({
            createdAfter: '2023-01-01T00:00:00Z',
            updatedAfter: '2023-06-01T00:00:00Z',
          })
        );
      });

      it('should search with sort options', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = [];
        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        const result = await searchGitLabMergeRequestsAPI({
          projectId: 123,
          orderBy: 'updated_at',
          sort: 'asc',
        });

        expect(result).toHaveProperty('data');
        expect(mockGitlab.MergeRequests.all).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: 'updated_at',
            sort: 'asc',
          })
        );
      });

      it('should use default sort options when not specified', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = [];
        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        await searchGitLabMergeRequestsAPI({
          projectId: 123,
        });

        expect(mockGitlab.MergeRequests.all).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: 'created_at',
            sort: 'desc',
          })
        );
      });

      it('should handle state "all" by removing state from query', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = [];
        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        await searchGitLabMergeRequestsAPI({
          projectId: 123,
          state: 'all',
        });

        // state should be undefined when 'all' is passed
        const callArgs = mockGitlab.MergeRequests.all.mock.calls[0]![0];
        expect(callArgs.state).toBeUndefined();
      });
    });

    describe('project-scoped vs global search', () => {
      it('should perform project-scoped search when projectId is provided', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = [
          {
            id: 1,
            iid: 10,
            project_id: 123,
            title: 'Project MR',
            state: 'opened',
            author: {
              id: 1,
              username: 'author',
              name: 'Author',
              avatar_url: '',
              web_url: '',
            },
            assignees: [],
            labels: [],
          },
        ];

        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        const result = await searchGitLabMergeRequestsAPI({
          projectId: 123,
        });

        expect(result).toHaveProperty('data');
        expect(mockGitlab.MergeRequests.all).toHaveBeenCalledWith(
          expect.objectContaining({
            projectId: 123,
          })
        );
      });

      it('should perform global search when projectId is not provided', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = [
          {
            id: 1,
            iid: 10,
            project_id: 100,
            title: 'Global MR 1',
            state: 'opened',
            author: {
              id: 1,
              username: 'author1',
              name: 'Author 1',
              avatar_url: '',
              web_url: '',
            },
            assignees: [],
            labels: [],
          },
          {
            id: 2,
            iid: 20,
            project_id: 200,
            title: 'Global MR 2',
            state: 'opened',
            author: {
              id: 2,
              username: 'author2',
              name: 'Author 2',
              avatar_url: '',
              web_url: '',
            },
            assignees: [],
            labels: [],
          },
        ];

        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        const result = await searchGitLabMergeRequestsAPI({
          state: 'opened',
        });

        expect(result).toHaveProperty('data');
        // Should NOT have projectId in the call
        const callArgs = mockGitlab.MergeRequests.all.mock.calls[0]![0];
        expect(callArgs.projectId).toBeUndefined();
      });
    });

    describe('pagination', () => {
      it('should use default pagination values', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = [];
        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        await searchGitLabMergeRequestsAPI({
          projectId: 123,
        });

        expect(mockGitlab.MergeRequests.all).toHaveBeenCalledWith(
          expect.objectContaining({
            perPage: 20,
            page: 1,
          })
        );
      });

      it('should use custom pagination values', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = [];
        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        await searchGitLabMergeRequestsAPI({
          projectId: 123,
          perPage: 50,
          page: 3,
        });

        expect(mockGitlab.MergeRequests.all).toHaveBeenCalledWith(
          expect.objectContaining({
            perPage: 50,
            page: 3,
          })
        );
      });

      it('should cap perPage at 100', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = [];
        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        await searchGitLabMergeRequestsAPI({
          projectId: 123,
          perPage: 200,
        });

        expect(mockGitlab.MergeRequests.all).toHaveBeenCalledWith(
          expect.objectContaining({
            perPage: 100,
          })
        );
      });

      it('should set hasMore to true when result count equals perPage', async () => {
        // Create 20 mock MRs (default perPage)
        const mockMRs: Partial<GitLabMergeRequest>[] = Array.from(
          { length: 20 },
          (_, i) => ({
            id: i + 1,
            iid: i + 1,
            title: `MR ${i + 1}`,
            state: 'opened' as const,
            author: {
              id: 1,
              username: 'author',
              name: 'Author',
              avatar_url: '',
              web_url: '',
            },
            assignees: [],
            labels: [],
          })
        );

        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        const result = await searchGitLabMergeRequestsAPI({
          projectId: 123,
        });

        expect(result).toHaveProperty('data');
        const data = (result as { data: GitLabMRSearchResult }).data;
        expect(data.pagination.hasMore).toBe(true);
        expect(data.pagination.totalPages).toBe(2); // current page + 1
      });

      it('should set hasMore to false when result count is less than perPage', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = Array.from(
          { length: 5 },
          (_, i) => ({
            id: i + 1,
            iid: i + 1,
            title: `MR ${i + 1}`,
            state: 'opened' as const,
            author: {
              id: 1,
              username: 'author',
              name: 'Author',
              avatar_url: '',
              web_url: '',
            },
            assignees: [],
            labels: [],
          })
        );

        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        const result = await searchGitLabMergeRequestsAPI({
          projectId: 123,
        });

        expect(result).toHaveProperty('data');
        const data = (result as { data: GitLabMRSearchResult }).data;
        expect(data.pagination.hasMore).toBe(false);
        expect(data.pagination.totalPages).toBe(1);
      });

      it('should correctly report currentPage in pagination', async () => {
        const mockMRs: Partial<GitLabMergeRequest>[] = [];
        mockGitlab.MergeRequests.all.mockResolvedValue(mockMRs);

        const result = await searchGitLabMergeRequestsAPI({
          projectId: 123,
          page: 5,
        });

        expect(result).toHaveProperty('data');
        const data = (result as { data: GitLabMRSearchResult }).data;
        expect(data.pagination.currentPage).toBe(5);
      });
    });

    describe('caching behavior', () => {
      it('should generate cache key with all parameters', async () => {
        mockGitlab.MergeRequests.all.mockResolvedValue([]);

        await searchGitLabMergeRequestsAPI({
          projectId: 123,
          state: 'opened',
          authorUsername: 'testuser',
          labels: ['bug'],
          page: 1,
          perPage: 20,
        });

        expect(mockGenerateCacheKey).toHaveBeenCalledWith(
          'gl-api-mrs',
          expect.objectContaining({
            projectId: 123,
            state: 'opened',
            authorUsername: 'testuser',
            labels: ['bug'],
            page: 1,
            perPage: 20,
          }),
          undefined
        );
      });

      it('should include sessionId in cache key when provided', async () => {
        mockGitlab.MergeRequests.all.mockResolvedValue([]);

        await searchGitLabMergeRequestsAPI({ projectId: 123 }, 'session-123');

        expect(mockGenerateCacheKey).toHaveBeenCalledWith(
          'gl-api-mrs',
          expect.any(Object),
          'session-123'
        );
      });

      it('should use withDataCache wrapper', async () => {
        mockGitlab.MergeRequests.all.mockResolvedValue([]);

        await searchGitLabMergeRequestsAPI({ projectId: 123 });

        expect(mockWithDataCache).toHaveBeenCalledWith(
          'test-cache-key',
          expect.any(Function),
          expect.objectContaining({
            shouldCache: expect.any(Function),
          })
        );
      });

      it('should only cache successful responses (shouldCache predicate)', async () => {
        mockGitlab.MergeRequests.all.mockResolvedValue([]);

        await searchGitLabMergeRequestsAPI({ projectId: 123 });

        // Get the shouldCache function from the call
        const cacheOptions = mockWithDataCache.mock.calls[0]?.[2] as
          | { shouldCache: (data: unknown) => boolean }
          | undefined;

        // Test shouldCache predicate
        expect(cacheOptions?.shouldCache({ data: { mergeRequests: [] } })).toBe(
          true
        );
        expect(cacheOptions?.shouldCache({ error: 'API Error' })).toBe(false);
        expect(cacheOptions?.shouldCache({ data: {}, error: 'Error' })).toBe(
          false
        );
      });

      it('should return cached data when available', async () => {
        const cachedResponse = {
          data: {
            mergeRequests: [{ id: 1, iid: 10, title: 'Cached MR' }],
            pagination: { currentPage: 1, perPage: 20, hasMore: false },
          },
          status: 200,
        };

        // Mock withDataCache to return cached data without calling operation
        mockWithDataCache.mockResolvedValue(cachedResponse);

        const result = await searchGitLabMergeRequestsAPI({ projectId: 123 });

        expect(result).toEqual(cachedResponse);
        // Operation should not have been called since cache returned data
        expect(mockGitlab.MergeRequests.all).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle API errors gracefully', async () => {
        const apiError = new Error('GitLab API Error');
        mockGitlab.MergeRequests.all.mockRejectedValue(apiError);
        mockHandleGitLabAPIError.mockReturnValue({
          error: 'Failed to fetch merge requests',
          type: 'http',
          status: 500,
        });

        const result = await searchGitLabMergeRequestsAPI({ projectId: 123 });

        expect(result).toHaveProperty(
          'error',
          'Failed to fetch merge requests'
        );
        expect(mockHandleGitLabAPIError).toHaveBeenCalledWith(apiError);
      });

      it('should handle rate limit errors', async () => {
        const rateLimitError = new Error('Rate limit exceeded');
        mockGitlab.MergeRequests.all.mockRejectedValue(rateLimitError);
        mockHandleGitLabAPIError.mockReturnValue({
          error: 'Rate limit exceeded',
          type: 'http',
          status: 429,
          retryAfter: 60,
          hints: ['Wait 60 seconds before retrying'],
        });

        const result = await searchGitLabMergeRequestsAPI({ projectId: 123 });

        expect(result).toHaveProperty('error', 'Rate limit exceeded');
        expect(result).toHaveProperty('status', 429);
        expect(result).toHaveProperty('retryAfter', 60);
      });

      it('should handle not found errors', async () => {
        const notFoundError = new Error('Project not found');
        mockGitlab.MergeRequests.all.mockRejectedValue(notFoundError);
        mockHandleGitLabAPIError.mockReturnValue({
          error: 'Resource not found',
          type: 'http',
          status: 404,
          hints: ['Check the project ID is correct'],
        });

        const result = await searchGitLabMergeRequestsAPI({ projectId: 999 });

        expect(result).toHaveProperty('error', 'Resource not found');
        expect(result).toHaveProperty('status', 404);
      });

      it('should handle authentication errors', async () => {
        const authError = new Error('Unauthorized');
        mockGitlab.MergeRequests.all.mockRejectedValue(authError);
        mockHandleGitLabAPIError.mockReturnValue({
          error: 'Authentication failed',
          type: 'http',
          status: 401,
          hints: ['Check your GITLAB_TOKEN is valid'],
        });

        const result = await searchGitLabMergeRequestsAPI({ projectId: 123 });

        expect(result).toHaveProperty('error', 'Authentication failed');
        expect(result).toHaveProperty('status', 401);
      });

      it('should handle errors when fetching specific MR by iid', async () => {
        const notFoundError = new Error('MR not found');
        mockGitlab.MergeRequests.show.mockRejectedValue(notFoundError);
        mockHandleGitLabAPIError.mockReturnValue({
          error: 'Merge request not found',
          type: 'http',
          status: 404,
        });

        const result = await searchGitLabMergeRequestsAPI({
          projectId: 123,
          iid: 999,
        });

        expect(result).toHaveProperty('error', 'Merge request not found');
        expect(mockHandleGitLabAPIError).toHaveBeenCalledWith(notFoundError);
      });

      it('should handle network errors', async () => {
        const networkError = new TypeError('Failed to fetch');
        mockGitlab.MergeRequests.all.mockRejectedValue(networkError);
        mockHandleGitLabAPIError.mockReturnValue({
          error: 'Network error',
          type: 'network',
          status: 0,
        });

        const result = await searchGitLabMergeRequestsAPI({ projectId: 123 });

        expect(result).toHaveProperty('error', 'Network error');
        expect(result).toHaveProperty('type', 'network');
      });
    });
  });

  // ============================================================================
  // getGitLabMRNotes Tests
  // ============================================================================

  describe('getGitLabMRNotes', () => {
    it('should fetch MR notes successfully', async () => {
      const mockNotes: GitLabMRNote[] = [
        {
          id: 1,
          body: 'LGTM!',
          author: { id: 1, username: 'reviewer', name: 'Reviewer' },
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          system: false,
          noteable_id: 42,
          noteable_type: 'MergeRequest',
          noteable_iid: 42,
          resolvable: true,
        },
        {
          id: 2,
          body: 'Please fix the typo',
          author: { id: 2, username: 'reviewer2', name: 'Reviewer 2' },
          created_at: '2023-01-02T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
          system: false,
          noteable_id: 42,
          noteable_type: 'MergeRequest',
          noteable_iid: 42,
          resolvable: true,
        },
      ];

      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);

      const result = await getGitLabMRNotes(123, 42);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('status', 200);
      const data = (result as { data: GitLabMRNote[] }).data;
      expect(data).toHaveLength(2);
      expect(mockGitlab.MergeRequestNotes.all).toHaveBeenCalledWith(123, 42, {
        perPage: 100,
      });
    });

    it('should filter out system notes', async () => {
      const mockNotes: GitLabMRNote[] = [
        {
          id: 1,
          body: 'User comment',
          author: { id: 1, username: 'user', name: 'User' },
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          system: false,
          noteable_id: 42,
          noteable_type: 'MergeRequest',
          noteable_iid: 42,
          resolvable: true,
        },
        {
          id: 2,
          body: 'mentioned in commit abc123',
          author: { id: 0, username: 'system', name: 'System' },
          created_at: '2023-01-02T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
          system: true, // System note - should be filtered out
          noteable_id: 42,
          noteable_type: 'MergeRequest',
          noteable_iid: 42,
          resolvable: false,
        },
        {
          id: 3,
          body: 'approved this merge request',
          author: { id: 0, username: 'system', name: 'System' },
          created_at: '2023-01-03T00:00:00Z',
          updated_at: '2023-01-03T00:00:00Z',
          system: true, // System note - should be filtered out
          noteable_id: 42,
          noteable_type: 'MergeRequest',
          noteable_iid: 42,
          resolvable: false,
        },
      ];

      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);

      const result = await getGitLabMRNotes(123, 42);

      expect(result).toHaveProperty('data');
      const data = (result as { data: GitLabMRNote[] }).data;
      expect(data).toHaveLength(1);
      expect(data[0]!.body).toBe('User comment');
    });

    it('should work with string projectId', async () => {
      const mockNotes: GitLabMRNote[] = [];
      mockGitlab.MergeRequestNotes.all.mockResolvedValue(mockNotes);

      const result = await getGitLabMRNotes('group/project', 42);

      expect(result).toHaveProperty('data');
      expect(mockGitlab.MergeRequestNotes.all).toHaveBeenCalledWith(
        'group/project',
        42,
        { perPage: 100 }
      );
    });

    it('should handle empty notes', async () => {
      mockGitlab.MergeRequestNotes.all.mockResolvedValue([]);

      const result = await getGitLabMRNotes(123, 42);

      expect(result).toHaveProperty('data');
      const data = (result as { data: GitLabMRNote[] }).data;
      expect(data).toHaveLength(0);
    });

    it('should handle API errors', async () => {
      const apiError = new Error('Failed to fetch notes');
      mockGitlab.MergeRequestNotes.all.mockRejectedValue(apiError);
      mockHandleGitLabAPIError.mockReturnValue({
        error: 'Failed to fetch notes',
        type: 'http',
        status: 500,
      });

      const result = await getGitLabMRNotes(123, 42);

      expect(result).toHaveProperty('error', 'Failed to fetch notes');
      expect(mockHandleGitLabAPIError).toHaveBeenCalledWith(apiError);
    });

    it('should handle MR not found errors', async () => {
      const notFoundError = new Error('MR not found');
      mockGitlab.MergeRequestNotes.all.mockRejectedValue(notFoundError);
      mockHandleGitLabAPIError.mockReturnValue({
        error: 'Merge request not found',
        type: 'http',
        status: 404,
      });

      const result = await getGitLabMRNotes(123, 999);

      expect(result).toHaveProperty('error', 'Merge request not found');
      expect(result).toHaveProperty('status', 404);
    });
  });

  // ============================================================================
  // getGitLabMRChanges Tests
  // ============================================================================

  describe('getGitLabMRChanges', () => {
    it('should fetch MR changes successfully', async () => {
      const mockChanges = {
        changes: [
          {
            old_path: 'src/file.ts',
            new_path: 'src/file.ts',
            a_mode: '100644',
            b_mode: '100644',
            diff: '@@ -1,5 +1,10 @@...',
            new_file: false,
            renamed_file: false,
            deleted_file: false,
          },
          {
            old_path: 'src/new-file.ts',
            new_path: 'src/new-file.ts',
            a_mode: '0',
            b_mode: '100644',
            diff: '+new file content',
            new_file: true,
            renamed_file: false,
            deleted_file: false,
          },
        ],
      };

      mockGitlab.MergeRequests.showChanges.mockResolvedValue(mockChanges);

      const result = await getGitLabMRChanges(123, 42);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('status', 200);
      const data = (result as { data: { changes: unknown[] } }).data;
      expect(data.changes).toHaveLength(2);
      expect(mockGitlab.MergeRequests.showChanges).toHaveBeenCalledWith(
        123,
        42
      );
    });

    it('should work with string projectId', async () => {
      const mockChanges = { changes: [] };
      mockGitlab.MergeRequests.showChanges.mockResolvedValue(mockChanges);

      const result = await getGitLabMRChanges('group/project', 42);

      expect(result).toHaveProperty('data');
      expect(mockGitlab.MergeRequests.showChanges).toHaveBeenCalledWith(
        'group/project',
        42
      );
    });

    it('should handle empty changes array', async () => {
      const mockChanges = { changes: [] };
      mockGitlab.MergeRequests.showChanges.mockResolvedValue(mockChanges);

      const result = await getGitLabMRChanges(123, 42);

      expect(result).toHaveProperty('data');
      const data = (result as { data: { changes: unknown[] } }).data;
      expect(data.changes).toHaveLength(0);
    });

    it('should handle missing changes property in response', async () => {
      // Some API responses might not have changes
      const mockChanges = {};
      mockGitlab.MergeRequests.showChanges.mockResolvedValue(mockChanges);

      const result = await getGitLabMRChanges(123, 42);

      expect(result).toHaveProperty('data');
      const data = (result as { data: { changes: unknown[] } }).data;
      expect(data.changes).toEqual([]);
    });

    it('should handle API errors', async () => {
      const apiError = new Error('Failed to fetch changes');
      mockGitlab.MergeRequests.showChanges.mockRejectedValue(apiError);
      mockHandleGitLabAPIError.mockReturnValue({
        error: 'Failed to fetch changes',
        type: 'http',
        status: 500,
      });

      const result = await getGitLabMRChanges(123, 42);

      expect(result).toHaveProperty('error', 'Failed to fetch changes');
      expect(mockHandleGitLabAPIError).toHaveBeenCalledWith(apiError);
    });

    it('should handle MR not found errors', async () => {
      const notFoundError = new Error('MR not found');
      mockGitlab.MergeRequests.showChanges.mockRejectedValue(notFoundError);
      mockHandleGitLabAPIError.mockReturnValue({
        error: 'Merge request not found',
        type: 'http',
        status: 404,
      });

      const result = await getGitLabMRChanges(123, 999);

      expect(result).toHaveProperty('error', 'Merge request not found');
      expect(result).toHaveProperty('status', 404);
    });

    it('should handle large diff errors', async () => {
      const largeDiffError = new Error('Diff too large');
      mockGitlab.MergeRequests.showChanges.mockRejectedValue(largeDiffError);
      mockHandleGitLabAPIError.mockReturnValue({
        error: 'Diff too large to display',
        type: 'http',
        status: 413,
        hints: ['Try fetching individual file changes'],
      });

      const result = await getGitLabMRChanges(123, 42);

      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('status', 413);
    });
  });

  // ============================================================================
  // transformGitLabMergeRequest Tests
  // ============================================================================

  describe('transformGitLabMergeRequest', () => {
    const createMockMR = (
      overrides: Partial<GitLabMergeRequest> = {}
    ): GitLabMergeRequest => ({
      id: 1001,
      iid: 42,
      project_id: 123,
      title: 'Test MR',
      description: 'Test description',
      state: 'opened',
      merged_by: null,
      merged_at: null,
      closed_by: null,
      closed_at: null,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-02T00:00:00Z',
      target_branch: 'main',
      source_branch: 'feature/test',
      user_notes_count: 5,
      upvotes: 2,
      downvotes: 0,
      author: {
        id: 1,
        username: 'testuser',
        name: 'Test User',
        avatar_url: 'https://gitlab.com/avatar.png',
        web_url: 'https://gitlab.com/testuser',
      },
      assignees: [],
      assignee: null,
      source_project_id: 123,
      target_project_id: 123,
      labels: [],
      draft: false,
      work_in_progress: false,
      milestone: null,
      merge_when_pipeline_succeeds: false,
      merge_status: 'can_be_merged',
      sha: 'abc123',
      merge_commit_sha: null,
      squash_commit_sha: null,
      web_url: 'https://gitlab.com/test/repo/-/merge_requests/42',
      ...overrides,
    });

    describe('state mapping', () => {
      it('should map "opened" state to "open"', () => {
        const mr = createMockMR({ state: 'opened' });
        const result = transformGitLabMergeRequest(mr);

        expect(result.state).toBe('open');
      });

      it('should map "closed" state to "closed"', () => {
        const mr = createMockMR({
          state: 'closed',
          closed_at: '2023-01-15T00:00:00Z',
        });
        const result = transformGitLabMergeRequest(mr);

        expect(result.state).toBe('closed');
        expect(result.closedAt).toBe('2023-01-15T00:00:00Z');
      });

      it('should map "merged" state to "merged"', () => {
        const mr = createMockMR({
          state: 'merged',
          merged_at: '2023-01-20T00:00:00Z',
        });
        const result = transformGitLabMergeRequest(mr);

        expect(result.state).toBe('merged');
        expect(result.mergedAt).toBe('2023-01-20T00:00:00Z');
      });
    });

    describe('basic field mapping', () => {
      it('should map iid to number (project-scoped like GitHub PR number)', () => {
        const mr = createMockMR({ iid: 42, id: 1001 });
        const result = transformGitLabMergeRequest(mr);

        expect(result.number).toBe(42);
      });

      it('should map title correctly', () => {
        const mr = createMockMR({ title: 'Feature: Add new component' });
        const result = transformGitLabMergeRequest(mr);

        expect(result.title).toBe('Feature: Add new component');
      });

      it('should map description to body', () => {
        const mr = createMockMR({ description: 'This is the MR description' });
        const result = transformGitLabMergeRequest(mr);

        expect(result.body).toBe('This is the MR description');
      });

      it('should handle null description', () => {
        const mr = createMockMR({ description: null });
        const result = transformGitLabMergeRequest(mr);

        expect(result.body).toBeNull();
      });

      it('should map web_url to url', () => {
        const mr = createMockMR({
          web_url: 'https://gitlab.com/group/project/-/merge_requests/42',
        });
        const result = transformGitLabMergeRequest(mr);

        expect(result.url).toBe(
          'https://gitlab.com/group/project/-/merge_requests/42'
        );
      });

      it('should map author username', () => {
        const mr = createMockMR({
          author: {
            id: 1,
            username: 'jsmith',
            name: 'John Smith',
            avatar_url: '',
            web_url: '',
          },
        });
        const result = transformGitLabMergeRequest(mr);

        expect(result.author).toBe('jsmith');
      });

      it('should map branch names', () => {
        const mr = createMockMR({
          source_branch: 'feature/new-login',
          target_branch: 'develop',
        });
        const result = transformGitLabMergeRequest(mr);

        expect(result.sourceBranch).toBe('feature/new-login');
        expect(result.targetBranch).toBe('develop');
      });

      it('should map timestamps', () => {
        const mr = createMockMR({
          created_at: '2023-01-01T10:00:00Z',
          updated_at: '2023-01-15T15:30:00Z',
        });
        const result = transformGitLabMergeRequest(mr);

        expect(result.createdAt).toBe('2023-01-01T10:00:00Z');
        expect(result.updatedAt).toBe('2023-01-15T15:30:00Z');
      });
    });

    describe('draft status', () => {
      it('should set draft to true when draft is true', () => {
        const mr = createMockMR({ draft: true, work_in_progress: false });
        const result = transformGitLabMergeRequest(mr);

        expect(result.draft).toBe(true);
      });

      it('should set draft to true when work_in_progress is true (legacy)', () => {
        const mr = createMockMR({ draft: false, work_in_progress: true });
        const result = transformGitLabMergeRequest(mr);

        expect(result.draft).toBe(true);
      });

      it('should set draft to false when both draft and work_in_progress are false', () => {
        const mr = createMockMR({ draft: false, work_in_progress: false });
        const result = transformGitLabMergeRequest(mr);

        expect(result.draft).toBe(false);
      });

      it('should set draft to true when both draft and work_in_progress are true', () => {
        const mr = createMockMR({ draft: true, work_in_progress: true });
        const result = transformGitLabMergeRequest(mr);

        expect(result.draft).toBe(true);
      });
    });

    describe('assignees mapping', () => {
      it('should map assignee usernames', () => {
        const mr = createMockMR({
          assignees: [
            { id: 1, username: 'reviewer1', name: 'Reviewer One' },
            { id: 2, username: 'reviewer2', name: 'Reviewer Two' },
          ],
        });
        const result = transformGitLabMergeRequest(mr);

        expect(result.assignees).toEqual(['reviewer1', 'reviewer2']);
      });

      it('should handle empty assignees', () => {
        const mr = createMockMR({ assignees: [] });
        const result = transformGitLabMergeRequest(mr);

        expect(result.assignees).toEqual([]);
      });

      it('should handle undefined assignees', () => {
        const mr = createMockMR();
        // @ts-expect-error - Testing undefined assignees case
        mr.assignees = undefined;
        const result = transformGitLabMergeRequest(mr);

        expect(result.assignees).toEqual([]);
      });
    });

    describe('labels mapping', () => {
      it('should map labels correctly', () => {
        const mr = createMockMR({
          labels: ['bug', 'priority::high', 'team::frontend'],
        });
        const result = transformGitLabMergeRequest(mr);

        expect(result.labels).toEqual([
          'bug',
          'priority::high',
          'team::frontend',
        ]);
      });

      it('should handle empty labels', () => {
        const mr = createMockMR({ labels: [] });
        const result = transformGitLabMergeRequest(mr);

        expect(result.labels).toEqual([]);
      });

      it('should handle undefined labels', () => {
        const mr = createMockMR();
        // @ts-expect-error - Testing undefined labels case
        mr.labels = undefined;
        const result = transformGitLabMergeRequest(mr);

        expect(result.labels).toEqual([]);
      });
    });

    describe('optional fields', () => {
      it('should include closedAt when present', () => {
        const mr = createMockMR({
          state: 'closed',
          closed_at: '2023-01-15T12:00:00Z',
        });
        const result = transformGitLabMergeRequest(mr);

        expect(result.closedAt).toBe('2023-01-15T12:00:00Z');
      });

      it('should not include closedAt when null', () => {
        const mr = createMockMR({
          state: 'opened',
          closed_at: null,
        });
        const result = transformGitLabMergeRequest(mr);

        expect(result.closedAt).toBeUndefined();
      });

      it('should include mergedAt when present', () => {
        const mr = createMockMR({
          state: 'merged',
          merged_at: '2023-01-20T14:30:00Z',
        });
        const result = transformGitLabMergeRequest(mr);

        expect(result.mergedAt).toBe('2023-01-20T14:30:00Z');
      });

      it('should not include mergedAt when null', () => {
        const mr = createMockMR({
          state: 'opened',
          merged_at: null,
        });
        const result = transformGitLabMergeRequest(mr);

        expect(result.mergedAt).toBeUndefined();
      });
    });

    describe('complete transformation', () => {
      it('should transform a complete MR with all fields', () => {
        const mr = createMockMR({
          iid: 100,
          title: 'Complete Feature',
          description: 'Full description of the feature',
          state: 'merged',
          merged_at: '2023-02-01T10:00:00Z',
          closed_at: '2023-02-01T10:00:00Z',
          created_at: '2023-01-15T08:00:00Z',
          updated_at: '2023-02-01T10:00:00Z',
          source_branch: 'feature/complete',
          target_branch: 'main',
          draft: false,
          work_in_progress: false,
          author: {
            id: 1,
            username: 'developer',
            name: 'Developer User',
            avatar_url: '',
            web_url: '',
          },
          assignees: [{ id: 2, username: 'reviewer', name: 'Reviewer User' }],
          labels: ['enhancement', 'documentation'],
          web_url: 'https://gitlab.com/org/repo/-/merge_requests/100',
        });

        const result = transformGitLabMergeRequest(mr);

        expect(result).toEqual({
          number: 100,
          title: 'Complete Feature',
          body: 'Full description of the feature',
          url: 'https://gitlab.com/org/repo/-/merge_requests/100',
          state: 'merged',
          draft: false,
          author: 'developer',
          assignees: ['reviewer'],
          labels: ['enhancement', 'documentation'],
          sourceBranch: 'feature/complete',
          targetBranch: 'main',
          createdAt: '2023-01-15T08:00:00Z',
          updatedAt: '2023-02-01T10:00:00Z',
          closedAt: '2023-02-01T10:00:00Z',
          mergedAt: '2023-02-01T10:00:00Z',
        });
      });
    });
  });
});

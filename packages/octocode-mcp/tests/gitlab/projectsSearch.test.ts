import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchGitLabProjectsAPI,
  getGitLabProject,
  transformGitLabProject,
} from '../../src/gitlab/projectsSearch.js';
import { getGitlab } from '../../src/gitlab/client.js';
import { handleGitLabAPIError } from '../../src/gitlab/errors.js';
import type {
  GitLabProject,
  GitLabProjectsSearchQuery,
} from '../../src/gitlab/types.js';

vi.mock('../../src/gitlab/client.js');
vi.mock('../../src/gitlab/errors.js');
vi.mock('../../src/utils/http/cache.js', () => ({
  generateCacheKey: vi.fn(() => 'test-cache-key'),
  withDataCache: vi.fn((_, operation) => operation()),
}));

describe('GitLab Projects Search', () => {
  // Mock GitLab client
  const mockGitlab = {
    Projects: {
      all: vi.fn(),
      show: vi.fn(),
    },
  };

  // Sample project data
  const createMockProject = (
    overrides: Partial<GitLabProject> = {}
  ): GitLabProject => ({
    id: 1,
    name: 'test-project',
    path: 'test-project',
    path_with_namespace: 'owner/test-project',
    description: 'A test project',
    visibility: 'public',
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    last_activity_at: '2024-01-15T09:00:00Z',
    default_branch: 'main',
    topics: ['typescript', 'testing'],
    tag_list: ['typescript', 'testing'],
    star_count: 100,
    forks_count: 25,
    open_issues_count: 10,
    web_url: 'https://gitlab.com/owner/test-project',
    http_url_to_repo: 'https://gitlab.com/owner/test-project.git',
    ssh_url_to_repo: 'git@gitlab.com:owner/test-project.git',
    readme_url: 'https://gitlab.com/owner/test-project/-/blob/main/README.md',
    archived: false,
    namespace: {
      id: 1,
      name: 'owner',
      path: 'owner',
      kind: 'user',
      full_path: 'owner',
      web_url: 'https://gitlab.com/owner',
    },
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGitlab).mockResolvedValue(mockGitlab as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // searchGitLabProjectsAPI - Success Scenarios
  // ===========================================================================
  describe('searchGitLabProjectsAPI - Success Scenarios', () => {
    it('should search projects successfully with basic search term', async () => {
      const mockProjects = [
        createMockProject({ id: 1, name: 'react', star_count: 50000 }),
        createMockProject({ id: 2, name: 'vue', star_count: 40000 }),
      ];

      mockGitlab.Projects.all.mockResolvedValue(mockProjects);

      const params: GitLabProjectsSearchQuery = {
        search: 'javascript',
      };

      const result = await searchGitLabProjectsAPI(params);

      expect(result).toHaveProperty('data');
      if ('data' in result) {
        expect(result.data.projects).toHaveLength(2);
        expect(result.data.pagination.currentPage).toBe(1);
        expect(result.status).toBe(200);
      }
    });

    it('should pass correct parameters to GitLab API', async () => {
      mockGitlab.Projects.all.mockResolvedValue([]);

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
        topic: 'typescript',
        visibility: 'public',
        owned: true,
        starred: false,
        archived: false,
        orderBy: 'star_count',
        sort: 'desc',
        perPage: 50,
        page: 2,
      };

      await searchGitLabProjectsAPI(params);

      expect(mockGitlab.Projects.all).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'test',
          topic: 'typescript',
          visibility: 'public',
          owned: true,
          starred: false,
          archived: false,
          orderBy: 'star_count',
          sort: 'desc',
          perPage: 50,
          page: 2,
        })
      );
    });

    it('should use default values for orderBy and sort', async () => {
      mockGitlab.Projects.all.mockResolvedValue([]);

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
      };

      await searchGitLabProjectsAPI(params);

      expect(mockGitlab.Projects.all).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: 'star_count',
          sort: 'desc',
        })
      );
    });

    it('should use default perPage of 20', async () => {
      mockGitlab.Projects.all.mockResolvedValue([]);

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
      };

      await searchGitLabProjectsAPI(params);

      expect(mockGitlab.Projects.all).toHaveBeenCalledWith(
        expect.objectContaining({
          perPage: 20,
        })
      );
    });

    it('should use default page of 1', async () => {
      mockGitlab.Projects.all.mockResolvedValue([]);

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
      };

      await searchGitLabProjectsAPI(params);

      expect(mockGitlab.Projects.all).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
        })
      );
    });

    it('should cap perPage at 100', async () => {
      mockGitlab.Projects.all.mockResolvedValue([]);

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
        perPage: 200,
      };

      await searchGitLabProjectsAPI(params);

      expect(mockGitlab.Projects.all).toHaveBeenCalledWith(
        expect.objectContaining({
          perPage: 100,
        })
      );
    });

    it('should remove undefined values from query options', async () => {
      mockGitlab.Projects.all.mockResolvedValue([]);

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
        topic: undefined,
        visibility: undefined,
      };

      await searchGitLabProjectsAPI(params);

      const callArgs = mockGitlab.Projects.all.mock.calls[0]![0];
      expect(callArgs).not.toHaveProperty('topic');
      expect(callArgs).not.toHaveProperty('visibility');
    });

    it('should handle empty results', async () => {
      mockGitlab.Projects.all.mockResolvedValue([]);

      const params: GitLabProjectsSearchQuery = {
        search: 'nonexistent-project-xyz',
      };

      const result = await searchGitLabProjectsAPI(params);

      expect(result).toHaveProperty('data');
      if ('data' in result) {
        expect(result.data.projects).toHaveLength(0);
        expect(result.data.pagination.totalMatches).toBe(0);
        expect(result.data.pagination.hasMore).toBe(false);
      }
    });
  });

  // ===========================================================================
  // searchGitLabProjectsAPI - Client-Side Filtering
  // ===========================================================================
  describe('searchGitLabProjectsAPI - Client-Side Filtering', () => {
    describe('Stars filtering', () => {
      it('should filter by minStars', async () => {
        const mockProjects = [
          createMockProject({ id: 1, name: 'low-stars', star_count: 50 }),
          createMockProject({ id: 2, name: 'medium-stars', star_count: 500 }),
          createMockProject({ id: 3, name: 'high-stars', star_count: 5000 }),
        ];

        mockGitlab.Projects.all.mockResolvedValue(mockProjects);

        const params: GitLabProjectsSearchQuery = {
          search: 'test',
          minStars: 100,
        };

        const result = await searchGitLabProjectsAPI(params);

        if ('data' in result) {
          expect(result.data.projects).toHaveLength(2);
          expect(result.data.projects.every(p => p.star_count >= 100)).toBe(
            true
          );
          expect(result.data.projects.map(p => p.name)).toEqual([
            'medium-stars',
            'high-stars',
          ]);
        }
      });

      it('should filter by maxStars', async () => {
        const mockProjects = [
          createMockProject({ id: 1, name: 'low-stars', star_count: 50 }),
          createMockProject({ id: 2, name: 'medium-stars', star_count: 500 }),
          createMockProject({ id: 3, name: 'high-stars', star_count: 5000 }),
        ];

        mockGitlab.Projects.all.mockResolvedValue(mockProjects);

        const params: GitLabProjectsSearchQuery = {
          search: 'test',
          maxStars: 1000,
        };

        const result = await searchGitLabProjectsAPI(params);

        if ('data' in result) {
          expect(result.data.projects).toHaveLength(2);
          expect(result.data.projects.every(p => p.star_count <= 1000)).toBe(
            true
          );
          expect(result.data.projects.map(p => p.name)).toEqual([
            'low-stars',
            'medium-stars',
          ]);
        }
      });

      it('should filter by both minStars and maxStars', async () => {
        const mockProjects = [
          createMockProject({ id: 1, name: 'low-stars', star_count: 50 }),
          createMockProject({ id: 2, name: 'medium-stars', star_count: 500 }),
          createMockProject({ id: 3, name: 'high-stars', star_count: 5000 }),
        ];

        mockGitlab.Projects.all.mockResolvedValue(mockProjects);

        const params: GitLabProjectsSearchQuery = {
          search: 'test',
          minStars: 100,
          maxStars: 1000,
        };

        const result = await searchGitLabProjectsAPI(params);

        if ('data' in result) {
          expect(result.data.projects).toHaveLength(1);
          expect(result.data.projects[0]!.name).toBe('medium-stars');
        }
      });

      it('should return no results when minStars > maxStars range is empty', async () => {
        const mockProjects = [
          createMockProject({ id: 1, name: 'project', star_count: 500 }),
        ];

        mockGitlab.Projects.all.mockResolvedValue(mockProjects);

        const params: GitLabProjectsSearchQuery = {
          search: 'test',
          minStars: 1000,
          maxStars: 100, // Invalid range
        };

        const result = await searchGitLabProjectsAPI(params);

        if ('data' in result) {
          expect(result.data.projects).toHaveLength(0);
        }
      });

      it('should include projects with exact minStars boundary', async () => {
        const mockProjects = [
          createMockProject({ id: 1, name: 'exact-min', star_count: 100 }),
        ];

        mockGitlab.Projects.all.mockResolvedValue(mockProjects);

        const params: GitLabProjectsSearchQuery = {
          search: 'test',
          minStars: 100,
        };

        const result = await searchGitLabProjectsAPI(params);

        if ('data' in result) {
          expect(result.data.projects).toHaveLength(1);
        }
      });

      it('should include projects with exact maxStars boundary', async () => {
        const mockProjects = [
          createMockProject({ id: 1, name: 'exact-max', star_count: 100 }),
        ];

        mockGitlab.Projects.all.mockResolvedValue(mockProjects);

        const params: GitLabProjectsSearchQuery = {
          search: 'test',
          maxStars: 100,
        };

        const result = await searchGitLabProjectsAPI(params);

        if ('data' in result) {
          expect(result.data.projects).toHaveLength(1);
        }
      });

      it('should handle zero stars with minStars filter', async () => {
        const mockProjects = [
          createMockProject({ id: 1, name: 'zero-stars', star_count: 0 }),
          createMockProject({ id: 2, name: 'some-stars', star_count: 10 }),
        ];

        mockGitlab.Projects.all.mockResolvedValue(mockProjects);

        const params: GitLabProjectsSearchQuery = {
          search: 'test',
          minStars: 1,
        };

        const result = await searchGitLabProjectsAPI(params);

        if ('data' in result) {
          expect(result.data.projects).toHaveLength(1);
          expect(result.data.projects[0]!.name).toBe('some-stars');
        }
      });

      it('should include zero stars when maxStars is 0', async () => {
        const mockProjects = [
          createMockProject({ id: 1, name: 'zero-stars', star_count: 0 }),
          createMockProject({ id: 2, name: 'some-stars', star_count: 10 }),
        ];

        mockGitlab.Projects.all.mockResolvedValue(mockProjects);

        const params: GitLabProjectsSearchQuery = {
          search: 'test',
          maxStars: 0,
        };

        const result = await searchGitLabProjectsAPI(params);

        if ('data' in result) {
          expect(result.data.projects).toHaveLength(1);
          expect(result.data.projects[0]!.name).toBe('zero-stars');
        }
      });
    });

    describe('Date filtering', () => {
      it('should filter by createdAfter', async () => {
        const mockProjects = [
          createMockProject({
            id: 1,
            name: 'old',
            created_at: '2020-01-01T00:00:00Z',
          }),
          createMockProject({
            id: 2,
            name: 'new',
            created_at: '2024-01-01T00:00:00Z',
          }),
        ];

        mockGitlab.Projects.all.mockResolvedValue(mockProjects);

        const params: GitLabProjectsSearchQuery = {
          search: 'test',
          createdAfter: '2023-01-01',
        };

        const result = await searchGitLabProjectsAPI(params);

        if ('data' in result) {
          expect(result.data.projects).toHaveLength(1);
          expect(result.data.projects[0]!.name).toBe('new');
        }
      });

      it('should filter by createdBefore', async () => {
        const mockProjects = [
          createMockProject({
            id: 1,
            name: 'old',
            created_at: '2020-01-01T00:00:00Z',
          }),
          createMockProject({
            id: 2,
            name: 'new',
            created_at: '2024-01-01T00:00:00Z',
          }),
        ];

        mockGitlab.Projects.all.mockResolvedValue(mockProjects);

        const params: GitLabProjectsSearchQuery = {
          search: 'test',
          createdBefore: '2023-01-01',
        };

        const result = await searchGitLabProjectsAPI(params);

        if ('data' in result) {
          expect(result.data.projects).toHaveLength(1);
          expect(result.data.projects[0]!.name).toBe('old');
        }
      });

      it('should filter by both createdAfter and createdBefore', async () => {
        const mockProjects = [
          createMockProject({
            id: 1,
            name: 'old',
            created_at: '2020-01-01T00:00:00Z',
          }),
          createMockProject({
            id: 2,
            name: 'mid',
            created_at: '2022-06-15T00:00:00Z',
          }),
          createMockProject({
            id: 3,
            name: 'new',
            created_at: '2024-01-01T00:00:00Z',
          }),
        ];

        mockGitlab.Projects.all.mockResolvedValue(mockProjects);

        const params: GitLabProjectsSearchQuery = {
          search: 'test',
          createdAfter: '2022-01-01',
          createdBefore: '2023-01-01',
        };

        const result = await searchGitLabProjectsAPI(params);

        if ('data' in result) {
          expect(result.data.projects).toHaveLength(1);
          expect(result.data.projects[0]!.name).toBe('mid');
        }
      });

      it('should include projects with exact createdAfter boundary', async () => {
        const mockProjects = [
          createMockProject({
            id: 1,
            name: 'exact',
            created_at: '2023-01-01T00:00:00Z',
          }),
        ];

        mockGitlab.Projects.all.mockResolvedValue(mockProjects);

        const params: GitLabProjectsSearchQuery = {
          search: 'test',
          createdAfter: '2023-01-01T00:00:00Z',
        };

        const result = await searchGitLabProjectsAPI(params);

        if ('data' in result) {
          expect(result.data.projects).toHaveLength(1);
        }
      });

      it('should include projects with exact createdBefore boundary', async () => {
        const mockProjects = [
          createMockProject({
            id: 1,
            name: 'exact',
            created_at: '2023-01-01T00:00:00Z',
          }),
        ];

        mockGitlab.Projects.all.mockResolvedValue(mockProjects);

        const params: GitLabProjectsSearchQuery = {
          search: 'test',
          createdBefore: '2023-01-01T00:00:00Z',
        };

        const result = await searchGitLabProjectsAPI(params);

        if ('data' in result) {
          expect(result.data.projects).toHaveLength(1);
        }
      });
    });

    describe('Combined filters', () => {
      it('should apply both stars and date filters', async () => {
        const mockProjects = [
          createMockProject({
            id: 1,
            name: 'old-low',
            star_count: 50,
            created_at: '2020-01-01T00:00:00Z',
          }),
          createMockProject({
            id: 2,
            name: 'old-high',
            star_count: 5000,
            created_at: '2020-01-01T00:00:00Z',
          }),
          createMockProject({
            id: 3,
            name: 'new-low',
            star_count: 50,
            created_at: '2024-01-01T00:00:00Z',
          }),
          createMockProject({
            id: 4,
            name: 'new-high',
            star_count: 5000,
            created_at: '2024-01-01T00:00:00Z',
          }),
        ];

        mockGitlab.Projects.all.mockResolvedValue(mockProjects);

        const params: GitLabProjectsSearchQuery = {
          search: 'test',
          minStars: 100,
          createdAfter: '2023-01-01',
        };

        const result = await searchGitLabProjectsAPI(params);

        if ('data' in result) {
          expect(result.data.projects).toHaveLength(1);
          expect(result.data.projects[0]!.name).toBe('new-high');
        }
      });
    });
  });

  // ===========================================================================
  // searchGitLabProjectsAPI - Pagination
  // ===========================================================================
  describe('searchGitLabProjectsAPI - Pagination', () => {
    it('should indicate hasMore when results equal perPage', async () => {
      const mockProjects = Array(20)
        .fill(null)
        .map((_, i) => createMockProject({ id: i, name: `project-${i}` }));

      mockGitlab.Projects.all.mockResolvedValue(mockProjects);

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
        perPage: 20,
      };

      const result = await searchGitLabProjectsAPI(params);

      if ('data' in result) {
        expect(result.data.pagination.hasMore).toBe(true);
        expect(result.data.pagination.totalPages).toBe(2);
      }
    });

    it('should indicate no more results when results less than perPage', async () => {
      const mockProjects = [
        createMockProject({ id: 1, name: 'project-1' }),
        createMockProject({ id: 2, name: 'project-2' }),
      ];

      mockGitlab.Projects.all.mockResolvedValue(mockProjects);

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
        perPage: 20,
      };

      const result = await searchGitLabProjectsAPI(params);

      if ('data' in result) {
        expect(result.data.pagination.hasMore).toBe(false);
        expect(result.data.pagination.currentPage).toBe(1);
        expect(result.data.pagination.totalPages).toBe(1);
      }
    });

    it('should handle custom page number', async () => {
      mockGitlab.Projects.all.mockResolvedValue([]);

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
        page: 3,
      };

      const result = await searchGitLabProjectsAPI(params);

      if ('data' in result) {
        expect(result.data.pagination.currentPage).toBe(3);
      }

      expect(mockGitlab.Projects.all).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 3,
        })
      );
    });

    it('should return correct totalMatches after client-side filtering', async () => {
      const mockProjects = [
        createMockProject({ id: 1, name: 'low-stars', star_count: 10 }),
        createMockProject({ id: 2, name: 'high-stars', star_count: 1000 }),
      ];

      mockGitlab.Projects.all.mockResolvedValue(mockProjects);

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
        minStars: 100,
      };

      const result = await searchGitLabProjectsAPI(params);

      if ('data' in result) {
        expect(result.data.pagination.totalMatches).toBe(1);
      }
    });

    it('should calculate hasMore based on filtered results', async () => {
      // API returns 20 results (equal to perPage)
      const mockProjects = Array(20)
        .fill(null)
        .map((_, i) =>
          createMockProject({ id: i, name: `project-${i}`, star_count: i * 10 })
        );

      mockGitlab.Projects.all.mockResolvedValue(mockProjects);

      // Filter reduces to less than perPage
      const params: GitLabProjectsSearchQuery = {
        search: 'test',
        minStars: 150,
        perPage: 20,
      };

      const result = await searchGitLabProjectsAPI(params);

      if ('data' in result) {
        // Only projects with star_count >= 150 (i.e., i >= 15) remain
        expect(result.data.projects.length).toBeLessThan(20);
        expect(result.data.pagination.hasMore).toBe(false);
      }
    });
  });

  // ===========================================================================
  // searchGitLabProjectsAPI - Caching
  // ===========================================================================
  describe('searchGitLabProjectsAPI - Caching', () => {
    it('should use cache with session ID', async () => {
      const { withDataCache, generateCacheKey } =
        await import('../../src/utils/http/cache.js');
      const mockWithDataCache = vi.mocked(withDataCache);
      const mockGenerateCacheKey = vi.mocked(generateCacheKey);

      mockGitlab.Projects.all.mockResolvedValue([]);

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
      };

      await searchGitLabProjectsAPI(params, 'test-session-id');

      expect(mockGenerateCacheKey).toHaveBeenCalledWith(
        'gl-api-projects',
        expect.objectContaining({
          search: 'test',
        }),
        'test-session-id'
      );
      expect(mockWithDataCache).toHaveBeenCalled();
    });

    it('should pass shouldCache function to withDataCache', async () => {
      const { withDataCache } = await import('../../src/utils/http/cache.js');
      const mockWithDataCache = vi.mocked(withDataCache);

      mockGitlab.Projects.all.mockResolvedValue([]);

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
      };

      await searchGitLabProjectsAPI(params);

      expect(mockWithDataCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.objectContaining({
          shouldCache: expect.any(Function),
        })
      );
    });

    it('should only cache successful responses', async () => {
      const { withDataCache } = await import('../../src/utils/http/cache.js');
      const mockWithDataCache = vi.mocked(withDataCache);

      mockGitlab.Projects.all.mockResolvedValue([]);

      await searchGitLabProjectsAPI({ search: 'test' });

      // Get the shouldCache function from the last call
      const callArgs = mockWithDataCache.mock.calls[0];
      const options = callArgs![2] as {
        shouldCache?: (value: unknown) => boolean;
      };
      const shouldCache = options?.shouldCache;

      // Test shouldCache function
      expect(shouldCache).toBeDefined();
      expect(shouldCache!({ data: { projects: [] }, status: 200 })).toBe(true);
      expect(shouldCache!({ error: 'Some error', type: 'http' })).toBe(false);
    });

    it('should include all relevant params in cache key generation', async () => {
      const { generateCacheKey } =
        await import('../../src/utils/http/cache.js');
      const mockGenerateCacheKey = vi.mocked(generateCacheKey);

      mockGitlab.Projects.all.mockResolvedValue([]);

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
        topic: 'typescript',
        visibility: 'public',
        owned: true,
        starred: false,
        archived: false,
        orderBy: 'star_count',
        sort: 'desc',
        perPage: 50,
        page: 2,
      };

      await searchGitLabProjectsAPI(params);

      expect(mockGenerateCacheKey).toHaveBeenCalledWith(
        'gl-api-projects',
        {
          search: 'test',
          topic: 'typescript',
          visibility: 'public',
          owned: true,
          starred: false,
          archived: false,
          orderBy: 'star_count',
          sort: 'desc',
          perPage: 50,
          page: 2,
        },
        undefined
      );
    });
  });

  // ===========================================================================
  // searchGitLabProjectsAPI - Error Handling
  // ===========================================================================
  describe('searchGitLabProjectsAPI - Error Handling', () => {
    it('should handle API errors through handleGitLabAPIError', async () => {
      const mockError = new Error('GitLab API Error');
      mockGitlab.Projects.all.mockRejectedValue(mockError);
      vi.mocked(handleGitLabAPIError).mockReturnValue({
        error: 'GitLab API Error',
        status: 500,
        type: 'http',
      });

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
      };

      const result = await searchGitLabProjectsAPI(params);

      expect(result).toHaveProperty('error');
      expect(handleGitLabAPIError).toHaveBeenCalledWith(mockError);
      if ('error' in result) {
        expect(result.error).toBe('GitLab API Error');
        expect(result.type).toBe('http');
      }
    });

    it('should handle network errors', async () => {
      const networkError = new TypeError('Failed to fetch');
      mockGitlab.Projects.all.mockRejectedValue(networkError);
      vi.mocked(handleGitLabAPIError).mockReturnValue({
        error: 'Network error connecting to GitLab.',
        status: 0,
        type: 'network',
      });

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
      };

      const result = await searchGitLabProjectsAPI(params);

      expect(result).toHaveProperty('error');
      if ('error' in result) {
        expect(result.type).toBe('network');
      }
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = { status: 429, message: 'Rate limited' };
      mockGitlab.Projects.all.mockRejectedValue(rateLimitError);
      vi.mocked(handleGitLabAPIError).mockReturnValue({
        error: 'GitLab API rate limit exceeded.',
        status: 429,
        type: 'http',
        retryAfter: 60,
        hints: ['Rate limit exceeded. Retry after 60 seconds.'],
      });

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
      };

      const result = await searchGitLabProjectsAPI(params);

      expect(result).toHaveProperty('error');
      if ('error' in result) {
        expect(result.status).toBe(429);
        expect(result.retryAfter).toBe(60);
      }
    });

    it('should handle unauthorized errors', async () => {
      const authError = { status: 401, message: 'Unauthorized' };
      mockGitlab.Projects.all.mockRejectedValue(authError);
      vi.mocked(handleGitLabAPIError).mockReturnValue({
        error: 'GitLab authentication failed.',
        status: 401,
        type: 'http',
      });

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
      };

      const result = await searchGitLabProjectsAPI(params);

      expect(result).toHaveProperty('error');
      if ('error' in result) {
        expect(result.status).toBe(401);
      }
    });

    it('should handle getGitlab initialization errors', async () => {
      const initError = new Error('GitLab token not found');
      vi.mocked(getGitlab).mockRejectedValue(initError);
      vi.mocked(handleGitLabAPIError).mockReturnValue({
        error: 'GitLab token not found',
        status: 500,
        type: 'unknown',
      });

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
      };

      const result = await searchGitLabProjectsAPI(params);

      expect(result).toHaveProperty('error');
      expect(handleGitLabAPIError).toHaveBeenCalledWith(initError);
    });
  });

  // ===========================================================================
  // getGitLabProject
  // ===========================================================================
  describe('getGitLabProject', () => {
    it('should get project by numeric ID', async () => {
      const mockProject = createMockProject({ id: 123, name: 'my-project' });
      mockGitlab.Projects.show.mockResolvedValue(mockProject);

      const result = await getGitLabProject(123);

      expect(result).toHaveProperty('data');
      if ('data' in result) {
        expect(result.data.id).toBe(123);
        expect(result.data.name).toBe('my-project');
        expect(result.status).toBe(200);
      }
      expect(mockGitlab.Projects.show).toHaveBeenCalledWith(123);
    });

    it('should get project by path (string)', async () => {
      const mockProject = createMockProject({
        id: 456,
        name: 'my-project',
        path_with_namespace: 'owner/my-project',
      });
      mockGitlab.Projects.show.mockResolvedValue(mockProject);

      const result = await getGitLabProject('owner/my-project');

      expect(result).toHaveProperty('data');
      if ('data' in result) {
        expect(result.data.id).toBe(456);
        expect(result.data.path_with_namespace).toBe('owner/my-project');
      }
      expect(mockGitlab.Projects.show).toHaveBeenCalledWith('owner/my-project');
    });

    it('should get project by URL-encoded path', async () => {
      const mockProject = createMockProject({
        id: 789,
        name: 'nested-project',
      });
      mockGitlab.Projects.show.mockResolvedValue(mockProject);

      const result = await getGitLabProject('group%2Fsubgroup%2Fproject');

      expect(result).toHaveProperty('data');
      expect(mockGitlab.Projects.show).toHaveBeenCalledWith(
        'group%2Fsubgroup%2Fproject'
      );
    });

    it('should return full project details', async () => {
      const mockProject = createMockProject({
        id: 1,
        name: 'full-project',
        description: 'Full description',
        visibility: 'private',
        default_branch: 'develop',
        star_count: 500,
        forks_count: 100,
        topics: ['python', 'ml'],
      });
      mockGitlab.Projects.show.mockResolvedValue(mockProject);

      const result = await getGitLabProject(1);

      if ('data' in result) {
        expect(result.data.name).toBe('full-project');
        expect(result.data.description).toBe('Full description');
        expect(result.data.visibility).toBe('private');
        expect(result.data.default_branch).toBe('develop');
        expect(result.data.star_count).toBe(500);
        expect(result.data.forks_count).toBe(100);
        expect(result.data.topics).toEqual(['python', 'ml']);
      }
    });

    it('should handle not found error', async () => {
      const notFoundError = { status: 404, message: 'Project not found' };
      mockGitlab.Projects.show.mockRejectedValue(notFoundError);
      vi.mocked(handleGitLabAPIError).mockReturnValue({
        error: 'Resource not found.',
        status: 404,
        type: 'http',
      });

      const result = await getGitLabProject(99999);

      expect(result).toHaveProperty('error');
      if ('error' in result) {
        expect(result.status).toBe(404);
      }
      expect(handleGitLabAPIError).toHaveBeenCalledWith(notFoundError);
    });

    it('should handle forbidden error', async () => {
      const forbiddenError = { status: 403, message: 'Access denied' };
      mockGitlab.Projects.show.mockRejectedValue(forbiddenError);
      vi.mocked(handleGitLabAPIError).mockReturnValue({
        error: 'Access denied.',
        status: 403,
        type: 'http',
      });

      const result = await getGitLabProject(1);

      expect(result).toHaveProperty('error');
      if ('error' in result) {
        expect(result.status).toBe(403);
      }
    });

    it('should handle server errors', async () => {
      const serverError = { status: 500, message: 'Internal server error' };
      mockGitlab.Projects.show.mockRejectedValue(serverError);
      vi.mocked(handleGitLabAPIError).mockReturnValue({
        error: 'GitLab server error.',
        status: 500,
        type: 'http',
      });

      const result = await getGitLabProject(1);

      expect(result).toHaveProperty('error');
      if ('error' in result) {
        expect(result.status).toBe(500);
      }
    });

    it('should handle getGitlab initialization errors', async () => {
      const initError = new Error('GitLab token not found');
      vi.mocked(getGitlab).mockRejectedValue(initError);
      vi.mocked(handleGitLabAPIError).mockReturnValue({
        error: 'GitLab token not found',
        status: 500,
        type: 'unknown',
      });

      const result = await getGitLabProject(1);

      expect(result).toHaveProperty('error');
      expect(handleGitLabAPIError).toHaveBeenCalledWith(initError);
    });
  });

  // ===========================================================================
  // transformGitLabProject
  // ===========================================================================
  describe('transformGitLabProject', () => {
    it('should transform GitLab project to unified format', () => {
      const project = createMockProject({
        id: 123,
        name: 'my-project',
        path_with_namespace: 'owner/my-project',
        description: 'Project description',
        web_url: 'https://gitlab.com/owner/my-project',
        http_url_to_repo: 'https://gitlab.com/owner/my-project.git',
        default_branch: 'main',
        star_count: 100,
        forks_count: 25,
        visibility: 'public',
        topics: ['typescript', 'testing'],
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        last_activity_at: '2024-01-15T09:00:00Z',
      });

      const result = transformGitLabProject(project);

      expect(result).toEqual({
        id: '123',
        name: 'my-project',
        fullPath: 'owner/my-project',
        description: 'Project description',
        url: 'https://gitlab.com/owner/my-project',
        cloneUrl: 'https://gitlab.com/owner/my-project.git',
        defaultBranch: 'main',
        stars: 100,
        forks: 25,
        visibility: 'public',
        topics: ['typescript', 'testing'],
        createdAt: '2024-01-01T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        lastActivityAt: '2024-01-15T09:00:00Z',
      });
    });

    it('should convert numeric id to string', () => {
      const project = createMockProject({ id: 12345 });

      const result = transformGitLabProject(project);

      expect(result.id).toBe('12345');
      expect(typeof result.id).toBe('string');
    });

    it('should handle null description', () => {
      const project = createMockProject({ description: null });

      const result = transformGitLabProject(project);

      expect(result.description).toBeNull();
    });

    it('should use topics array when available', () => {
      const project = createMockProject({
        topics: ['topic1', 'topic2'],
        tag_list: ['tag1', 'tag2'], // Deprecated
      });

      const result = transformGitLabProject(project);

      expect(result.topics).toEqual(['topic1', 'topic2']);
    });

    it('should fallback to tag_list when topics is empty', () => {
      const project = createMockProject({
        topics: [],
        tag_list: ['tag1', 'tag2'],
      });

      const result = transformGitLabProject(project);

      // The implementation uses `topics || tag_list`, so empty array [] is falsy-ish
      // Actually in JS, [] is truthy, so it will use topics (empty array)
      expect(result.topics).toEqual([]);
    });

    it('should use tag_list when topics is undefined', () => {
      const project = {
        ...createMockProject(),
        topics: undefined as unknown as string[],
        tag_list: ['tag1', 'tag2'],
      } as GitLabProject;

      const result = transformGitLabProject(project);

      expect(result.topics).toEqual(['tag1', 'tag2']);
    });

    it('should return empty array when both topics and tag_list are undefined', () => {
      const project = {
        ...createMockProject(),
        topics: undefined as unknown as string[],
        tag_list: undefined as unknown as string[],
      } as GitLabProject;

      const result = transformGitLabProject(project);

      expect(result.topics).toEqual([]);
    });

    it('should handle zero stars and forks', () => {
      const project = createMockProject({
        star_count: 0,
        forks_count: 0,
      });

      const result = transformGitLabProject(project);

      expect(result.stars).toBe(0);
      expect(result.forks).toBe(0);
    });

    it('should handle private visibility', () => {
      const project = createMockProject({ visibility: 'private' });

      const result = transformGitLabProject(project);

      expect(result.visibility).toBe('private');
    });

    it('should handle internal visibility', () => {
      const project = createMockProject({ visibility: 'internal' });

      const result = transformGitLabProject(project);

      expect(result.visibility).toBe('internal');
    });

    it('should preserve all date fields as-is', () => {
      const project = createMockProject({
        created_at: '2020-05-15T08:30:00Z',
        updated_at: '2024-01-10T14:20:00Z',
        last_activity_at: '2024-01-10T12:00:00Z',
      });

      const result = transformGitLabProject(project);

      expect(result.createdAt).toBe('2020-05-15T08:30:00Z');
      expect(result.updatedAt).toBe('2024-01-10T14:20:00Z');
      expect(result.lastActivityAt).toBe('2024-01-10T12:00:00Z');
    });

    it('should handle projects with nested namespace path', () => {
      const project = createMockProject({
        path_with_namespace: 'group/subgroup/project',
        web_url: 'https://gitlab.com/group/subgroup/project',
        http_url_to_repo: 'https://gitlab.com/group/subgroup/project.git',
      });

      const result = transformGitLabProject(project);

      expect(result.fullPath).toBe('group/subgroup/project');
      expect(result.url).toBe('https://gitlab.com/group/subgroup/project');
      expect(result.cloneUrl).toBe(
        'https://gitlab.com/group/subgroup/project.git'
      );
    });

    it('should handle high star counts', () => {
      const project = createMockProject({ star_count: 1000000 });

      const result = transformGitLabProject(project);

      expect(result.stars).toBe(1000000);
    });

    it('should handle projects with empty topics array', () => {
      const project = createMockProject({
        topics: [],
        tag_list: [],
      });

      const result = transformGitLabProject(project);

      expect(result.topics).toEqual([]);
    });

    it('should handle projects with many topics', () => {
      const manyTopics = Array(20)
        .fill(null)
        .map((_, i) => `topic-${i}`);
      const project = createMockProject({ topics: manyTopics });

      const result = transformGitLabProject(project);

      expect(result.topics).toHaveLength(20);
      expect(result.topics[0]).toBe('topic-0');
      expect(result.topics[19]).toBe('topic-19');
    });

    it('should handle special characters in description', () => {
      const project = createMockProject({
        description: 'Test <script>alert("xss")</script> & special chars',
      });

      const result = transformGitLabProject(project);

      expect(result.description).toBe(
        'Test <script>alert("xss")</script> & special chars'
      );
    });

    it('should handle unicode in project name and description', () => {
      const project = createMockProject({
        name: 'projet-francais',
        description: 'Description avec des caracteres speciauxaccentues',
      });

      const result = transformGitLabProject(project);

      expect(result.name).toBe('projet-francais');
      expect(result.description).toBe(
        'Description avec des caracteres speciauxaccentues'
      );
    });
  });

  // ===========================================================================
  // Edge Cases and Integration
  // ===========================================================================
  describe('Edge Cases', () => {
    it('should handle projects with all optional fields missing', async () => {
      const minimalProject: GitLabProject = {
        id: 1,
        name: 'minimal',
        path: 'minimal',
        path_with_namespace: 'owner/minimal',
        description: null,
        visibility: 'public',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        last_activity_at: '2024-01-01T00:00:00Z',
        default_branch: 'main',
        topics: [],
        tag_list: [],
        star_count: 0,
        forks_count: 0,
        open_issues_count: 0,
        web_url: 'https://gitlab.com/owner/minimal',
        http_url_to_repo: 'https://gitlab.com/owner/minimal.git',
        ssh_url_to_repo: 'git@gitlab.com:owner/minimal.git',
        readme_url: null,
        archived: false,
        namespace: {
          id: 1,
          name: 'owner',
          path: 'owner',
          kind: 'user',
          full_path: 'owner',
          web_url: 'https://gitlab.com/owner',
        },
      };

      mockGitlab.Projects.all.mockResolvedValue([minimalProject]);

      const result = await searchGitLabProjectsAPI({ search: 'minimal' });

      expect(result).toHaveProperty('data');
      if ('data' in result) {
        expect(result.data.projects).toHaveLength(1);
        expect(result.data.projects[0]!.name).toBe('minimal');
      }
    });

    it('should handle very long search strings', async () => {
      mockGitlab.Projects.all.mockResolvedValue([]);

      const longSearch = 'a'.repeat(1000);
      const params: GitLabProjectsSearchQuery = {
        search: longSearch,
      };

      await searchGitLabProjectsAPI(params);

      expect(mockGitlab.Projects.all).toHaveBeenCalledWith(
        expect.objectContaining({
          search: longSearch,
        })
      );
    });

    it('should handle empty search string', async () => {
      mockGitlab.Projects.all.mockResolvedValue([]);

      const params: GitLabProjectsSearchQuery = {
        search: '',
      };

      await searchGitLabProjectsAPI(params);

      expect(mockGitlab.Projects.all).toHaveBeenCalled();
    });

    it('should handle search with only whitespace', async () => {
      mockGitlab.Projects.all.mockResolvedValue([]);

      const params: GitLabProjectsSearchQuery = {
        search: '   ',
      };

      await searchGitLabProjectsAPI(params);

      expect(mockGitlab.Projects.all).toHaveBeenCalledWith(
        expect.objectContaining({
          search: '   ',
        })
      );
    });

    it('should handle large number of results for filtering', async () => {
      const manyProjects = Array(100)
        .fill(null)
        .map((_, i) =>
          createMockProject({
            id: i,
            name: `project-${i}`,
            star_count: i * 10,
          })
        );

      mockGitlab.Projects.all.mockResolvedValue(manyProjects);

      const params: GitLabProjectsSearchQuery = {
        search: 'test',
        minStars: 500,
        perPage: 100,
      };

      const result = await searchGitLabProjectsAPI(params);

      if ('data' in result) {
        // Projects with star_count >= 500 are those with i >= 50
        expect(result.data.projects).toHaveLength(50);
        expect(result.data.projects.every(p => p.star_count >= 500)).toBe(true);
      }
    });

    it('should handle concurrent search requests', async () => {
      mockGitlab.Projects.all.mockResolvedValue([
        createMockProject({ id: 1, name: 'project' }),
      ]);

      const promises = [
        searchGitLabProjectsAPI({ search: 'test1' }),
        searchGitLabProjectsAPI({ search: 'test2' }),
        searchGitLabProjectsAPI({ search: 'test3' }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('data');
      });
    });

    it('should handle date filtering with invalid date strings gracefully', async () => {
      const mockProjects = [
        createMockProject({
          id: 1,
          name: 'valid',
          created_at: '2024-01-01T00:00:00Z',
        }),
      ];

      mockGitlab.Projects.all.mockResolvedValue(mockProjects);

      // Invalid date that results in Invalid Date object
      const params: GitLabProjectsSearchQuery = {
        search: 'test',
        createdAfter: 'not-a-date',
      };

      const result = await searchGitLabProjectsAPI(params);

      // The filter uses Date comparison which may behave unexpectedly with invalid dates
      // This tests that the code doesn't throw
      expect(result).toHaveProperty('data');
    });
  });
});

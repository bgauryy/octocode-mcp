import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchGitHubReposAPI } from '../../src/github/repoSearch.js';
import { getOctokit } from '../../src/github/client.js';
import { handleGitHubAPIError } from '../../src/github/errors.js';
import { buildRepoSearchQuery } from '../../src/github/queryBuilders.js';
import type { GitHubReposSearchQuery } from '../../src/types.js';

vi.mock('../../src/github/client.js');
vi.mock('../../src/github/errors.js');
vi.mock('../../src/github/queryBuilders.js');
vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(() => 'test-cache-key'),
  withDataCache: vi.fn((_, operation) => operation()),
}));

describe('GitHub Repository Search', () => {
  const mockOctokit = {
    rest: {
      search: {
        repos: vi.fn(),
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getOctokit).mockResolvedValue(mockOctokit as any);
    vi.mocked(buildRepoSearchQuery).mockReturnValue('test query');
  });

  describe('searchGitHubReposAPI - Success Scenarios', () => {
    it('should search repositories successfully', async () => {
      const mockResponse = {
        data: {
          items: [
            {
              full_name: 'facebook/react',
              stargazers_count: 50000,
              description: 'A JavaScript library for building user interfaces',
              html_url: 'https://github.com/facebook/react',
              updated_at: '2024-01-15T10:30:00Z',
            },
            {
              full_name: 'vuejs/vue',
              stargazers_count: 40000,
              description: 'Vue.js framework',
              html_url: 'https://github.com/vuejs/vue',
              updated_at: '2024-01-14T08:20:00Z',
            },
          ],
        },
        headers: {},
      };

      mockOctokit.rest.search.repos.mockResolvedValue(mockResponse);

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['react', 'javascript'],
      };

      const result = await searchGitHubReposAPI(params);

      expect(result).toHaveProperty('data');
      if ('data' in result) {
        expect(result.data).toHaveProperty('repositories');
        expect(result.data.repositories).toHaveLength(2);
        expect(result.data.repositories[0]).toEqual({
          owner: 'facebook',
          repo: 'react',
          stars: 50000,
          description: 'A JavaScript library for building user interfaces',
          url: 'https://github.com/facebook/react',
          updatedAt: expect.any(String),
        });
      }
    });

    it('should handle empty query with validation error', async () => {
      vi.mocked(buildRepoSearchQuery).mockReturnValue('');

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: [],
      };

      const result = await searchGitHubReposAPI(params);

      expect(result).toHaveProperty('error');
      if ('error' in result) {
        expect(result.error).toContain('Search query cannot be empty');
        expect(result.type).toBe('http');
        expect(result.status).toBe(400);
      }
    });

    it('should handle query with only whitespace', async () => {
      vi.mocked(buildRepoSearchQuery).mockReturnValue('   ');

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: [''],
      };

      const result = await searchGitHubReposAPI(params);

      expect(result).toHaveProperty('error');
      if ('error' in result) {
        expect(result.error).toContain('Search query cannot be empty');
      }
    });

    it('should truncate long descriptions', async () => {
      const longDescription = 'A'.repeat(200);
      const mockResponse = {
        data: {
          items: [
            {
              full_name: 'test/repo',
              stargazers_count: 100,
              description: longDescription,
              html_url: 'https://github.com/test/repo',
              updated_at: '2024-01-15T10:30:00Z',
            },
          ],
        },
        headers: {},
      };

      mockOctokit.rest.search.repos.mockResolvedValue(mockResponse);

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['test'],
      };

      const result = await searchGitHubReposAPI(params);

      if ('data' in result) {
        expect(result.data.repositories[0]!.description).toHaveLength(153); // 150 + '...'
        expect(result.data.repositories[0]!.description.endsWith('...')).toBe(
          true
        );
      }
    });

    it('should handle repos without description', async () => {
      const mockResponse = {
        data: {
          items: [
            {
              full_name: 'test/repo',
              stargazers_count: 100,
              description: null,
              html_url: 'https://github.com/test/repo',
              updated_at: '2024-01-15T10:30:00Z',
            },
          ],
        },
        headers: {},
      };

      mockOctokit.rest.search.repos.mockResolvedValue(mockResponse);

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['test'],
      };

      const result = await searchGitHubReposAPI(params);

      if ('data' in result) {
        expect(result.data.repositories[0]!.description).toBe('No description');
      }
    });

    it('should sort by stars descending', async () => {
      const mockResponse = {
        data: {
          items: [
            {
              full_name: 'low/stars',
              stargazers_count: 100,
              description: 'Low stars',
              html_url: 'https://github.com/low/stars',
              updated_at: '2024-01-15T10:30:00Z',
            },
            {
              full_name: 'high/stars',
              stargazers_count: 50000,
              description: 'High stars',
              html_url: 'https://github.com/high/stars',
              updated_at: '2024-01-15T10:30:00Z',
            },
            {
              full_name: 'medium/stars',
              stargazers_count: 1000,
              description: 'Medium stars',
              html_url: 'https://github.com/medium/stars',
              updated_at: '2024-01-15T10:30:00Z',
            },
          ],
        },
        headers: {},
      };

      mockOctokit.rest.search.repos.mockResolvedValue(mockResponse);

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['test'],
      };

      const result = await searchGitHubReposAPI(params);

      if ('data' in result) {
        expect(result.data.repositories[0]!.stars).toBe(50000);
        expect(result.data.repositories[1]!.stars).toBe(1000);
        expect(result.data.repositories[2]!.stars).toBe(100);
      }
    });

    it('should sort by updatedAt when stars are equal', async () => {
      const mockResponse = {
        data: {
          items: [
            {
              full_name: 'owner1/older',
              stargazers_count: 1000,
              description: 'Older',
              html_url: 'https://github.com/owner1/older',
              updated_at: '2024-01-10T10:30:00Z',
            },
            {
              full_name: 'owner2/newer',
              stargazers_count: 1000,
              description: 'Newer',
              html_url: 'https://github.com/owner2/newer',
              updated_at: '2024-01-15T10:30:00Z',
            },
          ],
        },
        headers: {},
      };

      mockOctokit.rest.search.repos.mockResolvedValue(mockResponse);

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['test'],
      };

      const result = await searchGitHubReposAPI(params);

      // Should be sorted by date descending (newer first)
      if ('data' in result) {
        expect(result.data.repositories[0]!.owner).toBe('owner2');
        expect(result.data.repositories[0]!.repo).toBe('newer');
        expect(result.data.repositories[1]!.owner).toBe('owner1');
        expect(result.data.repositories[1]!.repo).toBe('older');
      }
    });

    it('should handle sort parameter', async () => {
      const mockResponse = {
        data: {
          items: [],
        },
        headers: {},
      };

      mockOctokit.rest.search.repos.mockResolvedValue(mockResponse);

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['test'],
        sort: 'stars',
      };

      await searchGitHubReposAPI(params);

      expect(mockOctokit.rest.search.repos).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: 'stars',
        })
      );
    });

    it('should not include sort for best-match', async () => {
      const mockResponse = {
        data: {
          items: [],
        },
        headers: {},
      };

      mockOctokit.rest.search.repos.mockResolvedValue(mockResponse);

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['test'],
        sort: 'best-match',
      };

      await searchGitHubReposAPI(params);

      expect(mockOctokit.rest.search.repos).toHaveBeenCalledWith(
        expect.not.objectContaining({
          sort: 'best-match',
        })
      );
    });

    it('should respect limit parameter', async () => {
      const mockResponse = {
        data: {
          items: [],
        },
        headers: {},
      };

      mockOctokit.rest.search.repos.mockResolvedValue(mockResponse);

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['test'],
        limit: 50,
      };

      await searchGitHubReposAPI(params);

      expect(mockOctokit.rest.search.repos).toHaveBeenCalledWith(
        expect.objectContaining({
          per_page: 50,
        })
      );
    });

    it('should cap limit at 100', async () => {
      const mockResponse = {
        data: {
          items: [],
        },
        headers: {},
      };

      mockOctokit.rest.search.repos.mockResolvedValue(mockResponse);

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['test'],
        limit: 200,
      };

      await searchGitHubReposAPI(params);

      expect(mockOctokit.rest.search.repos).toHaveBeenCalledWith(
        expect.objectContaining({
          per_page: 100,
        })
      );
    });

    it('should use default limit of 30', async () => {
      const mockResponse = {
        data: {
          items: [],
        },
        headers: {},
      };

      mockOctokit.rest.search.repos.mockResolvedValue(mockResponse);

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['test'],
      };

      await searchGitHubReposAPI(params);

      expect(mockOctokit.rest.search.repos).toHaveBeenCalledWith(
        expect.objectContaining({
          per_page: 30,
        })
      );
    });

    it('should handle repos with missing stargazers_count', async () => {
      const mockResponse = {
        data: {
          items: [
            {
              full_name: 'test/repo',
              stargazers_count: null,
              description: 'Test',
              html_url: 'https://github.com/test/repo',
              updated_at: '2024-01-15T10:30:00Z',
            },
          ],
        },
        headers: {},
      };

      mockOctokit.rest.search.repos.mockResolvedValue(mockResponse);

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['test'],
      };

      const result = await searchGitHubReposAPI(params);

      if ('data' in result) {
        expect(result.data.repositories[0]!.stars).toBe(0);
      }
    });

    it('should handle malformed full_name', async () => {
      const mockResponse = {
        data: {
          items: [
            {
              full_name: 'no-slash',
              stargazers_count: 100,
              description: 'Test',
              html_url: 'https://github.com/test',
              updated_at: '2024-01-15T10:30:00Z',
            },
          ],
        },
        headers: {},
      };

      mockOctokit.rest.search.repos.mockResolvedValue(mockResponse);

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['test'],
      };

      const result = await searchGitHubReposAPI(params);

      if ('data' in result) {
        expect(result.data.repositories[0]!.owner).toBe('no-slash');
        expect(result.data.repositories[0]!.repo).toBe('');
      }
    });
  });

  describe('searchGitHubReposAPI - Error Handling', () => {
    it('should handle API errors', async () => {
      const mockError = new Error('API Error');
      mockOctokit.rest.search.repos.mockRejectedValue(mockError);
      vi.mocked(handleGitHubAPIError).mockReturnValue({
        error: 'API Error',
        type: 'http',
      });

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['test'],
      };

      const result = await searchGitHubReposAPI(params);

      expect(result).toHaveProperty('error');
      expect(handleGitHubAPIError).toHaveBeenCalledWith(mockError);
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network timeout');
      mockOctokit.rest.search.repos.mockRejectedValue(networkError);
      vi.mocked(handleGitHubAPIError).mockReturnValue({
        error: 'Network timeout',
        type: 'network',
      });

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['test'],
      };

      const result = await searchGitHubReposAPI(params);

      expect(result).toHaveProperty('error');
      if ('error' in result) {
        expect(result.type).toBe('network');
      }
    });

    it('should pass authInfo to getOctokit', async () => {
      const mockResponse = {
        data: { items: [] },
        headers: {},
      };

      mockOctokit.rest.search.repos.mockResolvedValue(mockResponse);

      const authInfo = { user: 'test-user', token: 'test-token' };
      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['test'],
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await searchGitHubReposAPI(params, authInfo as any);

      expect(getOctokit).toHaveBeenCalledWith(authInfo);
    });
  });

  describe('searchGitHubReposAPI - Caching', () => {
    it('should use cache with session ID', async () => {
      const { withDataCache } = await import('../../src/utils/cache.js');
      const mockWithDataCache = vi.mocked(withDataCache);

      const mockResponse = {
        data: { items: [] },
        headers: {},
      };

      mockOctokit.rest.search.repos.mockResolvedValue(mockResponse);

      const params: GitHubReposSearchQuery = {
        keywordsToSearch: ['test'],
      };

      await searchGitHubReposAPI(params, undefined, {
        userId: 'test-user-id',
        userLogin: 'test-user',
        isEnterpriseMode: false,
        sessionId: 'test-session',
      });

      expect(mockWithDataCache).toHaveBeenCalled();
    });
  });
});

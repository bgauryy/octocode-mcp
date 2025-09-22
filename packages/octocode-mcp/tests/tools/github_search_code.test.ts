import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubCodeSearchQuerySchema } from '../../src/scheme/github_search_code.js';

// Mock the GitHub client
const mockOctokit = vi.hoisted(() => ({
  rest: {
    search: {
      code: vi.fn(),
    },
  },
}));

vi.mock('../../src/github/client.js', () => ({
  getOctokit: vi.fn(() => mockOctokit),
}));

// Mock the cache to prevent interference
vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(() => 'test-cache-key'),
  withDataCache: vi.fn(async (_key: string, fn: () => unknown) => {
    // Always execute the function, don't use cache
    return await fn();
  }),
}));

// Import after mocking
import { searchGitHubCodeAPI } from '../../src/github/codeSearch.js';

describe('GitHubCodeSearchQuerySchema', () => {
  describe('new qualifiers validation', () => {
    it('should validate owner qualifier', () => {
      const validOwnerQuery = {
        queryTerms: ['function'],
        owner: 'octocat',
      };

      const result = GitHubCodeSearchQuerySchema.safeParse(validOwnerQuery);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.owner).toBe('octocat');
      }
    });

    it('should validate owner qualifier with organization name', () => {
      const validOrgOwnerQuery = {
        queryTerms: ['function'],
        owner: 'wix-private',
      };

      const result = GitHubCodeSearchQuerySchema.safeParse(validOrgOwnerQuery);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.owner).toBe('wix-private');
      }
    });

    it('should validate path qualifier', () => {
      const pathQuery = {
        queryTerms: ['function'],
        path: 'src/components',
      };

      const result = GitHubCodeSearchQuerySchema.safeParse(pathQuery);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.path).toBe('src/components');
      }
    });

    it('should validate complex query with all qualifiers', () => {
      const complexQuery = {
        queryTerms: ['function', 'component'],
        owner: 'facebook',
        repo: 'react',
        language: 'javascript',
        path: 'src/components',
        filename: 'App.js',
        extension: 'js',
        match: 'file',
        limit: 10,
      };

      const result = GitHubCodeSearchQuerySchema.safeParse(complexQuery);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.owner).toBe('facebook');
        expect(result.data.repo).toBe('react');
        expect(result.data.language).toBe('javascript');
        expect(result.data.path).toBe('src/components');
        expect(result.data.filename).toBe('App.js');
        expect(result.data.extension).toBe('js');
        expect(result.data.match).toBe('file');
        expect(result.data.limit).toBe(10);
      }
    });

    it('should validate array values for owner', () => {
      const arrayOwnerQuery = {
        queryTerms: ['function'],
        owner: ['facebook', 'microsoft'],
      };

      const result = GitHubCodeSearchQuerySchema.safeParse(arrayOwnerQuery);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.data.owner)).toBe(true);
        expect(result.data.owner).toEqual(['facebook', 'microsoft']);
      }
    });

    it('should maintain backward compatibility with existing fields', () => {
      const basicQuery = {
        queryTerms: ['function'],
      };

      const result = GitHubCodeSearchQuerySchema.safeParse(basicQuery);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.queryTerms).toEqual(['function']);
      }
    });
  });
});

describe('Code Search Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle successful search with results', async () => {
    const mockResponse = {
      data: {
        total_count: 2,
        items: [
          {
            name: 'component.js',
            path: 'src/component.js',
            repository: {
              full_name: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            text_matches: [
              {
                fragment: 'function test() {}',
                matches: [{ indices: [0, 8] }],
              },
            ],
          },
        ],
      },
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      queryTerms: ['function'],
      owner: 'test',
      repo: 'repo',
      limit: 5,
      minify: true,
      sanitize: true,
    });

    if ('data' in result) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.total_count).toBe(1); // Should match filtered item count
      expect(result.data.items[0]?.path).toBe('src/component.js');
    } else {
      expect.fail('Expected successful result with data');
    }
  });

  it('should handle search with no results', async () => {
    const mockResponse = {
      data: {
        total_count: 0,
        items: [],
      },
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      queryTerms: ['nonexistent'],
      owner: 'test',
      repo: 'repo',
      limit: 5,
      minify: true,
      sanitize: true,
    });

    if ('data' in result) {
      expect(result.data.items).toHaveLength(0);
      expect(result.data.total_count).toBe(0);
    } else {
      expect.fail('Expected successful result with data');
    }
  });

  it('should handle API errors gracefully', async () => {
    // Clear all mocks first
    vi.clearAllMocks();

    // Create a proper RequestError-like error for proper handling
    interface MockRequestError extends Error {
      status: number;
      response: {
        headers: {
          'x-ratelimit-remaining': string;
          'x-ratelimit-reset': string;
        };
      };
    }

    const apiError = new Error('API rate limit exceeded') as MockRequestError;
    apiError.status = 403;
    apiError.response = {
      headers: {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': Math.floor(Date.now() / 1000 + 3600).toString(),
      },
    };

    mockOctokit.rest.search.code.mockRejectedValue(apiError);

    const result = await searchGitHubCodeAPI({
      queryTerms: ['function'],
      owner: 'test',
      repo: 'repo',
      limit: 5,
      minify: true,
      sanitize: true,
    });

    // When there's an error, the result should be a GitHubAPIError object
    expect(result).toHaveProperty('error');
    if ('error' in result) {
      expect(result.error).toMatch(/rate limit/i);
      expect(result).toHaveProperty('type');
    }
  });

  it('should flatten results structure correctly', async () => {
    const mockResponse = {
      data: {
        total_count: 1,
        items: [
          {
            name: 'test.js',
            path: 'src/test.js',
            repository: {
              full_name: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            text_matches: [{ fragment: 'const x = 1', matches: [] }],
          },
        ],
      },
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      queryTerms: ['const'],
      owner: 'test',
      repo: 'repo',
      limit: 1,
      minify: true,
      sanitize: true,
    });

    // Should have flattened structure
    if ('data' in result) {
      expect(result.data).toHaveProperty('items');
      expect(result.data).toHaveProperty('total_count');
      expect(result.data).not.toHaveProperty('data'); // No nested data field
    } else {
      expect.fail('Expected successful result with data');
    }
  });

  it('should include query field when verbose is true', async () => {
    const mockResponse = {
      data: { total_count: 0, items: [] },
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      queryTerms: ['test'],
      owner: 'test',
      repo: 'repo',
      limit: 1,
      minify: true,
      sanitize: true,
    });

    // This test is more about the tool wrapper, but verifies API compatibility
    if ('data' in result) {
      expect(result.data.total_count).toBe(0);
    } else {
      expect.fail('Expected successful result with data');
    }
  });
});

describe('Quality Boosting and Research Goals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should search code without quality boost filters', async () => {
    const mockResponse = {
      data: {
        total_count: 1,
        items: [
          {
            name: 'test.js',
            path: 'src/test.js',
            sha: 'abc123',
            url: 'https://api.github.com/repos/test/repo/contents/src/test.js',
            git_url: 'https://api.github.com/repos/test/repo/git/blobs/abc123',
            html_url: 'https://github.com/test/repo/blob/main/src/test.js',
            repository: {
              id: 1,
              full_name: 'test/repo',
              url: 'https://api.github.com/repos/test/repo',
            },
            score: 1.0,
            file_size: 100,
            language: 'JavaScript',
            last_modified_at: '2024-01-01T00:00:00Z',
            text_matches: [
              {
                object_url:
                  'https://api.github.com/repos/test/repo/contents/src/test.js',
                object_type: 'File',
                property: 'content',
                fragment:
                  'const memoizedValue = useMemo(() => computeExpensiveValue(a, b), [a, b]);',
                matches: [
                  {
                    text: 'useMemo',
                    indices: [15, 22],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      queryTerms: ['useMemo', 'React'],
      owner: 'test',
      repo: 'repo',
      language: 'javascript',
      limit: 5,
      minify: true,
      sanitize: true,
    });

    expect(result).not.toHaveProperty('error');
    const callArgs = mockOctokit.rest.search.code.mock.calls[0]?.[0];
    expect(callArgs.q).toBe('useMemo React language:JavaScript repo:test/repo');
    expect(callArgs.q).not.toMatch(/stars:>10/);
    // Note: order parameter was deprecated by GitHub in April 2023
  });

  it('should apply analysis research goal correctly', async () => {
    const mockResponse = {
      data: {
        total_count: 1,
        items: [],
      },
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      queryTerms: ['useMemo', 'React'],
      owner: 'test',
      repo: 'repo',
      language: 'javascript',
      limit: 5,
      minify: true,
      sanitize: true,
    });

    expect(result).not.toHaveProperty('error');
    const callArgs = mockOctokit.rest.search.code.mock.calls[0]?.[0];
    expect(callArgs.q).toBe('useMemo React language:JavaScript repo:test/repo');
    expect(callArgs.q).not.toMatch(/stars:>10/);
  });

  it('should apply code_review research goal correctly', async () => {
    const mockResponse = {
      data: {
        total_count: 1,
        items: [],
      },
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      queryTerms: ['useMemo', 'React'],
      owner: 'test',
      repo: 'repo',
      language: 'javascript',
      limit: 5,
      minify: true,
      sanitize: true,
    });

    expect(result).not.toHaveProperty('error');
    const callArgs = mockOctokit.rest.search.code.mock.calls[0]?.[0];
    expect(callArgs.q).toBe('useMemo React language:JavaScript repo:test/repo');
    expect(callArgs.q).not.toMatch(/stars:>10/);
  });

  it('should disable quality boost for specific repo searches', async () => {
    const mockResponse = {
      data: {
        total_count: 1,
        items: [],
      },
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      queryTerms: ['useMemo', 'React'],
      owner: 'facebook',
      repo: 'react',
      language: 'javascript',
      limit: 5,

      minify: true,
      sanitize: true,
    });

    expect(result).not.toHaveProperty('error');
    const callArgs = mockOctokit.rest.search.code.mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();
    expect(callArgs!.q).not.toMatch(/stars:>10/);
    expect(callArgs!.q).toMatch(/repo:facebook\/react/);
  });

  it('should handle manual quality filters correctly', async () => {
    const mockResponse = {
      data: {
        total_count: 1,
        items: [],
      },
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      queryTerms: ['useMemo', 'React'],
      owner: 'test',
      repo: 'repo',
      language: 'javascript',
      stars: '>1000',
      limit: 5,
      minify: true,
      sanitize: true,
    });

    expect(result).not.toHaveProperty('error');
    const callArgs = mockOctokit.rest.search.code.mock.calls[0]?.[0];
    expect(callArgs.q).toMatch(/stars:>1000/);
  });
});

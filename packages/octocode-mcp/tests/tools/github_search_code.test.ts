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

// Import after mocking
import { searchGitHubCodeAPI } from '../../src/github/codeSearch.js';

describe('GitHubCodeSearchQuerySchema', () => {
  describe('new qualifiers validation', () => {
    it('should validate owner qualifier', () => {
      const validOwnerQuery = {
        queryTerms: ['function'],
        owner: 'octocat',
        researchGoal: 'code_analysis' as const,
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
        researchGoal: 'code_analysis' as const,
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
        researchGoal: 'code_analysis' as const,
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
        size: '>100',
        visibility: 'public',
        match: 'file',
        limit: 10,
        researchGoal: 'code_analysis' as const,
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
        expect(result.data.size).toBe('>100');
        expect(result.data.visibility).toBe('public');
        expect(result.data.match).toBe('file');
        expect(result.data.limit).toBe(10);
      }
    });

    it('should validate array values for owner', () => {
      const arrayOwnerQuery = {
        queryTerms: ['function'],
        owner: ['facebook', 'microsoft'],
        researchGoal: 'code_analysis' as const,
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
        researchGoal: 'code_analysis' as const,
      };

      const result = GitHubCodeSearchQuerySchema.safeParse(basicQuery);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.queryTerms).toEqual(['function']);
        expect(result.data.researchGoal).toBe('code_analysis');
      }
    });
  });
});

describe('Quality Boosting and Research Goals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should apply quality boost by default', async () => {
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
      language: 'javascript',
      limit: 5,
      sort: 'best-match',
      order: 'desc',
      qualityBoost: true,
      minify: true,
      sanitize: true,
    });

    expect(result).not.toHaveProperty('error');
    const callArgs = mockOctokit.rest.search.code.mock.calls[0]?.[0];
    expect(callArgs.q).toMatch(/stars:>10/);
    expect(callArgs.q).toMatch(/pushed:>2022-01-01/);
    expect(callArgs.order).toBe('desc');
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
      language: 'javascript',
      researchGoal: 'analysis',
      limit: 5,
      sort: 'best-match',
      order: 'desc',
      qualityBoost: true,
      minify: true,
      sanitize: true,
    });

    expect(result).not.toHaveProperty('error');
    const callArgs = mockOctokit.rest.search.code.mock.calls[0]?.[0];
    expect(callArgs.q).toMatch(/stars:>10/);
    expect(callArgs.q).toMatch(/pushed:>2022-01-01/);
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
      language: 'javascript',
      researchGoal: 'code_review',
      limit: 5,
      sort: 'best-match',
      order: 'desc',
      qualityBoost: true,
      minify: true,
      sanitize: true,
    });

    expect(result).not.toHaveProperty('error');
    const callArgs = mockOctokit.rest.search.code.mock.calls[0]?.[0];
    expect(callArgs.q).toMatch(/stars:>10/);
    expect(callArgs.q).toMatch(/pushed:>2022-01-01/);
  });

  it('should disable quality boost when explicitly set to false', async () => {
    const mockResponse = {
      data: {
        total_count: 1,
        items: [],
      },
    };

    mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

    const result = await searchGitHubCodeAPI({
      queryTerms: ['useMemo', 'React'],
      language: 'javascript',
      qualityBoost: false,
      limit: 5,
      sort: 'best-match',
      order: 'desc',
      minify: true,
      sanitize: true,
    });

    expect(result).not.toHaveProperty('error');
    const callArgs = mockOctokit.rest.search.code.mock.calls[0]?.[0];
    expect(callArgs.q).not.toMatch(/stars:>10/);
    expect(callArgs.q).not.toMatch(/pushed:>2022-01-01/);
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
      language: 'javascript',
      stars: '>1000',
      pushed: '>2024-01-01',
      limit: 5,
      sort: 'best-match',
      order: 'desc',
      qualityBoost: true,
      minify: true,
      sanitize: true,
    });

    expect(result).not.toHaveProperty('error');
    const callArgs = mockOctokit.rest.search.code.mock.calls[0]?.[0];
    expect(callArgs.q).toMatch(/stars:>1000/);
    expect(callArgs.q).toMatch(/pushed:>2024-01-01/);
  });
});

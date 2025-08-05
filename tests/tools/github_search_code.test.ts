import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubCodeSearchQuerySchema } from '../../src/mcp/tools/scheme/github_search_code.js';
import { ensureUniqueQueryIds } from '../../src/mcp/tools/utils/queryUtils.js';

// Mock the GitHub client
const mockOctokit = vi.hoisted(() => ({
  rest: {
    search: {
      code: vi.fn(),
    },
  },
}));

vi.mock('../../src/utils/github/client.js', () => ({
  getOctokit: vi.fn(() => mockOctokit),
}));

// Import after mocking
import { searchGitHubCodeAPI } from '../../src/utils/github/codeSearch.js';

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

    it('should validate fork qualifier with all valid values', () => {
      const forkValues = ['true', 'false', 'only'] as const;

      for (const forkValue of forkValues) {
        const query = {
          queryTerms: ['function'],
          fork: forkValue,
          researchGoal: 'code_analysis' as const,
        };

        const result = GitHubCodeSearchQuerySchema.safeParse(query);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.fork).toBe(forkValue);
        }
      }
    });

    it('should reject invalid fork qualifier values', () => {
      const invalidForkQuery = {
        queryTerms: ['function'],
        fork: 'invalid',
        researchGoal: 'code_analysis' as const,
      };

      const result = GitHubCodeSearchQuerySchema.safeParse(invalidForkQuery);
      expect(result.success).toBe(false);
    });

    it('should validate archived qualifier', () => {
      const archivedTrueQuery = {
        queryTerms: ['function'],
        archived: true,
        researchGoal: 'code_analysis' as const,
      };

      const archivedFalseQuery = {
        queryTerms: ['function'],
        archived: false,
        researchGoal: 'code_analysis' as const,
      };

      const trueResult =
        GitHubCodeSearchQuerySchema.safeParse(archivedTrueQuery);
      expect(trueResult.success).toBe(true);
      if (trueResult.success) {
        expect(trueResult.data.archived).toBe(true);
      }

      const falseResult =
        GitHubCodeSearchQuerySchema.safeParse(archivedFalseQuery);
      expect(falseResult.success).toBe(true);
      if (falseResult.success) {
        expect(falseResult.data.archived).toBe(false);
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
        fork: 'false',
        archived: false,
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
        expect(result.data.fork).toBe('false');
        expect(result.data.archived).toBe(false);
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

  describe('queryId uniqueness', () => {
    it('should handle queries without id field', () => {
      const queries: Array<{
        id?: string;
        queryTerms: string[];
        researchGoal: 'discovery';
      }> = [
        {
          queryTerms: ['test1'],
          researchGoal: 'discovery' as const,
        },
        {
          queryTerms: ['test2'],
          researchGoal: 'discovery' as const,
        },
      ];

      const result = ensureUniqueQueryIds(queries, 'test');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('test_1');
      expect(result[1].id).toBe('test_2');
    });

    it('should handle queries with duplicate ids', () => {
      const queries = [
        {
          id: 'test_1',
          queryTerms: ['test1'],
          researchGoal: 'discovery' as const,
        },
        {
          id: 'test_1',
          queryTerms: ['test2'],
          researchGoal: 'discovery' as const,
        },
      ];

      const result = ensureUniqueQueryIds(queries, 'test');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('test_1');
      expect(result[1].id).toBe('test_1_1');
    });

    it('should handle mixed queries with and without ids', () => {
      const queries = [
        {
          id: 'custom_1',
          queryTerms: ['test1'],
          researchGoal: 'discovery' as const,
        },
        { queryTerms: ['test2'], researchGoal: 'discovery' as const },
        {
          id: 'custom_1',
          queryTerms: ['test3'],
          researchGoal: 'discovery' as const,
        },
      ];

      const result = ensureUniqueQueryIds(queries, 'test');
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('custom_1');
      expect(result[1].id).toBe('test_2');
      expect(result[2].id).toBe('custom_1_1');
    });
  });

  describe('ensureUniqueQueryIds', () => {
    it('should generate unique IDs for queries without id field', () => {
      const queries: Array<{
        id?: string;
        queryTerms: string[];
        researchGoal: 'discovery';
      }> = [
        {
          queryTerms: ['test1'],
          researchGoal: 'discovery' as const,
        },
        {
          queryTerms: ['test2'],
          researchGoal: 'discovery' as const,
        },
        {
          queryTerms: ['test3'],
          researchGoal: 'discovery' as const,
        },
      ];

      const result = ensureUniqueQueryIds(queries, 'test');
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('test_1');
      expect(result[1].id).toBe('test_2');
      expect(result[2].id).toBe('test_3');
    });

    it('should make duplicate IDs unique by adding suffixes', () => {
      const queries = [
        {
          id: 'test_1',
          queryTerms: ['test1'],
          researchGoal: 'discovery' as const,
        },
        {
          id: 'test_1',
          queryTerms: ['test2'],
          researchGoal: 'discovery' as const,
        },
        {
          id: 'test_1',
          queryTerms: ['test3'],
          researchGoal: 'discovery' as const,
        },
      ];

      const result = ensureUniqueQueryIds(queries, 'test');
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('test_1');
      expect(result[1].id).toBe('test_1_1');
      expect(result[2].id).toBe('test_1_2');
    });

    it('should handle mixed queries with and without IDs', () => {
      const queries = [
        {
          id: 'custom_1',
          queryTerms: ['test1'],
          researchGoal: 'discovery' as const,
        },
        {
          id: undefined,
          queryTerms: ['test2'],
          researchGoal: 'discovery' as const,
        },
        {
          id: 'custom_1',
          queryTerms: ['test3'],
          researchGoal: 'discovery' as const,
        },
        {
          queryTerms: ['test4'],
          researchGoal: 'discovery' as const,
        },
      ];

      const result = ensureUniqueQueryIds(queries, 'test');
      expect(result).toHaveLength(4);
      expect(result[0].id).toBe('custom_1');
      expect(result[1].id).toBe('test_2');
      expect(result[2].id).toBe('custom_1_1');
      expect(result[3].id).toBe('test_4');
    });

    it('should preserve existing unique IDs', () => {
      const queries = [
        {
          id: 'unique_1',
          queryTerms: ['test1'],
          researchGoal: 'discovery' as const,
        },
        {
          id: 'unique_2',
          queryTerms: ['test2'],
          researchGoal: 'discovery' as const,
        },
        {
          id: 'unique_3',
          queryTerms: ['test3'],
          researchGoal: 'discovery' as const,
        },
      ];

      const result = ensureUniqueQueryIds(queries, 'test');
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('unique_1');
      expect(result[1].id).toBe('unique_2');
      expect(result[2].id).toBe('unique_3');
    });

    it('should handle complex duplicate patterns', () => {
      const queries = [
        {
          id: 'test_1',
          queryTerms: ['test1'],
          researchGoal: 'discovery' as const,
        },
        {
          id: 'test_1',
          queryTerms: ['test2'],
          researchGoal: 'discovery' as const,
        },
        {
          id: 'test_2',
          queryTerms: ['test3'],
          researchGoal: 'discovery' as const,
        },
        {
          id: 'test_1',
          queryTerms: ['test4'],
          researchGoal: 'discovery' as const,
        },
        {
          id: 'test_2',
          queryTerms: ['test5'],
          researchGoal: 'discovery' as const,
        },
      ];

      const result = ensureUniqueQueryIds(queries, 'test');
      expect(result).toHaveLength(5);
      expect(result[0].id).toBe('test_1');
      expect(result[1].id).toBe('test_1_1');
      expect(result[2].id).toBe('test_2');
      expect(result[3].id).toBe('test_1_2');
      expect(result[4].id).toBe('test_2_1');
    });

    it('should handle large datasets efficiently', () => {
      const queries: Array<{
        id?: string;
        queryTerms: string[];
        researchGoal: 'discovery';
      }> = Array.from({ length: 100 }, (_, i) => ({
        queryTerms: [`test${i}`],
        researchGoal: 'discovery' as const,
      }));

      const result = ensureUniqueQueryIds(queries, 'test');
      expect(result).toHaveLength(100);
      expect(result[0].id).toBe('test_1');
      expect(result[99].id).toBe('test_100');
    });

    it('should not modify the original query objects', () => {
      const originalQueries: Array<{
        id?: string;
        queryTerms: string[];
        researchGoal: 'discovery';
      }> = [
        {
          queryTerms: ['test1'],
          researchGoal: 'discovery' as const,
        },
        {
          queryTerms: ['test2'],
          researchGoal: 'discovery' as const,
        },
      ];

      const result = ensureUniqueQueryIds(originalQueries, 'test');

      // Original queries should not have id field
      expect(originalQueries[0]).not.toHaveProperty('id');
      expect(originalQueries[1]).not.toHaveProperty('id');

      // Result should have id field
      expect(result[0]).toHaveProperty('id');
      expect(result[1]).toHaveProperty('id');
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
      excludeArchived: true,
      excludeForks: false,
      minify: true,
      sanitize: true,
    });

    expect(result).not.toHaveProperty('error');
    const callArgs = mockOctokit.rest.search.code.mock.calls[0][0];
    expect(callArgs.q).toMatch(/stars:>10/);
    expect(callArgs.q).toMatch(/archived:false/);
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
      excludeArchived: true,
      excludeForks: false,
      minify: true,
      sanitize: true,
    });

    expect(result).not.toHaveProperty('error');
    const callArgs = mockOctokit.rest.search.code.mock.calls[0][0];
    expect(callArgs.q).toMatch(/stars:>10/);
    expect(callArgs.q).toMatch(/pushed:>2022-01-01/);
    expect(callArgs.q).toMatch(/archived:false/);
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
      excludeArchived: true,
      excludeForks: false,
      minify: true,
      sanitize: true,
    });

    expect(result).not.toHaveProperty('error');
    const callArgs = mockOctokit.rest.search.code.mock.calls[0][0];
    expect(callArgs.q).toMatch(/stars:>10/);
    expect(callArgs.q).toMatch(/pushed:>2022-01-01/);
    expect(callArgs.q).toMatch(/archived:false/);
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
      excludeArchived: true,
      excludeForks: false,
      minify: true,
      sanitize: true,
    });

    expect(result).not.toHaveProperty('error');
    const callArgs = mockOctokit.rest.search.code.mock.calls[0][0];
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
      forks: '>100',
      pushed: '>2024-01-01',
      excludeForks: true,
      excludeArchived: true,
      limit: 5,
      sort: 'best-match',
      order: 'desc',
      qualityBoost: true,
      minify: true,
      sanitize: true,
    });

    expect(result).not.toHaveProperty('error');
    const callArgs = mockOctokit.rest.search.code.mock.calls[0][0];
    expect(callArgs.q).toMatch(/stars:>1000/);
    expect(callArgs.q).toMatch(/forks:>100/);
    expect(callArgs.q).toMatch(/pushed:>2024-01-01/);
    expect(callArgs.q).toMatch(/fork:false/);
    expect(callArgs.q).toMatch(/archived:false/);
  });
});

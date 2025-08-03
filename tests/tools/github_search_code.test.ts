import { describe, it, expect } from 'vitest';
import { GitHubCodeSearchQuerySchema } from '../../src/mcp/tools/scheme/github_search_code.js';
import { ensureUniqueQueryIds } from '../../src/mcp/tools/utils/queryUtils.js';

describe('GitHubCodeSearchQuerySchema', () => {
  describe('new qualifiers validation', () => {
    it('should validate user qualifier', () => {
      const validUserQuery = {
        queryTerms: ['function'],
        user: 'octocat',
        researchGoal: 'code_analysis' as const,
      };

      const result = GitHubCodeSearchQuerySchema.safeParse(validUserQuery);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.user).toBe('octocat');
      }
    });

    it('should validate org qualifier', () => {
      const validOrgQuery = {
        queryTerms: ['function'],
        org: 'github',
        researchGoal: 'code_analysis' as const,
      };

      const result = GitHubCodeSearchQuerySchema.safeParse(validOrgQuery);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.org).toBe('github');
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

    it('should validate complex query with all new qualifiers', () => {
      const complexQuery = {
        queryTerms: ['function', 'export'],
        user: 'octocat',
        org: 'github',
        fork: 'true' as const,
        archived: false,
        path: 'src/',
        language: 'typescript',
        researchGoal: 'code_analysis' as const,
      };

      const result = GitHubCodeSearchQuerySchema.safeParse(complexQuery);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.user).toBe('octocat');
        expect(result.data.org).toBe('github');
        expect(result.data.fork).toBe('true');
        expect(result.data.archived).toBe(false);
        expect(result.data.path).toBe('src/');
        expect(result.data.language).toBe('typescript');
      }
    });

    it('should validate array values for user and org', () => {
      const arrayQuery = {
        queryTerms: ['function'],
        user: ['octocat', 'github'],
        org: ['microsoft', 'google'],
        researchGoal: 'code_analysis' as const,
      };

      const result = GitHubCodeSearchQuerySchema.safeParse(arrayQuery);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.user).toEqual(['octocat', 'github']);
        expect(result.data.org).toEqual(['microsoft', 'google']);
      }
    });

    it('should maintain backward compatibility with existing fields', () => {
      const existingQuery = {
        queryTerms: ['function'],
        owner: 'facebook',
        repo: 'react',
        language: 'javascript',
        filename: 'index.js',
        extension: 'js',
        match: 'file' as const,
        size: '>1000',
        limit: 10,
        researchGoal: 'code_analysis' as const,
      };

      const result = GitHubCodeSearchQuerySchema.safeParse(existingQuery);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.owner).toBe('facebook');
        expect(result.data.repo).toBe('react');
        expect(result.data.language).toBe('javascript');
        expect(result.data.filename).toBe('index.js');
        expect(result.data.extension).toBe('js');
        expect(result.data.match).toBe('file');
        expect(result.data.size).toBe('>1000');
        expect(result.data.limit).toBe(10);
      }
    });
  });

  describe('queryId uniqueness', () => {
    it('should handle queries without id field', () => {
      const queriesWithoutId = [
        { queryTerms: ['function'], researchGoal: 'code_analysis' as const },
        { queryTerms: ['class'], researchGoal: 'code_analysis' as const },
      ];

      // Validate that queries without id are still valid
      for (const query of queriesWithoutId) {
        const result = GitHubCodeSearchQuerySchema.safeParse(query);
        expect(result.success).toBe(true);
      }
    });

    it('should handle queries with duplicate ids', () => {
      const queriesWithDuplicateIds = [
        {
          id: 'test-query',
          queryTerms: ['function'],
          researchGoal: 'code_analysis' as const,
        },
        {
          id: 'test-query',
          queryTerms: ['class'],
          researchGoal: 'code_analysis' as const,
        },
        {
          id: 'test-query',
          queryTerms: ['interface'],
          researchGoal: 'code_analysis' as const,
        },
      ];

      // Validate that queries with duplicate ids are still valid schema-wise
      for (const query of queriesWithDuplicateIds) {
        const result = GitHubCodeSearchQuerySchema.safeParse(query);
        expect(result.success).toBe(true);
      }
    });

    it('should handle mixed queries with and without ids', () => {
      const mixedQueries = [
        {
          id: 'custom-id',
          queryTerms: ['function'],
          researchGoal: 'code_analysis' as const,
        },
        { queryTerms: ['class'], researchGoal: 'code_analysis' as const },
        {
          id: 'another-id',
          queryTerms: ['interface'],
          researchGoal: 'code_analysis' as const,
        },
        { queryTerms: ['type'], researchGoal: 'code_analysis' as const },
      ];

      // Validate that mixed queries are valid schema-wise
      for (const query of mixedQueries) {
        const result = GitHubCodeSearchQuerySchema.safeParse(query);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('ensureUniqueQueryIds', () => {
    it('should generate unique IDs for queries without id field', () => {
      const queries = [
        { queryTerms: ['function'], researchGoal: 'code_analysis' as const },
        { queryTerms: ['class'], researchGoal: 'code_analysis' as const },
        { queryTerms: ['interface'], researchGoal: 'code_analysis' as const },
      ] as Array<{
        queryTerms: string[];
        researchGoal: 'code_analysis';
        id?: string;
      }>;

      const result = ensureUniqueQueryIds(queries as any);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('query_1');
      expect(result[1].id).toBe('query_2');
      expect(result[2].id).toBe('query_3');

      // Ensure all IDs are unique
      const ids = result.map(q => q.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should make duplicate IDs unique by adding suffixes', () => {
      const queries = [
        {
          id: 'test-query',
          queryTerms: ['function'],
          researchGoal: 'code_analysis' as const,
        },
        {
          id: 'test-query',
          queryTerms: ['class'],
          researchGoal: 'code_analysis' as const,
        },
        {
          id: 'test-query',
          queryTerms: ['interface'],
          researchGoal: 'code_analysis' as const,
        },
      ];

      const result = ensureUniqueQueryIds(queries as any);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('test-query');
      expect(result[1].id).toBe('test-query_1');
      expect(result[2].id).toBe('test-query_2');

      // Ensure all IDs are unique
      const ids = result.map(q => q.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should handle mixed queries with and without IDs', () => {
      const queries = [
        {
          id: 'custom-id',
          queryTerms: ['function'],
          researchGoal: 'code_analysis' as const,
        },
        { queryTerms: ['class'], researchGoal: 'code_analysis' as const },
        {
          id: 'custom-id',
          queryTerms: ['interface'],
          researchGoal: 'code_analysis' as const,
        },
        { queryTerms: ['type'], researchGoal: 'code_analysis' as const },
      ];

      const result = ensureUniqueQueryIds(queries as any);

      expect(result).toHaveLength(4);
      expect(result[0].id).toBe('custom-id');
      expect(result[1].id).toBe('query_2');
      expect(result[2].id).toBe('custom-id_1');
      expect(result[3].id).toBe('query_4');

      // Ensure all IDs are unique
      const ids = result.map(q => q.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should preserve existing unique IDs', () => {
      const queries = [
        {
          id: 'unique-1',
          queryTerms: ['function'],
          researchGoal: 'code_analysis' as const,
        },
        {
          id: 'unique-2',
          queryTerms: ['class'],
          researchGoal: 'code_analysis' as const,
        },
        {
          id: 'unique-3',
          queryTerms: ['interface'],
          researchGoal: 'code_analysis' as const,
        },
      ];

      const result = ensureUniqueQueryIds(queries as any);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('unique-1');
      expect(result[1].id).toBe('unique-2');
      expect(result[2].id).toBe('unique-3');

      // Ensure all IDs are unique
      const ids = result.map(q => q.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should handle complex duplicate patterns', () => {
      const queries = [
        {
          id: 'test',
          queryTerms: ['function'],
          researchGoal: 'code_analysis' as const,
        },
        { queryTerms: ['class'], researchGoal: 'code_analysis' as const }, // will become query_2
        {
          id: 'test',
          queryTerms: ['interface'],
          researchGoal: 'code_analysis' as const,
        }, // will become test_1
        {
          id: 'query_2',
          queryTerms: ['type'],
          researchGoal: 'code_analysis' as const,
        }, // will become query_2_1
        {
          id: 'other',
          queryTerms: ['enum'],
          researchGoal: 'code_analysis' as const,
        }, // will become other
      ];

      const result = ensureUniqueQueryIds(queries as any);

      expect(result).toHaveLength(5);
      expect(result[0].id).toBe('test');
      expect(result[1].id).toBe('query_2');
      expect(result[2].id).toBe('test_1');
      expect(result[3].id).toBe('query_2_1');
      expect(result[4].id).toBe('other');

      // Ensure all IDs are unique
      const ids = result.map(q => q.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should handle large datasets efficiently', () => {
      // Create 100 queries with various duplicate patterns
      const queries = [];
      for (let i = 0; i < 100; i++) {
        if (i % 10 === 0) {
          queries.push({
            id: 'duplicate-id',
            queryTerms: [`term${i}`],
            researchGoal: 'code_analysis' as const,
          });
        } else if (i % 5 === 0) {
          queries.push({
            queryTerms: [`term${i}`],
            researchGoal: 'code_analysis' as const,
          });
        } else {
          queries.push({
            id: `unique-${i}`,
            queryTerms: [`term${i}`],
            researchGoal: 'code_analysis' as const,
          });
        }
      }

      const start = performance.now();
      const result = ensureUniqueQueryIds(queries as any);
      const end = performance.now();

      expect(result).toHaveLength(100);

      // Ensure all IDs are unique
      const ids = result.map(q => q.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);

      // Should complete quickly (under 10ms for 100 queries)
      expect(end - start).toBeLessThan(10);

      // Verify some specific patterns
      const duplicateIds = result.filter(q => q.id?.startsWith('duplicate-id'));
      expect(duplicateIds.length).toBe(10); // 10 duplicates (i % 10 === 0)
      expect(duplicateIds[0].id).toBe('duplicate-id');
      expect(duplicateIds[1].id).toBe('duplicate-id_1');
      expect(duplicateIds[9].id).toBe('duplicate-id_9');
    });

    it('should not modify the original query objects', () => {
      const originalQueries = [
        {
          id: 'test',
          queryTerms: ['function'],
          researchGoal: 'code_analysis' as const,
        },
        {
          id: 'test',
          queryTerms: ['class'],
          researchGoal: 'code_analysis' as const,
        },
      ];

      const result = ensureUniqueQueryIds(originalQueries as any);

      // Original queries should be unchanged
      expect(originalQueries[0].id).toBe('test');
      expect(originalQueries[1].id).toBe('test');

      // Result should have unique IDs
      expect(result[0].id).toBe('test');
      expect(result[1].id).toBe('test_1');
    });
  });
});

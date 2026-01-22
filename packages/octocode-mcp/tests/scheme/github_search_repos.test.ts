import { describe, it, expect } from 'vitest';
import { GitHubReposSearchQuerySchema } from '../../src/tools/github_search_repos/scheme.js';

describe('GitHubReposSearchQuerySchema', () => {
  // Helper to add required base research fields
  const withBaseFields = <T extends object>(query: T) => ({
    ...query,
    mainResearchGoal: 'Test research goal',
    researchGoal: 'Testing schema validation',
    reasoning: 'Unit test for schema',
  });

  describe('refine validation - keywordsToSearch OR topicsToSearch required', () => {
    it('should reject query with neither keywordsToSearch nor topicsToSearch', () => {
      const invalidQuery = {
        queries: [
          withBaseFields({
            owner: 'facebook',
            stars: '>1000',
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "At least one of 'keywordsToSearch' or 'topicsToSearch' is required"
        );
      }
    });

    it('should reject query with empty keywordsToSearch array and no topicsToSearch', () => {
      const invalidQuery = {
        queries: [
          withBaseFields({
            keywordsToSearch: [],
            owner: 'facebook',
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "At least one of 'keywordsToSearch' or 'topicsToSearch' is required"
        );
      }
    });

    it('should reject query with empty topicsToSearch array and no keywordsToSearch', () => {
      const invalidQuery = {
        queries: [
          withBaseFields({
            topicsToSearch: [],
            stars: '>500',
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should pass with only keywordsToSearch', () => {
      const validQuery = {
        queries: [
          withBaseFields({
            keywordsToSearch: ['react', 'typescript'],
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should pass with only topicsToSearch', () => {
      const validQuery = {
        queries: [
          withBaseFields({
            topicsToSearch: ['machine-learning', 'python'],
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should pass with both keywordsToSearch and topicsToSearch', () => {
      const validQuery = {
        queries: [
          withBaseFields({
            keywordsToSearch: ['api'],
            topicsToSearch: ['rest', 'graphql'],
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should pass with single keyword in array', () => {
      const validQuery = {
        queries: [
          withBaseFields({
            keywordsToSearch: ['test'],
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should pass with single topic in array', () => {
      const validQuery = {
        queries: [
          withBaseFields({
            topicsToSearch: ['cli'],
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });
  });

  describe('other schema fields validation', () => {
    it('should validate owner field', () => {
      const validQuery = {
        queries: [
          withBaseFields({
            keywordsToSearch: ['react'],
            owner: 'facebook',
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.queries[0]?.owner).toBe('facebook');
      }
    });

    it('should validate stars filter', () => {
      const validQuery = {
        queries: [
          withBaseFields({
            keywordsToSearch: ['cli'],
            stars: '>1000',
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should validate sort enum values', () => {
      const sortValues = ['forks', 'stars', 'updated', 'best-match'] as const;

      for (const sort of sortValues) {
        const validQuery = {
          queries: [
            withBaseFields({
              keywordsToSearch: ['test'],
              sort,
            }),
          ],
        };

        const result = GitHubReposSearchQuerySchema.safeParse(validQuery);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid sort value', () => {
      const invalidQuery = {
        queries: [
          withBaseFields({
            keywordsToSearch: ['test'],
            sort: 'invalid-sort',
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should validate match array with enum values', () => {
      const validQuery = {
        queries: [
          withBaseFields({
            keywordsToSearch: ['test'],
            match: ['name', 'description', 'readme'],
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should validate limit within range', () => {
      const validQuery = {
        queries: [
          withBaseFields({
            keywordsToSearch: ['test'],
            limit: 10,
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should reject limit below minimum', () => {
      const invalidQuery = {
        queries: [
          withBaseFields({
            keywordsToSearch: ['test'],
            limit: 0,
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject limit above maximum', () => {
      const invalidQuery = {
        queries: [
          withBaseFields({
            keywordsToSearch: ['test'],
            limit: 101, // Max is 100
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });
  });

  describe('bulk queries validation', () => {
    it('should validate multiple queries', () => {
      const validQueries = {
        queries: [
          withBaseFields({
            keywordsToSearch: ['react'],
            owner: 'facebook',
          }),
          withBaseFields({
            topicsToSearch: ['typescript', 'nodejs'],
            stars: '>500',
          }),
          withBaseFields({
            keywordsToSearch: ['api'],
            topicsToSearch: ['rest'],
            sort: 'stars',
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(validQueries);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.queries).toHaveLength(3);
      }
    });

    it('should fail if any query in bulk is invalid', () => {
      const mixedQueries = {
        queries: [
          withBaseFields({
            keywordsToSearch: ['valid'],
          }),
          withBaseFields({
            // Invalid: neither keywordsToSearch nor topicsToSearch
            owner: 'invalid',
          }),
        ],
      };

      const result = GitHubReposSearchQuerySchema.safeParse(mixedQueries);
      expect(result.success).toBe(false);
    });
  });
});

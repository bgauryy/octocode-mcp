import { describe, it, expect } from 'vitest';
import { GitHubCodeSearchQuerySchema } from '../../src/mcp/tools/scheme/github_search_code.js';

describe('GitHubCodeSearchQuerySchema', () => {
  describe('new qualifiers validation', () => {
    it('should validate user qualifier', () => {
      const validUserQuery = {
        queryTerms: ['function'],
        user: 'octocat',
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
      };

      const result = GitHubCodeSearchQuerySchema.safeParse(invalidForkQuery);
      expect(result.success).toBe(false);
    });

    it('should validate archived qualifier', () => {
      const archivedTrueQuery = {
        queryTerms: ['function'],
        archived: true,
      };

      const archivedFalseQuery = {
        queryTerms: ['function'],
        archived: false,
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
});

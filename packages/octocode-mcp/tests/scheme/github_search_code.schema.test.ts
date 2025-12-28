import { describe, it, expect } from 'vitest';
import { GitHubCodeSearchQuerySchema } from '../../src/scheme/github_search_code.js';

describe('GitHubCodeSearchQuerySchema - Pagination', () => {
  // Base required fields for all tests
  const baseQuery = {
    mainResearchGoal: 'Test pagination',
    researchGoal: 'Verify page parameter works',
    reasoning: 'Testing schema validation',
    keywordsToSearch: ['test'],
  };

  describe('page parameter', () => {
    it('should accept valid page number', () => {
      const result = GitHubCodeSearchQuerySchema.safeParse({
        ...baseQuery,
        page: 5,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(5);
      }
    });

    it('should allow page to be omitted (optional with default)', () => {
      const result = GitHubCodeSearchQuerySchema.safeParse({
        ...baseQuery,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Page is optional, so it can be undefined when not provided
        // The default of 1 is applied at runtime in the API layer
        expect(result.data.page).toBeUndefined();
      }
    });

    it('should reject page less than 1', () => {
      const result = GitHubCodeSearchQuerySchema.safeParse({
        ...baseQuery,
        page: 0,
      });

      expect(result.success).toBe(false);
    });

    it('should reject page greater than 10', () => {
      const result = GitHubCodeSearchQuerySchema.safeParse({
        ...baseQuery,
        page: 11,
      });

      expect(result.success).toBe(false);
    });

    it('should reject non-integer page', () => {
      const result = GitHubCodeSearchQuerySchema.safeParse({
        ...baseQuery,
        page: 1.5,
      });

      expect(result.success).toBe(false);
    });

    it('should accept page at boundary (1)', () => {
      const result = GitHubCodeSearchQuerySchema.safeParse({
        ...baseQuery,
        page: 1,
      });

      expect(result.success).toBe(true);
    });

    it('should accept page at boundary (10)', () => {
      const result = GitHubCodeSearchQuerySchema.safeParse({
        ...baseQuery,
        page: 10,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('limit parameter with pagination', () => {
    it('should accept limit up to 100', () => {
      const result = GitHubCodeSearchQuerySchema.safeParse({
        ...baseQuery,
        limit: 100,
        page: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(100);
      }
    });

    it('should reject limit greater than 100', () => {
      const result = GitHubCodeSearchQuerySchema.safeParse({
        ...baseQuery,
        limit: 101,
        page: 1,
      });

      expect(result.success).toBe(false);
    });

    it('should work with both page and limit', () => {
      const result = GitHubCodeSearchQuerySchema.safeParse({
        ...baseQuery,
        limit: 50,
        page: 3,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
        expect(result.data.page).toBe(3);
      }
    });
  });
});

import { describe, it, expect } from 'vitest';
import { GitHubPullRequestSearchQuerySchema } from '../../src/tools/github_search_pull_requests/scheme.js';

const BASE_RESEARCH_FIELDS = {
  mainResearchGoal: 'Test goal',
  researchGoal: 'Test research',
  reasoning: 'Test reasoning',
};

describe('GitHubPullRequestSearchQuerySchema', () => {
  describe('Query length validation', () => {
    it('should reject query exceeding 256 characters', () => {
      const result = GitHubPullRequestSearchQuerySchema.safeParse({
        ...BASE_RESEARCH_FIELDS,
        owner: 'test',
        repo: 'repo',
        query: 'a'.repeat(257),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map(i => i.message);
        expect(messages).toContain(
          'Query too long. Maximum 256 characters allowed.'
        );
      }
    });

    it('should accept query at exactly 256 characters', () => {
      const result = GitHubPullRequestSearchQuerySchema.safeParse({
        ...BASE_RESEARCH_FIELDS,
        owner: 'test',
        repo: 'repo',
        query: 'a'.repeat(256),
      });
      expect(result.success).toBe(true);
    });

    it('should accept query under 256 characters', () => {
      const result = GitHubPullRequestSearchQuerySchema.safeParse({
        ...BASE_RESEARCH_FIELDS,
        owner: 'test',
        repo: 'repo',
        query: 'short query',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Required search params validation', () => {
    it('should reject when no valid search params provided', () => {
      const result = GitHubPullRequestSearchQuerySchema.safeParse({
        ...BASE_RESEARCH_FIELDS,
        state: 'open',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map(i => i.message);
        expect(messages).toContain(
          'At least one valid search parameter, filter, or PR number is required.'
        );
      }
    });

    it('should reject with only boolean filters and no primary params', () => {
      const result = GitHubPullRequestSearchQuerySchema.safeParse({
        ...BASE_RESEARCH_FIELDS,
        merged: true,
        draft: false,
      });
      expect(result.success).toBe(false);
    });

    it('should accept with owner param', () => {
      const result = GitHubPullRequestSearchQuerySchema.safeParse({
        ...BASE_RESEARCH_FIELDS,
        owner: 'facebook',
      });
      expect(result.success).toBe(true);
    });

    it('should accept with repo param', () => {
      const result = GitHubPullRequestSearchQuerySchema.safeParse({
        ...BASE_RESEARCH_FIELDS,
        repo: 'react',
      });
      expect(result.success).toBe(true);
    });

    it('should accept with owner and repo', () => {
      const result = GitHubPullRequestSearchQuerySchema.safeParse({
        ...BASE_RESEARCH_FIELDS,
        owner: 'facebook',
        repo: 'react',
      });
      expect(result.success).toBe(true);
    });

    it('should accept with query param', () => {
      const result = GitHubPullRequestSearchQuerySchema.safeParse({
        ...BASE_RESEARCH_FIELDS,
        query: 'fix bug',
      });
      expect(result.success).toBe(true);
    });

    it('should accept with author param', () => {
      const result = GitHubPullRequestSearchQuerySchema.safeParse({
        ...BASE_RESEARCH_FIELDS,
        author: 'octocat',
      });
      expect(result.success).toBe(true);
    });

    it('should accept with assignee param', () => {
      const result = GitHubPullRequestSearchQuerySchema.safeParse({
        ...BASE_RESEARCH_FIELDS,
        assignee: 'octocat',
      });
      expect(result.success).toBe(true);
    });

    it('should accept with prNumber + owner + repo', () => {
      const result = GitHubPullRequestSearchQuerySchema.safeParse({
        ...BASE_RESEARCH_FIELDS,
        prNumber: 123,
        owner: 'facebook',
        repo: 'react',
      });
      expect(result.success).toBe(true);
    });

    it('should reject with prNumber alone (no owner+repo)', () => {
      const result = GitHubPullRequestSearchQuerySchema.safeParse({
        ...BASE_RESEARCH_FIELDS,
        prNumber: 123,
      });
      expect(result.success).toBe(false);
    });

    it('should reject whitespace-only query as valid param', () => {
      const result = GitHubPullRequestSearchQuerySchema.safeParse({
        ...BASE_RESEARCH_FIELDS,
        query: '   ',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Both validations combined', () => {
    it('should report both errors when query is too long and no valid params', () => {
      const result = GitHubPullRequestSearchQuerySchema.safeParse({
        ...BASE_RESEARCH_FIELDS,
        query: 'a'.repeat(257),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map(i => i.message);
        expect(messages).toContain(
          'Query too long. Maximum 256 characters allowed.'
        );
      }
    });
  });
});

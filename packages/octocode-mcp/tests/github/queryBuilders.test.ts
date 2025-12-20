import { describe, it, expect } from 'vitest';
import {
  getOwnerQualifier,
  buildCodeSearchQuery,
  buildRepoSearchQuery,
  buildPullRequestSearchQuery,
  shouldUseSearchForPRs,
} from '../../src/github/queryBuilders.js';
import type { GitHubCodeSearchQuery } from '../../src/types.js';

// Type assertion helper for test data - allows arrays for test flexibility
const toCodeSearchQuery = (params: {
  keywordsToSearch: string[];
  owner?: string | string[];
  repo?: string | string[];
  extension?: string;
  stars?: string;
  filename?: string;
  path?: string;
  match?: 'file' | 'path' | Array<'file' | 'path'>;
  limit?: number;
  minify?: boolean;
}): GitHubCodeSearchQuery => params as GitHubCodeSearchQuery;

describe('Query Builders', () => {
  describe('getOwnerQualifier', () => {
    it('should always use user: qualifier as it matches both users and orgs', () => {
      expect(getOwnerQualifier('my-org')).toBe('user:my-org');
      expect(getOwnerQualifier('my_org')).toBe('user:my_org');
      expect(getOwnerQualifier('myorg')).toBe('user:myorg');
      expect(getOwnerQualifier('john')).toBe('user:john');
      expect(getOwnerQualifier('Organization')).toBe('user:Organization');
    });
  });

  describe('buildCodeSearchQuery', () => {
    it('should build basic query with terms', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: ['function', 'auth'],

        minify: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe('function auth');
    });

    it('should build query with owner and repo', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: ['test'],
        owner: 'microsoft',
        repo: 'vscode',

        minify: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe('test repo:microsoft/vscode');
    });

    it('should build query with owner only', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: ['test'],
        owner: 'google',

        minify: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe('test user:google');
    });

    it('should build query with multiple owners and repos', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: ['test'],
        owner: ['microsoft', 'google'],
        repo: ['vscode', 'typescript'],

        minify: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe(
        'test repo:microsoft/vscode repo:microsoft/typescript repo:google/vscode repo:google/typescript'
      );
    });

    it('should build query with file filters', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: ['test'],
        filename: 'package.json',
        extension: 'ts',
        path: 'src/',

        minify: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe('test filename:package.json extension:ts path:src/');
    });

    it('should build query with match filters', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: ['test'],
        match: ['file', 'path'],

        minify: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe('test in:file in:path');
    });

    it('should build query with single match filter', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: ['test'],
        match: 'file',

        minify: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe('test in:file');
    });

    it('should build query with stars and date filters', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: ['react'],
        stars: '>100',

        minify: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe('react stars:>100');
    });

    it('should handle empty query terms', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: [],
        owner: 'microsoft',

        minify: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe('user:microsoft');
    });
  });

  describe('buildRepoSearchQuery', () => {
    it('should build basic repo search query', () => {
      const params = {
        keywordsToSearch: ['todo', 'app'],
      };

      const query = buildRepoSearchQuery(params);
      expect(query).toBe('todo app is:not-archived');
    });

    it('should build query with topicsToSearch', () => {
      const params = {
        keywordsToSearch: ['app'],
        topicsToSearch: ['react', 'typescript'],
      };

      const query = buildRepoSearchQuery(params);
      expect(query).toBe('app topic:react topic:typescript is:not-archived');
    });

    it('should build query with single topic', () => {
      const params: Parameters<typeof buildRepoSearchQuery>[0] = {
        keywordsToSearch: ['framework'],
        topicsToSearch: ['javascript'],
      };

      const query = buildRepoSearchQuery(params);
      expect(query).toBe('framework topic:javascript is:not-archived');
    });

    it('should build query with repository metrics', () => {
      const params = {
        keywordsToSearch: ['library'],
        stars: '>1000',
        size: '<10000',
      };

      const query = buildRepoSearchQuery(params);
      expect(query).toBe('library stars:>1000 size:<10000 is:not-archived');
    });

    it('should build query with match filters', () => {
      const params = {
        keywordsToSearch: ['awesome'],
        match: ['name', 'description'],
      } as Parameters<typeof buildRepoSearchQuery>[0];

      const query = buildRepoSearchQuery(params);
      expect(query).toBe('awesome in:name in:description is:not-archived');
    });

    it('should map updated to pushed', () => {
      const params = {
        keywordsToSearch: ['active'],
        updated: '>2023-01-01',
      };

      const query = buildRepoSearchQuery(params);
      expect(query).toBe('active pushed:>2023-01-01 is:not-archived');
    });

    it('should build query with readme match filter', () => {
      const params = {
        keywordsToSearch: ['awesome'],
        match: ['readme'],
      } as Parameters<typeof buildRepoSearchQuery>[0];

      const query = buildRepoSearchQuery(params);
      expect(query).toBe('awesome in:readme is:not-archived');
    });

    it('should build query with single readme match', () => {
      const params = {
        keywordsToSearch: ['awesome'],
        match: ['readme'],
      } as Parameters<typeof buildRepoSearchQuery>[0];

      const query = buildRepoSearchQuery(params);
      expect(query).toBe('awesome in:readme is:not-archived');
    });

    it('should build query with created date filter', () => {
      const params = {
        keywordsToSearch: ['repo'],
        created: '>2023-01-01',
      };

      const query = buildRepoSearchQuery(params);
      expect(query).toBe('repo created:>2023-01-01 is:not-archived');
    });
  });

  describe('buildPullRequestSearchQuery', () => {
    it('should build basic PR search query', () => {
      const params = {
        query: 'bug fix',
      };

      const query = buildPullRequestSearchQuery(params);
      expect(query).toBe('bug fix is:pr archived:false');
    });

    it('should build query with state filters', () => {
      const params = {
        state: 'open' as const,
        draft: true,
        merged: false,
      };

      const query = buildPullRequestSearchQuery(params);
      expect(query).toBe('is:pr is:open is:draft is:unmerged archived:false');
    });

    it('should build query with user filters', () => {
      const params = {
        author: 'john',
        assignee: 'alice',
        mentions: 'bob',
        commenter: 'charlie',
        'reviewed-by': 'dave',
      };

      const query = buildPullRequestSearchQuery(params);
      expect(query).toBe(
        'is:pr author:john assignee:alice mentions:bob commenter:charlie reviewed-by:dave archived:false'
      );
    });

    it('should build query with branch filters', () => {
      const params = {
        head: 'feature-branch',
        base: 'main',
      };

      const query = buildPullRequestSearchQuery(params);
      expect(query).toBe('is:pr head:feature-branch base:main archived:false');
    });

    it('should build query with engagement filters', () => {
      const params = {
        comments: '>5',
        reactions: '>10',
        interactions: '>20',
      };

      const query = buildPullRequestSearchQuery(params);
      expect(query).toBe(
        'is:pr comments:>5 reactions:>10 interactions:>20 archived:false'
      );
    });

    it('should build query with label filters', () => {
      const params = {
        label: ['bug', 'enhancement'],
      };

      const query = buildPullRequestSearchQuery(params);
      expect(query).toBe(
        'is:pr label:"bug" label:"enhancement" archived:false'
      );
    });

    it('should build query with negative filters', () => {
      const params = {
        'no-assignee': true,
        'no-label': true,
        'no-milestone': true,
        'no-project': true,
      };

      const query = buildPullRequestSearchQuery(params);
      expect(query).toBe(
        'is:pr no:assignee no:label no:milestone no:project archived:false'
      );
    });

    it('should build query with all date filters', () => {
      const params = {
        created: '>2023-01-01',
        updated: '2023-01-01..2023-12-31',
        'author-date': '>2023-01-01',
        'committer-date': '>2023-01-01',
        'merged-at': '>2023-06-01',
        closed: '<2023-12-31',
      };

      const query = buildPullRequestSearchQuery(params);
      expect(query).toContain('created:>2023-01-01');
      expect(query).toContain('updated:2023-01-01..2023-12-31');
      expect(query).toContain('author-date:>2023-01-01');
      expect(query).toContain('committer-date:>2023-01-01');
      expect(query).toContain('merged:>2023-06-01');
      expect(query).toContain('closed:<2023-12-31');
    });

    it('should build query with involves user filter', () => {
      const params = {
        involves: 'alice',
      };

      const query = buildPullRequestSearchQuery(params);
      expect(query).toBe('is:pr involves:alice archived:false');
    });

    it('should build query with review-requested filter', () => {
      const params = {
        'review-requested': 'bob',
      };

      const query = buildPullRequestSearchQuery(params);
      expect(query).toBe('is:pr review-requested:bob archived:false');
    });
  });

  describe('shouldUseSearchForPRs', () => {
    it('should return false for simple list operations', () => {
      const params = {
        owner: 'microsoft',
        repo: 'vscode',
        state: 'open' as const,
      };

      expect(shouldUseSearchForPRs(params)).toBe(false);
    });

    it('should return true when draft filter is used', () => {
      const params = {
        draft: true,
      };

      expect(shouldUseSearchForPRs(params)).toBe(true);
    });

    it('should return true when author filter is used', () => {
      const params = {
        author: 'john',
      };

      expect(shouldUseSearchForPRs(params)).toBe(true);
    });

    it('should return true when query is provided', () => {
      const params = {
        query: 'bug fix',
      };

      expect(shouldUseSearchForPRs(params)).toBe(true);
    });

    it('should return true when labels are specified', () => {
      const params = {
        label: ['bug', 'enhancement'],
      };

      expect(shouldUseSearchForPRs(params)).toBe(true);
    });

    it('should return true when complex filters are used', () => {
      const params = {
        reactions: '>10',
        comments: '>5',
        'reviewed-by': 'alice',
      };

      expect(shouldUseSearchForPRs(params)).toBe(true);
    });

    it('should return true when multiple owners/repos are specified', () => {
      const params = {
        owner: ['microsoft', 'google'],
        repo: 'vscode',
      };

      expect(shouldUseSearchForPRs(params)).toBe(true);
    });

    it('should return true when date filters are used', () => {
      const params = {
        created: '>2023-01-01',
        updated: '2023-01-01..2023-12-31',
      };

      expect(shouldUseSearchForPRs(params)).toBe(true);
    });

    it('should return true when negative filters are used', () => {
      const params = {
        'no-assignee': true,
        'no-label': true,
      };

      expect(shouldUseSearchForPRs(params)).toBe(true);
    });
  });
});

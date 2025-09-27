import { describe, it, expect } from 'vitest';
import {
  getOwnerQualifier,
  buildCodeSearchQuery,
  buildRepoSearchQuery,
  buildPullRequestSearchQuery,
  buildCommitSearchQuery,
  shouldUseSearchForPRs,
} from '../../src/github/queryBuilders.js';

// Type assertion helper for test data
const toCodeSearchQuery = (params: Record<string, unknown>) =>
  params as Parameters<typeof buildCodeSearchQuery>[0];

describe('Query Builders', () => {
  describe('getOwnerQualifier', () => {
    it('should use org: for organization-style names with hyphens', () => {
      expect(getOwnerQualifier('my-org')).toBe('org:my-org');
    });

    it('should use org: for organization-style names with underscores', () => {
      expect(getOwnerQualifier('my_org')).toBe('org:my_org');
    });

    it('should use org: for names containing "org"', () => {
      expect(getOwnerQualifier('myorg')).toBe('org:myorg');
      expect(getOwnerQualifier('Organization')).toBe('org:Organization');
    });

    it('should use user: for simple user names', () => {
      expect(getOwnerQualifier('john')).toBe('user:john');
      expect(getOwnerQualifier('alice123')).toBe('user:alice123');
    });

    it('should handle case insensitive org detection', () => {
      expect(getOwnerQualifier('MyORG')).toBe('org:MyORG');
      expect(getOwnerQualifier('orgaNization')).toBe('org:orgaNization');
    });
  });

  describe('buildCodeSearchQuery', () => {
    it('should build basic query with terms', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: ['function', 'auth'],

        minify: true,
        sanitize: true,
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
        sanitize: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe('test repo:microsoft/vscode');
    });

    it('should build query with owner only', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: ['test'],
        owner: 'google',

        minify: true,
        sanitize: true,
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
        sanitize: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe(
        'test repo:microsoft/vscode repo:microsoft/typescript repo:google/vscode repo:google/typescript'
      );
    });

    it('should build query with language filter', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: ['function'],
        language: 'ts',

        minify: true,
        sanitize: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe('function language:TypeScript');
    });

    it('should build query with file filters', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: ['test'],
        filename: 'package.json',
        extension: 'ts',
        path: 'src/',

        minify: true,
        sanitize: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe('test filename:package.json extension:ts path:src/');
    });

    it('should build query with match filters', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: ['test'],
        match: ['file', 'path'],

        minify: true,
        sanitize: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe('test in:file in:path');
    });

    it('should build query with single match filter', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: ['test'],
        match: 'file',

        minify: true,
        sanitize: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe('test in:file');
    });

    it('should build query with stars and date filters', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: ['react'],
        stars: '>100',

        minify: true,
        sanitize: true,
      });

      const query = buildCodeSearchQuery(params);
      expect(query).toBe('react stars:>100');
    });

    it('should handle empty query terms', () => {
      const params = toCodeSearchQuery({
        keywordsToSearch: [],
        owner: 'microsoft',

        minify: true,
        sanitize: true,
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
      const params = {
        keywordsToSearch: ['framework'],
        topicsToSearch: 'javascript',
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

    it('should build query with milestone', () => {
      const params = {
        milestone: 'v1.0.0',
      };

      const query = buildPullRequestSearchQuery(params);
      expect(query).toBe('is:pr milestone:"v1.0.0" archived:false');
    });

    it('should build query with checks status', () => {
      const params = {
        checks: 'success' as const,
      };

      const query = buildPullRequestSearchQuery(params);
      expect(query).toBe('is:pr status:success archived:false');
    });
  });

  describe('buildCommitSearchQuery', () => {
    it('should build basic commit search query', () => {
      const params = {
        keywordsToSearch: ['fix', 'bug'],
      };

      const query = buildCommitSearchQuery(params);
      expect(query).toBe('fix bug');
    });

    it('should build query with exact query', () => {
      const params = {
        exactQuery: 'fix critical bug',
      };

      const query = buildCommitSearchQuery(params);
      expect(query).toBe('"fix critical bug"');
    });

    it('should build query with OR terms', () => {
      const params = {
        orTerms: ['fix', 'patch', 'update'],
      };

      const query = buildCommitSearchQuery(params);
      expect(query).toBe('fix OR patch OR update');
    });

    it('should build query with author filters', () => {
      const params = {
        keywordsToSearch: ['feature'],
        author: 'john',
        'author-name': 'John Doe',
        'author-email': 'john@example.com',
      };

      const query = buildCommitSearchQuery(params);
      expect(query).toBe(
        'feature author:john author-name:"John Doe" author-email:john@example.com'
      );
    });

    it('should build query with committer filters', () => {
      const params = {
        keywordsToSearch: ['merge'],
        committer: 'alice',
        'committer-name': 'Alice Smith',
        'committer-email': 'alice@example.com',
      };

      const query = buildCommitSearchQuery(params);
      expect(query).toBe(
        'merge committer:alice committer-name:"Alice Smith" committer-email:alice@example.com'
      );
    });

    it('should build query with hash filters', () => {
      const params = {
        keywordsToSearch: ['refactor'],
        hash: 'abc123',
        parent: 'def456',
        tree: 'ghi789',
      };

      const query = buildCommitSearchQuery(params);
      expect(query).toBe('refactor hash:abc123 parent:def456 tree:ghi789');
    });

    it('should build query with date filters', () => {
      const params = {
        keywordsToSearch: ['update'],
        'author-date': '>2023-01-01',
        'committer-date': '2023-01-01..2023-12-31',
      };

      const query = buildCommitSearchQuery(params);
      expect(query).toBe(
        'update author-date:>2023-01-01 committer-date:2023-01-01..2023-12-31'
      );
    });

    it('should build query with merge filter', () => {
      const params = {
        keywordsToSearch: ['feature'],
        merge: true,
      };

      const query = buildCommitSearchQuery(params);
      expect(query).toBe('feature merge:true');
    });

    it('should build query excluding merges', () => {
      const params = {
        keywordsToSearch: ['docs'],
        merge: false,
      };

      const query = buildCommitSearchQuery(params);
      expect(query).toBe('docs merge:false');
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

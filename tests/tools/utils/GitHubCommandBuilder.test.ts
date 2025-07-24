import { describe, it, expect } from 'vitest';
import {
  GitHubIssuesSearchBuilder,
  GitHubReposSearchBuilder,
  GitHubCommitsSearchBuilder,
} from '../../../src/mcp/tools/utils/GitHubCommandBuilder.js';

describe('GitHubCommandBuilder', () => {
  describe('GitHubIssuesSearchBuilder', () => {
    let builder: GitHubIssuesSearchBuilder;

    beforeEach(() => {
      builder = new GitHubIssuesSearchBuilder();
    });

    it('should build basic issues search command', () => {
      const result = builder.build({
        query: 'bug in authentication',
      });

      expect(result).toContain('issues');
      expect(result).toContain('bug in authentication');
      expect(result).toContain('--limit=30');
      expect(result).toContain('--json');
    });

    it('should build issues search with all parameters', () => {
      const result = builder.build({
        query: 'memory leak',
        owner: 'facebook',
        repo: 'react',
        author: 'gaearon',
        assignee: 'sebmarkbage',
        mentions: 'dan_abramov',
        involves: 'sophiebits',
        commenter: 'acdlite',
        app: 'github-actions',
        archived: false,
        closed: '2023-01-01..2023-12-31',
        comments: '>5',
        interactions: '>10',
        language: 'javascript',
        match: 'title',
        milestone: 'v18.0.0',
        reactions: '>10',
        sort: 'updated',
        state: 'open',
        updated: '>2023-01-01',
        limit: 100,
        'include-prs': true,
        locked: true,
      });

      expect(result).toContain('issues');
      expect(result).toContain('memory leak');
      expect(result).toContain('--repo=facebook/react');
      expect(result).toContain('--author=gaearon');
      expect(result).toContain('--assignee=sebmarkbage');
      expect(result).toContain('--mentions=dan_abramov');
      expect(result).toContain('--involves=sophiebits');
      expect(result).toContain('--commenter=acdlite');
      expect(result).toContain('--app=github-actions');
      expect(result).toContain('--archived=false');
      expect(result).toContain('--closed=2023-01-01..2023-12-31');
      expect(result).toContain('--comments=>5');
      expect(result).toContain('--interactions=>10');
      expect(result).toContain('--language=javascript');
      expect(result).toContain('--match=title');
      expect(result).toContain('--milestone=v18.0.0');
      expect(result).toContain('--reactions=>10');
      expect(result).toContain('--sort=updated');
      expect(result).toContain('--state=open');
      expect(result).toContain('--updated=>2023-01-01');
      expect(result).toContain('--limit=100');
      expect(result).toContain('--include-prs');
      expect(result).toContain('--locked');
    });

    it('should handle boolean flags correctly', () => {
      const result = builder.build({
        query: 'test',
        archived: true,
        'include-prs': false,
        locked: true,
      });

      expect(result).toContain('--archived=true');
      expect(result).not.toContain('--include-prs');
      expect(result).toContain('--locked');
    });
  });
  describe('GitHubReposSearchBuilder', () => {
    let builder: GitHubReposSearchBuilder;

    beforeEach(() => {
      builder = new GitHubReposSearchBuilder();
    });

    it('should build basic repos search command', () => {
      const result = builder.build({
        exactQuery: 'javascript framework',
      });

      expect(result).toContain('repos');
      expect(result).toContain('"javascript framework"');
      expect(result).toContain('--limit=30');
      expect(result).toContain(
        '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility'
      );
    });

    it('should build repos search with query terms', () => {
      const result = builder.build({
        queryTerms: ['react', 'components', 'ui'],
      });

      expect(result).toContain('react components ui');
    });

    it('should build repos search with all parameters', () => {
      const result = builder.build({
        exactQuery: 'machine learning',
        created: '>2020-01-01',
        followers: '>100',
        forks: '>50',
        'good-first-issues': '>5',
        'help-wanted-issues': '>10',
        language: 'python',
        license: 'mit',
        org: 'tensorflow',
        owner: 'google',
        repo: 'tensorflow',
        size: '>1000',
        sort: 'stars',
        stars: '>1000',
        topic: 'machine-learning',
        updated: '>2023-01-01',
        user: 'octocat',
        archived: true,
        fork: true,
        limit: 100,
      });

      expect(result).toContain('repos');
      expect(result).toContain('"machine learning"');
      expect(result).toContain('--created=>2020-01-01');
      expect(result).toContain('--followers=>100');
      expect(result).toContain('--forks=>50');
      expect(result).toContain('--good-first-issues=>5');
      expect(result).toContain('--help-wanted-issues=>10');
      expect(result).toContain('--language=python');
      expect(result).toContain('--license=mit');
      expect(result).toContain('--org=tensorflow');
      expect(result).toContain('--owner=google');
      expect(result).toContain('--repo=tensorflow');
      expect(result).toContain('--size=>1000');
      expect(result).toContain('--sort=stars');
      expect(result).toContain('--stars=>1000');
      expect(result).toContain('--topic=machine-learning');
      expect(result).toContain('--updated=>2023-01-01');
      expect(result).toContain('--user=octocat');
      expect(result).toContain('--archived');
      expect(result).toContain('--fork');
      expect(result).toContain('--limit=100');
    });

    it('should handle boolean flags correctly', () => {
      const result = builder.build({
        exactQuery: 'test',
        archived: true,
        fork: false,
      });

      expect(result).toContain('--archived');
      expect(result).not.toContain('--fork');
    });
  });

  describe('GitHubCommitsSearchBuilder', () => {
    let builder: GitHubCommitsSearchBuilder;

    beforeEach(() => {
      builder = new GitHubCommitsSearchBuilder();
    });

    it('should build basic commits search command', () => {
      const result = builder.build({
        exactQuery: 'fix bug in parser',
      });

      expect(result).toContain('commits');
      expect(result).toContain('"fix bug in parser"');
      expect(result).toContain('--limit=100');
      expect(result).toContain(
        '--json=sha,commit,author,committer,repository,url,parents'
      );
    });

    it('should build commits search with query terms and OR terms', () => {
      const result = builder.build({
        queryTerms: ['fix', 'bug'],
        orTerms: ['parser', 'lexer'],
      });

      expect(result).toContain('commits');
      expect(result).toContain('fix bug (parser OR lexer)');
    });

    it('should build commits search with all parameters', () => {
      const result = builder.build({
        exactQuery: 'performance improvement',
        owner: 'facebook',
        repo: 'react',
        author: 'gaearon',
        'author-name': 'Dan Abramov',
        'author-email': 'dan.abramov@gmail.com',
        committer: 'github-actions',
        'committer-name': 'GitHub Actions',
        'committer-email': 'actions@github.com',
        'author-date': '2023-01-01..2023-12-31',
        'committer-date': '2023-01-01..2023-12-31',
        merge: false,
        sort: 'author-date',
        order: 'desc',
        limit: 200,
      });

      expect(result).toContain('commits');
      expect(result).toContain('"performance improvement"');
      expect(result).toContain('--repo=facebook/react');
      expect(result).toContain('--author=gaearon');
      expect(result).toContain('--author-name=Dan Abramov');
      expect(result).toContain('--author-email=dan.abramov@gmail.com');
      expect(result).toContain('--committer=github-actions');
      expect(result).toContain('--committer-name=GitHub Actions');
      expect(result).toContain('--committer-email=actions@github.com');
      expect(result).toContain('--author-date=2023-01-01..2023-12-31');
      expect(result).toContain('--committer-date=2023-01-01..2023-12-31');
      expect(result).toContain('--merge=false');
      expect(result).toContain('--sort=author-date');
      expect(result).toContain('--order=desc');
      expect(result).toContain('--limit=200');
    });

    it('should handle OR terms with special characters', () => {
      const result = builder.build({
        orTerms: ['fix()', 'patch[]', 'normal'],
      });

      expect(result).toContain('("fix()" OR "patch[]" OR normal)');
    });

    it('should handle single OR term', () => {
      const result = builder.build({
        orTerms: ['single'],
      });

      expect(result).toContain('single');
      expect(result).not.toContain('OR');
    });

    it('should handle empty query with filters only', () => {
      const result = builder.build({
        owner: 'facebook',
        repo: 'react',
        author: 'gaearon',
      });

      expect(result).toContain('commits');
      expect(result).toContain('--repo=facebook/react');
      expect(result).toContain('--author=gaearon');
      expect(result).not.toContain('""');
    });
  });

  describe('Common GitHub Features', () => {
    it('should handle date range parameters consistently', () => {
      const issuesBuilder = new GitHubIssuesSearchBuilder();
      const result = issuesBuilder.build({
        query: 'test',
        created: '2023-01-01..2023-12-31',
        updated: '>2023-06-01',
      });

      expect(result).toContain('--created=2023-01-01..2023-12-31');
      expect(result).toContain('--updated=>2023-06-01');
    });
  });
});

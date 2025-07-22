import { describe, it, expect } from 'vitest';
import { buildGitHubCliArgs } from '../../../src/mcp/tools/github_search_code.js';
import { buildGitHubCommitCliArgs } from '../../../src/mcp/tools/github_search_commits.js';
import { buildGitHubIssuesAPICommand } from '../../../src/mcp/tools/github_search_issues.js';
import { buildGitHubPullRequestsAPICommand } from '../../../src/mcp/tools/github_search_pull_requests.js';
import { buildGitHubReposSearchCommand } from '../../../src/mcp/tools/github_search_repos.js';
import {
  GitHubCodeSearchBuilder,
  GitHubCommitsSearchBuilder,
  GitHubIssuesSearchBuilder,
  GitHubPullRequestsSearchBuilder,
  GitHubReposSearchBuilder,
} from '../../../src/mcp/tools/utils/GitHubCommandBuilder.js';
import {
  NpmPackageSearchBuilder,
  NpmPackageViewBuilder,
} from '../../../src/mcp/tools/utils/NpmCommandBuilder.js';

describe('Command Builder Integration Tests', () => {
  describe('GitHub Tools Integration', () => {
    describe('Code Search Integration', () => {
      it('should produce identical results between old and new implementation', () => {
        const params = {
          exactQuery: 'async function',
          language: 'typescript',
          owner: 'microsoft',
          repo: 'vscode',
          filename: 'extension.ts',
          extension: 'ts',
          size: '>1000',
          match: 'file' as const,
          limit: 50,
        };

        const oldResult = buildGitHubCliArgs(params);
        const newBuilder = new GitHubCodeSearchBuilder();
        const newResult = newBuilder.build(params);

        // Results should be functionally equivalent
        expect(oldResult).toEqual(newResult);
      });

      it('should handle all GitHub Code Search API parameters', () => {
        const allParams = {
          exactQuery: 'function test',
          queryTerms: ['async', 'await'],
          language: 'javascript',
          owner: ['facebook', 'microsoft'],
          repo: ['react', 'vscode'],
          filename: 'index.js',
          extension: 'js',
          size: '100..1000',
          match: 'path' as const,
          limit: 100,
        };

        const builder = new GitHubCodeSearchBuilder();
        const result = builder.build(allParams);

        // Verify all parameters are included
        expect(result).toContain('code');
        expect(result).toContain('"function test"');
        expect(result).toContain('--language=javascript');
        expect(result).toContain('--repo=facebook/react');
        expect(result).toContain('--repo=microsoft/vscode');
        expect(result).toContain('--filename=index.js');
        expect(result).toContain('--extension=js');
        expect(result).toContain('--size=100..1000');
        expect(result).toContain('--match=path');
        expect(result).toContain('--limit=100');
        expect(result).toContain('--json=repository,path,textMatches,sha,url');
      });
    });

    describe('Commits Search Integration', () => {
      it('should produce identical results between old and new implementation', () => {
        const params = {
          exactQuery: 'fix memory leak',
          owner: 'facebook',
          repo: 'react',
          author: 'gaearon',
          'author-name': 'Dan Abramov',
          'author-email': 'dan.abramov@gmail.com',
          'author-date': '2023-01-01..2023-12-31',
          sort: 'author-date' as const,
          order: 'desc' as const,
          limit: 100,
        };

        const oldResult = buildGitHubCommitCliArgs(params);
        const newBuilder = new GitHubCommitsSearchBuilder();
        const newResult = newBuilder.build(params);

        expect(oldResult).toEqual(newResult);
      });

      it('should handle commits search with OR terms', () => {
        const params = {
          queryTerms: ['performance', 'optimization'],
          orTerms: ['memory', 'cpu', 'speed'],
          owner: 'facebook',
          repo: 'react',
          limit: 50,
        };

        const builder = new GitHubCommitsSearchBuilder();
        const result = builder.build(params);

        expect(result).toContain('commits');
        expect(result).toContain(
          'performance optimization (memory OR cpu OR speed)'
        );
        expect(result).toContain('--repo=facebook/react');
        expect(result).toContain('--limit=50');
      });
    });

    describe('Issues Search Integration', () => {
      it('should produce compatible results with existing API', () => {
        const params = {
          query: 'performance issue',
          owner: 'facebook',
          repo: 'react',
          author: 'gaearon',
          assignee: 'sebmarkbage',
          state: 'open' as const,
          sort: 'updated' as const,
          limit: 30,
        };

        const oldResult = buildGitHubIssuesAPICommand(params);
        const newBuilder = new GitHubIssuesSearchBuilder();
        const newResult = newBuilder.build(params);

        // Should produce same command structure
        expect(oldResult.command).toBe('search');
        expect(oldResult.args).toEqual(newResult);
      });

      it('should handle all issues search parameters', () => {
        const params = {
          query: 'bug report',
          owner: 'microsoft',
          repo: 'vscode',
          author: 'joaomoreno',
          assignee: 'alexdima',
          mentions: 'sandy081',
          involves: 'rebornix',
          commenter: 'kieferrm',
          app: 'github-actions',
          archived: false,
          closed: '2023-01-01..2023-12-31',
          comments: '>5',
          interactions: '>10',
          'include-prs': true,
          language: 'typescript',
          locked: true,
          match: 'title' as const,
          milestone: '1.75.0',
          reactions: '>20',
          sort: 'created' as const,
          state: 'closed' as const,
          updated: '>2023-01-01',
          limit: 100,
        };

        const builder = new GitHubIssuesSearchBuilder();
        const result = builder.build(params);

        expect(result).toContain('issues');
        expect(result).toContain('bug report');
        expect(result).toContain('--repo=microsoft/vscode');
        expect(result).toContain('--author=joaomoreno');
        expect(result).toContain('--assignee=alexdima');
        expect(result).toContain('--include-prs');
        expect(result).toContain('--locked');
        expect(result).toContain('--archived=false');
        expect(result).toContain('--limit=100');
      });
    });

    describe('Pull Requests Search Integration', () => {
      it('should produce compatible results with existing API', () => {
        const params = {
          query: 'feature request',
          owner: 'microsoft',
          repo: 'vscode',
          author: 'joaomoreno',
          state: 'open' as const,
          sort: 'created' as const,
          limit: 25,
        };

        const oldResult = buildGitHubPullRequestsAPICommand(params);
        const newBuilder = new GitHubPullRequestsSearchBuilder();
        const newResult = newBuilder.build(params);

        // For repository-specific searches, old implementation uses list command
        if (params.owner && params.repo) {
          expect(oldResult.command).toBe('pr');
          // New implementation should handle this case
          expect(newResult).toContain('pr');
          expect(newResult).toContain('list');
        } else {
          expect(oldResult.command).toBe('search');
          expect(oldResult.args).toEqual(newResult);
        }
      });

      it('should handle all PR search parameters', () => {
        const params = {
          query: 'security fix',
          author: 'octocat',
          assignee: 'developer',
          base: 'main',
          head: 'security-patch',
          label: 'security,critical',
          milestone: 'v2.0.0',
          review: 'approved' as const,
          'review-requested': 'reviewer',
          reviewer: 'maintainer',
          state: 'merged' as const,
          draft: false,
          sort: 'updated' as const,
          limit: 50,
        };

        const builder = new GitHubPullRequestsSearchBuilder();
        const result = builder.build(params);

        expect(result).toContain('pr');
        expect(result).toContain('list');
        expect(result).toContain('security fix');
        expect(result).toContain('--author=octocat');
        expect(result).toContain('--assignee=developer');
        expect(result).toContain('--base=main');
        expect(result).toContain('--head=security-patch');
        expect(result).toContain('--label=security,critical');
        expect(result).toContain('--milestone=v2.0.0');
        expect(result).toContain('--review=approved');
        expect(result).toContain('--review-requested=reviewer');
        expect(result).toContain('--reviewer=maintainer');
        expect(result).toContain('--state=merged');
        expect(result).toContain('--draft=false');
        expect(result).toContain('--sort=updated');
        expect(result).toContain('--limit=50');
      });
    });

    describe('Repositories Search Integration', () => {
      it('should produce compatible results with existing API', () => {
        const params = {
          exactQuery: 'machine learning',
          language: 'python',
          stars: '>1000',
          sort: 'stars' as const,
          limit: 20,
        };

        const oldResult = buildGitHubReposSearchCommand(params);
        const newBuilder = new GitHubReposSearchBuilder();
        const newResult = newBuilder.build(params);

        expect(oldResult.command).toBe('search');
        expect(oldResult.args).toEqual(newResult);
      });

      it('should handle all repository search parameters', () => {
        const params = {
          queryTerms: ['web', 'framework'],
          created: '>2020-01-01',
          followers: '>100',
          forks: '>50',
          'good-first-issues': '>5',
          'help-wanted-issues': '>10',
          language: 'javascript',
          license: 'mit',
          org: 'facebook',
          owner: 'facebook',
          repo: 'react',
          size: '>1000',
          sort: 'updated' as const,
          stars: '>5000',
          topic: 'react',
          updated: '>2023-01-01',
          user: 'gaearon',
          archived: true,
          fork: true,
          limit: 100,
        };

        const builder = new GitHubReposSearchBuilder();
        const result = builder.build(params);

        expect(result).toContain('repos');
        expect(result).toContain('web framework');
        expect(result).toContain('--created=>2020-01-01');
        expect(result).toContain('--language=javascript');
        expect(result).toContain('--stars=>5000');
        expect(result).toContain('--org=facebook');
        expect(result).toContain('--topic=react');
        expect(result).toContain('--archived');
        expect(result).toContain('--fork');
        expect(result).toContain('--limit=100');
      });
    });
  });

  describe('NPM Tools Integration', () => {
    describe('Package Search Integration', () => {
      it('should handle exact query search', () => {
        const builder = new NpmPackageSearchBuilder();
        const result = builder.build({
          exactQuery: 'react testing library',
          searchLimit: 30,
        });

        expect(result).toContain('search');
        expect(result).toContain('react testing library');
        expect(result).toContain('--searchlimit=30');
        expect(result).toContain('--json');
      });

      it('should handle query terms search', () => {
        const builder = new NpmPackageSearchBuilder();
        const result = builder.build({
          queryTerms: ['typescript', 'types', 'definitions'],
          searchLimit: 50,
        });

        expect(result).toContain('search');
        expect(result).toContain('typescript types definitions');
        expect(result).toContain('--searchlimit=50');
        expect(result).toContain('--json');
      });

      it('should use default search limit when not specified', () => {
        const builder = new NpmPackageSearchBuilder();
        const result = builder.build({
          query: 'express',
        });

        expect(result).toContain('search');
        expect(result).toContain('express');
        expect(result).toContain('--searchlimit=20');
        expect(result).toContain('--json');
      });
    });

    describe('Package View Integration', () => {
      it('should handle basic package view', () => {
        const builder = new NpmPackageViewBuilder();
        const result = builder.build({
          packageName: 'lodash',
        });

        expect(result).toContain('view');
        expect(result).toContain('lodash');
        expect(result).toContain('--json');
      });

      it('should handle package view with specific field', () => {
        const builder = new NpmPackageViewBuilder();
        const result = builder.build({
          packageName: 'react',
          field: 'dependencies',
        });

        expect(result).toContain('view');
        expect(result).toContain('react');
        expect(result).toContain('dependencies');
        expect(result).toContain('--json');
      });

      it('should handle package view with multiple match fields', () => {
        const builder = new NpmPackageViewBuilder();
        const result = builder.build({
          packageName: 'express',
          match: ['version', 'description', 'author', 'license'],
        });

        expect(result).toContain('view');
        expect(result).toContain('express');
        expect(result).toContain('version');
        expect(result).toContain('description');
        expect(result).toContain('author');
        expect(result).toContain('license');
        expect(result).toContain('--json');
      });

      it('should handle scoped packages', () => {
        const builder = new NpmPackageViewBuilder();
        const result = builder.build({
          packageName: '@types/node',
          field: 'version',
        });

        expect(result).toContain('view');
        expect(result).toContain('@types/node');
        expect(result).toContain('version');
        expect(result).toContain('--json');
      });
    });
  });

  describe('Cross-Tool Parameter Consistency', () => {
    it('should handle owner/repo parameters consistently across GitHub tools', () => {
      const commonParams = {
        owner: 'facebook',
        repo: 'react',
      };

      const codeBuilder = new GitHubCodeSearchBuilder();
      const issuesBuilder = new GitHubIssuesSearchBuilder();
      const prBuilder = new GitHubPullRequestsSearchBuilder();
      const commitsBuilder = new GitHubCommitsSearchBuilder();

      const codeResult = codeBuilder.build({
        ...commonParams,
        exactQuery: 'test',
      });
      const issuesResult = issuesBuilder.build({
        ...commonParams,
        query: 'test',
      });
      const prResult = prBuilder.build({ ...commonParams, query: 'test' });
      const commitsResult = commitsBuilder.build({
        ...commonParams,
        exactQuery: 'test',
      });

      [codeResult, commitsResult].forEach(result => {
        expect(result).toContain('--repo=facebook/react');
      });

      [issuesResult, prResult].forEach(result => {
        expect(result).toContain('--repo=facebook/react');
      });
    });

    it('should handle limit parameters consistently', () => {
      const limit = 75;

      const codeBuilder = new GitHubCodeSearchBuilder();
      const issuesBuilder = new GitHubIssuesSearchBuilder();
      const reposBuilder = new GitHubReposSearchBuilder();
      const npmSearchBuilder = new NpmPackageSearchBuilder();

      const codeResult = codeBuilder.build({ exactQuery: 'test', limit });
      const issuesResult = issuesBuilder.build({ query: 'test', limit });
      const reposResult = reposBuilder.build({ exactQuery: 'test', limit });
      const npmResult = npmSearchBuilder.build({
        query: 'test',
        searchLimit: limit,
      });

      [codeResult, issuesResult, reposResult].forEach(result => {
        expect(result).toContain('--limit=75');
      });

      expect(npmResult).toContain('--searchlimit=75');
    });

    it('should handle JSON output consistently', () => {
      const builders = [
        new GitHubCodeSearchBuilder(),
        new GitHubIssuesSearchBuilder(),
        new GitHubPullRequestsSearchBuilder(),
        new GitHubReposSearchBuilder(),
        new GitHubCommitsSearchBuilder(),
        new NpmPackageSearchBuilder(),
        new NpmPackageViewBuilder(),
      ];

      builders.forEach(builder => {
        const result = builder.build({
          exactQuery: 'test',
          query: 'test',
          packageName: 'test',
        });
        // Should contain some form of JSON output
        const hasJsonFlag = result.some(arg => arg.startsWith('--json'));
        expect(hasJsonFlag).toBe(true);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty parameters gracefully', () => {
      const builders = [
        new GitHubCodeSearchBuilder(),
        new GitHubIssuesSearchBuilder(),
        new GitHubReposSearchBuilder(),
        new NpmPackageSearchBuilder(),
        new NpmPackageViewBuilder(),
      ];

      builders.forEach(builder => {
        expect(() => builder.build({})).not.toThrow();
      });
    });

    it('should handle undefined and null values', () => {
      const codeBuilder = new GitHubCodeSearchBuilder();

      expect(() =>
        codeBuilder.build({
          exactQuery: undefined,
          language: undefined,
          owner: undefined,
          limit: undefined,
        })
      ).not.toThrow();
    });

    it('should handle malformed array parameters', () => {
      const codeBuilder = new GitHubCodeSearchBuilder();

      // Test various malformed array formats that might come from MCP SDK
      const result = codeBuilder.build({
        exactQuery: 'test',
        owner: '"facebook", "microsoft"', // Quoted comma-separated
        repo: 'react, vue, angular', // Space comma-separated
      });

      expect(result).toContain('--repo=facebook/react');
      expect(result).toContain('--repo=microsoft/vue');
    });
  });
});

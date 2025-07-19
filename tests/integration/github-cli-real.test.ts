import { describe, it, expect } from 'vitest';

// Import all CLI argument building functions
import { buildGitHubCliArgs } from '../../src/mcp/tools/github_search_code.js';
import { buildGitHubCommitCliArgs } from '../../src/mcp/tools/github_search_commits.js';
import { buildGitHubReposSearchCommand } from '../../src/mcp/tools/github_search_repos.js';
import { buildGitHubIssuesAPICommand } from '../../src/mcp/tools/github_search_issues.js';
import {
  buildGitHubPullRequestsAPICommand,
  buildGitHubPullRequestsListCommand,
} from '../../src/mcp/tools/github_search_pull_requests.js';

// Import types
import {
  GitHubCodeSearchParams,
  GitHubCommitSearchParams,
  GitHubReposSearchParams,
  GitHubIssuesSearchParams,
  GitHubPullRequestsSearchParams,
} from '../../src/types.js';

describe('GitHub CLI Real Implementation Tests', () => {
  describe('Code Search - Real Implementation', () => {
    it('should build correct args with combined flag=value format', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'useState',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"useState"',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should combine owner/repo correctly', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'test',
        owner: 'facebook',
        repo: 'react',
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toContain('--repo=facebook/react');
      // Should not have separate owner flag when repo is provided
      expect(result.find(arg => arg.startsWith('--owner='))).toBeUndefined();
    });
  });

  describe('Commits Search - Real Implementation', () => {
    it('should use flag=value format and combine owner/repo', () => {
      const params: GitHubCommitSearchParams = {
        queryTerms: ['fix', 'security'],
        author: 'octocat',
        owner: 'github',
        repo: 'docs',
        limit: 25,
      };

      const result = buildGitHubCommitCliArgs(params);

      expect(result[0]).toBe('commits');
      expect(result[1]).toBe('fix security'); // AND logic joins with space
      expect(result).toContain('--author=octocat');
      expect(result).toContain('--repo=github/docs'); // Combined when both present
      expect(result).toContain('--limit=25');
      expect(result[result.length - 1]).toBe(
        '--json=sha,commit,author,committer,repository,url,parents'
      );
    });

    it('should use separate owner flag when no repo provided', () => {
      const params: GitHubCommitSearchParams = {
        exactQuery: 'fix',
        owner: 'github',
        limit: 10,
      };

      const result = buildGitHubCommitCliArgs(params);

      expect(result).toContain('--owner=github');
      expect(result.find(arg => arg.startsWith('--repo='))).toBeUndefined();
    });
  });

  describe('Repositories Search - Real Implementation', () => {
    it('should handle exactQuery as single argument', () => {
      const params: GitHubReposSearchParams = {
        exactQuery: 'machine learning',
        limit: 30,
      };

      const result = buildGitHubReposSearchCommand(params);

      expect(result.command).toBe('search');
      expect(result.args[0]).toBe('repos');
      expect(result.args[1]).toBe('machine learning'); // Single argument
      expect(result.args).toContain('--limit=30');
    });

    it('should handle queryTerms as separate arguments', () => {
      const params: GitHubReposSearchParams = {
        queryTerms: ['web', 'framework'],
        language: 'javascript',
      };

      const result = buildGitHubReposSearchCommand(params);

      expect(result.command).toBe('search');
      expect(result.args[0]).toBe('repos');
      expect(result.args[1]).toBe('web');
      expect(result.args[2]).toBe('framework');
      expect(result.args).toContain('--language=javascript');
    });

    it('should handle topic arrays with comma separation', () => {
      const params: GitHubReposSearchParams = {
        topic: ['react', 'typescript', 'frontend'],
        language: 'typescript',
      };

      const result = buildGitHubReposSearchCommand(params);

      expect(result.command).toBe('search');
      expect(result.args).toContain('--topic=react,typescript,frontend');
      expect(result.args).toContain('--language=typescript');
    });

    it('should handle multiple owners with separate flags', () => {
      const params: GitHubReposSearchParams = {
        exactQuery: 'cli',
        owner: ['github', 'microsoft'],
      };

      const result = buildGitHubReposSearchCommand(params);

      expect(result.args).toContain('--owner=github,microsoft');
    });
  });

  describe('Issues Search - Real Implementation', () => {
    it('should use separate flag arguments format', () => {
      const params: GitHubIssuesSearchParams = {
        query: 'bug report',
        limit: 25,
      };

      const result = buildGitHubIssuesAPICommand(params);

      expect(result.command).toBe('search');
      expect(result.args[0]).toBe('issues');
      expect(result.args[1]).toBe('bug report');
      // Issues uses separate arguments: ['--limit', '25'] not ['--limit=25']
      expect(result.args).toContain('--limit');
      expect(result.args).toContain('25');

      const limitIndex = result.args.indexOf('--limit');
      expect(result.args[limitIndex + 1]).toBe('25');
    });

    it('should handle advanced filters with separate arguments', () => {
      const params: GitHubIssuesSearchParams = {
        query: 'performance',
        owner: 'facebook',
        repo: 'react',
        state: 'open',
        label: ['bug', 'performance'],
        author: 'gaearon',
      };

      const result = buildGitHubIssuesAPICommand(params);

      expect(result.command).toBe('search');
      expect(result.args).toContain('--author');
      expect(result.args).toContain('gaearon');
      expect(result.args).toContain('--state');
      expect(result.args).toContain('open');
      expect(result.args).toContain('--label');
      expect(result.args).toContain('bug,performance'); // Arrays joined with comma
    });

    it('should handle boolean filters correctly', () => {
      const params: GitHubIssuesSearchParams = {
        query: 'help wanted',
        'no-assignee': true,
        archived: false,
      };

      const result = buildGitHubIssuesAPICommand(params);

      expect(result.args).toContain('--no-assignee');
      expect(result.args).toContain('--archived');
      expect(result.args).toContain('false');
    });
  });

  describe('Pull Requests Search - Real Implementation', () => {
    it('should use pr list command when owner and repo provided', () => {
      const params: GitHubPullRequestsSearchParams = {
        owner: 'facebook',
        repo: 'react',
        state: 'closed',
        limit: 20,
      };

      const result = buildGitHubPullRequestsAPICommand(params);

      expect(result.command).toBe('pr');
      expect(result.args[0]).toBe('list');
      // PR list uses different format for repo specification
      expect(result.args).toContain('--repo');
      expect(result.args).toContain('facebook/react');
    });

    it('should use search API command when query provided without owner/repo', () => {
      const params: GitHubPullRequestsSearchParams = {
        query: 'feature request',
        state: 'open',
        limit: 30,
      };

      const result = buildGitHubPullRequestsAPICommand(params);

      // This should use the search API, not pr list
      expect(result.command).toBe('api');
      expect(result.args.length).toBeGreaterThan(0);
    });

    it('should test pr list command separately', () => {
      const params: GitHubPullRequestsSearchParams = {
        owner: 'facebook',
        repo: 'react',
        state: 'closed',
        author: 'gaearon',
        limit: 15,
      };

      const result = buildGitHubPullRequestsListCommand(params);

      expect(result.command).toBe('pr');
      expect(result.args[0]).toBe('list');
      expect(result.args).toContain('--repo');
      expect(result.args).toContain('facebook/react');
      expect(result.args).toContain('--state');
      expect(result.args).toContain('closed');
      expect(result.args).toContain('--author');
      expect(result.args).toContain('gaearon');
    });
  });

  describe('Cross-Tool Consistency Checks', () => {
    it('should verify each tool produces valid command structures', () => {
      const codeResult = buildGitHubCliArgs({ exactQuery: 'test' });
      const commitResult = buildGitHubCommitCliArgs({ exactQuery: 'test' });
      const repoResult = buildGitHubReposSearchCommand({ exactQuery: 'test' });
      const issueResult = buildGitHubIssuesAPICommand({ query: 'test' });
      const prResult = buildGitHubPullRequestsAPICommand({ query: 'test' });

      // All should start with their respective search types
      expect(codeResult[0]).toBe('code');
      expect(commitResult[0]).toBe('commits');
      expect(repoResult.args[0]).toBe('repos');
      expect(issueResult.args[0]).toBe('issues');
      // PR without owner/repo uses API search, different structure
      expect(prResult.command).toBe('api');

      // All should handle the query appropriately
      expect(codeResult[1]).toBe('"test"');
      expect(commitResult[1]).toBe('test');
      expect(repoResult.args[1]).toBe('test');
      expect(issueResult.args[1]).toBe('test');
    });

    it('should verify JSON output specifications', () => {
      const codeResult = buildGitHubCliArgs({ exactQuery: 'test' });
      const commitResult = buildGitHubCommitCliArgs({ exactQuery: 'test' });
      const repoResult = buildGitHubReposSearchCommand({ exactQuery: 'test' });

      // Code search JSON fields
      expect(codeResult[codeResult.length - 1]).toBe(
        '--json=repository,path,textMatches,sha,url'
      );

      // Commit search JSON fields
      expect(commitResult[commitResult.length - 1]).toBe(
        '--json=sha,commit,author,committer,repository,url,parents'
      );

      // Repo search JSON fields
      const repoJsonFlag = repoResult.args.find(arg =>
        arg.startsWith('--json=')
      );
      expect(repoJsonFlag).toBeDefined();
      expect(repoJsonFlag).toContain('name');
      expect(repoJsonFlag).toContain('fullName');
      expect(repoJsonFlag).toContain('stargazersCount');
    });

    it('should handle edge cases correctly', () => {
      // Empty query cases
      const emptyCodeResult = buildGitHubCliArgs({});
      expect(emptyCodeResult[0]).toBe('code');
      expect(emptyCodeResult.length).toBeGreaterThan(1); // Should have JSON output

      // Limits
      const withLimitCode = buildGitHubCliArgs({
        exactQuery: 'test',
        limit: 42,
      });
      expect(withLimitCode).toContain('--limit=42');

      const withLimitCommit = buildGitHubCommitCliArgs({
        exactQuery: 'test',
        limit: 42,
      });
      expect(withLimitCommit).toContain('--limit=42');

      const withLimitRepo = buildGitHubReposSearchCommand({
        exactQuery: 'test',
        limit: 42,
      });
      expect(withLimitRepo.args).toContain('--limit=42');

      const withLimitIssue = buildGitHubIssuesAPICommand({
        query: 'test',
        limit: 42,
      });
      expect(withLimitIssue.args).toContain('--limit');
      expect(withLimitIssue.args).toContain('42');
    });
  });
});

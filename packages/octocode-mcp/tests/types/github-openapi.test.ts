import { describe, it, expect } from 'vitest';
import {
  isRepository,
  isSearchResultItem,
  isPullRequest,
  isWorkflowRun,
  isCheckRun,
  type Repository,
  type CodeSearchResultItem,
  type PullRequest,
  type WorkflowRun,
  type CheckRun,
} from '../../src/github/types';

// Helper function to create minimal user objects for repository owners
function createUser(login: string, id: number) {
  return {
    login,
    id,
    node_id: `MDQ6VXNlcj${id}`,
    avatar_url: `https://avatars.githubusercontent.com/u/${id}?v=4`,
    gravatar_id: '',
    url: `https://api.github.com/users/${login}`,
    html_url: `https://github.com/${login}`,
    followers_url: `https://api.github.com/users/${login}/followers`,
    following_url: `https://api.github.com/users/${login}/following{/other_user}`,
    gists_url: `https://api.github.com/users/${login}/gists{/gist_id}`,
    starred_url: `https://api.github.com/users/${login}/starred{/owner}{/repo}`,
    subscriptions_url: `https://api.github.com/users/${login}/subscriptions`,
    organizations_url: `https://api.github.com/users/${login}/orgs`,
    repos_url: `https://api.github.com/users/${login}/repos`,
    events_url: `https://api.github.com/users/${login}/events{/privacy}`,
    received_events_url: `https://api.github.com/users/${login}/received_events`,
    type: 'User',
    site_admin: false,
  };
}

// Helper function to create complete license objects
function createLicense(key: string, name: string, url: string) {
  return {
    key,
    name,
    url,
    spdx_id: key.toUpperCase(),
    node_id: `MDc6TGljZW5zZQ==`,
  };
}

// Helper function to create minimal repository for search results
function createMinimalRepository(
  id: number,
  name: string,
  fullName: string,
  owner: ReturnType<typeof createUser>
) {
  const repo = createRepository(id, name, fullName, owner);
  // Ensure all required properties for minimal-repository are present
  return {
    ...repo,
    has_downloads: repo.has_downloads === undefined ? true : repo.has_downloads,
    temp_clone_token:
      repo.temp_clone_token === null ? undefined : repo.temp_clone_token,
    license: repo.license
      ? {
          key: repo.license.key,
          name: repo.license.name,
          spdx_id:
            repo.license.spdx_id === null ? undefined : repo.license.spdx_id,
          url: repo.license.url === null ? undefined : repo.license.url,
          node_id: repo.license.node_id,
        }
      : undefined,
  };
}

// Helper function to create complete repository objects
function createRepository(
  id: number,
  name: string,
  fullName: string,
  owner: ReturnType<typeof createUser>
): Repository {
  return {
    id,
    node_id: `MDEwOlJlcG9zaXRvcnk${id}`,
    name,
    full_name: fullName,
    private: false,
    owner,
    html_url: `https://github.com/${fullName}`,
    description: 'Test repository',
    fork: false,
    url: `https://api.github.com/repos/${fullName}`,
    archive_url: `https://api.github.com/repos/${fullName}/{{archive_format}}{{/ref}}`,
    assignees_url: `https://api.github.com/repos/${fullName}/assignees{/user}`,
    blobs_url: `https://api.github.com/repos/${fullName}/git/blobs{/sha}`,
    branches_url: `https://api.github.com/repos/${fullName}/branches{/branch}`,
    collaborators_url: `https://api.github.com/repos/${fullName}/collaborators{/collaborator}`,
    comments_url: `https://api.github.com/repos/${fullName}/comments{/number}`,
    commits_url: `https://api.github.com/repos/${fullName}/commits{/sha}`,
    compare_url: `https://api.github.com/repos/${fullName}/compare/{base}...{head}`,
    contents_url: `https://api.github.com/repos/${fullName}/contents/{+path}`,
    contributors_url: `https://api.github.com/repos/${fullName}/contributors`,
    deployments_url: `https://api.github.com/repos/${fullName}/deployments`,
    downloads_url: `https://api.github.com/repos/${fullName}/downloads`,
    events_url: `https://api.github.com/repos/${fullName}/events`,
    forks_url: `https://api.github.com/repos/${fullName}/forks`,
    git_commits_url: `https://api.github.com/repos/${fullName}/git/commits{/sha}`,
    git_refs_url: `https://api.github.com/repos/${fullName}/git/refs{/sha}`,
    git_tags_url: `https://api.github.com/repos/${fullName}/git/tags{/sha}`,
    git_url: `git:github.com/${fullName}.git`,
    issue_comment_url: `https://api.github.com/repos/${fullName}/issues/comments{/number}`,
    issue_events_url: `https://api.github.com/repos/${fullName}/issues/events{/number}`,
    issues_url: `https://api.github.com/repos/${fullName}/issues{/number}`,
    keys_url: `https://api.github.com/repos/${fullName}/keys{/key_id}`,
    labels_url: `https://api.github.com/repos/${fullName}/labels{/name}`,
    languages_url: `https://api.github.com/repos/${fullName}/languages`,
    merges_url: `https://api.github.com/repos/${fullName}/merges`,
    milestones_url: `https://api.github.com/repos/${fullName}/milestones{/number}`,
    notifications_url: `https://api.github.com/repos/${fullName}/notifications{?since,all,participating}`,
    pulls_url: `https://api.github.com/repos/${fullName}/pulls{/number}`,
    releases_url: `https://api.github.com/repos/${fullName}/releases{/id}`,
    ssh_url: `git@github.com:${fullName}.git`,
    stargazers_url: `https://api.github.com/repos/${fullName}/stargazers`,
    statuses_url: `https://api.github.com/repos/${fullName}/statuses/{sha}`,
    subscribers_url: `https://api.github.com/repos/${fullName}/subscribers`,
    subscription_url: `https://api.github.com/repos/${fullName}/subscription`,
    tags_url: `https://api.github.com/repos/${fullName}/tags`,
    teams_url: `https://api.github.com/repos/${fullName}/teams`,
    trees_url: `https://api.github.com/repos/${fullName}/git/trees{/sha}`,
    clone_url: `https://github.com/${fullName}.git`,
    mirror_url: null,
    hooks_url: `https://api.github.com/repos/${fullName}/hooks`,
    svn_url: `https://svn.github.com/${fullName}`,
    homepage: null,
    language: 'JavaScript',
    forks_count: 5,
    stargazers_count: 10,
    watchers_count: 10,
    size: 1000,
    default_branch: 'main',
    open_issues_count: 0,
    is_template: false,
    topics: ['test'],
    has_issues: true,
    has_projects: true,
    has_wiki: true,
    has_pages: false,
    has_downloads: true,
    has_discussions: false,
    archived: false,
    disabled: false,
    visibility: 'public',
    pushed_at: '2023-01-01T00:00:00Z',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    allow_rebase_merge: true,
    template_repository: null,
    temp_clone_token: undefined,
    allow_squash_merge: true,
    allow_auto_merge: false,
    delete_branch_on_merge: false,
    allow_merge_commit: true,
    allow_update_branch: false,
    use_squash_pr_title_as_default: false,
    squash_merge_commit_message: 'COMMIT_MESSAGES',
    squash_merge_commit_title: 'COMMIT_OR_PR_TITLE',
    merge_commit_message: 'PR_TITLE',
    merge_commit_title: 'MERGE_MESSAGE',
    web_commit_signoff_required: false,
    subscribers_count: 0,
    network_count: 0,
    license: createLicense(
      'mit',
      'MIT License',
      'https://api.github.com/licenses/mit'
    ),
    organization: null,
    parent: undefined,
    source: undefined,
    forks: 5,
    master_branch: 'main',
    permissions: {
      admin: true,
      maintain: true,
      push: true,
      triage: true,
      pull: true,
    },
    allow_forking: true,
    open_issues: 0,
    watchers: 10,
  };
}

describe('GitHub OpenAPI Types', () => {
  // Legacy type guard tests commented out - using CallToolResult everywhere now
  /*
  describe('isGitHubAPIError', () => {
    it('should return true for valid GitHub API error', () => {
      const error: GitHubAPIError = {
        error: 'Not Found',
        status: 404,
        type: 'http',
      };

      expect(isGitHubAPIError(error)).toBe(true);
    });

    it('should return true for error with all optional fields', () => {
      const error: GitHubAPIError = {
        error: 'Rate limit exceeded',
        status: 429,
        type: 'http',
        scopesSuggestion: 'repo',
        rateLimitRemaining: 0,
        rateLimitReset: 1234567890,
        retryAfter: 60,
      };

      expect(isGitHubAPIError(error)).toBe(true);
    });

    it('should return false for non-error objects', () => {
      expect(isGitHubAPIError({ data: 'success' })).toBe(false);
      expect(isGitHubAPIError({ status: 200 })).toBe(false);
      expect(isGitHubAPIError(null)).toBe(false);
      expect(isGitHubAPIError(undefined)).toBe(false);
      expect(isGitHubAPIError('string')).toBe(false);
      expect(isGitHubAPIError(123)).toBe(false);
    });

    it('should return false for objects missing required fields', () => {
      expect(isGitHubAPIError({ status: 404 })).toBe(false);
      expect(isGitHubAPIError({ type: 'http' })).toBe(false);
      expect(isGitHubAPIError({ error: 'Not Found' })).toBe(false);
    });
  });

  describe('isGitHubAPISuccess', () => {
    it('should return true for valid GitHub API success', () => {
      const success: GitHubAPISuccess<string> = {
        data: 'success data',
        status: 200,
      };

      expect(isGitHubAPISuccess(success)).toBe(true);
    });

    it('should return true for success with optional headers', () => {
      const success: GitHubAPISuccess<{ id: number }> = {
        data: { id: 123 },
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-ratelimit-remaining': '4999',
        },
      };

      expect(isGitHubAPISuccess(success)).toBe(true);
    });

    it('should return false for non-success objects', () => {
      expect(isGitHubAPISuccess({ error: 'Not Found' })).toBe(false);
      expect(isGitHubAPISuccess({ data: 'success' })).toBe(false);
      expect(isGitHubAPISuccess(null)).toBe(false);
      expect(isGitHubAPISuccess(undefined)).toBe(false);
      expect(isGitHubAPISuccess('string')).toBe(false);
      expect(isGitHubAPISuccess(123)).toBe(false);
    });

    it('should return false for objects missing required fields', () => {
      expect(isGitHubAPISuccess({ status: 200 })).toBe(false);
      expect(isGitHubAPISuccess({ data: 'success' })).toBe(false);
    });
  });
  */

  describe('isRepository', () => {
    it('should return true for valid repository object', () => {
      const repo = createRepository(
        123,
        'test-repo',
        'owner/test-repo',
        createUser('owner', 456)
      );

      expect(isRepository(repo)).toBe(true);
    });

    it('should return false for non-repository objects', () => {
      expect(isRepository({ name: 'test' })).toBe(false);
      expect(isRepository({ id: 123 })).toBe(false);
      expect(isRepository(null)).toBe(false);
      expect(isRepository(undefined)).toBe(false);
      expect(isRepository('string')).toBe(false);
      expect(isRepository(123)).toBe(false);
    });
  });

  describe('isSearchResultItem', () => {
    it('should return true for valid search result item', () => {
      const item: CodeSearchResultItem = {
        name: 'test.js',
        path: 'src/test.js',
        sha: 'abc123',
        url: 'https://api.github.com/repos/owner/repo/contents/src/test.js',
        git_url: 'https://api.github.com/repos/owner/repo/git/blobs/abc123',
        html_url: 'https://github.com/owner/repo/blob/main/src/test.js',
        repository: createMinimalRepository(
          123,
          'repo',
          'owner/repo',
          createUser('owner', 456)
        ),
        score: 1.0,
      };

      expect(isSearchResultItem(item)).toBe(true);
    });

    it('should return false for non-search result objects', () => {
      expect(isSearchResultItem({ name: 'test' })).toBe(false);
      expect(isSearchResultItem({ path: 'src/test.js' })).toBe(false);
      expect(isSearchResultItem(null)).toBe(false);
      expect(isSearchResultItem(undefined)).toBe(false);
      expect(isSearchResultItem('string')).toBe(false);
      expect(isSearchResultItem(123)).toBe(false);
    });
  });

  describe('isPullRequest', () => {
    it('should return true for valid pull request object', () => {
      const pr: PullRequest = {
        url: 'https://api.github.com/repos/owner/repo/pulls/1',
        id: 123,
        node_id: 'MDExOlB1bGxSZXF1ZXN0MTIz',
        html_url: 'https://github.com/owner/repo/pull/1',
        diff_url: 'https://github.com/owner/repo/pull/1.diff',
        patch_url: 'https://github.com/owner/repo/pull/1.patch',
        issue_url: 'https://api.github.com/repos/owner/repo/issues/1',
        number: 1,
        state: 'open',
        locked: false,
        title: 'Test PR',
        user: createUser('user', 456),
        body: 'Test pull request',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        closed_at: null,
        merged_at: null,
        merge_commit_sha: null,
        assignee: null,
        assignees: [],
        requested_reviewers: [],
        requested_teams: [],
        labels: [],
        milestone: null,
        draft: false,
        commits_url: 'https://api.github.com/repos/owner/repo/pulls/1/commits',
        review_comments_url:
          'https://api.github.com/repos/owner/repo/pulls/1/comments',
        review_comment_url:
          'https://api.github.com/repos/owner/repo/pulls/comments{/number}',
        comments_url:
          'https://api.github.com/repos/owner/repo/issues/1/comments',
        statuses_url: 'https://api.github.com/repos/owner/repo/statuses/abc123',
        head: {
          label: 'user:feature',
          ref: 'feature',
          sha: 'abc123',
          user: createUser('user', 456),
          repo: {
            ...createMinimalRepository(
              123,
              'repo',
              'user/repo',
              createUser('user', 456)
            ),
            license: createLicense(
              'mit',
              'MIT License',
              'https://api.github.com/licenses/mit'
            ),
          },
        },
        base: {
          label: 'owner:main',
          ref: 'main',
          sha: 'def456',
          user: createUser('owner', 789),
          repo: {
            ...createMinimalRepository(
              123,
              'repo',
              'owner/repo',
              createUser('owner', 789)
            ),
            license: createLicense(
              'mit',
              'MIT License',
              'https://api.github.com/licenses/mit'
            ),
          },
        },
        _links: {
          self: {
            href: 'https://api.github.com/repos/owner/repo/pulls/1',
          },
          html: {
            href: 'https://github.com/owner/repo/pull/1',
          },
          issue: {
            href: 'https://api.github.com/repos/owner/repo/issues/1',
          },
          comments: {
            href: 'https://api.github.com/repos/owner/repo/issues/1/comments',
          },
          review_comments: {
            href: 'https://api.github.com/repos/owner/repo/pulls/1/comments',
          },
          review_comment: {
            href: 'https://api.github.com/repos/owner/repo/pulls/comments{/number}',
          },
          commits: {
            href: 'https://api.github.com/repos/owner/repo/pulls/1/commits',
          },
          statuses: {
            href: 'https://api.github.com/repos/owner/repo/statuses/abc123',
          },
        },
        author_association: 'OWNER',
        auto_merge: null,
        active_lock_reason: null,
        merged: false,
        mergeable: null,
        mergeable_state: 'unknown',
        merged_by: null,
        comments: 0,
        review_comments: 0,
        maintainer_can_modify: true,
        commits: 1,
        additions: 10,
        deletions: 5,
        changed_files: 2,
      };

      expect(isPullRequest(pr)).toBe(true);
    });

    it('should return false for non-pull request objects', () => {
      expect(isPullRequest({ number: 1 })).toBe(false);
      expect(isPullRequest({ title: 'Test' })).toBe(false);
      expect(isPullRequest(null)).toBe(false);
      expect(isPullRequest(undefined)).toBe(false);
      expect(isPullRequest('string')).toBe(false);
      expect(isPullRequest(123)).toBe(false);
    });
  });

  describe('isWorkflowRun', () => {
    it('should return true for valid workflow run object', () => {
      const run: WorkflowRun = {
        id: 123,
        name: 'Test Workflow',
        node_id: 'MDExOldvcmtmbG93UnVuMTIz',
        head_branch: 'main',
        head_sha: 'abc123',
        run_number: 1,
        event: 'push',
        status: 'completed',
        conclusion: 'success',
        workflow_id: 456,
        check_suite_id: 789,
        check_suite_node_id: 'MDg6Q2hlY2tTdWl0ZTc4OQ==',
        url: 'https://api.github.com/repos/owner/repo/actions/runs/123',
        html_url: 'https://github.com/owner/repo/actions/runs/123',
        pull_requests: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        actor: createUser('user', 456),
        run_attempt: 1,
        referenced_workflows: [],
        triggering_actor: createUser('user', 456),
        jobs_url:
          'https://api.github.com/repos/owner/repo/actions/runs/123/jobs',
        logs_url:
          'https://api.github.com/repos/owner/repo/actions/runs/123/logs',
        check_suite_url:
          'https://api.github.com/repos/owner/repo/check-suites/789',
        artifacts_url:
          'https://api.github.com/repos/owner/repo/actions/runs/123/artifacts',
        cancel_url:
          'https://api.github.com/repos/owner/repo/actions/runs/123/cancel',
        rerun_url:
          'https://api.github.com/repos/owner/repo/actions/runs/123/rerun',
        previous_attempt_url: null,
        workflow_url:
          'https://api.github.com/repos/owner/repo/actions/workflows/456',
        head_commit: {
          id: 'abc123',
          tree_id: 'def456',
          message: 'Test commit',
          timestamp: '2023-01-01T00:00:00Z',
          author: {
            name: 'User',
            email: 'user@example.com',
          },
          committer: {
            name: 'User',
            email: 'user@example.com',
          },
        },
        repository: createMinimalRepository(
          123,
          'repo',
          'owner/repo',
          createUser('owner', 789)
        ),
        head_repository: createMinimalRepository(
          123,
          'repo',
          'owner/repo',
          createUser('owner', 789)
        ),
        path: '.github/workflows/test.yml',
        display_title: 'Test Workflow #1',
      };

      expect(isWorkflowRun(run)).toBe(true);
    });

    it('should return false for non-workflow run objects', () => {
      expect(isWorkflowRun({ id: 123 })).toBe(false);
      expect(isWorkflowRun({ name: 'Test' })).toBe(false);
      expect(isWorkflowRun(null)).toBe(false);
      expect(isWorkflowRun(undefined)).toBe(false);
      expect(isWorkflowRun('string')).toBe(false);
      expect(isWorkflowRun(123)).toBe(false);
    });
  });

  describe('isCheckRun', () => {
    it('should return true for valid check run object', () => {
      const check: CheckRun = {
        id: 123,
        head_sha: 'abc123',
        node_id: 'MDg6Q2hlY2tSdW4xMjM=',
        external_id: 'test-check',
        url: 'https://api.github.com/repos/owner/repo/check-runs/123',
        html_url: 'https://github.com/owner/repo/runs/123',
        details_url: 'https://github.com/owner/repo/runs/123',
        status: 'completed',
        conclusion: 'success',
        started_at: '2023-01-01T00:00:00Z',
        completed_at: '2023-01-01T00:01:00Z',
        output: {
          title: 'Test Check',
          summary: 'Check completed successfully',
          text: 'All tests passed',
          annotations_count: 0,
          annotations_url:
            'https://api.github.com/repos/owner/repo/check-runs/123/annotations',
        },
        name: 'Test Check',
        check_suite: {
          id: 456,
        },
        app: {
          id: 789,
          slug: 'test-app',
          node_id: 'MDM6QXBwNzg5',
          owner: createUser('owner', 123),
          name: 'Test App',
          description: 'Test application',
          external_url: 'https://example.com',
          html_url: 'https://github.com/apps/test-app',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          permissions: {
            contents: 'read',
            metadata: 'read',
          },
          events: ['push'],
          installations_count: 1,
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          pem: 'test-pem',
        },
        pull_requests: [],
      };

      expect(isCheckRun(check)).toBe(true);
    });

    it('should return false for non-check run objects', () => {
      expect(isCheckRun({ id: 123 })).toBe(false);
      expect(isCheckRun({ name: 'Test' })).toBe(false);
      expect(isCheckRun(null)).toBe(false);
      expect(isCheckRun(undefined)).toBe(false);
      expect(isCheckRun('string')).toBe(false);
      expect(isCheckRun(123)).toBe(false);
    });
  });
});

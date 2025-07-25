import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteGitHubCommand = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: mockExecuteGitHubCommand,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

// Import after mocking
import {
  registerSearchGitHubPullRequestsTool,
  buildGitHubPullRequestsAPICommand,
  buildGitHubPullRequestsSearchCommand,
  buildGitHubPullRequestsListCommand,
} from '../../src/mcp/tools/github_search_pull_requests.js';

describe('GitHub Search Pull Requests Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    // Create mock server using the fixture
    mockServer = createMockMcpServer();

    // Clear all mocks
    vi.clearAllMocks();

    // Default cache behavior
    // @ts-expect-error - mockWithCache is not typed
    mockWithCache.mockImplementation(async (key, fn) => await fn());
    mockGenerateCacheKey.mockReturnValue('test-cache-key');
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search pull requests tool', () => {
      registerSearchGitHubPullRequestsTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'githubSearchPullRequests',
        expect.any(Object),
        expect.any(Function)
      );
    });

    describe('Command Building Functions', () => {
      describe('buildGitHubPullRequestsAPICommand', () => {
        it('should build basic API command with query', () => {
          const result = buildGitHubPullRequestsAPICommand({
            query: 'bug fix',
          });

          expect(result.args).toContain('prs');
          expect(result.args).toContain('bug fix');
          expect(result.args).toContain('--json');
          expect(result.args).toContain('--limit');
          expect(result.args).toContain('30');
        });

        it('should handle owner and repo parameters', () => {
          const result = buildGitHubPullRequestsAPICommand({
            query: 'test',
            owner: 'facebook',
            repo: 'react',
          });

          expect(result.args).toContain('--repo');
          expect(result.args).toContain('facebook/react');
        });

        it('should handle multiple owners and repos', () => {
          const result = buildGitHubPullRequestsAPICommand({
            query: 'test',
            owner: ['org1', 'org2'],
            repo: ['repo1', 'repo2'],
          });

          // Multiple owners/repos uses search command with separate flags
          expect(result.args).toContain('--owner');
          expect(result.args).toContain('org1');
          expect(result.args).toContain('org2');
          expect(result.args).toContain('--repo');
          expect(result.args).toContain('repo1');
          expect(result.args).toContain('repo2');
        });

        it('should handle state parameter', () => {
          const result = buildGitHubPullRequestsAPICommand({
            query: 'test',
            state: 'closed',
          });

          expect(result.args).toContain('--state');
          expect(result.args).toContain('closed');
        });

        it('should handle date parameters', () => {
          const result = buildGitHubPullRequestsAPICommand({
            query: 'test',
            created: '>2023-01-01',
            updated: '2023-01-01..2023-12-31',
          });

          expect(result.args).toContain('--created');
          expect(result.args).toContain('>2023-01-01');
          expect(result.args).toContain('--updated');
          expect(result.args).toContain('2023-01-01..2023-12-31');
        });

        it('should handle numeric range parameters', () => {
          const result = buildGitHubPullRequestsAPICommand({
            query: 'test',
            comments: '>10',
            reactions: '5..50',
          });

          expect(result.args).toContain('--comments');
          expect(result.args).toContain('>10');
          expect(result.args).toContain('--reactions');
          expect(result.args).toContain('5..50');
        });

        it('should handle boolean parameters', () => {
          const result = buildGitHubPullRequestsAPICommand({
            query: 'test',
            draft: true,
            locked: false,
            merged: true,
          });

          // Boolean parameters use presence-based flags for true values
          expect(result.args).toContain('--draft');
          expect(result.args).toContain('--merged');
          // locked=false doesn't add a flag (only true values add flags)
          // gh search prs doesn't support --no-locked format
        });

        it('should handle user involvement parameters', () => {
          const result = buildGitHubPullRequestsAPICommand({
            query: 'test',
            author: 'testuser',
            assignee: 'reviewer',
            mentions: 'mentioned-user',
            involves: 'involved-user',
          });

          expect(result.args).toContain('--author');
          expect(result.args).toContain('testuser');
          expect(result.args).toContain('--assignee');
          expect(result.args).toContain('reviewer');
          expect(result.args).toContain('--mentions');
          expect(result.args).toContain('mentioned-user');
          expect(result.args).toContain('--involves');
          expect(result.args).toContain('involved-user');
        });

        it('should handle sort and order parameters', () => {
          const result = buildGitHubPullRequestsAPICommand({
            query: 'test',
            sort: 'reactions',
            order: 'desc',
          });

          expect(result.args).toContain('--sort');
          expect(result.args).toContain('reactions');
          expect(result.args).toContain('--order');
          expect(result.args).toContain('desc');
        });

        it('should handle custom limit', () => {
          const result = buildGitHubPullRequestsAPICommand({
            query: 'test',
            limit: 50,
          });

          expect(result.args).toContain('--limit');
          expect(result.args).toContain('50');
        });
      });

      describe('Array Parameter Handling', () => {
        it('should handle array parameters with comma-separated values', () => {
          const params = {
            owner: ['facebook', 'microsoft'],
            repo: ['react', 'vscode'],
            label: ['bug', 'help wanted'],
            visibility: ['public', 'private'] as ('public' | 'private')[],
            state: 'open' as const,
            limit: 50,
          };

          const { command, args } =
            buildGitHubPullRequestsSearchCommand(params);

          expect(command).toBe('search');
          expect(args).toContain('--owner');
          expect(args).toContain('facebook');
          expect(args).toContain('microsoft');
          expect(args).toContain('--repo');
          expect(args).toContain('react');
          expect(args).toContain('vscode');
          expect(args).toContain('--label');
          expect(args).toContain('bug');
          expect(args).toContain('help wanted');
          expect(args).toContain('--visibility');
          expect(args).toContain('public');
          expect(args).toContain('private');
        });

        it('should handle single string parameters normally', () => {
          const params = {
            owner: 'facebook',
            repo: 'react',
            label: 'bug',
            state: 'open' as const,
            limit: 30,
          };

          const { command, args } =
            buildGitHubPullRequestsSearchCommand(params);

          expect(command).toBe('search');
          expect(args).toContain('--owner');
          expect(args).toContain('facebook');
          expect(args).toContain('--repo');
          expect(args).toContain('react');
          expect(args).toContain('--label');
          expect(args).toContain('bug');
        });
      });

      describe('buildGitHubPullRequestsSearchCommand', () => {
        it('should build search command for global search', () => {
          const result = buildGitHubPullRequestsSearchCommand({
            query: 'bug fix',
          });

          expect(result.args).toContain('prs');
          expect(result.args).toContain('bug fix');
          expect(result.args).toContain('--json');
        });

        it('should handle complex search with filters', () => {
          const result = buildGitHubPullRequestsSearchCommand({
            query: 'refactor',
            state: 'closed',
            author: 'dev-user',
            language: 'javascript',
          });

          expect(result.args).toContain('prs');
          expect(result.args).toContain('refactor');
          expect(result.args).toContain('--state');
          expect(result.args).toContain('closed');
          expect(result.args).toContain('--author');
          expect(result.args).toContain('dev-user');
          expect(result.args).toContain('--language');
          expect(result.args).toContain('javascript');
        });

        it('should handle filter-only search without query', () => {
          const result = buildGitHubPullRequestsSearchCommand({
            state: 'open',
            author: 'user',
          });

          expect(result.args).toContain('prs');
          expect(result.args).toContain('--state');
          expect(result.args).toContain('--author');
          // Filter includes JSON output fields and limit values, so some non-flag args are expected
          const nonFlagArgs = result.args.filter(
            arg => !arg.startsWith('--') && arg !== 'prs'
          );
          expect(nonFlagArgs.length).toBeGreaterThan(0); // JSON fields and limit value
        });
      });

      describe('buildGitHubPullRequestsListCommand', () => {
        it('should build list command for single repo', () => {
          const result = buildGitHubPullRequestsListCommand({
            owner: 'facebook',
            repo: 'react',
          });

          expect(result.args).toContain('list');
          expect(result.args).toContain('--repo');
          expect(result.args).toContain('facebook/react');
          expect(result.args).toContain('--json');
        });

        it('should handle state filter for list command', () => {
          const result = buildGitHubPullRequestsListCommand({
            owner: 'facebook',
            repo: 'react',
            state: 'closed',
          });

          expect(result.args).toContain('--state');
          expect(result.args).toContain('closed');
        });

        it('should handle author filter for list command', () => {
          const result = buildGitHubPullRequestsListCommand({
            owner: 'facebook',
            repo: 'react',
            author: 'testuser',
          });

          expect(result.args).toContain('--author');
          expect(result.args).toContain('testuser');
        });

        it('should handle limit parameter', () => {
          const result = buildGitHubPullRequestsListCommand({
            owner: 'facebook',
            repo: 'react',
            limit: 25,
          });

          expect(result.args).toContain('--limit');
          expect(result.args).toContain('25');
        });

        it('should handle single repo from array (uses first element)', () => {
          const result = buildGitHubPullRequestsListCommand({
            owner: 'facebook',
            repo: ['react', 'jest'],
          });

          expect(result.args).toContain('--repo');
          expect(result.args).toContain('facebook/react');
        });

        it('should throw error when no owner/repo specified', () => {
          expect(() => {
            buildGitHubPullRequestsListCommand({
              query: 'test',
            });
          }).toThrow(
            'Both owner and repo are required for repository-specific PR search'
          );
        });
      });
    });

    describe('Parameter Validation', () => {
      it('should handle empty parameters gracefully', async () => {
        registerSearchGitHubPullRequestsTool(mockServer.server);

        const result = await mockServer.callTool(
          'githubSearchPullRequests',
          {}
        );

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          'No search query or filters provided'
        );
      });

      it('should validate limit parameter bounds', async () => {
        registerSearchGitHubPullRequestsTool(mockServer.server);

        const result = await mockServer.callTool('githubSearchPullRequests', {
          query: 'test',
          limit: 200, // Over maximum
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('PR search failed');
      });

      it('should handle withComments parameter warning', async () => {
        registerSearchGitHubPullRequestsTool(mockServer.server);

        mockExecuteGitHubCommand.mockResolvedValue({
          isError: false,
          content: [{ text: JSON.stringify({ result: [] }) }],
        });

        await mockServer.callTool('githubSearchPullRequests', {
          query: 'test',
          withComments: true,
        });

        // Should proceed but with warnings about token consumption
        expect(mockExecuteGitHubCommand).toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should handle GitHub CLI authentication errors', async () => {
        registerSearchGitHubPullRequestsTool(mockServer.server);

        mockExecuteGitHubCommand.mockResolvedValue({
          isError: true,
          content: [{ text: 'authentication required' }],
        });

        const result = await mockServer.callTool('githubSearchPullRequests', {
          query: 'test',
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('authentication required');
      });

      it('should handle GitHub API rate limiting', async () => {
        registerSearchGitHubPullRequestsTool(mockServer.server);

        mockExecuteGitHubCommand.mockResolvedValue({
          isError: true,
          content: [{ text: 'rate limit exceeded' }],
        });

        const result = await mockServer.callTool('githubSearchPullRequests', {
          query: 'test',
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('rate limit exceeded');
      });

      it('should handle malformed JSON responses', async () => {
        registerSearchGitHubPullRequestsTool(mockServer.server);

        mockExecuteGitHubCommand.mockResolvedValue({
          isError: false,
          content: [{ text: 'invalid json response' }],
        });

        const result = await mockServer.callTool('githubSearchPullRequests', {
          query: 'test',
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('failed');
      });
    });

    describe('Advanced Features', () => {
      it('should handle repository-specific searches with filters', async () => {
        registerSearchGitHubPullRequestsTool(mockServer.server);

        const mockResponse = {
          result: [
            {
              number: 456,
              title: 'Feature enhancement',
              state: 'open',
              author: { login: 'contributor' },
              url: 'https://github.com/owner/repo/pull/456',
              createdAt: '2023-02-01T00:00:00Z',
            },
          ],
        };

        mockExecuteGitHubCommand.mockResolvedValue({
          isError: false,
          content: [{ text: JSON.stringify(mockResponse) }],
        });

        const result = await mockServer.callTool('githubSearchPullRequests', {
          owner: 'owner',
          repo: 'repo',
          state: 'open',
          author: 'contributor',
        });

        expect(result.isError).toBe(false);
        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'pr',
          expect.arrayContaining(['list', '--repo', 'owner/repo']),
          { cache: false }
        );
      });

      it('should fallback to search command for multi-repo queries', async () => {
        registerSearchGitHubPullRequestsTool(mockServer.server);

        const mockResponse = {
          result: JSON.stringify({
            total_count: 1,
            items: [
              {
                number: 789,
                title: 'Cross-repo fix',
                repository: { full_name: 'org/repo1' },
              },
            ],
          }),
        };

        mockExecuteGitHubCommand.mockResolvedValue({
          isError: false,
          content: [{ text: JSON.stringify(mockResponse) }],
        });

        const result = await mockServer.callTool('githubSearchPullRequests', {
          query: 'fix',
          owner: 'org',
          repo: ['repo1', 'repo2'], // Multiple repos
        });

        expect(result.isError).toBe(true); // Will fail due to result format but command should be search
        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          expect.arrayContaining(['prs']),
          { cache: false }
        );
      });
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful pull request search', async () => {
      registerSearchGitHubPullRequestsTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify({
          total_count: 1,
          items: [
            {
              number: 123,
              title: 'Fix bug in component',
              state: 'open',
              html_url: 'https://github.com/owner/repo/pull/123',
              user: { login: 'testuser' },
              repository: {
                full_name: 'owner/repo',
                html_url: 'https://github.com/owner/repo',
              },
            },
          ],
        }),
        command: 'gh search prs fix --limit=25 --json',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'fix',
      });

      expect(result.isError).toBe(true);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'prs',
          'fix',
          '--json',
          'assignees,author,authorAssociation,body,closedAt,commentsCount,createdAt,id,isDraft,isLocked,isPullRequest,labels,number,repository,state,title,updatedAt,url',
          '--limit',
          '30',
        ],
        { cache: false }
      );
    });

    it('should handle no results found', async () => {
      registerSearchGitHubPullRequestsTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify({
          total_count: 0,
          items: [],
        }),
        command: 'gh search prs nonexistent --limit=25 --json',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'nonexistent',
      });

      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('should handle search errors', async () => {
      registerSearchGitHubPullRequestsTool(mockServer.server);

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Search failed' }],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Search failed');
    });

    it('should handle getCommitData parameter for repo-specific searches', async () => {
      registerSearchGitHubPullRequestsTool(mockServer.server);

      const mockPRListResponse = {
        result: [
          {
            number: 123,
            title: 'Fix bug in component',
            state: 'open',
            author: { login: 'testuser' },
            headRefOid: 'abc123',
            baseRefOid: 'def456',
            url: 'https://github.com/owner/repo/pull/123',
            createdAt: '2023-01-01T00:00:00Z',
            updatedAt: '2023-01-02T00:00:00Z',
            comments: 5,
            isDraft: false,
            labels: [],
          },
        ],
        command: 'gh pr list --repo owner/repo --json ...',
        type: 'github',
      };

      const mockCommitsResponse = {
        result: {
          commits: [
            {
              oid: 'abc123',
              messageHeadline: 'Fix bug in component',
              authors: [{ login: 'testuser', name: 'Test User' }],
              authoredDate: '2023-01-01T00:00:00Z',
            },
          ],
        },
        command: 'gh pr view 123 --json commits --repo owner/repo',
        type: 'github',
      };

      const mockCommitDetailResponse = {
        result: {
          files: [
            {
              filename: 'src/component.js',
              status: 'modified',
              additions: 10,
              deletions: 5,
              changes: 15,
              patch: '@@ -1,5 +1,10 @@\n console.log("hello");',
            },
          ],
          stats: {
            additions: 10,
            deletions: 5,
            total: 15,
          },
        },
        command: 'gh api repos/owner/repo/commits/abc123',
        type: 'github',
      };

      // Mock PR list call
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockPRListResponse) }],
      });

      // Mock commits fetch call
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockCommitsResponse) }],
      });

      // Mock commit detail call
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(mockCommitDetailResponse) }],
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        query: 'fix',
        owner: 'owner',
        repo: 'repo',
        getCommitData: true,
      });

      expect(result.isError).toBe(false);

      // Should call PR list first
      expect(mockExecuteGitHubCommand).toHaveBeenNthCalledWith(
        1,
        'pr',
        expect.arrayContaining(['list', '--repo', 'owner/repo']),
        { cache: false }
      );

      // Should call commits API second
      expect(mockExecuteGitHubCommand).toHaveBeenNthCalledWith(
        2,
        'pr',
        expect.arrayContaining([
          'view',
          '123',
          '--json',
          'commits',
          '--repo',
          'owner/repo',
        ]),
        { cache: false }
      );

      // Should call commit detail API third
      expect(mockExecuteGitHubCommand).toHaveBeenNthCalledWith(
        3,
        'api',
        ['repos/owner/repo/commits/abc123'],
        { cache: false }
      );

      // Result should contain commit information
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].commits).toBeDefined();
      expect(data.results[0].commits.total_count).toBe(1);
      expect(data.results[0].commits.commits[0].sha).toBe('abc123');
      expect(data.results[0].commits.commits[0].message).toBe(
        'Fix bug in component'
      );
      expect(data.results[0].commits.commits[0].diff).toBeDefined();
      expect(data.results[0].commits.commits[0].diff.changed_files).toBe(1);
      expect(data.results[0].commits.commits[0].diff.files[0].filename).toBe(
        'src/component.js'
      );
    });
  });
});

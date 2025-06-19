import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerSearchGitHubCommitsTool } from '../../src/mcp/tools/github_search_commits.js';
import {
  createMockMcpServer,
  parseResultJson,
} from '../fixtures/mcp-fixtures.js';
import { TOOL_NAMES } from '../../src/mcp/systemPrompts.js';
import type { MockMcpServer } from '../fixtures/mcp-fixtures.js';

interface GitHubCommitsSearchResponse {
  query?: string;
  total: number;
  commits: Array<{
    sha: string;
    message: string;
    author: {
      name?: string;
      email?: string;
      date?: string;
      login?: string;
    };
    committer: {
      name?: string;
      email?: string;
      date?: string;
      login?: string;
    };
    repository?: {
      name: string;
      fullName: string;
      url: string;
      description?: string;
    } | null;
    url: string;
    parents: string[];
  }>;
  summary?: {
    recentCommits: number;
    topAuthors: Array<{ name: string; commits: number }>;
    repositories: string[];
  };
  suggestions?: string[];
}

// Mock the exec utilities
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: vi.fn(),
}));

// Mock the cache utilities
vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(
    (prefix: string, params: any) => `${prefix}-${JSON.stringify(params)}`
  ),
  withCache: vi.fn((key: string, fn: () => Promise<any>) => fn()),
}));

describe('GitHub Search Commits Tool', () => {
  let mockServer: MockMcpServer;
  let mockExecuteGitHubCommand: any;

  beforeEach(async () => {
    mockServer = createMockMcpServer();

    // Get references to the mocked functions before registration
    const execModule = await import('../../src/utils/exec.js');
    mockExecuteGitHubCommand = vi.mocked(execModule.executeGitHubCommand);

    // Clear mocks
    mockExecuteGitHubCommand.mockClear();

    // Register tool after getting references to mocked functions
    registerSearchGitHubCommitsTool(mockServer.server);
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search commits tool', () => {
      expect(mockServer.server.tool).toHaveBeenCalledWith(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        expect.any(String),
        expect.objectContaining({
          query: expect.any(Object),
          owner: expect.any(Object),
          repo: expect.any(Object),
          author: expect.any(Object),
          sort: expect.any(Object),
          limit: expect.any(Object),
        }),
        expect.objectContaining({
          title: 'github_search_commits',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        }),
        expect.any(Function)
      );
    });
  });

  describe('Successful Commit Searches', () => {
    it('should search commits with basic query', async () => {
      const mockCommits = [
        {
          sha: 'abc123',
          commit: {
            message: 'Fix bug in authentication',
            author: {
              name: 'John Doe',
              email: 'john@example.com',
              date: '2023-01-15T10:00:00Z',
            },
            committer: {
              name: 'John Doe',
              email: 'john@example.com',
              date: '2023-01-15T10:00:00Z',
            },
          },
          author: { login: 'johndoe' },
          committer: { login: 'johndoe' },
          repository: {
            name: 'test-repo',
            fullName: 'owner/test-repo',
            url: 'https://github.com/owner/test-repo',
            description: 'Test repository',
          },
          url: 'https://github.com/owner/test-repo/commit/abc123',
          parents: [{ sha: 'def456' }],
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockCommits),
            }),
          },
        ],
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          query: 'bug fix',
        }
      );

      const data = parseResultJson<GitHubCommitsSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(1);
      expect(data.commits).toHaveLength(1);
      expect(data.commits[0].sha).toBe('abc123');
      expect(data.commits[0].message).toBe('Fix bug in authentication');
      expect(data.commits[0].author.name).toBe('John Doe');
      expect(data.commits[0].repository?.fullName).toBe('owner/test-repo');

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'commits',
          '"bug fix"',
          '--json',
          'author,commit,committer,id,parents,repository,sha,url',
        ],
        { cache: false }
      );
    });

    it('should search commits with filters', async () => {
      const mockCommits = [
        {
          sha: 'xyz789',
          commit: {
            message: 'Update documentation',
            author: {
              name: 'Jane Smith',
              email: 'jane@example.com',
              date: '2023-02-01T14:30:00Z',
            },
            committer: {
              name: 'Jane Smith',
              email: 'jane@example.com',
              date: '2023-02-01T14:30:00Z',
            },
          },
          author: { login: 'janesmith' },
          committer: { login: 'janesmith' },
          repository: {
            name: 'docs-repo',
            fullName: 'org/docs-repo',
            url: 'https://github.com/org/docs-repo',
          },
          url: 'https://github.com/org/docs-repo/commit/xyz789',
          parents: [],
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockCommits),
            }),
          },
        ],
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          query: 'documentation',
          owner: 'org',
          repo: 'docs-repo',
          author: 'janesmith',
          sort: 'author-date',
          order: 'desc',
          limit: 10,
        }
      );

      const data = parseResultJson<GitHubCommitsSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(1);
      expect(data.commits[0].author.login).toBe('janesmith');

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'commits',
          'documentation',
          '--json',
          'author,commit,committer,id,parents,repository,sha,url',
          '--author=janesmith',
          '--repo=org/docs-repo',
          '--sort=author-date',
          '--order=desc',
          '--limit=10',
        ],
        { cache: false }
      );
    });

    it('should handle complex queries with special syntax', async () => {
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
            }),
          },
        ],
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          query: 'author:john OR committer:jane -- -author:bot',
        }
      );

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'commits',
          'author:john',
          'OR',
          'committer:jane',
          '--',
          '-author:bot',
          '--json',
          'author,commit,committer,id,parents,repository,sha,url',
        ],
        { cache: false }
      );
    });

    it('should search without query using filters only', async () => {
      const mockCommits = [
        {
          sha: 'filter123',
          commit: {
            message: 'Merge pull request',
            author: {
              name: 'GitHub',
              email: 'noreply@github.com',
              date: '2023-01-10T09:00:00Z',
            },
            committer: {
              name: 'GitHub',
              email: 'noreply@github.com',
              date: '2023-01-10T09:00:00Z',
            },
          },
          author: { login: 'github' },
          committer: { login: 'github' },
          repository: null,
          url: 'https://github.com/owner/repo/commit/filter123',
          parents: [{ sha: 'parent1' }, { sha: 'parent2' }],
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockCommits),
            }),
          },
        ],
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          author: 'github',
          merge: true,
        }
      );

      const data = parseResultJson<GitHubCommitsSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.commits[0].parents).toEqual(['parent1', 'parent2']);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'commits',
          '--json',
          'author,commit,committer,id,parents,repository,sha,url',
          '--author=github',
          '--merge',
        ],
        { cache: false }
      );
    });

    it('should provide analysis and summary for multiple commits', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const oldDate = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000); // 40 days ago

      const mockCommits = [
        {
          sha: 'recent1',
          commit: {
            message: 'Recent commit 1',
            author: {
              name: 'Alice',
              email: 'alice@example.com',
              date: recentDate.toISOString(),
            },
            committer: {
              name: 'Alice',
              email: 'alice@example.com',
              date: recentDate.toISOString(),
            },
          },
          author: { login: 'alice' },
          committer: { login: 'alice' },
          repository: {
            name: 'repo1',
            fullName: 'org/repo1',
            url: 'https://github.com/org/repo1',
          },
          url: 'https://github.com/org/repo1/commit/recent1',
          parents: [],
        },
        {
          sha: 'recent2',
          commit: {
            message: 'Recent commit 2',
            author: {
              name: 'Alice',
              email: 'alice@example.com',
              date: recentDate.toISOString(),
            },
            committer: {
              name: 'Bob',
              email: 'bob@example.com',
              date: recentDate.toISOString(),
            },
          },
          author: { login: 'alice' },
          committer: { login: 'bob' },
          repository: {
            name: 'repo2',
            fullName: 'org/repo2',
            url: 'https://github.com/org/repo2',
          },
          url: 'https://github.com/org/repo2/commit/recent2',
          parents: [],
        },
        {
          sha: 'old1',
          commit: {
            message: 'Old commit',
            author: {
              name: 'Bob',
              email: 'bob@example.com',
              date: oldDate.toISOString(),
            },
            committer: {
              name: 'Bob',
              email: 'bob@example.com',
              date: oldDate.toISOString(),
            },
          },
          author: { login: 'bob' },
          committer: { login: 'bob' },
          repository: {
            name: 'repo1',
            fullName: 'org/repo1',
            url: 'https://github.com/org/repo1',
          },
          url: 'https://github.com/org/repo1/commit/old1',
          parents: [],
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockCommits),
            }),
          },
        ],
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          query: 'commit',
        }
      );

      const data = parseResultJson<GitHubCommitsSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(3);
      expect(data.summary?.recentCommits).toBe(2); // 2 commits in last 30 days
      expect(data.summary?.topAuthors).toEqual([
        { name: 'Alice', commits: 2 },
        { name: 'Bob', commits: 1 },
      ]);
      expect(data.summary?.repositories).toEqual(['org/repo1', 'org/repo2']);
    });
  });

  describe('Empty Results', () => {
    it('should handle no commits found', async () => {
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
            }),
          },
        ],
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          query: 'nonexistent-search-term',
        }
      );

      const data = parseResultJson<GitHubCommitsSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);
      expect(data.commits).toEqual([]);
      expect(data.suggestions).toContain('Try broader search terms');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors', async () => {
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: true,
        content: [{ text: 'API rate limit exceeded' }],
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          query: 'test',
        }
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('API rate limit exceeded');
    });

    it('should handle malformed JSON response', async () => {
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: 'not valid json' }],
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          query: 'test',
        }
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Failed to search GitHub commits'
      );
    });

    it('should handle network errors', async () => {
      mockExecuteGitHubCommand.mockRejectedValueOnce(
        new Error('Network timeout')
      );

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          query: 'test',
        }
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Failed to search GitHub commits'
      );
    });
  });

  describe('Input Validation', () => {
    it('should require either query or filters', async () => {
      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {}
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Either query or at least one filter is required'
      );
    });

    it('should accept owner as a valid filter', async () => {
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
            }),
          },
        ],
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          owner: 'facebook',
        }
      );

      expect(result.isError).toBe(false);
    });

    it('should accept author as a valid filter', async () => {
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
            }),
          },
        ],
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          author: 'johndoe',
        }
      );

      expect(result.isError).toBe(false);
    });

    it('should handle date filters correctly', async () => {
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
            }),
          },
        ],
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          query: 'fix',
          authorDate: '>2023-01-01',
          committerDate: '<2023-12-31',
        }
      );

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'commits',
          'fix',
          '--json',
          'author,commit,committer,id,parents,repository,sha,url',
          '--author-date=">2023-01-01"',
          '--committer-date="<2023-12-31"',
        ],
        { cache: false }
      );
    });

    it('should respect limit parameter', async () => {
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
            }),
          },
        ],
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          query: 'test',
          limit: 5,
        }
      );

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--limit=5']),
        { cache: false }
      );
    });
  });

  describe('Query Formatting', () => {
    it('should handle simple queries without quotes', async () => {
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
            }),
          },
        ],
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          query: 'simplequery',
        }
      );

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['simplequery']),
        { cache: false }
      );
    });

    it('should quote queries that need quoting', async () => {
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
            }),
          },
        ],
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          query: 'query with spaces',
        }
      );

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['"query with spaces"']),
        { cache: false }
      );
    });

    it('should handle queries with shell special characters', async () => {
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
            }),
          },
        ],
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        {
          query: 'query>with<special&chars',
        }
      );

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['"query>with<special&chars"']),
        { cache: false }
      );
    });
  });
});

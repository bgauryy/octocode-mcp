import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerSearchGitHubReposTool } from '../../src/mcp/tools/github_search_repos.js';
import {
  createMockMcpServer,
  parseResultJson,
} from '../fixtures/mcp-fixtures.js';
import type { MockMcpServer } from '../fixtures/mcp-fixtures.js';

interface GitHubReposSearchResponse {
  query?: string;
  total: number;
  repositories: Array<{
    name: string;
    stars: number;
    description: string;
    language: string;
    url: string;
    forks: number;
    isPrivate: boolean;
    isArchived: boolean;
    isFork: boolean;
    topics: string[];
    license: string | null;
    hasIssues: boolean;
    openIssuesCount: number;
    createdAt: string;
    updatedAt: string;
    visibility: string;
    owner: string;
  }>;
  summary?: {
    languages: string[];
    avgStars: number;
    recentlyUpdated: number;
  };
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

describe('GitHub Search Repositories Tool', () => {
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
    registerSearchGitHubReposTool(mockServer.server);
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search repositories tool', () => {
      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'github_search_repositories',
        expect.objectContaining({
          description: expect.stringContaining('Search repositories by name/description'),
          inputSchema: expect.any(Object),
          annotations: expect.any(Object),
        }),
        expect.any(Function)
      );
    });
  });

  describe('Basic Query Searches', () => {
    it('should search repositories with simple query', async () => {
      const mockRepos = [
        {
          name: 'cli-tool',
          fullName: 'user/cli-tool',
          description: 'A command line interface tool',
          language: 'JavaScript',
          stargazersCount: 150,
          forksCount: 25,
          url: 'https://github.com/user/cli-tool',
          owner: { login: 'user' },
          isPrivate: false,
          isArchived: false,
          isFork: false,
          license: { name: 'MIT' },
          hasIssues: true,
          openIssuesCount: 5,
          createdAt: '2023-01-15T10:00:00Z',
          updatedAt: '2023-12-01T15:30:00Z',
          visibility: 'public',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        query: 'cli shell',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(1);
      expect(data.repositories).toHaveLength(1);
      expect(data.repositories[0].name).toBe('user/cli-tool');
      expect(data.repositories[0].stars).toBe(150);
      expect(data.repositories[0].language).toBe('JavaScript');
      expect(data.summary?.languages).toContain('JavaScript');
      expect(data.summary?.avgStars).toBe(150);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining([
          'repos',
          'cli shell',
          '--json',
          'name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
        ]),
        { cache: false }
      );
    });

    it('should handle quoted phrases in queries', async () => {
      const mockRepos = [
        {
          name: 'vim-plugin',
          fullName: 'author/vim-plugin',
          description: 'Vim plugin for better editing',
          language: 'Vim script',
          stargazersCount: 75,
          forksCount: 12,
          url: 'https://github.com/author/vim-plugin',
          owner: { login: 'author' },
          isPrivate: false,
          isArchived: false,
          isFork: false,
          license: { name: 'Apache-2.0' },
          hasIssues: true,
          openIssuesCount: 3,
          createdAt: '2023-03-10T08:00:00Z',
          updatedAt: '2023-11-20T12:45:00Z',
          visibility: 'public',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        query: '"vim plugin"',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(1);
      expect(data.repositories[0].name).toBe('author/vim-plugin');
    });
  });

  describe('Primary Filters', () => {
    it('should filter by owner', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        owner: 'microsoft',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--owner=microsoft']),
        { cache: false }
      );
    });

    it('should filter by language', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        language: 'typescript',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--language=typescript']),
        { cache: false }
      );
    });

    it('should filter by stars count', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        stars: '>100',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--stars=>100']),
        { cache: false }
      );
    });

    it('should filter by topics', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        topic: ['cli', 'typescript'],
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--topic=cli,typescript']),
        { cache: false }
      );
    });

    it('should filter by forks count', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        forks: 50,
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--forks=50']),
        { cache: false }
      );
    });
  });

  describe('Secondary Filters', () => {
    it('should apply license filter with primary filter', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        query: 'test',
        license: ['mit', 'apache-2.0'],
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--license=mit,apache-2.0']),
        { cache: false }
      );
    });

    it('should apply visibility filter', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        owner: 'microsoft',
        visibility: 'public',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--visibility=public']),
        { cache: false }
      );
    });

    it('should apply date filters', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        language: 'javascript',
        created: '>2020-01-01',
        updated: '<2023-12-31',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining([
          '--created=>2020-01-01',
          '--updated=<2023-12-31',
        ]),
        { cache: false }
      );
    });

    it('should apply archived filter', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        owner: 'facebook',
        archived: false,
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--archived=false']),
        { cache: false }
      );
    });

    it('should apply include forks filter', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        language: 'go',
        includeForks: 'only',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--include-forks=only']),
        { cache: false }
      );
    });

    it('should apply good first issues filter', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        language: 'python',
        goodFirstIssues: '>=10',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--good-first-issues=>=10']),
        { cache: false }
      );
    });

    it('should apply help wanted issues filter', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        topic: ['open-source'],
        helpWantedIssues: '>5',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--help-wanted-issues=>5']),
        { cache: false }
      );
    });

    it('should apply size and followers filters', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        owner: 'google',
        size: '>1000',
        followers: 100,
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--size=>1000', '--followers=100']),
        { cache: false }
      );
    });
  });

  describe('Sorting and Limits', () => {
    it('should apply custom sort and order', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        query: 'test',
        sort: 'stars',
        order: 'asc',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--sort=stars', '--order=asc']),
        { cache: false }
      );
    });

    it('should apply custom limit', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        language: 'rust',
        limit: 10,
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--limit=10']),
        { cache: false }
      );
    });

    it('should use default values when not specified', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        query: 'test',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['test']),
        { cache: false }
      );
    });
  });

  describe('Complex Queries', () => {
    it('should handle GitHub syntax queries', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        query: 'language:Go OR language:Rust',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['language:Go OR language:Rust']),
        { cache: false }
      );
    });

    it('should handle queries with special characters', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        query: 'query>with<special&chars',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);
    });
  });

  describe('Data Analysis', () => {
    it('should provide comprehensive analysis for multiple repositories', async () => {
      const mockRepos = [
        {
          name: 'repo1',
          fullName: 'user/repo1',
          description: 'First repository',
          language: 'JavaScript',
          stargazersCount: 100,
          forksCount: 20,
          url: 'https://github.com/user/repo1',
          owner: { login: 'user' },
          isPrivate: false,
          isArchived: false,
          isFork: false,
          license: { name: 'MIT' },
          hasIssues: true,
          openIssuesCount: 5,
          createdAt: '2023-01-15T10:00:00Z',
          updatedAt: '2023-12-01T15:30:00Z',
          visibility: 'public',
        },
        {
          name: 'repo2',
          fullName: 'user/repo2',
          description: 'Second repository',
          language: 'TypeScript',
          stargazersCount: 200,
          forksCount: 40,
          url: 'https://github.com/user/repo2',
          owner: { login: 'user' },
          isPrivate: false,
          isArchived: false,
          isFork: false,
          license: { name: 'Apache-2.0' },
          hasIssues: true,
          openIssuesCount: 10,
          createdAt: '2023-02-10T08:00:00Z',
          updatedAt: '2023-11-25T12:45:00Z',
          visibility: 'public',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        query: 'test',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(2);
      expect(data.repositories).toHaveLength(2);
      expect(data.summary?.languages).toEqual(['JavaScript', 'TypeScript']);
      expect(data.summary?.avgStars).toBe(150); // (100 + 200) / 2
      expect(data.summary?.recentlyUpdated).toBeGreaterThanOrEqual(0);
    });

    it('should handle repositories without optional fields', async () => {
      const mockRepos = [
        {
          name: 'minimal-repo',
          fullName: 'user/minimal-repo',
          description: null,
          language: null,
          stargazersCount: 0,
          forksCount: 0,
          url: 'https://github.com/user/minimal-repo',
          owner: { login: 'user' },
          isPrivate: false,
          isArchived: false,
          isFork: false,
          license: null,
          hasIssues: false,
          openIssuesCount: 0,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-01T00:00:00Z',
          visibility: 'public',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        query: 'minimal',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(1);
      expect(data.repositories[0].description).toBe('No description');
      expect(data.repositories[0].language).toBe('Unknown');
      expect(data.repositories[0].license).toBe(null);
    });
  });

  describe('Error Handling', () => {
    it('should require query or primary filter', async () => {
      const result = await mockServer.callTool('github_search_repositories', {
        // No query or primary filters
        license: ['mit'],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Requires query or primary filter'
      );
    });

    it('should handle GitHub CLI execution errors', async () => {
      mockExecuteGitHubCommand.mockRejectedValueOnce(
        new Error('GitHub CLI not authenticated')
      );

      const result = await mockServer.callTool('github_search_repositories', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Repository search failed - verify connection or simplify query'
      );
    });

    it('should handle invalid JSON responses', async () => {
      // Mock GitHub CLI to return invalid JSON
      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify({ result: 'invalid json' }) }],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        query: 'react',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Repository search failed - verify connection or simplify query'
      );
    });
  });

  describe('Stars Filter Validation', () => {
    it('should handle valid stars patterns', async () => {
      const validStarsValues = ['100', '>500', '<50', '10..100', '>=1000'];
      for (const stars of validStarsValues) {
        const mockRepos = [];

        mockExecuteGitHubCommand.mockResolvedValueOnce({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: JSON.stringify(mockRepos),
              }),
            },
          ],
        });

        const result = await mockServer.callTool('github_search_repositories', {
          stars,
        });

        const data = parseResultJson<GitHubReposSearchResponse>(result);

        expect(result.isError).toBe(false);
        expect(data.total).toBe(0);

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          expect.arrayContaining([`--stars=${stars}`]),
          { cache: false }
        );

        mockExecuteGitHubCommand.mockClear();
      }
    });

    it('should skip invalid stars patterns', async () => {
      const invalidStarsValues = ['*', '', 'invalid', 'abc123'];

      for (const stars of invalidStarsValues) {
        const mockRepos = [];

        mockExecuteGitHubCommand.mockResolvedValueOnce({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: JSON.stringify(mockRepos),
              }),
            },
          ],
        });

        const result = await mockServer.callTool('github_search_repositories', {
          stars,
          query: 'test', // Add query to make it valid
        });

        const data = parseResultJson<GitHubReposSearchResponse>(result);

        expect(result.isError).toBe(false);
        expect(data.total).toBe(0);

        // Should not include stars filter for invalid values
        const callArgs = mockExecuteGitHubCommand.mock.calls[0][1];
        expect(callArgs.some((arg: string) => arg.includes('--stars='))).toBe(
          false
        );

        mockExecuteGitHubCommand.mockClear();
      }
    });
  });

  describe('Match Filter', () => {
    it('should apply match filter for search scope', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        query: 'test',
        match: 'description',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--match=description']),
        { cache: false }
      );
    });
  });

  describe('Empty Results', () => {
    it('should handle no repositories found', async () => {
      const mockRepos = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        query: 'nonexistent-search-term',
      });

      const data = parseResultJson<GitHubReposSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.total).toBe(0);
      expect(data.repositories).toEqual([]);
      expect(data.summary).toBeUndefined();
    });
  });
});

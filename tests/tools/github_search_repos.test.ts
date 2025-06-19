import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerSearchGitHubReposTool } from '../../src/mcp/tools/github_search_repos.js';
import {
  createMockMcpServer,
  parseResultJson,
} from '../fixtures/mcp-fixtures.js';
import { TOOL_NAMES } from '../../src/mcp/systemPrompts.js';
import type { MockMcpServer } from '../fixtures/mcp-fixtures.js';

interface GitHubRepoSearchResponse {
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
  suggestions?: string[];
}

// Mock the exec utilities and cache
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: vi.fn(),
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(() => 'test-cache-key'),
  withCache: vi.fn((cacheKey, operation) => operation()),
}));

describe('GitHub Repository Search Tool', () => {
  let mockServer: MockMcpServer;
  let mockExecuteGitHubCommand: any;

  const mockRepoResponse = [
    {
      name: 'test-repo',
      fullName: 'owner/test-repo',
      description: 'A test repository',
      language: 'TypeScript',
      stargazersCount: 1500,
      forksCount: 200,
      updatedAt: '2024-01-15T12:00:00Z',
      createdAt: '2023-06-01T12:00:00Z',
      url: 'https://github.com/owner/test-repo',
      owner: { login: 'owner' },
      isPrivate: false,
      license: { name: 'MIT License' },
      hasIssues: true,
      openIssuesCount: 25,
      isArchived: false,
      isFork: false,
      visibility: 'public',
    },
    {
      name: 'another-repo',
      fullName: 'microsoft/another-repo',
      description: 'Another test repository',
      language: 'JavaScript',
      stargazersCount: 800,
      forksCount: 50,
      updatedAt: '2024-02-10T12:00:00Z',
      createdAt: '2023-05-01T12:00:00Z',
      url: 'https://github.com/microsoft/another-repo',
      owner: { login: 'microsoft' },
      isPrivate: false,
      license: { name: 'Apache License 2.0' },
      hasIssues: true,
      openIssuesCount: 12,
      isArchived: false,
      isFork: false,
      visibility: 'public',
    },
  ];

  beforeEach(async () => {
    mockServer = createMockMcpServer();

    // Get references to the mocked functions before registration
    const execModule = await import('../../src/utils/exec.js');
    mockExecuteGitHubCommand = vi.mocked(execModule.executeGitHubCommand);

    // Clear the exec mocks
    mockExecuteGitHubCommand.mockClear();

    // Register tool after getting references to mocked functions
    registerSearchGitHubReposTool(mockServer.server);
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub repository search tool', () => {
      expect(mockServer.server.tool).toHaveBeenCalledWith(
        TOOL_NAMES.GITHUB_SEARCH_REPOS,
        expect.any(String),
        expect.objectContaining({
          query: expect.any(Object),
          owner: expect.any(Object),
          language: expect.any(Object),
          stars: expect.any(Object),
          topic: expect.any(Object),
          forks: expect.any(Object),
          license: expect.any(Object),
          match: expect.any(Object),
          visibility: expect.any(Object),
          created: expect.any(Object),
          updated: expect.any(Object),
          archived: expect.any(Object),
          includeForks: expect.any(Object),
          sort: expect.any(Object),
          order: expect.any(Object),
          limit: expect.any(Object),
        }),
        expect.objectContaining({
          title: 'GitHub Repository Search',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        }),
        expect.any(Function)
      );
    });
  });

  describe('PRIMARY Filters (Work Alone)', () => {
    beforeEach(() => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepoResponse),
            }),
          },
        ],
      });
    });

    it('should work with owner filter alone', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        owner: 'microsoft',
        limit: 2,
      });

      expect(result.isError).toBe(false);
      const data = parseResultJson<GitHubRepoSearchResponse>(result);
      expect(data.total).toBe(2);
      expect(data.repositories).toHaveLength(2);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--owner=microsoft']),
        { cache: false }
      );
    });

    it('should work with language filter alone', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        language: 'typescript',
        limit: 2,
      });

      expect(result.isError).toBe(false);
      const data = parseResultJson<GitHubRepoSearchResponse>(result);
      expect(data.total).toBe(2);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--language=typescript']),
        { cache: false }
      );
    });

    it('should work with stars filter alone', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        stars: '>=1000',
        limit: 2,
      });

      expect(result.isError).toBe(false);
      const data = parseResultJson<GitHubRepoSearchResponse>(result);
      expect(data.total).toBe(2);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--stars=">=1000"']),
        { cache: false }
      );
    });

    it('should work with topic filter alone', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        topic: ['cli', 'typescript'],
        limit: 2,
      });

      expect(result.isError).toBe(false);
      const data = parseResultJson<GitHubRepoSearchResponse>(result);
      expect(data.total).toBe(2);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--topic=cli,typescript']),
        { cache: false }
      );
    });

    it('should work with forks filter alone', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        forks: 100,
        limit: 2,
      });

      expect(result.isError).toBe(false);
      const data = parseResultJson<GitHubRepoSearchResponse>(result);
      expect(data.total).toBe(2);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--forks=100']),
        { cache: false }
      );
    });

    it('should work with query alone', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        query: 'test repo',
        limit: 2,
      });

      expect(result.isError).toBe(false);
      const data = parseResultJson<GitHubRepoSearchResponse>(result);
      expect(data.total).toBe(2);
      expect(data.query).toBe('test repo');
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['repos', '"test repo"']),
        { cache: false }
      );
    });
  });

  describe('SECONDARY Filters Validation', () => {
    it('should reject license filter alone', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        license: ['MIT'],
        limit: 2,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Requires query or primary filter (owner, language, stars, topic, forks)'
      );
    });

    it('should reject created filter alone', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        created: '>2023-01-01',
        limit: 2,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Requires query or primary filter'
      );
    });

    it('should reject archived filter alone', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        archived: false,
        limit: 2,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Requires query or primary filter'
      );
    });

    it('should reject includeForks filter alone', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        includeForks: 'only',
        limit: 2,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Requires query or primary filter'
      );
    });

    it('should reject updated filter alone', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        updated: '>2024-01-01',
        limit: 2,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Requires query or primary filter'
      );
    });

    it('should reject visibility filter alone', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        visibility: 'public',
        limit: 2,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Requires query or primary filter'
      );
    });

    it('should reject match filter alone', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        match: 'name',
        limit: 2,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Requires query or primary filter'
      );
    });
  });

  describe('SECONDARY Filters with Query', () => {
    beforeEach(() => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepoResponse),
            }),
          },
        ],
      });
    });

    it('should work with query + license filter', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        query: 'react',
        license: ['MIT'],
        limit: 2,
      });

      expect(result.isError).toBe(false);
      const data = parseResultJson<GitHubRepoSearchResponse>(result);
      expect(data.total).toBe(2);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['react', '--license=MIT']),
        { cache: false }
      );
    });

    it('should work with query + created filter', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        query: 'vue',
        created: '>2023-01-01',
        limit: 2,
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['vue', '--created=">2023-01-01"']),
        { cache: false }
      );
    });

    it('should work with query + multiple secondary filters', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        query: 'python',
        license: ['MIT', 'Apache-2.0'],
        archived: false,
        visibility: 'public',
        limit: 2,
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining([
          'python',
          '--archived=false',
          '--license=MIT,Apache-2.0',
          '--visibility=public',
        ]),
        { cache: false }
      );
    });
  });

  describe('SECONDARY Filters with PRIMARY Filters', () => {
    beforeEach(() => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepoResponse),
            }),
          },
        ],
      });
    });

    it('should work with owner + license filter', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        owner: 'microsoft',
        license: ['MIT'],
        limit: 2,
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--owner=microsoft', '--license=MIT']),
        { cache: false }
      );
    });

    it('should work with language + created filter', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        language: 'python',
        created: '>2020-01-01',
        limit: 2,
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining([
          '--language=python',
          '--created=">2020-01-01"',
        ]),
        { cache: false }
      );
    });

    it('should work with stars + archived filter', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        stars: '>=1000',
        archived: false,
        limit: 2,
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--stars=">=1000"', '--archived=false']),
        { cache: false }
      );
    });
  });

  describe('Complex Filter Combinations', () => {
    beforeEach(() => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepoResponse),
            }),
          },
        ],
      });
    });

    it('should handle complex multi-filter combinations', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        owner: 'microsoft',
        language: 'typescript',
        stars: '>=500',
        license: ['MIT'],
        created: '>2020-01-01',
        archived: false,
        sort: 'stars',
        order: 'desc',
        limit: 5,
      });

      expect(result.isError).toBe(false);
      const data = parseResultJson<GitHubRepoSearchResponse>(result);
      expect(data.total).toBe(2);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining([
          'repos',
          '--owner=microsoft',
          '--language=typescript',
          '--stars=">=500"',
          '--archived=false',
          '--created=">2020-01-01"',
          '--license=MIT',
          '--limit=5',
          '--order=desc',
          '--sort=stars',
        ]),
        { cache: false }
      );
    });
  });

  describe('Sorting and Limits', () => {
    beforeEach(() => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepoResponse),
            }),
          },
        ],
      });
    });

    it('should handle sort by stars', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        query: 'test',
        sort: 'stars',
        order: 'desc',
        limit: 3,
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['--sort=stars', '--order=desc', '--limit=3']),
        { cache: false }
      );
    });

    it('should use default sort when not specified', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        owner: 'microsoft',
        limit: 5,
      });

      expect(result.isError).toBe(false);
      const args = mockExecuteGitHubCommand.mock.calls[0][1];
      expect(args).not.toContain('--sort=best-match'); // Default shouldn't be explicitly added
    });
  });

  describe('Stars Filter Validation', () => {
    beforeEach(() => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepoResponse),
            }),
          },
        ],
      });
    });

    it('should accept valid stars ranges', async () => {
      const validStarsValues = [
        '100',
        '>500',
        '<50',
        '10..100',
        '>=1000',
        '<=500',
      ];

      for (const stars of validStarsValues) {
        mockExecuteGitHubCommand.mockClear();
        const result = await mockServer.callTool(
          TOOL_NAMES.GITHUB_SEARCH_REPOS,
          {
            stars,
            limit: 1,
          }
        );

        expect(result.isError).toBe(false);
        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          expect.arrayContaining([`--stars="${stars}"`]),
          { cache: false }
        );
      }
    });

    it('should reject invalid stars values', async () => {
      mockExecuteGitHubCommand.mockClear();

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        stars: 'invalid',
        limit: 1,
      });

      expect(result.isError).toBe(false);

      // Should still call but without stars parameter
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.not.arrayContaining([expect.stringContaining('--stars=')]),
        { cache: false }
      );
    });
  });

  describe('Query Parsing', () => {
    beforeEach(() => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockRepoResponse),
            }),
          },
        ],
      });
    });

    it('should handle simple queries', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        query: 'test repo',
        limit: 2,
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining(['repos', '"test repo"']),
        { cache: false }
      );
    });

    it('should handle complex queries with operators', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        query: 'language:TypeScript OR language:JavaScript',
        limit: 2,
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining([
          'repos',
          'language:TypeScript',
          'OR',
          'language:JavaScript',
        ]),
        { cache: false }
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle GitHub CLI command failures', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'GitHub CLI command failed' }],
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        owner: 'microsoft',
        limit: 2,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('GitHub CLI command failed');
    });

    it('should handle GitHub CLI not available', async () => {
      mockExecuteGitHubCommand.mockRejectedValue(
        new Error('gh: command not found')
      );

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        owner: 'microsoft',
        limit: 2,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Failed to search GitHub repositories'
      );
      expect(result.content[0].text).toContain('gh: command not found');
    });

    it('should handle malformed JSON responses', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: 'not valid json' }],
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        owner: 'microsoft',
        limit: 2,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Failed to search GitHub repositories'
      );
    });

    it('should handle unexpected errors', async () => {
      mockExecuteGitHubCommand.mockImplementation(() => {
        throw new Error('Unexpected error during search');
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        owner: 'microsoft',
        limit: 2,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Failed to search GitHub repositories'
      );
      expect(result.content[0].text).toContain(
        'Unexpected error during search'
      );
    });
  });

  describe('Empty Results', () => {
    it('should handle empty search results', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
            }),
          },
        ],
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        query: 'nonexistent-repo-12345',
        limit: 2,
      });

      expect(result.isError).toBe(false);
      const data = parseResultJson<GitHubRepoSearchResponse>(result);
      expect(data.total).toBe(0);
      expect(data.repositories).toEqual([]);
      expect(data.suggestions).toBeDefined();
      expect(data.suggestions).toContain('Try broader search terms');
    });
  });

  describe('Repository Data Processing', () => {
    it('should correctly process repository data and calculate summary', async () => {
      const recentDate = new Date().toISOString();
      const testRepos = [
        {
          ...mockRepoResponse[0],
          updatedAt: recentDate, // Recent update
          stargazersCount: 1000,
        },
        {
          ...mockRepoResponse[1],
          updatedAt: '2020-01-01T12:00:00Z', // Old update
          stargazersCount: 2000,
          language: 'Python',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(testRepos),
            }),
          },
        ],
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOS, {
        owner: 'microsoft',
        limit: 2,
      });

      expect(result.isError).toBe(false);
      const data = parseResultJson<GitHubRepoSearchResponse>(result);

      expect(data.total).toBe(2);
      expect(data.summary?.avgStars).toBe(1500); // (1000 + 2000) / 2
      expect(data.summary?.languages).toContain('TypeScript');
      expect(data.summary?.languages).toContain('Python');
      expect(data.summary?.recentlyUpdated).toBe(1); // Only one recent update

      // Check repository data structure
      expect(data.repositories[0]).toMatchObject({
        name: 'owner/test-repo',
        stars: 1000,
        description: 'A test repository',
        language: 'TypeScript',
        url: 'https://github.com/owner/test-repo',
        forks: 200,
        isPrivate: false,
        isArchived: false,
        isFork: false,
        license: 'MIT License',
        hasIssues: true,
        openIssuesCount: 25,
        visibility: 'public',
        owner: 'owner',
      });
    });
  });
});

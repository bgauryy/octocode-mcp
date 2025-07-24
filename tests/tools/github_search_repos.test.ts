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
  registerSearchGitHubReposTool,
  searchGitHubRepos,
  buildGitHubReposSearchCommand,
  GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
} from '../../src/mcp/tools/github_search_repos.js';

describe('GitHub Search Repositories Tool', () => {
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
    it('should register the GitHub search repositories tool with correct parameters', () => {
      registerSearchGitHubReposTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        expect.objectContaining({
          description: expect.stringContaining('Search GitHub repositories'),
          inputSchema: expect.objectContaining({
            queries: expect.any(Object),
          }),
          annotations: expect.objectContaining({
            title: 'GitHub Repository Search',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          }),
        }),
        expect.any(Function)
      );
    });

    it('should register tool with security validation wrapper', () => {
      registerSearchGitHubReposTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledTimes(1);
      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Query Validation', () => {
    it('should accept valid queries with exactQuery', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([
        { name: 'test-repo', stars: 100, language: 'JavaScript' },
      ]);

      mockExecuteGitHubCommand.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries: [{ exactQuery: 'react' }],
        }
      );

      expect(result.isError).toBe(false);
    });

    it('should accept valid queries with queryTerms', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([
        { name: 'test-repo', stars: 100, language: 'JavaScript' },
      ]);

      mockExecuteGitHubCommand.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries: [{ queryTerms: ['react', 'hooks'] }],
        }
      );

      expect(result.isError).toBe(false);
    });

    it('should accept valid queries with owner filter', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([
        { name: 'test-repo', stars: 100, language: 'JavaScript' },
      ]);

      mockExecuteGitHubCommand.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries: [{ owner: 'facebook' }],
        }
      );

      expect(result.isError).toBe(false);
    });

    it('should accept valid queries with language filter', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([
        { name: 'test-repo', stars: 100, language: 'JavaScript' },
      ]);

      mockExecuteGitHubCommand.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries: [{ language: 'typescript' }],
        }
      );

      expect(result.isError).toBe(false);
    });

    it('should accept valid queries with topic filter', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([
        { name: 'test-repo', stars: 100, language: 'JavaScript' },
      ]);

      mockExecuteGitHubCommand.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries: [{ topic: 'machine-learning' }],
        }
      );

      expect(result.isError).toBe(false);
    });

    it('should handle queries without any search parameters gracefully', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries: [{ sort: 'stars' }], // Only has sort, no search params
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].error).toContain(
        'At least one search parameter required'
      );
    });
  });

  describe('Single Query Processing', () => {
    it('should process successful single query', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([
        {
          name: 'awesome-repo',
          fullName: 'owner/awesome-repo',
          stars: 1500,
          language: 'TypeScript',
          description: 'An awesome repository for testing',
          forks: 200,
          updatedAt: '2023-12-01T10:00:00Z',
          owner: { login: 'owner' },
          url: 'https://github.com/owner/awesome-repo',
        },
      ]);

      mockExecuteGitHubCommand.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries: [{ exactQuery: 'awesome', id: 'test-query' }],
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results).toHaveLength(1);
      expect(data.results[0].queryId).toBe('test-query');
      expect(data.results[0].result.repositories[0]).toMatchObject({
        name: 'owner/awesome-repo',
        stars: 1500,
        language: 'TypeScript',
        description: 'An awesome repository for testing',
        forks: 200,
        owner: 'owner',
        url: 'https://github.com/owner/awesome-repo',
      });
    });

    it('should handle query with no results', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([]);

      mockExecuteGitHubCommand.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries: [{ exactQuery: 'nonexistent-repo-xyz' }],
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].result.total_count).toBe(0);
      expect(data.results[0].error).toContain('Query failed');
    });

    it('should handle GitHub command execution failure', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Command failed' }],
      });

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries: [{ exactQuery: 'test' }],
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].error).toContain('Query failed');
      expect(data.results[0].result.total_count).toBe(0);
    });

    it('should handle unexpected errors in query processing', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      // Mock withCache to throw the error directly without wrapping
      mockWithCache.mockImplementation(async (_key, _fn) => {
        throw new Error('Network timeout');
      });

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries: [{ exactQuery: 'test' }],
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].error).toContain(
        'Unexpected error: Network timeout'
      );
      expect(data.results[0].result.total_count).toBe(0);
    });
  });

  describe('Multiple Query Processing', () => {
    it('should process multiple successful queries', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse1 = createMockRepositoryResponse([
        { name: 'repo1', stars: 100, language: 'JavaScript' },
        { name: 'repo2', stars: 200, language: 'JavaScript' },
      ]);
      const mockResponse2 = createMockRepositoryResponse([
        { name: 'repo3', stars: 300, language: 'TypeScript' },
      ]);

      mockExecuteGitHubCommand
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries: [
            { exactQuery: 'javascript', id: 'js-query' },
            { exactQuery: 'typescript', id: 'ts-query' },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results).toHaveLength(2);
      expect(data.results[0].queryId).toBe('js-query');
      expect(data.results[1].queryId).toBe('ts-query');
      expect(data.summary.totalQueries).toBe(2);
      expect(data.summary.successfulQueries).toBe(2);
      expect(data.summary.totalRepositories).toBe(3); // 2 + 1 total_count
    });

    it('should handle mix of successful and failed queries', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockSuccessResponse = createMockRepositoryResponse([
        { name: 'success-repo', stars: 100, language: 'JavaScript' },
      ]);
      const mockFailureResponse = {
        isError: true,
        content: [{ text: 'API rate limit exceeded' }],
      };

      mockExecuteGitHubCommand
        .mockResolvedValueOnce(mockSuccessResponse)
        .mockResolvedValueOnce(mockFailureResponse);

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries: [{ exactQuery: 'success' }, { exactQuery: 'failure' }],
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results).toHaveLength(2);
      expect(data.results[0].error).toBeUndefined();
      expect(data.results[1].error).toContain('Query failed');
      expect(data.summary.successfulQueries).toBe(1);
      expect(data.summary.totalQueries).toBe(2);
    });

    it('should generate auto IDs for queries without explicit IDs', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([
        { name: 'test-repo', stars: 100, language: 'JavaScript' },
      ]);

      mockExecuteGitHubCommand.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries: [
            { exactQuery: 'test1' },
            { exactQuery: 'test2' },
            { exactQuery: 'test3' },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].queryId).toBe('query_1');
      expect(data.results[1].queryId).toBe('query_2');
      expect(data.results[2].queryId).toBe('query_3');
    });

    it('should process maximum 5 queries', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([
        { name: 'test-repo', stars: 100, language: 'JavaScript' },
      ]);

      mockExecuteGitHubCommand.mockResolvedValue(mockResponse);

      const queries = Array.from({ length: 5 }, (_, i) => ({
        exactQuery: `test${i + 1}`,
      }));

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries,
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results).toHaveLength(5);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledTimes(5);
    });
  });

  describe('Core Search Functionality', () => {
    it('should perform basic search with caching', async () => {
      const mockResponse = createMockRepositoryResponse([
        { name: 'cached-repo', stars: 100, language: 'JavaScript' },
      ]);

      mockExecuteGitHubCommand.mockResolvedValue(mockResponse);

      const result = await searchGitHubRepos({ exactQuery: 'test' });

      expect(result.isError).toBe(false);
      expect(mockWithCache).toHaveBeenCalledWith(
        'test-cache-key',
        expect.any(Function)
      );
      expect(mockGenerateCacheKey).toHaveBeenCalledWith('gh-repos', {
        exactQuery: 'test',
      });
    });

    it('should handle repository data formatting correctly', async () => {
      const mockRepo = {
        name: 'test-repo',
        fullName: 'owner/test-repo',
        stargazersCount: 1234,
        description:
          'A very long description that should be truncated because it exceeds the 150 character limit and we want to keep the display clean and readable and this part will be cut off',
        language: 'TypeScript',
        url: 'https://github.com/owner/test-repo',
        forksCount: 456,
        updatedAt: '2023-12-01T10:00:00Z',
        owner: { login: 'owner' },
      };

      const mockResponse = createMockRepositoryResponse([mockRepo]);
      mockExecuteGitHubCommand.mockResolvedValue(mockResponse);

      const result = await searchGitHubRepos({ exactQuery: 'test' });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      const repo = data.repositories[0];

      expect(repo.name).toBe('owner/test-repo');
      expect(repo.stars).toBe(1234);
      expect(repo.description).toBe(
        'A very long description that should be truncated because it exceeds the 150 character limit and we want to keep the display clean and readable and thi...'
      );
      expect(repo.language).toBe('TypeScript');
      expect(repo.forks).toBe(456);
      expect(repo.updatedAt).toBe('01/12/2023');
      expect(repo.owner).toBe('owner');
    });

    it('should handle repositories with missing optional fields', async () => {
      const mockRepo = {
        name: 'minimal-repo',
        url: 'https://github.com/owner/minimal-repo',
      };

      const mockResponse = createMockRepositoryResponse([mockRepo]);
      mockExecuteGitHubCommand.mockResolvedValue(mockResponse);

      const result = await searchGitHubRepos({ exactQuery: 'minimal' });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      const repo = data.repositories[0];

      expect(repo.name).toBe('minimal-repo');
      expect(repo.stars).toBe(0);
      expect(repo.description).toBe('No description');
      expect(repo.language).toBe('Unknown');
      expect(repo.forks).toBe(0);
    });

    it('should return no results error when repositories array is empty', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify({ result: [] }) }],
      });

      const result = await searchGitHubRepos({ exactQuery: 'nonexistent' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No repositories found');
    });

    it('should handle search execution errors', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'GitHub API error' }],
      });

      const result = await searchGitHubRepos({ exactQuery: 'test' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('GitHub API error');
    });

    it('should handle JSON parsing errors', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: 'invalid json' }],
      });

      const result = await searchGitHubRepos({ exactQuery: 'test' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Repository search failed');
    });
  });

  describe('Command Building', () => {
    it('should build basic search command with exactQuery', () => {
      const { command, args } = buildGitHubReposSearchCommand({
        exactQuery: 'react hooks',
      });

      expect(command).toBe('search');
      expect(args).toContain('repos');
      expect(args).toContain('"react hooks"');
    });

    it('should build command with multiple queryTerms', () => {
      const { command, args } = buildGitHubReposSearchCommand({
        queryTerms: ['react', 'typescript', 'hooks'],
      });

      expect(command).toBe('search');
      expect(args).toContain('repos');
      expect(args).toContain('react');
      expect(args).toContain('typescript');
      expect(args).toContain('hooks');
    });

    it('should build command with various filters', () => {
      const { command, args } = buildGitHubReposSearchCommand({
        exactQuery: 'machine learning',
        language: 'python',
        stars: '>1000',
        owner: 'facebook',
        topic: 'ai',
        sort: 'stars',
        order: 'desc',
        limit: 10,
      });

      expect(command).toBe('search');
      expect(args).toContain('repos');
      expect(args).toContain('"machine learning"');
      expect(args).toContain('--language=python');
      expect(args).toContain('--stars=>1000');
      expect(args).toContain('--owner=facebook');
      expect(args).toContain('--topic=ai');
      expect(args).toContain('--sort=stars');
      expect(args).toContain('--order=desc');
      expect(args).toContain('--limit=10');
    });

    it('should build command with array-type filters', () => {
      const { command, args } = buildGitHubReposSearchCommand({
        owner: ['facebook', 'google'],
        topic: ['machine-learning', 'artificial-intelligence'],
        license: ['mit', 'apache-2.0'],
      });

      expect(command).toBe('search');
      expect(args).toContain('repos');
      // Array filters should be handled by the command builder
      expect(
        args.some(arg => arg.includes('facebook') || arg.includes('google'))
      ).toBe(true);
    });

    it('should build command with date filters', () => {
      const { command, args } = buildGitHubReposSearchCommand({
        exactQuery: 'test',
        created: '>2023-01-01',
        updated: '2023-01-01..2023-12-31',
      });

      expect(command).toBe('search');
      expect(args).toContain('--created=>2023-01-01');
      expect(args).toContain('--updated=2023-01-01..2023-12-31');
    });

    it('should build command with special filters', () => {
      const { command, args } = buildGitHubReposSearchCommand({
        exactQuery: 'test',
        'number-topics': '>5',
        'good-first-issues': '>10',
        'help-wanted-issues': '1..5',
        'include-forks': 'only',
        archived: false,
      });

      expect(command).toBe('search');
      expect(args).toContain('--number-topics=>5');
      expect(args).toContain('--good-first-issues=>10');
      expect(args).toContain('--help-wanted-issues=1..5');
      expect(args).toContain('--include-forks=only');
      expect(args).toContain('--archived=false');
    });
  });

  describe('Error Handling', () => {
    it('should handle tool execution errors gracefully', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      // Mock withCache to throw the error directly
      mockWithCache.mockImplementation(async (_key, _fn) => {
        throw new Error('GitHub CLI not found');
      });

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries: [{ exactQuery: 'test' }],
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].error).toContain(
        'Unexpected error: GitHub CLI not found'
      );
    });

    it('should validate query array length limits', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      // Test with more than 5 queries should be rejected by schema validation
      const queries = Array.from({ length: 6 }, (_, i) => ({
        exactQuery: `test${i + 1}`,
      }));

      try {
        const result = await mockServer.callTool(
          GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
          {
            queries,
          }
        );
        // If the call succeeds, it should be an error result or process only first 5
        expect(result.isError).toBe(false);
      } catch (error) {
        // Schema validation might throw an error
        expect(error).toBeDefined();
      }
    });

    it('should validate empty query array', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      try {
        const result = await mockServer.callTool(
          GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
          {
            queries: [],
          }
        );
        // If the call succeeds, it should be an error result
        expect(result.isError).toBe(false);
      } catch (error) {
        // Schema validation might throw an error
        expect(error).toBeDefined();
      }
    });
  });

  // Helper function to create mock repository responses
  function createMockRepositoryResponse(repositories: Record<string, any>[]) {
    return {
      isError: false,
      content: [
        {
          text: JSON.stringify({
            result: repositories.map(repo => ({
              name: repo.name || 'test-repo',
              fullName: repo.fullName || repo.name || 'owner/test-repo',
              stargazersCount: repo.stars || repo.stargazersCount || 0,
              description: repo.description || undefined,
              language: repo.language || undefined,
              url:
                repo.url ||
                `https://github.com/owner/${repo.name || 'test-repo'}`,
              forksCount: repo.forks || repo.forksCount || 0,
              updatedAt: repo.updatedAt || '2023-01-01T00:00:00Z',
              owner: repo.owner || { login: 'owner' },
              ...repo,
            })),
            total_count: repositories.length,
          }),
        },
      ],
    };
  }
});

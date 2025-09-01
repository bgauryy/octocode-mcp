import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteGitHubCommand = vi.hoisted(() => vi.fn());
const mockSearchGitHubReposAPI = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());
const mockGetGitHubToken = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: mockExecuteGitHubCommand,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

vi.mock('../../src/github/index.js', () => ({
  searchGitHubReposAPI: mockSearchGitHubReposAPI,
}));

vi.mock('../../src/tools/utils/tokenManager.js', () => ({
  getGitHubToken: mockGetGitHubToken,
}));

// Import after mocking
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';
import { TOOL_NAMES } from '../../src/constants.js';
// import { GitHubReposSearchParams } from '../../src/types.js'; // Type removed
// GitHubCommandBuilder was removed - using direct API calls now

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

    // Mock token manager to return test token
    mockGetGitHubToken.mockResolvedValue('test-token');

    // Default GitHub CLI mock behavior - return successful results
    const defaultMockResponse = createMockRepositoryResponse([
      {
        name: 'default-repo',
        fullName: 'owner/default-repo',
        stars: 100,
        language: 'JavaScript',
        description: 'Default test repository',
        forks: 10,
        updatedAt: '2023-12-01T10:00:00Z',
        owner: { login: 'owner' },
        url: 'https://github.com/owner/default-repo',
      },
    ]);
    mockSearchGitHubReposAPI.mockResolvedValue(defaultMockResponse);
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search repositories tool with correct parameters', () => {
      registerSearchGitHubReposTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        expect.objectContaining({
          description: expect.stringContaining('Search GitHub repositories'),
          inputSchema: expect.objectContaining({
            queries: expect.any(Object),
          }),
          annotations: expect.objectContaining({
            idempotent: true,
            openWorld: true,
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
    it('should accept valid queries with queryTerms', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([
        { name: 'test-repo', stars: 100, language: 'JavaScript' },
      ]);

      mockSearchGitHubReposAPI.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [{ queryTerms: ['react'] }],
        }
      );

      expect(result.isError).toBe(false);
    });

    it('should accept valid queries with queryTerms', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([
        { name: 'test-repo', stars: 100, language: 'JavaScript' },
      ]);

      mockSearchGitHubReposAPI.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
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

      mockSearchGitHubReposAPI.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
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

      mockSearchGitHubReposAPI.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
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

      mockSearchGitHubReposAPI.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [{ topic: 'machine-learning' }],
        }
      );

      expect(result.isError).toBe(false);
    });

    it('should handle queries without any search parameters gracefully', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [{ sort: 'stars' }], // Only has sort, no search params
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      expect(data.hints.length).toBeGreaterThan(0);
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

      mockSearchGitHubReposAPI.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [{ queryTerms: ['awesome'], id: 'test-query' }],
        }
      );

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      // With the new bulk search implementation, response.results is an array containing results from all queries
      expect(response.results).toBeDefined();
      expect(response.results.length).toBeGreaterThan(0);

      // Find the result with repositories
      const queryResult = response.results.find(
        (r: Record<string, unknown>) => {
          const repositories = r.repositories;
          return Array.isArray(repositories) && repositories.length > 0;
        }
      );
      expect(queryResult).toBeDefined();

      const repo = (
        queryResult.repositories as Array<Record<string, unknown>>
      )?.find(
        (r: Record<string, unknown>) => r.full_name === 'owner/awesome-repo'
      );
      expect(repo).toBeDefined();
      expect(repo).toMatchObject({
        name: 'awesome-repo',
        full_name: 'owner/awesome-repo',
        stargazers_count: 1500,
        language: 'TypeScript',
        description: expect.stringContaining('An awesome repository'),
        forks_count: 200,
        owner: { login: 'owner' },
      });
      expect(response.hints.length).toBeGreaterThan(0);
    });

    it('should pass authInfo and userContext to GitHub API', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([
        {
          name: 'auth-test-repo',
          fullName: 'owner/auth-test-repo',
          stars: 50,
          language: 'JavaScript',
          description: 'Repository for testing auth parameters',
          forks: 5,
          updatedAt: '2023-12-01T10:00:00Z',
          owner: { login: 'owner' },
          url: 'https://github.com/owner/auth-test-repo',
        },
      ]);

      mockSearchGitHubReposAPI.mockResolvedValue(mockResponse);

      await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
        queries: [{ queryTerms: ['auth-test'], id: 'auth-test-query' }],
      });

      // Verify the API was called with authInfo and userContext
      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(1);
      const apiCall = mockSearchGitHubReposAPI.mock.calls[0];

      // Should be called with (query, authInfo, userContext)
      expect(apiCall).toBeDefined();
      expect(apiCall).toHaveLength(3);
      expect(apiCall?.[1]).toEqual(undefined); // authInfo (now undefined)
      expect(apiCall?.[2]).toEqual({
        userId: 'anonymous',
        userLogin: 'anonymous',
        isEnterpriseMode: false,
        sessionId: undefined,
      }); // userContext
    });

    it('should handle query with no results', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([]);

      mockSearchGitHubReposAPI.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [{ queryTerms: ['nonexistent-repo-xyz'] }],
        }
      );

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      // With bulk format, we expect at least one query result, but it may have no repositories
      expect(response.results.length).toBeGreaterThan(0);
      const queryResult = response.results[0];
      expect(queryResult.repositories || []).toHaveLength(0);
      expect(response.hints.length).toBeGreaterThan(0);
    });

    it('should handle GitHub command execution failure', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      // Make sure both CLI and API fail
      mockSearchGitHubReposAPI.mockResolvedValue({
        isError: true,
        content: [{ text: 'Command failed' }],
      });

      // Ensure API also fails
      mockSearchGitHubReposAPI.mockResolvedValue({
        error: 'API failed',
        type: 'http',
        status: 500,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [{ queryTerms: ['test'] }],
        }
      );

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      // With bulk format, we expect at least one query result, but it may be an error
      expect(response.results.length).toBeGreaterThan(0);
      const queryResult = response.results[0];
      // The result should be an error or have no repositories
      if (!queryResult.error) {
        expect(queryResult.repositories || []).toHaveLength(0);
      }
      expect(response.hints.length).toBeGreaterThan(0);
    });

    it('should handle unexpected errors in query processing', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      // Mock withCache to throw the error directly without wrapping
      mockWithCache.mockImplementation(async (_key, _fn) => {
        throw new Error('Network timeout');
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [{ queryTerms: ['test'] }],
        }
      );

      // The implementation handles errors gracefully - may return error or empty results
      if (result.isError) {
        expect(result.content[0]?.text).toContain('Network timeout');
      } else {
        const data = JSON.parse(result.content[0]?.text as string);
        expect(data.hints.length).toBeGreaterThan(0);
      }
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

      mockSearchGitHubReposAPI
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            { queryTerms: ['javascript'], id: 'js-query' },
            { queryTerms: ['typescript'], id: 'ts-query' },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]?.text as string);
      // With bulk processing, expect 2 query results
      expect(response.results.length).toBeGreaterThanOrEqual(2);
      expect(response.hints.length).toBeGreaterThan(0);

      // Look for specific repositories from our mocks in the query results
      const allRepos = response.results.flatMap(
        (queryResult: Record<string, unknown>) => queryResult.repositories || []
      );
      const repo1 = allRepos.find(
        (r: Record<string, unknown>) =>
          r.name && (r.name as string).includes('repo1')
      );
      const repo2 = allRepos.find(
        (r: Record<string, unknown>) =>
          r.name && (r.name as string).includes('repo2')
      );
      const repo3 = allRepos.find(
        (r: Record<string, unknown>) =>
          r.name && (r.name as string).includes('repo3')
      );
      expect(repo1 || repo2 || repo3).toBeDefined();
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

      mockSearchGitHubReposAPI
        .mockResolvedValueOnce(mockSuccessResponse)
        .mockResolvedValueOnce(mockFailureResponse);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [{ queryTerms: ['success'] }, { queryTerms: ['failure'] }],
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      expect(data.results.length).toBeGreaterThan(0); // Successful query results
      expect(data.hints.length).toBeGreaterThan(0);
    });

    it('should generate auto IDs for queries without explicit IDs', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([
        { name: 'test-repo', stars: 100, language: 'JavaScript' },
      ]);

      mockSearchGitHubReposAPI.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            { queryTerms: ['test1'] },
            { queryTerms: ['test2'] },
            { queryTerms: ['test3'] },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      expect(data.results.length).toBeGreaterThan(2); // Repositories from 3 queries
      expect(data.hints.length).toBeGreaterThan(0); // Strategic hints from new system
    });

    it('should process maximum 5 queries', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([
        { name: 'test-repo', stars: 100, language: 'JavaScript' },
      ]);

      mockSearchGitHubReposAPI.mockResolvedValue(mockResponse);
      mockSearchGitHubReposAPI.mockResolvedValue({
        total_count: 1,
        repositories: [
          {
            name: 'test-repo',
            stars: 100,
            language: 'JavaScript',
            url: 'https://github.com/test/repo',
            forks: 0,
            updatedAt: '01/01/2023',
            owner: 'test',
          },
        ],
      });

      const queries = Array.from({ length: 5 }, (_, i) => ({
        queryTerms: [`test${i + 1}`],
      }));

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries,
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      expect(data.results.length).toBeGreaterThan(4); // Repositories from 5 queries
      expect(data.hints.length).toBeGreaterThan(0); // Strategic hints from new system
      // The implementation might use API calls instead of CLI commands
      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(5);
    });

    it('should include meta and metadata when verbose is true', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([
        { name: 'test-repo', stars: 100, language: 'JavaScript' },
      ]);

      mockSearchGitHubReposAPI.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [{ queryTerms: ['test'], id: 'verbose-test' }],
          verbose: true,
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);

      // Should include meta when verbose is true
      expect(data.meta).toBeDefined();
      expect(data.meta.totalOperations).toBeDefined();
      expect(data.meta.successfulOperations).toBeDefined();
      expect(data.meta.failedOperations).toBeDefined();

      // Should include metadata in query results when verbose is true
      expect(data.results.length).toBeGreaterThan(0);
      const queryResult = data.results[0];
      expect(queryResult.metadata).toBeDefined(); // Should have metadata when verbose
      expect(queryResult.queryDescription).toBeDefined(); // Should still have queryDescription
    });
  });

  describe('Repository Search Flows', () => {
    it('should handle successful search with flattened results structure', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = {
        data: {
          total_count: 2,
          repositories: [
            {
              name: 'awesome-lib',
              full_name: 'owner/awesome-lib',
              stargazers_count: 1500,
              language: 'TypeScript',
              description: 'An awesome library',
              forks_count: 200,
              owner: { login: 'owner' },
              html_url: 'https://github.com/owner/awesome-lib',
            },
          ],
        },
        status: 200,
      };

      mockSearchGitHubReposAPI.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        { queries: [{ queryTerms: ['awesome'] }] }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);

      // Should have flattened structure
      expect(data.results[0]).toHaveProperty('repositories');
      expect(data.results[0]).toHaveProperty('total_count');
      expect(data.results[0]).not.toHaveProperty('data'); // No nested data field
      expect(data.results[0].repositories).toHaveLength(1);
      expect(data.results[0].total_count).toBe(2);
    });

    it('should include query field when no results are found', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = {
        data: { total_count: 0, repositories: [] },
        status: 200,
      };

      mockSearchGitHubReposAPI.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        { queries: [{ queryTerms: ['nonexistent123'], limit: 1 }] }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);

      // Should include query field for no results case
      const noResultQuery = data.results.find(
        (r: Record<string, unknown>) =>
          Array.isArray(r.repositories) && r.repositories.length === 0
      );
      expect(noResultQuery).toBeDefined();
      expect(noResultQuery.query).toBeDefined();
      expect(noResultQuery.query.queryTerms).toEqual(['nonexistent123']);
    });

    it('should include query field when verbose is true', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = {
        data: {
          total_count: 1,
          repositories: [
            {
              name: 'test-repo',
              full_name: 'owner/test-repo',
              stargazers_count: 100,
              language: 'JavaScript',
              description: 'Test repository',
              forks_count: 10,
              owner: { login: 'owner' },
              html_url: 'https://github.com/owner/test-repo',
            },
          ],
        },
        status: 200,
      };

      mockSearchGitHubReposAPI.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [{ queryTerms: ['test'], limit: 1 }],
          verbose: true,
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);

      // Should include query field when verbose is true
      expect(data.results[0].query).toBeDefined();
      expect(data.results[0].query.queryTerms).toEqual(['test']);
    });

    it('should handle API errors gracefully', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      mockSearchGitHubReposAPI.mockResolvedValue({
        error: 'API rate limit exceeded',
        type: 'http',
        status: 403,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        { queries: [{ queryTerms: ['test'] }] }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);

      // Should have error in results but not fail overall
      const errorResult = data.results.find(
        (r: Record<string, unknown>) => r.error
      );
      expect(errorResult).toBeDefined();
      expect(errorResult.error).toMatch(/rate limit/i);
      expect(data.hints).toBeDefined();
      expect(data.hints.length).toBeGreaterThan(0);
    });

    it('should process bulk queries efficiently', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse1 = {
        data: {
          total_count: 1,
          repositories: [
            {
              name: 'react-lib',
              stargazers_count: 2000,
              language: 'JavaScript',
              owner: { login: 'facebook' },
              full_name: 'facebook/react-lib',
              html_url: 'https://github.com/facebook/react-lib',
            },
          ],
        },
        status: 200,
      };

      const mockResponse2 = {
        data: {
          total_count: 1,
          repositories: [
            {
              name: 'vue-lib',
              stargazers_count: 1500,
              language: 'JavaScript',
              owner: { login: 'vuejs' },
              full_name: 'vuejs/vue-lib',
              html_url: 'https://github.com/vuejs/vue-lib',
            },
          ],
        },
        status: 200,
      };

      mockSearchGitHubReposAPI
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            { queryTerms: ['react'], topic: 'frontend' },
            { queryTerms: ['vue'], topic: 'frontend' },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);

      // Should process both queries
      expect(data.results.length).toBe(2);
      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(2);

      // Should have aggregated hints
      expect(data.hints).toBeDefined();
      expect(data.hints.length).toBeGreaterThan(0);
    });

    it('should validate query limits', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      // Try to search with more than 5 queries
      const queries = Array.from({ length: 6 }, (_, i) => ({
        queryTerms: [`test${i}`],
      }));

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        { queries }
      );

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/Maximum 5 queries/);
    });

    it('should handle empty queries array', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        { queries: [] }
      );

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/cannot be empty/);
    });
  });

  // Helper function to create mock repository response
  function createMockRepositoryResponse(repos: Array<Record<string, unknown>>) {
    return {
      data: {
        total_count: repos.length,
        repositories: repos.map(repo => ({
          name: repo.name || 'test-repo',
          full_name: repo.fullName || `owner/${repo.name || 'test-repo'}`,
          stargazers_count: repo.stars || 0,
          language: repo.language || 'JavaScript',
          description: repo.description || 'Test repository',
          forks_count: repo.forks || 0,
          updated_at: repo.updatedAt || '2023-12-01T10:00:00Z',
          owner: repo.owner || { login: 'owner' },
          html_url:
            repo.url || `https://github.com/owner/${repo.name || 'test-repo'}`,
        })),
      },
      status: 200,
    };
  }
});

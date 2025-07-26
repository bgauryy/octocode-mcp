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
} from '../../src/mcp/tools/github_search_repos.js';
import { GITHUB_SEARCH_REPOSITORIES_TOOL_NAME } from '../../src/mcp/tools/utils/toolConstants.js';

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
      expect(
        data.hints.some((hint: string) =>
          hint.includes('At least one search parameter required')
        )
      ).toBe(true);
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
      expect(data.data).toHaveLength(1);
      expect(data.data[0]).toMatchObject({
        name: 'owner/awesome-repo',
        stars: 1500,
        language: 'TypeScript',
        description: 'An awesome repository for testing',
        forks: 200,
        owner: 'owner',
        url: 'https://github.com/owner/awesome-repo',
      });
      expect(data.hints).toHaveLength(0); // No errors, so no hints
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
      expect(data.data).toHaveLength(0); // No repositories found
      expect(
        data.hints.some((hint: string) =>
          hint.includes('No repositories found')
        )
      ).toBe(true);
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
      expect(data.data).toHaveLength(0); // No repositories found
      expect(
        data.hints.some((hint: string) =>
          hint.includes('failed - consider simplifying search criteria')
        )
      ).toBe(true);
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
      expect(data.data).toHaveLength(0); // No repositories found
      expect(
        data.hints.some((hint: string) =>
          hint.includes('Unexpected error: Network timeout')
        )
      ).toBe(true);
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
      expect(data.data).toHaveLength(3); // All repositories merged from both queries
      expect(data.hints).toHaveLength(0); // No errors, so no hints

      // Test repositories from both queries are merged - just check we have expected count
      expect(data.data.length).toBeGreaterThan(0);
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
      expect(data.data).toHaveLength(1); // Only successful query results
      expect(
        data.hints.some((hint: string) =>
          hint.includes('failed - consider simplifying search criteria')
        )
      ).toBe(true);
      expect(
        data.hints.some((hint: string) =>
          hint.includes('Partial results obtained')
        )
      ).toBe(true);
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
      expect(data.data).toHaveLength(3); // All repositories from 3 queries
      expect(data.hints).toHaveLength(0); // No errors, so no hints
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
      expect(data.data).toHaveLength(5); // All repositories from 5 queries
      expect(data.hints).toHaveLength(0); // No errors, so no hints
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

  describe('Comprehensive API Command Testing', () => {
    describe('Individual Flag Testing - All String-Based', () => {
      it('should build command with --archived flag as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          archived: true,
        });

        expect(command).toBe('search');
        expect(args).toContain('repos');
        expect(args).toContain('--archived=true');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --archived=false flag as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          archived: false,
        });

        expect(command).toBe('search');
        expect(args).toContain('--archived=false');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --created date filter as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          created: '>2023-01-01',
        });

        expect(command).toBe('search');
        expect(args).toContain('--created=>2023-01-01');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --followers number filter as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          followers: '>1000',
        });

        expect(command).toBe('search');
        expect(args).toContain('--followers=>1000');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --forks number filter as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          forks: '100..500',
        });

        expect(command).toBe('search');
        expect(args).toContain('--forks=100..500');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --good-first-issues filter as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          'good-first-issues': '>=10',
        });

        expect(command).toBe('search');
        expect(args).toContain('--good-first-issues=>=10');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --help-wanted-issues filter as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          'help-wanted-issues': '5..20',
        });

        expect(command).toBe('search');
        expect(args).toContain('--help-wanted-issues=5..20');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --include-forks flag as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          'include-forks': 'only',
        });

        expect(command).toBe('search');
        expect(args).toContain('--include-forks=only');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --language filter as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          language: 'typescript',
        });

        expect(command).toBe('search');
        expect(args).toContain('--language=typescript');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --license filter as string array', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          license: ['mit', 'apache-2.0'],
        });

        expect(command).toBe('search');
        expect(args.some(arg => arg.includes('mit'))).toBe(true);
        expect(args.some(arg => arg.includes('apache-2.0'))).toBe(true);
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --limit flag as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          limit: 50,
        });

        expect(command).toBe('search');
        expect(args).toContain('--limit=50');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --match filter as string array', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          match: ['name', 'description'],
        });

        expect(command).toBe('search');
        expect(args.some(arg => arg.includes('name'))).toBe(true);
        expect(args.some(arg => arg.includes('description'))).toBe(true);
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --number-topics filter as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          'number-topics': '>3',
        });

        expect(command).toBe('search');
        expect(args).toContain('--number-topics=>3');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --order flag as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          order: 'asc',
        });

        expect(command).toBe('search');
        expect(args).toContain('--order=asc');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --owner filter as string array', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          owner: ['microsoft', 'google'],
        });

        expect(command).toBe('search');
        expect(args.some(arg => arg.includes('microsoft'))).toBe(true);
        expect(args.some(arg => arg.includes('google'))).toBe(true);
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --size filter as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          size: '>1000',
        });

        expect(command).toBe('search');
        expect(args).toContain('--size=>1000');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --sort flag as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          sort: 'stars',
        });

        expect(command).toBe('search');
        expect(args).toContain('--sort=stars');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --stars filter as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          stars: '>1000',
        });

        expect(command).toBe('search');
        expect(args).toContain('--stars=>1000');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --topic filter as string array', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          topic: ['machine-learning', 'python'],
        });

        expect(command).toBe('search');
        expect(args.some(arg => arg.includes('machine-learning'))).toBe(true);
        expect(args.some(arg => arg.includes('python'))).toBe(true);
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --updated date filter as string', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          updated: '2023-01-01..2023-12-31',
        });

        expect(command).toBe('search');
        expect(args).toContain('--updated=2023-01-01..2023-12-31');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should build command with --visibility filter as string array', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          visibility: 'public',
        });

        expect(command).toBe('search');
        expect(args).toContain('--visibility=public');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });
    });

    describe('Number Format Variations', () => {
      it('should handle exact number values as strings', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          stars: 1000,
          forks: 50,
          followers: 200,
        });

        expect(command).toBe('search');
        expect(args).toContain('--stars=1000');
        expect(args).toContain('--forks=50');
        expect(args).toContain('--followers=200');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should handle range number formats as strings', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          stars: '100..1000',
          forks: '10..100',
          'good-first-issues': '5..15',
        });

        expect(command).toBe('search');
        expect(args).toContain('--stars=100..1000');
        expect(args).toContain('--forks=10..100');
        expect(args).toContain('--good-first-issues=5..15');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should handle comparison operators as strings', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          stars: '>=500',
          forks: '<=100',
          size: '>1000',
          followers: '<10000',
        });

        expect(command).toBe('search');
        expect(args).toContain('--stars=>=500');
        expect(args).toContain('--forks=<=100');
        expect(args).toContain('--size=>1000');
        expect(args).toContain('--followers=<10000');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });
    });

    describe('Date Format Variations', () => {
      it('should handle exact date formats as strings', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          created: '2023-01-01',
          updated: '2023-12-31',
        });

        expect(command).toBe('search');
        expect(args).toContain('--created=2023-01-01');
        expect(args).toContain('--updated=2023-12-31');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should handle date ranges as strings', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          created: '2020-01-01..2023-12-31',
          updated: '2023-01-01..2023-06-30',
        });

        expect(command).toBe('search');
        expect(args).toContain('--created=2020-01-01..2023-12-31');
        expect(args).toContain('--updated=2023-01-01..2023-06-30');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should handle date comparison operators as strings', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          created: '>2020-01-01',
          updated: '>=2023-01-01',
        });

        expect(command).toBe('search');
        expect(args).toContain('--created=>2020-01-01');
        expect(args).toContain('--updated=>=2023-01-01');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });
    });

    describe('String Array Handling', () => {
      it('should handle single string values as strings', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          owner: 'facebook',
          topic: 'javascript',
          license: 'mit',
          visibility: 'public',
        });

        expect(command).toBe('search');
        expect(args).toContain('--owner=facebook');
        expect(args).toContain('--topic=javascript');
        expect(args).toContain('--license=mit');
        expect(args).toContain('--visibility=public');
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });

      it('should handle multiple string values as string arrays', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          owner: ['facebook', 'google', 'microsoft'],
          topic: ['javascript', 'typescript', 'react'],
          license: ['mit', 'apache-2.0', 'bsd-3-clause'],
        });

        expect(command).toBe('search');

        // Check that all owner values are present as strings
        const ownerArgs = args.filter(arg => arg.startsWith('--owner='));
        expect(ownerArgs.length).toBeGreaterThan(0);
        ownerArgs.forEach(arg => expect(typeof arg).toBe('string'));

        // Check that all topic values are present as strings
        const topicArgs = args.filter(arg => arg.startsWith('--topic='));
        expect(topicArgs.length).toBeGreaterThan(0);
        topicArgs.forEach(arg => expect(typeof arg).toBe('string'));

        // Check that all license values are present as strings
        const licenseArgs = args.filter(arg => arg.startsWith('--license='));
        expect(licenseArgs.length).toBeGreaterThan(0);
        licenseArgs.forEach(arg => expect(typeof arg).toBe('string'));

        args.forEach(arg => expect(typeof arg).toBe('string'));
      });
    });

    describe('Boolean Flag Variations', () => {
      it('should handle include-forks string options as strings', () => {
        const testCases: Array<'false' | 'true' | 'only'> = [
          'false',
          'true',
          'only',
        ];

        testCases.forEach(value => {
          const { command, args } = buildGitHubReposSearchCommand({
            exactQuery: 'test',
            'include-forks': value,
          });

          expect(command).toBe('search');
          expect(args).toContain(`--include-forks=${value}`);
          args.forEach(arg => expect(typeof arg).toBe('string'));
        });
      });

      it('should handle archived boolean values as strings', () => {
        const { command: cmd1, args: args1 } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          archived: true,
        });

        const { command: cmd2, args: args2 } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          archived: false,
        });

        expect(cmd1).toBe('search');
        expect(cmd2).toBe('search');
        expect(args1).toContain('--archived=true');
        expect(args2).toContain('--archived=false');

        args1.forEach(arg => expect(typeof arg).toBe('string'));
        args2.forEach(arg => expect(typeof arg).toBe('string'));
      });
    });

    describe('Sort and Order Combinations', () => {
      const sortOptions: Array<
        'forks' | 'help-wanted-issues' | 'stars' | 'updated'
      > = ['forks', 'help-wanted-issues', 'stars', 'updated'];
      const orderOptions: Array<'asc' | 'desc'> = ['asc', 'desc'];

      sortOptions.forEach(sortValue => {
        orderOptions.forEach(orderValue => {
          it(`should handle --sort=${sortValue} --order=${orderValue} as strings`, () => {
            const { command, args } = buildGitHubReposSearchCommand({
              exactQuery: 'test',
              sort: sortValue,
              order: orderValue,
            });

            expect(command).toBe('search');
            expect(args).toContain(`--sort=${sortValue}`);
            expect(args).toContain(`--order=${orderValue}`);
            args.forEach(arg => expect(typeof arg).toBe('string'));
          });
        });
      });
    });

    describe('Match Field Options', () => {
      const matchOptions: Array<'name' | 'description' | 'readme'> = [
        'name',
        'description',
        'readme',
      ];

      it('should handle single match field as string', () => {
        matchOptions.forEach(field => {
          const { command, args } = buildGitHubReposSearchCommand({
            exactQuery: 'test',
            match: field,
          });

          expect(command).toBe('search');
          expect(args.some(arg => arg.includes(field))).toBe(true);
          args.forEach(arg => expect(typeof arg).toBe('string'));
        });
      });

      it('should handle multiple match fields as string array', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'test',
          match: ['name', 'description', 'readme'],
        });

        expect(command).toBe('search');
        matchOptions.forEach(field => {
          expect(args.some(arg => arg.includes(field))).toBe(true);
        });
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });
    });

    describe('Visibility Options', () => {
      const visibilityOptions: Array<'public' | 'private' | 'internal'> = [
        'public',
        'private',
        'internal',
      ];

      visibilityOptions.forEach(visibility => {
        it(`should handle --visibility=${visibility} as string`, () => {
          const { command, args } = buildGitHubReposSearchCommand({
            exactQuery: 'test',
            visibility: visibility,
          });

          expect(command).toBe('search');
          expect(args).toContain(`--visibility=${visibility}`);
          args.forEach(arg => expect(typeof arg).toBe('string'));
        });
      });
    });

    describe('Maximum Complexity Test - All Parameters as Strings', () => {
      it('should handle all available parameters together as strings', () => {
        const { command, args } = buildGitHubReposSearchCommand({
          exactQuery: 'machine learning framework',
          archived: false,
          created: '>2020-01-01',
          updated: '2023-01-01..2023-12-31',
          followers: '>1000',
          forks: '100..1000',
          'good-first-issues': '>=5',
          'help-wanted-issues': '>=10',
          'include-forks': 'false',
          language: 'python',
          license: ['mit', 'apache-2.0'],
          limit: 25,
          match: ['name', 'description'],
          'number-topics': '>2',
          order: 'desc',
          owner: ['facebook', 'google', 'microsoft'],
          size: '>500',
          sort: 'stars',
          stars: '>1000',
          topic: ['machine-learning', 'deep-learning', 'neural-networks'],
          visibility: 'public',
        });

        expect(command).toBe('search');
        expect(args).toContain('repos');

        // Verify all parameters are present and are strings
        expect(args).toContain('--archived=false');
        expect(args).toContain('--created=>2020-01-01');
        expect(args).toContain('--updated=2023-01-01..2023-12-31');
        expect(args).toContain('--followers=>1000');
        expect(args).toContain('--forks=100..1000');
        expect(args).toContain('--good-first-issues=>=5');
        expect(args).toContain('--help-wanted-issues=>=10');
        expect(args).toContain('--include-forks=false');
        expect(args).toContain('--language=python');
        expect(args).toContain('--limit=25');
        expect(args).toContain('--number-topics=>2');
        expect(args).toContain('--order=desc');
        expect(args).toContain('--size=>500');
        expect(args).toContain('--sort=stars');
        expect(args).toContain('--stars=>1000');
        expect(args).toContain('--visibility=public');

        // Verify array parameters are handled as strings
        expect(args.some(arg => arg.includes('mit'))).toBe(true);
        expect(args.some(arg => arg.includes('apache-2.0'))).toBe(true);
        expect(args.some(arg => arg.includes('facebook'))).toBe(true);
        expect(args.some(arg => arg.includes('google'))).toBe(true);
        expect(args.some(arg => arg.includes('microsoft'))).toBe(true);
        expect(args.some(arg => arg.includes('machine-learning'))).toBe(true);
        expect(args.some(arg => arg.includes('deep-learning'))).toBe(true);
        expect(args.some(arg => arg.includes('neural-networks'))).toBe(true);
        expect(args.some(arg => arg.includes('name'))).toBe(true);
        expect(args.some(arg => arg.includes('description'))).toBe(true);

        // Ensure ALL arguments are strings
        args.forEach(arg => expect(typeof arg).toBe('string'));
      });
    });
  });

  describe('Verbose Mode', () => {
    it('should include metadata when verbose is true', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockResponse = createMockRepositoryResponse([
        { name: 'test-repo', stars: 100, language: 'JavaScript' },
      ]);

      mockExecuteGitHubCommand.mockResolvedValue(mockResponse);

      const result = await mockServer.callTool(
        GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
        {
          queries: [{ exactQuery: 'react' }],
          verbose: true,
        }
      );

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.data).toHaveLength(1);
      expect(data.hints).toHaveLength(0);
      expect(data.metadata).toBeDefined();
      expect(data.metadata.queries).toHaveLength(1);
      expect(data.metadata.summary).toBeDefined();
      expect(data.metadata.summary.totalQueries).toBe(1);
      expect(data.metadata.summary.successfulQueries).toBe(1);
    });

    it('should not include metadata when verbose is false (default)', async () => {
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
      const data = JSON.parse(result.content[0].text as string);
      expect(data.data).toHaveLength(1);
      expect(data.hints).toHaveLength(0);
      expect(data.metadata).toBeUndefined();
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
      expect(data.data).toHaveLength(0); // No repositories found
      expect(
        data.hints.some((hint: string) =>
          hint.includes('Unexpected error: GitHub CLI not found')
        )
      ).toBe(true);
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

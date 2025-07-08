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
import { registerSearchGitHubReposTool } from '../../src/mcp/tools/github_search_repos.js';

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
    it('should register the GitHub search repositories tool', () => {
      registerSearchGitHubReposTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'githubSearchRepositories',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful repository search', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockGitHubResponse = {
        result: [
          {
            name: 'test-repo',
            fullName: 'owner/test-repo',
            description: 'Test repository',
            language: 'TypeScript',
            stargazersCount: 100,
            forksCount: 10,
            updatedAt: '2024-01-01T00:00:00Z',
            createdAt: '2024-01-01T00:00:00Z',
            url: 'https://github.com/owner/test-repo',
            owner: { login: 'owner' },
            isPrivate: false,
            license: { name: 'MIT' },
            hasIssues: true,
            openIssuesCount: 5,
            isArchived: false,
            isFork: false,
            visibility: 'public',
          },
        ],
        command: 'gh search repos test --limit=30 --json',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        exactQuery: 'test',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'repos',
          'test',
          '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
          '--limit=30',
        ],
        { cache: false }
      );
    });

    it('should handle no results found', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify([]),
        command: 'gh search repos nonexistent --limit=30 --json',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        exactQuery: 'nonexistent',
      });

      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('should handle search errors', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Search failed' }],
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        exactQuery: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Search failed');
    });
  });

  describe('GitHub CLI Command Structure Tests', () => {
    beforeEach(() => {
      registerSearchGitHubReposTool(mockServer.server);

      // Mock successful response for all tests
      const mockGitHubResponse = {
        result: JSON.stringify([]),
        command: 'test command',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });
    });

    describe('Basic Search Types', () => {
      it('should handle single term search', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'cli',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'cli',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle multi-term search', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          queryTerms: ['cli', 'shell'],
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'cli',
            'shell',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle exact phrase search', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: '"vim plugin"',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            '"vim plugin"',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle queryTerms as separate arguments for AND logic', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          queryTerms: ['cli', 'shell'],
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'cli',
            'shell',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle multiple queryTerms correctly', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          queryTerms: ['machine', 'learning', 'python'],
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'machine',
            'learning',
            'python',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle search without query (flags only)', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          owner: 'microsoft',
          language: 'go',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--owner=microsoft',
            '--language=go',
            '--limit=30',
          ],
          { cache: false }
        );
      });
    });

    describe('Individual Filters', () => {
      it('should handle --language filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          language: 'python',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--language=python',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --owner filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          owner: 'microsoft',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--owner=microsoft',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --stars filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          stars: '>=1000',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--stars=>=1000',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --forks filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          forks: '>=100',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--forks=>=100',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --topic filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          topic: ['unix', 'terminal'],
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--topic=unix,terminal',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --archived filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          archived: false,
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--archived=false',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --visibility filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          visibility: 'public',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--visibility=public',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --created filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          created: '>2023-01-01',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--created=>2023-01-01',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --updated filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          updated: '<2024-06-01',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--updated=<2024-06-01',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --good-first-issues filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          'good-first-issues': '>=10',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--good-first-issues=>=10',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --help-wanted-issues filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          'help-wanted-issues': '>=5',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--help-wanted-issues=>=5',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --followers filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          followers: '>=1000',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--followers=>=1000',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --size filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          size: '<100',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--size=<100',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --license filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          license: 'MIT',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--license=MIT',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --include-forks filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          'include-forks': 'only',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--include-forks=only',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --match filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          match: 'name',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--match=name',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle --number-topics filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          'number-topics': '>=3',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--number-topics=>=3',
            '--limit=30',
          ],
          { cache: false }
        );
      });
    });

    describe('Advanced Combinations', () => {
      it('should handle multiple filters combined', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          language: 'go',
          stars: '>=1000',
          'good-first-issues': '>=10',
          limit: 50,
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--language=go',
            '--stars=>=1000',
            '--good-first-issues=>=10',
            '--limit=50',
          ],
          { cache: false }
        );
      });

      it('should handle multiple owners', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'api',
          owner: ['microsoft', 'google'],
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'api',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--owner=microsoft,google',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle multiple licenses', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          license: ['MIT', 'Apache-2.0'],
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--license=MIT,Apache-2.0',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle multiple match fields', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          match: ['name', 'description'],
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--match=name,description',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle sorting and ordering', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          sort: 'stars',
          order: 'asc',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--sort=stars',
            '--order=asc',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle default limit when not specified', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle explicit limit', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          limit: 10,
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--limit=10',
          ],
          { cache: false }
        );
      });
    });

    describe('Parameter Variations and Edge Cases', () => {
      it('should handle single string topic', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          topic: 'javascript',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--topic=javascript',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle numeric stars filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          stars: 1000,
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--stars=1000',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle numeric forks filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          forks: 50,
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--forks=50',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle numeric good-first-issues filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          'good-first-issues': 5,
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--good-first-issues=5',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle numeric help-wanted-issues filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          'help-wanted-issues': 3,
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--help-wanted-issues=3',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle numeric followers filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          followers: 500,
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--followers=500',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle numeric number-topics filter', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          'number-topics': 2,
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--number-topics=2',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle range filters with different operators', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          stars: '100..1000',
          forks: '<=50',
          'good-first-issues': '>5',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--forks=<=50',
            '--stars=100..1000',
            '--good-first-issues=>5',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle date range filters', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          created: '2023-01-01..2023-12-31',
          updated: '>=2024-01-01',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--created=2023-01-01..2023-12-31',
            '--updated=>=2024-01-01',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle all visibility options', async () => {
        // Test each visibility option separately
        const visibilityOptions = ['public', 'private', 'internal'] as const;

        for (const visibility of visibilityOptions) {
          await mockServer.callTool('githubSearchRepositories', {
            exactQuery: 'test',
            visibility,
          });

          expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
            'search',
            [
              'repos',
              'test',
              '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
              `--visibility=${visibility}`,
              '--limit=30',
            ],
            { cache: false }
          );
        }
      });

      it('should handle all include-forks options', async () => {
        const includeForksOptions = ['false', 'true', 'only'] as const;

        for (const includeForks of includeForksOptions) {
          await mockServer.callTool('githubSearchRepositories', {
            exactQuery: 'test',
            'include-forks': includeForks,
          });

          expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
            'search',
            [
              'repos',
              'test',
              '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
              `--include-forks=${includeForks}`,
              '--limit=30',
            ],
            { cache: false }
          );
        }
      });

      it('should handle all sort options', async () => {
        const sortOptions = [
          'forks',
          'help-wanted-issues',
          'stars',
          'updated',
        ] as const;

        for (const sort of sortOptions) {
          await mockServer.callTool('githubSearchRepositories', {
            exactQuery: 'test',
            sort,
          });

          expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
            'search',
            [
              'repos',
              'test',
              '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
              `--sort=${sort}`,
              '--limit=30',
            ],
            { cache: false }
          );
        }
      });

      it('should handle all order options', async () => {
        const orderOptions = ['asc', 'desc'] as const;

        for (const order of orderOptions) {
          await mockServer.callTool('githubSearchRepositories', {
            exactQuery: 'test',
            order,
          });

          expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
            'search',
            [
              'repos',
              'test',
              '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
              `--order=${order}`,
              '--limit=30',
            ],
            { cache: false }
          );
        }
      });

      it('should handle archived true/false', async () => {
        // Test archived=true
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          archived: true,
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--archived=true',
            '--limit=30',
          ],
          { cache: false }
        );

        // Test archived=false
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          archived: false,
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--archived=false',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle complex query with special characters', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: '"machine learning" OR "deep learning"',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            '"machine learning" OR "deep learning"',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle limit boundary values', async () => {
        // Test minimum limit
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          limit: 1,
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--limit=1',
          ],
          { cache: false }
        );

        // Test maximum limit
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          limit: 100,
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--limit=100',
          ],
          { cache: false }
        );
      });
    });

    describe('GitHub CLI Examples Verification', () => {
      it('should match official example: cli shell', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          queryTerms: ['cli', 'shell'],
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'cli',
            'shell',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should match official example: "vim plugin"', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: '"vim plugin"',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            '"vim plugin"',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should match official example: microsoft public repos', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          owner: 'microsoft',
          visibility: 'public',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--owner=microsoft',
            '--visibility=public',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should match official example: topic search', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          topic: ['unix', 'terminal'],
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--topic=unix,terminal',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should match official example: go language with good first issues', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          language: 'go',
          'good-first-issues': '>=10',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--language=go',
            '--good-first-issues=>=10',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should match official example: exclude archived', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          language: 'javascript', // Add primary filter since archived alone isn't sufficient
          archived: false,
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--language=javascript',
            '--archived=false',
            '--limit=30',
          ],
          { cache: false }
        );
      });
    });

    describe('Advanced CLI Structure Tests', () => {
      it('should handle maximum complexity command', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: '"machine learning" framework',
          owner: ['microsoft', 'google', 'facebook'],
          language: 'python',
          topic: ['ai', 'ml', 'tensorflow'],
          stars: '>=1000',
          forks: '100..500',
          'good-first-issues': '>=5',
          'help-wanted-issues': '>=3',
          followers: '>=500',
          license: ['MIT', 'Apache-2.0'],
          visibility: 'public',
          archived: false,
          'include-forks': 'false',
          created: '>=2023-01-01',
          updated: '>=2024-01-01',
          size: '>=100',
          'number-topics': '>=3',
          match: ['name', 'description'],
          sort: 'stars',
          order: 'desc',
          limit: 50,
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            '"machine learning" framework',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--owner=microsoft,google,facebook',
            '--language=python',
            '--forks=100..500',
            '--topic=ai,ml,tensorflow',
            '--number-topics=>=3',
            '--stars=>=1000',
            '--archived=false',
            '--include-forks=false',
            '--visibility=public',
            '--license=MIT,Apache-2.0',
            '--created=>=2023-01-01',
            '--updated=>=2024-01-01',
            '--size=>=100',
            '--good-first-issues=>=5',
            '--help-wanted-issues=>=3',
            '--followers=>=500',
            '--match=name,description',
            '--sort=stars',
            '--order=desc',
            '--limit=50',
          ],
          { cache: false }
        );
      });

      it('should handle embedded qualifiers and skip conflicting flags', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'language:python stars:>1000 org:microsoft',
          language: 'javascript', // Should be ignored due to embedded qualifier
          stars: '>=500', // Should be ignored due to embedded qualifier
          owner: 'google', // Should be ignored due to embedded qualifier
          archived: false, // Should still be applied
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'language:python stars:>1000 org:microsoft',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--archived=false',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle best-match sort (default) without adding sort flag', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          exactQuery: 'test',
          sort: 'best-match',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            'test',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--limit=30',
          ],
          { cache: false }
        );
      });

      it('should handle empty query with only filters', async () => {
        await mockServer.callTool('githubSearchRepositories', {
          language: 'rust',
          stars: '>=100',
          'good-first-issues': '>=1',
        });

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          [
            'repos',
            '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
            '--language=rust',
            '--stars=>=100',
            '--good-first-issues=>=1',
            '--limit=30',
          ],
          { cache: false }
        );
      });
    });
  });
});

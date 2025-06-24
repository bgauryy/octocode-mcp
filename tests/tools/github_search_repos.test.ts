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
        'github_search_repositories',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful repository search', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify({
          total_count: 1,
          items: [
            {
              name: 'test-repo',
              full_name: 'owner/test-repo',
              description: 'A test repository',
              html_url: 'https://github.com/owner/test-repo',
              stargazers_count: 100,
              language: 'JavaScript',
            },
          ],
        }),
        command: 'gh search repos test --limit=25 --json',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        query: 'test',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'repos',
          'test',
          '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility',
        ],
        { cache: false }
      );
    });

    it('should handle no results found', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify({
          total_count: 0,
          items: [],
        }),
        command: 'gh search repos nonexistent --limit=25 --json',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        query: 'nonexistent',
      });

      expect(result.isError).toBe(false);
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('should handle search errors', async () => {
      registerSearchGitHubReposTool(mockServer.server);

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Search failed' }],
      });

      const result = await mockServer.callTool('github_search_repositories', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Search failed');
    });
  });
});

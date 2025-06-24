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
import { registerSearchGitHubPullRequestsTool } from '../../src/mcp/tools/github_search_pull_requests.js';

describe('GitHub Search Pull Requests Tool', () => {
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
    it('should register the GitHub search pull requests tool', () => {
      registerSearchGitHubPullRequestsTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'github_search_pull_requests',
        expect.any(Object),
        expect.any(Function)
      );
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

      const result = await mockServer.callTool('github_search_pull_requests', {
        query: 'fix',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        ['search/issues?q=fix%20type%3Apr&per_page=25'],
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

      const result = await mockServer.callTool('github_search_pull_requests', {
        query: 'nonexistent',
      });

      expect(result.isError).toBe(false);
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('should handle search errors', async () => {
      registerSearchGitHubPullRequestsTool(mockServer.server);

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Search failed' }],
      });

      const result = await mockServer.callTool('github_search_pull_requests', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Search failed');
    });
  });
});

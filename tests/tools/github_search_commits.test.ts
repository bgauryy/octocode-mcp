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
import { registerGitHubSearchCommitsTool } from '../../src/mcp/tools/github_search_commits.js';

describe('GitHub Search Commits Tool', () => {
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
    it('should register the GitHub search commits tool', () => {
      registerGitHubSearchCommitsTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'githubSearchCommits',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful commit search', async () => {
      registerGitHubSearchCommitsTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify({
          total_count: 1,
          items: [
            {
              sha: 'abc123',
              commit: {
                message: 'fix: resolve bug',
                author: { name: 'Test Author', date: '2023-01-01T00:00:00Z' },
              },
              repository: {
                full_name: 'owner/repo',
                html_url: 'https://github.com/owner/repo',
              },
              html_url: 'https://github.com/owner/repo/commit/abc123',
            },
          ],
        }),
        command: 'gh search commits fix --limit=25 --json',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        query: 'fix',
      });

      expect(result.isError).toBe(true);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'commits',
          'fix',
          '--json=sha,commit,author,committer,repository,url,parents',
        ],
        { cache: false }
      );
    });

    it('should handle no results found', async () => {
      registerGitHubSearchCommitsTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify({
          total_count: 0,
          items: [],
        }),
        command: 'gh search commits nonexistent --limit=25 --json',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        query: 'nonexistent',
      });

      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('should handle search errors', async () => {
      registerGitHubSearchCommitsTool(mockServer.server);

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Search failed' }],
      });

      const result = await mockServer.callTool('githubSearchCommits', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Search failed');
    });
  });
});

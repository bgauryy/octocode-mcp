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
import { registerGitHubSearchCodeTool } from '../../src/mcp/tools/github_search_code.js';

describe('GitHub Search Code Tool', () => {
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
    it('should register the GitHub search code tool', () => {
      registerGitHubSearchCodeTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'github_search_code',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful code search', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify({
          total_count: 1,
          items: [
            {
              name: 'test.js',
              path: 'src/test.js',
              repository: {
                full_name: 'owner/repo',
                html_url: 'https://github.com/owner/repo',
              },
              html_url: 'https://github.com/owner/repo/blob/main/src/test.js',
            },
          ],
        }),
        command: 'gh search code test --limit=30 --json',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'test',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        ['code', 'test', '--json=repository,path,textMatches,sha,url'],
        { cache: false }
      );
    });

    it('should handle no results found', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify({
          total_count: 0,
          items: [],
        }),
        command: 'gh search code nonexistent --limit=30 --json',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'nonexistent',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.total_count).toBe(0);
    });

    it('should handle search errors', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Search failed' }],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Search failed');
    });
  });
});

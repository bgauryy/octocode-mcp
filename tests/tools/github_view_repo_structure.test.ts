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
import { registerViewRepositoryStructureTool } from '../../src/mcp/tools/github_view_repo_structure.js';

describe('GitHub View Repository Structure Tool', () => {
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
    it('should register the GitHub view repository structure tool', () => {
      registerViewRepositoryStructureTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'github_get_contents',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful repository structure view', async () => {
      registerViewRepositoryStructureTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify([
          {
            name: 'src',
            path: 'src',
            type: 'dir',
            size: 0,
            url: 'https://api.github.com/repos/owner/repo/contents/src',
            download_url: null,
          },
          {
            name: 'README.md',
            path: 'README.md',
            type: 'file',
            size: 1024,
            url: 'https://api.github.com/repos/owner/repo/contents/README.md',
            download_url:
              'https://raw.githubusercontent.com/owner/repo/main/README.md',
          },
        ]),
        command: 'gh api repos/owner/repo/contents',
        type: 'github',
      };

      // Mock the first call to get repo info (for branch fallback)
      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: true,
          content: [{ text: 'Repository info not needed for this test' }],
        })
        // Mock the second call to get contents
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockGitHubResponse) }],
        });

      const result = await mockServer.callTool('github_get_contents', {
        owner: 'owner',
        repo: 'repo',
        branch: 'main',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        ['/repos/owner/repo/contents/?ref=main'],
        { cache: false }
      );
    });

    it('should handle specific directory path', async () => {
      registerViewRepositoryStructureTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify([
          {
            name: 'index.js',
            path: 'src/index.js',
            type: 'file',
            size: 2048,
            url: 'https://api.github.com/repos/owner/repo/contents/src/index.js',
            download_url:
              'https://raw.githubusercontent.com/owner/repo/main/src/index.js',
          },
        ]),
        command: 'gh api repos/owner/repo/contents/src',
        type: 'github',
      };

      // Mock the first call to get repo info (for branch fallback)
      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: true,
          content: [{ text: 'Repository info not needed for this test' }],
        })
        // Mock the second call to get contents
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockGitHubResponse) }],
        });

      const result = await mockServer.callTool('github_get_contents', {
        owner: 'owner',
        repo: 'repo',
        branch: 'main',
        path: 'src',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        ['/repos/owner/repo/contents/src?ref=main'],
        { cache: false }
      );
    });

    it('should handle repository access errors', async () => {
      registerViewRepositoryStructureTool(mockServer.server);

      // Mock a failed API call
      mockExecuteGitHubCommand.mockRejectedValue(new Error('Network error'));

      const result = await mockServer.callTool('github_get_contents', {
        owner: 'nonexistent',
        repo: 'repo',
        branch: 'main',
        path: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to access');
    });
  });
});

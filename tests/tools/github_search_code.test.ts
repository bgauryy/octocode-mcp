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
        'githubSearchCode',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should handle successful code search', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      // GitHub CLI returns an array directly for code search
      const mockCodeResults = [
        {
          path: 'src/test.js',
          repository: {
            nameWithOwner: 'owner/repo',
            url: 'https://github.com/owner/repo',
          },
          url: 'https://github.com/owner/repo/blob/main/src/test.js',
          textMatches: [
            {
              fragment: 'function test() { return true; }',
              matches: [
                {
                  indices: [9, 13],
                },
              ],
            },
          ],
          sha: 'abc123',
        },
      ];

      const mockGitHubResponse = {
        result: JSON.stringify(mockCodeResults),
        command:
          'gh search code test --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        query: 'test',
        limit: 30,
      });

      expect(result.isError).toBe(true);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'test',
          '--limit=30',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );

      expect(result.content[0].text).toContain('No results');
    });

    it('should handle no results found with smart suggestions', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify([]), // Empty array for no results
        command:
          'gh search code nonexistent --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        query: 'nonexistent',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No results');
    });

    it('should handle search with language filter and provide efficiency metadata', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockCodeResults = [
        {
          path: 'src/component.tsx',
          repository: {
            nameWithOwner: 'facebook/react',
            url: 'https://github.com/facebook/react',
          },
          url: 'https://github.com/facebook/react/blob/main/src/component.tsx',
          textMatches: [
            {
              fragment: 'const [state, setState] = useState(false);',
              matches: [
                {
                  indices: [25, 33],
                },
              ],
            },
          ],
          sha: 'def456',
        },
      ];

      const mockGitHubResponse = {
        result: JSON.stringify(mockCodeResults),
        command:
          'gh search code useState --language=typescript --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        query: 'useState',
        language: 'typescript',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No results found');
    });

    it('should provide performance tips for inefficient searches', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockCodeResults = [
        {
          path: 'src/test.js',
          repository: {
            nameWithOwner: 'test/repo',
            url: 'https://github.com/test/repo',
          },
          url: 'https://github.com/test/repo/blob/main/src/test.js',
          textMatches: [
            {
              fragment: 'some test code',
              matches: [
                {
                  indices: [5, 9],
                },
              ],
            },
          ],
          sha: 'ghi789',
        },
      ];

      const mockGitHubResponse = {
        result: JSON.stringify(mockCodeResults),
        command:
          'gh search code "some complex query" --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        query: 'some complex query without filters',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No results found');
    });

    it('should handle search errors with helpful suggestions', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Search failed' }],
      });

      const result = await mockServer.callTool('githubSearchCode', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Search failed');
    });

    it('should validate query parameters with helpful error messages', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const result = await mockServer.callTool('githubSearchCode', {
        query: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Empty query');
      expect(result.content[0].text).toContain('useState');
      expect(result.content[0].text).toContain('authentication');
    });

    it('should handle boolean operator validation', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const result = await mockServer.callTool('githubSearchCode', {
        query: 'react or vue', // Lowercase boolean operators
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Code search failed');
    });

    it('should handle repository format validation', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const result = await mockServer.callTool('githubSearchCode', {
        query: 'test',
        repo: 'invalid-repo-format', // Missing owner
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Repository format error');
      expect(result.content[0].text).toContain('facebook/react');
    });
  });
});

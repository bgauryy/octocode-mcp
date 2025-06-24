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
                  indices: [9, 13]
                }
              ]
            }
          ],
          sha: 'abc123'
        }
      ];

      const mockGitHubResponse = {
        result: JSON.stringify(mockCodeResults),
        command: 'gh search code test --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'test',
        limit: 30,
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        ['code', 'test', '--limit=30', '--json=repository,path,textMatches,sha,url'],
        { cache: false }
      );

      const data = JSON.parse(result.content[0].text as string);
      expect(data.total_count).toBe(1);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].path).toBe('src/test.js');
    });

    it('should handle no results found with smart suggestions', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const mockGitHubResponse = {
        result: JSON.stringify([]), // Empty array for no results
        command: 'gh search code nonexistent --limit=30 --json=repository,path,textMatches,sha,url',
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
      expect(data.smart_suggestions).toBeDefined();
      expect(data.smart_suggestions.message).toContain('No results found');
      expect(data.smart_suggestions.suggestions).toBeInstanceOf(Array);
      expect(data.smart_suggestions.fallback_queries).toBeInstanceOf(Array);
      expect(data.smart_suggestions.next_steps).toBeInstanceOf(Array);
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
                  indices: [25, 33]
                }
              ]
            }
          ],
          sha: 'def456'
        }
      ];

      const mockGitHubResponse = {
        result: JSON.stringify(mockCodeResults),
        command: 'gh search code useState --language=typescript --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState',
        language: 'typescript',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.total_count).toBe(1);
      expect(data.metadata.search_efficiency).toBeDefined();
      expect(data.metadata.search_efficiency.score).toBeGreaterThan(7); // Should be high with language filter
      expect(data.metadata.search_efficiency.factors).toContain('Language filter (+3)');
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
                  indices: [5, 9]
                }
              ]
            }
          ],
          sha: 'ghi789'
        }
      ];

      const mockGitHubResponse = {
        result: JSON.stringify(mockCodeResults),
        command: 'gh search code "some complex query" --limit=30 --json=repository,path,textMatches,sha,url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'some complex query without filters',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.metadata.search_efficiency.score).toBeLessThan(7);
      expect(data.metadata.performance_tips).toBeDefined();
      expect(data.metadata.performance_tips).toContain('🚀 Add language filter - single biggest performance boost');
    });

    it('should handle search errors with helpful suggestions', async () => {
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

    it('should validate query parameters with helpful error messages', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const result = await mockServer.callTool('github_search_code', {
        query: '', // Empty query
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Empty query');
      expect(result.content[0].text).toContain('Try: "useState", "authentication"');
    });

    it('should handle boolean operator validation', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const result = await mockServer.callTool('github_search_code', {
        query: 'react or vue', // Lowercase boolean operators
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Boolean operators must be uppercase');
      expect(result.content[0].text).toContain('OR');
    });

    it('should handle repository format validation', async () => {
      registerGitHubSearchCodeTool(mockServer.server);

      const result = await mockServer.callTool('github_search_code', {
        query: 'test',
        repo: 'invalid-repo-format', // Missing owner
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Repository format error');
      expect(result.content[0].text).toContain('facebook/react');
    });
  });
});

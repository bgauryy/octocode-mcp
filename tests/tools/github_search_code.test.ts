import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

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
  let mockServer: McpServer;

  beforeEach(() => {
    // Create a mock server with a tool method
    mockServer = {
      tool: vi.fn(),
    } as any;

    // Clear all mocks
    vi.clearAllMocks();

    // Default implementation for withCache - just execute the function
    mockWithCache.mockImplementation(
      async (key: string, fn: () => Promise<CallToolResult>) => fn()
    );

    // Default cache key generation
    mockGenerateCacheKey.mockReturnValue('test-cache-key');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search code tool with correct parameters', () => {
      registerGitHubSearchCodeTool(mockServer);

      expect(mockServer.tool).toHaveBeenCalledWith(
        'github_search_code',
        expect.any(String),
        expect.objectContaining({
          query: expect.any(Object),
          owner: expect.any(Object),
          repo: expect.any(Object),
          language: expect.any(Object),
          extension: expect.any(Object),
          filename: expect.any(Object),
          path: expect.any(Object),
          size: expect.any(Object),
          visibility: expect.any(Object),
          limit: expect.any(Object),
          match: expect.any(Object),
        }),
        expect.objectContaining({
          title: 'github_search_code',
          description: expect.stringContaining('SEMANTIC CODE DISCOVERY'),
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        }),
        expect.any(Function)
      );
    });
  });

  describe('Successful Code Searches', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerGitHubSearchCodeTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should perform basic code search', async () => {
      const mockSearchResults = [
        {
          repository: { full_name: 'facebook/react', name: 'react' },
          path: 'packages/react/src/React.js',
          textMatches: [{ fragment: 'function Component() {}' }],
          sha: 'abc123',
          url: 'https://github.com/facebook/react/blob/main/packages/react/src/React.js',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockSearchResults),
              command: 'gh search code react component',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: 'react component',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.query).toBe('react component');
      expect(data.total_count).toBe(1);
      expect(data.items).toEqual(mockSearchResults);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'react component',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should handle complex queries with boolean operators', async () => {
      const mockSearchResults = [
        {
          repository: { full_name: 'microsoft/vscode', name: 'vscode' },
          path: 'src/vs/editor/editor.api.ts',
          textMatches: [{ fragment: 'export interface IEditor' }],
          sha: 'def456',
          url: 'https://github.com/microsoft/vscode/blob/main/src/vs/editor/editor.api.ts',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockSearchResults),
              command: 'gh search code "editor AND typescript NOT test"',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: 'editor AND typescript NOT test',
        language: 'typescript',
        path: 'src/',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'editor AND typescript NOT test path:src/',
          '--language=typescript',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should handle owner and repository filters', async () => {
      const mockSearchResults = [
        {
          repository: { full_name: 'facebook/react', name: 'react' },
          path: 'packages/react-dom/src/client/ReactDOM.js',
          textMatches: [{ fragment: 'function render(element, container)' }],
          sha: 'ghi789',
          url: 'https://github.com/facebook/react/blob/main/packages/react-dom/src/client/ReactDOM.js',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockSearchResults),
              command: 'gh search code render function',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: 'render function',
        owner: 'facebook',
        repo: ['react'],
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'render function',
          '--repo=facebook/react',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should handle multiple owners and repositories', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
              command: 'gh search code test',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'test',
        owner: ['facebook', 'microsoft'],
        repo: ['react', 'vscode'],
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'test',
          '--repo=facebook/react',
          '--repo=facebook/vscode',
          '--repo=microsoft/react',
          '--repo=microsoft/vscode',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should handle all filter parameters', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
              command: 'gh search code config',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'config',
        language: 'javascript',
        extension: 'json',
        filename: 'package.json',
        path: 'src/',
        size: '>100',
        visibility: 'public',
        limit: 10,
        match: 'file',
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'config path:src/ visibility:public',
          '--language=javascript',
          '--extension=json',
          '--filename=package.json',
          '--size=>100',
          '--limit=10',
          '--match=file',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should handle match parameter as array', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
              command: 'gh search code test',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'test',
        match: ['file', 'path'], // Should use first value due to GitHub API limitation
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'test',
          '--match=file', // Only first value used
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should handle owner without repo (global search with owner filter)', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
              command: 'gh search code test',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'test',
        owner: ['facebook', 'microsoft'],
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'test',
          '--owner=facebook',
          '--owner=microsoft',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should handle repo parameter with owner/repo format', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
              command: 'gh search code test',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'test',
        owner: 'facebook',
        repo: ['facebook/react', 'jest'], // Mixed formats
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'test',
          '--repo=facebook/react', // Already has owner
          '--repo=facebook/jest', // Owner added
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should handle repo parameter as single string', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
              command: 'gh search code test',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'test',
        owner: 'facebook',
        repo: 'react', // Single string instead of array
      });

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        [
          'code',
          'test',
          '--repo=facebook/react',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });
  });

  describe('Empty Results', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerGitHubSearchCodeTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should handle empty search results', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
              command: 'gh search code nonexistent',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: 'nonexistent-code-pattern',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.total_count).toBe(0);
      expect(data.items).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerGitHubSearchCodeTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should handle GitHub CLI execution errors', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'GitHub CLI error: Authentication required' }],
      });

      const result = await toolHandler({
        query: 'test code',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('GitHub CLI error');
    });

    it('should handle malformed JSON responses', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: 'invalid json response',
          },
        ],
      });

      const result = await toolHandler({
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Code search failed');
    });

    it('should handle network timeout errors', async () => {
      const timeoutError = new Error('Network timeout');
      mockExecuteGitHubCommand.mockRejectedValue(timeoutError);

      const result = await toolHandler({
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Failed to execute search command'
      );
    });
  });

  describe('Input Validation', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerGitHubSearchCodeTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should require owner when repo is specified', async () => {
      const result = await toolHandler({
        query: 'test',
        repo: ['react'],
        // owner is missing
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Repository search requires owner parameter'
      );
    });

    it('should accept repo without owner for global search', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
              command: 'gh search code test',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: 'test',
        // No repo or owner specified - global search
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('Caching', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerGitHubSearchCodeTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should use cache for code searches', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
              command: 'gh search code test',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'test code',
        language: 'javascript',
      });

      expect(mockGenerateCacheKey).toHaveBeenCalledWith('gh-code', {
        query: 'test code',
        language: 'javascript',
      });
      expect(mockWithCache).toHaveBeenCalledWith(
        'test-cache-key',
        expect.any(Function)
      );
    });

    it('should generate different cache keys for different parameters', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
              command: 'gh search code test',
              type: 'github',
            }),
          },
        ],
      });

      // First search
      await toolHandler({
        query: 'test',
        language: 'javascript',
      });

      // Second search with different parameters
      await toolHandler({
        query: 'test',
        language: 'python',
      });

      expect(mockGenerateCacheKey).toHaveBeenCalledTimes(2);
      expect(mockGenerateCacheKey).toHaveBeenNthCalledWith(1, 'gh-code', {
        query: 'test',
        language: 'javascript',
      });
      expect(mockGenerateCacheKey).toHaveBeenNthCalledWith(2, 'gh-code', {
        query: 'test',
        language: 'python',
      });
    });
  });
});

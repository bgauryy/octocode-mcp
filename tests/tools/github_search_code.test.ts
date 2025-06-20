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
          description: expect.stringContaining(
            'Search code across GitHub repositories'
          ),
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        }),
        expect.any(Function)
      );
    });
  });

  describe('Search Logic Modes', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerGitHubSearchCodeTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    describe('Mode 1: Exact String Matching', () => {
      it('should handle exact phrases with double quotes', async () => {
        const mockSearchResults = [
          {
            repository: { full_name: 'facebook/react', name: 'react' },
            path: 'packages/react/src/React.js',
            textMatches: [{ fragment: 'import React from "react"' }],
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
                command: 'gh search code',
                type: 'github',
              }),
            },
          ],
        });

        const result = await toolHandler({
          query: '"import React"',
        });

        expect(result.isError).toBe(false);
        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          expect.arrayContaining([
            'code',
            '"import React"',
            '--json=repository,path,textMatches,sha,url',
          ]),
          { cache: false }
        );
      });

      it('should handle multiple exact phrases in one query', async () => {
        const mockSearchResults = [];

        mockExecuteGitHubCommand.mockResolvedValue({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: JSON.stringify(mockSearchResults),
                command: 'gh search code',
                type: 'github',
              }),
            },
          ],
        });

        const result = await toolHandler({
          query: '"function Component" AND "export default"',
        });

        expect(result.isError).toBe(false);
        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          expect.arrayContaining([
            'code',
            '"function Component" AND "export default"',
            '--json=repository,path,textMatches,sha,url',
          ]),
          { cache: false }
        );
      });
    });

    describe('Mode 2: Boolean Operators', () => {
      it('should handle AND operator', async () => {
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
                command: 'gh search code',
                type: 'github',
              }),
            },
          ],
        });

        const result = await toolHandler({
          query: 'react AND component',
        });

        expect(result.isError).toBe(false);
        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          expect.arrayContaining([
            'code',
            'react AND component',
            '--json=repository,path,textMatches,sha,url',
          ]),
          { cache: false }
        );
      });

      it('should handle OR operator', async () => {
        const mockSearchResults = [];

        mockExecuteGitHubCommand.mockResolvedValue({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: JSON.stringify(mockSearchResults),
                command: 'gh search code',
                type: 'github',
              }),
            },
          ],
        });

        const result = await toolHandler({
          query: 'vue OR angular',
        });

        expect(result.isError).toBe(false);
        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          expect.arrayContaining([
            'code',
            'vue OR angular',
            '--json=repository,path,textMatches,sha,url',
          ]),
          { cache: false }
        );
      });

      it('should handle NOT operator', async () => {
        const mockSearchResults = [];

        mockExecuteGitHubCommand.mockResolvedValue({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: JSON.stringify(mockSearchResults),
                command: 'gh search code',
                type: 'github',
              }),
            },
          ],
        });

        const result = await toolHandler({
          query: 'javascript NOT test',
        });

        expect(result.isError).toBe(false);
        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          expect.arrayContaining([
            'code',
            'javascript NOT test',
            '--json=repository,path,textMatches,sha,url',
          ]),
          { cache: false }
        );
      });

      it('should handle complex boolean expressions with exact phrases', async () => {
        const mockSearchResults = [];

        mockExecuteGitHubCommand.mockResolvedValue({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: JSON.stringify(mockSearchResults),
                command: 'gh search code',
                type: 'github',
              }),
            },
          ],
        });

        const result = await toolHandler({
          query: '"import React" AND component NOT test',
          language: 'typescript',
          path: 'src/',
        });

        expect(result.isError).toBe(false);
        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          expect.arrayContaining([
            'code',
            '"import React" AND component NOT test path:src/ language:typescript',
            '--json=repository,path,textMatches,sha,url',
          ]),
          { cache: false }
        );
      });

      it('should demonstrate smart OR logic with user example (mountState updateState)', async () => {
        const mockSearchResults = [];

        mockExecuteGitHubCommand.mockResolvedValue({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: JSON.stringify(mockSearchResults),
                command: 'gh search code',
                type: 'github',
              }),
            },
          ],
        });

        const result = await toolHandler({
          query: 'mountState updateState',
          owner: 'facebook',
          repo: 'react',
          language: 'javascript',
          limit: 10,
        });

        expect(result.isError).toBe(false);
        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          expect.arrayContaining([
            'code',
            'mountState OR updateState language:javascript',
            '--limit=10',
            '--repo=facebook/react',
            '--json=repository,path,textMatches,sha,url',
          ]),
          { cache: false }
        );
      });
    });

    describe('Mode 3: Advanced Filters', () => {
      it('should apply CLI flags for simple queries without boolean logic', async () => {
        const mockSearchResults = [];

        mockExecuteGitHubCommand.mockResolvedValue({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: JSON.stringify(mockSearchResults),
                command: 'gh search code',
                type: 'github',
              }),
            },
          ],
        });

        const result = await toolHandler({
          query: 'component',
          language: 'javascript',
          extension: 'js',
          filename: 'index.js',
          size: '>100',
          limit: 20,
        });

        expect(result.isError).toBe(false);
        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          expect.arrayContaining([
            'code',
            'component',
            '--language=javascript',
            '--extension=js',
            '--filename=index.js',
            '--size=>100',
            '--limit=20',
            '--json=repository,path,textMatches,sha,url',
          ]),
          { cache: false }
        );
      });

      it('should embed filters in query for complex boolean logic', async () => {
        const mockSearchResults = [];

        mockExecuteGitHubCommand.mockResolvedValue({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: JSON.stringify(mockSearchResults),
                command: 'gh search code',
                type: 'github',
              }),
            },
          ],
        });

        const result = await toolHandler({
          query: 'react AND component OR vue',
          language: 'typescript',
          extension: 'ts',
          path: 'src/',
          visibility: 'public',
        });

        expect(result.isError).toBe(false);
        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          expect.arrayContaining([
            'code',
            'react AND component OR vue path:src/ visibility:public language:typescript extension:ts',
            '--json=repository,path,textMatches,sha,url',
          ]),
          { cache: false }
        );
      });

      it('should handle path and visibility filters correctly', async () => {
        const mockSearchResults = [];

        mockExecuteGitHubCommand.mockResolvedValue({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: JSON.stringify(mockSearchResults),
                command: 'gh search code',
                type: 'github',
              }),
            },
          ],
        });

        const result = await toolHandler({
          query: 'function',
          path: 'components/',
          visibility: 'private',
        });

        expect(result.isError).toBe(false);
        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          expect.arrayContaining([
            'code',
            'function path:components/ visibility:private',
            '--json=repository,path,textMatches,sha,url',
          ]),
          { cache: false }
        );
      });
    });

    describe('Repository and Owner Filters', () => {
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
          repo: 'react',
        });

        expect(result.isError).toBe(false);
        const data = JSON.parse(result.content[0].text as string);
        expect(data.query).toBe('render function');
        expect(data.total_count).toBe(1);
        expect(data.items).toEqual(mockSearchResults);

        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          expect.arrayContaining([
            'code',
            'render OR function',
            '--repo=facebook/react',
            '--json=repository,path,textMatches,sha,url',
          ]),
          { cache: false }
        );
      });

      it('should handle multiple owners and repositories', async () => {
        const mockSearchResults = [];

        mockExecuteGitHubCommand.mockResolvedValue({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: JSON.stringify(mockSearchResults),
                command: 'gh search code',
                type: 'github',
              }),
            },
          ],
        });

        const result = await toolHandler({
          query: 'component',
          owner: ['facebook', 'microsoft'],
          repo: ['react', 'vscode'],
        });

        expect(result.isError).toBe(false);
        expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
          'search',
          expect.arrayContaining([
            'code',
            'component',
            '--repo=facebook/react',
            '--repo=facebook/vscode',
            '--repo=microsoft/react',
            '--repo=microsoft/vscode',
            '--json=repository,path,textMatches,sha,url',
          ]),
          { cache: false }
        );
      });
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
          'react OR component',
          '--json=repository,path,textMatches,sha,url',
        ],
        { cache: false }
      );
    });

    it('should handle all filter parameters', async () => {
      const mockSearchResults = [];

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockSearchResults),
              command: 'gh search code',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: 'test function',
        language: 'python',
        extension: 'py',
        filename: 'test.py',
        path: 'tests/',
        size: '<100',
        limit: 10,
        match: 'file',
        visibility: 'public',
        owner: 'pytest-dev',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining([
          'code',
          'test OR function path:tests/ visibility:public language:python extension:py filename:test.py size:<100',
          '--limit=10',
          '--match=file',
          '--owner=pytest-dev',
          '--json=repository,path,textMatches,sha,url',
        ]),
        { cache: false }
      );
    });

    it('should handle match parameter as array', async () => {
      const mockSearchResults = [];

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockSearchResults),
              command: 'gh search code',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: 'search term',
        match: ['file', 'path'],
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining([
          'code',
          'search OR term',
          '--match=file',
          '--json=repository,path,textMatches,sha,url',
        ]),
        { cache: false }
      );
    });

    it('should handle owner without repo (global search with owner filter)', async () => {
      const mockSearchResults = [];

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockSearchResults),
              command: 'gh search code',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: 'function',
        owner: 'microsoft',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining([
          'code',
          'function',
          '--owner=microsoft',
          '--json=repository,path,textMatches,sha,url',
        ]),
        { cache: false }
      );
    });

    it('should handle repo parameter with owner/repo format', async () => {
      const mockSearchResults = [];

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockSearchResults),
              command: 'gh search code',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: 'function',
        owner: 'facebook',
        repo: 'facebook/react',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining([
          'code',
          'function',
          '--repo=facebook/react',
          '--json=repository,path,textMatches,sha,url',
        ]),
        { cache: false }
      );
    });

    it('should handle repo parameter as single string', async () => {
      const mockSearchResults = [];

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockSearchResults),
              command: 'gh search code',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: 'function',
        owner: 'facebook',
        repo: 'react',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'search',
        expect.arrayContaining([
          'code',
          'function',
          '--repo=facebook/react',
          '--json=repository,path,textMatches,sha,url',
        ]),
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
              command: 'gh search code',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: 'nonexistent code pattern',
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
        content: [{ text: 'GitHub CLI error: Authentication failed' }],
      });

      const result = await toolHandler({
        query: 'test search',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Authentication failed');
    });

    it('should handle malformed JSON responses', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: 'Invalid JSON response',
          },
        ],
      });

      const result = await toolHandler({
        query: 'test search',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('GitHub code search failed');
    });

    it('should handle network timeout errors', async () => {
      mockExecuteGitHubCommand.mockRejectedValue(new Error('Network timeout'));

      const result = await toolHandler({
        query: 'test search',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Network timeout');
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
        query: 'test search',
        repo: 'react',
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
              command: 'gh search code',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        query: 'test search',
        owner: 'facebook',
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
              command: 'gh search code',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'test search',
      });

      expect(mockGenerateCacheKey).toHaveBeenCalledWith('gh-code', {
        query: 'test search',
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
              command: 'gh search code',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        query: 'test search',
        language: 'javascript',
      });

      expect(mockGenerateCacheKey).toHaveBeenCalledWith('gh-code', {
        query: 'test search',
        language: 'javascript',
      });
    });
  });
});

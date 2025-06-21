import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteNpmCommand = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeNpmCommand: mockExecuteNpmCommand,
}));

// Import after mocking
import { registerNpmSearchTool } from '../../src/mcp/tools/npm_package_search.js';

describe('NPM Package Search Tool', () => {
  let mockServer: McpServer;

  beforeEach(() => {
    // Create a mock server with a registerTool method
    mockServer = {
      registerTool: vi.fn(),
    } as any;

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the NPM package search tool with correct parameters', () => {
      registerNpmSearchTool(mockServer);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'npm_package_search',
        expect.objectContaining({
          description: expect.any(String),
          inputSchema: expect.any(Object),
          annotations: expect.any(Object),
        }),
        expect.any(Function)
      );
    });
  });

  describe('Successful Package Searches', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerNpmSearchTool(mockServer);
      toolHandler = (mockServer.registerTool as any).mock.calls[0][2];
    });

    it('should search for packages with single query', async () => {
      const mockNpmResponse = {
        result: JSON.stringify([
          {
            name: 'react',
            version: '18.2.0',
            description:
              'React is a JavaScript library for building user interfaces.',
            keywords: ['react', 'ui', 'framework'],
            links: { repository: 'https://github.com/facebook/react' },
          },
          {
            name: 'react-dom',
            version: '18.2.0',
            description: 'React package for working with the DOM.',
            keywords: ['react', 'dom'],
            links: { repository: 'https://github.com/facebook/react' },
          },
        ]),
        command: 'npm search react --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        queries: 'react',
        searchlimit: 15,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.query).toBe('react');
      expect(data.total).toBe(2);
      expect(data.results).toHaveLength(2);
      expect(data.results[0]).toEqual({
        name: 'react',
        version: '18.2.0',
        description:
          'React is a JavaScript library for building user interfaces.',
        keywords: ['react', 'ui', 'framework'],
        repository: 'https://github.com/facebook/react',
      });

      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        ['react', '--searchlimit=15', '--json'],
        { cache: true }
      );
    });

    it('should search for packages with multiple queries', async () => {
      const mockReactResponse = {
        result: JSON.stringify([
          {
            name: 'react',
            version: '18.2.0',
            description: 'React library',
            keywords: ['react'],
            links: { repository: 'https://github.com/facebook/react' },
          },
        ]),
        command: 'npm search react --searchlimit=15 --json',
        type: 'npm',
      };

      const mockVueResponse = {
        result: JSON.stringify([
          {
            name: 'vue',
            version: '3.3.4',
            description: 'Vue.js framework',
            keywords: ['vue'],
            links: { repository: 'https://github.com/vuejs/core' },
          },
        ]),
        command: 'npm search vue --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockReactResponse) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockVueResponse) }],
        });

      const result = await toolHandler({
        queries: ['react', 'vue'],
        searchlimit: 15,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.query).toBe('react, vue');
      expect(data.total).toBe(2);
      expect(data.results).toHaveLength(2);

      expect(mockExecuteNpmCommand).toHaveBeenCalledTimes(2);
      expect(mockExecuteNpmCommand).toHaveBeenNthCalledWith(
        1,
        'search',
        ['react', '--searchlimit=15', '--json'],
        { cache: true }
      );
      expect(mockExecuteNpmCommand).toHaveBeenNthCalledWith(
        2,
        'search',
        ['vue', '--searchlimit=15', '--json'],
        { cache: true }
      );
    });

    it('should handle npm search objects format', async () => {
      const mockNpmResponse = {
        result: JSON.stringify({
          objects: [
            {
              package: {
                name: 'lodash',
                version: '4.17.21',
                description: 'Lodash modular utilities.',
                keywords: ['modules', 'stdlib', 'util'],
                links: { repository: 'https://github.com/lodash/lodash' },
              },
            },
          ],
        }),
        command: 'npm search lodash --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        queries: 'lodash',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].name).toBe('lodash');
      expect(data.results[0].version).toBe('4.17.21');
    });

    it('should handle npm search results format', async () => {
      const mockNpmResponse = {
        result: JSON.stringify({
          results: [
            {
              name: 'express',
              version: '4.18.2',
              description: 'Fast, unopinionated, minimalist web framework',
              keywords: ['framework', 'web', 'http'],
              repository: { url: 'https://github.com/expressjs/express' },
            },
          ],
        }),
        command: 'npm search express --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        queries: 'express',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].name).toBe('express');
      expect(data.results[0].repository).toBe(
        'https://github.com/expressjs/express'
      );
    });

    it('should use default search limit when not specified', async () => {
      const mockNpmResponse = {
        result: JSON.stringify([]),
        command: 'npm search test --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      await toolHandler({
        queries: 'test',
      });

      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        ['test', '--searchlimit=15', '--json'],
        { cache: true }
      );
    });

    it('should truncate long descriptions', async () => {
      const longDescription = 'A'.repeat(150); // 150 characters
      const mockNpmResponse = {
        result: JSON.stringify([
          {
            name: 'long-description-package',
            version: '1.0.0',
            description: longDescription,
            keywords: ['test'],
            links: { repository: 'https://github.com/test/repo' },
          },
        ]),
        command: 'npm search test --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        queries: 'test',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].description).toHaveLength(83); // 80 + '...'
      expect(data.results[0].description).toContain('...');
    });

    it('should limit keywords to maximum of 10', async () => {
      const manyKeywords = Array.from({ length: 15 }, (_, i) => `keyword${i}`);
      const mockNpmResponse = {
        result: JSON.stringify([
          {
            name: 'many-keywords-package',
            version: '1.0.0',
            description: 'Package with many keywords',
            keywords: manyKeywords,
            links: { repository: 'https://github.com/test/repo' },
          },
        ]),
        command: 'npm search test --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        queries: 'test',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].keywords).toHaveLength(8);
      expect(data.results[0].keywords).toEqual(manyKeywords.slice(0, 8));
    });

    it('should handle packages with missing optional fields', async () => {
      const mockNpmResponse = {
        result: JSON.stringify([
          {
            name: 'minimal-package',
            // Missing version, description, keywords, repository
          },
        ]),
        command: 'npm search test --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        queries: 'test',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0]).toEqual({
        name: 'minimal-package',
        version: '',
        description: null,
        keywords: [],
        repository: null,
      });
    });
  });

  describe('Package Deduplication', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerNpmSearchTool(mockServer);
      toolHandler = (mockServer.registerTool as any).mock.calls[0][2];
    });

    it('should deduplicate packages with same name from multiple queries', async () => {
      const mockReactResponse = {
        result: JSON.stringify([
          {
            name: 'react',
            version: '18.2.0',
            description: 'React library',
            keywords: ['react'],
            links: { repository: 'https://github.com/facebook/react' },
          },
          {
            name: 'react-dom',
            version: '18.2.0',
            description: 'React DOM library',
            keywords: ['react', 'dom'],
            links: { repository: 'https://github.com/facebook/react' },
          },
        ]),
        command: 'npm search react --searchlimit=15 --json',
        type: 'npm',
      };

      const mockUIResponse = {
        result: JSON.stringify([
          {
            name: 'react', // Duplicate
            version: '18.2.0',
            description: 'React library',
            keywords: ['react'],
            links: { repository: 'https://github.com/facebook/react' },
          },
          {
            name: 'vue',
            version: '3.3.4',
            description: 'Vue.js framework',
            keywords: ['vue'],
            links: { repository: 'https://github.com/vuejs/core' },
          },
        ]),
        command: 'npm search ui --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockReactResponse) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockUIResponse) }],
        });

      const result = await toolHandler({
        queries: ['react', 'ui'],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.total).toBe(3); // react, react-dom, vue (react deduplicated)

      const packageNames = data.results.map((pkg: any) => pkg.name);
      expect(packageNames).toEqual(['react', 'react-dom', 'vue']);
    });
  });

  describe('Error Handling', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerNpmSearchTool(mockServer);
      toolHandler = (mockServer.registerTool as any).mock.calls[0][2];
    });

    it('should handle npm command errors', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'npm ERR! network timeout' }],
      });

      const result = await toolHandler({
        queries: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No packages found');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network timeout');
      mockExecuteNpmCommand.mockRejectedValue(networkError);

      const result = await toolHandler({
        queries: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Search failed - check keywords or try alternatives'
      );
    });

    it('should handle malformed JSON responses', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: 'invalid json response' }],
      });

      const result = await toolHandler({
        queries: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No packages found');
    });

    it('should handle empty search results', async () => {
      const mockNpmResponse = {
        result: JSON.stringify([]),
        command: 'npm search nonexistent --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        queries: 'nonexistent',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No packages found');
    });

    it('should handle missing content in npm response', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [],
      });

      const result = await toolHandler({
        queries: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No packages found');
    });
  });

  describe('Input Validation', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerNpmSearchTool(mockServer);
      toolHandler = (mockServer.registerTool as any).mock.calls[0][2];
    });

    it('should handle string query input', async () => {
      const mockNpmResponse = {
        result: JSON.stringify([
          {
            name: 'test-package',
            version: '1.0.0',
            description: 'Test package',
            keywords: ['test'],
            links: { repository: 'https://github.com/test/repo' },
          },
        ]),
        command: 'npm search test --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        queries: 'test',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        ['test', '--searchlimit=15', '--json'],
        { cache: true }
      );
    });

    it('should handle array query input', async () => {
      const mockNpmResponse1 = {
        result: JSON.stringify([
          {
            name: 'test1-package',
            version: '1.0.0',
            description: 'Test package 1',
            keywords: ['test'],
            links: { repository: 'https://github.com/test/repo1' },
          },
        ]),
        command: 'npm search test1 --searchlimit=15 --json',
        type: 'npm',
      };

      const mockNpmResponse2 = {
        result: JSON.stringify([
          {
            name: 'test2-package',
            version: '1.0.0',
            description: 'Test package 2',
            keywords: ['test'],
            links: { repository: 'https://github.com/test/repo2' },
          },
        ]),
        command: 'npm search test2 --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse1) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ text: JSON.stringify(mockNpmResponse2) }],
        });

      const result = await toolHandler({
        queries: ['test1', 'test2'],
      });
      expect(result.isError).toBe(false);

      expect(mockExecuteNpmCommand).toHaveBeenCalledTimes(2);
      expect(mockExecuteNpmCommand).toHaveBeenNthCalledWith(
        1,
        'search',
        ['test1', '--searchlimit=15', '--json'],
        { cache: true }
      );
      expect(mockExecuteNpmCommand).toHaveBeenNthCalledWith(
        2,
        'search',
        ['test2', '--searchlimit=15', '--json'],
        { cache: true }
      );
    });

    it('should respect custom search limit', async () => {
      const mockNpmResponse = {
        result: JSON.stringify([]),
        command: 'npm search test --searchlimit=5 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      await toolHandler({
        queries: 'test',
        searchlimit: 5,
      });

      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        ['test', '--searchlimit=5', '--json'],
        { cache: true }
      );
    });

    it('should handle edge case search limits', async () => {
      const mockNpmResponse = {
        result: JSON.stringify([]),
        command: 'npm search test --searchlimit=1 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      // Test minimum limit
      await toolHandler({
        queries: 'test',
        searchlimit: 1,
      });

      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        ['test', '--searchlimit=1', '--json'],
        { cache: true }
      );

      // Test maximum limit
      mockExecuteNpmCommand.mockClear();
      const mockMaxResponse = {
        result: JSON.stringify([]),
        command: 'npm search test --searchlimit=50 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockMaxResponse) }],
      });

      await toolHandler({
        queries: 'test',
        searchlimit: 50,
      });

      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        ['test', '--searchlimit=50', '--json'],
        { cache: true }
      );
    });
  });

  describe('Response Parsing', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerNpmSearchTool(mockServer);
      toolHandler = (mockServer.registerTool as any).mock.calls[0][2];
    });

    it('should handle nested JSON result strings', async () => {
      const mockNpmResponse = {
        result: JSON.stringify([
          {
            name: 'nested-test',
            version: '1.0.0',
            description: 'Test nested parsing',
            keywords: ['test'],
            links: { repository: 'https://github.com/test/repo' },
          },
        ]),
        command: 'npm search test --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        queries: 'test',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].name).toBe('nested-test');
    });

    it('should handle direct result objects', async () => {
      const mockNpmResponse = {
        result: [
          {
            name: 'direct-result',
            version: '1.0.0',
            description: 'Direct result object',
            keywords: ['test'],
            links: { repository: 'https://github.com/test/repo' },
          },
        ],
        command: 'npm search test --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        queries: 'test',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].name).toBe('direct-result');
    });

    it('should handle objects without package wrapper', async () => {
      const mockNpmResponse = {
        result: JSON.stringify({
          objects: [
            {
              // No package wrapper, object is the package itself
              name: 'no-wrapper',
              version: '1.0.0',
              description: 'No package wrapper',
              keywords: ['test'],
              links: { repository: 'https://github.com/test/repo' },
            },
          ],
        }),
        command: 'npm search test --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        queries: 'test',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.results[0].name).toBe('no-wrapper');
    });

    it('should gracefully handle completely invalid JSON', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: 'completely invalid json {{{' }],
      });

      const result = await toolHandler({
        queries: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No packages found');
    });
  });

  describe('Caching', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerNpmSearchTool(mockServer);
      toolHandler = (mockServer.registerTool as any).mock.calls[0][2];
    });

    it('should use caching for npm search commands', async () => {
      const mockNpmResponse = {
        result: JSON.stringify([]),
        command: 'npm search test --searchlimit=15 --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      await toolHandler({
        queries: 'test',
      });

      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'search',
        ['test', '--searchlimit=15', '--json'],
        { cache: true }
      );
    });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface CallToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// Mock the GitHub client
const mockOctokit = vi.hoisted(() => ({
  rest: {
    search: {
      code: vi.fn(),
    },
  },
}));

vi.mock('../../src/github/client.js', () => ({
  getOctokit: vi.fn(() => mockOctokit),
}));

// Mock the cache to prevent interference
vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(() => 'test-cache-key'),
  withDataCache: vi.fn(async (_key: string, fn: () => unknown) => {
    return await fn();
  }),
}));

vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
}));

// Import after mocking
import { registerGitHubSearchCodeTool } from '../../src/tools/github_search_code.js';

describe('GitHub Search Code Tool - Filtering at Tool Level', () => {
  let server: McpServer;
  let toolHandler: (
    args: unknown,
    authInfo: unknown,
    userContext: unknown
  ) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock server
    server = {
      registerTool: vi.fn((_name, _schema, handler) => {
        toolHandler = handler;
        return Promise.resolve();
      }),
    } as unknown as McpServer;

    // Register the tool
    registerGitHubSearchCodeTool(server);
  });

  describe('Double filtering - both API and tool level', () => {
    it('should apply filtering at both codeSearch.ts and tool level', async () => {
      // Mock API response with files that should be filtered at different levels
      const mockResponse = {
        data: {
          total_count: 5,
          items: [
            {
              name: 'index.js',
              path: 'src/index.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [
                {
                  fragment: 'function test() {}',
                  matches: [{ indices: [0, 8] }],
                },
              ],
            },
            // This should be filtered at codeSearch.ts level
            {
              name: 'lodash.js',
              path: 'node_modules/lodash/lodash.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [
                {
                  fragment: 'function lodash() {}',
                  matches: [{ indices: [0, 8] }],
                },
              ],
            },
            // This should be filtered at codeSearch.ts level
            {
              name: 'package-lock.json',
              path: 'package-lock.json',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
            {
              name: 'component.js',
              path: 'src/components/component.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [
                {
                  fragment: 'const Component = () => {}',
                  matches: [{ indices: [0, 5] }],
                },
              ],
            },
            // This should be filtered at codeSearch.ts level
            {
              name: 'test.min.js',
              path: 'dist/test.min.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      // Call the tool handler directly
      const result = await toolHandler(
        {
          queries: [
            {
              keywordsToSearch: ['function'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      // Parse the result
      const resultText = (result as CallToolResult).content[0]!.text;

      // Should have filtered results
      expect(resultText).toContain('data:');
      expect(resultText).toContain('src/index.js');
      expect(resultText).toContain('src/components/component.js');
    });

    it('should handle empty results after filtering at tool level', async () => {
      // Mock API response where all files get filtered out
      const mockResponse = {
        data: {
          total_count: 3,
          items: [
            {
              name: 'package-lock.json',
              path: 'package-lock.json',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
            {
              name: 'yarn.lock',
              path: 'yarn.lock',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
            {
              name: 'Cargo.lock',
              path: 'Cargo.lock',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      // Call the tool handler
      const result = await toolHandler(
        {
          queries: [
            {
              keywordsToSearch: ['lock'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      // Parse the result
      const resultText = (result as CallToolResult).content[0]!.text;

      // Should have result with no files
      expect(resultText).toContain('data:');
      expect(resultText).toContain('files: []');
      expect(resultText).toContain('hints:');
      expect(resultText).toContain('broader');
    });

    it('should filter vendor and third-party directories', async () => {
      const mockResponse = {
        data: {
          total_count: 4,
          items: [
            {
              name: 'utils.js',
              path: 'src/utils.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
            {
              name: 'jquery.js',
              path: 'vendor/jquery/jquery.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
            {
              name: 'bootstrap.js',
              path: 'third_party/bootstrap/bootstrap.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
            {
              name: 'helper.js',
              path: 'src/helper.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await toolHandler(
        {
          queries: [
            {
              keywordsToSearch: ['js'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const resultText = (result as CallToolResult).content[0]!.text;

      // Should only include source files, not vendor/third_party
      expect(resultText).toContain('data:');
      expect(resultText).toContain('src/utils.js');
      expect(resultText).toContain('src/helper.js');
      expect(resultText).not.toContain('vendor/jquery/jquery.js');
      expect(resultText).not.toContain('third_party/bootstrap/bootstrap.js');
    });

    it('should filter build and dist directories', async () => {
      const mockResponse = {
        data: {
          total_count: 5,
          items: [
            {
              name: 'app.js',
              path: 'src/app.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
            {
              name: 'bundle.js',
              path: 'dist/bundle.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
            {
              name: 'main.js',
              path: 'build/main.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
            {
              name: 'output.js',
              path: 'out/output.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
            {
              name: 'index.js',
              path: 'src/index.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await toolHandler(
        {
          queries: [
            {
              keywordsToSearch: ['javascript'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const resultText = (result as CallToolResult).content[0]!.text;

      // Should only include source files, not build output
      expect(resultText).toContain('data:');
      expect(resultText).toContain('src/app.js');
      expect(resultText).toContain('src/index.js');
      expect(resultText).not.toContain('dist/bundle.js');
      expect(resultText).not.toContain('build/main.js');
      expect(resultText).not.toContain('out/output.js');
    });

    it('should handle multiple queries with filtering', async () => {
      // First query response
      const mockResponse1 = {
        data: {
          total_count: 2,
          items: [
            {
              name: 'component.js',
              path: 'src/component.js',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
            {
              name: 'test.log',
              path: 'logs/test.log',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
          ],
        },
      };

      // Second query response
      const mockResponse2 = {
        data: {
          total_count: 2,
          items: [
            {
              name: 'utils.ts',
              path: 'src/utils.ts',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
            {
              name: '.env',
              path: '.env',
              repository: {
                full_name: 'test/repo',
                url: 'https://api.github.com/repos/test/repo',
              },
              text_matches: [],
            },
          ],
        },
      };

      mockOctokit.rest.search.code
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const result = await toolHandler(
        {
          queries: [
            {
              id: 'query1',
              keywordsToSearch: ['component'],
              owner: 'test',
              repo: 'repo',
            },
            {
              id: 'query2',
              keywordsToSearch: ['utils'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const resultText = (result as CallToolResult).content[0]!.text;

      // Should have both query results
      expect(resultText).toContain('data:');
      expect(resultText).toContain('query1');
      expect(resultText).toContain('query2');

      // First query should filter out .log file
      expect(resultText).toContain('src/component.js');
      expect(resultText).not.toContain('debug.log');

      // Second query should include both files (.env is now allowed for context)
      expect(resultText).toContain('src/utils.ts');
      expect(resultText).toContain('.env');
    });
  });
});

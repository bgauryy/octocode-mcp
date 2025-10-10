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
  getGitHubToken: vi.fn(() => Promise.resolve('test-token')),
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

      const resultText = (result as CallToolResult).content[0]!.text;

      expect(resultText).toContain('instructions:');
      expect(resultText).toContain('results:');
      expect(resultText).toContain('status: "hasResults"');
      expect(resultText).toContain('query:');
      expect(resultText).toContain('hasResultsStatusHints:');
      expect(resultText).toContain('1 hasResults');
    });

    it('should handle empty results after filtering at tool level', async () => {
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

      const resultText = (result as CallToolResult).content[0]!.text;

      expect(resultText).toContain('instructions:');
      expect(resultText).toContain('results:');
      expect(resultText).toContain('status: "empty"');
      expect(resultText).toContain('query:');
      expect(resultText).toContain('emptyStatusHints:');
      expect(resultText).toContain('1 empty');
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

      expect(resultText).toContain('instructions:');
      expect(resultText).toContain('results:');
      expect(resultText).toContain('status: "hasResults"');
      expect(resultText).toContain('query:');
      expect(resultText).toContain('hasResultsStatusHints:');
      expect(resultText).toContain('1 hasResults');
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

      expect(resultText).toContain('instructions:');
      expect(resultText).toContain('results:');
      expect(resultText).toContain('status: "hasResults"');
      expect(resultText).toContain('query:');
      expect(resultText).toContain('hasResultsStatusHints:');
      expect(resultText).toContain('1 hasResults');
    });

    it('should handle multiple queries with filtering', async () => {
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

      expect(resultText).toContain('instructions:');
      expect(resultText).toContain('results:');
      expect(resultText).toContain('status: "hasResults"');
      expect(resultText).toContain('query:');
      expect(resultText).toContain('hasResultsStatusHints:');
      expect(resultText).toContain('2 hasResults');
      expect(resultText).toContain('src/component.js');
      expect(resultText).toContain('src/utils.ts');
    });
  });
});

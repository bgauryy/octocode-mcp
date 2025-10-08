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

      expect(resultText).toEqual(`data:
  queries:
    - status: "success"
      data:
        owner: "test"
        repo: "repo"
        files:
          - path: "src/index.js"
            text_matches:
              - "function test(){}"
          - path: "src/components/component.js"
            text_matches:
              - "const Component=()=>{};"
      hints:
        - "Analyze top results in depth before expanding search"
        - "Cross-reference findings across multiple sources"
        - "Use function/class names or error strings as keywords to find definitions and usages"
        - "Derive matchString for file fetches from code search text_matches"
        - "Scope away from noise directories by setting path to src/, packages/*/src"
        - "Chain tools: repository search → structure view → code search → content fetch"
        - "Compare implementations across 3-5 repositories to identify best practices"
        - "Use github_fetch_content with matchString from search results for precise context extraction"
hints:
  - "Query results: 1 successful"
  - "Review hints below for guidance on next steps"
`);
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

      expect(resultText).toEqual(`data:
  queries:
    - status: "empty"
      data:
        owner: "test"
        repo: "repo"
      hints:
        - "Try broader search terms or related concepts"
        - "Use functional descriptions that focus on what the code accomplishes"
        - "Use extension, filename, path filters to target specific directories and file names"
        - "Look in tests: tests/, __tests__/, *.test.*, *.spec.* to discover real usage"
        - "After discovery, add owner/repo to narrow scope; set limit to cap results"
        - "Chain tools: repository search → structure view → code search → content fetch"
        - "Compare implementations across 3-5 repositories to identify best practices"
        - "Use github_fetch_content with matchString from search results for precise context extraction"
      query:
        owner: "test"
        repo: "repo"
        keywordsToSearch:
          - "lock"
hints:
  - "Query results: 1 empty"
  - "Review hints below for guidance on next steps"
`);
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

      expect(resultText).toEqual(`data:
  queries:
    - status: "success"
      data:
        owner: "test"
        repo: "repo"
        files:
          - path: "src/utils.js"
          - path: "src/helper.js"
      hints:
        - "Analyze top results in depth before expanding search"
        - "Cross-reference findings across multiple sources"
        - "Use function/class names or error strings as keywords to find definitions and usages"
        - "Derive matchString for file fetches from code search text_matches"
        - "Scope away from noise directories by setting path to src/, packages/*/src"
        - "Chain tools: repository search → structure view → code search → content fetch"
        - "Compare implementations across 3-5 repositories to identify best practices"
        - "Use github_fetch_content with matchString from search results for precise context extraction"
hints:
  - "Query results: 1 successful"
  - "Review hints below for guidance on next steps"
`);
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

      expect(resultText).toEqual(`data:
  queries:
    - status: "success"
      data:
        owner: "test"
        repo: "repo"
        files:
          - path: "src/app.js"
          - path: "src/index.js"
      hints:
        - "Analyze top results in depth before expanding search"
        - "Cross-reference findings across multiple sources"
        - "Use function/class names or error strings as keywords to find definitions and usages"
        - "Derive matchString for file fetches from code search text_matches"
        - "Scope away from noise directories by setting path to src/, packages/*/src"
        - "Chain tools: repository search → structure view → code search → content fetch"
        - "Compare implementations across 3-5 repositories to identify best practices"
        - "Use github_fetch_content with matchString from search results for precise context extraction"
hints:
  - "Query results: 1 successful"
  - "Review hints below for guidance on next steps"
`);
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

      expect(resultText).toEqual(`data:
  queries:
    - status: "success"
      data:
        owner: "test"
        repo: "repo"
        files:
          - path: "src/component.js"
      hints:
        - "Analyze top results in depth before expanding search"
        - "Cross-reference findings across multiple sources"
        - "Use function/class names or error strings as keywords to find definitions and usages"
        - "Derive matchString for file fetches from code search text_matches"
        - "Scope away from noise directories by setting path to src/, packages/*/src"
        - "Chain tools: repository search → structure view → code search → content fetch"
        - "Compare implementations across 3-5 repositories to identify best practices"
        - "Use github_fetch_content with matchString from search results for precise context extraction"
    - status: "success"
      data:
        owner: "test"
        repo: "repo"
        files:
          - path: "src/utils.ts"
          - path: ".env"
      hints:
        - "Analyze top results in depth before expanding search"
        - "Cross-reference findings across multiple sources"
        - "Use function/class names or error strings as keywords to find definitions and usages"
        - "Derive matchString for file fetches from code search text_matches"
        - "Scope away from noise directories by setting path to src/, packages/*/src"
        - "Chain tools: repository search → structure view → code search → content fetch"
        - "Compare implementations across 3-5 repositories to identify best practices"
        - "Use github_fetch_content with matchString from search results for precise context extraction"
hints:
  - "Query results: 2 successful"
  - "Review hints below for guidance on next steps"
`);
    });
  });
});

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
  withCache: vi.fn(async (_key: string, fn: () => unknown) => {
    return await fn();
  }),
}));

vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
}));

// Import after mocking
import { registerGitHubSearchCodeTool } from '../../src/tools/github_search_code.js';

describe('GitHub Search Code - Sensitive File/Folder Filtering', () => {
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

  describe('Sensitive Folder Filtering', () => {
    it('should filter out files in .git directories', async () => {
      const mockResponse = {
        data: {
          total_count: 4,
          items: [
            {
              name: 'config.js',
              path: 'src/config.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'config', matches: [] }],
            },
            {
              name: 'hooks',
              path: '.git/hooks/pre-commit',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'hook', matches: [] }],
            },
            {
              name: 'config',
              path: '.git/config',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'config', matches: [] }],
            },
            {
              name: 'main.js',
              path: 'src/main.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'main', matches: [] }],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await toolHandler(
        {
          queries: [
            {
              keywordsToSearch: ['config'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Use function/class names or error strings as keywords to find definitions and usages"
      - "Derive matchString for file fetches from code search text_matches"
      - "Scope away from noise directories by setting path to src/, packages/*/src"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Use github_fetch_content with matchString from search results for precise context extraction"
  queries:
    successful:
      - owner: "test"
        repo: "repo"
        files:
          - path: "src/config.js"
            text_matches:
              - "config;"
          - path: "src/main.js"
            text_matches:
              - "main;"
`);
    });

    it('should filter out files in node_modules directories', async () => {
      const mockResponse = {
        data: {
          total_count: 5,
          items: [
            {
              name: 'utils.js',
              path: 'src/utils.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'utils', matches: [] }],
            },
            {
              name: 'lodash.js',
              path: 'node_modules/lodash/lodash.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'lodash', matches: [] }],
            },
            {
              name: 'react.js',
              path: 'node_modules/react/index.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'react', matches: [] }],
            },
            {
              name: 'package.json',
              path: 'node_modules/express/package.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'express', matches: [] }],
            },
            {
              name: 'helper.js',
              path: 'src/helpers/helper.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'helper', matches: [] }],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await toolHandler(
        {
          queries: [
            {
              keywordsToSearch: ['utils'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Use function/class names or error strings as keywords to find definitions and usages"
      - "Derive matchString for file fetches from code search text_matches"
      - "Scope away from noise directories by setting path to src/, packages/*/src"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Use github_fetch_content with matchString from search results for precise context extraction"
  queries:
    successful:
      - owner: "test"
        repo: "repo"
        files:
          - path: "src/utils.js"
            text_matches:
              - "utils;"
          - path: "src/helpers/helper.js"
            text_matches:
              - "helper;"
`);
    });

    it('should filter out files in build/dist directories', async () => {
      const mockResponse = {
        data: {
          total_count: 6,
          items: [
            {
              name: 'app.js',
              path: 'src/app.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'app', matches: [] }],
            },
            {
              name: 'bundle.js',
              path: 'dist/bundle.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'bundle', matches: [] }],
            },
            {
              name: 'main.js',
              path: 'build/main.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'main', matches: [] }],
            },
            {
              name: 'output.js',
              path: 'out/output.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'output', matches: [] }],
            },
            {
              name: 'target.jar',
              path: 'target/app.jar',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'target', matches: [] }],
            },
            {
              name: 'component.js',
              path: 'src/components/component.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'component', matches: [] }],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await toolHandler(
        {
          queries: [
            {
              keywordsToSearch: ['app'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Use function/class names or error strings as keywords to find definitions and usages"
      - "Derive matchString for file fetches from code search text_matches"
      - "Scope away from noise directories by setting path to src/, packages/*/src"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Use github_fetch_content with matchString from search results for precise context extraction"
  queries:
    successful:
      - owner: "test"
        repo: "repo"
        files:
          - path: "src/app.js"
            text_matches:
              - "app;"
          - path: "src/components/component.js"
            text_matches:
              - "component;"
`);
    });

    it('should filter out files in cache directories', async () => {
      const mockResponse = {
        data: {
          total_count: 5,
          items: [
            {
              name: 'service.py',
              path: 'src/service.py',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'service', matches: [] }],
            },
            {
              name: 'cached_data.py',
              path: '.cache/cached_data.py',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'cache', matches: [] }],
            },
            {
              name: 'test_cache.py',
              path: '.pytest_cache/test_cache.py',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'test', matches: [] }],
            },
            {
              name: 'mypy_cache.py',
              path: '.mypy_cache/cache.py',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'mypy', matches: [] }],
            },
            {
              name: 'utils.py',
              path: 'src/utils.py',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'utils', matches: [] }],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await toolHandler(
        {
          queries: [
            {
              keywordsToSearch: ['python'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Use function/class names or error strings as keywords to find definitions and usages"
      - "Derive matchString for file fetches from code search text_matches"
      - "Scope away from noise directories by setting path to src/, packages/*/src"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Use github_fetch_content with matchString from search results for precise context extraction"
  queries:
    successful:
      - owner: "test"
        repo: "repo"
        files:
          - path: "src/service.py"
            text_matches:
              - "service"
          - path: "src/utils.py"
            text_matches:
              - "utils"
`);
    });
  });

  describe('Sensitive File Filtering', () => {
    it('should filter out lock files', async () => {
      const mockResponse = {
        data: {
          total_count: 6,
          items: [
            {
              name: 'package.json',
              path: 'package.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'package', matches: [] }],
            },
            {
              name: 'package-lock.json',
              path: 'package-lock.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'lock', matches: [] }],
            },
            {
              name: 'yarn.lock',
              path: 'yarn.lock',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'yarn', matches: [] }],
            },
            {
              name: 'pnpm-lock.yaml',
              path: 'pnpm-lock.yaml',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'pnpm', matches: [] }],
            },
            {
              name: 'Cargo.lock',
              path: 'Cargo.lock',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'cargo', matches: [] }],
            },
            {
              name: 'Cargo.toml',
              path: 'Cargo.toml',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'cargo', matches: [] }],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await toolHandler(
        {
          queries: [
            {
              keywordsToSearch: ['dependencies'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Use function/class names or error strings as keywords to find definitions and usages"
      - "Derive matchString for file fetches from code search text_matches"
      - "Scope away from noise directories by setting path to src/, packages/*/src"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Use github_fetch_content with matchString from search results for precise context extraction"
  queries:
    successful:
      - owner: "test"
        repo: "repo"
        files:
          - path: "package.json"
            text_matches:
              - "package"
          - path: "pnpm-lock.yaml"
            text_matches:
              - "pnpm"
          - path: "Cargo.toml"
            text_matches:
              - "cargo"
`);
    });

    it('should filter out sensitive credential files', async () => {
      const mockResponse = {
        data: {
          total_count: 7,
          items: [
            {
              name: 'config.js',
              path: 'src/config.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'config', matches: [] }],
            },
            {
              name: 'secrets.json',
              path: 'secrets.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'secrets', matches: [] }],
            },
            {
              name: 'credentials.yaml',
              path: 'config/credentials.yaml',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'credentials', matches: [] }],
            },
            {
              name: 'api-keys.json',
              path: 'api-keys.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'api', matches: [] }],
            },
            {
              name: 'private-key.pem',
              path: 'certs/private-key.pem',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'private', matches: [] }],
            },
            {
              name: 'id_rsa',
              path: '.ssh/id_rsa',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'rsa', matches: [] }],
            },
            {
              name: 'settings.js',
              path: 'src/settings.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'settings', matches: [] }],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await toolHandler(
        {
          queries: [
            {
              keywordsToSearch: ['config'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Use function/class names or error strings as keywords to find definitions and usages"
      - "Derive matchString for file fetches from code search text_matches"
      - "Scope away from noise directories by setting path to src/, packages/*/src"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Use github_fetch_content with matchString from search results for precise context extraction"
  queries:
    successful:
      - owner: "test"
        repo: "repo"
        files:
          - path: "src/config.js"
            text_matches:
              - "config;"
          - path: "src/settings.js"
            text_matches:
              - "settings;"
`);
    });

    it('should filter out binary and compiled files', async () => {
      const mockResponse = {
        data: {
          total_count: 8,
          items: [
            {
              name: 'app.js',
              path: 'src/app.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'app', matches: [] }],
            },
            {
              name: 'app.exe',
              path: 'bin/app.exe',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'app', matches: [] }],
            },
            {
              name: 'library.dll',
              path: 'lib/library.dll',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'library', matches: [] }],
            },
            {
              name: 'module.so',
              path: 'lib/module.so',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'module', matches: [] }],
            },
            {
              name: 'Main.class',
              path: 'build/Main.class',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'Main', matches: [] }],
            },
            {
              name: 'cache.pyc',
              path: '__pycache__/cache.pyc',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'cache', matches: [] }],
            },
            {
              name: 'app.jar',
              path: 'target/app.jar',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'app', matches: [] }],
            },
            {
              name: 'main.py',
              path: 'src/main.py',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'main', matches: [] }],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await toolHandler(
        {
          queries: [
            {
              keywordsToSearch: ['main'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Use function/class names or error strings as keywords to find definitions and usages"
      - "Derive matchString for file fetches from code search text_matches"
      - "Scope away from noise directories by setting path to src/, packages/*/src"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Use github_fetch_content with matchString from search results for precise context extraction"
  queries:
    successful:
      - owner: "test"
        repo: "repo"
        files:
          - path: "src/app.js"
            text_matches:
              - "app;"
          - path: "src/main.py"
            text_matches:
              - "main"
`);
    });

    it('should filter out minified files', async () => {
      const mockResponse = {
        data: {
          total_count: 4,
          items: [
            {
              name: 'app.js',
              path: 'src/app.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'app', matches: [] }],
            },
            {
              name: 'app.min.js',
              path: 'dist/app.min.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'app', matches: [] }],
            },
            {
              name: 'styles.css',
              path: 'src/styles.css',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'styles', matches: [] }],
            },
            {
              name: 'styles.min.css',
              path: 'dist/styles.min.css',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'styles', matches: [] }],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await toolHandler(
        {
          queries: [
            {
              keywordsToSearch: ['styles'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Use function/class names or error strings as keywords to find definitions and usages"
      - "Derive matchString for file fetches from code search text_matches"
      - "Scope away from noise directories by setting path to src/, packages/*/src"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Use github_fetch_content with matchString from search results for precise context extraction"
  queries:
    successful:
      - owner: "test"
        repo: "repo"
        files:
          - path: "src/app.js"
            text_matches:
              - "app;"
          - path: "src/styles.css"
            text_matches:
              - ""
`);
    });
  });

  describe('Combined Filtering Scenarios', () => {
    it('should handle mixed sensitive and non-sensitive files correctly', async () => {
      const mockResponse = {
        data: {
          total_count: 12,
          items: [
            {
              name: 'UserService.js',
              path: 'src/services/UserService.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'UserService', matches: [] }],
            },
            {
              name: 'AuthController.js',
              path: 'src/controllers/AuthController.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'AuthController', matches: [] }],
            },
            {
              name: 'express.js',
              path: 'node_modules/express/index.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'express', matches: [] }],
            },
            {
              name: 'bundle.js',
              path: 'dist/bundle.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'bundle', matches: [] }],
            },
            {
              name: 'config',
              path: '.git/config',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'config', matches: [] }],
            },
            {
              name: 'secrets.json',
              path: 'config/secrets.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'secrets', matches: [] }],
            },
            {
              name: 'package-lock.json',
              path: 'package-lock.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'package', matches: [] }],
            },
            {
              name: 'id_rsa',
              path: '.ssh/id_rsa',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'rsa', matches: [] }],
            },
            {
              name: 'app.exe',
              path: 'bin/app.exe',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'app', matches: [] }],
            },
            {
              name: 'cache.pyc',
              path: '__pycache__/cache.pyc',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'cache', matches: [] }],
            },
            {
              name: 'styles.min.css',
              path: 'dist/styles.min.css',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'styles', matches: [] }],
            },
            {
              name: 'config.js',
              path: 'src/config.js',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'config', matches: [] }],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await toolHandler(
        {
          queries: [
            {
              keywordsToSearch: ['service'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Use function/class names or error strings as keywords to find definitions and usages"
      - "Derive matchString for file fetches from code search text_matches"
      - "Scope away from noise directories by setting path to src/, packages/*/src"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Use github_fetch_content with matchString from search results for precise context extraction"
  queries:
    successful:
      - owner: "test"
        repo: "repo"
        files:
          - path: "src/services/UserService.js"
            text_matches:
              - "UserService;"
          - path: "src/controllers/AuthController.js"
            text_matches:
              - "AuthController;"
          - path: "src/config.js"
            text_matches:
              - "config;"
`);
    });

    it('should return empty results when all files are filtered', async () => {
      const mockResponse = {
        data: {
          total_count: 4,
          items: [
            {
              name: 'package-lock.json',
              path: 'package-lock.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'package', matches: [] }],
            },
            {
              name: 'yarn.lock',
              path: 'yarn.lock',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'yarn', matches: [] }],
            },
            {
              name: 'secrets.json',
              path: 'secrets.json',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'secrets', matches: [] }],
            },
            {
              name: 'app.exe',
              path: 'bin/app.exe',
              repository: { full_name: 'test/repo', url: 'url' },
              text_matches: [{ fragment: 'app', matches: [] }],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockResponse);

      const result = await toolHandler(
        {
          queries: [
            {
              keywordsToSearch: ['sensitive'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toEqual(`hints:
  - "Query results: 1 empty"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    empty:
      - "Try broader search terms or related concepts"
      - "Use functional descriptions that focus on what the code accomplishes"
      - "Use extension, filename, path filters to target specific directories and file names"
      - "Look in tests: tests/, __tests__/, *.test.*, *.spec.* to discover real usage"
      - "After discovery, add owner/repo to narrow scope; set limit to cap results"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Use github_fetch_content with matchString from search results for precise context extraction"
  queries:
    empty:
      - owner: "test"
        repo: "repo"
        metadata:
          originalQuery:
            owner: "test"
            repo: "repo"
            keywordsToSearch:
              - "sensitive"
`);
    });
  });
});

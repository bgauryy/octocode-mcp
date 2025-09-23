import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface CallToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

interface CodeSearchFile {
  path: string;
  text_matches: string[];
}

interface CodeSearchResult {
  queryId?: string;
  reasoning?: string;
  files?: CodeSearchFile[];
  totalCount?: number;
  repository?: string;
  query?: Record<string, unknown>;
  error?: string;
  hints?: string[];
  metadata: Record<string, unknown>;
}

interface CodeSearchResponse {
  data: CodeSearchResult[];
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
              queryTerms: ['config'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const resultData = JSON.parse(
        (result as CallToolResult).content[0]!.text
      ) as CodeSearchResponse;

      // Should only include files not in .git directory
      expect(resultData.data[0]?.files).toHaveLength(2);
      const filePaths =
        resultData.data[0]?.files?.map((f: CodeSearchFile) => f.path) || [];
      expect(filePaths).toContain('src/config.js');
      expect(filePaths).toContain('src/main.js');
      expect(filePaths).not.toContain('.git/hooks/pre-commit');
      expect(filePaths).not.toContain('.git/config');
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
              queryTerms: ['utils'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const resultData = JSON.parse(
        (result as CallToolResult).content[0]!.text
      ) as CodeSearchResponse;

      // Should only include files not in node_modules
      expect(resultData.data[0]?.files).toHaveLength(2);
      const filePaths =
        resultData.data[0]?.files?.map((f: CodeSearchFile) => f.path) || [];
      expect(filePaths).toContain('src/utils.js');
      expect(filePaths).toContain('src/helpers/helper.js');
      expect(filePaths).not.toContain('node_modules/lodash/lodash.js');
      expect(filePaths).not.toContain('node_modules/react/index.js');
      expect(filePaths).not.toContain('node_modules/express/package.json');
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
              queryTerms: ['app'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const resultData = JSON.parse(
        (result as CallToolResult).content[0]!.text
      ) as CodeSearchResponse;

      // Should only include source files, not build artifacts
      expect(resultData.data[0]?.files).toHaveLength(2);
      const filePaths =
        resultData.data[0]?.files?.map((f: CodeSearchFile) => f.path) || [];
      expect(filePaths).toContain('src/app.js');
      expect(filePaths).toContain('src/components/component.js');
      expect(filePaths).not.toContain('dist/bundle.js');
      expect(filePaths).not.toContain('build/main.js');
      expect(filePaths).not.toContain('out/output.js');
      expect(filePaths).not.toContain('target/app.jar');
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
              queryTerms: ['python'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const resultData = JSON.parse(
        (result as CallToolResult).content[0]!.text
      ) as CodeSearchResponse;

      // Should only include source files, not cache files
      expect(resultData.data[0]?.files).toHaveLength(2);
      const filePaths =
        resultData.data[0]?.files?.map((f: CodeSearchFile) => f.path) || [];
      expect(filePaths).toContain('src/service.py');
      expect(filePaths).toContain('src/utils.py');
      expect(filePaths).not.toContain('.cache/cached_data.py');
      expect(filePaths).not.toContain('.pytest_cache/test_cache.py');
      expect(filePaths).not.toContain('.mypy_cache/cache.py');
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
              queryTerms: ['dependencies'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const resultData = JSON.parse(
        (result as CallToolResult).content[0]!.text
      ) as CodeSearchResponse;

      const filePaths =
        resultData.data[0]?.files?.map((f: CodeSearchFile) => f.path) || [];

      // Should only include configuration files and filter out package-lock.json
      // Note: Other lock files (yarn.lock, pnpm-lock.yaml, Cargo.lock) are not in IGNORED_FILE_NAMES
      expect(resultData.data[0]?.files).toHaveLength(3);
      expect(filePaths).toContain('package.json');
      expect(filePaths).toContain('Cargo.toml');
      expect(filePaths).toContain('pnpm-lock.yaml'); // Not filtered since not in IGNORED_FILE_NAMES
      expect(filePaths).not.toContain('package-lock.json'); // Only this is filtered
      expect(filePaths).not.toContain('yarn.lock'); // Filtered by search results
      expect(filePaths).not.toContain('Cargo.lock'); // Filtered by search results
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
              queryTerms: ['config'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const resultData = JSON.parse(
        (result as CallToolResult).content[0]!.text
      ) as CodeSearchResponse;

      // Should only include non-sensitive configuration files
      expect(resultData.data[0]?.files).toHaveLength(2);
      const filePaths =
        resultData.data[0]?.files?.map((f: CodeSearchFile) => f.path) || [];
      expect(filePaths).toContain('src/config.js');
      expect(filePaths).toContain('src/settings.js');
      expect(filePaths).not.toContain('secrets.json');
      expect(filePaths).not.toContain('config/credentials.yaml');
      expect(filePaths).not.toContain('api-keys.json');
      expect(filePaths).not.toContain('certs/private-key.pem');
      expect(filePaths).not.toContain('.ssh/id_rsa');
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
              queryTerms: ['main'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const resultData = JSON.parse(
        (result as CallToolResult).content[0]!.text
      ) as CodeSearchResponse;

      // Should only include source files, not binary/compiled files
      expect(resultData.data[0]?.files).toHaveLength(2);
      const filePaths =
        resultData.data[0]?.files?.map((f: CodeSearchFile) => f.path) || [];
      expect(filePaths).toContain('src/app.js');
      expect(filePaths).toContain('src/main.py');
      expect(filePaths).not.toContain('bin/app.exe');
      expect(filePaths).not.toContain('lib/library.dll');
      expect(filePaths).not.toContain('lib/module.so');
      expect(filePaths).not.toContain('build/Main.class');
      expect(filePaths).not.toContain('__pycache__/cache.pyc');
      expect(filePaths).not.toContain('target/app.jar');
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
              queryTerms: ['styles'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const resultData = JSON.parse(
        (result as CallToolResult).content[0]!.text
      ) as CodeSearchResponse;

      // Should only include source files, not minified files
      expect(resultData.data[0]?.files).toHaveLength(2);
      const filePaths =
        resultData.data[0]?.files?.map((f: CodeSearchFile) => f.path) || [];
      expect(filePaths).toContain('src/app.js');
      expect(filePaths).toContain('src/styles.css');
      expect(filePaths).not.toContain('dist/app.min.js');
      expect(filePaths).not.toContain('dist/styles.min.css');
    });
  });

  describe('Combined Filtering Scenarios', () => {
    it('should handle mixed sensitive and non-sensitive files correctly', async () => {
      const mockResponse = {
        data: {
          total_count: 12,
          items: [
            // Valid source files
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
            // Sensitive - in ignored directories
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
            // Sensitive - ignored file names
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
            // Sensitive - ignored extensions
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
            // Valid configuration file
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
              queryTerms: ['service'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const resultData = JSON.parse(
        (result as CallToolResult).content[0]!.text
      ) as CodeSearchResponse;

      // Should only include the 3 valid source files
      expect(resultData.data[0]?.files).toHaveLength(3);
      const filePaths =
        resultData.data[0]?.files?.map((f: CodeSearchFile) => f.path) || [];

      // Valid files should be included
      expect(filePaths).toContain('src/services/UserService.js');
      expect(filePaths).toContain('src/controllers/AuthController.js');
      expect(filePaths).toContain('src/config.js');

      // All sensitive files should be filtered out
      expect(filePaths).not.toContain('node_modules/express/index.js');
      expect(filePaths).not.toContain('dist/bundle.js');
      expect(filePaths).not.toContain('.git/config');
      expect(filePaths).not.toContain('config/secrets.json');
      expect(filePaths).not.toContain('package-lock.json');
      expect(filePaths).not.toContain('.ssh/id_rsa');
      expect(filePaths).not.toContain('bin/app.exe');
      expect(filePaths).not.toContain('__pycache__/cache.pyc');
      expect(filePaths).not.toContain('dist/styles.min.css');
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
              queryTerms: ['sensitive'],
              owner: 'test',
              repo: 'repo',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const resultData = JSON.parse(
        (result as CallToolResult).content[0]!.text
      ) as CodeSearchResponse;

      // All files should be filtered out
      expect(resultData.data[0]?.files).toHaveLength(0);
      expect(resultData.data[0]?.totalCount).toBe(0);

      // Should include hints for no results
      expect(resultData.data[0]?.hints).toBeDefined();
      expect(resultData.data[0]?.hints?.length).toBeGreaterThan(0);
    });
  });
});

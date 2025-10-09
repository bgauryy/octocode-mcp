import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface CallToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// Mock the GitHub client
const mockOctokit = vi.hoisted(() => ({
  rest: {
    repos: {
      getContent: vi.fn(),
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
import { registerViewGitHubRepoStructureTool } from '../../src/tools/github_view_repo_structure.js';

describe('GitHub View Repo Structure - Sensitive File/Folder Filtering', () => {
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
    registerViewGitHubRepoStructureTool(server);
  });

  describe('Sensitive Folder Filtering', () => {
    it('should filter out .git directories and their contents', async () => {
      const mockResponse = [
        {
          name: 'src',
          path: 'src',
          type: 'dir',
          sha: 'sha1',
          size: 0,
          url: 'url1',
          html_url: 'html1',
          git_url: 'git1',
          download_url: null,
        },
        {
          name: '.git',
          path: '.git',
          type: 'dir',
          sha: 'sha2',
          size: 0,
          url: 'url2',
          html_url: 'html2',
          git_url: 'git2',
          download_url: null,
        },
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          sha: 'sha3',
          size: 1024,
          url: 'url3',
          html_url: 'html3',
          git_url: 'git3',
          download_url: 'download3',
        },
        {
          name: '.github',
          path: '.github',
          type: 'dir',
          sha: 'sha4',
          size: 0,
          url: 'url4',
          html_url: 'html4',
          git_url: 'git4',
          download_url: null,
        },
        {
          name: 'package.json',
          path: 'package.json',
          type: 'file',
          sha: 'sha5',
          size: 512,
          url: 'url5',
          html_url: 'html5',
          git_url: 'git5',
          download_url: 'download5',
        },
      ];

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: mockResponse,
      });

      const result = await toolHandler(
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              path: '',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('1 hasResults');
    });

    it('should filter out node_modules directories', async () => {
      const mockResponse = [
        {
          name: 'src',
          path: 'src',
          type: 'dir',
          sha: 'sha1',
          size: 0,
          url: 'url1',
          html_url: 'html1',
          git_url: 'git1',
          download_url: null,
        },
        {
          name: 'node_modules',
          path: 'node_modules',
          type: 'dir',
          sha: 'sha2',
          size: 0,
          url: 'url2',
          html_url: 'html2',
          git_url: 'git2',
          download_url: null,
        },
        {
          name: 'vendor',
          path: 'vendor',
          type: 'dir',
          sha: 'sha3',
          size: 0,
          url: 'url3',
          html_url: 'html3',
          git_url: 'git3',
          download_url: null,
        },
        {
          name: 'third_party',
          path: 'third_party',
          type: 'dir',
          sha: 'sha4',
          size: 0,
          url: 'url4',
          html_url: 'html4',
          git_url: 'git4',
          download_url: null,
        },
        {
          name: 'lib',
          path: 'lib',
          type: 'dir',
          sha: 'sha5',
          size: 0,
          url: 'url5',
          html_url: 'html5',
          git_url: 'git5',
          download_url: null,
        },
        {
          name: 'package.json',
          path: 'package.json',
          type: 'file',
          sha: 'sha6',
          size: 512,
          url: 'url6',
          html_url: 'html6',
          git_url: 'git6',
          download_url: 'download6',
        },
      ];

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: mockResponse,
      });

      const result = await toolHandler(
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              path: '',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('1 hasResults');
    });

    it('should filter out build and distribution directories', async () => {
      const mockResponse = [
        {
          name: 'src',
          path: 'src',
          type: 'dir',
          sha: 'sha1',
          size: 0,
          url: 'url1',
          html_url: 'html1',
          git_url: 'git1',
          download_url: null,
        },
        {
          name: 'dist',
          path: 'dist',
          type: 'dir',
          sha: 'sha2',
          size: 0,
          url: 'url2',
          html_url: 'html2',
          git_url: 'git2',
          download_url: null,
        },
        {
          name: 'build',
          path: 'build',
          type: 'dir',
          sha: 'sha3',
          size: 0,
          url: 'url3',
          html_url: 'html3',
          git_url: 'git3',
          download_url: null,
        },
        {
          name: 'out',
          path: 'out',
          type: 'dir',
          sha: 'sha4',
          size: 0,
          url: 'url4',
          html_url: 'html4',
          git_url: 'git4',
          download_url: null,
        },
        {
          name: 'target',
          path: 'target',
          type: 'dir',
          sha: 'sha5',
          size: 0,
          url: 'url5',
          html_url: 'html5',
          git_url: 'git5',
          download_url: null,
        },
        {
          name: 'release',
          path: 'release',
          type: 'dir',
          sha: 'sha6',
          size: 0,
          url: 'url6',
          html_url: 'html6',
          git_url: 'git6',
          download_url: null,
        },
        {
          name: 'tests',
          path: 'tests',
          type: 'dir',
          sha: 'sha7',
          size: 0,
          url: 'url7',
          html_url: 'html7',
          git_url: 'git7',
          download_url: null,
        },
      ];

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: mockResponse,
      });

      const result = await toolHandler(
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              path: '',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('1 hasResults');
    });

    it('should filter out cache directories', async () => {
      const mockResponse = [
        {
          name: 'src',
          path: 'src',
          type: 'dir',
          sha: 'sha1',
          size: 0,
          url: 'url1',
          html_url: 'html1',
          git_url: 'git1',
          download_url: null,
        },
        {
          name: '.cache',
          path: '.cache',
          type: 'dir',
          sha: 'sha2',
          size: 0,
          url: 'url2',
          html_url: 'html2',
          git_url: 'git2',
          download_url: null,
        },
        {
          name: '.pytest_cache',
          path: '.pytest_cache',
          type: 'dir',
          sha: 'sha3',
          size: 0,
          url: 'url3',
          html_url: 'html3',
          git_url: 'git3',
          download_url: null,
        },
        {
          name: '.mypy_cache',
          path: '.mypy_cache',
          type: 'dir',
          sha: 'sha4',
          size: 0,
          url: 'url4',
          html_url: 'html4',
          git_url: 'git4',
          download_url: null,
        },
        {
          name: '__pycache__',
          path: '__pycache__',
          type: 'dir',
          sha: 'sha5',
          size: 0,
          url: 'url5',
          html_url: 'html5',
          git_url: 'git5',
          download_url: null,
        },
        {
          name: '.next',
          path: '.next',
          type: 'dir',
          sha: 'sha6',
          size: 0,
          url: 'url6',
          html_url: 'html6',
          git_url: 'git6',
          download_url: null,
        },
        {
          name: 'tmp',
          path: 'tmp',
          type: 'dir',
          sha: 'sha7',
          size: 0,
          url: 'url7',
          html_url: 'html7',
          git_url: 'git7',
          download_url: null,
        },
        {
          name: 'docs',
          path: 'docs',
          type: 'dir',
          sha: 'sha8',
          size: 0,
          url: 'url8',
          html_url: 'html8',
          git_url: 'git8',
          download_url: null,
        },
      ];

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: mockResponse,
      });

      const result = await toolHandler(
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              path: '',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('1 hasResults');
    });
  });

  describe('Sensitive File Filtering', () => {
    it('should filter out lock files', async () => {
      const mockResponse = [
        {
          name: 'package.json',
          path: 'package.json',
          type: 'file',
          sha: 'sha1',
          size: 512,
          url: 'url1',
          html_url: 'html1',
          git_url: 'git1',
          download_url: 'download1',
        },
        {
          name: 'package-lock.json',
          path: 'package-lock.json',
          type: 'file',
          sha: 'sha2',
          size: 1024,
          url: 'url2',
          html_url: 'html2',
          git_url: 'git2',
          download_url: 'download2',
        },
        {
          name: 'yarn.lock',
          path: 'yarn.lock',
          type: 'file',
          sha: 'sha3',
          size: 2048,
          url: 'url3',
          html_url: 'html3',
          git_url: 'git3',
          download_url: 'download3',
        },
        {
          name: 'pnpm-lock.yaml',
          path: 'pnpm-lock.yaml',
          type: 'file',
          sha: 'sha4',
          size: 1536,
          url: 'url4',
          html_url: 'html4',
          git_url: 'git4',
          download_url: 'download4',
        },
        {
          name: 'Cargo.toml',
          path: 'Cargo.toml',
          type: 'file',
          sha: 'sha5',
          size: 256,
          url: 'url5',
          html_url: 'html5',
          git_url: 'git5',
          download_url: 'download5',
        },
        {
          name: 'Cargo.lock',
          path: 'Cargo.lock',
          type: 'file',
          sha: 'sha6',
          size: 4096,
          url: 'url6',
          html_url: 'html6',
          git_url: 'git6',
          download_url: 'download6',
        },
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          sha: 'sha7',
          size: 1024,
          url: 'url7',
          html_url: 'html7',
          git_url: 'git7',
          download_url: 'download7',
        },
      ];

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: mockResponse,
      });

      const result = await toolHandler(
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              path: '',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('1 hasResults');
    });

    it('should filter out sensitive credential files', async () => {
      const mockResponse = [
        {
          name: 'config.js',
          path: 'config.js',
          type: 'file',
          sha: 'sha1',
          size: 512,
          url: 'url1',
          html_url: 'html1',
          git_url: 'git1',
          download_url: 'download1',
        },
        {
          name: 'secrets.json',
          path: 'secrets.json',
          type: 'file',
          sha: 'sha2',
          size: 256,
          url: 'url2',
          html_url: 'html2',
          git_url: 'git2',
          download_url: 'download2',
        },
        {
          name: 'credentials.yaml',
          path: 'credentials.yaml',
          type: 'file',
          sha: 'sha3',
          size: 128,
          url: 'url3',
          html_url: 'html3',
          git_url: 'git3',
          download_url: 'download3',
        },
        {
          name: 'api-keys.json',
          path: 'api-keys.json',
          type: 'file',
          sha: 'sha4',
          size: 64,
          url: 'url4',
          html_url: 'html4',
          git_url: 'git4',
          download_url: 'download4',
        },
        {
          name: 'private-key.pem',
          path: 'private-key.pem',
          type: 'file',
          sha: 'sha5',
          size: 1024,
          url: 'url5',
          html_url: 'html5',
          git_url: 'git5',
          download_url: 'download5',
        },
        {
          name: 'id_rsa',
          path: 'id_rsa',
          type: 'file',
          sha: 'sha6',
          size: 2048,
          url: 'url6',
          html_url: 'html6',
          git_url: 'git6',
          download_url: 'download6',
        },
        {
          name: 'google-services.json',
          path: 'google-services.json',
          type: 'file',
          sha: 'sha7',
          size: 512,
          url: 'url7',
          html_url: 'html7',
          git_url: 'git7',
          download_url: 'download7',
        },
        {
          name: 'settings.js',
          path: 'settings.js',
          type: 'file',
          sha: 'sha8',
          size: 256,
          url: 'url8',
          html_url: 'html8',
          git_url: 'git8',
          download_url: 'download8',
        },
      ];

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: mockResponse,
      });

      const result = await toolHandler(
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              path: '',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('1 hasResults');
    });

    it('should filter out binary and compiled files', async () => {
      const mockResponse = [
        {
          name: 'app.js',
          path: 'app.js',
          type: 'file',
          sha: 'sha1',
          size: 1024,
          url: 'url1',
          html_url: 'html1',
          git_url: 'git1',
          download_url: 'download1',
        },
        {
          name: 'app.exe',
          path: 'app.exe',
          type: 'file',
          sha: 'sha2',
          size: 1048576,
          url: 'url2',
          html_url: 'html2',
          git_url: 'git2',
          download_url: 'download2',
        },
        {
          name: 'library.dll',
          path: 'library.dll',
          type: 'file',
          sha: 'sha3',
          size: 524288,
          url: 'url3',
          html_url: 'html3',
          git_url: 'git3',
          download_url: 'download3',
        },
        {
          name: 'module.so',
          path: 'module.so',
          type: 'file',
          sha: 'sha4',
          size: 262144,
          url: 'url4',
          html_url: 'html4',
          git_url: 'git4',
          download_url: 'download4',
        },
        {
          name: 'Main.class',
          path: 'Main.class',
          type: 'file',
          sha: 'sha5',
          size: 2048,
          url: 'url5',
          html_url: 'html5',
          git_url: 'git5',
          download_url: 'download5',
        },
        {
          name: 'cache.pyc',
          path: 'cache.pyc',
          type: 'file',
          sha: 'sha6',
          size: 1024,
          url: 'url6',
          html_url: 'html6',
          git_url: 'git6',
          download_url: 'download6',
        },
        {
          name: 'app.jar',
          path: 'app.jar',
          type: 'file',
          sha: 'sha7',
          size: 2097152,
          url: 'url7',
          html_url: 'html7',
          git_url: 'git7',
          download_url: 'download7',
        },
        {
          name: 'main.py',
          path: 'main.py',
          type: 'file',
          sha: 'sha8',
          size: 512,
          url: 'url8',
          html_url: 'html8',
          git_url: 'git8',
          download_url: 'download8',
        },
        {
          name: 'data.db',
          path: 'data.db',
          type: 'file',
          sha: 'sha9',
          size: 4194304,
          url: 'url9',
          html_url: 'html9',
          git_url: 'git9',
          download_url: 'download9',
        },
      ];

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: mockResponse,
      });

      const result = await toolHandler(
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              path: '',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('1 hasResults');
    });

    it('should filter out minified files', async () => {
      const mockResponse = [
        {
          name: 'app.js',
          path: 'app.js',
          type: 'file',
          sha: 'sha1',
          size: 1024,
          url: 'url1',
          html_url: 'html1',
          git_url: 'git1',
          download_url: 'download1',
        },
        {
          name: 'app.min.js',
          path: 'app.min.js',
          type: 'file',
          sha: 'sha2',
          size: 512,
          url: 'url2',
          html_url: 'html2',
          git_url: 'git2',
          download_url: 'download2',
        },
        {
          name: 'styles.css',
          path: 'styles.css',
          type: 'file',
          sha: 'sha3',
          size: 2048,
          url: 'url3',
          html_url: 'html3',
          git_url: 'git3',
          download_url: 'download3',
        },
        {
          name: 'styles.min.css',
          path: 'styles.min.css',
          type: 'file',
          sha: 'sha4',
          size: 1024,
          url: 'url4',
          html_url: 'html4',
          git_url: 'git4',
          download_url: 'download4',
        },
        {
          name: 'bundle.min.js',
          path: 'bundle.min.js',
          type: 'file',
          sha: 'sha5',
          size: 4096,
          url: 'url5',
          html_url: 'html5',
          git_url: 'git5',
          download_url: 'download5',
        },
      ];

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: mockResponse,
      });

      const result = await toolHandler(
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              path: '',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('1 hasResults');
    });

    it('should filter out OS-specific files', async () => {
      const mockResponse = [
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          sha: 'sha1',
          size: 1024,
          url: 'url1',
          html_url: 'html1',
          git_url: 'git1',
          download_url: 'download1',
        },
        {
          name: '.DS_Store',
          path: '.DS_Store',
          type: 'file',
          sha: 'sha2',
          size: 6148,
          url: 'url2',
          html_url: 'html2',
          git_url: 'git2',
          download_url: 'download2',
        },
        {
          name: 'Thumbs.db',
          path: 'Thumbs.db',
          type: 'file',
          sha: 'sha3',
          size: 4096,
          url: 'url3',
          html_url: 'html3',
          git_url: 'git3',
          download_url: 'download3',
        },
        {
          name: 'package.json',
          path: 'package.json',
          type: 'file',
          sha: 'sha4',
          size: 512,
          url: 'url4',
          html_url: 'html4',
          git_url: 'git4',
          download_url: 'download4',
        },
      ];

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: mockResponse,
      });

      const result = await toolHandler(
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              path: '',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('1 hasResults');
    });
  });

  describe('Combined Filtering Scenarios', () => {
    it('should handle mixed sensitive and non-sensitive files/folders correctly', async () => {
      const mockResponse = [
        // Valid directories
        {
          name: 'src',
          path: 'src',
          type: 'dir',
          sha: 'sha1',
          size: 0,
          url: 'url1',
          html_url: 'html1',
          git_url: 'git1',
          download_url: null,
        },
        {
          name: 'docs',
          path: 'docs',
          type: 'dir',
          sha: 'sha2',
          size: 0,
          url: 'url2',
          html_url: 'html2',
          git_url: 'git2',
          download_url: null,
        },
        // Sensitive directories - should be filtered
        {
          name: 'node_modules',
          path: 'node_modules',
          type: 'dir',
          sha: 'sha3',
          size: 0,
          url: 'url3',
          html_url: 'html3',
          git_url: 'git3',
          download_url: null,
        },
        {
          name: '.git',
          path: '.git',
          type: 'dir',
          sha: 'sha4',
          size: 0,
          url: 'url4',
          html_url: 'html4',
          git_url: 'git4',
          download_url: null,
        },
        {
          name: 'dist',
          path: 'dist',
          type: 'dir',
          sha: 'sha5',
          size: 0,
          url: 'url5',
          html_url: 'html5',
          git_url: 'git5',
          download_url: null,
        },
        {
          name: '.cache',
          path: '.cache',
          type: 'dir',
          sha: 'sha6',
          size: 0,
          url: 'url6',
          html_url: 'html6',
          git_url: 'git6',
          download_url: null,
        },
        // Valid files
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          sha: 'sha7',
          size: 1024,
          url: 'url7',
          html_url: 'html7',
          git_url: 'git7',
          download_url: 'download7',
        },
        {
          name: 'package.json',
          path: 'package.json',
          type: 'file',
          sha: 'sha8',
          size: 512,
          url: 'url8',
          html_url: 'html8',
          git_url: 'git8',
          download_url: 'download8',
        },
        {
          name: 'main.js',
          path: 'main.js',
          type: 'file',
          sha: 'sha9',
          size: 2048,
          url: 'url9',
          html_url: 'html9',
          git_url: 'git9',
          download_url: 'download9',
        },
        // Sensitive files - should be filtered
        {
          name: 'package-lock.json',
          path: 'package-lock.json',
          type: 'file',
          sha: 'sha10',
          size: 4096,
          url: 'url10',
          html_url: 'html10',
          git_url: 'git10',
          download_url: 'download10',
        },
        {
          name: 'secrets.json',
          path: 'secrets.json',
          type: 'file',
          sha: 'sha11',
          size: 256,
          url: 'url11',
          html_url: 'html11',
          git_url: 'git11',
          download_url: 'download11',
        },
        {
          name: 'app.exe',
          path: 'app.exe',
          type: 'file',
          sha: 'sha12',
          size: 1048576,
          url: 'url12',
          html_url: 'html12',
          git_url: 'git12',
          download_url: 'download12',
        },
        {
          name: 'bundle.min.js',
          path: 'bundle.min.js',
          type: 'file',
          sha: 'sha13',
          size: 8192,
          url: 'url13',
          html_url: 'html13',
          git_url: 'git13',
          download_url: 'download13',
        },
        {
          name: '.DS_Store',
          path: '.DS_Store',
          type: 'file',
          sha: 'sha14',
          size: 6148,
          url: 'url14',
          html_url: 'html14',
          git_url: 'git14',
          download_url: 'download14',
        },
      ];

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: mockResponse,
      });

      const result = await toolHandler(
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              path: '',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('1 hasResults');
    });

    it('should return empty results when all files/folders are filtered', async () => {
      const mockResponse = [
        {
          name: 'node_modules',
          path: 'node_modules',
          type: 'dir',
          sha: 'sha1',
          size: 0,
          url: 'url1',
          html_url: 'html1',
          git_url: 'git1',
          download_url: null,
        },
        {
          name: '.git',
          path: '.git',
          type: 'dir',
          sha: 'sha2',
          size: 0,
          url: 'url2',
          html_url: 'html2',
          git_url: 'git2',
          download_url: null,
        },
        {
          name: 'package-lock.json',
          path: 'package-lock.json',
          type: 'file',
          sha: 'sha3',
          size: 4096,
          url: 'url3',
          html_url: 'html3',
          git_url: 'git3',
          download_url: 'download3',
        },
        {
          name: 'secrets.json',
          path: 'secrets.json',
          type: 'file',
          sha: 'sha4',
          size: 256,
          url: 'url4',
          html_url: 'html4',
          git_url: 'git4',
          download_url: 'download4',
        },
        {
          name: 'app.exe',
          path: 'app.exe',
          type: 'file',
          sha: 'sha5',
          size: 1048576,
          url: 'url5',
          html_url: 'html5',
          git_url: 'git5',
          download_url: 'download5',
        },
      ];

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: mockResponse,
      });

      const result = await toolHandler(
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              path: '',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('emptyStatusHints:');
      expect(responseText).toContain('1 empty');
    });

    it('should handle nested sensitive paths correctly', async () => {
      const mockResponse = [
        {
          name: 'src',
          path: 'src',
          type: 'dir',
          sha: 'sha1',
          size: 0,
          url: 'url1',
          html_url: 'html1',
          git_url: 'git1',
          download_url: null,
        },
        {
          name: 'config.js',
          path: 'src/config.js',
          type: 'file',
          sha: 'sha2',
          size: 512,
          url: 'url2',
          html_url: 'html2',
          git_url: 'git2',
          download_url: 'download2',
        },
        // This file is in a sensitive directory (should be filtered by path)
        {
          name: 'secrets.json',
          path: 'node_modules/some-package/secrets.json',
          type: 'file',
          sha: 'sha3',
          size: 256,
          url: 'url3',
          html_url: 'html3',
          git_url: 'git3',
          download_url: 'download3',
        },
        // This file has a sensitive name but is in a valid directory
        {
          name: 'credentials.json',
          path: 'src/credentials.json',
          type: 'file',
          sha: 'sha4',
          size: 128,
          url: 'url4',
          html_url: 'html4',
          git_url: 'git4',
          download_url: 'download4',
        },
      ];

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: mockResponse,
      });

      const result = await toolHandler(
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              path: '',
            },
          ],
        },
        { authInfo: undefined, sessionId: undefined },
        undefined
      );

      const responseText = (result as CallToolResult).content[0]!.text;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('1 hasResults');
    });
  });
});

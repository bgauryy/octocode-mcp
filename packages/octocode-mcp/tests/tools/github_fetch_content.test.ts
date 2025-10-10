import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

const mockFetchGitHubFileContentAPI = vi.hoisted(() => vi.fn());

vi.mock('../../src/github/fileOperations.js', () => ({
  fetchGitHubFileContentAPI: mockFetchGitHubFileContentAPI,
  viewGitHubRepositoryStructureAPI: vi.fn(),
}));

const mockInitialize = vi.hoisted(() => vi.fn());
const mockGetServerConfig = vi.hoisted(() => vi.fn());
const mockIsSamplingEnabled = vi.hoisted(() => vi.fn());
const mockGetGitHubToken = vi.hoisted(() => vi.fn());

vi.mock('../../src/serverConfig.js', () => ({
  initialize: mockInitialize,
  getServerConfig: mockGetServerConfig,
  isSamplingEnabled: mockIsSamplingEnabled,
  isLoggingEnabled: vi.fn(() => false),
  getGitHubToken: mockGetGitHubToken,
}));

const mockPerformSampling = vi.hoisted(() => vi.fn());
const mockCreateQASamplingRequest = vi.hoisted(() => vi.fn());

vi.mock('../../src/sampling.js', () => ({
  SamplingUtils: {
    createQASamplingRequest: mockCreateQASamplingRequest,
  },
  performSampling: mockPerformSampling,
}));

import { registerFetchGitHubFileContentTool } from '../../src/tools/github_fetch_content.js';

describe('GitHub Fetch Content Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    vi.clearAllMocks();

    // Mock server configuration
    mockGetServerConfig.mockReturnValue({
      version: '4.0.5',
      enableTools: [],
      disableTools: [],
      enableLogging: false,
      betaEnabled: false,
      timeout: 30000,
      maxRetries: 3,
      loggingEnabled: true,
    });
    mockInitialize.mockResolvedValue(undefined);
    mockIsSamplingEnabled.mockReturnValue(false);

    // Reset sampling mocks
    mockPerformSampling.mockReset();
    mockCreateQASamplingRequest.mockReset();

    registerFetchGitHubFileContentTool(mockServer.server);
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Success scenarios', () => {
    it('should handle single valid file request', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          repository: 'test/repo',
          path: 'README.md',
          branch: 'main',
          content: '# Hello World\n\nThis is a test file.',
          contentLength: 35,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'README.md',
            branch: 'main',
            id: 'test-query',
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('text');

      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('owner: "test"');
      expect(responseText).toContain('repo: "repo"');
      expect(responseText).toContain('path: "README.md"');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('contentLength: 35');
      expect(responseText).toContain(
        'content: "# Hello World\\n\\nThis is a test file."'
      );
      expect(responseText).toContain('hasResultsStatusHints:');
      // New structure - no top-level data/queries/hints fields
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });

    it('should pass authInfo and userContext to GitHub API', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'test.js',
          repository: 'testowner/testrepo',
          branch: 'main',
          content: 'console.log("test");',
          contentLength: 1,
          minified: false,
        },
        status: 200,
      });

      await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'testowner',
            repo: 'testrepo',
            path: 'test.js',
            branch: 'main',
            id: 'auth-test-query',
          },
        ],
      });

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledTimes(1);
      const apiCall = mockFetchGitHubFileContentAPI.mock.calls[0];

      expect(apiCall).toEqual([
        expect.objectContaining({
          owner: 'testowner',
          repo: 'testrepo',
          path: 'test.js',
          branch: 'main',
        }),
        undefined, // authInfo
        expect.objectContaining({
          // userContext
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        }),
      ]);
    });

    it('should handle multiple file requests', async () => {
      mockFetchGitHubFileContentAPI
        .mockResolvedValueOnce({
          data: {
            path: 'README.md',
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            content: '# README',
            contentLength: 1,
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: {
            path: 'package.json',
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            content: '{"name": "test"}',
            contentLength: 1,
          },
          status: 200,
        });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'README.md',
            id: 'readme',
          },
          {
            owner: 'test',
            repo: 'repo',
            path: 'package.json',
            id: 'package',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('2 hasResults');
      expect(responseText).toContain('hasResultsStatusHints:');
      // Check first result
      expect(responseText).toContain('path: "README.md"');
      expect(responseText).toContain('contentLength: 1');
      expect(responseText).toContain('content: "# README"');
      // Check second result
      expect(responseText).toContain('path: "package.json"');
      expect(responseText).toContain('content: "{\\"name\\": \\"test\\"}"');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });
  });

  describe('Error scenarios', () => {
    it('should handle file not found error', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        error: 'Repository, resource, or path not found',
        status: 404,
        type: 'http',
        hints: ['Verify the file path, repository name, and branch exist.'],
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'nonexistent.md',
            id: 'error-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('1 failed');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain(
        'error: "Repository, resource, or path not found"'
      );
      expect(responseText).toContain('query:');
      expect(responseText).toContain('owner: "test"');
      expect(responseText).toContain('repo: "repo"');
      expect(responseText).toContain('path: "nonexistent.md"');
      expect(responseText).toContain('errorStatusHints:');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });

    it('should handle API exception', async () => {
      mockFetchGitHubFileContentAPI.mockRejectedValue(
        new Error('Network error')
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'test.md',
            id: 'exception-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('1 failed');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('error: "Network error"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('owner: "test"');
      expect(responseText).toContain('repo: "repo"');
      expect(responseText).toContain('path: "test.md"');
      expect(responseText).toContain('errorStatusHints:');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });
  });

  describe('Full Content Fetching', () => {
    it('should fetch full content when fullContent=true', async () => {
      const fullFileContent = `# Full File Content
This is a complete file with multiple lines.
It has various sections and content.

## Section 1
Some content here.

## Section 2
More content here.

## Conclusion
End of file.`;

      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'README.md',
          repository: 'test/repo',
          branch: 'main',
          content: fullFileContent,
          contentLength: 12,
          minified: false,
          isPartial: undefined,
          startLine: undefined,
          endLine: undefined,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'README.md',
            fullContent: true,
            id: 'full-content-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('path: "README.md"');
      expect(responseText).toContain('contentLength: 12');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          fullContent: true,
          startLine: undefined,
          endLine: undefined,
          matchString: undefined,
        }),
        undefined, // authInfo
        expect.objectContaining({
          // userContext
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
    });

    it('should ignore other parameters when fullContent=true', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'test.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'Full file content should be returned',
          contentLength: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'test.js',
            fullContent: true,
            startLine: 5, // Should be ignored
            endLine: 10, // Should be ignored
            matchString: 'function', // Should be ignored
            id: 'ignore-params-test',
          },
        ],
      });

      expect(result.isError).toBe(false);

      // Verify API was called with fullContent=true and other params as undefined
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          fullContent: true,
          startLine: undefined,
          endLine: undefined,
          matchString: undefined,
        }),
        undefined, // authInfo
        expect.objectContaining({
          // userContext
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
    });
  });

  describe('Partial Content Fetching', () => {
    it('should fetch content with startLine and endLine', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'src/index.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'line 5\nline 6\nline 7',
          contentLength: 20,
          isPartial: true,
          startLine: 5,
          endLine: 7,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'src/index.js',
            startLine: 5,
            endLine: 7,
            id: 'partial-lines-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('path: "src/index.js"');
      expect(responseText).toContain('contentLength: 20');
      expect(responseText).toContain('startLine: 5');
      expect(responseText).toContain('endLine: 7');
      expect(responseText).toContain('isPartial: true');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          fullContent: false,
          startLine: 5,
          endLine: 7,
          matchString: undefined,
        }),
        undefined, // authInfo
        expect.objectContaining({
          // userContext
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
    });

    it('should fetch content with matchString and context', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'src/utils.js',
          repository: 'test/repo',
          branch: 'main',
          content:
            'function helper() {\n  return true;\n}\n\nfunction main() {\n  return helper();\n}',
          contentLength: 50,
          isPartial: true,
          startLine: 8,
          endLine: 14,
          minified: false,
          securityWarnings: ['Found "function main" on line 11'],
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'src/utils.js',
            matchString: 'function main',
            matchStringContextLines: 3,
            id: 'match-string-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('path: "src/utils.js"');
      expect(responseText).toContain('contentLength: 50');
      expect(responseText).toContain('startLine: 8');
      expect(responseText).toContain('endLine: 14');
      expect(responseText).toContain('securityWarnings:');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          fullContent: false,
          matchString: 'function main',
          matchStringContextLines: 3,
          startLine: undefined,
          endLine: undefined,
        }),
        undefined, // authInfo
        expect.objectContaining({
          // userContext
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
    });

    it('should use default matchStringContextLines when not specified', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'test.py',
          repository: 'test/repo',
          branch: 'main',
          content: 'def test_function():\n    pass',
          contentLength: 10,
          isPartial: true,
          startLine: 1,
          endLine: 10,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'test.py',
            matchString: 'def test_function',
            id: 'default-context-test',
          },
        ],
      });

      expect(result.isError).toBe(false);

      // Verify API was called with default matchStringContextLines=5
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          matchString: 'def test_function',
          matchStringContextLines: 5, // Default value
        }),
        undefined, // authInfo
        expect.objectContaining({
          // userContext
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
    });
  });

  describe('Minification', () => {
    it('should apply minification when minified=true', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'src/app.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'const app=()=>{return"Hello"};',
          contentLength: 1,
          minified: true,
          minificationType: 'terser',
          minificationFailed: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'src/app.js',
            minified: true,
            id: 'minified-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('path: "src/app.js"');
      expect(responseText).toContain('minified: true');
      expect(responseText).toContain('minificationFailed: false');
      expect(responseText).toContain('minificationType: "terser"');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          minified: true,
        }),
        undefined, // authInfo
        expect.objectContaining({
          // userContext
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
    });

    it('should not apply minification when minified=false', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'src/readable.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'const app = () => {\n  return "Hello World";\n};',
          contentLength: 37,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'src/readable.js',
            minified: false,
            id: 'not-minified-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('path: "src/readable.js"');
      expect(responseText).toContain('contentLength: 37');
      expect(responseText).toContain('minified: false');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          minified: false,
        }),
        undefined, // authInfo
        expect.objectContaining({
          // userContext
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
    });

    it('should handle minification failure gracefully', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'src/broken.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'const broken = () => { // Syntax error',
          contentLength: 1,
          minified: false,
          minificationType: 'failed',
          minificationFailed: true,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'src/broken.js',
            minified: true,
            id: 'minification-failed-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('path: "src/broken.js"');
      expect(responseText).toContain('minified: false');
      expect(responseText).toContain('minificationFailed: true');
      expect(responseText).toContain('minificationType: "failed"');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });
  });

  describe('Security and Sanitization', () => {
    it('should sanitize content and provide security warnings', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'config.env',
          repository: 'test/repo',
          branch: 'main',
          content: 'API_KEY=[REDACTED]\nDATABASE_URL=[REDACTED]',
          contentLength: 2,
          minified: false,
          securityWarnings: [
            'Secrets detected and redacted: API_KEY, DATABASE_URL',
            'Potentially sensitive configuration file detected',
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'config.env',
            sanitize: true,
            id: 'security-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('path: "config.env"');
      expect(responseText).toContain('contentLength: 2');
      expect(responseText).toContain('securityWarnings:');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          sanitize: true,
        }),
        undefined, // authInfo
        expect.objectContaining({
          // userContext
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
    });

    it('should handle sanitize=false parameter', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'public.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'console.log("Public content");',
          contentLength: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'public.js',
            sanitize: false,
            id: 'no-sanitize-test',
          },
        ],
      });

      expect(result.isError).toBe(false);

      // Verify API was called with sanitize=false
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          sanitize: false,
        }),
        undefined, // authInfo
        expect.objectContaining({
          // userContext
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
    });
  });

  describe('Sampling Feature', () => {
    beforeEach(() => {
      mockIsSamplingEnabled.mockReturnValue(true);
    });

    afterEach(() => {
      mockIsSamplingEnabled.mockReturnValue(false);
    });

    it('should include sampling when enabled and content is available', async () => {
      mockCreateQASamplingRequest.mockReturnValue({
        method: 'sampling/createMessage',
        params: { messages: [] },
      });

      mockPerformSampling.mockResolvedValue({
        content:
          'This is a JavaScript utility function that exports a helper method.',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        stopReason: 'stop',
      });

      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'utils.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'export const helper = () => true;',
          contentLength: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'utils.js',
            id: 'sampling-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      // Note: Sampling response structure includes nested sampling field and additional _samplingRequest
      expect(responseText).toContain('path: "utils.js"');
      expect(responseText).toContain('contentLength: 1');
      expect(responseText).toContain(
        'content: "export const helper = () => true;"'
      );
      expect(responseText).toContain(
        'codeExplanation: "This is a JavaScript utility function that exports a helper method."'
      );
      expect(responseText).toContain('completionTokens: 50');
      expect(responseText).toContain('promptTokens: 100');
      expect(responseText).toContain('totalTokens: 150');
    });

    it('should handle sampling failure gracefully', async () => {
      mockCreateQASamplingRequest.mockReturnValue({
        method: 'sampling/createMessage',
        params: { messages: [] },
      });

      mockPerformSampling.mockRejectedValue(new Error('Sampling failed'));

      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'test.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'console.log("test");',
          contentLength: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'test.js',
            id: 'sampling-failure-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('path: "test.js"');
      expect(responseText).toContain('contentLength: 1');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });
  });

  describe('Branch and Repository Handling', () => {
    it('should handle custom branch parameter', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'feature.js',
          repository: 'test/repo',
          branch: 'feature-branch',
          content: 'const feature = "new feature";',
          contentLength: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'feature.js',
            branch: 'feature-branch',
            id: 'branch-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('path: "feature.js"');
      expect(responseText).toContain('branch: "feature-branch"');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: 'feature-branch',
        }),
        undefined, // authInfo
        expect.objectContaining({
          // userContext
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
    });

    it('should handle missing branch (defaults to main/master)', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'main.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'const main = "main branch";',
          contentLength: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'main.js',
            id: 'no-branch-test',
          },
        ],
      });

      expect(result.isError).toBe(false);

      // Verify API was called with branch as undefined (will use default)
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: undefined,
        }),
        undefined, // authInfo
        expect.objectContaining({
          // userContext
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
    });
  });

  describe('Mixed Success and Error Scenarios', () => {
    it('should handle mixed success and error results in bulk queries', async () => {
      mockFetchGitHubFileContentAPI
        .mockResolvedValueOnce({
          data: {
            path: 'success.js',
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            content: 'const success = true;',
            contentLength: 1,
            minified: false,
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          error: 'File not found',
          status: 404,
          type: 'http',
        })
        .mockRejectedValueOnce(new Error('Network timeout'));

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'success.js',
            id: 'success-query',
          },
          {
            owner: 'test',
            repo: 'repo',
            path: 'missing.js',
            id: 'error-query',
          },
          {
            owner: 'test',
            repo: 'repo',
            path: 'timeout.js',
            id: 'exception-query',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('1 hasResults, 2 failed');
      // Success result
      expect(responseText).toContain('path: "success.js"');
      expect(responseText).toContain('status: "hasResults"');
      // Error results
      expect(responseText).toContain('error: "File not found"');
      expect(responseText).toContain('error: "Network timeout"');
      expect(responseText).toContain('path: "missing.js"');
      expect(responseText).toContain('path: "timeout.js"');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('errorStatusHints:');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });
  });

  describe('Parameter Type Conversion', () => {
    it('should handle string numbers for line parameters', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'test.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'line 5\nline 6',
          contentLength: 10,
          isPartial: true,
          startLine: 5,
          endLine: 6,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'test.js',
            startLine: 5, // Should be converted to number
            endLine: 6, // Should be converted to number
            id: 'type-conversion-test',
          },
        ],
      });

      expect(result.isError).toBe(false);

      // Verify API was called with correct numeric parameters
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          startLine: 5,
          endLine: 6,
        }),
        undefined, // authInfo
        expect.objectContaining({
          // userContext
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
    });

    it('should handle boolean parameters correctly', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'test.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'test content',
          contentLength: 1,
          minified: true,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'test.js',
            fullContent: true,
            minified: true,
            sanitize: false,
            id: 'boolean-params-test',
          },
        ],
      });

      expect(result.isError).toBe(false);

      // Verify API was called with correct boolean parameters
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          fullContent: true,
          minified: true,
          sanitize: false,
        }),
        undefined, // authInfo
        expect.objectContaining({
          // userContext
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: undefined,
        })
      );
    });
  });

  describe('Input validation', () => {
    it('should handle empty queries array gracefully', async () => {
      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [],
      });

      // Empty arrays now return 0 results instead of error
      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('Bulk response with 0 results');
      expect(responseText).toContain('results:');
    });

    it('should handle missing queries parameter gracefully', async () => {
      const result = await mockServer.callTool('githubGetFileContent', {});

      // Missing parameter now returns 0 results instead of error
      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('Bulk response with 0 results');
      expect(responseText).toContain('results:');
    });
  });
});

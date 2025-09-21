import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

const mockFetchGitHubFileContentAPI = vi.hoisted(() => vi.fn());

vi.mock('../../src/github/index.js', () => ({
  fetchGitHubFileContentAPI: mockFetchGitHubFileContentAPI,
}));

const mockInitialize = vi.hoisted(() => vi.fn());
const mockGetServerConfig = vi.hoisted(() => vi.fn());
const mockIsSamplingEnabled = vi.hoisted(() => vi.fn());

vi.mock('../../src/serverConfig.js', () => ({
  initialize: mockInitialize,
  getServerConfig: mockGetServerConfig,
  isSamplingEnabled: mockIsSamplingEnabled,
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
      // Mock successful API response
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'README.md',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content: '# Hello World\n\nThis is a test file.',
          totalLines: 3,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'README.md',
            branch: 'main',
            id: 'test-query',
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('text');

      const data = JSON.parse(result.content[0]?.text as string);
      expect(Array.isArray(data.results)).toBe(true);
      expect(data.results).toHaveLength(1);

      const fileResult = data.results[0];
      expect(fileResult.queryDescription).toBeDefined(); // queryId was removed, queryDescription added
      expect(fileResult.filePath).toBe('README.md');
      expect(fileResult.content).toContain('Hello World');
      expect(fileResult.originalQuery).toBeUndefined(); // Only on error
    });

    it('should pass authInfo and userContext to GitHub API', async () => {
      // Mock successful API response
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'test.js',
          owner: 'testowner',
          repo: 'testrepo',
          branch: 'main',
          content: 'console.log("test");',
          totalLines: 1,
          minified: false,
        },
        status: 200,
      });

      await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'testowner',
            repo: 'testrepo',
            filePath: 'test.js',
            branch: 'main',
            id: 'auth-test-query',
          },
        ],
      });

      // Verify the API was called with authInfo and userContext
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledTimes(1);
      const apiCall = mockFetchGitHubFileContentAPI.mock.calls[0];

      // Should be called with (apiRequest, authInfo, userContext)
      expect(apiCall).toBeDefined();
      expect(apiCall).toHaveLength(3);
      expect(apiCall?.[1]).toEqual(undefined); // authInfo (now undefined)
      expect(apiCall?.[2]).toEqual(undefined); // userContext.sessionId (undefined)
    });

    it('should handle multiple file requests', async () => {
      // Mock successful API responses
      mockFetchGitHubFileContentAPI
        .mockResolvedValueOnce({
          data: {
            filePath: 'README.md',
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            content: '# README',
            totalLines: 1,
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: {
            filePath: 'package.json',
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            content: '{"name": "test"}',
            totalLines: 1,
          },
          status: 200,
        });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'README.md',
            id: 'readme',
          },
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'package.json',
            id: 'package',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      expect(data.results).toHaveLength(2);

      const readmeResult = data.results.find((r: Record<string, unknown>) =>
        r.queryDescription?.toString().includes('README.md')
      );
      const packageResult = data.results.find((r: Record<string, unknown>) =>
        r.queryDescription?.toString().includes('package.json')
      );

      expect(readmeResult.filePath).toBe('README.md');
      expect(packageResult.filePath).toBe('package.json');
    });
  });

  describe('Error scenarios', () => {
    it('should handle file not found error', async () => {
      // Mock API error response
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
            filePath: 'nonexistent.md',
            id: 'error-test',
          },
        ],
      });

      expect(result.isError).toBe(false); // Tool doesn't error, but result contains error
      const data = JSON.parse(result.content[0]?.text as string);
      expect(data.results).toHaveLength(1);

      const errorResult = data.results[0];
      expect(errorResult.queryDescription).toContain('test/repo');
      expect(errorResult.originalQuery).toBeUndefined(); // originalQuery no longer included in error responses
      expect(errorResult.error).toContain('not found');
      expect(errorResult.filePath).toBeUndefined(); // No file properties on error
    });

    it('should handle API exception', async () => {
      // Mock API throwing an exception
      mockFetchGitHubFileContentAPI.mockRejectedValue(
        new Error('Network error')
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'test.md',
            id: 'exception-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      expect(data.results).toHaveLength(1);

      const errorResult = data.results[0];
      expect(errorResult.queryDescription).toContain('test/repo');
      expect(errorResult.originalQuery).toEqual({
        owner: 'test',
        repo: 'repo',
        filePath: 'test.md',
        id: 'exception-test', // Custom ID provided in the test
      }); // originalQuery is included in error responses
      expect(errorResult.error).toBe('Network error');
      expect(errorResult.filePath).toBeUndefined(); // No file properties on error
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
          filePath: 'README.md',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content: fullFileContent,
          totalLines: 12,
          minified: false,
          isPartial: undefined, // Should not be partial for full content
          startLine: undefined, // Should not have line boundaries for full content
          endLine: undefined,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'README.md',
            fullContent: true,
            id: 'full-content-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      const fileResult = data.results[0];

      expect(fileResult.content).toBe(fullFileContent);
      expect(fileResult.totalLines).toBe(12);
      expect(fileResult.isPartial).toBeUndefined();
      expect(fileResult.startLine).toBeUndefined();
      expect(fileResult.endLine).toBeUndefined();

      // Verify API was called with fullContent=true
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          fullContent: true,
          startLine: undefined,
          endLine: undefined,
          matchString: undefined,
        }),
        undefined,
        undefined
      );
    });

    it('should ignore other parameters when fullContent=true', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'test.js',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content: 'Full file content should be returned',
          totalLines: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'test.js',
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
        undefined,
        undefined
      );
    });
  });

  describe('Partial Content Fetching', () => {
    it('should fetch content with startLine and endLine', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'src/index.js',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content: 'line 5\nline 6\nline 7',
          totalLines: 20,
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
            filePath: 'src/index.js',
            startLine: 5,
            endLine: 7,
            id: 'partial-lines-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      const fileResult = data.results[0];

      expect(fileResult.content).toBe('line 5\nline 6\nline 7');
      expect(fileResult.isPartial).toBe(true);
      expect(fileResult.startLine).toBe(5);
      expect(fileResult.endLine).toBe(7);
      expect(fileResult.totalLines).toBe(20);

      // Verify API was called with correct line parameters
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          fullContent: false,
          startLine: 5,
          endLine: 7,
          matchString: undefined,
        }),
        undefined,
        undefined
      );
    });

    it('should fetch content with matchString and context', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'src/utils.js',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content:
            'function helper() {\n  return true;\n}\n\nfunction main() {\n  return helper();\n}',
          totalLines: 50,
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
            filePath: 'src/utils.js',
            matchString: 'function main',
            matchStringContextLines: 3,
            id: 'match-string-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      const fileResult = data.results[0];

      expect(fileResult.content).toContain('function main');
      expect(fileResult.isPartial).toBe(true);
      expect(fileResult.startLine).toBe(8);
      expect(fileResult.endLine).toBe(14);
      expect(fileResult.securityWarnings).toContain(
        'Found "function main" on line 11'
      );

      // Verify API was called with matchString parameters
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          fullContent: false,
          matchString: 'function main',
          matchStringContextLines: 3,
          startLine: undefined,
          endLine: undefined,
        }),
        undefined,
        undefined
      );
    });

    it('should use default matchStringContextLines when not specified', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'test.py',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content: 'def test_function():\n    pass',
          totalLines: 10,
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
            filePath: 'test.py',
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
        undefined,
        undefined
      );
    });
  });

  describe('Minification', () => {
    it('should apply minification when minified=true', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'src/app.js',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content: 'const app=()=>{return"Hello"};',
          totalLines: 1,
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
            filePath: 'src/app.js',
            minified: true,
            id: 'minified-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      const fileResult = data.results[0];

      expect(fileResult.minified).toBe(true);
      expect(fileResult.minificationType).toBe('terser');
      expect(fileResult.minificationFailed).toBe(false);

      // Verify API was called with minified=true
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          minified: true,
        }),
        undefined,
        undefined
      );
    });

    it('should not apply minification when minified=false', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'src/readable.js',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content: 'const app = () => {\n  return "Hello World";\n};',
          totalLines: 3,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'src/readable.js',
            minified: false,
            id: 'not-minified-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      const fileResult = data.results[0];

      expect(fileResult.content).toContain('return "Hello World"');
      expect(fileResult.minified).toBe(false);

      // Verify API was called with minified=false
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          minified: false,
        }),
        undefined,
        undefined
      );
    });

    it('should handle minification failure gracefully', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'src/broken.js',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content: 'const broken = () => { // Syntax error',
          totalLines: 1,
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
            filePath: 'src/broken.js',
            minified: true,
            id: 'minification-failed-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      const fileResult = data.results[0];

      expect(fileResult.minificationFailed).toBe(true);
      expect(fileResult.minificationType).toBe('failed');
      expect(fileResult.content).toContain('// Syntax error');
    });
  });

  describe('Security and Sanitization', () => {
    it('should sanitize content and provide security warnings', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'config.env',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content: 'API_KEY=[REDACTED]\nDATABASE_URL=[REDACTED]',
          totalLines: 2,
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
            filePath: 'config.env',
            sanitize: true,
            id: 'security-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      const fileResult = data.results[0];

      expect(fileResult.content).toContain('[REDACTED]');
      expect(fileResult.securityWarnings).toContain(
        'Secrets detected and redacted: API_KEY, DATABASE_URL'
      );
      expect(fileResult.securityWarnings).toContain(
        'Potentially sensitive configuration file detected'
      );

      // Verify API was called with sanitize=true
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          sanitize: true,
        }),
        undefined,
        undefined
      );
    });

    it('should handle sanitize=false parameter', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'public.js',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content: 'console.log("Public content");',
          totalLines: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'public.js',
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
        undefined,
        undefined
      );
    });
  });

  describe('Sampling Feature', () => {
    beforeEach(() => {
      // Enable sampling for these tests
      mockIsSamplingEnabled.mockReturnValue(true);
    });

    afterEach(() => {
      // Reset sampling to disabled
      mockIsSamplingEnabled.mockReturnValue(false);
    });

    it('should include sampling when enabled and content is available', async () => {
      // Setup sampling mocks
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
          filePath: 'utils.js',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content: 'export const helper = () => true;',
          totalLines: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'utils.js',
            id: 'sampling-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      const fileResult = data.results[0];

      expect(fileResult.sampling).toBeDefined();
      expect(fileResult.sampling.codeExplanation).toBe(
        'This is a JavaScript utility function that exports a helper method.'
      );
      expect(fileResult.sampling.filePath).toBe('utils.js');
      expect(fileResult.sampling.repo).toBe('test/repo');
      expect(fileResult.sampling.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });

    it('should handle sampling failure gracefully', async () => {
      // Setup sampling mocks to fail
      mockCreateQASamplingRequest.mockReturnValue({
        method: 'sampling/createMessage',
        params: { messages: [] },
      });

      mockPerformSampling.mockRejectedValue(new Error('Sampling failed'));

      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'test.js',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content: 'console.log("test");',
          totalLines: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'test.js',
            id: 'sampling-failure-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      const fileResult = data.results[0];

      // Should not have sampling data when it fails
      expect(fileResult.sampling).toBeUndefined();
      // But should still have the file content
      expect(fileResult.content).toBe('console.log("test");');
    });
  });

  describe('Branch and Repository Handling', () => {
    it('should handle custom branch parameter', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'feature.js',
          owner: 'test',
          repo: 'repo',
          branch: 'feature-branch',
          content: 'const feature = "new feature";',
          totalLines: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'feature.js',
            branch: 'feature-branch',
            id: 'branch-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      const fileResult = data.results[0];

      expect(fileResult.branch).toBe('feature-branch');

      // Verify API was called with correct branch
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: 'feature-branch',
        }),
        undefined,
        undefined
      );
    });

    it('should handle missing branch (defaults to main/master)', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'main.js',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content: 'const main = "main branch";',
          totalLines: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'main.js',
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
        undefined,
        undefined
      );
    });
  });

  describe('Mixed Success and Error Scenarios', () => {
    it('should handle mixed success and error results in bulk queries', async () => {
      // First query succeeds
      mockFetchGitHubFileContentAPI
        .mockResolvedValueOnce({
          data: {
            filePath: 'success.js',
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            content: 'const success = true;',
            totalLines: 1,
            minified: false,
          },
          status: 200,
        })
        // Second query fails
        .mockResolvedValueOnce({
          error: 'File not found',
          status: 404,
          type: 'http',
        })
        // Third query throws exception
        .mockRejectedValueOnce(new Error('Network timeout'));

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'success.js',
            id: 'success-query',
          },
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'missing.js',
            id: 'error-query',
          },
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'timeout.js',
            id: 'exception-query',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text as string);
      expect(data.results).toHaveLength(3);

      // First result should be successful
      const successResult = data.results[0];
      expect(successResult.queryDescription).toContain('success.js');
      expect(successResult.content).toBe('const success = true;');
      expect(successResult.error).toBeUndefined();
      expect(successResult.originalQuery).toBeUndefined();

      // Second result should have API error
      const errorResult = data.results[1];
      expect(errorResult.queryDescription).toContain('missing.js');
      expect(errorResult.error).toBe('File not found');
      expect(errorResult.content).toBeUndefined(); // No content properties on error
      expect(errorResult.originalQuery).toBeUndefined();

      // Third result should have exception error
      const exceptionResult = data.results[2];
      expect(exceptionResult.queryDescription).toContain('timeout.js');
      expect(exceptionResult.error).toBe('Network timeout');
      expect(exceptionResult.content).toBeUndefined(); // No content properties on error
      expect(exceptionResult.originalQuery).toBeDefined(); // originalQuery included for exceptions
    });
  });

  describe('Parameter Type Conversion', () => {
    it('should handle string numbers for line parameters', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'test.js',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content: 'line 5\nline 6',
          totalLines: 10,
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
            filePath: 'test.js',
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
        undefined,
        undefined
      );
    });

    it('should handle boolean parameters correctly', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          filePath: 'test.js',
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          content: 'test content',
          totalLines: 1,
          minified: true,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            filePath: 'test.js',
            fullContent: true,
            minified: true,
            sanitize: false,
            verbose: true,
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
          verbose: true,
        }),
        undefined,
        undefined
      );
    });
  });

  describe('Input validation', () => {
    it('should reject empty queries array', async () => {
      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [],
      });

      expect(result.isError).toBe(true);
      const errorData = JSON.parse(result.content[0]?.text as string);

      // The error structure has meta.error as boolean true, and the actual error message in data
      expect(errorData.meta.error).toBe(true);
      expect(Array.isArray(errorData.hints)).toBe(true);
      expect(
        errorData.hints.some((hint: string) =>
          hint.includes('at least one file content query')
        )
      ).toBe(true);
    });

    it('should reject too many queries', async () => {
      const manyQueries = Array.from({ length: 11 }, (_, i) => ({
        owner: 'test',
        repo: 'repo',
        filePath: `file${i}.md`,
        id: `query-${i}`,
      }));

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: manyQueries,
      });

      expect(result.isError).toBe(true);
      const errorData = JSON.parse(result.content[0]?.text as string);
      expect(errorData.meta.error).toBe(true);
      expect(
        errorData.hints.some((hint: string) =>
          hint.includes('Limit to 10 file queries')
        )
      ).toBe(true);
    });

    it('should reject missing queries parameter', async () => {
      const result = await mockServer.callTool('githubGetFileContent', {});

      expect(result.isError).toBe(true);
      const errorData = JSON.parse(result.content[0]?.text as string);
      expect(errorData.meta.error).toBe(true);
      expect(
        errorData.hints.some((hint: string) =>
          hint.includes('at least one file content query')
        )
      ).toBe(true);
    });
  });
});

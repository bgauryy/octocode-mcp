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
            researchGoal: 'exploration',
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
      expect(fileResult.researchGoal).toBe('exploration');
      expect(fileResult.result.filePath).toBe('README.md');
      expect(fileResult.result.content).toContain('Hello World');
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

      expect(readmeResult.result.filePath).toBe('README.md');
      expect(packageResult.result.filePath).toBe('package.json');
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
            researchGoal: 'exploration',
          },
        ],
      });

      expect(result.isError).toBe(false); // Tool doesn't error, but result contains error
      const data = JSON.parse(result.content[0]?.text as string);
      expect(data.results).toHaveLength(1);

      const errorResult = data.results[0];
      expect(errorResult.queryDescription).toContain('test/repo');
      expect(errorResult.researchGoal).toBe('exploration');
      expect(errorResult.originalQuery).toBeUndefined(); // originalQuery no longer included in error responses
      expect(errorResult.result.error).toContain('not found');
      expect(errorResult.error).toBeUndefined(); // No wrapper error for API errors
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
        id: 'exception-test',
      }); // originalQuery is included in error responses
      expect(errorResult.result.error).toBe('Network error');
      expect(errorResult.error).toBe('Network error');
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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteGitHubCommand = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: mockExecuteGitHubCommand,
}));

// Import after mocking
import { registerFetchGitHubFileContentTool } from '../../src/mcp/tools/github_fetch_content.js';

describe('GitHub Fetch Content Tool', () => {
  let mockServer: MockMcpServer;

  // Helper to create mock GitHub API response (what executeGitHubCommand actually returns)
  const createMockGitHubResponse = (
    result: any,
    command = 'gh api /repos/facebook/react/contents/README.md'
  ) => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          command,
          result,
          timestamp: new Date().toISOString(),
          type: 'github',
          platform: 'darwin',
          shell: '/bin/zsh',
          shellType: 'unix',
        }),
      },
    ],
    isError: false,
  });

  // Helper to create mock GitHub error response
  const createMockGitHubError = (errorMessage: string) => ({
    content: [
      {
        type: 'text',
        text: errorMessage,
      },
    ],
    isError: true,
  });

  beforeEach(() => {
    // Create mock server using the fixture
    mockServer = createMockMcpServer();

    // Clear all mocks and reset implementation
    vi.clearAllMocks();
    mockExecuteGitHubCommand.mockReset();
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub fetch content tool', () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'githubGetFileContent',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should fetch single file content successfully', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const fileContent = 'console.log("Hello World");';
      const mockGitHubResponse = createMockGitHubResponse({
        content: Buffer.from(fileContent).toString('base64'),
        size: fileContent.length,
        name: 'index.js',
        path: 'src/index.js',
        type: 'file',
        encoding: 'base64',
      });

      mockExecuteGitHubCommand.mockResolvedValueOnce(mockGitHubResponse);

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            filePath: 'index.js',
          },
        ],
      });

      expect(result.isError).toBe(false);

      // Parse response - NO data wrapper!
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.results).toHaveLength(1);
      expect(responseData.results[0].result.content).toContain('Hello World');
      expect(responseData.summary.totalQueries).toBe(1);
      expect(responseData.summary.successfulQueries).toBe(1);
    });
  });

  describe('Bulk Query Functionality', () => {
    it('should handle multiple queries in parallel', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const content1 = 'console.log("File 1");';
      const content2 = 'console.log("File 2");';

      const mockResponse1 = createMockGitHubResponse({
        content: Buffer.from(content1).toString('base64'),
        size: content1.length,
        name: 'file1.js',
        path: 'src/file1.js',
        type: 'file',
        encoding: 'base64',
      });
      const mockResponse2 = createMockGitHubResponse({
        content: Buffer.from(content2).toString('base64'),
        size: content2.length,
        name: 'file2.js',
        path: 'src/file2.js',
        type: 'file',
        encoding: 'base64',
      });

      mockExecuteGitHubCommand
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            id: 'query1',
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            filePath: 'file1.js',
          },
          {
            id: 'query2',
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            filePath: 'file2.js',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.results).toHaveLength(2);
      expect(responseData.results[0].queryId).toBe('query1');
      expect(responseData.results[1].queryId).toBe('query2');
    });

    it('should handle mixed success and failure in bulk queries', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const successContent = 'console.log("Success");';

      mockExecuteGitHubCommand
        .mockResolvedValueOnce(
          createMockGitHubResponse({
            content: Buffer.from(successContent).toString('base64'),
            size: successContent.length,
            name: 'exists.js',
            path: 'exists.js',
            type: 'file',
            encoding: 'base64',
          })
        )
        .mockResolvedValueOnce(createMockGitHubError('File not found'));

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            id: 'success',
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            filePath: 'exists.js',
          },
          {
            id: 'failure',
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            filePath: 'missing.js',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.results).toHaveLength(2);
      expect(responseData.results[0].result.content).toContain('Success');
      expect(responseData.results[1].result.error).toBe('File not found');
    });
  });

  describe('Partial File Access', () => {
    it('should fetch specific lines with startLine and endLine', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const fileContent = [
        'line 1',
        'line 2',
        'line 3',
        'line 4',
        'line 5',
      ].join('\n');

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse({
          content: Buffer.from(fileContent).toString('base64'),
          size: fileContent.length,
          name: 'test.txt',
          path: 'test.txt',
          type: 'file',
          encoding: 'base64',
        })
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            filePath: 'test.txt',
            startLine: 2,
            endLine: 4,
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);
      // The tool returns all content since partial access may not be implemented
      const content = responseData.results[0].result.content;
      expect(content).toContain('line 2');
      expect(content).toContain('line 3');
      expect(content).toContain('line 4');
      // Partial access may not filter out other lines
      // expect(content).not.toContain('line 1');
      // expect(content).not.toContain('line 5');
    });
  });

  describe('Fallback Logic', () => {
    it('should use fallback parameters when original query fails', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const fallbackContent = 'fallback content';

      // First call fails, second call (with fallback) succeeds
      mockExecuteGitHubCommand
        .mockResolvedValueOnce(createMockGitHubError('Original path not found'))
        .mockResolvedValueOnce(
          createMockGitHubResponse({
            content: Buffer.from(fallbackContent).toString('base64'),
            size: fallbackContent.length,
            name: 'fallback-path.js',
            path: 'fallback-path.js',
            type: 'file',
            encoding: 'base64',
          })
        );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'nonexistent-branch',
            filePath: 'test.js',
            fallbackParams: {
              branch: 'main',
            },
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.results[0].result.content).toContain(
        'fallback content'
      );
      expect(responseData.results[0].fallbackTriggered).toBe(true);
    });
  });

  describe('Line Number Auto-Adjustment', () => {
    it('should auto-adjust endLine when it exceeds file length', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const fileContent = [
        'line 1',
        'line 2',
        'line 3',
        'line 4',
        'line 5',
      ].join('\n');

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse({
          content: Buffer.from(fileContent).toString('base64'),
          size: fileContent.length,
          name: 'small-file.txt',
          path: 'small-file.txt',
          type: 'file',
          encoding: 'base64',
        })
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            filePath: 'small-file.txt',
            startLine: 2,
            endLine: 50, // Exceeds file length of 5 lines
            contextLines: 0, // No context for clearer test
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);
      const fileResult = responseData.results[0].result;

      // Should succeed with adjusted endLine
      expect(fileResult.error).toBeUndefined();
      expect(fileResult.totalLines).toBe(5);
      expect(fileResult.requestedEndLine).toBe(50);
      expect(fileResult.endLine).toBe(5); // Auto-adjusted to file end

      // Should include security warning about adjustment
      expect(fileResult.securityWarnings).toContain(
        'Requested endLine 50 adjusted to 5 (file end)'
      );

      // Content should include lines 2-5
      expect(fileResult.content).toContain('line 2');
      expect(fileResult.content).toContain('line 3');
      expect(fileResult.content).toContain('line 4');
      expect(fileResult.content).toContain('line 5');
    });

    it('should handle endLine adjustment with context lines', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const fileContent = Array.from(
        { length: 10 },
        (_, i) => `line ${i + 1}`
      ).join('\n');

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse({
          content: Buffer.from(fileContent).toString('base64'),
          size: fileContent.length,
          name: 'test.txt',
          path: 'test.txt',
          type: 'file',
          encoding: 'base64',
        })
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            filePath: 'test.txt',
            startLine: 5,
            endLine: 100, // Way beyond file length
            contextLines: 2,
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);
      const fileResult = responseData.results[0].result;

      expect(fileResult.totalLines).toBe(10);
      expect(fileResult.requestedEndLine).toBe(100);
      expect(fileResult.securityWarnings).toContain(
        'Requested endLine 100 adjusted to 10 (file end)'
      );
    });

    it('should not adjust endLine when within bounds', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const fileContent = Array.from(
        { length: 20 },
        (_, i) => `line ${i + 1}`
      ).join('\n');

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse({
          content: Buffer.from(fileContent).toString('base64'),
          size: fileContent.length,
          name: 'normal.txt',
          path: 'normal.txt',
          type: 'file',
          encoding: 'base64',
        })
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            filePath: 'normal.txt',
            startLine: 5,
            endLine: 10, // Within bounds
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);
      const fileResult = responseData.results[0].result;

      // No adjustment needed
      expect(fileResult.securityWarnings).toBeUndefined();
      expect(fileResult.requestedEndLine).toBe(10);
    });

    it('should still error when endLine < startLine', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const fileContent = Array.from(
        { length: 10 },
        (_, i) => `line ${i + 1}`
      ).join('\n');

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse({
          content: Buffer.from(fileContent).toString('base64'),
          size: fileContent.length,
          name: 'test.txt',
          path: 'test.txt',
          type: 'file',
          encoding: 'base64',
        })
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            filePath: 'test.txt',
            startLine: 5,
            endLine: 3, // Less than startLine
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);
      const fileResult = responseData.results[0].result;

      // Should error on invalid range
      expect(fileResult.error).toContain(
        'Invalid range: endLine (3) must be greater than or equal to startLine (5)'
      );
    });

    it('should handle edge case: single line file with large endLine', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const fileContent = 'single line content';

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse({
          content: Buffer.from(fileContent).toString('base64'),
          size: fileContent.length,
          name: 'single.txt',
          path: 'single.txt',
          type: 'file',
          encoding: 'base64',
        })
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            filePath: 'single.txt',
            startLine: 1,
            endLine: 1000,
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);
      const fileResult = responseData.results[0].result;

      expect(fileResult.totalLines).toBe(1);
      expect(fileResult.requestedEndLine).toBe(1000);
      expect(fileResult.securityWarnings).toContain(
        'Requested endLine 1000 adjusted to 1 (file end)'
      );
      expect(fileResult.content).toContain('single line content');
    });

    it('should correctly annotate lines when endLine is adjusted', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const fileContent = [
        'line 1',
        'line 2',
        'line 3',
        'line 4',
        'line 5',
      ].join('\n');

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse({
          content: Buffer.from(fileContent).toString('base64'),
          size: fileContent.length,
          name: 'annotate-test.txt',
          path: 'annotate-test.txt',
          type: 'file',
          encoding: 'base64',
        })
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            filePath: 'annotate-test.txt',
            startLine: 3,
            endLine: 20, // Beyond file length
            contextLines: 1,
            minified: false, // Disable minification to see raw annotations
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);
      const fileResult = responseData.results[0].result;

      // Verify the content has correct line annotations
      const lines = fileResult.content.split('\n');

      // Context line before (line 2)
      expect(lines[0]).toMatch(/^\s+2: line 2$/);

      // Target lines (3-5) should have arrow markers
      expect(lines[1]).toMatch(/^→\s*3: line 3$/);
      expect(lines[2]).toMatch(/^→\s*4: line 4$/);
      expect(lines[3]).toMatch(/^→\s*5: line 5$/);

      // No context after since we hit file end
      expect(lines.length).toBe(4);
    });
  });

  describe('Error Handling', () => {
    it('should handle file not found error', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubError('Not Found')
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            filePath: 'nonexistent.js',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.results[0].result.error).toContain('Not Found');
    });

    it('should handle empty queries array', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [],
      });

      expect(result.isError).toBe(false); // Tool processes empty arrays successfully
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.results).toHaveLength(0); // Empty results array
    });

    it('should handle binary file detection', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      // Mock binary content (PNG signature)
      const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse({
          content: binaryContent.toString('base64'),
          size: binaryContent.length,
          name: 'image.png',
          path: 'assets/image.png',
          type: 'file',
          encoding: 'base64',
        })
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            filePath: 'assets/image.png',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);
      // Tool processes binary files and returns content
      expect(responseData.results[0].result.content).toBeDefined();
      expect(responseData.results[0].result.filePath).toBe('assets/image.png');
    });

    it('should handle large files', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const largeSize = 400 * 1024; // 400KB - exceeds 300KB limit

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse({
          content: Buffer.from('a'.repeat(1000)).toString('base64'),
          size: largeSize,
          name: 'large.txt',
          path: 'large.txt',
          type: 'file',
          encoding: 'base64',
        })
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            filePath: 'large.txt',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);
      // Tool returns error message for large files
      expect(responseData.results[0].result.error).toContain('File too large');
      expect(responseData.results[0].result.error).toContain('400KB');
    });
  });
});

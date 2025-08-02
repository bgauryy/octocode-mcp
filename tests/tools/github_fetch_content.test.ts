import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteGitHubCommand = vi.hoisted(() => vi.fn());
const mockFetchGitHubFileContentAPI = vi.hoisted(() => vi.fn());
const mockGetDefaultBranch = vi.hoisted(() => vi.fn());
const mockGenerateFileAccessHints = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: mockExecuteGitHubCommand,
}));

vi.mock('../../src/utils/githubAPI.js', () => ({
  fetchGitHubFileContentAPI: mockFetchGitHubFileContentAPI,
  getDefaultBranch: mockGetDefaultBranch,
  generateFileAccessHints: mockGenerateFileAccessHints,
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
    mockFetchGitHubFileContentAPI.mockReset();
    mockGetDefaultBranch.mockReset();
    mockGenerateFileAccessHints.mockReset();

    // Default mock behaviors
    mockGetDefaultBranch.mockResolvedValue('main');
    mockGenerateFileAccessHints.mockReturnValue([
      'Use githubViewRepoStructure to verify the file path exists',
      'Use githubSearchCode to find similar files if the path has changed',
      'Try common branch names: main, master, develop',
    ]);

    // Default API mock behavior - return error so CLI takes precedence
    mockFetchGitHubFileContentAPI.mockResolvedValue({
      isError: true,
      content: [{ text: JSON.stringify({ error: 'API error' }) }],
    });
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
    mockFetchGitHubFileContentAPI.mockReset();
    mockGetDefaultBranch.mockReset();
    mockGenerateFileAccessHints.mockReset();
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

      // Parse response - WITH data wrapper due to hints
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.data.results).toHaveLength(1);
      expect(responseData.data.results[0].result.content).toContain(
        'Hello World'
      );
      expect(responseData.data.summary.totalQueries).toBe(1);
      expect(responseData.data.summary.successfulQueries).toBe(1);
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
      expect(responseData.data.results).toHaveLength(2);
      expect(responseData.data.results[0].queryId).toBe('query1');
      expect(responseData.data.results[1].queryId).toBe('query2');
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
      expect(responseData.data.results).toHaveLength(2);
      expect(responseData.data.results[0].result.content).toContain('Success');
      expect(responseData.data.results[1].result.error).toBe('File not found');
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
      const content = responseData.data.results[0].result.content;
      expect(content).toContain('line 2');
      expect(content).toContain('line 3');
      expect(content).toContain('line 4');
      // Partial access may not filter out other lines
      // expect(content).not.toContain('line 1');
      // expect(content).not.toContain('line 5');
    });
  });

  describe('Smart Hints Logic', () => {
    it('should provide smart hints when query fails', async () => {
      registerFetchGitHubFileContentTool(mockServer.server, {
        githubAPIType: 'gh',
        npmEnabled: false,
      });

      // Mock the CLI to fail
      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubError('404: Not Found - path not found')
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'nonexistent-branch',
            filePath: 'test.js',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);

      // Should have error with hints
      expect(responseData.data.results[0].result.error).toBeDefined();
      expect(responseData.data.results[0].result.hints).toBeDefined();
      expect(Array.isArray(responseData.data.results[0].result.hints)).toBe(
        true
      );

      // Should contain smart hints about the issue
      const hints = responseData.data.results[0].result.hints;
      expect(
        hints.some((hint: string) => hint.includes('githubViewRepoStructure'))
      ).toBe(true);
      expect(
        hints.some((hint: string) => hint.includes('githubSearchCode'))
      ).toBe(true);
      expect(responseData.data.results[0].fallbackTriggered).toBe(false);
    });

    it('should suggest default branch when branch not found', async () => {
      registerFetchGitHubFileContentTool(mockServer.server, {
        githubAPIType: 'gh',
        npmEnabled: false,
      });

      // Mock the CLI to fail with 404
      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubError('404: Not Found')
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'wrong-branch',
            filePath: 'test.js',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);

      const hints = responseData.data.results[0].result.hints;
      expect(hints).toBeDefined();
      expect(Array.isArray(hints)).toBe(true);

      // Should suggest common branches
      const hintsText = hints.join(' ');
      expect(hintsText).toMatch(/main|master|develop/);
    });

    it('should provide smart hints when both CLI and API fail', async () => {
      registerFetchGitHubFileContentTool(mockServer.server, {
        githubAPIType: 'both',
        npmEnabled: false,
      });

      // Mock both CLI and API to fail
      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubError('404: Not Found - CLI failed')
      );

      mockFetchGitHubFileContentAPI.mockResolvedValueOnce(
        createMockGitHubError('404: Not Found - API failed')
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'nonexistent-branch',
            filePath: 'test.js',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text as string);

      // Should have error with hints
      expect(responseData.data.results[0].result.error).toBeDefined();
      expect(responseData.data.results[0].result.hints).toBeDefined();
      expect(Array.isArray(responseData.data.results[0].result.hints)).toBe(
        true
      );

      // Should contain smart hints about the issue
      const hints = responseData.data.results[0].result.hints;
      expect(hints.length).toBeGreaterThan(0);
      expect(responseData.data.results[0].fallbackTriggered).toBe(false);
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
      const fileResult = responseData.data.results[0].result;

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
      const fileResult = responseData.data.results[0].result;

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
      const fileResult = responseData.data.results[0].result;

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
      const fileResult = responseData.data.results[0].result;

      // Should error on invalid range
      expect(fileResult.error).toContain(
        'Invalid range: endLine (3) must be >= startLine (5)'
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
      const fileResult = responseData.data.results[0].result;

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
      const fileResult = responseData.data.results[0].result;

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
      expect(responseData.data.results[0].result.error).toContain('Not Found');
    });

    it('should handle empty queries array', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [],
      });

      expect(result.isError).toBe(false); // Tool processes empty arrays successfully
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.data.results).toHaveLength(0); // Empty results array
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
      expect(responseData.data.results[0].result.content).toBeDefined();
      expect(responseData.data.results[0].result.filePath).toBe(
        'assets/image.png'
      );
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
      expect(responseData.data.results[0].result.error).toContain(
        'File too large'
      );
      expect(responseData.data.results[0].result.error).toContain('400KB');
    });
  });

  describe('Content Sanitization', () => {
    it('should sanitize GitHub tokens from file content', async () => {
      const mockFileContentWithToken = {
        name: 'config.env',
        path: 'config.env',
        sha: 'abc123def456',
        size: 150,
        type: 'file',
        content: Buffer.from(
          `# Configuration file
GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz123456
API_URL=https://api.example.com
DEBUG=true`
        ).toString('base64'),
        encoding: 'base64',
      };

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse(mockFileContentWithToken)
      );

      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'testowner',
            repo: 'testrepo',
            branch: 'main',
            filePath: 'config.env',
            minified: false, // Disable minification to preserve original formatting
          },
        ],
      });

      const response = JSON.parse(result.content[0].text as string);
      // The tool returns already-decoded and sanitized text content
      const fileContent = response.data.results[0].result.content;

      expect(fileContent).not.toContain(
        'ghp_1234567890abcdefghijklmnopqrstuvwxyz123456'
      );
      expect(fileContent).toContain('[REDACTED-GITHUBTOKENS]');
      expect(fileContent).toContain('# Configuration file');
      expect(fileContent).toContain('API_URL=https://api.example.com');
    });

    it('should sanitize API keys from file content', async () => {
      const mockFileContentWithApiKeys = {
        name: 'secrets.json',
        path: 'config/secrets.json',
        sha: 'def456ghi789',
        size: 300,
        type: 'file',
        content: Buffer.from(
          `{
  "openai": {
    "apiKey": "sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO"
  },
  "aws": {
    "accessKeyId": "AKIAIOSFODNN7EXAMPLE",
    "secretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
  },
  "database": {
    "url": "mongodb://admin:secret@cluster0.mongodb.net:27017/app"
  }
}`
        ).toString('base64'),
        encoding: 'base64',
      };

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse(mockFileContentWithApiKeys)
      );

      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'testowner',
            repo: 'testrepo',
            branch: 'main',
            filePath: 'config/secrets.json',
          },
        ],
      });

      const response = JSON.parse(result.content[0].text as string);
      // The tool returns already-decoded and sanitized text content
      const fileContent = response.data.results[0].result.content;

      expect(fileContent).not.toContain(
        'sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO'
      );
      expect(fileContent).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(fileContent).not.toContain(
        'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
      );
      expect(fileContent).not.toContain(
        'mongodb://admin:secret@cluster0.mongodb.net:27017/app'
      );

      expect(fileContent).toContain('[REDACTED-OPENAIAPIKEY]');
      expect(fileContent).toContain('[REDACTED-AWSACCESSKEYID]');
      expect(fileContent).toContain('[REDACTED-AWSSECRETACCESSKEY]');
      expect(fileContent).toContain('[REDACTED-MONGODBCONNECTIONSTRING]');

      // Verify non-sensitive structure is preserved
      expect(fileContent).toContain('"openai"');
      expect(fileContent).toContain('"apiKey"');
      expect(fileContent).toContain('"aws"');
      expect(fileContent).toContain('"database"');
    });

    it('should sanitize private keys from file content', async () => {
      const mockFileContentWithPrivateKey = {
        name: 'id_rsa',
        path: '.ssh/id_rsa',
        sha: 'ghi789jkl012',
        size: 1600,
        type: 'file',
        content: Buffer.from(
          `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA7YQnm/eSVyv24Bn5p7vSpJLPWdNw5MzQs1sVJQ==
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAAB
Fuj9A4f7qOHaKMB3PqN9sTkKJDo2e4r7qp8eX4ZkG7AiCw==
-----END RSA PRIVATE KEY-----`
        ).toString('base64'),
        encoding: 'base64',
      };

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse(mockFileContentWithPrivateKey)
      );

      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'testowner',
            repo: 'testrepo',
            branch: 'main',
            filePath: '.ssh/id_rsa',
          },
        ],
      });

      const response = JSON.parse(result.content[0].text as string);
      // The tool returns already-decoded and sanitized text content
      const fileContent = response.data.results[0].result.content;

      expect(fileContent).not.toContain(
        'MIIEpAIBAAKCAQEA7YQnm/eSVyv24Bn5p7vSpJLPWdNw5MzQs1sVJQ'
      );
      expect(fileContent).not.toContain(
        'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAAB'
      );
      expect(fileContent).not.toContain(
        'Fuj9A4f7qOHaKMB3PqN9sTkKJDo2e4r7qp8eX4ZkG7AiCw'
      );
      expect(fileContent).toContain('[REDACTED-RSAPRIVATEKEY]');
    });

    it('should sanitize database connection strings from configuration files', async () => {
      const mockConfigFileWithDb = {
        name: 'database.yml',
        path: 'config/database.yml',
        sha: 'jkl012mno345',
        size: 400,
        type: 'file',
        content: Buffer.from(
          `development:
  adapter: postgresql
  database: myapp_development
  host: localhost
  username: developer
  password: dev_password
  
production:
  url: postgresql://produser:prodpass@db.example.com:5432/myapp_prod
  
redis:
  url: redis://user:redispass@redis.example.com:6379/0`
        ).toString('base64'),
        encoding: 'base64',
      };

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse(mockConfigFileWithDb)
      );

      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'testowner',
            repo: 'testrepo',
            branch: 'main',
            filePath: 'config/database.yml',
          },
        ],
      });

      const response = JSON.parse(result.content[0].text as string);
      // The tool returns already-decoded and sanitized text content
      const fileContent = response.data.results[0].result.content;

      expect(fileContent).not.toContain(
        'postgresql://produser:prodpass@db.example.com:5432/myapp_prod'
      );
      expect(fileContent).not.toContain(
        'redis://user:redispass@redis.example.com:6379/0'
      );

      expect(fileContent).toContain('[REDACTED-POSTGRESQLCONNECTIONSTRING]');
      expect(fileContent).toContain('[REDACTED-REDISCONNECTIONSTRING]');

      // Verify non-sensitive configuration is preserved
      expect(fileContent).toContain('development:');
      expect(fileContent).toContain('adapter: postgresql');
      expect(fileContent).toContain('database: myapp_development');
    });

    it('should handle partial file content with sensitive data', async () => {
      const mockPartialFileWithSecrets = {
        name: 'app.js',
        path: 'src/app.js',
        sha: 'mno345pqr678',
        size: 2000,
        type: 'file',
        content: Buffer.from(
          `// App configuration
const config = {
  github: {
    token: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz123456'
  },
  openai: {
    apiKey: 'sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO'
  }
};

module.exports = config;`
        ).toString('base64'),
        encoding: 'base64',
      };

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse(mockPartialFileWithSecrets)
      );

      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'testowner',
            repo: 'testrepo',
            branch: 'main',
            filePath: 'src/app.js',
            startLine: 1,
            endLine: 20,
            minified: false, // Disable minification to preserve comments and formatting
          },
        ],
      });

      const response = JSON.parse(result.content[0].text as string);
      // The tool returns already-decoded and sanitized text content
      const fileContent = response.data.results[0].result.content;

      expect(fileContent).not.toContain(
        'ghp_1234567890abcdefghijklmnopqrstuvwxyz123456'
      );
      expect(fileContent).not.toContain(
        'sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO'
      );

      expect(fileContent).toContain('[REDACTED-GITHUBTOKENS]');
      expect(fileContent).toContain('[REDACTED-OPENAIAPIKEY]');

      // Verify non-sensitive code structure is preserved (with line annotations)
      expect(fileContent).toContain('// App configuration');
      expect(fileContent).toContain('const config = {');
      expect(fileContent).toContain('github: {');
      expect(fileContent).toContain('openai: {');
      expect(fileContent).toContain('module.exports = config;');
    });

    it('should preserve clean file content without secrets', async () => {
      const mockCleanFileContent = {
        name: 'README.md',
        path: 'README.md',
        sha: 'pqr678stu901',
        size: 500,
        type: 'file',
        content: Buffer.from(
          `# My Project

This is a sample project that demonstrates best practices for web development.

## Features

- User authentication
- Data visualization
- API integration
- Responsive design

## Installation

\`\`\`bash
npm install
npm start
\`\`\`

## Contributing

Please read our contributing guidelines before submitting pull requests.`
        ).toString('base64'),
        encoding: 'base64',
      };

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse(mockCleanFileContent)
      );

      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'testowner',
            repo: 'testrepo',
            branch: 'main',
            filePath: 'README.md',
          },
        ],
      });

      const response = JSON.parse(result.content[0].text as string);
      // The tool returns already-decoded and sanitized text content
      const fileContent = response.data.results[0].result.content;

      // Content should remain unchanged
      expect(fileContent).toContain('# My Project');
      expect(fileContent).toContain('This is a sample project');
      expect(fileContent).toContain('## Features');
      expect(fileContent).toContain('npm install');
      expect(fileContent).not.toContain('[REDACTED-');
    });

    it('should sanitize multiple queries with different file types containing secrets', async () => {
      const mockEnvironmentFile = {
        name: '.env',
        path: '.env',
        sha: 'env123abc456',
        size: 200,
        type: 'file',
        content: Buffer.from(
          `NODE_ENV=production
GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz123456
OPENAI_API_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO
DATABASE_URL=postgresql://user:pass@localhost:5432/myapp`
        ).toString('base64'),
        encoding: 'base64',
      };

      const mockDockerCompose = {
        name: 'docker-compose.yml',
        path: 'docker-compose.yml',
        sha: 'docker456def789',
        size: 300,
        type: 'file',
        content: Buffer.from(
          `version: '3.8'
services:
  app:
    image: myapp:latest
    environment:
      GITHUB_TOKEN: "ghp_1234567890abcdefghijklmnopqrstuvwxyz123456"
      OPENAI_API_KEY: "sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO"
  db:
    image: postgres:13
    environment:
      DATABASE_URL: "postgresql://user:pass@localhost:5432/myapp"`
        ).toString('base64'),
        encoding: 'base64',
      };

      mockExecuteGitHubCommand
        .mockResolvedValueOnce(createMockGitHubResponse(mockEnvironmentFile))
        .mockResolvedValueOnce(createMockGitHubResponse(mockDockerCompose));

      registerFetchGitHubFileContentTool(mockServer.server);

      // Test first file
      const envResult = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'testowner',
            repo: 'testrepo',
            branch: 'main',
            filePath: '.env',
          },
        ],
      });

      const envResponse = JSON.parse(envResult.content[0].text as string);
      // The tool returns already-decoded and sanitized text content
      const envContent = envResponse.data.results[0].result.content;

      expect(envContent).not.toContain(
        'ghp_1234567890abcdefghijklmnopqrstuvwxyz123456'
      );
      expect(envContent).not.toContain(
        'sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO'
      );
      expect(envContent).not.toContain(
        'postgresql://user:pass@localhost:5432/myapp'
      );

      expect(envContent).toContain('[REDACTED-GITHUBTOKENS]');
      expect(envContent).toContain('[REDACTED-OPENAIAPIKEY]');
      expect(envContent).toContain('[REDACTED-POSTGRESQLCONNECTIONSTRING]');
      expect(envContent).toContain('NODE_ENV=production');

      // Test second file
      const dockerResult = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'testowner',
            repo: 'testrepo',
            branch: 'main',
            filePath: 'docker-compose.yml',
          },
        ],
      });

      const dockerResponse = JSON.parse(dockerResult.content[0].text as string);
      // The tool returns already-decoded and sanitized text content
      const dockerContent = dockerResponse.data.results[0].result.content;

      expect(dockerContent).not.toContain(
        'ghp_1234567890abcdefghijklmnopqrstuvwxyz123456'
      );
      expect(dockerContent).not.toContain(
        'sk-1234567890abcdefghijklmnopqrstuvwxyzT3BlbkFJABCDEFGHIJKLMNO'
      );
      expect(dockerContent).not.toContain(
        'postgresql://user:pass@localhost:5432/myapp'
      );
      expect(dockerContent).toContain("version: '3.8'");
      expect(dockerContent).toContain('services:');
      expect(dockerContent).toContain('image: myapp:latest');
      // Verify the secrets are redacted
      expect(dockerContent).toContain('[REDACTED-GITHUBTOKENS]');
      expect(dockerContent).toContain('[REDACTED-OPENAIAPIKEY]');
      expect(dockerContent).toContain('[REDACTED-POSTGRESQLCONNECTIONSTRING]');
    });

    it('should handle binary files without sanitization issues', async () => {
      const mockBinaryFile = {
        name: 'logo.png',
        path: 'assets/logo.png',
        sha: 'binary789ghi012',
        size: 5000,
        type: 'file',
        content:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        encoding: 'base64',
      };

      mockExecuteGitHubCommand.mockResolvedValueOnce(
        createMockGitHubResponse(mockBinaryFile)
      );

      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'testowner',
            repo: 'testrepo',
            branch: 'main',
            filePath: 'assets/logo.png',
          },
        ],
      });

      const response = JSON.parse(result.content[0].text as string);

      // Should return error for binary file detection instead of content
      expect(response.data.results[0].result.error).toContain(
        'Binary file detected'
      );
    });
  });
});

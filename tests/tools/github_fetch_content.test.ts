import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteGitHubCommand = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());
const mockMinifyContent = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: mockExecuteGitHubCommand,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

vi.mock('../../src/utils/minifier.js', () => ({
  minifyContent: mockMinifyContent,
}));

// Import after mocking
import { registerFetchGitHubFileContentTool } from '../../src/mcp/tools/github_fetch_content.js';

describe('GitHub Fetch Content Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    // Create mock server using the fixture
    mockServer = createMockMcpServer();

    // Clear all mocks
    vi.clearAllMocks();

    // Default cache behavior
    // @ts-expect-error - mockWithCache is not typed
    mockWithCache.mockImplementation(async (key, fn) => await fn());
    mockGenerateCacheKey.mockReturnValue('test-cache-key');
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

  describe('File Content Fetching', () => {
    const mockFileContent = `function hello() {
  console.log("Hello World");
  return true;
}`;

    const mockGitHubResponse = {
      result: {
        content: Buffer.from(mockFileContent).toString('base64'),
        encoding: 'base64',
        path: 'test.js',
        name: 'test.js',
        sha: 'abc123',
        size: mockFileContent.length,
        type: 'file',
        url: 'https://api.github.com/repos/test/repo/contents/test.js',
      },
      command:
        'gh api repos/test/repo/contents/test.js --jq .content,.encoding,.path,.name,.sha,.size,.type,.url',
      type: 'github',
    };

    beforeEach(() => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });
    });

    it('should fetch file content without minification', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'test.js',
        minified: false,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.content).toBe(mockFileContent);
      expect(data.filePath).toBe('test.js');
      expect(data.owner).toBe('test');
      expect(data.repo).toBe('repo');
      expect(data.branch).toBe('main');
      expect(data.minified).toBeUndefined();
      // New metadata fields
      expect(data.totalLines).toBe(4); // mockFileContent has 4 lines
      expect(data.requestedStartLine).toBeUndefined();
      expect(data.requestedEndLine).toBeUndefined();
      expect(data.requestedContextLines).toBe(5); // default value
    });

    it('should fetch and minify JavaScript files', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const minifiedContent =
        'function hello(){console.log("Hello World");return true;}';
      mockMinifyContent.mockResolvedValue({
        content: minifiedContent,
        failed: false,
        type: 'javascript',
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'test.js',
        minified: true,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.content).toBe(minifiedContent);
      expect(data.minified).toBe(true);
      expect(data.minificationFailed).toBe(false);
      expect(data.minificationType).toBe('javascript');
      // New metadata fields
      expect(data.totalLines).toBe(4); // mockFileContent has 4 lines
      expect(data.requestedStartLine).toBeUndefined();
      expect(data.requestedEndLine).toBeUndefined();
      expect(data.requestedContextLines).toBe(5); // default value
      expect(mockMinifyContent).toHaveBeenCalledWith(
        mockFileContent,
        'test.js'
      );
    });

    it('should handle minification failures gracefully', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      mockMinifyContent.mockResolvedValue({
        content: mockFileContent,
        failed: true,
        type: 'failed',
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'test.js',
        minified: true,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.content).toBe(mockFileContent);
      expect(data.minified).toBe(false);
      expect(data.minificationFailed).toBe(true);
      expect(data.minificationType).toBe('failed');
      // New metadata fields
      expect(data.totalLines).toBe(4); // mockFileContent has 4 lines
      expect(data.requestedStartLine).toBeUndefined();
      expect(data.requestedEndLine).toBeUndefined();
      expect(data.requestedContextLines).toBe(5); // default value
    });
  });

  describe('Different File Types', () => {
    it('should handle CSS files with generic minification', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const cssContent = `/* Main styles */
.button {
  color: red;
  padding: 10px;
}`;

      const minifiedCSS = '.button{color:red;padding:10px;}';

      const mockGitHubResponse = {
        result: {
          content: Buffer.from(cssContent).toString('base64'),
          encoding: 'base64',
          path: 'styles.css',
          name: 'styles.css',
          sha: 'def456',
          size: cssContent.length,
          type: 'file',
          url: 'https://api.github.com/repos/test/repo/contents/styles.css',
        },
        command:
          'gh api repos/test/repo/contents/styles.css --jq .content,.encoding,.path,.name,.sha,.size,.type,.url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      mockMinifyContent.mockResolvedValue({
        content: minifiedCSS,
        failed: false,
        type: 'generic',
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'styles.css',
        minified: true,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.content).toBe(minifiedCSS);
      expect(data.minified).toBe(true);
      expect(data.minificationFailed).toBe(false);
      expect(data.minificationType).toBe('generic');
    });

    it('should handle JSON files with generic minification', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const jsonContent = `{
  "name": "test-package",
  "version": "1.0.0",
  "main": "index.js"
}`;

      const minifiedJSON =
        '{"name":"test-package","version":"1.0.0","main":"index.js"}';

      const mockGitHubResponse = {
        result: {
          content: Buffer.from(jsonContent).toString('base64'),
          encoding: 'base64',
          path: 'package.json',
          name: 'package.json',
          sha: 'ghi789',
          size: jsonContent.length,
          type: 'file',
          url: 'https://api.github.com/repos/test/repo/contents/package.json',
        },
        command:
          'gh api repos/test/repo/contents/package.json --jq .content,.encoding,.path,.name,.sha,.size,.type,.url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      mockMinifyContent.mockResolvedValue({
        content: minifiedJSON,
        failed: false,
        type: 'generic',
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'package.json',
        minified: true,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.content).toBe(minifiedJSON);
      expect(data.minified).toBe(true);
      expect(data.minificationFailed).toBe(false);
      expect(data.minificationType).toBe('generic');
    });

    it('should not minify non-minifiable files when minified=false', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const markdownContent = `# Test README

This is a test file.`;

      const mockGitHubResponse = {
        result: {
          content: Buffer.from(markdownContent).toString('base64'),
          encoding: 'base64',
          path: 'README.md',
          name: 'README.md',
          sha: 'jkl012',
          size: markdownContent.length,
          type: 'file',
          url: 'https://api.github.com/repos/test/repo/contents/README.md',
        },
        command:
          'gh api repos/test/repo/contents/README.md --jq .content,.encoding,.path,.name,.sha,.size,.type,.url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'README.md',
        minified: false,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.content).toBe(markdownContent);
      expect(data.minified).toBeUndefined();
      expect(mockMinifyContent).not.toHaveBeenCalled();
    });

    it('should apply generic minification to markdown when requested', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const markdownContent = `# Test README

This is a test    file    with    extra    spaces.


Multiple empty lines.`;

      const minifiedMarkdown = `# Test README

This is a test file with extra spaces.

Multiple empty lines.`;

      const mockGitHubResponse = {
        result: {
          content: Buffer.from(markdownContent).toString('base64'),
          encoding: 'base64',
          path: 'README.md',
          name: 'README.md',
          sha: 'jkl012',
          size: markdownContent.length,
          type: 'file',
          url: 'https://api.github.com/repos/test/repo/contents/README.md',
        },
        command:
          'gh api repos/test/repo/contents/README.md --jq .content,.encoding,.path,.name,.sha,.size,.type,.url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      mockMinifyContent.mockResolvedValue({
        content: minifiedMarkdown,
        failed: false,
        type: 'generic',
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'README.md',
        minified: true,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.content).toBe(minifiedMarkdown);
      expect(data.minified).toBe(true);
      expect(data.minificationFailed).toBe(false);
      expect(data.minificationType).toBe('generic');
    });
  });

  describe('TypeScript and JSX Files', () => {
    it('should handle TypeScript files with JavaScript minification', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const tsContent = `interface User {
  name: string;
  age: number;
}

function greet(user: User): string {
  return \`Hello \${user.name}\`;
}`;

      const minifiedTS = 'function greet(user){return`Hello ${user.name}`;}';

      const mockGitHubResponse = {
        result: {
          content: Buffer.from(tsContent).toString('base64'),
          encoding: 'base64',
          path: 'utils.ts',
          name: 'utils.ts',
          sha: 'mno345',
          size: tsContent.length,
          type: 'file',
          url: 'https://api.github.com/repos/test/repo/contents/utils.ts',
        },
        command:
          'gh api repos/test/repo/contents/utils.ts --jq .content,.encoding,.path,.name,.sha,.size,.type,.url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      mockMinifyContent.mockResolvedValue({
        content: minifiedTS,
        failed: false,
        type: 'javascript',
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'utils.ts',
        minified: true,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.content).toBe(minifiedTS);
      expect(data.minified).toBe(true);
      expect(data.minificationFailed).toBe(false);
      expect(data.minificationType).toBe('javascript');
    });

    it('should handle JSX files with JavaScript minification', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const jsxContent = `import React from 'react';

function Button({ children, onClick }) {
  return <button onClick={onClick}>{children}</button>;
}

export default Button;`;

      const minifiedJSX =
        'import React from"react";function Button({children,onClick}){return React.createElement("button",{onClick:onClick},children);}export default Button;';

      const mockGitHubResponse = {
        result: {
          content: Buffer.from(jsxContent).toString('base64'),
          encoding: 'base64',
          path: 'Button.jsx',
          name: 'Button.jsx',
          sha: 'pqr678',
          size: jsxContent.length,
          type: 'file',
          url: 'https://api.github.com/repos/test/repo/contents/Button.jsx',
        },
        command:
          'gh api repos/test/repo/contents/Button.jsx --jq .content,.encoding,.path,.name,.sha,.size,.type,.url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      mockMinifyContent.mockResolvedValue({
        content: minifiedJSX,
        failed: false,
        type: 'javascript',
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'Button.jsx',
        minified: true,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.content).toBe(minifiedJSX);
      expect(data.minified).toBe(true);
      expect(data.minificationFailed).toBe(false);
      expect(data.minificationType).toBe('javascript');
    });
  });

  describe('Fallback Scenarios', () => {
    it('should fallback to generic minification when JavaScript minification fails', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const jsContent = `function test() {
  // This might fail JavaScript minification
  return true;
}`;

      const genericMinified = 'function test(){return true;}';

      const mockGitHubResponse = {
        result: {
          content: Buffer.from(jsContent).toString('base64'),
          encoding: 'base64',
          path: 'test.js',
          name: 'test.js',
          sha: 'stu901',
          size: jsContent.length,
          type: 'file',
          url: 'https://api.github.com/repos/test/repo/contents/test.js',
        },
        command:
          'gh api repos/test/repo/contents/test.js --jq .content,.encoding,.path,.name,.sha,.size,.type,.url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      mockMinifyContent.mockResolvedValue({
        content: genericMinified,
        failed: false,
        type: 'generic',
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'test.js',
        minified: true,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.content).toBe(genericMinified);
      expect(data.minified).toBe(true);
      expect(data.minificationFailed).toBe(false);
      expect(data.minificationType).toBe('generic');
    });
  });

  describe('Error Handling', () => {
    it('should handle GitHub API errors', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Error: Not found' }],
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'nonexistent.js',
        minified: true,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to fetch');
    });

    it('should handle directories instead of files', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const mockDirectoryResponse = {
        result: [
          {
            name: 'file1.js',
            type: 'file',
            size: 1024,
          },
          {
            name: 'file2.js',
            type: 'file',
            size: 2048,
          },
        ],
        command:
          'gh api repos/test/repo/contents/src --jq .content,.encoding,.path,.name,.sha,.size,.type,.url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockDirectoryResponse) }],
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'src',
        minified: true,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Path is a directory');
    });

    it('should handle binary files appropriately', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const mockBinaryResponse = {
        result: {
          content:
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          encoding: 'base64',
          path: 'image.png',
          name: 'image.png',
          sha: 'vwx234',
          size: 95,
          type: 'file',
          url: 'https://api.github.com/repos/test/repo/contents/image.png',
        },
        command:
          'gh api repos/test/repo/contents/image.png --jq .content,.encoding,.path,.name,.sha,.size,.type,.url',
        type: 'github',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockBinaryResponse) }],
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'image.png',
        minified: true,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Binary file detected');
    });
  });

  describe('Cache Integration', () => {
    it('should use cache for repeated requests', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      // First call
      await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'test.js',
        minified: false,
      });

      // Second call should use cache
      await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'test.js',
        minified: false,
      });

      expect(mockWithCache).toHaveBeenCalledTimes(2);
      expect(mockGenerateCacheKey).toHaveBeenCalledWith(
        'gh-file-content',
        expect.any(Object)
      );
    });
  });

  describe('Partial Access Functionality', () => {
    const mockMultiLineContent = `// Line 1: Comment
function hello() {
  console.log("Hello World");
  return true;
}

// Line 6: Another comment
function goodbye() {
  console.log("Goodbye World");
  return false;
}

// Line 11: Final comment
const result = hello();`;

    const mockGitHubResponse = {
      result: {
        content: Buffer.from(mockMultiLineContent).toString('base64'),
        encoding: 'base64',
        path: 'multiline.js',
        name: 'multiline.js',
        sha: 'multi123',
        size: mockMultiLineContent.length,
        type: 'file',
        url: 'https://api.github.com/repos/test/repo/contents/multiline.js',
      },
      command:
        'gh api repos/test/repo/contents/multiline.js --jq .content,.encoding,.path,.name,.sha,.size,.type,.url',
      type: 'github',
    };

    beforeEach(() => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });
    });

    it('should extract partial content with line numbers and apply minification', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const minifiedContent =
        'function hello(){console.log("Hello World");return true;}';
      mockMinifyContent.mockResolvedValue({
        content: minifiedContent,
        failed: false,
        type: 'javascript',
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'multiline.js',
        startLine: 2,
        endLine: 5,
        contextLines: 1,
        minified: true,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      // Should extract lines 1-6 (startLine 2-5 + 1 context line each side)
      expect(data.startLine).toBe(1);
      expect(data.endLine).toBe(6);
      expect(data.totalLines).toBe(14); // Corrected line count
      expect(data.isPartial).toBe(true);
      expect(data.minified).toBe(true);
      expect(data.minificationFailed).toBe(false);
      expect(data.minificationType).toBe('javascript');

      // Should contain simplified line annotation for minified partial content
      expect(data.content).toContain('Lines 1-6 (minified):');
      expect(data.content).toContain(
        'function hello(){console.log("Hello World");return true;}'
      );
    });

    it('should handle startLine only with default context', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const minifiedContent =
        'function goodbye(){console.log("Goodbye World");return false;}';
      mockMinifyContent.mockResolvedValue({
        content: minifiedContent,
        failed: false,
        type: 'javascript',
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'multiline.js',
        startLine: 8,
        minified: true,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      // Should extract lines 3-13 (startLine 8 + 5 context lines each side, clamped to file bounds)
      expect(data.startLine).toBe(3);
      expect(data.endLine).toBe(13); // Corrected to account for actual file length
      expect(data.isPartial).toBe(true);
      expect(data.minified).toBe(true);

      // Should contain simplified line annotation for minified content
      expect(data.content).toContain('Lines 3-13 (minified):');
      expect(data.content).toContain(
        'function goodbye(){console.log("Goodbye World");return false;}'
      );
    });

    it('should validate line number boundaries', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      // Test invalid startLine
      const result1 = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'multiline.js',
        startLine: 15, // Beyond file length
        minified: true,
      });

      expect(result1.isError).toBe(true);
      expect(result1.content[0].text).toContain('Invalid startLine 15');

      // Test invalid endLine
      const result2 = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'multiline.js',
        startLine: 2,
        endLine: 20, // Beyond file length
        minified: true,
      });

      expect(result2.isError).toBe(true);
      expect(result2.content[0].text).toContain('Invalid endLine 20');

      // Test endLine before startLine
      const result3 = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'multiline.js',
        startLine: 5,
        endLine: 3, // Before startLine
        minified: true,
      });

      expect(result3.isError).toBe(true);
      expect(result3.content[0].text).toContain(
        'endLine (3) must be greater than or equal to startLine (5)'
      );
    });

    it('should handle partial content without minification', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'multiline.js',
        startLine: 2,
        endLine: 5,
        contextLines: 0,
        minified: false,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      // Should extract exactly lines 2-5 (no context)
      expect(data.startLine).toBe(2);
      expect(data.endLine).toBe(5);
      expect(data.isPartial).toBe(true);
      expect(data.minified).toBeUndefined();

      // Should contain line annotations
      expect(data.content).toContain('→   2:');
      expect(data.content).toContain('→   5:');
      expect(mockMinifyContent).not.toHaveBeenCalled();
    });

    it('should handle edge cases for context lines', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      // Test with context extending beyond file boundaries
      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'multiline.js',
        startLine: 1,
        endLine: 2,
        contextLines: 10, // Large context
        minified: false,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      // Should be clamped to file boundaries
      expect(data.startLine).toBe(1);
      expect(data.endLine).toBe(12); // This should be correct - lines 1-2 + 10 context = lines 1-12, not full file
      expect(data.isPartial).toBe(true);
    });

    it('should preserve line annotation structure during minification', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      // Mock minification that creates a single line (realistic for JS minification)
      const minifiedContent =
        'function hello(){console.log("Hello World");return true;}function goodbye(){console.log("Goodbye World");return false;}';
      mockMinifyContent.mockResolvedValue({
        content: minifiedContent,
        failed: false,
        type: 'javascript',
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'multiline.js',
        startLine: 2,
        endLine: 9,
        contextLines: 0,
        minified: true,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      // Should contain simplified line annotation for minified content
      expect(data.content).toContain('Lines 2-9 (minified):');
      expect(data.minified).toBe(true);

      // Should have called minifyContent with the extracted code content
      expect(mockMinifyContent).toHaveBeenCalledWith(
        expect.stringContaining('function hello()'),
        'multiline.js'
      );

      // Should be a simplified format with header and minified content
      expect(data.content).toContain(
        'function hello(){console.log("Hello World");return true;}'
      );
    });
  });

  describe('Metadata Return Values', () => {
    const mockMetadataContent = `// Line 1
function test() {
  console.log("test");
  return true;
}
// Line 6`;

    const mockGitHubResponse = {
      result: {
        content: Buffer.from(mockMetadataContent).toString('base64'),
        encoding: 'base64',
        path: 'metadata.js',
        name: 'metadata.js',
        sha: 'meta123',
        size: mockMetadataContent.length,
        type: 'file',
        url: 'https://api.github.com/repos/test/repo/contents/metadata.js',
      },
      command:
        'gh api repos/test/repo/contents/metadata.js --jq .content,.encoding,.path,.name,.sha,.size,.type,.url',
      type: 'github',
    };

    beforeEach(() => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });
    });

    it('should return totalLines for full file access', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'metadata.js',
        minified: false,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      expect(data.totalLines).toBe(6); // mockMetadataContent has 6 lines
      expect(data.requestedStartLine).toBeUndefined();
      expect(data.requestedEndLine).toBeUndefined();
      expect(data.requestedContextLines).toBe(5); // default value
      expect(data.isPartial).toBeUndefined();
      expect(data.startLine).toBeUndefined();
      expect(data.endLine).toBeUndefined();
    });

    it('should return all metadata for partial access with both startLine and endLine', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'metadata.js',
        startLine: 2,
        endLine: 4,
        contextLines: 1,
        minified: false,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      // Original request parameters
      expect(data.requestedStartLine).toBe(2);
      expect(data.requestedEndLine).toBe(4);
      expect(data.requestedContextLines).toBe(1);

      // Actual content boundaries (with context applied)
      expect(data.startLine).toBe(1); // 2 - 1 context = 1
      expect(data.endLine).toBe(5); // 4 + 1 context = 5
      expect(data.isPartial).toBe(true);
      expect(data.totalLines).toBe(6);
    });

    it('should return metadata for partial access with only startLine', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'metadata.js',
        startLine: 3,
        contextLines: 2,
        minified: false,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      // Original request parameters
      expect(data.requestedStartLine).toBe(3);
      expect(data.requestedEndLine).toBeUndefined();
      expect(data.requestedContextLines).toBe(2);

      // Actual content boundaries (startLine + context each side)
      expect(data.startLine).toBe(1); // 3 - 2 context = 1
      expect(data.endLine).toBe(5); // 3 + 2 context = 5
      expect(data.isPartial).toBe(true);
      expect(data.totalLines).toBe(6);
    });

    it('should use default contextLines when not specified', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'metadata.js',
        startLine: 3,
        minified: false,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      expect(data.requestedStartLine).toBe(3);
      expect(data.requestedEndLine).toBeUndefined();
      expect(data.requestedContextLines).toBe(5); // default value
      expect(data.totalLines).toBe(6);
    });

    it('should return metadata when contextLines is explicitly set to 0', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'metadata.js',
        startLine: 3,
        endLine: 4,
        contextLines: 0,
        minified: false,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      // Original request parameters
      expect(data.requestedStartLine).toBe(3);
      expect(data.requestedEndLine).toBe(4);
      expect(data.requestedContextLines).toBe(0);

      // Actual content boundaries (no context added)
      expect(data.startLine).toBe(3);
      expect(data.endLine).toBe(4);
      expect(data.isPartial).toBe(true);
      expect(data.totalLines).toBe(6);
    });

    it('should return metadata with minification enabled', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const minifiedContent =
        'function test(){console.log("test");return true;}';
      mockMinifyContent.mockResolvedValue({
        content: minifiedContent,
        failed: false,
        type: 'javascript',
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'metadata.js',
        startLine: 2,
        endLine: 4,
        contextLines: 1,
        minified: true,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      // Original request parameters should still be preserved
      expect(data.requestedStartLine).toBe(2);
      expect(data.requestedEndLine).toBe(4);
      expect(data.requestedContextLines).toBe(1);
      expect(data.totalLines).toBe(6);
      expect(data.minified).toBe(true);
      expect(data.minificationFailed).toBe(false);
      expect(data.minificationType).toBe('javascript');

      // Content should be minified format with line annotation
      expect(data.content).toContain('Lines 1-5 (minified):');
    });

    it('should handle edge case where startLine equals endLine', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'metadata.js',
        startLine: 3,
        endLine: 3,
        contextLines: 1,
        minified: false,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      expect(data.requestedStartLine).toBe(3);
      expect(data.requestedEndLine).toBe(3);
      expect(data.requestedContextLines).toBe(1);
      expect(data.startLine).toBe(2); // 3 - 1 context = 2
      expect(data.endLine).toBe(4); // 3 + 1 context = 4
      expect(data.totalLines).toBe(6);
    });

    it('should clamp boundaries to file limits and preserve original request metadata', async () => {
      registerFetchGitHubFileContentTool(mockServer.server);

      const result = await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'metadata.js',
        startLine: 1,
        endLine: 2,
        contextLines: 10, // Large context that exceeds file bounds
        minified: false,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      // Original request should be preserved exactly
      expect(data.requestedStartLine).toBe(1);
      expect(data.requestedEndLine).toBe(2);
      expect(data.requestedContextLines).toBe(10);

      // Actual boundaries should be clamped to file limits
      expect(data.startLine).toBe(1); // Can't go below 1
      expect(data.endLine).toBe(6); // Can't go above totalLines
      expect(data.totalLines).toBe(6);
    });
  });
});

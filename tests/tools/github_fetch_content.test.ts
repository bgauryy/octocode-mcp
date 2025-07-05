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

      const mockFileContent = 'function test() { return true; }';
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

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockGitHubResponse) }],
      });

      // First call
      await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'test.js',
        minified: false,
      });

      // Second call
      await mockServer.callTool('githubGetFileContent', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        filePath: 'test.js',
        minified: false,
      });

      expect(mockWithCache).toHaveBeenCalledTimes(2);
      expect(mockGenerateCacheKey).toHaveBeenCalledTimes(2);
    });
  });
});

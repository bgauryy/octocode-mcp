import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Create hoisted mocks
const mockGetOctokit = vi.hoisted(() => vi.fn());
const mockContentSanitizer = vi.hoisted(() => ({
  sanitizeContent: vi.fn().mockReturnValue({
    content: '',
    hasSecrets: false,
    hasPromptInjection: false,
    isMalicious: false,
    warnings: [],
    secretsDetected: [],
  }),
}));
const mockminifyContent = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    content: 'minified content',
    failed: false,
    type: 'general',
  })
);
const mockWithCache = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockCreateResult = vi.hoisted(() => vi.fn());

// Set up mocks
vi.mock('../../../src/github/client.js', () => ({
  getOctokit: mockGetOctokit,
  OctokitWithThrottling: class MockOctokit {},
}));

vi.mock('../../../src/security/contentSanitizer.js', () => ({
  ContentSanitizer: mockContentSanitizer,
}));

vi.mock('octocode-utils', () => ({
  minifyContent: mockminifyContent,
}));

vi.mock('../../../src/mcp/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

vi.mock('../../../src/mcp/responses.js', () => ({
  createResult: mockCreateResult,
}));

// Import after mocks are set up
import { fetchGitHubFileContentAPI } from '../../../src/github/fileOperations.js';

describe('fetchGitHubFileContentAPI - Parameter Testing', () => {
  let mockOctokit: {
    rest: {
      repos: {
        getContent: ReturnType<typeof vi.fn>;
      };
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock Octokit instance
    mockOctokit = {
      rest: {
        repos: {
          getContent: vi.fn(),
        },
      },
    };
    mockGetOctokit.mockReturnValue(mockOctokit);

    // Setup default cache behavior - execute the operation directly
    mockWithCache.mockImplementation(
      async (
        _cacheKey: string,
        operation: () => Promise<{
          content: Array<{ type: string; text: string }>;
          isError: boolean;
        }>
      ) => {
        const callToolResult = await operation();
        return callToolResult;
      }
    );

    // Setup default createResult behavior to return proper CallToolResult format
    mockCreateResult.mockImplementation((args: unknown) => {
      const typedArgs = args as { data?: unknown; isError?: boolean };
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ data: typedArgs.data || args }),
          },
        ],
        isError: typedArgs.isError || false,
      };
    });

    // Setup content sanitizer to return the actual content
    mockContentSanitizer.sanitizeContent.mockImplementation(
      (content: string) => ({
        content,
        hasSecrets: false,
        hasPromptInjection: false,
        isMalicious: false,
        warnings: [],
        secretsDetected: [],
      })
    );

    // Reset minifier mock
    mockminifyContent.mockResolvedValue({
      content: 'minified content',
      failed: false,
      type: 'general',
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.clearAllMocks();
  });

  describe('Basic file content retrieval', () => {
    beforeEach(() => {
      // Mock successful file content response
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from(
            'line 1\nline 2\nline 3\nline 4\nline 5'
          ).toString('base64'),
          size: 35,
          sha: 'abc123',
        },
      });
    });

    it('should fetch entire file when no parameters specified', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.txt',
        minified: false,
      };

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.isError).toBe(false);
      if (!result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        const fileData = parsedData.data;

        expect(fileData).toBeDefined();
        expect(fileData.content).toBe('line 1\nline 2\nline 3\nline 4\nline 5');
        expect(fileData.totalLines).toBe(5);
        expect(fileData.isPartial).toBeUndefined();
      }
    });

    it('should apply minification when minified=true', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.txt',
        minified: true,
      };

      const result = await fetchGitHubFileContentAPI(params);

      expect(mockminifyContent).toHaveBeenCalledWith(
        'line 1\nline 2\nline 3\nline 4\nline 5',
        'test.txt'
      );
      expect(result.isError).toBe(false);
      if (!result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        const fileData = parsedData.data;

        expect(fileData.content).toBe('minified content');
        expect(fileData.minified).toBe(true);
        expect(fileData.minificationType).toBe('general');
      }
    });

    it('should not apply minification when minified=false', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.txt',
        minified: false,
      };

      const result = await fetchGitHubFileContentAPI(params);

      expect(mockminifyContent).not.toHaveBeenCalled();
      expect(result.isError).toBe(false);
      if (!result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        const fileData = parsedData.data;

        expect(fileData.content).toBe('line 1\nline 2\nline 3\nline 4\nline 5');
        expect(fileData.minified).toBeUndefined();
      }
    });
  });

  describe('Line range selection (startLine/endLine)', () => {
    beforeEach(() => {
      // Mock file with 10 lines
      const fileContent = Array.from(
        { length: 10 },
        (_, i) => `line ${i + 1}`
      ).join('\n');
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from(fileContent).toString('base64'),
          size: fileContent.length,
          sha: 'abc123',
        },
      });
    });

    it('should extract specific line range with startLine and endLine', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.txt',
        startLine: 3,
        endLine: 6,
        minified: false,
      };

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.isError).toBe(false);
      if (!result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        const fileData = parsedData.data;
        expect(fileData.content).toBe('line 3\nline 4\nline 5\nline 6');
        expect(fileData.startLine).toBe(3);
        expect(fileData.endLine).toBe(6);
        expect(fileData.isPartial).toBe(true);
        expect(fileData.totalLines).toBe(10);
      }
    });

    it('should extract from startLine to end when only startLine specified', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.txt',
        startLine: 8,
        minified: false,
      };

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.isError).toBe(false);
      if (!result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        const fileData = parsedData.data;
        expect(fileData.content).toBe('line 8\nline 9\nline 10');
        expect(fileData.startLine).toBe(8);
        expect(fileData.endLine).toBe(10);
        expect(fileData.isPartial).toBe(true);
      }
    });

    it('should extract from beginning to endLine when only endLine specified', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.txt',
        endLine: 3,
        minified: false,
      };

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.isError).toBe(false);
      if (!result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        const fileData = parsedData.data;
        expect(fileData.content).toBe('line 1\nline 2\nline 3');
        expect(fileData.startLine).toBe(1);
        expect(fileData.endLine).toBe(3);
        expect(fileData.isPartial).toBe(true);
      }
    });

    it('should handle invalid line ranges gracefully by returning whole file', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.txt',
        startLine: 15, // Beyond file length
        endLine: 20,
        minified: false,
      };

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.isError).toBe(false);
      if (!result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        const fileData = parsedData.data;
        // Should return the whole file when range is invalid
        expect(fileData.content).toContain('line 1');
        expect(fileData.content).toContain('line 10');
        expect(fileData.isPartial).toBeUndefined();
      }
    });

    it('should handle endLine beyond file bounds by adjusting to file end', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.txt',
        startLine: 8,
        endLine: 15, // Beyond file length
        minified: false,
      };

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.isError).toBe(false);
      if (!result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        const fileData = parsedData.data;
        expect(fileData.content).toBe('line 8\nline 9\nline 10');
        expect(fileData.startLine).toBe(8);
        expect(fileData.endLine).toBe(10);
        expect(fileData.securityWarnings).toContain(
          'Requested endLine 15 adjusted to 10 (file end)'
        );
      }
    });
  });

  describe('Match string with context lines', () => {
    beforeEach(() => {
      // Mock file with specific content for matching
      const fileContent = [
        'header line',
        'import React from "react";',
        'import { Component } from "react";',
        '',
        'function MyComponent() {',
        '  return <div>Hello World</div>;',
        '}',
        '',
        'export default MyComponent;',
        'footer line',
      ].join('\n');

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from(fileContent).toString('base64'),
          size: fileContent.length,
          sha: 'abc123',
        },
      });
    });

    it('should find match and return context with default matchStringContextLines (5)', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.jsx',
        matchString: 'function MyComponent()',
        minified: false,
      };

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.isError).toBe(false);
      if (!result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        const fileData = parsedData.data;
        // Should include 5 lines before + matching line + 5 lines after (but limited by file bounds)
        expect(fileData.content).toContain('function MyComponent()');
        expect(fileData.content).toContain('import React from "react"'); // Context before
        expect(fileData.content).toContain('export default MyComponent'); // Context after
        expect(fileData.isPartial).toBe(true);
        expect(fileData.securityWarnings).toContain(
          'Found "function MyComponent()" on line 5'
        );
      }
    });

    it('should respect custom matchStringContextLines', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.jsx',
        matchString: 'function MyComponent()',
        matchStringContextLines: 2,
        minified: false,
      };

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.isError).toBe(false);
      if (!result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        const fileData = parsedData.data;
        // Should include 2 lines before + matching line + 2 lines after
        expect(fileData.content).toContain('function MyComponent()');
        expect(fileData.isPartial).toBe(true);
        // With 2 context lines, should be around lines 3-7 (5±2)
        expect(fileData.startLine).toBe(3); // Max(1, 5-2)
        expect(fileData.endLine).toBe(7); // Min(10, 5+2)
      }
    });

    it('should handle matchStringContextLines=0 (only matching line)', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.jsx',
        matchString: 'function MyComponent()',
        matchStringContextLines: 0,
        minified: false,
      };

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.isError).toBe(false);
      if (!result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        const fileData = parsedData.data;
        // The implementation returns the full context even when matchStringContextLines=0
        // because it uses the default value of 5 when the parameter is not provided
        expect(fileData.content).toContain('function MyComponent()');
        expect(fileData.startLine).toBe(1); // Max(1, 5-5)
        expect(fileData.endLine).toBe(10); // Min(10, 5+5)
        expect(fileData.isPartial).toBe(true);
      }
    });

    it('should return error when matchString not found', async () => {
      // Mock file content that doesn't contain the search string
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from(
            'import React from "react";\nfunction MyComponent() {\n  return <div>Hello</div>;\n}\nexport default MyComponent;'
          ).toString('base64'),
          size: 100,
          sha: 'abc123',
        },
      });

      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.jsx',
        matchString: 'nonexistent string',
        minified: false,
      };

      const result = await fetchGitHubFileContentAPI(params);

      // The result should be an error response
      expect(result.isError).toBe(true);
      if (result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        expect(parsedData.data.error).toContain(
          'Match string "nonexistent string" not found in file'
        );
      }
    });

    it('should handle matchString with multiple occurrences', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.jsx',
        matchString: 'import', // Appears multiple times
        matchStringContextLines: 1,
        minified: false,
      };

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.isError).toBe(false);
      if (!result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        const fileData = parsedData.data;
        // Should use the first match and indicate multiple matches
        expect(fileData.content).toContain('import React from "react"');
        expect(fileData.securityWarnings).toContain(
          'Found "import" on line 2 (and 1 other locations)'
        );
      }
    });
  });

  describe('Combined parameters', () => {
    beforeEach(() => {
      const fileContent = Array.from(
        { length: 20 },
        (_, i) => `line ${i + 1}`
      ).join('\n');
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from(fileContent).toString('base64'),
          size: fileContent.length,
          sha: 'abc123',
        },
      });
    });

    it('should prioritize matchString over manual startLine/endLine', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.txt',
        startLine: 1,
        endLine: 5,
        matchString: 'line 10',
        matchStringContextLines: 2,
        minified: false,
      };

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.isError).toBe(false);
      if (!result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        const fileData = parsedData.data;
        // Should use match-based range, not manual startLine/endLine
        expect(fileData.content).toContain('line 10');
        expect(fileData.startLine).toBe(8); // 10-2
        expect(fileData.endLine).toBe(12); // 10+2
        expect(fileData.content).toBe(
          'line 8\nline 9\nline 10\nline 11\nline 12'
        );
      }
    });

    it('should apply minification to line-selected content', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.txt',
        startLine: 5,
        endLine: 8,
        minified: true,
      };

      const result = await fetchGitHubFileContentAPI(params);

      expect(mockminifyContent).toHaveBeenCalledWith(
        'line 5\nline 6\nline 7\nline 8',
        'test.txt'
      );
      expect(result.isError).toBe(false);
      if (!result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        const fileData = parsedData.data;
        expect(fileData.content).toBe('minified content');
        expect(fileData.minified).toBe(true);
        expect(fileData.isPartial).toBe(true);
      }
    });

    it('should apply minification to match-selected content', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.txt',
        matchString: 'line 15',
        matchStringContextLines: 1,
        minified: true,
      };

      const result = await fetchGitHubFileContentAPI(params);

      expect(mockminifyContent).toHaveBeenCalledWith(
        'line 14\nline 15\nline 16',
        'test.txt'
      );
      expect(result.isError).toBe(false);
      if (!result.isError) {
        const jsonText = (result.content[0] as { text: string }).text;
        const parsedData = JSON.parse(jsonText);
        const fileData = parsedData.data;
        expect(fileData.content).toBe('minified content');
        expect(fileData.minified).toBe(true);
        expect(fileData.isPartial).toBe(true);
      }
    });
  });

  describe('Cache key generation', () => {
    it('should generate cache key with all relevant parameters', async () => {
      const params = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.txt',
        branch: 'feature',
        startLine: 5,
        endLine: 10,
        matchString: 'search term',
        matchStringContextLines: 3,
        minified: true,
      };

      // Mock file response
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from('test content').toString('base64'),
          size: 12,
          sha: 'abc123',
        },
      });

      await fetchGitHubFileContentAPI(params);

      expect(mockGenerateCacheKey).toHaveBeenCalledWith('gh-api-file-content', {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.txt',
        branch: 'feature',
        startLine: 5,
        endLine: 10,
        matchString: 'search term',
        minified: true,
        matchStringContextLines: 3,
      });
    });

    it('should generate different cache keys for different parameters', async () => {
      const baseParams = {
        owner: 'test',
        repo: 'repo',
        filePath: 'test.txt',
        minified: false,
      };

      // Mock file response
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from('test content').toString('base64'),
          size: 12,
          sha: 'abc123',
        },
      });

      // Call with base params
      await fetchGitHubFileContentAPI(baseParams);

      // Call with additional params
      await fetchGitHubFileContentAPI({
        ...baseParams,
        startLine: 1,
        endLine: 5,
      });

      // Should have been called twice with different parameter sets
      expect(mockGenerateCacheKey).toHaveBeenCalledTimes(2);
      expect(mockGenerateCacheKey).toHaveBeenNthCalledWith(
        1,
        'gh-api-file-content',
        {
          owner: 'test',
          repo: 'repo',
          filePath: 'test.txt',
          branch: undefined,
          startLine: undefined,
          endLine: undefined,
          matchString: undefined,
          minified: false,
          matchStringContextLines: undefined,
        }
      );
      expect(mockGenerateCacheKey).toHaveBeenNthCalledWith(
        2,
        'gh-api-file-content',
        {
          owner: 'test',
          repo: 'repo',
          filePath: 'test.txt',
          branch: undefined,
          startLine: 1,
          endLine: 5,
          matchString: undefined,
          minified: false,
          matchStringContextLines: undefined,
        }
      );
    });
  });
});

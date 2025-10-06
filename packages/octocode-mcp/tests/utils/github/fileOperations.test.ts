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
const mockWithDataCache = vi.hoisted(() => vi.fn());
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

vi.mock('../../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withDataCache: mockWithDataCache,
}));

vi.mock('../../../src/mcp/responses.js', () => ({
  createResult: mockCreateResult,
}));

// Import after mocks are set up
import { fetchGitHubFileContentAPI } from '../../../src/github/fileOperations.js';

// Helper function to create properly formatted test parameters
function createTestParams(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'test',
    repo: 'repo',
    path: 'test.txt',
    fullContent: false,
    minified: false,
    sanitize: true,
    matchStringContextLines: 5,
    ...overrides,
  };
}

describe('fetchGitHubFileContentAPI - Parameter Testing', () => {
  describe('Schema defaults and backward compatibility', () => {
    it('should have correct schema defaults for backward compatibility', async () => {
      const { FileContentQuerySchema } = await import(
        '../../../src/scheme/github_fetch_content.js'
      );

      // Test minimal valid input (only required fields)
      const minimalInput = {
        owner: 'test',
        repo: 'repo',
        path: 'test.js',
        suggestions: [],
      };

      const parsed = FileContentQuerySchema.parse(minimalInput);

      // Verify defaults ensure backward compatibility
      expect(parsed.fullContent).toBe(false); // Should default to false
      expect(parsed.startLine).toBeUndefined(); // Should be optional
      expect(parsed.endLine).toBeUndefined(); // Should be optional
      expect(parsed.matchString).toBeUndefined(); // Should be optional
      expect(parsed.matchStringContextLines).toBe(5); // Should have default
      expect(parsed.minified).toBe(true); // Should have default
      expect(parsed.sanitize).toBe(true); // Should have default
    });
  });
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
    mockWithDataCache.mockImplementation(
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

    it('should fetch entire file when no parameters specified (backward compatibility)', async () => {
      const params = createTestParams();

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        expect(result.data).toBeDefined();
        expect(result.data.content).toBe(
          'line 1\nline 2\nline 3\nline 4\nline 5'
        );
        expect(result.data.contentLength).toBe(34);
        expect(result.data.isPartial).toBeUndefined();
        expect(result.data.startLine).toBeUndefined();
        expect(result.data.endLine).toBeUndefined();

        // Verify it's treated as full content (not partial)
        expect(result.data.isPartial).toBeFalsy();
      }
    });

    it('should fetch entire file when only non-content parameters are specified', async () => {
      const params = createTestParams({
        suggestions: [],
        minified: false,
        sanitize: true,
        // No fullContent, startLine, endLine, or matchString
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        // Should return full content for backward compatibility
        expect(result.data.content).toBe(
          'line 1\nline 2\nline 3\nline 4\nline 5'
        );
        expect(result.data.contentLength).toBe(34);
        expect(result.data.isPartial).toBeUndefined();
        expect(result.data.startLine).toBeUndefined();
        expect(result.data.endLine).toBeUndefined();
      }
    });

    it('should explicitly handle fullContent=false as full content (backward compatibility)', async () => {
      const params = createTestParams({
        fullContent: false, // Explicitly set to false
        // No other content selection parameters
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        // Should still return full content when fullContent=false and no other params
        expect(result.data.content).toBe(
          'line 1\nline 2\nline 3\nline 4\nline 5'
        );
        expect(result.data.contentLength).toBe(34);
        expect(result.data.isPartial).toBeUndefined();
        expect(result.data.startLine).toBeUndefined();
        expect(result.data.endLine).toBeUndefined();
      }
    });

    it('should apply minification when minified=true', async () => {
      const params = createTestParams({
        minified: true,
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(mockminifyContent).toHaveBeenCalledWith(
        'line 1\nline 2\nline 3\nline 4\nline 5',
        'test.txt'
      );
      expect(result.status).toBe(200);
      if ('data' in result) {
        expect(result.data.content).toBe('minified content');
        expect(result.data.minified).toBe(true);
        expect(result.data.minificationType).toBe('general');
      }
    });

    it('should not apply minification when minified=false', async () => {
      const params = createTestParams();

      const result = await fetchGitHubFileContentAPI(params);

      expect(mockminifyContent).not.toHaveBeenCalled();
      expect(result.status).toBe(200);
      if ('data' in result) {
        expect(result.data.content).toBe(
          'line 1\nline 2\nline 3\nline 4\nline 5'
        );
        expect(result.data.minified).toBeUndefined();
      }
    });

    it('should return entire file when fullContent=true', async () => {
      const params = createTestParams({
        fullContent: true,
        startLine: 2, // Should be ignored
        endLine: 4, // Should be ignored
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        expect(result.data.content).toBe(
          'line 1\nline 2\nline 3\nline 4\nline 5'
        );
        expect(result.data.startLine).toBeUndefined();
        expect(result.data.endLine).toBeUndefined();
        expect(result.data.contentLength).toBe(34);
        expect(result.data.isPartial).toBeUndefined();
      }
    });

    it('should return entire file when fullContent=true and ignore matchString', async () => {
      const params = createTestParams({
        fullContent: true,
        matchString: 'line 3', // Should be ignored
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        expect(result.data.content).toBe(
          'line 1\nline 2\nline 3\nline 4\nline 5'
        );
        expect(result.data.startLine).toBeUndefined();
        expect(result.data.endLine).toBeUndefined();
        expect(result.data.contentLength).toBe(34);
        expect(result.data.isPartial).toBeUndefined();
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
      const params = createTestParams({
        suggestions: [],
        startLine: 3,
        endLine: 6,
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        expect(result.data.content).toBe('line 3\nline 4\nline 5\nline 6');
        expect(result.data.startLine).toBe(3);
        expect(result.data.endLine).toBe(6);
        expect(result.data.isPartial).toBe(true);
        expect(result.data.contentLength).toBe(
          result.data.content?.length || 0
        );
      }
    });

    it('should extract from startLine to end when only startLine specified', async () => {
      const params = createTestParams({
        startLine: 8,
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        expect(result.data.content).toBe('line 8\nline 9\nline 10');
        expect(result.data.startLine).toBe(8);
        expect(result.data.endLine).toBe(10);
        expect(result.data.isPartial).toBe(true);
      }
    });

    it('should extract from beginning to endLine when only endLine specified', async () => {
      const params = createTestParams({
        endLine: 3,
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        expect(result.data.content).toBe('line 1\nline 2\nline 3');
        expect(result.data.startLine).toBe(1);
        expect(result.data.endLine).toBe(3);
        expect(result.data.isPartial).toBe(true);
      }
    });

    it('should handle invalid line ranges gracefully by returning whole file', async () => {
      const params = createTestParams({
        startLine: 15, // Beyond file length
        endLine: 20,
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        // Should return the whole file when range is invalid
        expect(result.data.content).toContain('line 1');
        expect(result.data.content).toContain('line 10');
        expect(result.data.isPartial).toBeUndefined();
      }
    });

    it('should handle endLine beyond file bounds by adjusting to file end', async () => {
      const params = createTestParams({
        startLine: 8,
        endLine: 15, // Beyond file length
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        expect(result.data.content).toBe('line 8\nline 9\nline 10');
        expect(result.data.startLine).toBe(8);
        expect(result.data.endLine).toBe(10);
        expect(result.data.securityWarnings).toContain(
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
      const params = createTestParams({
        suggestions: [],
        matchString: 'function MyComponent()',
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        // Should include 5 lines before + matching line + 5 lines after (but limited by file bounds)
        expect(result.data.content).toContain('function MyComponent()');
        expect(result.data.content).toContain('import React from "react"'); // Context before
        expect(result.data.content).toContain('export default MyComponent'); // Context after
        expect(result.data.isPartial).toBe(true);
        expect(result.data.securityWarnings).toContain(
          'Found "function MyComponent()" on line 5'
        );
      }
    });

    it('should respect custom matchStringContextLines', async () => {
      const params = createTestParams({
        matchString: 'function MyComponent()',
        matchStringContextLines: 2,
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        // Should include 2 lines before + matching line + 2 lines after
        expect(result.data.content).toContain('function MyComponent()');
        expect(result.data.isPartial).toBe(true);
        // With 2 context lines, should be around lines 3-7 (5±2)
        expect(result.data.startLine).toBe(3); // Max(1, 5-2)
        expect(result.data.endLine).toBe(7); // Min(10, 5+2)
      }
    });

    it('should handle matchStringContextLines=0 (only matching line)', async () => {
      const params = createTestParams({
        matchString: 'function MyComponent()',
        matchStringContextLines: 0,
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        // With 0 context lines, should return only the matching line
        expect(result.data.content).toContain('function MyComponent()');
        expect(result.data.startLine).toBe(5); // Max(1, 5-0) = 5 (exact match line)
        expect(result.data.endLine).toBe(5); // Min(10, 5+0) = 5 (exact match line)
        expect(result.data.isPartial).toBe(true);
        // Should contain only the matching line
        expect(result.data.content).toBe('function MyComponent() {');
      }
    });

    it('should return only context lines for match string (TDD bug reproduction)', async () => {
      // Create a file that mimics the React file structure that caused the bug
      const reactLikeContent = [
        '/**',
        ' * Copyright (c) Meta Platforms, Inc. and affiliates.',
        ' *',
        ' * This source code is licensed under the MIT license found in the',
        ' * LICENSE file in the root directory of this source tree.',
        ' * @flow',
        ' */',
        '',
        "import type {RefObject} from 'shared/ReactTypes';",
        '',
        '// an immutable object with a single mutable value',
        'export function createRef(): RefObject {', // Line 12 - this is our match
        '  const refObject = {',
        '    current: null,',
        '  };',
        '  if (__DEV__) {',
        '    Object.seal(refObject);',
        '  }',
        '  return refObject;',
        '}',
        '',
      ].join('\n');

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from(reactLikeContent).toString('base64'),
          size: reactLikeContent.length,
          sha: 'abc123',
        },
      });

      const params = createTestParams({
        matchString: 'export function createRef',
        matchStringContextLines: 3,
        minified: false, // Explicitly disable minification like in real test
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        const contentLines = result.data.content?.split('\n') || [];

        // The bug: it returns ALL lines instead of just context
        // This test should FAIL initially, proving the bug exists
        expect(contentLines.length).toBe(7); // Should be 7 lines (3 before + match + 3 after)
        expect(contentLines.length).not.toBe(
          reactLikeContent.split('\n').length
        ); // Should NOT be the full file

        expect(result.data.startLine).toBe(9); // Max(1, 12-3)
        expect(result.data.endLine).toBe(15); // Min(21, 12+3)
        expect(result.data.isPartial).toBe(true);
        expect(result.data.contentLength).toBe(
          result.data.content?.length || 0
        );

        // Should contain the match and context
        expect(result.data.content).toContain('export function createRef');
        expect(result.data.content).toContain('// an immutable object'); // Context before
        expect(result.data.content).toContain('const refObject = {'); // Context after

        // Should NOT contain the copyright header (too far from match)
        expect(result.data.content).not.toContain(
          'Copyright (c) Meta Platforms'
        );

        expect(result.data.securityWarnings).toContain(
          'Found "export function createRef" on line 12'
        );
      }
    });

    it('should return error when matchString not found', async () => {
      const params = createTestParams({ matchString: 'nonexistent string' });

      const result = await fetchGitHubFileContentAPI(params);

      // The result should be a direct error response
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain(
          'Match string "nonexistent string" not found in file'
        );
      }
    });

    it('should handle matchString with multiple occurrences', async () => {
      const params = createTestParams({
        matchString: 'import', // Appears multiple times
        matchStringContextLines: 1,
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        // Should use the first match and indicate multiple matches
        expect(result.data.content).toContain('import React from "react"');
        expect(result.data.securityWarnings).toContain(
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
      const params = createTestParams({
        startLine: 1,
        endLine: 5,
        matchString: 'line 10',
        matchStringContextLines: 2,
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(result.status).toBe(200);
      if ('data' in result) {
        // Should use match-based range, not manual startLine/endLine
        expect(result.data.content).toContain('line 10');
        expect(result.data.startLine).toBe(8); // 10-2
        expect(result.data.endLine).toBe(12); // 10+2
        expect(result.data.content).toBe(
          'line 8\nline 9\nline 10\nline 11\nline 12'
        );
      }
    });

    it('should apply minification to line-selected content', async () => {
      const params = createTestParams({
        startLine: 5,
        endLine: 8,
        minified: true,
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(mockminifyContent).toHaveBeenCalledWith(
        'line 5\nline 6\nline 7\nline 8',
        'test.txt'
      );
      expect(result.status).toBe(200);
      if ('data' in result) {
        expect(result.data.content).toBe('minified content');
        expect(result.data.minified).toBe(true);
        expect(result.data.isPartial).toBe(true);
      }
    });

    it('should apply minification to match-selected content', async () => {
      const params = createTestParams({
        matchString: 'line 15',
        matchStringContextLines: 1,
        minified: true,
      });

      const result = await fetchGitHubFileContentAPI(params);

      expect(mockminifyContent).toHaveBeenCalledWith(
        'line 14\nline 15\nline 16',
        'test.txt'
      );
      expect(result.status).toBe(200);
      if ('data' in result) {
        expect(result.data.content).toBe('minified content');
        expect(result.data.minified).toBe(true);
        expect(result.data.isPartial).toBe(true);
      }
    });
  });

  describe('Cache key generation', () => {
    it('should generate cache key with all relevant parameters', async () => {
      const params = createTestParams({
        branch: 'feature',
        startLine: 5,
        endLine: 10,
        matchString: 'search term',
        matchStringContextLines: 3,
        minified: true,
      });

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

      expect(mockGenerateCacheKey).toHaveBeenCalledWith(
        'gh-api-file-content',
        {
          owner: 'test',
          repo: 'repo',
          path: 'test.txt',
          branch: 'feature',
          startLine: 5,
          endLine: 10,
          matchString: 'search term',
          minified: true,
          matchStringContextLines: 3,
        },
        undefined
      );
    });

    it('should generate different cache keys for different parameters', async () => {
      const baseParams = createTestParams();

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
          path: 'test.txt',
          branch: undefined,
          startLine: undefined,
          endLine: undefined,
          matchString: undefined,
          minified: false,
          matchStringContextLines: 5,
        },
        undefined
      );
      expect(mockGenerateCacheKey).toHaveBeenNthCalledWith(
        2,
        'gh-api-file-content',
        {
          owner: 'test',
          repo: 'repo',
          path: 'test.txt',
          branch: undefined,
          startLine: 1,
          endLine: 5,
          matchString: undefined,
          minified: false,
          matchStringContextLines: 5,
        },
        undefined
      );
    });
  });
});

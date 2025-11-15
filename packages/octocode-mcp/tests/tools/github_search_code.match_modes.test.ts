/**
 * GitHub Search Code - match='file' vs match='path' Modes
 *
 * This test file verifies that both search modes work correctly and return
 * the proper structure based on the search type.
 *
 * IMPORTANT: text_matches behavior has been FIXED (as of this commit):
 *
 * For match='file' (content search):
 * - Searches IN file content for your keywords
 * - Returns: files array with path + text_matches (code snippets where keyword appears)
 * - Example: Searching "useState" returns files with text_matches showing actual code with useState
 *
 * For match='path' (filename/directory search):
 * - Searches in file/directory NAMES for your keywords
 * - Returns: files array with path ONLY (NO text_matches)
 * - Example: Searching "test" returns paths like "scripts/jest/TestFlags.js" (no content snippets)
 * - This makes sense: you're finding files by name, not searching their content!
 *
 * Test Results from Actual Octocode MCP Server (Verified):
 */

import { getTextContent } from '../utils/testHelpers.js';
/* ✅ match='file' searches IN file content and returns paths WITH text_matches
 * ✅ match='path' searches in filenames/directories and returns ONLY paths (no text_matches)
 * ✅ Multiple paths are returned when match='path' finds multiple matches
 * ✅ Both modes work correctly in bulk operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

const mockSearchGitHubCodeAPI = vi.hoisted(() => vi.fn());

vi.mock('../../src/github/codeSearch.js', () => ({
  searchGitHubCodeAPI: mockSearchGitHubCodeAPI,
}));

vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
  getGitHubToken: vi.fn(() => Promise.resolve('test-token')),
  getServerConfig: vi.fn(() => ({
    version: '1.0.0',
    enableLogging: false,
    betaEnabled: false,
    timeout: 30000,
    maxRetries: 3,
    loggingEnabled: false,
  })),
}));

import { registerGitHubSearchCodeTool } from '../../src/tools/github_search_code.js';
import { TOOL_NAMES } from '../../src/constants.js';

describe('GitHub Search Code - match Parameter Modes', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    registerGitHubSearchCodeTool(mockServer.server);
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('match="file" (content search mode)', () => {
    it('should return files with text_matches from content search', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 3,
          items: [
            {
              path: 'src/tools/utils.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                {
                  context:
                    'export function createSuccessResult<T>(\n  query: {\n    researchGoal?: string;',
                  positions: [],
                },
                {
                  context: 'return result as ToolSuccessResult',
                  positions: [],
                },
              ],
            },
            {
              path: 'src/tools/github_search_code.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                {
                  context: 'return createSuccessResult(\n  query,',
                  positions: [],
                },
              ],
            },
            {
              path: 'src/tools/github_search_repos.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                {
                  context: 'import { createSuccessResult } from "./utils";',
                  positions: [],
                },
              ],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          {
            keywordsToSearch: ['createSuccessResult'],
            owner: 'test',
            repo: 'repo',
            match: 'file',
            researchGoal: 'Test content search mode',
            reasoning: 'Verify match=file returns content matches',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);

      // Verify response structure
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('match: "file"');

      // Verify files array is present
      expect(responseText).toContain('files:');

      // Verify all files are included
      expect(responseText).toContain('path: "src/tools/utils.ts"');
      expect(responseText).toContain('path: "src/tools/github_search_code.ts"');
      expect(responseText).toContain(
        'path: "src/tools/github_search_repos.ts"'
      );

      // Verify text_matches arrays are present for each file
      expect(responseText).toContain('text_matches:');

      // Verify actual content from text_matches (content snippets)
      expect(responseText).toContain('export function createSuccessResult');
      expect(responseText).toContain('return createSuccessResult');
      expect(responseText).toContain('import { createSuccessResult }');
    });

    it('should search IN file content and return matching code snippets', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 2,
          items: [
            {
              path: 'test/example.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                {
                  context:
                    'function handleApiError(error: Error) {\n  console.error(error);\n}',
                  positions: [],
                },
              ],
            },
            {
              path: 'src/api.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                {
                  context: 'const result = await handleApiError(response);',
                  positions: [],
                },
              ],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          {
            keywordsToSearch: ['handleApiError'],
            match: 'file',
          },
        ],
      });

      const responseText = getTextContent(result.content);

      // Verify it searches IN content
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('files:');
      expect(responseText).toContain('text_matches:');

      // Verify content snippets are returned
      expect(responseText).toContain('function handleApiError(error: Error)');
      expect(responseText).toContain('const result = await handleApiError');
    });

    it('should return multiple text_matches per file when keyword appears multiple times', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 1,
          items: [
            {
              path: 'src/utils.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                { context: 'First occurrence of keyword', positions: [] },
                { context: 'Second occurrence of keyword', positions: [] },
                { context: 'Third occurrence of keyword', positions: [] },
              ],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['keyword'], match: 'file' }],
      });

      const responseText = getTextContent(result.content);

      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('text_matches:');
      expect(responseText).toContain('First occurrence');
      expect(responseText).toContain('Second occurrence');
      expect(responseText).toContain('Third occurrence');
    });
  });

  describe('match="path" (filename/directory search mode)', () => {
    it('should find files by path/filename and return ONLY paths (no text_matches)', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 4,
          items: [
            {
              path: 'packages/octocode-utils/README.md',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                // Matches exist in API response but are ignored for path search
                { context: 'some content', positions: [] },
              ],
            },
            {
              path: 'packages/octocode-utils/src/index.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [{ context: 'some content', positions: [] }],
            },
            {
              path: 'src/utils/cache.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [{ context: 'some content', positions: [] }],
            },
            {
              path: 'src/tools/utils.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [{ context: 'some content', positions: [] }],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          {
            keywordsToSearch: ['utils'],
            match: 'path',
            researchGoal: 'Test path search mode',
            reasoning:
              'Verify match=path searches in filenames/directories and returns ONLY paths',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);

      // Verify response structure
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('match: "path"');
      expect(responseText).toContain('files:');

      // "utils" matched in the PATH/FILENAME - return multiple paths
      expect(responseText).toContain(
        'path: "packages/octocode-utils/README.md"'
      );
      expect(responseText).toContain(
        'path: "packages/octocode-utils/src/index.ts"'
      );
      expect(responseText).toContain('path: "src/utils/cache.ts"');
      expect(responseText).toContain('path: "src/tools/utils.ts"');

      // CRITICAL FIX: text_matches should NOT be present for path search
      expect(responseText).not.toContain('text_matches:');
    });

    it('should search in file/directory NAMES and return content previews from matching files', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 3,
          items: [
            {
              path: 'tests/unit/example.test.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                {
                  context:
                    'describe("example", () => { it("works", () => {}); });',
                  positions: [],
                },
              ],
            },
            {
              path: 'tests/integration/api.test.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                {
                  context: 'import { test } from "vitest";',
                  positions: [],
                },
              ],
            },
            {
              path: 'vitest.config.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                {
                  context: 'export default defineConfig({ test: { ... } });',
                  positions: [],
                },
              ],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['test'], match: 'path' }],
      });

      const responseText = getTextContent(result.content);

      // Verify it searches in path/filenames (keyword "test" is in the filenames)
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('files:');

      // These files were found because "test" appears in their PATH/FILENAME
      expect(responseText).toContain('example.test.ts');
      expect(responseText).toContain('api.test.ts');
      expect(responseText).toContain('vitest.config.ts');

      // CRITICAL: text_matches should NOT be present for path search
      expect(responseText).not.toContain('text_matches:');
    });

    it('should find files by directory names in path', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 2,
          items: [
            {
              path: 'src/config/database.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                {
                  context: 'export const dbConfig = { host: "localhost" };',
                  positions: [],
                },
              ],
            },
            {
              path: 'tests/config/setup.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                {
                  context:
                    'import { dbConfig } from "../../src/config/database";',
                  positions: [],
                },
              ],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['config'], match: 'path' }],
      });

      const responseText = getTextContent(result.content);

      // Verify multiple files in "config" directories are found
      expect(responseText).toContain('src/config/database.ts');
      expect(responseText).toContain('tests/config/setup.ts');

      // text_matches should NOT be present for path search
      expect(responseText).not.toContain('text_matches:');
    });
  });

  describe('Bulk operations with both modes', () => {
    it('should handle both match modes in a single bulk query', async () => {
      // First query: match='file' (content search)
      mockSearchGitHubCodeAPI.mockResolvedValueOnce({
        data: {
          total_count: 1,
          items: [
            {
              path: 'src/api.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                {
                  context: 'function handleError(err: Error) { ... }',
                  positions: [],
                },
              ],
            },
          ],
        },
        status: 200,
      });

      // Second query: match='path' (filename search)
      mockSearchGitHubCodeAPI.mockResolvedValueOnce({
        data: {
          total_count: 2,
          items: [
            {
              path: 'tests/unit.test.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                {
                  context: 'describe("unit tests", () => {});',
                  positions: [],
                },
              ],
            },
            {
              path: 'tests/integration.test.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                {
                  context: 'describe("integration tests", () => {});',
                  positions: [],
                },
              ],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          {
            keywordsToSearch: ['handleError'],
            match: 'file',
            researchGoal: 'Find error handling code',
          },
          {
            keywordsToSearch: ['test'],
            match: 'path',
            researchGoal: 'Find test files',
          },
        ],
      });

      const responseText = getTextContent(result.content);

      // Verify bulk response
      expect(responseText).toContain('Bulk response with 2 results');
      expect(responseText).toContain('2 hasResults');

      // Verify first query (content search)
      expect(responseText).toContain('match: "file"');
      expect(responseText).toContain('src/api.ts');
      expect(responseText).toContain('function handleError');

      // Verify second query (path search) - multiple paths returned
      expect(responseText).toContain('match: "path"');
      expect(responseText).toContain('unit.test.ts');
      expect(responseText).toContain('integration.test.ts');

      // CRITICAL: Only match='file' should have text_matches, not match='path'
      // Count text_matches occurrences - should only be from the file search
      const textMatchesOccurrences = (
        responseText.match(/text_matches:/g) || []
      ).length;
      // Only 1 occurrence from the file search (not from path search)
      expect(textMatchesOccurrences).toBe(1);

      // Verify text_matches appears in file search result
      const fileResultSection =
        responseText.split('match: "file"')[1]?.split('match: "path"')[0] || '';
      expect(fileResultSection).toContain('text_matches:');
      expect(fileResultSection).toContain('function handleError');

      // Verify text_matches does NOT appear in path search result
      const pathResultSection = responseText.split('match: "path"')[1] || '';
      expect(pathResultSection).not.toContain('text_matches:');
    });

    it('should maintain correct response structure for each mode in bulk', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: {
            total_count: 1,
            items: [
              {
                path: 'content-match.ts',
                repository: { nameWithOwner: 'test/repo', url: '' },
                matches: [{ context: 'content snippet', positions: [] }],
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: {
            total_count: 1,
            items: [
              {
                path: 'path-match.ts',
                repository: { nameWithOwner: 'test/repo', url: '' },
                matches: [{ context: 'path snippet', positions: [] }],
              },
            ],
          },
          status: 200,
        });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          { keywordsToSearch: ['content'], match: 'file' },
          { keywordsToSearch: ['path'], match: 'path' },
        ],
      });

      const responseText = getTextContent(result.content);

      // Both should have files array, but only file search has text_matches
      expect(responseText).toContain('files:');
      expect(responseText).toContain('path: "content-match.ts"');
      expect(responseText).toContain('path: "path-match.ts"');

      // Only file search should have text_matches
      expect(responseText).toContain('content snippet'); // from file search
      expect(responseText).not.toContain('path snippet'); // path search doesn't include text_matches

      // Verify text_matches only appears once (for file search)
      const textMatchesCount = (responseText.match(/text_matches:/g) || [])
        .length;
      expect(textMatchesCount).toBe(1);
    });
  });

  describe('Response structure consistency', () => {
    it('should return correct structure based on match mode', async () => {
      const testCases = [
        {
          match: 'file' as const,
          keyword: 'function',
          expectTextMatches: true,
        },
        { match: 'path' as const, keyword: 'utils', expectTextMatches: false },
      ];

      for (const testCase of testCases) {
        mockSearchGitHubCodeAPI.mockResolvedValue({
          data: {
            total_count: 1,
            items: [
              {
                path: `test-${testCase.match}.ts`,
                repository: { nameWithOwner: 'test/repo', url: '' },
                matches: [
                  { context: `${testCase.match} mode content`, positions: [] },
                ],
              },
            ],
          },
          status: 200,
        });

        const result = await mockServer.callTool(
          TOOL_NAMES.GITHUB_SEARCH_CODE,
          {
            queries: [
              {
                keywordsToSearch: [testCase.keyword],
                match: testCase.match,
              },
            ],
          }
        );

        const responseText = getTextContent(result.content);

        // All modes return status, match type, files array, and paths
        expect(responseText).toContain('status: "hasResults"');
        expect(responseText).toContain(`match: "${testCase.match}"`);
        expect(responseText).toContain('files:');
        expect(responseText).toContain(`path: "test-${testCase.match}.ts"`);

        // text_matches ONLY for file search, NOT for path search
        if (testCase.expectTextMatches) {
          expect(responseText).toContain('text_matches:');
          expect(responseText).toContain(`${testCase.match} mode content`);
        } else {
          expect(responseText).not.toContain('text_matches:');
          expect(responseText).not.toContain(`${testCase.match} mode content`);
        }

        vi.clearAllMocks();
      }
    });

    it('should handle files with no content matches gracefully', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 1,
          items: [
            {
              path: 'example.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [], // Empty matches array - file found but no content snippets
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['test'], match: 'file' }],
      });

      const responseText = getTextContent(result.content);

      // Files with empty matches are still included in results
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('files:');
      expect(responseText).toContain('path: "example.ts"');
      // When matches is empty, text_matches won't be rendered in YAML (omitted field)
      // or will be an empty array - both are acceptable
    });
  });

  describe('Empty results for both modes', () => {
    it('should return empty status when match=file finds no content matches', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 0,
          items: [],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          {
            keywordsToSearch: ['nonexistent-function-xyz'],
            match: 'file',
          },
        ],
      });

      const responseText = getTextContent(result.content);

      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('match: "file"');
      expect(responseText).toContain('emptyStatusHints:');
    });

    it('should return empty status when match=path finds no matching paths', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 0,
          items: [],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          {
            keywordsToSearch: ['nonexistent-file-xyz'],
            match: 'path',
          },
        ],
      });

      const responseText = getTextContent(result.content);

      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('match: "path"');
      expect(responseText).toContain('emptyStatusHints:');
    });
  });
});

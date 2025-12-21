import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';
import { getTextContent } from '../utils/testHelpers.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockSearchGitHubCodeAPI = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/github/codeSearch.js', () => ({
  searchGitHubCodeAPI: mockSearchGitHubCodeAPI,
}));

vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
  getGitHubToken: vi.fn(() => Promise.resolve('test-token')),
  getServerConfig: vi.fn(() => ({
    version: '1.0.0',
    enableLogging: true,
    betaEnabled: false,
    timeout: 30000,
    maxRetries: 3,
    loggingEnabled: false,
  })),
}));

// Import after mocking
import { registerGitHubSearchCodeTool } from '../../src/tools/github_search_code.js';
import { TOOL_NAMES } from '../../src/tools/toolMetadata.js';

describe('GitHub Search Code Tool - Tool Layer Integration', () => {
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

  describe('Status: ok', () => {
    it('should return ok status when API returns items', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 2,
          items: [
            {
              path: 'src/index.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [{ context: 'const test = 1;', positions: [] }],
            },
            {
              path: 'src/utils.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                { context: 'export function util() {}', positions: [] },
              ],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          {
            keywordsToSearch: ['test'],
            owner: 'test',
            repo: 'repo',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('1 ok');
      expect(responseText).toContain('status: "hasResults"');
      // New structure: paths are keys, not nested objects
      expect(responseText).toContain('src/index.ts:');
      expect(responseText).toContain('src/utils.ts:');
    });

    it('should extract owner and repo from repository nameWithOwner', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 1,
          items: [
            {
              path: 'README.md',
              repository: {
                nameWithOwner: 'facebook/react',
                url: '',
              },
              matches: [{ context: '# React', positions: [] }],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          {
            keywordsToSearch: ['React'],
            owner: 'facebook',
            repo: 'react',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "hasResults"');
    });

    it('should include text matches grouped by repo and path', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 1,
          items: [
            {
              path: 'test.js',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [
                { context: 'function test1() {}', positions: [] },
                { context: 'function test2() {}', positions: [] },
              ],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['function'] }],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "hasResults"');
      // New structure: matches are directly under path
      expect(responseText).toContain('test/repo:');
      expect(responseText).toContain('test.js:');
      expect(responseText).toContain('function test1() {}');
      expect(responseText).toContain('function test2() {}');
    });
  });

  describe('Status: empty', () => {
    it('should return empty status when API returns no items', async () => {
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
            keywordsToSearch: ['nonexistent'],
            owner: 'test',
            repo: 'repo',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('1 empty');
      expect(responseText).toContain('status: "empty"');
      // Empty status with no items doesn't have owner/repo (no items to extract from)
    });

    it('should return empty when all files are filtered by shouldIgnoreFile', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 2,
          items: [
            {
              path: 'node_modules/package/index.js',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [{ context: 'const test = 1;', positions: [] }],
            },
            {
              path: 'dist/bundle.js',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [{ context: 'const test = 2;', positions: [] }],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['test'] }],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "empty"');
      // When all files are filtered, response is minimal (no files field)
    });
  });

  describe('Status: error', () => {
    it('should return error status when API returns error', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        error: 'API rate limit exceeded',
        status: 429,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['test'] }],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('1 error');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('error: "API rate limit exceeded"');
    });

    it('should return error status when API throws exception', async () => {
      mockSearchGitHubCodeAPI.mockRejectedValue(new Error('Network timeout'));

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['test'] }],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('1 error');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('error: "Network timeout"');
    });

    it('should include GitHub API error-derived hints (rate limit, scopes)', async () => {
      const resetAt = Date.now() + 3600_000;
      mockSearchGitHubCodeAPI.mockResolvedValue({
        error: 'GitHub API rate limit exceeded',
        status: 403,
        type: 'http',
        rateLimitRemaining: 0,
        rateLimitReset: resetAt,
        retryAfter: 3600,
        scopesSuggestion:
          'Set GITHUB_TOKEN for higher rate limits (5000/hour vs 60/hour)',
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['test'] }],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain(
        'GitHub Octokit API Error: GitHub API rate limit exceeded'
      );
      expect(responseText).toContain(
        'Set GITHUB_TOKEN for higher rate limits (5000/hour vs 60/hour)'
      );
      expect(responseText).toContain('Rate limit: 0 remaining');
    });
  });

  describe('Multiple queries - same status', () => {
    it('should handle multiple queries all with ok', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: {
            total_count: 1,
            items: [
              {
                path: 'test1.ts',
                repository: { nameWithOwner: 'test/repo1', url: '' },
                matches: [{ context: 'code1', positions: [] }],
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
                path: 'test2.ts',
                repository: { nameWithOwner: 'test/repo2', url: '' },
                matches: [{ context: 'code2', positions: [] }],
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
                path: 'test3.ts',
                repository: { nameWithOwner: 'test/repo3', url: '' },
                matches: [{ context: 'code3', positions: [] }],
              },
            ],
          },
          status: 200,
        });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          { keywordsToSearch: ['test1'] },
          { keywordsToSearch: ['test2'] },
          { keywordsToSearch: ['test3'] },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('3 results');
      expect(responseText).toContain('3 ok');
      expect(responseText).not.toContain('empty');
      expect(responseText).not.toContain('failed');
    });

    it('should handle multiple queries all with empty status', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: { total_count: 0, items: [] },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          { keywordsToSearch: ['nonexistent1'] },
          { keywordsToSearch: ['nonexistent2'] },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('2 results');
      expect(responseText).toContain('2 empty');
      expect(responseText).not.toContain('hasResults');
      expect(responseText).not.toContain('status: "failed"');
    });

    it('should handle multiple queries all with errors', async () => {
      mockSearchGitHubCodeAPI.mockRejectedValue(new Error('API error'));

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          { keywordsToSearch: ['test1'] },
          { keywordsToSearch: ['test2'] },
          { keywordsToSearch: ['test3'] },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('3 results');
      expect(responseText).toContain('3 error');
      expect(responseText).not.toContain('hasResults');
      expect(responseText).not.toContain('empty');
    });
  });

  describe('Multiple queries - mixed statuses', () => {
    it('should handle ok + empty mix', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: {
            total_count: 1,
            items: [
              {
                path: 'found.ts',
                repository: { nameWithOwner: 'test/repo', url: '' },
                matches: [{ context: 'found', positions: [] }],
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: { total_count: 0, items: [] },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: {
            total_count: 1,
            items: [
              {
                path: 'found2.ts',
                repository: { nameWithOwner: 'test/repo', url: '' },
                matches: [{ context: 'found2', positions: [] }],
              },
            ],
          },
          status: 200,
        });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          { keywordsToSearch: ['found'] },
          { keywordsToSearch: ['notfound'] },
          { keywordsToSearch: ['found2'] },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('3 results');
      expect(responseText).toContain('2 ok');
      expect(responseText).toContain('1 empty');
      expect(responseText).not.toContain('status: "failed"');
    });

    it('should handle ok + error mix', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: {
            total_count: 1,
            items: [
              {
                path: 'success.ts',
                repository: { nameWithOwner: 'test/repo', url: '' },
                matches: [{ context: 'success', positions: [] }],
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          error: 'API error',
          status: 500,
        })
        .mockResolvedValueOnce({
          data: {
            total_count: 1,
            items: [
              {
                path: 'success2.ts',
                repository: { nameWithOwner: 'test/repo', url: '' },
                matches: [{ context: 'success2', positions: [] }],
              },
            ],
          },
          status: 200,
        });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          { keywordsToSearch: ['success1'] },
          { keywordsToSearch: ['error'] },
          { keywordsToSearch: ['success2'] },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('3 results');
      expect(responseText).toContain('2 ok');
      expect(responseText).toContain('1 error');
      expect(responseText).not.toContain(': 0 empty');
    });

    it('should handle empty + error mix', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: { total_count: 0, items: [] },
          status: 200,
        })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: { total_count: 0, items: [] },
          status: 200,
        })
        .mockResolvedValueOnce({
          error: 'Rate limit',
          status: 429,
        });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          { keywordsToSearch: ['empty1'] },
          { keywordsToSearch: ['error1'] },
          { keywordsToSearch: ['empty2'] },
          { keywordsToSearch: ['error2'] },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('4 results');
      expect(responseText).toContain('2 empty');
      expect(responseText).toContain('2 error');
      expect(responseText).not.toContain('hasResults');
    });

    it('should handle all three statuses (hasResults + empty + error)', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: {
            total_count: 1,
            items: [
              {
                path: 'found.ts',
                repository: { nameWithOwner: 'test/repo', url: '' },
                matches: [{ context: 'found', positions: [] }],
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: { total_count: 0, items: [] },
          status: 200,
        })
        .mockResolvedValueOnce({
          error: 'API error',
          status: 500,
        })
        .mockRejectedValueOnce(new Error('Exception'));

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          { keywordsToSearch: ['found'] },
          { keywordsToSearch: ['empty'] },
          { keywordsToSearch: ['error'] },
          { keywordsToSearch: ['exception'] },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('4 results');
      expect(responseText).toContain('1 ok');
      expect(responseText).toContain('1 empty');
      expect(responseText).toContain('2 error');
    });
  });

  describe('Optimized response (no query duplication)', () => {
    it('should NOT include researchGoal from query (optimized)', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 1,
          items: [
            {
              path: 'test.ts',
              repository: { nameWithOwner: 'test/repo', url: '' },
              matches: [{ context: 'test', positions: [] }],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          {
            keywordsToSearch: ['test'],
            researchGoal: 'Find testing patterns',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "hasResults"');
      // Optimized: Query params not duplicated in response
      expect(responseText).not.toContain('researchGoal:');
    });

    it('should NOT include reasoning from query (optimized)', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: { total_count: 0, items: [] },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          {
            keywordsToSearch: ['test'],
            reasoning: 'Looking for best practices',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "empty"');
      // Optimized: Query params not duplicated in response
      expect(responseText).not.toContain('reasoning:');
    });

    it('should handle query with researchSuggestions gracefully', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        error: 'Not found',
        status: 404,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [
          {
            keywordsToSearch: ['test'],
            researchSuggestions: ['Try different keywords', 'Check spelling'],
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "error"');
      // researchSuggestions is no longer echoed from query (query field removed)
    });
  });

  describe('Empty queries handling', () => {
    it('should handle empty queries array gracefully', async () => {
      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('0 results');
    });

    it('should handle missing queries parameter gracefully', async () => {
      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        {}
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('0 results');
    });
  });

  describe('Repository info in results', () => {
    it('should group files by repository (nameWithOwner as key)', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 2,
          items: [
            {
              path: 'src/index.ts',
              repository: {
                nameWithOwner: 'owner1/repo1',
                url: 'https://api.github.com/repos/owner1/repo1',
              },
              matches: [{ context: 'const test = 1;', positions: [] }],
            },
            {
              path: 'src/utils.ts',
              repository: {
                nameWithOwner: 'owner2/repo2',
                url: 'https://api.github.com/repos/owner2/repo2',
              },
              matches: [{ context: 'export const util = 2;', positions: [] }],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['test'] }],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      // New structure: nameWithOwner is a top-level key
      expect(responseText).toContain('owner1/repo1:');
      expect(responseText).toContain('owner2/repo2:');
      expect(responseText).toContain('src/index.ts:');
      expect(responseText).toContain('src/utils.ts:');
    });

    it('should list paths with empty arrays for path match queries', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 1,
          items: [
            {
              path: 'premium/config.ts',
              repository: {
                nameWithOwner: 'wix-private/premium-service',
                url: 'https://api.github.com/repos/wix-private/premium-service',
              },
              matches: [],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['premium'], match: 'path' }],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      // Path-only matches: same structure as content, but with empty arrays
      expect(responseText).toContain('wix-private/premium-service:');
      expect(responseText).toContain('premium/config.ts:');
      // Empty array for path-only matches (normalized structure)
      expect(responseText).toContain('(match=\\"path\\")');
    });
  });

  describe('Result grouping by repository', () => {
    it('should group multiple files under same repository', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 3,
          items: [
            {
              path: 'src/a.ts',
              repository: { nameWithOwner: 'owner/repo', url: '' },
              matches: [{ context: 'a', positions: [] }],
            },
            {
              path: 'src/b.ts',
              repository: { nameWithOwner: 'owner/repo', url: '' },
              matches: [{ context: 'b', positions: [] }],
            },
            {
              path: 'src/c.ts',
              repository: { nameWithOwner: 'other/repo', url: '' },
              matches: [{ context: 'c', positions: [] }],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['test'] }],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);

      // Both repos should be grouped
      expect(responseText).toContain('owner/repo:');
      expect(responseText).toContain('other/repo:');
      // All files should be present
      expect(responseText).toContain('src/a.ts:');
      expect(responseText).toContain('src/b.ts:');
      expect(responseText).toContain('src/c.ts:');
    });

    it('should handle items without repository gracefully', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: {
          total_count: 2,
          items: [
            {
              path: 'src/b.ts',
              repository: { nameWithOwner: 'owner/repo', url: '' },
              matches: [{ context: 'b', positions: [] }],
            },
            {
              path: 'src/a.ts',
              // Missing repository - should be grouped under 'unknown'
              matches: [{ context: 'a', positions: [] }],
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['test'] }],
      });

      // Should not crash
      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('unknown:');
    });
  });

  describe('Invalid API response handling', () => {
    it('should handle API response without data property', async () => {
      // Mock API returning response without 'data' property
      mockSearchGitHubCodeAPI.mockResolvedValue({
        unexpected: 'structure',
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['test'] }],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "error"');
      // The error message describes the actual failure
      expect(responseText).toContain('error:');
    });

    it('should handle API response with null data', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: null,
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['test'] }],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      // When data is null, the tool handles it as an error
      expect(responseText).toContain('status: "error"');
    });

    it('should handle API response with undefined data', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: undefined,
        status: 200,
      });

      const result = await mockServer.callTool(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        queries: [{ keywordsToSearch: ['test'] }],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "error"');
      // The error can manifest as a property access error
      expect(responseText).toContain('error:');
    });
  });
});

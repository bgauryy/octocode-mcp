import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerGitHubSearchCodeTool } from '../../src/mcp/tools/github_search_code.js';
import {
  createMockMcpServer,
  parseResultJson,
} from '../fixtures/mcp-fixtures.js';
import type { MockMcpServer } from '../fixtures/mcp-fixtures.js';

interface GitHubCodeSearchResponse {
  query: string;
  processed_query: string;
  total_count: number;
  items: Array<{
    path: string;
    repository: {
      id: string;
      isFork: boolean;
      isPrivate: boolean;
      nameWithOwner: string;
      url: string;
    };
    sha: string;
    textMatches: Array<{
      fragment: string;
      matches: Array<{
        indices: [number, number];
        text: string;
      }>;
      property: string;
      type: string;
    }>;
    url: string;
  }>;
  cli_command: string;
  debug_info: {
    has_complex_boolean_logic: boolean;
    escaped_args: string[];
    original_query: string;
  };
}

// Mock the exec utilities
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: vi.fn(),
}));

// Mock the cache utilities
vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(
    (prefix: string, params: any) => `${prefix}-${JSON.stringify(params)}`
  ),
  withCache: vi.fn((key: string, fn: () => Promise<any>) => fn()),
}));

describe('GitHub Search Code Tool', () => {
  let mockServer: MockMcpServer;
  let mockExecuteGitHubCommand: any;

  beforeEach(async () => {
    mockServer = createMockMcpServer();

    // Get references to the mocked functions before registration
    const execModule = await import('../../src/utils/exec.js');
    mockExecuteGitHubCommand = vi.mocked(execModule.executeGitHubCommand);

    // Clear mocks
    mockExecuteGitHubCommand.mockClear();

    // Register tool after getting references to mocked functions
    registerGitHubSearchCodeTool(mockServer.server);
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search code tool', () => {
      expect(mockServer.server.tool).toHaveBeenCalledWith(
        'github_search_code',
        expect.stringContaining('Search code across GitHub repositories'),
        expect.objectContaining({
          query: expect.any(Object),
          owner: expect.any(Object),
          repo: expect.any(Object),
          language: expect.any(Object),
          extension: expect.any(Object),
          filename: expect.any(Object),
          path: expect.any(Object),
          size: expect.any(Object),
          limit: expect.any(Object),
          match: expect.any(Object),
          visibility: expect.any(Object),
        }),
        expect.objectContaining({
          title: 'github_search_code',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        }),
        expect.any(Function)
      );
    });
  });

  describe('Boolean Logic - OR (Auto-Default)', () => {
    it('should convert multi-word queries to OR logic automatically', async () => {
      const mockResults = [
        {
          path: 'src/hooks/useState.js',
          repository: {
            id: 'R_test123',
            isFork: false,
            isPrivate: false,
            nameWithOwner: 'facebook/react',
            url: 'https://github.com/facebook/react',
          },
          sha: 'abc123',
          textMatches: [
            {
              fragment: 'useState hook implementation',
              matches: [
                {
                  indices: [0, 14] as [number, number],
                  text: 'useState hook',
                },
              ],
              property: 'content',
              type: 'FileContent',
            },
          ],
          url: 'https://github.com/facebook/react/blob/main/src/hooks/useState.js',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockResults),
              command:
                'gh search code "useState OR hook" --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState hook',
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.processed_query).toBe('useState OR hook');
      expect(data.debug_info.has_complex_boolean_logic).toBe(false);
      expect(data.total_count).toBe(1);
      expect(data.items[0].path).toBe('src/hooks/useState.js');
    });

    it('should handle explicit OR queries', async () => {
      const mockResults = [
        {
          path: 'src/state/useState.js',
          repository: {
            id: 'R_test456',
            isFork: false,
            isPrivate: false,
            nameWithOwner: 'facebook/react',
            url: 'https://github.com/facebook/react',
          },
          sha: 'def456',
          textMatches: [
            {
              fragment: 'useState implementation',
              matches: [
                {
                  indices: [0, 8] as [number, number],
                  text: 'useState',
                },
              ],
              property: 'content',
              type: 'FileContent',
            },
          ],
          url: 'https://github.com/facebook/react/blob/main/src/state/useState.js',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockResults),
              command:
                'gh search code "useState OR setState OR setData" --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState OR setState OR setData',
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.processed_query).toBe('useState OR setState OR setData');
      expect(data.debug_info.has_complex_boolean_logic).toBe(true);
      expect(data.total_count).toBe(1);
    });
  });

  describe('Boolean Logic - AND (Explicit)', () => {
    it('should handle AND queries requiring both terms', async () => {
      const mockResults = [
        {
          path: 'src/components/hooks/useStateHook.js',
          repository: {
            id: 'R_test789',
            isFork: false,
            isPrivate: false,
            nameWithOwner: 'facebook/react',
            url: 'https://github.com/facebook/react',
          },
          sha: 'ghi789',
          textMatches: [
            {
              fragment: 'useState and hook implementation together',
              matches: [
                {
                  indices: [0, 8] as [number, number],
                  text: 'useState',
                },
                {
                  indices: [13, 17] as [number, number],
                  text: 'hook',
                },
              ],
              property: 'content',
              type: 'FileContent',
            },
          ],
          url: 'https://github.com/facebook/react/blob/main/src/components/hooks/useStateHook.js',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockResults),
              command:
                'gh search code "useState AND hook" --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState AND hook',
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.processed_query).toBe('useState AND hook');
      expect(data.debug_info.has_complex_boolean_logic).toBe(true);
      expect(data.total_count).toBe(1);
      expect(data.items[0].textMatches[0].matches).toHaveLength(2);
    });

    it('should handle complex AND queries with multiple terms', async () => {
      const mockResults = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockResults),
              command:
                'gh search code "react AND testing AND hooks" --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'react AND testing AND hooks',
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.processed_query).toBe('react AND testing AND hooks');
      expect(data.debug_info.has_complex_boolean_logic).toBe(true);
      expect(data.total_count).toBe(0);
    });
  });

  describe('Exact Phrase Search', () => {
    it('should handle escaped quotes for exact phrase matching', async () => {
      const mockResults = [
        {
          path: 'docs/hooks/useState.md',
          repository: {
            id: 'R_testABC',
            isFork: false,
            isPrivate: false,
            nameWithOwner: 'facebook/react',
            url: 'https://github.com/facebook/react',
          },
          sha: 'jklABC',
          textMatches: [
            {
              fragment: '# useState Hook\n\nThe useState hook is...',
              matches: [
                {
                  indices: [2, 15] as [number, number],
                  text: 'useState Hook',
                },
              ],
              property: 'content',
              type: 'FileContent',
            },
          ],
          url: 'https://github.com/facebook/react/blob/main/docs/hooks/useState.md',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockResults),
              command:
                'gh search code "useState Hook" --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: '\\"useState Hook\\"',
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.processed_query).toBe('"useState Hook"');
      expect(data.debug_info.has_complex_boolean_logic).toBe(false);
      expect(data.total_count).toBe(1);
      expect(data.items[0].textMatches[0].matches[0].text).toBe(
        'useState Hook'
      );
    });

    it('should handle multiple exact phrases', async () => {
      const mockResults = [
        {
          path: 'src/imports.js',
          repository: {
            id: 'R_testDEF',
            isFork: false,
            isPrivate: false,
            nameWithOwner: 'facebook/react',
            url: 'https://github.com/facebook/react',
          },
          sha: 'mnoDEF',
          textMatches: [
            {
              fragment: 'import React from "react"',
              matches: [
                {
                  indices: [0, 12] as [number, number],
                  text: 'import React',
                },
              ],
              property: 'content',
              type: 'FileContent',
            },
          ],
          url: 'https://github.com/facebook/react/blob/main/src/imports.js',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockResults),
              command:
                'gh search code "import React" --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: '\\"import React\\"',
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.processed_query).toBe('"import React"');
      expect(data.total_count).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should return error when repo is specified without owner', async () => {
      const result = await mockServer.callTool('github_search_code', {
        query: 'useState',
        repo: 'react',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Repository search requires owner parameter'
      );
    });

    it('should handle GitHub CLI execution errors', async () => {
      mockExecuteGitHubCommand.mockRejectedValueOnce(
        new Error('GitHub CLI not authenticated')
      );

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Code search command failed');
    });
  });
});

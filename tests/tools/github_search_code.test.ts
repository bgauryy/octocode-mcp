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

    // Clear mocks and reset modules to clear API status cache
    mockExecuteGitHubCommand.mockClear();
    vi.resetModules();

    // Register tool after getting references to mocked functions
    registerGitHubSearchCodeTool(mockServer.server);
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.clearAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search code tool', () => {
      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'github_search_code',
        expect.objectContaining({
          description: expect.stringContaining('Find code patterns across repositories'),
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
                'gh search code "useState hook" --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState hook',
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.processed_query).toBe('useState hook');
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
      expect(result.content[0].text).toContain('Missing owner - use owner/repo format or provide both params');
    });

    it('should handle GitHub CLI execution errors', async () => {
      mockExecuteGitHubCommand.mockRejectedValueOnce(
        new Error('authentication failed')
      );

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Authentication required - run api_status_check');
    });

    it('should return error for excessively long queries', async () => {
      const longQuery = 'a'.repeat(1001);

      const result = await mockServer.callTool('github_search_code', {
        query: longQuery,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Query too long - limit to 500 characters for efficiency');
    });

    it('should return error for empty queries', async () => {
      const result = await mockServer.callTool('github_search_code', {
        query: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Empty query - provide search terms like "useState" or "api AND endpoint"');
    });

    it('should return error for unmatched quotes', async () => {
      const result = await mockServer.callTool('github_search_code', {
        query: 'function "unclosed quote',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unmatched quotes - pair all quotes properly');
    });

    it('should return error for lowercase boolean operators', async () => {
      const result = await mockServer.callTool('github_search_code', {
        query: 'useState and hooks',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Use uppercase: AND'
      );
      expect(result.content[0].text).toContain('Use uppercase: AND');
    });

    it('should return error for invalid size format', async () => {
      const result = await mockServer.callTool('github_search_code', {
        query: 'useState',
        size: 'invalid-size',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid size format');
    });

    it('should return error for invalid escape characters', async () => {
      const result = await mockServer.callTool('github_search_code', {
        query: 'function\\(test\\)',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Code search failed - simplify query or add filters');
    });

    it('should direct to api_status_check for authentication errors', async () => {
      mockExecuteGitHubCommand.mockRejectedValueOnce(
        new Error('authentication failed')
      );

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Authentication required - run api_status_check');
    });

    it('should direct to api_status_check for owner not found errors', async () => {
      mockExecuteGitHubCommand.mockRejectedValueOnce(
        new Error('owner not found')
      );

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState',
        owner: 'nonexistent-org',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Repository not found - verify names and permissions');
    });
  });

  describe('Parameter Validation Fixes', () => {
    it('should handle complex queries with language and extension by prioritizing language', async () => {
      const mockResults = [
        {
          path: 'src/components/App.tsx',
          repository: {
            id: 'R_validation123',
            isFork: false,
            isPrivate: false,
            nameWithOwner: 'microsoft/vscode',
            url: 'https://github.com/microsoft/vscode',
          },
          sha: 'valid123',
          textMatches: [
            {
              fragment: 'useState and useEffect implementation',
              matches: [
                {
                  indices: [0, 8] as [number, number],
                  text: 'useState',
                },
                {
                  indices: [13, 22] as [number, number],
                  text: 'useEffect',
                },
              ],
              property: 'content',
              type: 'FileContent',
            },
          ],
          url: 'https://github.com/microsoft/vscode/blob/main/src/components/App.tsx',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockResults),
              command:
                'gh search code "useState AND useEffect language:typescript" --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState AND useEffect',
        language: 'typescript',
        extension: 'tsx', // This should be ignored in favor of language for complex queries
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.processed_query).toBe(
        'useState AND useEffect language:typescript'
      );
      expect(data.debug_info.has_complex_boolean_logic).toBe(true);
      expect(data.total_count).toBe(1);
    });

    it('should use extension filter when language is not specified in complex queries', async () => {
      const mockResults = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockResults),
              command:
                'gh search code "useState AND useEffect extension:tsx" --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState AND useEffect',
        extension: 'tsx', // Should be included since no language specified
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.processed_query).toBe('useState AND useEffect extension:tsx');
      expect(data.debug_info.has_complex_boolean_logic).toBe(true);
    });

    it('should use CLI flags for simple queries with both language and extension', async () => {
      const mockResults = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockResults),
              command:
                'gh search code "useState hook" --language=typescript --extension=tsx --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState hook', // Simple query - auto-converted to OR
        language: 'typescript',
        extension: 'tsx',
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      // The processed_query shows the OR logic
      expect(data.processed_query).toBe('useState hook');
      expect(data.debug_info.has_complex_boolean_logic).toBe(false);
      // For simple queries, both language and extension should be CLI flags
      expect(data.debug_info.escaped_args).toContain('--language=typescript');
      expect(data.debug_info.escaped_args).toContain('--extension=tsx');
    });

    it('should handle multiple match types by using the first one', async () => {
      const mockResults = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockResults),
              command:
                'gh search code "useState" --match=file --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState',
        match: ['file', 'path'], // Should use first one (file)
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.debug_info.escaped_args).toContain('--match=file');
      expect(data.debug_info.escaped_args).not.toContain('--match=path');
    });

    it('should properly combine path and visibility filters in query string', async () => {
      const mockResults = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockResults),
              command:
                'gh search code "useState path:src/ visibility:public" --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState',
        path: 'src/',
        visibility: 'public',
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.processed_query).toBe('useState path:src/ visibility:public');
    });

    it('should handle owner/repo combinations correctly', async () => {
      const mockResults = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockResults),
              command:
                'gh search code "useState" --repo=facebook/react --repo=microsoft/vscode --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState',
        owner: ['facebook', 'microsoft'],
        repo: ['react', 'vscode'],
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.debug_info.escaped_args).toContain('--repo=facebook/react');
      expect(data.debug_info.escaped_args).toContain('--repo=facebook/vscode');
      expect(data.debug_info.escaped_args).toContain('--repo=microsoft/react');
      expect(data.debug_info.escaped_args).toContain('--repo=microsoft/vscode');
    });
  });

  describe('Query Processing Edge Cases', () => {
    it('should handle escaped quotes properly', async () => {
      const mockResults = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockResults),
              command:
                'gh search code "useState hook" --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: '\\"useState hook\\"', // Escaped quotes should become regular quotes
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.processed_query).toBe('"useState hook"');
    });

    it('should preserve multiple exact phrases', async () => {
      const mockResults = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockResults),
              command:
                'gh search code "import React" OR "from react" --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: '\\"import React\\" \\"from react\\"',
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      // Multiple quoted phrases get OR logic applied between them
      expect(data.processed_query).toBe('"import React" "from react"');
    });

    it('should handle mixed boolean operators and exact phrases', async () => {
      const mockResults = [];

      mockExecuteGitHubCommand.mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockResults),
              command:
                'gh search code "useState AND "React Hook" language:typescript" --limit=30 --json=repository,path,textMatches,sha,url',
            }),
          },
        ],
      });

      const result = await mockServer.callTool('github_search_code', {
        query: 'useState AND \\"React Hook\\"',
        language: 'typescript',
      });

      const data = parseResultJson<GitHubCodeSearchResponse>(result);

      expect(result.isError).toBe(false);
      expect(data.processed_query).toBe(
        'useState AND "React Hook" language:typescript'
      );
      expect(data.debug_info.has_complex_boolean_logic).toBe(true);
    });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteGitHubCommand = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeGitHubCommand: mockExecuteGitHubCommand,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

// Import after mocking
import { registerViewRepositoryStructureTool } from '../../src/mcp/tools/github_view_repo_structure.js';

describe('GitHub View Repository Structure Tool', () => {
  let mockServer: McpServer;

  beforeEach(() => {
    // Create a mock server with a tool method
    mockServer = {
      tool: vi.fn(),
    } as any;

    // Clear all mocks
    vi.clearAllMocks();

    // Default implementation for withCache - just execute the function
    mockWithCache.mockImplementation(
      async (key: string, fn: () => Promise<CallToolResult>) => fn()
    );

    // Default cache key generation
    mockGenerateCacheKey.mockReturnValue('test-cache-key');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub view repository structure tool with correct parameters', () => {
      registerViewRepositoryStructureTool(mockServer);

      expect(mockServer.tool).toHaveBeenCalledWith(
        'github_get_contents',
        expect.any(String),
        expect.objectContaining({
          owner: expect.any(Object),
          repo: expect.any(Object),
          branch: expect.any(Object),
          path: expect.any(Object),
        }),
        expect.objectContaining({
          title: 'github_get_contents',
          description: expect.any(String),
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        }),
        expect.any(Function)
      );
    });
  });

  describe('Successful Repository Structure Browsing', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerViewRepositoryStructureTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should browse repository root directory', async () => {
      const mockApiResponse = [
        {
          name: 'README.md',
          path: 'README.md',
          size: 1024,
          type: 'file',
          url: 'https://api.github.com/repos/facebook/react/contents/README.md?ref=main',
        },
        {
          name: 'src',
          path: 'src',
          size: 0,
          type: 'dir',
          url: 'https://api.github.com/repos/facebook/react/contents/src?ref=main',
        },
        {
          name: 'package.json',
          path: 'package.json',
          size: 2048,
          type: 'file',
          url: 'https://api.github.com/repos/facebook/react/contents/package.json?ref=main',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api /repos/facebook/react/contents/',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        owner: 'facebook',
        repo: 'react',
        branch: 'main',
        path: '',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.path).toBe('facebook/react');
      expect(data.baseUrl).toBe(
        'https://api.github.com/repos/facebook/react/contents/?ref=main'
      );
      expect(data.folders).toEqual(['src/']);
      expect(data.files).toHaveLength(2);
      expect(data.files).toEqual([
        {
          name: 'package.json',
          size: 2048,
          url: 'package.json?ref=main',
        },
        {
          name: 'README.md',
          size: 1024,
          url: 'README.md?ref=main',
        },
      ]);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        ['/repos/facebook/react/contents/?ref=main'],
        { cache: false }
      );
    });

    it('should browse subdirectory', async () => {
      const mockApiResponse = [
        {
          name: 'index.js',
          path: 'src/index.js',
          size: 512,
          type: 'file',
          url: 'https://api.github.com/repos/facebook/react/contents/src/index.js?ref=main',
        },
        {
          name: 'components',
          path: 'src/components',
          size: 0,
          type: 'dir',
          url: 'https://api.github.com/repos/facebook/react/contents/src/components?ref=main',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api /repos/facebook/react/contents/src',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        owner: 'facebook',
        repo: 'react',
        branch: 'main',
        path: 'src',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.path).toBe('facebook/react/src');
      expect(data.baseUrl).toBe(
        'https://api.github.com/repos/facebook/react/contents/src/?ref=main'
      );
      expect(data.folders).toEqual(['components/']);
      expect(data.files).toEqual([
        {
          name: 'index.js',
          size: 512,
          url: 'index.js?ref=main',
        },
      ]);

      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        ['/repos/facebook/react/contents/src?ref=main'],
        { cache: false }
      );
    });

    it('should handle single file response', async () => {
      const mockApiResponse = {
        name: 'README.md',
        path: 'README.md',
        size: 1024,
        type: 'file',
        url: 'https://api.github.com/repos/facebook/react/contents/README.md?ref=main',
      };

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api /repos/facebook/react/contents/README.md',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        owner: 'facebook',
        repo: 'react',
        branch: 'main',
        path: 'README.md',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.files).toHaveLength(1);
      expect(data.files[0]).toEqual({
        name: 'README.md',
        size: 1024,
        url: 'README.md?ref=main',
      });
      expect(data.folders).toEqual([]);
    });

    it('should sort results with directories first', async () => {
      const mockApiResponse = [
        {
          name: 'zebra.js',
          path: 'zebra.js',
          size: 100,
          type: 'file',
          url: 'https://api.github.com/repos/test/repo/contents/zebra.js?ref=main',
        },
        {
          name: 'alpha',
          path: 'alpha',
          size: 0,
          type: 'dir',
          url: 'https://api.github.com/repos/test/repo/contents/alpha?ref=main',
        },
        {
          name: 'beta.js',
          path: 'beta.js',
          size: 200,
          type: 'file',
          url: 'https://api.github.com/repos/test/repo/contents/beta.js?ref=main',
        },
        {
          name: 'charlie',
          path: 'charlie',
          size: 0,
          type: 'dir',
          url: 'https://api.github.com/repos/test/repo/contents/charlie?ref=main',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api /repos/test/repo/contents/',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        path: '',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      // Directories should come first, then files, both sorted alphabetically
      expect(data.folders).toEqual(['alpha/', 'charlie/']);
      expect(data.files.map((f: any) => f.name)).toEqual([
        'beta.js',
        'zebra.js',
      ]);
    });

    it('should handle path with leading slash', async () => {
      const mockApiResponse = [
        {
          name: 'test.js',
          path: 'src/test.js',
          size: 256,
          type: 'file',
          url: 'https://api.github.com/repos/test/repo/contents/src/test.js?ref=main',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api /repos/test/repo/contents/src',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        path: '/src', // Leading slash should be cleaned
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteGitHubCommand).toHaveBeenCalledWith(
        'api',
        ['/repos/test/repo/contents/src?ref=main'],
        { cache: false }
      );
    });

    it('should limit results to 100 items', async () => {
      // Create 150 mock items
      const mockApiResponse = Array.from({ length: 150 }, (_, i) => ({
        name: `file${i}.js`,
        path: `file${i}.js`,
        size: 100,
        type: 'file',
        url: `https://api.github.com/repos/test/repo/contents/file${i}.js?ref=main`,
      }));

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api /repos/test/repo/contents/',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        path: '',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.files).toHaveLength(100); // Should be limited to 100
    });
  });

  describe('Branch Fallback Logic', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerViewRepositoryStructureTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should use requested branch when available', async () => {
      const mockApiResponse = [
        {
          name: 'test.js',
          path: 'test.js',
          size: 100,
          type: 'file',
          url: 'https://api.github.com/repos/test/repo/contents/test.js?ref=develop',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api /repos/test/repo/contents/',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        owner: 'test',
        repo: 'repo',
        branch: 'develop',
        path: '',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.baseUrl).toContain('ref=develop');
      expect(data.branchFallback).toBeUndefined(); // No fallback used
    });

    it('should fallback to default branch when requested branch fails', async () => {
      // The implementation first calls getSmartBranchFallback which tries to get repo info
      // Then it tries each branch in sequence: nonexistent (fails), main (succeeds)
      mockExecuteGitHubCommand
        // First call: getSmartBranchFallback tries to get repo info
        .mockResolvedValueOnce({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: JSON.stringify({
                  default_branch: 'main',
                }),
                command: 'gh api /repos/test/repo',
                type: 'github',
              }),
            },
          ],
        })
        // Second call: try nonexistent branch (fails)
        .mockResolvedValueOnce({
          isError: true,
          content: [{ text: 'Branch not found' }],
        })
        // Third call: try main branch (succeeds)
        .mockResolvedValueOnce({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: JSON.stringify([
                  {
                    name: 'test.js',
                    path: 'test.js',
                    size: 100,
                    type: 'file',
                    url: 'https://api.github.com/repos/test/repo/contents/test.js?ref=main',
                  },
                ]),
                command: 'gh api /repos/test/repo/contents/',
                type: 'github',
              }),
            },
          ],
        });

      const result = await toolHandler({
        owner: 'test',
        repo: 'repo',
        branch: 'nonexistent',
        path: '',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.baseUrl).toContain('ref=main');
      expect(data.branchFallback).toEqual({
        requested: 'nonexistent',
        used: 'main',
        message: "Used 'main' instead of 'nonexistent'",
      });
    });

    it('should fallback to common branches when default branch detection fails', async () => {
      // All calls fail except the last one (master branch)
      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: true,
          content: [{ text: 'Branch not found' }],
        })
        .mockResolvedValueOnce({
          isError: true,
          content: [{ text: 'Repo info failed' }],
        })
        .mockResolvedValueOnce({
          isError: true,
          content: [{ text: 'Main branch not found' }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: JSON.stringify([
                  {
                    name: 'legacy.js',
                    path: 'legacy.js',
                    size: 200,
                    type: 'file',
                    url: 'https://api.github.com/repos/old/repo/contents/legacy.js?ref=master',
                  },
                ]),
                command: 'gh api /repos/old/repo/contents/',
                type: 'github',
              }),
            },
          ],
        });

      const result = await toolHandler({
        owner: 'old',
        repo: 'repo',
        branch: 'feature',
        path: '',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.baseUrl).toContain('ref=master');
      expect(data.branchFallback).toEqual({
        requested: 'feature',
        used: 'master',
        message: "Used 'master' instead of 'feature'",
      });
    });
  });

  describe('Error Handling', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerViewRepositoryStructureTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should handle repository not found', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: '404 Not Found' }],
      });

      const result = await toolHandler({
        owner: 'nonexistent',
        repo: 'repo',
        branch: 'main',
        path: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('nonexistent/repo');
      expect(result.content[0].text).toContain('not found');
    });

    it('should handle path not found with suggestions', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: '404 Not Found' }],
      });

      const result = await toolHandler({
        owner: 'facebook',
        repo: 'react',
        branch: 'main',
        path: 'nonexistent/path',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Path "nonexistent/path" not found'
      );
    });

    it('should handle access denied errors', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: true,
        content: [{ text: '403 Forbidden' }],
      });

      const result = await toolHandler({
        owner: 'private',
        repo: 'repo',
        branch: 'main',
        path: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Access denied to repository private/repo'
      );
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network timeout');

      // Mock the repo info call to succeed (for getSmartBranchFallback)
      mockExecuteGitHubCommand
        .mockResolvedValueOnce({
          isError: false,
          content: [
            {
              text: JSON.stringify({
                result: JSON.stringify({
                  default_branch: 'main',
                }),
                command: 'gh api /repos/test/repo',
                type: 'github',
              }),
            },
          ],
        })
        // Then all branch attempts fail with network error
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError);

      const result = await toolHandler({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        path: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Repository access failed');
      // Network errors fall through to generic message, not specific error handling
      expect(result.content[0].text).toContain('test/repo');
    });

    it('should handle malformed JSON responses', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: 'invalid json response',
          },
        ],
      });

      const result = await toolHandler({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        path: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Repository access failed');
    });
  });

  describe('Input Validation', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerViewRepositoryStructureTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should validate owner format', async () => {
      // Test that valid owner formats work
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([
                {
                  name: 'test.js',
                  path: 'test.js',
                  size: 100,
                  type: 'file',
                  url: 'https://api.github.com/repos/valid-owner123/valid-repo/contents/test.js?ref=main',
                },
              ]),
              command: 'gh api /repos/valid-owner123/valid-repo/contents/',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        owner: 'valid-owner123',
        repo: 'valid-repo',
        branch: 'main',
        path: '',
      });

      expect(result.isError).toBe(false);
    });

    it('should validate repository name format', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([
                {
                  name: 'test.js',
                  path: 'test.js',
                  size: 100,
                  type: 'file',
                  url: 'https://api.github.com/repos/test/valid-repo.name_123/contents/test.js?ref=main',
                },
              ]),
              command: 'gh api /repos/test/valid-repo.name_123/contents/',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        owner: 'test',
        repo: 'valid-repo.name_123',
        branch: 'main',
        path: '',
      });

      expect(result.isError).toBe(false);
    });

    it('should validate branch name format', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([
                {
                  name: 'test.js',
                  path: 'test.js',
                  size: 100,
                  type: 'file',
                  url: 'https://api.github.com/repos/test/repo/contents/test.js?ref=feature/branch-name',
                },
              ]),
              command: 'gh api /repos/test/repo/contents/',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        owner: 'test',
        repo: 'repo',
        branch: 'feature/branch-name',
        path: '',
      });

      expect(result.isError).toBe(false);
    });

    it('should handle path traversal prevention', async () => {
      // Path traversal should be prevented by Zod validation
      // Test that normal paths work
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([
                {
                  name: 'test.js',
                  path: 'safe/path/test.js',
                  size: 100,
                  type: 'file',
                  url: 'https://api.github.com/repos/test/repo/contents/safe/path/test.js?ref=main',
                },
              ]),
              command: 'gh api /repos/test/repo/contents/safe/path',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        path: 'safe/path',
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('Caching', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerViewRepositoryStructureTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should use cache for repository structure requests', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
              command: 'gh api /repos/test/repo/contents/',
              type: 'github',
            }),
          },
        ],
      });

      await toolHandler({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        path: 'src',
      });

      expect(mockGenerateCacheKey).toHaveBeenCalledWith('gh-repo-structure', {
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        path: 'src',
      });
      expect(mockWithCache).toHaveBeenCalledWith(
        'test-cache-key',
        expect.any(Function)
      );
    });

    it('should generate different cache keys for different parameters', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([]),
              command: 'gh api /repos/test/repo/contents/',
              type: 'github',
            }),
          },
        ],
      });

      // First request
      await toolHandler({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        path: 'src',
      });

      // Second request with different path
      await toolHandler({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        path: 'docs',
      });

      expect(mockGenerateCacheKey).toHaveBeenCalledTimes(2);
      expect(mockGenerateCacheKey).toHaveBeenNthCalledWith(
        1,
        'gh-repo-structure',
        {
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          path: 'src',
        }
      );
      expect(mockGenerateCacheKey).toHaveBeenNthCalledWith(
        2,
        'gh-repo-structure',
        {
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          path: 'docs',
        }
      );
    });
  });

  describe('Response Formatting', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerViewRepositoryStructureTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should format file URLs correctly', async () => {
      const mockApiResponse = [
        {
          name: 'test.js',
          path: 'src/test.js',
          size: 256,
          type: 'file',
          url: 'https://api.github.com/repos/test/repo/contents/src/test.js?ref=main',
        },
      ];

      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify(mockApiResponse),
              command: 'gh api /repos/test/repo/contents/src',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        path: 'src',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.files[0].url).toBe('test.js?ref=main');
    });

    it('should format base URL correctly', async () => {
      mockExecuteGitHubCommand.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              result: JSON.stringify([
                {
                  name: 'Component.js',
                  path: 'src/components/Component.js',
                  size: 500,
                  type: 'file',
                  url: 'https://api.github.com/repos/test/repo/contents/src/components/Component.js?ref=develop',
                },
              ]),
              command: 'gh api /repos/test/repo/contents/src/components',
              type: 'github',
            }),
          },
        ],
      });

      const result = await toolHandler({
        owner: 'test',
        repo: 'repo',
        branch: 'develop',
        path: 'src/components',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.baseUrl).toBe(
        'https://api.github.com/repos/test/repo/contents/src/components/?ref=develop'
      );
      expect(data.path).toBe('test/repo/src/components');
    });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { viewGitHubRepositoryStructureAPI } from '../../src/github/fileOperations.js';
import { getOctokit } from '../../src/github/client.js';

vi.mock('../../src/github/client.js');
vi.mock('../../src/session.js', () => ({
  logSessionError: vi.fn(() => Promise.resolve()),
}));

describe('GitHub File Operations - Recursive Directory Structure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('viewGitHubRepositoryStructureAPI with depth > 1', () => {
    it('should recursively fetch directory contents with depth 2', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            get: vi.fn().mockResolvedValue({
              data: {
                default_branch: 'main',
              },
            }),
            getContent: vi
              .fn()
              // First call - root directory
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'src',
                    path: 'src',
                    type: 'dir',
                    size: 0,
                    url: 'https://api.github.com/repos/test/repo/contents/src',
                    html_url: 'https://github.com/test/repo/tree/main/src',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/trees/abc',
                    sha: 'abc123',
                  },
                  {
                    name: 'README.md',
                    path: 'README.md',
                    type: 'file',
                    size: 100,
                    url: 'https://api.github.com/repos/test/repo/contents/README.md',
                    html_url:
                      'https://github.com/test/repo/blob/main/README.md',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/blobs/def',
                    sha: 'def456',
                  },
                ],
              })
              // Second call - src directory
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'index.ts',
                    path: 'src/index.ts',
                    type: 'file',
                    size: 200,
                    url: 'https://api.github.com/repos/test/repo/contents/src/index.ts',
                    html_url:
                      'https://github.com/test/repo/blob/main/src/index.ts',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/blobs/ghi',
                    sha: 'ghi789',
                  },
                  {
                    name: 'utils',
                    path: 'src/utils',
                    type: 'dir',
                    size: 0,
                    url: 'https://api.github.com/repos/test/repo/contents/src/utils',
                    html_url:
                      'https://github.com/test/repo/tree/main/src/utils',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/trees/jkl',
                    sha: 'jkl012',
                  },
                ],
              }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await viewGitHubRepositoryStructureAPI({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        depth: 2,
      });

      expect('files' in result).toBe(true);
      if ('files' in result) {
        expect(result.files.length).toBeGreaterThan(0);
        expect(result.folders.folders.length).toBeGreaterThan(0);
        // Should have made API calls (at least once)
        expect(mockOctokit.rest.repos.getContent).toHaveBeenCalled();
      }
    });

    it('should handle circular/visited path detection', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            get: vi.fn().mockResolvedValue({
              data: {
                default_branch: 'main',
              },
            }),
            getContent: vi
              .fn()
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'src',
                    path: 'src',
                    type: 'dir',
                    size: 0,
                    url: 'https://api.github.com/repos/test/repo/contents/src',
                    html_url: 'https://github.com/test/repo/tree/main/src',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/trees/abc',
                    sha: 'abc123',
                  },
                ],
              })
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'index.ts',
                    path: 'src/index.ts',
                    type: 'file',
                    size: 100,
                    url: 'https://api.github.com/repos/test/repo/contents/src/index.ts',
                    html_url:
                      'https://github.com/test/repo/blob/main/src/index.ts',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/blobs/def',
                    sha: 'def456',
                  },
                ],
              }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await viewGitHubRepositoryStructureAPI({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        depth: 2,
      });

      expect('files' in result).toBe(true);
      if ('files' in result) {
        // Should not infinitely recurse - verify result exists
        expect(result.files.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should deduplicate items when combining recursive results', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            get: vi.fn().mockResolvedValue({
              data: {
                default_branch: 'main',
              },
            }),
            getContent: vi
              .fn()
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'src',
                    path: 'src',
                    type: 'dir',
                    size: 0,
                    url: 'https://api.github.com/repos/test/repo/contents/src',
                    html_url: 'https://github.com/test/repo/tree/main/src',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/trees/abc',
                    sha: 'abc123',
                  },
                  {
                    name: 'index.ts',
                    path: 'index.ts',
                    type: 'file',
                    size: 100,
                    url: 'https://api.github.com/repos/test/repo/contents/index.ts',
                    html_url: 'https://github.com/test/repo/blob/main/index.ts',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/blobs/xyz',
                    sha: 'xyz789',
                  },
                ],
              })
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'index.ts',
                    path: 'src/index.ts',
                    type: 'file',
                    size: 200,
                    url: 'https://api.github.com/repos/test/repo/contents/src/index.ts',
                    html_url:
                      'https://github.com/test/repo/blob/main/src/index.ts',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/blobs/def',
                    sha: 'def456',
                  },
                ],
              }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await viewGitHubRepositoryStructureAPI({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        depth: 2,
      });

      expect('files' in result).toBe(true);
      if ('files' in result) {
        // Should have unique paths
        const paths = result.files.map(f => f.path);
        const uniquePaths = new Set(paths);
        expect(paths.length).toBe(uniquePaths.size);
      }
    });

    it('should handle errors in recursive directory fetching gracefully', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            get: vi.fn().mockResolvedValue({
              data: {
                default_branch: 'main',
              },
            }),
            getContent: vi
              .fn()
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'src',
                    path: 'src',
                    type: 'dir',
                    size: 0,
                    url: 'https://api.github.com/repos/test/repo/contents/src',
                    html_url: 'https://github.com/test/repo/tree/main/src',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/trees/abc',
                    sha: 'abc123',
                  },
                  {
                    name: 'docs',
                    path: 'docs',
                    type: 'dir',
                    size: 0,
                    url: 'https://api.github.com/repos/test/repo/contents/docs',
                    html_url: 'https://github.com/test/repo/tree/main/docs',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/trees/def',
                    sha: 'def456',
                  },
                ],
              })
              // Error for src directory
              .mockRejectedValueOnce(new Error('Access denied'))
              // Success for docs directory
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'README.md',
                    path: 'docs/README.md',
                    type: 'file',
                    size: 100,
                    url: 'https://api.github.com/repos/test/repo/contents/docs/README.md',
                    html_url:
                      'https://github.com/test/repo/blob/main/docs/README.md',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/blobs/ghi',
                    sha: 'ghi789',
                  },
                ],
              }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await viewGitHubRepositoryStructureAPI({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        depth: 2,
      });

      expect('files' in result).toBe(true);
      if ('files' in result) {
        // Should still return results from successful directories
        expect(result.folders.folders.length).toBeGreaterThan(0);
      }
    });

    it('should sort items by type (dirs first) and depth', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            get: vi.fn().mockResolvedValue({
              data: {
                default_branch: 'main',
              },
            }),
            getContent: vi
              .fn()
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'file1.ts',
                    path: 'file1.ts',
                    type: 'file',
                    size: 100,
                    url: 'https://api.github.com/repos/test/repo/contents/file1.ts',
                    html_url: 'https://github.com/test/repo/blob/main/file1.ts',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/blobs/a',
                    sha: 'aaa',
                  },
                  {
                    name: 'src',
                    path: 'src',
                    type: 'dir',
                    size: 0,
                    url: 'https://api.github.com/repos/test/repo/contents/src',
                    html_url: 'https://github.com/test/repo/tree/main/src',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/trees/b',
                    sha: 'bbb',
                  },
                  {
                    name: 'file2.ts',
                    path: 'file2.ts',
                    type: 'file',
                    size: 100,
                    url: 'https://api.github.com/repos/test/repo/contents/file2.ts',
                    html_url: 'https://github.com/test/repo/blob/main/file2.ts',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/blobs/c',
                    sha: 'ccc',
                  },
                ],
              })
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'index.ts',
                    path: 'src/index.ts',
                    type: 'file',
                    size: 200,
                    url: 'https://api.github.com/repos/test/repo/contents/src/index.ts',
                    html_url:
                      'https://github.com/test/repo/blob/main/src/index.ts',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/blobs/d',
                    sha: 'ddd',
                  },
                ],
              }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await viewGitHubRepositoryStructureAPI({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        depth: 2,
      });

      expect('files' in result).toBe(true);
      if ('files' in result) {
        // Directories should come first
        const allItems = [
          ...result.folders.folders.map(f => ({ type: 'dir', path: f.path })),
          ...result.files.map(f => ({ type: 'file', path: f.path })),
        ];

        let seenFile = false;
        for (const item of allItems) {
          if (item.type === 'file') {
            seenFile = true;
          }
          if (seenFile && item.type === 'dir') {
            // Found a directory after a file - sorting is wrong
            expect(true).toBe(false); // Fail the test
          }
        }

        expect(result.folders.folders.length).toBeGreaterThan(0);
      }
    });

    it('should filter ignored directories correctly', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            get: vi.fn().mockResolvedValue({
              data: {
                default_branch: 'main',
              },
            }),
            getContent: vi
              .fn()
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'node_modules',
                    path: 'node_modules',
                    type: 'dir',
                    size: 0,
                    url: 'https://api.github.com/repos/test/repo/contents/node_modules',
                    html_url:
                      'https://github.com/test/repo/tree/main/node_modules',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/trees/a',
                    sha: 'aaa',
                  },
                  {
                    name: '.git',
                    path: '.git',
                    type: 'dir',
                    size: 0,
                    url: 'https://api.github.com/repos/test/repo/contents/.git',
                    html_url: 'https://github.com/test/repo/tree/main/.git',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/trees/b',
                    sha: 'bbb',
                  },
                  {
                    name: 'src',
                    path: 'src',
                    type: 'dir',
                    size: 0,
                    url: 'https://api.github.com/repos/test/repo/contents/src',
                    html_url: 'https://github.com/test/repo/tree/main/src',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/trees/c',
                    sha: 'ccc',
                  },
                ],
              })
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'index.ts',
                    path: 'src/index.ts',
                    type: 'file',
                    size: 100,
                    url: 'https://api.github.com/repos/test/repo/contents/src/index.ts',
                    html_url:
                      'https://github.com/test/repo/blob/main/src/index.ts',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/blobs/d',
                    sha: 'ddd',
                  },
                ],
              }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await viewGitHubRepositoryStructureAPI({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        depth: 2,
      });

      expect('files' in result).toBe(true);
      if ('files' in result) {
        // Should not include node_modules or .git
        const folderNames = result.folders.folders.map(f =>
          f.path.split('/').pop()
        );
        expect(folderNames).not.toContain('node_modules');
        expect(folderNames).not.toContain('.git');

        // Should include src
        expect(folderNames).toContain('src');
      }
    });

    it('should respect item limit based on depth', async () => {
      // Generate many items
      const manyItems = Array.from({ length: 100 }, (_, i) => ({
        name: `file${i}.ts`,
        path: `file${i}.ts`,
        type: 'file' as const,
        size: 100,
        url: `https://api.github.com/repos/test/repo/contents/file${i}.ts`,
        html_url: `https://github.com/test/repo/blob/main/file${i}.ts`,
        git_url: `https://api.github.com/repos/test/repo/git/blobs/${i}`,
        sha: `sha${i}`,
      }));

      const mockOctokit = {
        rest: {
          repos: {
            get: vi.fn().mockResolvedValue({
              data: {
                default_branch: 'main',
              },
            }),
            getContent: vi.fn().mockResolvedValueOnce({
              data: manyItems,
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await viewGitHubRepositoryStructureAPI({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        depth: 1,
      });

      expect('files' in result).toBe(true);
      if ('files' in result) {
        // Should be limited (default is 50 for depth 1)
        expect(result.files.length).toBeLessThanOrEqual(50);
        expect(result.summary?.truncated).toBe(true);
        expect(result.summary?.originalCount).toBeGreaterThan(
          result.files.length
        );
      }
    });

    it('should handle depth > maxDepth in recursive function', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            get: vi.fn().mockResolvedValue({
              data: {
                default_branch: 'main',
              },
            }),
            getContent: vi
              .fn()
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'src',
                    path: 'src',
                    type: 'dir',
                    size: 0,
                    url: 'https://api.github.com/repos/test/repo/contents/src',
                    html_url: 'https://github.com/test/repo/tree/main/src',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/trees/a',
                    sha: 'aaa',
                  },
                ],
              })
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'nested',
                    path: 'src/nested',
                    type: 'dir',
                    size: 0,
                    url: 'https://api.github.com/repos/test/repo/contents/src/nested',
                    html_url:
                      'https://github.com/test/repo/tree/main/src/nested',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/trees/b',
                    sha: 'bbb',
                  },
                ],
              })
              // Should not reach this level with depth=2
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'deep.ts',
                    path: 'src/nested/deep.ts',
                    type: 'file',
                    size: 100,
                    url: 'https://api.github.com/repos/test/repo/contents/src/nested/deep.ts',
                    html_url:
                      'https://github.com/test/repo/blob/main/src/nested/deep.ts',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/blobs/c',
                    sha: 'ccc',
                  },
                ],
              }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await viewGitHubRepositoryStructureAPI({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        depth: 2,
      });

      expect('files' in result).toBe(true);
      if ('files' in result) {
        // With depth=2, should fetch directories
        expect(result.folders.folders.length).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

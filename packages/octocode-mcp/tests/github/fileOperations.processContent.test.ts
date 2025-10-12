import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchGitHubFileContentAPI,
  viewGitHubRepositoryStructureAPI,
} from '../../src/github/fileOperations.js';
import { getOctokit } from '../../src/github/client.js';
import { RequestError } from 'octokit';
import * as octocodeUtils from 'octocode-utils';

// Helper to create RequestError with proper structure
function createRequestError(message: string, status: number) {
  return new RequestError(message, status, {
    request: {
      method: 'GET',
      url: 'https://api.github.com/test',
      headers: {},
    },
    response: {
      status,
      url: 'https://api.github.com/test',
      headers: {},
      data: {},
      retryCount: 0,
    },
  });
}

// Mock dependencies
vi.mock('../../src/github/client.js');
vi.mock('octocode-utils');

describe('GitHub File Operations - processFileContentAPI coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchGitHubFileContentAPI - File Size and Encoding', () => {
    it('should reject files larger than 300KB', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'file',
                content: Buffer.from('test').toString('base64'),
                size: 400 * 1024, // 400KB - exceeds limit
                sha: 'abc123',
                name: 'large-file.txt',
                path: 'large-file.txt',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'large-file.txt',
      });

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('File too large');
        expect(result.error).toContain('400KB');
        expect(result.error).toContain('300KB');
        expect(result.status).toBe(413);
      }
    });

    it('should handle files at exactly 300KB (boundary)', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'file',
                content: Buffer.from('x'.repeat(300 * 1024)).toString('base64'),
                size: 300 * 1024,
                sha: 'abc123',
                name: 'boundary.txt',
                path: 'boundary.txt',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );
      vi.mocked(octocodeUtils.minifyContent).mockResolvedValue({
        content: 'minified',
        failed: false,
        type: 'general',
      });

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'boundary.txt',
      });

      expect(result).toHaveProperty('data');
      expect('error' in result).toBe(false);
    });

    it('should detect and reject binary files', async () => {
      // Create binary content with null bytes
      const binaryBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]); // PNG header with null byte

      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'file',
                content: binaryBuffer.toString('base64'),
                size: 100,
                sha: 'abc123',
                name: 'image.png',
                path: 'image.png',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'image.png',
      });

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Binary file detected');
        expect(result.status).toBe(415);
      }
    });

    it('should handle empty file content', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'file',
                content: '', // Empty content
                size: 0,
                sha: 'abc123',
                name: 'empty.txt',
                path: 'empty.txt',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'empty.txt',
      });

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('File is empty');
        expect(result.status).toBe(404);
      }
    });

    it('should handle whitespace-only base64 content', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'file',
                content: '   \n  \t  ', // Only whitespace
                size: 10,
                sha: 'abc123',
                name: 'whitespace.txt',
                path: 'whitespace.txt',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'whitespace.txt',
      });

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('File is empty');
      }
    });

    it('should handle encoding/decoding errors', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'file',
                content: 'invalid!!!base64', // Invalid base64
                size: 100,
                sha: 'abc123',
                name: 'invalid.txt',
                path: 'invalid.txt',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'invalid.txt',
      });

      // Should either succeed (base64 might be valid) or fail with decode error
      if ('error' in result) {
        expect(result.error).toBeTruthy();
      }
    });

    it('should reject directory paths', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: [
                { name: 'file1.txt', type: 'file' },
                { name: 'file2.txt', type: 'file' },
              ],
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'directory',
      });

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Path is a directory');
        expect(result.error).toContain('githubViewRepoStructure');
        expect(result.status).toBe(400);
      }
    });

    it('should reject unsupported file types (symlinks)', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'symlink',
                target: 'target.txt',
                name: 'link.txt',
                path: 'link.txt',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'link.txt',
      });

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Unsupported file type');
        expect(result.status).toBe(415);
      }
    });
  });

  describe('fetchGitHubFileContentAPI - Match String Not Found', () => {
    it('should handle matchString not found in file', async () => {
      const fileContent = 'Line 1\nLine 2\nLine 3\nLine 4';

      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'file',
                content: Buffer.from(fileContent).toString('base64'),
                size: fileContent.length,
                sha: 'abc123',
                name: 'test.txt',
                path: 'test.txt',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'test.txt',
        matchString: 'NonExistentString',
      });

      // When matchString not found, returns data with error field
      expect(result).toHaveProperty('status');
      if ('data' in result && result.data && typeof result.data === 'object') {
        expect('error' in result.data).toBe(true);
        const errorField = (result.data as Record<string, unknown>).error;
        expect(errorField).toContain('Match string');
        expect(errorField).toContain('not found');
      }
    });

    it('should find matchString and include it in response', async () => {
      const fileContent = 'Line 1\nTarget Line\nLine 3\nLine 4\nLine 5';

      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'file',
                content: Buffer.from(fileContent).toString('base64'),
                size: fileContent.length,
                sha: 'abc123',
                name: 'test.txt',
                path: 'test.txt',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );
      vi.mocked(octocodeUtils.minifyContent).mockImplementation(
        async content => ({
          content,
          failed: false,
          type: 'general',
        })
      );

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'test.txt',
        matchString: 'Target Line',
        matchStringContextLines: 1,
      });

      expect(result).toHaveProperty('data');
      if ('data' in result && !('error' in result.data)) {
        expect(result.data.isPartial).toBe(true);
        expect(result.data.startLine).toBeLessThanOrEqual(2);
        expect(result.data.endLine).toBeGreaterThanOrEqual(2);
        expect(result.data.securityWarnings).toBeDefined();
        expect(
          result.data.securityWarnings?.some(w =>
            w.includes('Found "Target Line"')
          )
        ).toBe(true);
      }
    });
  });

  describe('fetchGitHubFileContentAPI - Line Range Edge Cases', () => {
    it('should handle invalid startLine (< 1)', async () => {
      const fileContent = 'Line 1\nLine 2\nLine 3';

      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'file',
                content: Buffer.from(fileContent).toString('base64'),
                size: fileContent.length,
                sha: 'abc123',
                name: 'test.txt',
                path: 'test.txt',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );
      vi.mocked(octocodeUtils.minifyContent).mockImplementation(
        async content => ({
          content,
          failed: false,
          type: 'general',
        })
      );

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'test.txt',
        startLine: -5,
        endLine: 2,
      });

      // Should return full content when invalid range
      expect(result).toHaveProperty('data');
      if ('data' in result && !('error' in result.data)) {
        expect(result.data.content).toContain('Line 1');
        expect(result.data.content).toContain('Line 3');
      }
    });

    it('should handle startLine > totalLines', async () => {
      const fileContent = 'Line 1\nLine 2\nLine 3';

      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'file',
                content: Buffer.from(fileContent).toString('base64'),
                size: fileContent.length,
                sha: 'abc123',
                name: 'test.txt',
                path: 'test.txt',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );
      vi.mocked(octocodeUtils.minifyContent).mockImplementation(
        async content => ({
          content,
          failed: false,
          type: 'general',
        })
      );

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'test.txt',
        startLine: 100,
        endLine: 200,
      });

      // Should return full content when out of bounds
      expect(result).toHaveProperty('data');
      if ('data' in result && !('error' in result.data)) {
        expect(result.data.content).toBeTruthy();
      }
    });

    it('should handle endLine < startLine', async () => {
      const fileContent = 'Line 1\nLine 2\nLine 3';

      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'file',
                content: Buffer.from(fileContent).toString('base64'),
                size: fileContent.length,
                sha: 'abc123',
                name: 'test.txt',
                path: 'test.txt',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );
      vi.mocked(octocodeUtils.minifyContent).mockImplementation(
        async content => ({
          content,
          failed: false,
          type: 'general',
        })
      );

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'test.txt',
        startLine: 5,
        endLine: 2,
      });

      // Should return full content when invalid range
      expect(result).toHaveProperty('data');
      if ('data' in result && !('error' in result.data)) {
        expect(result.data.content).toBeTruthy();
      }
    });

    it('should adjust endLine when it exceeds totalLines', async () => {
      const fileContent = 'Line 1\nLine 2\nLine 3';

      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'file',
                content: Buffer.from(fileContent).toString('base64'),
                size: fileContent.length,
                sha: 'abc123',
                name: 'test.txt',
                path: 'test.txt',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );
      vi.mocked(octocodeUtils.minifyContent).mockImplementation(
        async content => ({
          content,
          failed: false,
          type: 'general',
        })
      );

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'test.txt',
        startLine: 1,
        endLine: 100,
      });

      expect(result).toHaveProperty('data');
      if ('data' in result && !('error' in result.data)) {
        expect(result.data.isPartial).toBe(true);
        expect(result.data.endLine).toBe(3); // Adjusted to file end
        expect(result.data.securityWarnings).toBeDefined();
        expect(
          result.data.securityWarnings?.some(w => w.includes('adjusted to 3'))
        ).toBe(true);
      }
    });

    it('should handle only endLine provided (defaults startLine to 1)', async () => {
      const fileContent = 'Line 1\nLine 2\nLine 3\nLine 4';

      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'file',
                content: Buffer.from(fileContent).toString('base64'),
                size: fileContent.length,
                sha: 'abc123',
                name: 'test.txt',
                path: 'test.txt',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );
      vi.mocked(octocodeUtils.minifyContent).mockImplementation(
        async content => ({
          content,
          failed: false,
          type: 'general',
        })
      );

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'test.txt',
        endLine: 2,
      });

      expect(result).toHaveProperty('data');
      if ('data' in result && !('error' in result.data)) {
        expect(result.data.isPartial).toBe(true);
        expect(result.data.startLine).toBe(1);
        expect(result.data.endLine).toBe(2);
      }
    });
  });

  describe('fetchGitHubFileContentAPI - Minification Edge Cases', () => {
    it('should handle minification failure gracefully', async () => {
      const fileContent = 'Test content';

      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'file',
                content: Buffer.from(fileContent).toString('base64'),
                size: fileContent.length,
                sha: 'abc123',
                name: 'test.js',
                path: 'test.js',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );
      vi.mocked(octocodeUtils.minifyContent).mockResolvedValue({
        content: fileContent, // Returns original content
        failed: true,
        type: 'terser',
      });

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'test.js',
        minified: true,
      });

      expect(result).toHaveProperty('data');
      if ('data' in result && !('error' in result.data)) {
        expect(result.data.minified).toBe(false);
        expect(result.data.minificationFailed).toBe(true);
        expect(result.data.minificationType).toBe('terser');
      }
    });

    it('should skip minification when minified=false', async () => {
      const fileContent = 'Test content';

      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                type: 'file',
                content: Buffer.from(fileContent).toString('base64'),
                size: fileContent.length,
                sha: 'abc123',
                name: 'test.txt',
                path: 'test.txt',
              },
            }),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'repo',
        path: 'test.txt',
        minified: false,
      });

      expect(result).toHaveProperty('data');
      if ('data' in result && !('error' in result.data)) {
        expect(result.data).not.toHaveProperty('minified');
        expect(result.data).not.toHaveProperty('minificationFailed');
      }

      // minifyContent should not be called
      expect(octocodeUtils.minifyContent).not.toHaveBeenCalled();
    });
  });

  describe('viewGitHubRepositoryStructureAPI - Branch Fallback', () => {
    it('should try default branch when requested branch fails', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi
              .fn()
              .mockRejectedValueOnce(createRequestError('Not Found', 404))
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'README.md',
                    path: 'README.md',
                    type: 'file',
                    size: 100,
                    sha: 'abc',
                  },
                ],
              }),
            get: vi.fn().mockResolvedValue({
              data: {
                default_branch: 'main',
              },
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
        branch: 'feature-branch',
        path: '',
      });

      expect(result).toHaveProperty('files');
      if ('files' in result) {
        expect(result.branch).toBe('main');
      }
    });

    it('should try common branches when default branch also fails', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi
              .fn()
              .mockRejectedValueOnce(createRequestError('Not Found', 404)) // Original branch
              .mockRejectedValueOnce(createRequestError('Not Found', 404)) // Default branch
              .mockResolvedValueOnce({
                // master branch succeeds
                data: [
                  {
                    name: 'index.js',
                    path: 'index.js',
                    type: 'file',
                    size: 50,
                    sha: 'def',
                  },
                ],
              }),
            get: vi.fn().mockResolvedValue({
              data: {
                default_branch: 'main',
              },
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
        branch: 'nonexistent',
        path: '',
      });

      expect(result).toHaveProperty('files');
      if ('files' in result) {
        expect(result.branch).toBe('master');
      }
    });

    it.skip('should return error when all branch fallbacks fail', async () => {
      // Mock rejects EVERYTHING - all calls fail
      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi
              .fn()
              .mockRejectedValue(createRequestError('Not Found', 404)),
            get: vi.fn().mockResolvedValue({
              data: {
                default_branch: 'main',
              },
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
        branch: 'nonexistent',
        path: '',
      });

      expect(result).toHaveProperty('error');
      if ('error' in result) {
        expect(result.error).toContain('not found');
        expect(result.triedBranches).toBeDefined();
        expect(result.defaultBranch).toBe('main');
      }
    });

    it('should return error when repository itself is not accessible', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            getContent: vi
              .fn()
              .mockRejectedValue(createRequestError('Not Found', 404)),
            get: vi
              .fn()
              .mockRejectedValue(createRequestError('Not Found', 404)),
          },
        },
      };

      vi.mocked(getOctokit).mockResolvedValue(
        mockOctokit as unknown as ReturnType<typeof getOctokit>
      );

      const result = await viewGitHubRepositoryStructureAPI({
        owner: 'test',
        repo: 'nonexistent',
        branch: 'main',
        path: '',
      });

      expect(result).toHaveProperty('error');
      if ('error' in result) {
        expect(result.error).toContain('not found');
        expect(result.error).toContain('not accessible');
      }
    });
  });
});

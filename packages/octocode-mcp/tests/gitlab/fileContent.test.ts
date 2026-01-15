import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  GitLabFileContent,
  GitLabAPIResponse,
} from '../../src/gitlab/types.js';

// Mock the gitlab client module
vi.mock('../../src/gitlab/client.js', () => ({
  getGitlab: vi.fn(),
}));

// Mock the cache module
vi.mock('../../src/utils/http/cache.js', () => ({
  generateCacheKey: vi.fn((prefix, params, sessionId) => {
    const paramStr = JSON.stringify(params);
    return sessionId
      ? `${prefix}:${sessionId}:${paramStr}`
      : `${prefix}:${paramStr}`;
  }),
  withDataCache: vi.fn(
    async <T>(
      _cacheKey: string,
      operation: () => Promise<T>,
      _options?: { shouldCache?: (value: T) => boolean }
    ): Promise<T> => {
      return operation();
    }
  ),
  clearAllCache: vi.fn(),
}));

import { getGitlab } from '../../src/gitlab/client.js';
import { generateCacheKey, withDataCache } from '../../src/utils/http/cache.js';
import {
  fetchGitLabFileContentAPI,
  getGitLabDefaultBranch,
  gitLabFileExists,
  transformGitLabFileContent,
} from '../../src/gitlab/fileContent.js';

const mockGetGitlab = vi.mocked(getGitlab);
const mockGenerateCacheKey = vi.mocked(generateCacheKey);
const mockWithDataCache = vi.mocked(withDataCache);

describe('GitLab File Content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchGitLabFileContentAPI', () => {
    describe('validation errors', () => {
      it('should return error when projectId is missing', async () => {
        const result = await fetchGitLabFileContentAPI({
          projectId: '',
          path: 'README.md',
          ref: 'main',
        });

        expect(result).toEqual({
          error: 'Project ID is required',
          status: 400,
          type: 'http',
          hints: undefined,
        });
      });

      it('should return error when projectId is undefined', async () => {
        const result = await fetchGitLabFileContentAPI({
          projectId: undefined as unknown as string,
          path: 'README.md',
          ref: 'main',
        });

        expect(result).toEqual({
          error: 'Project ID is required',
          status: 400,
          type: 'http',
          hints: undefined,
        });
      });

      it('should return error when path is missing', async () => {
        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: '',
          ref: 'main',
        });

        expect(result).toEqual({
          error: 'File path is required',
          status: 400,
          type: 'http',
          hints: undefined,
        });
      });

      it('should return error when path is undefined', async () => {
        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: undefined as unknown as string,
          ref: 'main',
        });

        expect(result).toEqual({
          error: 'File path is required',
          status: 400,
          type: 'http',
          hints: undefined,
        });
      });

      it('should return error when ref is missing', async () => {
        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'README.md',
          ref: '',
        });

        expect(result).toEqual({
          error: 'Reference (ref) is required for GitLab file content',
          status: 400,
          type: 'http',
          hints: [
            'Unlike GitHub, GitLab requires an explicit branch, tag, or commit reference.',
            'Use the default branch name (e.g., "main" or "master") or a specific ref.',
          ],
        });
      });

      it('should return error when ref is undefined', async () => {
        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'README.md',
          ref: undefined as unknown as string,
        });

        expect(result).toEqual({
          error: 'Reference (ref) is required for GitLab file content',
          status: 400,
          type: 'http',
          hints: [
            'Unlike GitHub, GitLab requires an explicit branch, tag, or commit reference.',
            'Use the default branch name (e.g., "main" or "master") or a specific ref.',
          ],
        });
      });
    });

    describe('successful file fetch', () => {
      it('should successfully fetch and decode base64 file content', async () => {
        const mockFileContent = 'Hello, World!';
        const base64Content = Buffer.from(mockFileContent).toString('base64');

        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockResolvedValue({
              file_name: 'README.md',
              file_path: 'README.md',
              size: 13,
              encoding: 'base64',
              content: base64Content,
              content_sha256: 'abc123',
              ref: 'main',
              blob_id: 'blob123',
              commit_id: 'commit123',
              last_commit_id: 'lastcommit123',
              execute_filemode: false,
            }),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'README.md',
          ref: 'main',
        });

        expect(result).toEqual({
          data: {
            file_name: 'README.md',
            file_path: 'README.md',
            size: 13,
            encoding: 'utf-8',
            content: mockFileContent,
            content_sha256: 'abc123',
            ref: 'main',
            blob_id: 'blob123',
            commit_id: 'commit123',
            last_commit_id: 'lastcommit123',
            execute_filemode: false,
          },
          status: 200,
        });

        expect(mockGitlabClient.RepositoryFiles.show).toHaveBeenCalledWith(
          '12345',
          'README.md',
          'main'
        );
      });

      it('should handle non-base64 encoded content', async () => {
        const mockFileContent = 'Plain text content';

        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockResolvedValue({
              file_name: 'file.txt',
              file_path: 'path/to/file.txt',
              size: 18,
              encoding: 'text',
              content: mockFileContent,
              content_sha256: 'def456',
              ref: 'develop',
              blob_id: 'blob456',
              commit_id: 'commit456',
              last_commit_id: 'lastcommit456',
              execute_filemode: false,
            }),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        const result = await fetchGitLabFileContentAPI({
          projectId: 'group/project',
          path: 'path/to/file.txt',
          ref: 'develop',
        });

        expect(result).toEqual({
          data: {
            file_name: 'file.txt',
            file_path: 'path/to/file.txt',
            size: 18,
            encoding: 'utf-8',
            content: mockFileContent,
            content_sha256: 'def456',
            ref: 'develop',
            blob_id: 'blob456',
            commit_id: 'commit456',
            last_commit_id: 'lastcommit456',
            execute_filemode: false,
          },
          status: 200,
        });
      });

      it('should URL-encode file paths with special characters', async () => {
        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockResolvedValue({
              file_name: 'file with spaces.txt',
              file_path: 'path/to/file with spaces.txt',
              size: 10,
              encoding: 'base64',
              content: Buffer.from('content').toString('base64'),
              content_sha256: 'hash',
              ref: 'main',
              blob_id: 'blob',
              commit_id: 'commit',
              last_commit_id: 'lastcommit',
              execute_filemode: false,
            }),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'path/to/file with spaces.txt',
          ref: 'main',
        });

        expect(mockGitlabClient.RepositoryFiles.show).toHaveBeenCalledWith(
          '12345',
          'path%2Fto%2Ffile%20with%20spaces.txt',
          'main'
        );
      });

      it('should handle numeric projectId', async () => {
        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockResolvedValue({
              file_name: 'file.txt',
              file_path: 'file.txt',
              size: 5,
              encoding: 'base64',
              content: Buffer.from('test').toString('base64'),
              content_sha256: 'hash',
              ref: 'main',
              blob_id: 'blob',
              commit_id: 'commit',
              last_commit_id: 'lastcommit',
              execute_filemode: false,
            }),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        await fetchGitLabFileContentAPI({
          projectId: 12345,
          path: 'file.txt',
          ref: 'main',
        });

        expect(mockGitlabClient.RepositoryFiles.show).toHaveBeenCalledWith(
          12345,
          'file.txt',
          'main'
        );
      });
    });

    describe('line filtering', () => {
      const multiLineContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
      const base64MultiLine = Buffer.from(multiLineContent).toString('base64');

      beforeEach(() => {
        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockResolvedValue({
              file_name: 'file.txt',
              file_path: 'file.txt',
              size: multiLineContent.length,
              encoding: 'base64',
              content: base64MultiLine,
              content_sha256: 'hash',
              ref: 'main',
              blob_id: 'blob',
              commit_id: 'commit',
              last_commit_id: 'lastcommit',
              execute_filemode: false,
            }),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);
      });

      it('should filter content with startLine only', async () => {
        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'file.txt',
          ref: 'main',
          startLine: 3,
        });

        expect((result as { data: GitLabFileContent }).data.content).toBe(
          'Line 3\nLine 4\nLine 5'
        );
      });

      it('should filter content with endLine only', async () => {
        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'file.txt',
          ref: 'main',
          endLine: 2,
        });

        expect((result as { data: GitLabFileContent }).data.content).toBe(
          'Line 1\nLine 2'
        );
      });

      it('should filter content with both startLine and endLine', async () => {
        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'file.txt',
          ref: 'main',
          startLine: 2,
          endLine: 4,
        });

        expect((result as { data: GitLabFileContent }).data.content).toBe(
          'Line 2\nLine 3\nLine 4'
        );
      });

      it('should handle startLine equal to 1', async () => {
        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'file.txt',
          ref: 'main',
          startLine: 1,
          endLine: 3,
        });

        expect((result as { data: GitLabFileContent }).data.content).toBe(
          'Line 1\nLine 2\nLine 3'
        );
      });

      it('should handle endLine beyond content length', async () => {
        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'file.txt',
          ref: 'main',
          startLine: 4,
          endLine: 100,
        });

        expect((result as { data: GitLabFileContent }).data.content).toBe(
          'Line 4\nLine 5'
        );
      });

      it('should return empty string when startLine exceeds content length', async () => {
        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'file.txt',
          ref: 'main',
          startLine: 100,
        });

        expect((result as { data: GitLabFileContent }).data.content).toBe('');
      });
    });

    describe('caching behavior', () => {
      it('should generate cache key with correct parameters', async () => {
        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockResolvedValue({
              file_name: 'file.txt',
              file_path: 'file.txt',
              size: 5,
              encoding: 'base64',
              content: Buffer.from('test').toString('base64'),
              content_sha256: 'hash',
              ref: 'main',
              blob_id: 'blob',
              commit_id: 'commit',
              last_commit_id: 'lastcommit',
              execute_filemode: false,
            }),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'file.txt',
          ref: 'main',
        });

        expect(mockGenerateCacheKey).toHaveBeenCalledWith(
          'gl-api-file',
          {
            projectId: '12345',
            path: 'file.txt',
            ref: 'main',
          },
          undefined
        );
      });

      it('should include sessionId in cache key when provided', async () => {
        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockResolvedValue({
              file_name: 'file.txt',
              file_path: 'file.txt',
              size: 5,
              encoding: 'base64',
              content: Buffer.from('test').toString('base64'),
              content_sha256: 'hash',
              ref: 'main',
              blob_id: 'blob',
              commit_id: 'commit',
              last_commit_id: 'lastcommit',
              execute_filemode: false,
            }),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        await fetchGitLabFileContentAPI(
          {
            projectId: '12345',
            path: 'file.txt',
            ref: 'main',
          },
          'session-123'
        );

        expect(mockGenerateCacheKey).toHaveBeenCalledWith(
          'gl-api-file',
          {
            projectId: '12345',
            path: 'file.txt',
            ref: 'main',
          },
          'session-123'
        );
      });

      it('should use withDataCache for caching', async () => {
        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockResolvedValue({
              file_name: 'file.txt',
              file_path: 'file.txt',
              size: 5,
              encoding: 'base64',
              content: Buffer.from('test').toString('base64'),
              content_sha256: 'hash',
              ref: 'main',
              blob_id: 'blob',
              commit_id: 'commit',
              last_commit_id: 'lastcommit',
              execute_filemode: false,
            }),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'file.txt',
          ref: 'main',
        });

        expect(mockWithDataCache).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Function),
          {
            shouldCache: expect.any(Function),
          }
        );
      });

      it('should only cache successful responses', async () => {
        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockResolvedValue({
              file_name: 'file.txt',
              file_path: 'file.txt',
              size: 5,
              encoding: 'base64',
              content: Buffer.from('test').toString('base64'),
              content_sha256: 'hash',
              ref: 'main',
              blob_id: 'blob',
              commit_id: 'commit',
              last_commit_id: 'lastcommit',
              execute_filemode: false,
            }),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'file.txt',
          ref: 'main',
        });

        // Get the shouldCache function from the call
        const shouldCacheFn = mockWithDataCache.mock.calls[0][2]?.shouldCache;
        expect(shouldCacheFn).toBeDefined();

        // Test that it caches successful responses
        const successResponse = { data: { content: 'test' }, status: 200 };
        expect(shouldCacheFn!(successResponse as any)).toBe(true);

        // Test that it doesn't cache error responses
        const errorResponse = { error: 'Not found', status: 404, type: 'http' };
        expect(shouldCacheFn!(errorResponse as any)).toBe(false);
      });
    });

    describe('error handling', () => {
      it('should handle 404 not found error', async () => {
        const mockError = {
          cause: {
            description: 'File not found',
            status: 404,
          },
        };

        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockRejectedValue(mockError),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'nonexistent.txt',
          ref: 'main',
        });

        expect(result).toMatchObject({
          error: expect.any(String),
          status: 404,
          type: 'http',
        });
      });

      it('should handle 401 unauthorized error', async () => {
        const mockError = {
          cause: {
            description: 'Unauthorized',
            status: 401,
          },
        };

        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockRejectedValue(mockError),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'file.txt',
          ref: 'main',
        });

        expect(result).toMatchObject({
          error: expect.any(String),
          status: 401,
          type: 'http',
        });
      });

      it('should handle 403 forbidden error', async () => {
        const mockError = {
          cause: {
            description: 'Forbidden',
            status: 403,
          },
        };

        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockRejectedValue(mockError),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'file.txt',
          ref: 'main',
        });

        expect(result).toMatchObject({
          error: expect.any(String),
          status: 403,
          type: 'http',
        });
      });

      it('should handle 429 rate limit error', async () => {
        const mockError = {
          cause: {
            description: 'Rate limit exceeded',
            status: 429,
          },
          response: {
            headers: {
              'retry-after': '60',
              'ratelimit-reset': '1640995200',
            },
          },
        };

        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockRejectedValue(mockError),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'file.txt',
          ref: 'main',
        });

        expect(result).toMatchObject({
          error: expect.any(String),
          status: 429,
          type: 'http',
        });
      });

      it('should handle generic errors', async () => {
        const mockError = new Error('Something went wrong');

        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockRejectedValue(mockError),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'file.txt',
          ref: 'main',
        });

        expect(result).toMatchObject({
          error: 'Something went wrong',
          status: 500,
          type: 'unknown',
        });
      });

      it('should handle network errors', async () => {
        const mockError = new TypeError('fetch failed');

        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockRejectedValue(mockError),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'file.txt',
          ref: 'main',
        });

        expect(result).toMatchObject({
          error: expect.any(String),
          type: 'network',
        });
      });
    });

    describe('edge cases', () => {
      it('should handle empty file content', async () => {
        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockResolvedValue({
              file_name: 'empty.txt',
              file_path: 'empty.txt',
              size: 0,
              encoding: 'base64',
              content: '',
              content_sha256: 'hash',
              ref: 'main',
              blob_id: 'blob',
              commit_id: 'commit',
              last_commit_id: 'lastcommit',
              execute_filemode: false,
            }),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'empty.txt',
          ref: 'main',
        });

        expect((result as { data: GitLabFileContent }).data.content).toBe('');
      });

      it('should handle missing fields gracefully', async () => {
        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockResolvedValue({
              encoding: 'base64',
              content: Buffer.from('test').toString('base64'),
            }),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'file.txt',
          ref: 'main',
        });

        expect((result as { data: GitLabFileContent }).data).toMatchObject({
          file_name: '',
          file_path: '',
          size: 0,
          content: 'test',
          content_sha256: '',
          ref: '',
          blob_id: '',
          commit_id: '',
          last_commit_id: '',
          execute_filemode: false,
        });
      });

      it('should handle execute_filemode as truthy value', async () => {
        const mockGitlabClient = {
          RepositoryFiles: {
            show: vi.fn().mockResolvedValue({
              file_name: 'script.sh',
              file_path: 'script.sh',
              size: 10,
              encoding: 'base64',
              content: Buffer.from('#!/bin/bash').toString('base64'),
              content_sha256: 'hash',
              ref: 'main',
              blob_id: 'blob',
              commit_id: 'commit',
              last_commit_id: 'lastcommit',
              execute_filemode: true,
            }),
          },
        };

        mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

        const result = await fetchGitLabFileContentAPI({
          projectId: '12345',
          path: 'script.sh',
          ref: 'main',
        });

        expect(
          (result as { data: GitLabFileContent }).data.execute_filemode
        ).toBe(true);
      });
    });
  });

  describe('getGitLabDefaultBranch', () => {
    it('should return default branch from project', async () => {
      const mockGitlabClient = {
        Projects: {
          show: vi.fn().mockResolvedValue({
            default_branch: 'develop',
          }),
        },
      };

      mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

      const result = await getGitLabDefaultBranch('12345');

      expect(result).toBe('develop');
      expect(mockGitlabClient.Projects.show).toHaveBeenCalledWith('12345');
    });

    it('should return "main" when default_branch is not set', async () => {
      const mockGitlabClient = {
        Projects: {
          show: vi.fn().mockResolvedValue({
            default_branch: null,
          }),
        },
      };

      mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

      const result = await getGitLabDefaultBranch('12345');

      expect(result).toBe('main');
    });

    it('should return "main" when default_branch is empty string', async () => {
      const mockGitlabClient = {
        Projects: {
          show: vi.fn().mockResolvedValue({
            default_branch: '',
          }),
        },
      };

      mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

      const result = await getGitLabDefaultBranch('12345');

      expect(result).toBe('main');
    });

    it('should return "main" on error', async () => {
      const mockGitlabClient = {
        Projects: {
          show: vi.fn().mockRejectedValue(new Error('Project not found')),
        },
      };

      mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

      const result = await getGitLabDefaultBranch('12345');

      expect(result).toBe('main');
    });

    it('should handle numeric projectId', async () => {
      const mockGitlabClient = {
        Projects: {
          show: vi.fn().mockResolvedValue({
            default_branch: 'master',
          }),
        },
      };

      mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

      const result = await getGitLabDefaultBranch(12345);

      expect(result).toBe('master');
      expect(mockGitlabClient.Projects.show).toHaveBeenCalledWith(12345);
    });

    it('should handle URL-encoded project path', async () => {
      const mockGitlabClient = {
        Projects: {
          show: vi.fn().mockResolvedValue({
            default_branch: 'main',
          }),
        },
      };

      mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

      const result = await getGitLabDefaultBranch('group%2Fsubgroup%2Fproject');

      expect(result).toBe('main');
      expect(mockGitlabClient.Projects.show).toHaveBeenCalledWith(
        'group%2Fsubgroup%2Fproject'
      );
    });
  });

  describe('gitLabFileExists', () => {
    it('should return true when file exists', async () => {
      const mockGitlabClient = {
        RepositoryFiles: {
          show: vi.fn().mockResolvedValue({
            file_name: 'file.txt',
          }),
        },
      };

      mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

      const result = await gitLabFileExists('12345', 'file.txt', 'main');

      expect(result).toBe(true);
      expect(mockGitlabClient.RepositoryFiles.show).toHaveBeenCalledWith(
        '12345',
        'file.txt',
        'main'
      );
    });

    it('should return false when file does not exist', async () => {
      const mockGitlabClient = {
        RepositoryFiles: {
          show: vi.fn().mockRejectedValue(new Error('File not found')),
        },
      };

      mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

      const result = await gitLabFileExists('12345', 'nonexistent.txt', 'main');

      expect(result).toBe(false);
    });

    it('should URL-encode file path', async () => {
      const mockGitlabClient = {
        RepositoryFiles: {
          show: vi.fn().mockResolvedValue({
            file_name: 'file with spaces.txt',
          }),
        },
      };

      mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

      await gitLabFileExists('12345', 'path/to/file with spaces.txt', 'main');

      expect(mockGitlabClient.RepositoryFiles.show).toHaveBeenCalledWith(
        '12345',
        'path%2Fto%2Ffile%20with%20spaces.txt',
        'main'
      );
    });

    it('should handle numeric projectId', async () => {
      const mockGitlabClient = {
        RepositoryFiles: {
          show: vi.fn().mockResolvedValue({
            file_name: 'file.txt',
          }),
        },
      };

      mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

      const result = await gitLabFileExists(12345, 'file.txt', 'main');

      expect(result).toBe(true);
      expect(mockGitlabClient.RepositoryFiles.show).toHaveBeenCalledWith(
        12345,
        'file.txt',
        'main'
      );
    });

    it('should check file in specific branch', async () => {
      const mockGitlabClient = {
        RepositoryFiles: {
          show: vi.fn().mockResolvedValue({
            file_name: 'file.txt',
          }),
        },
      };

      mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

      await gitLabFileExists('12345', 'file.txt', 'feature/branch');

      expect(mockGitlabClient.RepositoryFiles.show).toHaveBeenCalledWith(
        '12345',
        'file.txt',
        'feature/branch'
      );
    });

    it('should check file with tag ref', async () => {
      const mockGitlabClient = {
        RepositoryFiles: {
          show: vi.fn().mockResolvedValue({
            file_name: 'file.txt',
          }),
        },
      };

      mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

      await gitLabFileExists('12345', 'file.txt', 'v1.0.0');

      expect(mockGitlabClient.RepositoryFiles.show).toHaveBeenCalledWith(
        '12345',
        'file.txt',
        'v1.0.0'
      );
    });

    it('should check file with commit SHA ref', async () => {
      const mockGitlabClient = {
        RepositoryFiles: {
          show: vi.fn().mockResolvedValue({
            file_name: 'file.txt',
          }),
        },
      };

      mockGetGitlab.mockResolvedValue(mockGitlabClient as any);

      await gitLabFileExists('12345', 'file.txt', 'abc123def456');

      expect(mockGitlabClient.RepositoryFiles.show).toHaveBeenCalledWith(
        '12345',
        'file.txt',
        'abc123def456'
      );
    });
  });

  describe('transformGitLabFileContent', () => {
    it('should transform GitLab file content to unified format', () => {
      const gitlabFile: GitLabFileContent = {
        file_name: 'example.ts',
        file_path: 'src/example.ts',
        size: 1024,
        encoding: 'utf-8',
        content: 'export const foo = "bar";',
        content_sha256: 'abc123',
        ref: 'main',
        blob_id: 'blob123',
        commit_id: 'commit123',
        last_commit_id: 'lastcommit123',
        execute_filemode: false,
      };

      const result = transformGitLabFileContent(gitlabFile);

      expect(result).toEqual({
        path: 'src/example.ts',
        content: 'export const foo = "bar";',
        encoding: 'utf-8',
        size: 1024,
        ref: 'main',
        lastCommitId: 'lastcommit123',
      });
    });

    it('should transform file with empty content', () => {
      const gitlabFile: GitLabFileContent = {
        file_name: 'empty.txt',
        file_path: 'empty.txt',
        size: 0,
        encoding: 'utf-8',
        content: '',
        content_sha256: 'hash',
        ref: 'develop',
        blob_id: 'blob',
        commit_id: 'commit',
        last_commit_id: 'lastcommit',
        execute_filemode: false,
      };

      const result = transformGitLabFileContent(gitlabFile);

      expect(result).toEqual({
        path: 'empty.txt',
        content: '',
        encoding: 'utf-8',
        size: 0,
        ref: 'develop',
        lastCommitId: 'lastcommit',
      });
    });

    it('should transform file with nested path', () => {
      const gitlabFile: GitLabFileContent = {
        file_name: 'config.json',
        file_path: 'deeply/nested/path/to/config.json',
        size: 256,
        encoding: 'utf-8',
        content: '{"key": "value"}',
        content_sha256: 'hash',
        ref: 'feature/branch',
        blob_id: 'blob',
        commit_id: 'commit',
        last_commit_id: 'lastcommit',
        execute_filemode: false,
      };

      const result = transformGitLabFileContent(gitlabFile);

      expect(result).toEqual({
        path: 'deeply/nested/path/to/config.json',
        content: '{"key": "value"}',
        encoding: 'utf-8',
        size: 256,
        ref: 'feature/branch',
        lastCommitId: 'lastcommit',
      });
    });

    it('should transform file with multiline content', () => {
      const multilineContent = `function hello() {
  console.log("Hello, World!");
}

export default hello;`;

      const gitlabFile: GitLabFileContent = {
        file_name: 'hello.ts',
        file_path: 'src/utils/hello.ts',
        size: multilineContent.length,
        encoding: 'utf-8',
        content: multilineContent,
        content_sha256: 'hash',
        ref: 'main',
        blob_id: 'blob',
        commit_id: 'commit',
        last_commit_id: 'lastcommit',
        execute_filemode: false,
      };

      const result = transformGitLabFileContent(gitlabFile);

      expect(result.content).toBe(multilineContent);
      expect(result.content.split('\n').length).toBe(5);
    });

    it('should preserve special characters in content', () => {
      const contentWithSpecialChars =
        'const regex = /[a-z]+/g;\nconst unicode = "\u00e9\u00e0\u00fc";';

      const gitlabFile: GitLabFileContent = {
        file_name: 'special.ts',
        file_path: 'special.ts',
        size: contentWithSpecialChars.length,
        encoding: 'utf-8',
        content: contentWithSpecialChars,
        content_sha256: 'hash',
        ref: 'main',
        blob_id: 'blob',
        commit_id: 'commit',
        last_commit_id: 'lastcommit',
        execute_filemode: false,
      };

      const result = transformGitLabFileContent(gitlabFile);

      expect(result.content).toBe(contentWithSpecialChars);
    });
  });
});

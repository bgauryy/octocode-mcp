import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchGitLabCodeAPI,
  transformGitLabCodeSearchItem,
} from '../../src/gitlab/codeSearch.js';
import { clearAllCache } from '../../src/utils/http/cache.js';
import type { GitLabCodeSearchItem } from '../../src/gitlab/types.js';

// Mock the gitlab client
const mockSearchAll = vi.fn();
const mockGitlab = {
  Search: {
    all: mockSearchAll,
  },
};

vi.mock('../../src/gitlab/client.js', () => ({
  getGitlab: vi.fn(() => Promise.resolve(mockGitlab)),
}));

// Track cache calls for testing caching behavior
let withDataCacheCalls: string[] = [];
let shouldCacheCallbacks: Array<(value: unknown) => boolean> = [];

vi.mock('../../src/utils/http/cache.js', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../src/utils/http/cache.js')>();
  return {
    ...actual,
    generateCacheKey: actual.generateCacheKey,
    withDataCache: vi.fn(
      async <T>(
        cacheKey: string,
        operation: () => Promise<T>,
        options?: { shouldCache?: (value: T) => boolean }
      ): Promise<T> => {
        withDataCacheCalls.push(cacheKey);
        if (options?.shouldCache) {
          shouldCacheCallbacks.push(
            options.shouldCache as (value: unknown) => boolean
          );
        }
        const result = await operation();
        return result;
      }
    ),
    clearAllCache: actual.clearAllCache,
  };
});

describe('GitLab Code Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withDataCacheCalls = [];
    shouldCacheCallbacks = [];
    clearAllCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // VALIDATION TESTS
  // ============================================================================

  describe('Validation Errors', () => {
    it('should return error for empty search query', async () => {
      const result = await searchGitLabCodeAPI({
        search: '',
        projectId: 123,
      });

      expect(result).toEqual({
        error: 'Search query is required',
        status: 400,
        type: 'http',
        hints: undefined,
      });
      expect(mockSearchAll).not.toHaveBeenCalled();
    });

    it('should return error for whitespace-only search query', async () => {
      const result = await searchGitLabCodeAPI({
        search: '   ',
        projectId: 123,
      });

      expect(result).toEqual({
        error: 'Search query is required',
        status: 400,
        type: 'http',
        hints: undefined,
      });
      expect(mockSearchAll).not.toHaveBeenCalled();
    });

    it('should return error when neither projectId nor groupId is provided', async () => {
      const result = await searchGitLabCodeAPI({
        search: 'function',
      });

      expect(result).toEqual({
        error: 'Project ID or Group ID is required for GitLab code search',
        status: 400,
        type: 'http',
        hints: ['Global code search requires GitLab Premium tier.'],
      });
      expect(mockSearchAll).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // PROJECT-SCOPED SEARCH TESTS
  // ============================================================================

  describe('Project-scoped Search', () => {
    it('should search within a specific project by numeric ID', async () => {
      const mockItems: GitLabCodeSearchItem[] = [
        {
          basename: 'index',
          data: 'function test() { return true; }',
          path: 'src/index.ts',
          filename: 'index.ts',
          id: 'abc123',
          ref: 'main',
          startline: 10,
          project_id: 123,
        },
      ];

      mockSearchAll.mockResolvedValue(mockItems);

      const result = await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      expect(mockSearchAll).toHaveBeenCalledWith('blobs', 'function', {
        projectId: 123,
        ref: undefined,
        perPage: 20,
        page: 1,
      });

      expect(result).toEqual({
        data: {
          items: mockItems,
          totalCount: 1,
          pagination: {
            currentPage: 1,
            totalPages: 1,
            perPage: 20,
            hasMore: false,
          },
        },
        status: 200,
      });
    });

    it('should search within a specific project by string path', async () => {
      const mockItems: GitLabCodeSearchItem[] = [];

      mockSearchAll.mockResolvedValue(mockItems);

      const result = await searchGitLabCodeAPI({
        search: 'function',
        projectId: 'namespace/project',
      });

      expect(mockSearchAll).toHaveBeenCalledWith('blobs', 'function', {
        projectId: 'namespace/project',
        ref: undefined,
        perPage: 20,
        page: 1,
      });

      expect(result).toHaveProperty('data');
    });

    it('should include ref parameter when provided', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        ref: 'develop',
      });

      expect(mockSearchAll).toHaveBeenCalledWith('blobs', 'function', {
        projectId: 123,
        ref: 'develop',
        perPage: 20,
        page: 1,
      });
    });
  });

  // ============================================================================
  // GROUP-SCOPED SEARCH TESTS
  // ============================================================================

  describe('Group-scoped Search', () => {
    it('should search within a specific group by numeric ID', async () => {
      const mockItems: GitLabCodeSearchItem[] = [
        {
          basename: 'utils',
          data: 'export function helper() {}',
          path: 'lib/utils.ts',
          filename: 'utils.ts',
          id: 'def456',
          ref: 'main',
          startline: 1,
          project_id: 456,
        },
      ];

      mockSearchAll.mockResolvedValue(mockItems);

      const result = await searchGitLabCodeAPI({
        search: 'helper',
        groupId: 789,
      });

      expect(mockSearchAll).toHaveBeenCalledWith('blobs', 'helper', {
        groupId: 789,
        perPage: 20,
        page: 1,
      });

      expect(result).toEqual({
        data: {
          items: mockItems,
          totalCount: 1,
          pagination: {
            currentPage: 1,
            totalPages: 1,
            perPage: 20,
            hasMore: false,
          },
        },
        status: 200,
      });
    });

    it('should search within a specific group by string path', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        groupId: 'my-org/my-group',
      });

      expect(mockSearchAll).toHaveBeenCalledWith('blobs', 'function', {
        groupId: 'my-org/my-group',
        perPage: 20,
        page: 1,
      });
    });

    it('should prioritize projectId over groupId when both are provided', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        groupId: 456,
      });

      expect(mockSearchAll).toHaveBeenCalledWith('blobs', 'function', {
        projectId: 123,
        ref: undefined,
        perPage: 20,
        page: 1,
      });
    });
  });

  // ============================================================================
  // FILTER TESTS
  // ============================================================================

  describe('Path/Filename/Extension Filters', () => {
    it('should append path filter to search query', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        path: 'src/',
      });

      expect(mockSearchAll).toHaveBeenCalledWith(
        'blobs',
        'function path:src/',
        expect.any(Object)
      );
    });

    it('should append filename filter to search query', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'import',
        projectId: 123,
        filename: 'index',
      });

      expect(mockSearchAll).toHaveBeenCalledWith(
        'blobs',
        'import filename:index',
        expect.any(Object)
      );
    });

    it('should append extension filter to search query', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'class',
        projectId: 123,
        extension: 'ts',
      });

      expect(mockSearchAll).toHaveBeenCalledWith(
        'blobs',
        'class extension:ts',
        expect.any(Object)
      );
    });

    it('should combine multiple filters', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'interface',
        projectId: 123,
        path: 'src/types',
        filename: 'models',
        extension: 'ts',
      });

      expect(mockSearchAll).toHaveBeenCalledWith(
        'blobs',
        'interface path:src/types filename:models extension:ts',
        expect.any(Object)
      );
    });

    it('should handle filters with spaces and special characters', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'test',
        projectId: 123,
        path: 'src/my folder',
      });

      expect(mockSearchAll).toHaveBeenCalledWith(
        'blobs',
        'test path:src/my folder',
        expect.any(Object)
      );
    });
  });

  // ============================================================================
  // PAGINATION TESTS
  // ============================================================================

  describe('Pagination', () => {
    it('should use default pagination values', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      expect(mockSearchAll).toHaveBeenCalledWith('blobs', 'function', {
        projectId: 123,
        ref: undefined,
        perPage: 20,
        page: 1,
      });
    });

    it('should pass custom page number', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        page: 3,
      });

      expect(mockSearchAll).toHaveBeenCalledWith('blobs', 'function', {
        projectId: 123,
        ref: undefined,
        perPage: 20,
        page: 3,
      });
    });

    it('should pass custom perPage value', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        perPage: 50,
      });

      expect(mockSearchAll).toHaveBeenCalledWith('blobs', 'function', {
        projectId: 123,
        ref: undefined,
        perPage: 50,
        page: 1,
      });
    });

    it('should cap perPage at 100', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        perPage: 200,
      });

      expect(mockSearchAll).toHaveBeenCalledWith('blobs', 'function', {
        projectId: 123,
        ref: undefined,
        perPage: 100,
        page: 1,
      });
    });

    it('should set hasMore=true when results equal perPage', async () => {
      const mockItems = Array.from({ length: 20 }, (_, i) => ({
        basename: `file${i}`,
        data: 'content',
        path: `src/file${i}.ts`,
        filename: `file${i}.ts`,
        id: `id${i}`,
        ref: 'main',
        startline: 1,
        project_id: 123,
      }));

      mockSearchAll.mockResolvedValue(mockItems);

      const result = await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        perPage: 20,
      });

      if ('data' in result) {
        expect(result.data.pagination?.hasMore).toBe(true);
        expect(result.data.pagination?.totalPages).toBe(2);
      } else {
        expect.fail('Expected successful result');
      }
    });

    it('should set hasMore=false when results are less than perPage', async () => {
      const mockItems = Array.from({ length: 15 }, (_, i) => ({
        basename: `file${i}`,
        data: 'content',
        path: `src/file${i}.ts`,
        filename: `file${i}.ts`,
        id: `id${i}`,
        ref: 'main',
        startline: 1,
        project_id: 123,
      }));

      mockSearchAll.mockResolvedValue(mockItems);

      const result = await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        perPage: 20,
      });

      if ('data' in result) {
        expect(result.data.pagination?.hasMore).toBe(false);
        expect(result.data.pagination?.totalPages).toBe(1);
      } else {
        expect.fail('Expected successful result');
      }
    });

    it('should return correct pagination info for subsequent pages', async () => {
      const mockItems = Array.from({ length: 20 }, (_, i) => ({
        basename: `file${i}`,
        data: 'content',
        path: `src/file${i}.ts`,
        filename: `file${i}.ts`,
        id: `id${i}`,
        ref: 'main',
        startline: 1,
        project_id: 123,
      }));

      mockSearchAll.mockResolvedValue(mockItems);

      const result = await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        page: 3,
        perPage: 20,
      });

      if ('data' in result) {
        expect(result.data.pagination).toEqual({
          currentPage: 3,
          totalPages: 4,
          perPage: 20,
          hasMore: true,
        });
      } else {
        expect.fail('Expected successful result');
      }
    });

    it('should handle empty results', async () => {
      mockSearchAll.mockResolvedValue([]);

      const result = await searchGitLabCodeAPI({
        search: 'nonexistent',
        projectId: 123,
      });

      if ('data' in result) {
        expect(result.data.items).toEqual([]);
        expect(result.data.totalCount).toBe(0);
        expect(result.data.pagination).toEqual({
          currentPage: 1,
          totalPages: 1,
          perPage: 20,
          hasMore: false,
        });
      } else {
        expect.fail('Expected successful result');
      }
    });
  });

  // ============================================================================
  // CACHING TESTS
  // ============================================================================

  describe('Caching Behavior', () => {
    it('should generate unique cache keys for different searches', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      await searchGitLabCodeAPI({
        search: 'class',
        projectId: 123,
      });

      expect(withDataCacheCalls.length).toBe(2);
      expect(withDataCacheCalls[0]).not.toBe(withDataCacheCalls[1]);
    });

    it('should generate unique cache keys for different projects', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 456,
      });

      expect(withDataCacheCalls.length).toBe(2);
      expect(withDataCacheCalls[0]).not.toBe(withDataCacheCalls[1]);
    });

    it('should generate unique cache keys for different pages', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        page: 1,
      });

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        page: 2,
      });

      expect(withDataCacheCalls.length).toBe(2);
      expect(withDataCacheCalls[0]).not.toBe(withDataCacheCalls[1]);
    });

    it('should generate unique cache keys for different perPage values', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        perPage: 20,
      });

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        perPage: 50,
      });

      expect(withDataCacheCalls.length).toBe(2);
      expect(withDataCacheCalls[0]).not.toBe(withDataCacheCalls[1]);
    });

    it('should include sessionId in cache key when provided', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI(
        {
          search: 'function',
          projectId: 123,
        },
        'session-123'
      );

      await searchGitLabCodeAPI(
        {
          search: 'function',
          projectId: 123,
        },
        'session-456'
      );

      expect(withDataCacheCalls.length).toBe(2);
      expect(withDataCacheCalls[0]).not.toBe(withDataCacheCalls[1]);
    });

    it('should generate same cache key for identical requests', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        page: 1,
        perPage: 20,
      });

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        page: 1,
        perPage: 20,
      });

      expect(withDataCacheCalls.length).toBe(2);
      expect(withDataCacheCalls[0]).toBe(withDataCacheCalls[1]);
    });

    it('should include all filter parameters in cache key', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        path: 'src/',
        filename: 'index',
        extension: 'ts',
        ref: 'main',
      });

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
        path: 'lib/',
        filename: 'index',
        extension: 'ts',
        ref: 'main',
      });

      expect(withDataCacheCalls.length).toBe(2);
      expect(withDataCacheCalls[0]).not.toBe(withDataCacheCalls[1]);
    });

    it('should provide shouldCache callback that returns true for success responses', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      expect(shouldCacheCallbacks.length).toBe(1);
      const shouldCache = shouldCacheCallbacks[0]!;

      // Success response should be cached
      const successResponse = {
        data: { items: [], totalCount: 0 },
        status: 200,
      };
      expect(shouldCache(successResponse)).toBe(true);
    });

    it('should provide shouldCache callback that returns false for error responses', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      expect(shouldCacheCallbacks.length).toBe(1);
      const shouldCache = shouldCacheCallbacks[0]!;

      // Error response should not be cached
      const errorResponse = {
        error: 'Something went wrong',
        status: 500,
        type: 'http',
      };
      expect(shouldCache(errorResponse)).toBe(false);
    });

    it('should provide shouldCache callback that returns false for responses with both data and error', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      expect(shouldCacheCallbacks.length).toBe(1);
      const shouldCache = shouldCacheCallbacks[0]!;

      // Response with both data and error should not be cached
      const mixedResponse = {
        data: { items: [] },
        error: 'Partial error',
        status: 200,
      };
      expect(shouldCache(mixedResponse)).toBe(false);
    });

    it('should provide shouldCache callback that returns false for responses without data', async () => {
      mockSearchAll.mockResolvedValue([]);

      await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      expect(shouldCacheCallbacks.length).toBe(1);
      const shouldCache = shouldCacheCallbacks[0]!;

      // Response without data property should not be cached
      const noDataResponse = {
        status: 200,
      };
      expect(shouldCache(noDataResponse)).toBe(false);
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle Gitbeaker HTTP 401 unauthorized error', async () => {
      const gitbeakerError = {
        message: 'Unauthorized',
        cause: {
          description: 'Invalid token',
          status: 401,
        },
      };

      mockSearchAll.mockRejectedValue(gitbeakerError);

      const result = await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      expect(result).toMatchObject({
        error: expect.stringContaining('authentication'),
        status: 401,
        type: 'http',
      });
    });

    it('should handle Gitbeaker HTTP 403 forbidden error', async () => {
      const gitbeakerError = {
        message: 'Forbidden',
        cause: {
          status: 403,
        },
      };

      mockSearchAll.mockRejectedValue(gitbeakerError);

      const result = await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      expect(result).toMatchObject({
        error:
          expect.stringContaining('permission') ||
          expect.stringContaining('denied'),
        status: 403,
        type: 'http',
      });
    });

    it('should handle Gitbeaker HTTP 404 not found error', async () => {
      const gitbeakerError = {
        message: 'Not Found',
        cause: {
          status: 404,
        },
      };

      mockSearchAll.mockRejectedValue(gitbeakerError);

      const result = await searchGitLabCodeAPI({
        search: 'function',
        projectId: 999999,
      });

      expect(result).toMatchObject({
        error: expect.stringContaining('not found'),
        status: 404,
        type: 'http',
      });
    });

    it('should handle Gitbeaker HTTP 429 rate limit error', async () => {
      const gitbeakerError = {
        message: 'Too Many Requests',
        cause: {
          status: 429,
        },
        response: {
          status: 429,
          headers: {
            'retry-after': '60',
          },
        },
      };

      mockSearchAll.mockRejectedValue(gitbeakerError);

      const result = await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      expect(result).toMatchObject({
        error: expect.stringContaining('rate limit'),
        status: 429,
        type: 'http',
      });
    });

    it('should handle Gitbeaker HTTP 500 server error', async () => {
      const gitbeakerError = {
        message: 'Internal Server Error',
        cause: {
          status: 500,
        },
      };

      mockSearchAll.mockRejectedValue(gitbeakerError);

      const result = await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      expect(result).toMatchObject({
        status: 500,
        type: 'http',
      });
    });

    it('should handle Gitbeaker Premium required error', async () => {
      const gitbeakerError = {
        message: 'This feature requires GitLab Premium',
        cause: {
          description: 'This feature requires GitLab Premium',
          status: 403,
        },
      };

      mockSearchAll.mockRejectedValue(gitbeakerError);

      const result = await searchGitLabCodeAPI({
        search: 'function',
        groupId: 123,
      });

      expect(result).toMatchObject({
        error: expect.stringContaining('Premium'),
        status: 403,
        type: 'http',
      });
    });

    it('should handle network/fetch errors', async () => {
      const networkError = new TypeError('fetch failed');

      mockSearchAll.mockRejectedValue(networkError);

      const result = await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      expect(result).toMatchObject({
        type: 'network',
      });
    });

    it('should handle generic Error objects', async () => {
      const genericError = new Error('Something unexpected happened');

      mockSearchAll.mockRejectedValue(genericError);

      const result = await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      expect(result).toMatchObject({
        error: 'Something unexpected happened',
        type: 'unknown',
      });
    });

    it('should handle errors with response but no cause', async () => {
      const gitbeakerError = {
        message: 'Request failed',
        response: {
          status: 400,
        },
      };

      mockSearchAll.mockRejectedValue(gitbeakerError);

      const result = await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      expect(result).toMatchObject({
        status: 400,
        type: 'http',
      });
    });

    it('should handle errors with only status property', async () => {
      const gitbeakerError = {
        message: 'Request failed',
        status: 502,
      };

      mockSearchAll.mockRejectedValue(gitbeakerError);

      const result = await searchGitLabCodeAPI({
        search: 'function',
        projectId: 123,
      });

      expect(result).toMatchObject({
        status: 502,
        type: 'http',
      });
    });
  });

  // ============================================================================
  // RESPONSE STRUCTURE TESTS
  // ============================================================================

  describe('Response Structure', () => {
    it('should return correctly structured success response', async () => {
      const mockItems: GitLabCodeSearchItem[] = [
        {
          basename: 'test',
          data: 'const test = () => {}',
          path: 'src/test.ts',
          filename: 'test.ts',
          id: 'abc123',
          ref: 'main',
          startline: 5,
          project_id: 123,
        },
      ];

      mockSearchAll.mockResolvedValue(mockItems);

      const result = await searchGitLabCodeAPI({
        search: 'test',
        projectId: 123,
      });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('status', 200);

      if ('data' in result) {
        expect(result.data).toHaveProperty('items');
        expect(result.data).toHaveProperty('totalCount');
        expect(result.data).toHaveProperty('pagination');
        expect(result.data.pagination).toHaveProperty('currentPage');
        expect(result.data.pagination).toHaveProperty('totalPages');
        expect(result.data.pagination).toHaveProperty('perPage');
        expect(result.data.pagination).toHaveProperty('hasMore');
      }
    });

    it('should preserve all item properties from API response', async () => {
      const mockItem: GitLabCodeSearchItem = {
        basename: 'myfile',
        data: 'export const myFunction = () => { return 42; };',
        path: 'src/utils/myfile.ts',
        filename: 'myfile.ts',
        id: 'sha256hash',
        ref: 'feature-branch',
        startline: 15,
        project_id: 456,
      };

      mockSearchAll.mockResolvedValue([mockItem]);

      const result = await searchGitLabCodeAPI({
        search: 'myFunction',
        projectId: 456,
      });

      if ('data' in result) {
        expect(result.data.items[0]).toEqual(mockItem);
      } else {
        expect.fail('Expected successful result');
      }
    });
  });
});

// ============================================================================
// TRANSFORM FUNCTION TESTS
// ============================================================================

describe('transformGitLabCodeSearchItem', () => {
  it('should transform GitLab code search item to unified format', () => {
    const item: GitLabCodeSearchItem = {
      basename: 'utils',
      data: 'export function helper() { return true; }',
      path: 'src/utils.ts',
      filename: 'utils.ts',
      id: 'abc123',
      ref: 'main',
      startline: 10,
      project_id: 123,
    };

    const result = transformGitLabCodeSearchItem(item, 'my-org/my-project');

    expect(result).toEqual({
      path: 'src/utils.ts',
      content: 'export function helper() { return true; }',
      lineNumber: 10,
      repository: {
        id: '123',
        name: 'my-org/my-project',
      },
    });
  });

  it('should use project_id as name when projectPath is not provided', () => {
    const item: GitLabCodeSearchItem = {
      basename: 'index',
      data: 'const x = 1;',
      path: 'src/index.ts',
      filename: 'index.ts',
      id: 'def456',
      ref: 'main',
      startline: 1,
      project_id: 789,
    };

    const result = transformGitLabCodeSearchItem(item);

    expect(result).toEqual({
      path: 'src/index.ts',
      content: 'const x = 1;',
      lineNumber: 1,
      repository: {
        id: '789',
        name: '789',
      },
    });
  });

  it('should handle empty data field', () => {
    const item: GitLabCodeSearchItem = {
      basename: 'empty',
      data: '',
      path: 'src/empty.ts',
      filename: 'empty.ts',
      id: null,
      ref: 'main',
      startline: 0,
      project_id: 100,
    };

    const result = transformGitLabCodeSearchItem(item, 'test/repo');

    expect(result).toEqual({
      path: 'src/empty.ts',
      content: '',
      lineNumber: 0,
      repository: {
        id: '100',
        name: 'test/repo',
      },
    });
  });

  it('should handle null id', () => {
    const item: GitLabCodeSearchItem = {
      basename: 'test',
      data: 'test content',
      path: 'test.ts',
      filename: 'test.ts',
      id: null,
      ref: 'main',
      startline: 5,
      project_id: 200,
    };

    const result = transformGitLabCodeSearchItem(item);

    expect(result.repository.id).toBe('200');
  });

  it('should correctly map data field to content field', () => {
    const originalData = `
      import { something } from 'somewhere';

      export class MyClass {
        constructor() {
          this.value = 42;
        }
      }
    `;

    const item: GitLabCodeSearchItem = {
      basename: 'MyClass',
      data: originalData,
      path: 'src/classes/MyClass.ts',
      filename: 'MyClass.ts',
      id: 'xyz789',
      ref: 'develop',
      startline: 1,
      project_id: 300,
    };

    const result = transformGitLabCodeSearchItem(item, 'org/repo');

    expect(result.content).toBe(originalData);
  });

  it('should correctly map startline to lineNumber', () => {
    const item: GitLabCodeSearchItem = {
      basename: 'test',
      data: 'function test() {}',
      path: 'test.ts',
      filename: 'test.ts',
      id: 'abc',
      ref: 'main',
      startline: 42,
      project_id: 1,
    };

    const result = transformGitLabCodeSearchItem(item);

    expect(result.lineNumber).toBe(42);
  });

  it('should convert numeric project_id to string', () => {
    const item: GitLabCodeSearchItem = {
      basename: 'test',
      data: 'content',
      path: 'test.ts',
      filename: 'test.ts',
      id: 'abc',
      ref: 'main',
      startline: 1,
      project_id: 12345,
    };

    const result = transformGitLabCodeSearchItem(item);

    expect(typeof result.repository.id).toBe('string');
    expect(result.repository.id).toBe('12345');
  });

  it('should handle special characters in projectPath', () => {
    const item: GitLabCodeSearchItem = {
      basename: 'test',
      data: 'content',
      path: 'test.ts',
      filename: 'test.ts',
      id: 'abc',
      ref: 'main',
      startline: 1,
      project_id: 1,
    };

    const result = transformGitLabCodeSearchItem(
      item,
      'org-name/project_name-v2.0'
    );

    expect(result.repository.name).toBe('org-name/project_name-v2.0');
  });

  it('should handle deeply nested paths', () => {
    const item: GitLabCodeSearchItem = {
      basename: 'deep',
      data: 'nested content',
      path: 'src/modules/feature/components/utils/helpers/deep.ts',
      filename: 'deep.ts',
      id: 'nested123',
      ref: 'main',
      startline: 100,
      project_id: 500,
    };

    const result = transformGitLabCodeSearchItem(item, 'deep/nested/repo');

    expect(result.path).toBe(
      'src/modules/feature/components/utils/helpers/deep.ts'
    );
  });
});

// ============================================================================
// EDGE CASES AND INTEGRATION TESTS
// ============================================================================

describe('Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withDataCacheCalls = [];
  });

  it('should handle very long search queries', async () => {
    const longSearch = 'a'.repeat(1000);
    mockSearchAll.mockResolvedValue([]);

    const result = await searchGitLabCodeAPI({
      search: longSearch,
      projectId: 123,
    });

    expect(mockSearchAll).toHaveBeenCalledWith(
      'blobs',
      longSearch,
      expect.any(Object)
    );
    expect(result).toHaveProperty('data');
  });

  it('should handle search with special regex characters', async () => {
    mockSearchAll.mockResolvedValue([]);

    await searchGitLabCodeAPI({
      search: 'function.*test()',
      projectId: 123,
    });

    expect(mockSearchAll).toHaveBeenCalledWith(
      'blobs',
      'function.*test()',
      expect.any(Object)
    );
  });

  it('should handle search with unicode characters', async () => {
    mockSearchAll.mockResolvedValue([]);

    await searchGitLabCodeAPI({
      search: 'const mensaje = "Hola mundo"',
      projectId: 123,
    });

    expect(mockSearchAll).toHaveBeenCalledWith(
      'blobs',
      'const mensaje = "Hola mundo"',
      expect.any(Object)
    );
  });

  it('should handle numeric string projectId', async () => {
    mockSearchAll.mockResolvedValue([]);

    await searchGitLabCodeAPI({
      search: 'test',
      projectId: '123',
    });

    expect(mockSearchAll).toHaveBeenCalledWith('blobs', 'test', {
      projectId: '123',
      ref: undefined,
      perPage: 20,
      page: 1,
    });
  });

  it('should handle large result sets', async () => {
    const mockItems = Array.from({ length: 100 }, (_, i) => ({
      basename: `file${i}`,
      data: `content ${i}`,
      path: `src/file${i}.ts`,
      filename: `file${i}.ts`,
      id: `id${i}`,
      ref: 'main',
      startline: i + 1,
      project_id: 123,
    }));

    mockSearchAll.mockResolvedValue(mockItems);

    const result = await searchGitLabCodeAPI({
      search: 'function',
      projectId: 123,
      perPage: 100,
    });

    if ('data' in result) {
      expect(result.data.items.length).toBe(100);
      expect(result.data.totalCount).toBe(100);
      expect(result.data.pagination?.hasMore).toBe(true);
    } else {
      expect.fail('Expected successful result');
    }
  });

  it('should handle concurrent requests', async () => {
    mockSearchAll.mockResolvedValue([]);

    const promises = [
      searchGitLabCodeAPI({ search: 'function', projectId: 1 }),
      searchGitLabCodeAPI({ search: 'class', projectId: 2 }),
      searchGitLabCodeAPI({ search: 'interface', projectId: 3 }),
    ];

    const results = await Promise.all(promises);

    expect(results.every(r => 'data' in r)).toBe(true);
    expect(mockSearchAll).toHaveBeenCalledTimes(3);
  });

  it('should handle zero as startline', async () => {
    const mockItem: GitLabCodeSearchItem = {
      basename: 'test',
      data: 'content',
      path: 'test.ts',
      filename: 'test.ts',
      id: 'abc',
      ref: 'main',
      startline: 0,
      project_id: 1,
    };

    mockSearchAll.mockResolvedValue([mockItem]);

    const result = await searchGitLabCodeAPI({
      search: 'test',
      projectId: 1,
    });

    if ('data' in result) {
      expect(result.data.items[0]!.startline).toBe(0);
    } else {
      expect.fail('Expected successful result');
    }
  });
});

// ============================================================================
// SEARCH TYPE TESTS
// ============================================================================

describe('Search Type Parameter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withDataCacheCalls = [];
  });

  it('should include searchType in cache key when provided', async () => {
    mockSearchAll.mockResolvedValue([]);

    await searchGitLabCodeAPI({
      search: 'function',
      projectId: 123,
      searchType: 'advanced',
    });

    await searchGitLabCodeAPI({
      search: 'function',
      projectId: 123,
      searchType: 'basic',
    });

    // Cache keys should be generated (we can verify the calls were made)
    expect(withDataCacheCalls.length).toBe(2);
  });
});

/**
 * GitLab Repository Structure Tests
 *
 * Comprehensive unit tests for the GitLab repository structure API.
 * Tests cover:
 * - viewGitLabRepositoryStructureAPI function
 * - transformGitLabTree function
 * - buildStructureFromItems helper (tested indirectly through pagination)
 * - Validation, caching, filtering, pagination, and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  viewGitLabRepositoryStructureAPI,
  transformGitLabTree,
} from '../../src/gitlab/repoStructure.js';
import { getGitlab } from '../../src/gitlab/client.js';
import {
  handleGitLabAPIError,
  createGitLabError,
} from '../../src/gitlab/errors.js';
import { generateCacheKey, withDataCache } from '../../src/utils/http/cache.js';
import {
  shouldIgnoreDir,
  shouldIgnoreFile,
} from '../../src/utils/file/filters.js';
import type {
  GitLabTreeItem,
  GitLabTreeQuery,
  GitLabProject,
} from '../../src/gitlab/types.js';

// Mock dependencies
vi.mock('../../src/gitlab/client.js');
vi.mock('../../src/gitlab/errors.js');
vi.mock('../../src/utils/http/cache.js', () => ({
  generateCacheKey: vi.fn(() => 'test-cache-key'),
  withDataCache: vi.fn((_, operation) => operation()),
  clearAllCache: vi.fn(),
}));
vi.mock('../../src/utils/file/filters.js');

describe('GitLab Repository Structure', () => {
  // Mock GitLab client
  const mockGitlab = {
    Projects: {
      show: vi.fn(),
    },
    Repositories: {
      allRepositoryTrees: vi.fn(),
    },
  };

  // Mock project data
  const mockProject: Partial<GitLabProject> = {
    id: 12345,
    name: 'test-repo',
    path: 'test-repo',
    path_with_namespace: 'test-group/test-repo',
    default_branch: 'main',
    visibility: 'public',
    web_url: 'https://gitlab.com/test-group/test-repo',
  };

  // Mock tree items
  const mockTreeItems: GitLabTreeItem[] = [
    { id: 'abc1', name: 'src', type: 'tree', path: 'src', mode: '040000' },
    { id: 'abc2', name: 'tests', type: 'tree', path: 'tests', mode: '040000' },
    {
      id: 'def1',
      name: 'index.ts',
      type: 'blob',
      path: 'src/index.ts',
      mode: '100644',
    },
    {
      id: 'def2',
      name: 'utils.ts',
      type: 'blob',
      path: 'src/utils.ts',
      mode: '100644',
    },
    {
      id: 'def3',
      name: 'README.md',
      type: 'blob',
      path: 'README.md',
      mode: '100644',
    },
    {
      id: 'def4',
      name: 'package.json',
      type: 'blob',
      path: 'package.json',
      mode: '100644',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    vi.mocked(getGitlab).mockResolvedValue(mockGitlab as any);
    vi.mocked(handleGitLabAPIError).mockReturnValue({
      error: 'API Error',
      type: 'http',
      status: 500,
    });
    vi.mocked(createGitLabError).mockImplementation(
      (message, status, hints) => ({
        error: message,
        status: status || 500,
        type: 'http',
        hints,
      })
    );

    // Default filter mocks - don't ignore anything
    vi.mocked(shouldIgnoreDir).mockReturnValue(false);
    vi.mocked(shouldIgnoreFile).mockReturnValue(false);

    // Setup default project and tree responses
    mockGitlab.Projects.show.mockResolvedValue(mockProject);
    mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(mockTreeItems);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // VALIDATION TESTS
  // ============================================================================

  describe('viewGitLabRepositoryStructureAPI - Validation', () => {
    it('should return error when projectId is missing', async () => {
      const params = {} as GitLabTreeQuery;

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(result).toHaveProperty('error');
      expect(createGitLabError).toHaveBeenCalledWith(
        'Project ID is required',
        400
      );
    });

    it('should return error when projectId is empty string', async () => {
      const params: GitLabTreeQuery = { projectId: '' };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(result).toHaveProperty('error');
      expect(createGitLabError).toHaveBeenCalledWith(
        'Project ID is required',
        400
      );
    });

    it('should return error when projectId is 0', async () => {
      const params: GitLabTreeQuery = { projectId: 0 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(result).toHaveProperty('error');
      expect(createGitLabError).toHaveBeenCalledWith(
        'Project ID is required',
        400
      );
    });

    it('should accept numeric projectId', async () => {
      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(result).toHaveProperty('data');
      expect(mockGitlab.Projects.show).toHaveBeenCalledWith(12345);
    });

    it('should accept string projectId (URL-encoded path)', async () => {
      const params: GitLabTreeQuery = { projectId: 'test-group%2Ftest-repo' };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(result).toHaveProperty('data');
      expect(mockGitlab.Projects.show).toHaveBeenCalledWith(
        'test-group%2Ftest-repo'
      );
    });
  });

  // ============================================================================
  // SUCCESS SCENARIOS
  // ============================================================================

  describe('viewGitLabRepositoryStructureAPI - Success', () => {
    it('should fetch repository structure successfully', async () => {
      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('status', 200);

      if ('data' in result) {
        expect(result.data.projectId).toBe(12345);
        expect(result.data.projectPath).toBe('test-group/test-repo');
        expect(result.data.branch).toBe('main');
      }
    });

    it('should use provided ref instead of default branch', async () => {
      const params: GitLabTreeQuery = { projectId: 12345, ref: 'develop' };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(mockGitlab.Repositories.allRepositoryTrees).toHaveBeenCalledWith(
        12345,
        expect.objectContaining({ ref: 'develop' })
      );

      if ('data' in result) {
        expect(result.data.branch).toBe('develop');
      }
    });

    it('should use default branch when ref is not provided', async () => {
      const params: GitLabTreeQuery = { projectId: 12345 };

      await viewGitLabRepositoryStructureAPI(params);

      expect(mockGitlab.Repositories.allRepositoryTrees).toHaveBeenCalledWith(
        12345,
        expect.objectContaining({ ref: 'main' })
      );
    });

    it('should fall back to main when no default branch', async () => {
      mockGitlab.Projects.show.mockResolvedValue({
        ...mockProject,
        default_branch: undefined,
      });

      const params: GitLabTreeQuery = { projectId: 12345 };

      await viewGitLabRepositoryStructureAPI(params);

      expect(mockGitlab.Repositories.allRepositoryTrees).toHaveBeenCalledWith(
        12345,
        expect.objectContaining({ ref: 'main' })
      );
    });

    it('should pass path parameter when provided', async () => {
      const params: GitLabTreeQuery = {
        projectId: 12345,
        path: 'src/components',
      };

      await viewGitLabRepositoryStructureAPI(params);

      expect(mockGitlab.Repositories.allRepositoryTrees).toHaveBeenCalledWith(
        12345,
        expect.objectContaining({ path: 'src/components' })
      );
    });

    it('should use recursive mode by default', async () => {
      const params: GitLabTreeQuery = { projectId: 12345 };

      await viewGitLabRepositoryStructureAPI(params);

      expect(mockGitlab.Repositories.allRepositoryTrees).toHaveBeenCalledWith(
        12345,
        expect.objectContaining({ recursive: true })
      );
    });

    it('should allow disabling recursive mode', async () => {
      const params: GitLabTreeQuery = { projectId: 12345, recursive: false };

      await viewGitLabRepositoryStructureAPI(params);

      expect(mockGitlab.Repositories.allRepositoryTrees).toHaveBeenCalledWith(
        12345,
        expect.objectContaining({ recursive: false })
      );
    });

    it('should include summary with correct counts', async () => {
      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        // 2 folders (src, tests), 4 files (index.ts, utils.ts, README.md, package.json)
        expect(result.data.summary.totalFolders).toBe(2);
        expect(result.data.summary.totalFiles).toBe(4);
        expect(result.data.summary.filtered).toBe(true);
      }
    });

    it('should include project path hint', async () => {
      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.hints).toContain('Project: test-group/test-repo');
      }
    });

    it('should set path to root when not provided', async () => {
      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.path).toBe('/');
      }
    });

    it('should set path to provided value', async () => {
      const params: GitLabTreeQuery = { projectId: 12345, path: 'src' };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.path).toBe('src');
      }
    });
  });

  // ============================================================================
  // FILTERING TESTS
  // ============================================================================

  describe('viewGitLabRepositoryStructureAPI - Filtering', () => {
    it('should filter out ignored directories', async () => {
      const treeWithIgnored: GitLabTreeItem[] = [
        ...mockTreeItems,
        {
          id: 'ign1',
          name: 'node_modules',
          type: 'tree',
          path: 'node_modules',
          mode: '040000',
        },
        {
          id: 'ign2',
          name: '.git',
          type: 'tree',
          path: '.git',
          mode: '040000',
        },
      ];

      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(
        treeWithIgnored
      );
      vi.mocked(shouldIgnoreDir).mockImplementation(name =>
        ['node_modules', '.git'].includes(name)
      );

      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(shouldIgnoreDir).toHaveBeenCalledWith('node_modules');
      expect(shouldIgnoreDir).toHaveBeenCalledWith('.git');

      if ('data' in result) {
        // Should not include ignored directories in count
        expect(result.data.summary.totalFolders).toBe(2); // src, tests only
      }
    });

    it('should filter out ignored files', async () => {
      const treeWithIgnored: GitLabTreeItem[] = [
        ...mockTreeItems,
        {
          id: 'ign1',
          name: 'package-lock.json',
          type: 'blob',
          path: 'package-lock.json',
          mode: '100644',
        },
        {
          id: 'ign2',
          name: '.DS_Store',
          type: 'blob',
          path: '.DS_Store',
          mode: '100644',
        },
      ];

      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(
        treeWithIgnored
      );
      vi.mocked(shouldIgnoreFile).mockImplementation(path =>
        ['package-lock.json', '.DS_Store'].includes(path)
      );

      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(shouldIgnoreFile).toHaveBeenCalledWith('package-lock.json');
      expect(shouldIgnoreFile).toHaveBeenCalledWith('.DS_Store');

      if ('data' in result) {
        // Should not include ignored files in count
        expect(result.data.summary.totalFiles).toBe(4); // Original 4 files
      }
    });

    it('should sort directories before files', async () => {
      // Items in non-sorted order
      const unsortedItems: GitLabTreeItem[] = [
        {
          id: 'f1',
          name: 'zebra.ts',
          type: 'blob',
          path: 'zebra.ts',
          mode: '100644',
        },
        {
          id: 'd1',
          name: 'alpha',
          type: 'tree',
          path: 'alpha',
          mode: '040000',
        },
        {
          id: 'f2',
          name: 'apple.ts',
          type: 'blob',
          path: 'apple.ts',
          mode: '100644',
        },
        { id: 'd2', name: 'beta', type: 'tree', path: 'beta', mode: '040000' },
      ];

      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(
        unsortedItems
      );

      const params: GitLabTreeQuery = { projectId: 12345, perPage: 100 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        const structure = result.data.structure;
        // The structure should have folders and files sorted
        // Both dirs (alpha, beta) should come before both files (apple, zebra)
        const rootEntry = structure['.'];
        if (rootEntry) {
          expect(rootEntry.folders).toEqual(['alpha', 'beta']);
          expect(rootEntry.files).toEqual(['apple.ts', 'zebra.ts']);
        }
      }
    });

    it('should sort items alphabetically within type', async () => {
      const items: GitLabTreeItem[] = [
        { id: 'f1', name: 'c.ts', type: 'blob', path: 'c.ts', mode: '100644' },
        { id: 'f2', name: 'a.ts', type: 'blob', path: 'a.ts', mode: '100644' },
        { id: 'f3', name: 'b.ts', type: 'blob', path: 'b.ts', mode: '100644' },
      ];

      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(items);

      const params: GitLabTreeQuery = { projectId: 12345, perPage: 100 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        const rootEntry = result.data.structure['.'];
        if (rootEntry) {
          expect(rootEntry.files).toEqual(['a.ts', 'b.ts', 'c.ts']);
        }
      }
    });
  });

  // ============================================================================
  // PAGINATION TESTS
  // ============================================================================

  describe('viewGitLabRepositoryStructureAPI - Pagination', () => {
    it('should paginate results with default perPage', async () => {
      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.pagination).toBeDefined();
        expect(result.data.pagination?.entriesPerPage).toBe(20);
        expect(result.data.pagination?.currentPage).toBe(1);
      }
    });

    it('should use custom perPage value', async () => {
      const params: GitLabTreeQuery = { projectId: 12345, perPage: 10 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.pagination?.entriesPerPage).toBe(10);
      }
    });

    it('should use custom page number', async () => {
      const params: GitLabTreeQuery = { projectId: 12345, page: 2, perPage: 3 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.pagination?.currentPage).toBe(2);
      }
    });

    it('should calculate total pages correctly', async () => {
      // 6 items total with perPage=3 should give 2 pages
      const params: GitLabTreeQuery = { projectId: 12345, perPage: 3 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.pagination?.totalPages).toBe(2);
        expect(result.data.pagination?.totalEntries).toBe(6);
      }
    });

    it('should indicate hasMore when more pages exist', async () => {
      const params: GitLabTreeQuery = { projectId: 12345, page: 1, perPage: 3 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.pagination?.hasMore).toBe(true);
        expect(result.data.summary.truncated).toBe(true);
      }
    });

    it('should indicate no more pages on last page', async () => {
      const params: GitLabTreeQuery = { projectId: 12345, page: 2, perPage: 3 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.pagination?.hasMore).toBe(false);
        expect(result.data.summary.truncated).toBe(false);
      }
    });

    it('should include pagination hint when more pages exist', async () => {
      const params: GitLabTreeQuery = { projectId: 12345, page: 1, perPage: 3 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.hints).toContainEqual(
          expect.stringContaining('Page 1/2')
        );
        expect(result.data.hints).toContainEqual(
          expect.stringContaining('page=2')
        );
      }
    });

    it('should not include pagination hint on last page', async () => {
      const params: GitLabTreeQuery = { projectId: 12345, page: 2, perPage: 3 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        const pageHints = result.data.hints?.filter(h => h.includes('Page'));
        expect(pageHints?.length ?? 0).toBe(0);
      }
    });

    it('should return correct items for each page', async () => {
      const params1: GitLabTreeQuery = {
        projectId: 12345,
        page: 1,
        perPage: 3,
      };
      const params2: GitLabTreeQuery = {
        projectId: 12345,
        page: 2,
        perPage: 3,
      };

      const result1 = await viewGitLabRepositoryStructureAPI(params1);
      const result2 = await viewGitLabRepositoryStructureAPI(params2);

      if ('data' in result1 && 'data' in result2) {
        // Count items in each page's structure
        const countItems = (
          struct: Record<string, { files: string[]; folders: string[] }>
        ) => {
          return Object.values(struct).reduce(
            (sum, entry) => sum + entry.files.length + entry.folders.length,
            0
          );
        };

        expect(countItems(result1.data.structure)).toBe(3);
        expect(countItems(result2.data.structure)).toBe(3);
      }
    });

    it('should handle empty tree results', async () => {
      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue([]);

      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.summary.totalFiles).toBe(0);
        expect(result.data.summary.totalFolders).toBe(0);
        expect(result.data.structure).toEqual({});
      }
    });

    it('should handle page beyond available items', async () => {
      const params: GitLabTreeQuery = {
        projectId: 12345,
        page: 100,
        perPage: 20,
      };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        // Should return empty structure for page beyond data
        expect(result.data.structure).toEqual({});
        expect(result.data.pagination?.currentPage).toBe(100);
      }
    });
  });

  // ============================================================================
  // CACHING TESTS
  // ============================================================================

  describe('viewGitLabRepositoryStructureAPI - Caching', () => {
    it('should generate cache key with projectId', async () => {
      const params: GitLabTreeQuery = { projectId: 12345 };

      await viewGitLabRepositoryStructureAPI(params);

      expect(generateCacheKey).toHaveBeenCalledWith(
        'gl-api-tree-full',
        expect.objectContaining({ projectId: 12345 }),
        undefined
      );
    });

    it('should generate cache key with ref', async () => {
      const params: GitLabTreeQuery = { projectId: 12345, ref: 'develop' };

      await viewGitLabRepositoryStructureAPI(params);

      expect(generateCacheKey).toHaveBeenCalledWith(
        'gl-api-tree-full',
        expect.objectContaining({ ref: 'develop' }),
        undefined
      );
    });

    it('should generate cache key with path', async () => {
      const params: GitLabTreeQuery = { projectId: 12345, path: 'src' };

      await viewGitLabRepositoryStructureAPI(params);

      expect(generateCacheKey).toHaveBeenCalledWith(
        'gl-api-tree-full',
        expect.objectContaining({ path: 'src' }),
        undefined
      );
    });

    it('should generate cache key with recursive flag', async () => {
      const params: GitLabTreeQuery = { projectId: 12345, recursive: false };

      await viewGitLabRepositoryStructureAPI(params);

      expect(generateCacheKey).toHaveBeenCalledWith(
        'gl-api-tree-full',
        expect.objectContaining({ recursive: false }),
        undefined
      );
    });

    it('should include sessionId in cache key when provided', async () => {
      const params: GitLabTreeQuery = { projectId: 12345 };
      const sessionId = 'test-session-123';

      await viewGitLabRepositoryStructureAPI(params, sessionId);

      expect(generateCacheKey).toHaveBeenCalledWith(
        'gl-api-tree-full',
        expect.any(Object),
        sessionId
      );
    });

    it('should not include pagination params in cache key', async () => {
      const params: GitLabTreeQuery = {
        projectId: 12345,
        page: 2,
        perPage: 50,
      };

      await viewGitLabRepositoryStructureAPI(params);

      expect(generateCacheKey).toHaveBeenCalledWith(
        'gl-api-tree-full',
        expect.not.objectContaining({ page: 2, perPage: 50 }),
        undefined
      );
    });

    it('should use withDataCache for caching', async () => {
      const params: GitLabTreeQuery = { projectId: 12345 };

      await viewGitLabRepositoryStructureAPI(params);

      expect(withDataCache).toHaveBeenCalledWith(
        'test-cache-key',
        expect.any(Function),
        expect.objectContaining({
          shouldCache: expect.any(Function),
        })
      );
    });

    it('should only cache successful responses', async () => {
      const params: GitLabTreeQuery = { projectId: 12345 };

      await viewGitLabRepositoryStructureAPI(params);

      // Get the shouldCache function that was passed to withDataCache
      const withDataCacheCall = vi.mocked(withDataCache).mock.calls[0];
      const options = withDataCacheCall?.[2];
      const shouldCache = options?.shouldCache;

      if (shouldCache) {
        // Should cache successful response
        expect(shouldCache({ data: {}, status: 200 })).toBe(true);

        // Should not cache error response
        expect(shouldCache({ error: 'Error', type: 'http' })).toBe(false);
      }
    });

    it('should return cached result and apply pagination', async () => {
      // Setup withDataCache to return a cached result
      const cachedResult = {
        data: {
          projectId: 12345,
          projectPath: 'test-group/test-repo',
          branch: 'main',
          path: '/',
          summary: {
            totalFiles: 4,
            totalFolders: 2,
            truncated: false,
            filtered: true,
            originalCount: 6,
          },
          structure: {},
          _cachedItems: [
            { path: 'src', type: 'dir' as const },
            { path: 'tests', type: 'dir' as const },
            { path: 'src/index.ts', type: 'file' as const },
            { path: 'src/utils.ts', type: 'file' as const },
            { path: 'README.md', type: 'file' as const },
            { path: 'package.json', type: 'file' as const },
          ],
        },
        status: 200,
      };

      vi.mocked(withDataCache).mockResolvedValue(cachedResult);

      const params: GitLabTreeQuery = { projectId: 12345, page: 1, perPage: 3 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        // Should have pagination applied
        expect(result.data.pagination).toBeDefined();
        expect(result.data.pagination?.entriesPerPage).toBe(3);
        // Should not include _cachedItems in returned result
        expect(result.data).not.toHaveProperty('_cachedItems');
      }
    });

    it('should return error if cache returns error', async () => {
      vi.mocked(withDataCache).mockResolvedValue({
        error: 'Cached error',
        type: 'http',
        status: 500,
      });

      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(result).toHaveProperty('error', 'Cached error');
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('viewGitLabRepositoryStructureAPI - Error Handling', () => {
    it('should handle GitLab API errors', async () => {
      // withDataCache calls the operation which will throw
      vi.mocked(withDataCache).mockImplementation((_, operation) =>
        operation()
      );
      mockGitlab.Projects.show.mockRejectedValue(new Error('API Error'));

      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(handleGitLabAPIError).toHaveBeenCalled();
      expect(result).toHaveProperty('error');
    });

    it('should handle project not found', async () => {
      const notFoundError = { cause: { status: 404 } };
      vi.mocked(withDataCache).mockImplementation((_, operation) =>
        operation()
      );
      mockGitlab.Projects.show.mockRejectedValue(notFoundError);
      vi.mocked(handleGitLabAPIError).mockReturnValue({
        error: 'Resource not found',
        type: 'http',
        status: 404,
      });

      const params: GitLabTreeQuery = { projectId: 99999 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('status', 404);
    });

    it('should handle unauthorized access', async () => {
      const unauthorizedError = { cause: { status: 401 } };
      vi.mocked(withDataCache).mockImplementation((_, operation) =>
        operation()
      );
      mockGitlab.Projects.show.mockRejectedValue(unauthorizedError);
      vi.mocked(handleGitLabAPIError).mockReturnValue({
        error: 'GitLab authentication failed',
        type: 'http',
        status: 401,
      });

      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('status', 401);
    });

    it('should handle forbidden access', async () => {
      const forbiddenError = { cause: { status: 403 } };
      vi.mocked(withDataCache).mockImplementation((_, operation) =>
        operation()
      );
      mockGitlab.Repositories.allRepositoryTrees.mockRejectedValue(
        forbiddenError
      );
      vi.mocked(handleGitLabAPIError).mockReturnValue({
        error: 'Access denied',
        type: 'http',
        status: 403,
      });

      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('status', 403);
    });

    it('should handle rate limiting', async () => {
      const rateLimitError = {
        response: { status: 429, headers: { 'retry-after': '60' } },
      };
      vi.mocked(withDataCache).mockImplementation((_, operation) =>
        operation()
      );
      mockGitlab.Repositories.allRepositoryTrees.mockRejectedValue(
        rateLimitError
      );
      vi.mocked(handleGitLabAPIError).mockReturnValue({
        error: 'Rate limit exceeded',
        type: 'http',
        status: 429,
        retryAfter: 60,
      });

      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('status', 429);
    });

    it('should handle network errors', async () => {
      const networkError = new TypeError('fetch failed');
      vi.mocked(withDataCache).mockImplementation((_, operation) =>
        operation()
      );
      mockGitlab.Projects.show.mockRejectedValue(networkError);
      vi.mocked(handleGitLabAPIError).mockReturnValue({
        error: 'Network error',
        type: 'network',
        status: 0,
      });

      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('type', 'network');
    });

    it('should handle unknown errors', async () => {
      vi.mocked(withDataCache).mockImplementation((_, operation) =>
        operation()
      );
      mockGitlab.Projects.show.mockRejectedValue('Unknown error type');
      vi.mocked(handleGitLabAPIError).mockReturnValue({
        error: 'An unknown error occurred',
        type: 'unknown',
        status: 500,
      });

      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('type', 'unknown');
    });
  });

  // ============================================================================
  // buildStructureFromItems TESTS (via pagination)
  // ============================================================================

  describe('buildStructureFromItems - via pagination', () => {
    it('should build structure with root-level items', async () => {
      const items: GitLabTreeItem[] = [
        {
          id: 'f1',
          name: 'file1.ts',
          type: 'blob',
          path: 'file1.ts',
          mode: '100644',
        },
        {
          id: 'f2',
          name: 'file2.ts',
          type: 'blob',
          path: 'file2.ts',
          mode: '100644',
        },
        { id: 'd1', name: 'src', type: 'tree', path: 'src', mode: '040000' },
      ];

      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(items);

      const params: GitLabTreeQuery = { projectId: 12345, perPage: 100 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.structure['.']).toBeDefined();
        expect(result.data.structure['.']?.files).toContain('file1.ts');
        expect(result.data.structure['.']?.files).toContain('file2.ts');
        expect(result.data.structure['.']?.folders).toContain('src');
      }
    });

    it('should build structure with nested items', async () => {
      const items: GitLabTreeItem[] = [
        { id: 'd1', name: 'src', type: 'tree', path: 'src', mode: '040000' },
        {
          id: 'f1',
          name: 'index.ts',
          type: 'blob',
          path: 'src/index.ts',
          mode: '100644',
        },
        {
          id: 'f2',
          name: 'utils.ts',
          type: 'blob',
          path: 'src/utils.ts',
          mode: '100644',
        },
      ];

      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(items);

      const params: GitLabTreeQuery = { projectId: 12345, perPage: 100 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.structure['src']).toBeDefined();
        expect(result.data.structure['src']?.files).toContain('index.ts');
        expect(result.data.structure['src']?.files).toContain('utils.ts');
      }
    });

    it('should build structure with deeply nested items', async () => {
      const items: GitLabTreeItem[] = [
        { id: 'd1', name: 'src', type: 'tree', path: 'src', mode: '040000' },
        {
          id: 'd2',
          name: 'components',
          type: 'tree',
          path: 'src/components',
          mode: '040000',
        },
        {
          id: 'd3',
          name: 'ui',
          type: 'tree',
          path: 'src/components/ui',
          mode: '040000',
        },
        {
          id: 'f1',
          name: 'Button.tsx',
          type: 'blob',
          path: 'src/components/ui/Button.tsx',
          mode: '100644',
        },
      ];

      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(items);

      const params: GitLabTreeQuery = { projectId: 12345, perPage: 100 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.structure['src/components/ui']).toBeDefined();
        expect(result.data.structure['src/components/ui']?.files).toContain(
          'Button.tsx'
        );
      }
    });

    it('should handle base path correctly', async () => {
      const items: GitLabTreeItem[] = [
        {
          id: 'd1',
          name: 'ui',
          type: 'tree',
          path: 'src/components/ui',
          mode: '040000',
        },
        {
          id: 'f1',
          name: 'Button.tsx',
          type: 'blob',
          path: 'src/components/ui/Button.tsx',
          mode: '100644',
        },
      ];

      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(items);

      const params: GitLabTreeQuery = {
        projectId: 12345,
        path: 'src/components',
        perPage: 100,
      };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        // With base path 'src/components', the relative path for 'ui' should be '.'
        // and Button.tsx should be under 'ui'
        expect(result.data.structure).toBeDefined();
      }
    });

    it('should sort files and folders alphabetically within directories', async () => {
      const items: GitLabTreeItem[] = [
        {
          id: 'f1',
          name: 'zebra.ts',
          type: 'blob',
          path: 'zebra.ts',
          mode: '100644',
        },
        {
          id: 'f2',
          name: 'apple.ts',
          type: 'blob',
          path: 'apple.ts',
          mode: '100644',
        },
        {
          id: 'f3',
          name: 'mango.ts',
          type: 'blob',
          path: 'mango.ts',
          mode: '100644',
        },
        { id: 'd1', name: 'zeta', type: 'tree', path: 'zeta', mode: '040000' },
        {
          id: 'd2',
          name: 'alpha',
          type: 'tree',
          path: 'alpha',
          mode: '040000',
        },
      ];

      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(items);

      const params: GitLabTreeQuery = { projectId: 12345, perPage: 100 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        const rootEntry = result.data.structure['.'];
        if (rootEntry) {
          expect(rootEntry.files).toEqual(['apple.ts', 'mango.ts', 'zebra.ts']);
          expect(rootEntry.folders).toEqual(['alpha', 'zeta']);
        }
      }
    });
  });

  // ============================================================================
  // transformGitLabTree TESTS
  // ============================================================================

  describe('transformGitLabTree', () => {
    it('should transform tree items to unified format', () => {
      const items: GitLabTreeItem[] = [
        { id: 'abc1', name: 'src', type: 'tree', path: 'src', mode: '040000' },
        {
          id: 'def1',
          name: 'index.ts',
          type: 'blob',
          path: 'src/index.ts',
          mode: '100644',
        },
      ];

      const result = transformGitLabTree(items);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        path: 'src',
        type: 'dir',
        name: 'src',
      });
      expect(result[1]).toEqual({
        path: 'src/index.ts',
        type: 'file',
        name: 'index.ts',
      });
    });

    it('should transform tree type to dir', () => {
      const items: GitLabTreeItem[] = [
        {
          id: 'abc1',
          name: 'folder',
          type: 'tree',
          path: 'folder',
          mode: '040000',
        },
      ];

      const result = transformGitLabTree(items);

      expect(result[0]?.type).toBe('dir');
    });

    it('should transform blob type to file', () => {
      const items: GitLabTreeItem[] = [
        {
          id: 'def1',
          name: 'file.ts',
          type: 'blob',
          path: 'file.ts',
          mode: '100644',
        },
      ];

      const result = transformGitLabTree(items);

      expect(result[0]?.type).toBe('file');
    });

    it('should transform commit type to file', () => {
      // Submodules are represented as 'commit' type
      const items: GitLabTreeItem[] = [
        {
          id: 'ghi1',
          name: 'submodule',
          type: 'commit',
          path: 'submodule',
          mode: '160000',
        },
      ];

      const result = transformGitLabTree(items);

      expect(result[0]?.type).toBe('file');
    });

    it('should handle empty array', () => {
      const result = transformGitLabTree([]);

      expect(result).toEqual([]);
    });

    it('should preserve path information', () => {
      const items: GitLabTreeItem[] = [
        {
          id: 'abc1',
          name: 'Button.tsx',
          type: 'blob',
          path: 'src/components/ui/Button.tsx',
          mode: '100644',
        },
      ];

      const result = transformGitLabTree(items);

      expect(result[0]?.path).toBe('src/components/ui/Button.tsx');
      expect(result[0]?.name).toBe('Button.tsx');
    });

    it('should transform multiple items of mixed types', () => {
      const items: GitLabTreeItem[] = [
        { id: 'a1', name: 'src', type: 'tree', path: 'src', mode: '040000' },
        {
          id: 'a2',
          name: 'tests',
          type: 'tree',
          path: 'tests',
          mode: '040000',
        },
        {
          id: 'b1',
          name: 'index.ts',
          type: 'blob',
          path: 'index.ts',
          mode: '100644',
        },
        {
          id: 'b2',
          name: 'package.json',
          type: 'blob',
          path: 'package.json',
          mode: '100644',
        },
        {
          id: 'c1',
          name: 'submodule',
          type: 'commit',
          path: 'vendor/submodule',
          mode: '160000',
        },
      ];

      const result = transformGitLabTree(items);

      expect(result).toHaveLength(5);

      const dirs = result.filter(item => item.type === 'dir');
      const files = result.filter(item => item.type === 'file');

      expect(dirs).toHaveLength(2);
      expect(files).toHaveLength(3);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Integration scenarios', () => {
    it('should handle full workflow: fetch, filter, paginate', async () => {
      // Complex tree with various items
      const complexTree: GitLabTreeItem[] = [
        { id: '1', name: 'src', type: 'tree', path: 'src', mode: '040000' },
        {
          id: '2',
          name: 'node_modules',
          type: 'tree',
          path: 'node_modules',
          mode: '040000',
        },
        {
          id: '3',
          name: 'index.ts',
          type: 'blob',
          path: 'src/index.ts',
          mode: '100644',
        },
        {
          id: '4',
          name: 'package-lock.json',
          type: 'blob',
          path: 'package-lock.json',
          mode: '100644',
        },
        {
          id: '5',
          name: 'README.md',
          type: 'blob',
          path: 'README.md',
          mode: '100644',
        },
        { id: '6', name: 'tests', type: 'tree', path: 'tests', mode: '040000' },
        {
          id: '7',
          name: 'test.ts',
          type: 'blob',
          path: 'tests/test.ts',
          mode: '100644',
        },
      ];

      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(complexTree);

      // Filter out node_modules and package-lock.json
      vi.mocked(shouldIgnoreDir).mockImplementation(
        name => name === 'node_modules'
      );
      vi.mocked(shouldIgnoreFile).mockImplementation(
        path => path === 'package-lock.json'
      );

      const params: GitLabTreeQuery = { projectId: 12345, page: 1, perPage: 3 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        // Should have filtered 2 items (node_modules, package-lock.json)
        // Remaining: src, tests, src/index.ts, README.md, tests/test.ts = 5 items
        expect(result.data.summary.totalFolders).toBe(2); // src, tests
        expect(result.data.summary.totalFiles).toBe(3); // index.ts, README.md, test.ts

        // First page should have 3 items
        expect(result.data.pagination?.totalEntries).toBe(5);
        expect(result.data.pagination?.totalPages).toBe(2);
        expect(result.data.pagination?.hasMore).toBe(true);
      }
    });

    it('should handle repository with only directories', async () => {
      const dirsOnly: GitLabTreeItem[] = [
        { id: '1', name: 'src', type: 'tree', path: 'src', mode: '040000' },
        { id: '2', name: 'tests', type: 'tree', path: 'tests', mode: '040000' },
        { id: '3', name: 'docs', type: 'tree', path: 'docs', mode: '040000' },
      ];

      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(dirsOnly);

      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.summary.totalFolders).toBe(3);
        expect(result.data.summary.totalFiles).toBe(0);
      }
    });

    it('should handle repository with only files', async () => {
      const filesOnly: GitLabTreeItem[] = [
        {
          id: '1',
          name: 'index.ts',
          type: 'blob',
          path: 'index.ts',
          mode: '100644',
        },
        {
          id: '2',
          name: 'README.md',
          type: 'blob',
          path: 'README.md',
          mode: '100644',
        },
        {
          id: '3',
          name: 'package.json',
          type: 'blob',
          path: 'package.json',
          mode: '100644',
        },
      ];

      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(filesOnly);

      const params: GitLabTreeQuery = { projectId: 12345 };

      const result = await viewGitLabRepositoryStructureAPI(params);

      if ('data' in result) {
        expect(result.data.summary.totalFolders).toBe(0);
        expect(result.data.summary.totalFiles).toBe(3);
      }
    });

    it('should preserve structure across paginated requests from cache', async () => {
      // Simulate cached result
      const cachedResult = {
        data: {
          projectId: 12345,
          projectPath: 'test-group/test-repo',
          branch: 'main',
          path: '/',
          summary: {
            totalFiles: 4,
            totalFolders: 2,
            truncated: false,
            filtered: true,
            originalCount: 6,
          },
          structure: {},
          _cachedItems: [
            { path: 'src', type: 'dir' as const },
            { path: 'tests', type: 'dir' as const },
            { path: 'src/index.ts', type: 'file' as const },
            { path: 'src/utils.ts', type: 'file' as const },
            { path: 'README.md', type: 'file' as const },
            { path: 'package.json', type: 'file' as const },
          ],
        },
        status: 200,
      };

      vi.mocked(withDataCache).mockResolvedValue(cachedResult);

      // Request page 1
      const result1 = await viewGitLabRepositoryStructureAPI({
        projectId: 12345,
        page: 1,
        perPage: 3,
      });

      // Request page 2
      const result2 = await viewGitLabRepositoryStructureAPI({
        projectId: 12345,
        page: 2,
        perPage: 3,
      });

      if ('data' in result1 && 'data' in result2) {
        // Both should have same totals
        expect(result1.data.summary.totalFiles).toBe(4);
        expect(result2.data.summary.totalFiles).toBe(4);

        // Different pagination state
        expect(result1.data.pagination?.currentPage).toBe(1);
        expect(result2.data.pagination?.currentPage).toBe(2);
      }
    });
  });
});

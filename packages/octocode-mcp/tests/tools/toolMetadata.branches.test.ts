/**
 * Branch coverage tests for toolMetadata.ts
 *
 * These tests focus on the uninitialized state branches that are hard to cover
 * in regular tests because module state persists across test runs.
 *
 * Covered branches:
 * - Lines 103-107: getMeta() when METADATA_JSON is null
 * - Lines 245-249: BASE_SCHEMA proxy fallback for 'bulkQuery' when uninitialized
 * - Lines 264-265: GENERIC_ERROR_HINTS proxy fallback when uninitialized
 * - Line 272: isToolAvailableSync returns false when uninitialized
 * - Lines 329-332: TOOL_HINTS get proxy fallback when uninitialized
 * - Lines 344-351: TOOL_HINTS getOwnPropertyDescriptor fallback when uninitialized
 * - Line 367: TOOL_HINTS getOwnPropertyDescriptor returns undefined for unknown prop
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies BEFORE importing the module
vi.mock('../../src/utils/fetchWithRetries.js', () => ({
  fetchWithRetries: vi.fn(),
}));

vi.mock('../../src/session.js', () => ({
  logSessionError: vi.fn(() => Promise.resolve()),
}));

describe('toolMetadata branch coverage - uninitialized state', () => {
  beforeEach(async () => {
    // Reset all modules to get a fresh uninitialized state
    vi.resetModules();

    // Re-mock after reset
    vi.doMock('../../src/utils/fetchWithRetries.js', () => ({
      fetchWithRetries: vi.fn(),
    }));

    vi.doMock('../../src/session.js', () => ({
      logSessionError: vi.fn(() => Promise.resolve()),
    }));
  });

  describe('getMeta() when METADATA_JSON is null (lines 103-107)', () => {
    it('should return empty array when getGenericErrorHintsSync is called before initialization', async () => {
      const { getGenericErrorHintsSync } =
        await import('../../src/tools/toolMetadata.js');

      expect(getGenericErrorHintsSync()).toEqual([]);
    });

    it('should throw error when getDynamicHints is called before initialization', async () => {
      const { getDynamicHints } =
        await import('../../src/tools/toolMetadata.js');

      expect(() => getDynamicHints('anyTool', 'topicsHasResults')).toThrow(
        'Tool metadata not initialized. Call and await initializeToolMetadata() before using tool metadata.'
      );
    });
  });

  describe('BASE_SCHEMA proxy fallback (lines 245-249)', () => {
    it('should return fallback bulkQuery function when uninitialized', async () => {
      const { BASE_SCHEMA } = await import('../../src/tools/toolMetadata.js');

      // Access bulkQuery before initialization
      const bulkQueryFn = BASE_SCHEMA.bulkQuery;
      expect(typeof bulkQueryFn).toBe('function');

      // Call the fallback function
      const result = bulkQueryFn('testTool');
      expect(result).toBe(
        'Research queries for testTool (1-3 queries per call for optimal resource management). Review schema before use for optimal results'
      );
    });

    it('should return empty string for non-bulkQuery properties when uninitialized', async () => {
      const { BASE_SCHEMA } = await import('../../src/tools/toolMetadata.js');

      // Access other properties before initialization
      expect(BASE_SCHEMA.mainResearchGoal).toBe('');
      expect(BASE_SCHEMA.researchGoal).toBe('');
      expect(BASE_SCHEMA.reasoning).toBe('');
    });
  });

  describe('GENERIC_ERROR_HINTS proxy fallback (lines 264-265)', () => {
    it('should return undefined for array methods when uninitialized', async () => {
      const { GENERIC_ERROR_HINTS } =
        await import('../../src/tools/toolMetadata.js');

      // Access the proxy before initialization - it returns an empty array fallback
      expect(GENERIC_ERROR_HINTS.length).toBe(0);
      expect(GENERIC_ERROR_HINTS[0]).toBeUndefined();
    });
  });

  describe('isToolAvailableSync returns false when uninitialized (line 272)', () => {
    it('should return false when METADATA_JSON is null', async () => {
      const { isToolAvailableSync } =
        await import('../../src/tools/toolMetadata.js');

      // Before initialization, should return false
      expect(isToolAvailableSync('githubSearchCode')).toBe(false);
      expect(isToolAvailableSync('anyTool')).toBe(false);
    });
  });

  describe('TOOL_HINTS proxy fallback when uninitialized (lines 329-332)', () => {
    it('should return empty hints for base when uninitialized', async () => {
      const { TOOL_HINTS } = await import('../../src/tools/toolMetadata.js');

      // Access 'base' before initialization
      const baseHints = TOOL_HINTS.base;
      expect(baseHints).toEqual({ hasResults: [], empty: [] });
    });

    it('should return empty hints for any tool when uninitialized', async () => {
      const { TOOL_HINTS } = await import('../../src/tools/toolMetadata.js');

      // Access tool hints before initialization
      const hints = TOOL_HINTS.githubSearchCode;
      expect(hints).toEqual({ hasResults: [], empty: [] });
    });

    it('should return empty hints for non-existent tool when uninitialized', async () => {
      const { TOOL_HINTS } = await import('../../src/tools/toolMetadata.js');

      // Access non-existent tool before initialization
      const hints = TOOL_HINTS.nonExistentTool;
      expect(hints).toEqual({ hasResults: [], empty: [] });
    });
  });

  describe('TOOL_HINTS getOwnPropertyDescriptor fallback (lines 344-351, 367)', () => {
    it('should return descriptor for base when uninitialized', async () => {
      const { TOOL_HINTS } = await import('../../src/tools/toolMetadata.js');

      // getOwnPropertyDescriptor for 'base' when uninitialized
      const descriptor = Object.getOwnPropertyDescriptor(TOOL_HINTS, 'base');
      expect(descriptor).toBeDefined();
      expect(descriptor?.enumerable).toBe(true);
      expect(descriptor?.configurable).toBe(true);
      expect(descriptor?.value).toEqual({ hasResults: [], empty: [] });
    });

    it('should return undefined descriptor for non-base tool when uninitialized', async () => {
      const { TOOL_HINTS } = await import('../../src/tools/toolMetadata.js');

      // getOwnPropertyDescriptor for a tool when uninitialized (line 351 - returns undefined)
      const descriptor = Object.getOwnPropertyDescriptor(
        TOOL_HINTS,
        'githubSearchCode'
      );
      expect(descriptor).toBeUndefined();
    });

    it('should return undefined descriptor for non-existent tool when uninitialized', async () => {
      const { TOOL_HINTS } = await import('../../src/tools/toolMetadata.js');

      // getOwnPropertyDescriptor for non-existent tool when uninitialized
      const descriptor = Object.getOwnPropertyDescriptor(
        TOOL_HINTS,
        'nonExistentTool'
      );
      expect(descriptor).toBeUndefined();
    });
  });

  describe('TOOL_HINTS getOwnPropertyDescriptor returns undefined (line 367)', () => {
    it('should return undefined for non-existent tool after initialization', async () => {
      const mockMetadata = {
        instructions: 'Test',
        prompts: {},
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: 'Goal',
          researchGoal: 'Research',
          reasoning: 'Reason',
          bulkQueryTemplate: 'Query for {toolName}',
        },
        tools: {
          githubSearchCode: {
            name: 'githubSearchCode',
            description: 'Search',
            schema: {},
            hints: { hasResults: [], empty: [] },
          },
        },
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      };

      const { fetchWithRetries } =
        await import('../../src/utils/fetchWithRetries.js');
      vi.mocked(fetchWithRetries).mockResolvedValueOnce(mockMetadata);

      const { initializeToolMetadata, TOOL_HINTS } =
        await import('../../src/tools/toolMetadata.js');

      await initializeToolMetadata();

      // After initialization, getOwnPropertyDescriptor for non-existent tool
      // should return undefined (line 367)
      const descriptor = Object.getOwnPropertyDescriptor(
        TOOL_HINTS,
        'nonExistentTool'
      );
      expect(descriptor).toBeUndefined();
    });
  });

  describe('TOOL_NAMES proxy fallback when uninitialized', () => {
    it('should return static tool names when uninitialized', async () => {
      const { TOOL_NAMES } = await import('../../src/tools/toolMetadata.js');

      // Access tool names before initialization - should use static fallback
      expect(TOOL_NAMES.GITHUB_SEARCH_CODE).toBe('githubSearchCode');
      expect(TOOL_NAMES.GITHUB_FETCH_CONTENT).toBe('githubGetFileContent');
      expect(TOOL_NAMES.PACKAGE_SEARCH).toBe('packageSearch');
    });

    it('should support ownKeys when uninitialized', async () => {
      const { TOOL_NAMES } = await import('../../src/tools/toolMetadata.js');

      const keys = Object.keys(TOOL_NAMES);
      expect(keys).toContain('GITHUB_SEARCH_CODE');
      expect(keys).toContain('GITHUB_FETCH_CONTENT');
    });

    it('should support getOwnPropertyDescriptor when uninitialized', async () => {
      const { TOOL_NAMES } = await import('../../src/tools/toolMetadata.js');

      const descriptor = Object.getOwnPropertyDescriptor(
        TOOL_NAMES,
        'GITHUB_SEARCH_CODE'
      );
      expect(descriptor).toBeDefined();
      expect(descriptor?.value).toBe('githubSearchCode');
    });

    it('should return undefined for non-existent key when uninitialized', async () => {
      const { TOOL_NAMES } = await import('../../src/tools/toolMetadata.js');

      const descriptor = Object.getOwnPropertyDescriptor(
        TOOL_NAMES,
        'NON_EXISTENT'
      );
      expect(descriptor).toBeUndefined();
    });
  });

  describe('getToolHintsSync when uninitialized', () => {
    it('should return empty array when METADATA_JSON is null', async () => {
      const { getToolHintsSync } =
        await import('../../src/tools/toolMetadata.js');

      // Before initialization, should return empty array
      expect(getToolHintsSync('githubSearchCode', 'hasResults')).toEqual([]);
      expect(getToolHintsSync('anyTool', 'empty')).toEqual([]);
    });
  });

  describe('getToolHintsSync ?? fallbacks (lines 285-286)', () => {
    it('should handle missing baseHints resultType with fallback', async () => {
      // Create valid metadata, then test with a non-existent resultType
      const validMetadata = {
        instructions: 'Test',
        prompts: {},
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: 'Goal',
          researchGoal: 'Research',
          reasoning: 'Reason',
          bulkQueryTemplate: 'Query',
        },
        tools: {
          githubSearchCode: {
            name: 'githubSearchCode',
            description: 'Search',
            schema: {},
            hints: { hasResults: ['hint1'], empty: ['hint2'] },
          },
        },
        baseHints: { hasResults: ['baseHint1'], empty: ['baseHint2'] },
        genericErrorHints: [],
      };

      const { fetchWithRetries } =
        await import('../../src/utils/fetchWithRetries.js');
      vi.mocked(fetchWithRetries).mockResolvedValueOnce(validMetadata);

      const { initializeToolMetadata, getToolHintsSync } =
        await import('../../src/tools/toolMetadata.js');

      await initializeToolMetadata();

      // Should return empty array via ?? fallback when resultType doesn't exist
      // @ts-expect-error - testing fallback for non-existent resultType
      const hints = getToolHintsSync('githubSearchCode', 'nonExistentType');
      expect(hints).toEqual([]);
    });
  });

  describe('TOOL_HINTS ownKeys ?? fallback (line 340)', () => {
    it('should return base key even when tools is undefined', async () => {
      const metadataWithNullTools = {
        instructions: 'Test',
        prompts: {},
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: 'Goal',
          researchGoal: 'Research',
          reasoning: 'Reason',
          bulkQueryTemplate: 'Query',
        },
        // tools explicitly set to trigger ?? fallback
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      };

      const { fetchWithRetries } =
        await import('../../src/utils/fetchWithRetries.js');
      vi.mocked(fetchWithRetries).mockResolvedValueOnce(metadataWithNullTools);

      const { initializeToolMetadata, TOOL_HINTS } =
        await import('../../src/tools/toolMetadata.js');

      await initializeToolMetadata();

      const keys = Object.keys(TOOL_HINTS);
      expect(keys).toContain('base');
    });
  });

  describe('TOOL_HINTS getOwnPropertyDescriptor hints ?? fallback (line 332-335)', () => {
    it('should return tool hints with fallback for existing tool', async () => {
      const validMetadata = {
        instructions: 'Test',
        prompts: {},
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: 'Goal',
          researchGoal: 'Research',
          reasoning: 'Reason',
          bulkQueryTemplate: 'Query',
        },
        tools: {
          githubSearchCode: {
            name: 'githubSearchCode',
            description: 'Search',
            schema: {},
            hints: { hasResults: ['toolHint'], empty: ['emptyHint'] },
          },
        },
        baseHints: { hasResults: ['baseResult'], empty: ['baseEmpty'] },
        genericErrorHints: [],
      };

      const { fetchWithRetries } =
        await import('../../src/utils/fetchWithRetries.js');
      vi.mocked(fetchWithRetries).mockResolvedValueOnce(validMetadata);

      const { initializeToolMetadata, TOOL_HINTS } =
        await import('../../src/tools/toolMetadata.js');

      await initializeToolMetadata();

      // getOwnPropertyDescriptor for existing tool should return its hints
      const descriptor = Object.getOwnPropertyDescriptor(
        TOOL_HINTS,
        'githubSearchCode'
      );
      expect(descriptor).toBeDefined();
      expect(descriptor?.value).toEqual({
        hasResults: ['toolHint'],
        empty: ['emptyHint'],
      });

      // Non-existent tool returns undefined (correct behavior per line 342)
      const nonExistentDescriptor = Object.getOwnPropertyDescriptor(
        TOOL_HINTS,
        'nonExistentTool'
      );
      expect(nonExistentDescriptor).toBeUndefined();
    });
  });
});

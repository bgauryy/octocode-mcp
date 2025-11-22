/**
 * Final coverage tests for the remaining uncovered lines in toolMetadata.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock session before importing
vi.mock('../../src/session.js', () => ({
  logSessionError: vi.fn(() => Promise.resolve()),
}));

// Mock fetchWithRetries to control responses
vi.mock('../../src/utils/fetchWithRetries.js');

describe('toolMetadata - Final Coverage for Lines 172-176 and 236-243', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Invalid API Response Validation (lines 172-176)', () => {
    it('should throw error and log when API response missing toolNames', async () => {
      const { fetchWithRetries } = await import(
        '../../src/utils/fetchWithRetries.js'
      );
      const { logSessionError } = await import('../../src/session.js');

      const mockFetch = vi.mocked(fetchWithRetries);

      // Mock invalid response - missing toolNames
      mockFetch.mockResolvedValueOnce({
        instructions: 'test',
        // Missing toolNames!
        baseSchema: {},
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
        prompts: {},
      });

      const { initializeToolMetadata } = await import(
        '../../src/tools/toolMetadata.js'
      );

      // Should throw and log error (lines 172-176)
      await expect(initializeToolMetadata()).rejects.toThrow();
      expect(logSessionError).toHaveBeenCalled();
    });

    it('should throw error when baseSchema is not an object', async () => {
      const { fetchWithRetries } = await import(
        '../../src/utils/fetchWithRetries.js'
      );

      const mockFetch = vi.mocked(fetchWithRetries);

      // Invalid baseSchema (not an object)
      mockFetch.mockResolvedValueOnce({
        instructions: 'test',
        toolNames: { GITHUB_FETCH_CONTENT: 'githubGetFileContent' },
        baseSchema: 'invalid', // Should be object!
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
        prompts: {},
      });

      const { initializeToolMetadata } = await import(
        '../../src/tools/toolMetadata.js'
      );

      await expect(initializeToolMetadata()).rejects.toThrow();
    });

    it('should throw error when baseHints is not an object', async () => {
      const { fetchWithRetries } = await import(
        '../../src/utils/fetchWithRetries.js'
      );

      const mockFetch = vi.mocked(fetchWithRetries);

      mockFetch.mockResolvedValueOnce({
        instructions: 'test',
        toolNames: { GITHUB_FETCH_CONTENT: 'githubGetFileContent' },
        baseSchema: {},
        tools: {},
        baseHints: 'invalid', // Should be object!
        genericErrorHints: [],
        prompts: {},
      });

      const { initializeToolMetadata } = await import(
        '../../src/tools/toolMetadata.js'
      );

      await expect(initializeToolMetadata()).rejects.toThrow();
    });

    it('should throw error when genericErrorHints is not an array', async () => {
      const { fetchWithRetries } = await import(
        '../../src/utils/fetchWithRetries.js'
      );

      const mockFetch = vi.mocked(fetchWithRetries);

      mockFetch.mockResolvedValueOnce({
        instructions: 'test',
        toolNames: { GITHUB_FETCH_CONTENT: 'githubGetFileContent' },
        baseSchema: {},
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: 'invalid', // Should be array!
        prompts: {},
      });

      const { initializeToolMetadata } = await import(
        '../../src/tools/toolMetadata.js'
      );

      await expect(initializeToolMetadata()).rejects.toThrow();
    });

    it('should throw error when prompts is not an object', async () => {
      const { fetchWithRetries } = await import(
        '../../src/utils/fetchWithRetries.js'
      );

      const mockFetch = vi.mocked(fetchWithRetries);

      mockFetch.mockResolvedValueOnce({
        instructions: 'test',
        toolNames: { GITHUB_FETCH_CONTENT: 'githubGetFileContent' },
        baseSchema: {},
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
        prompts: 'invalid', // Should be object!
      });

      const { initializeToolMetadata } = await import(
        '../../src/tools/toolMetadata.js'
      );

      await expect(initializeToolMetadata()).rejects.toThrow();
    });
  });

  describe('TOOL_NAMES Static Fallback (lines 236-243)', () => {
    it('should use STATIC_TOOL_NAMES when metadata not loaded', async () => {
      vi.resetModules();

      // Prevent automatic initialization
      const { fetchWithRetries } = await import(
        '../../src/utils/fetchWithRetries.js'
      );
      vi.mocked(fetchWithRetries).mockRejectedValue(new Error('No init'));

      const { TOOL_NAMES } = await import('../../src/tools/toolMetadata.js');

      // Access getOwnPropertyDescriptor early before initialization
      // This should hit lines 236-243 (STATIC_TOOL_NAMES fallback)
      const desc1 = Object.getOwnPropertyDescriptor(
        TOOL_NAMES,
        'GITHUB_FETCH_CONTENT'
      );
      const desc2 = Object.getOwnPropertyDescriptor(
        TOOL_NAMES,
        'GITHUB_SEARCH_CODE'
      );
      const desc3 = Object.getOwnPropertyDescriptor(
        TOOL_NAMES,
        'GITHUB_SEARCH_REPOSITORIES'
      );
      const desc4 = Object.getOwnPropertyDescriptor(
        TOOL_NAMES,
        'GITHUB_SEARCH_PULL_REQUESTS'
      );
      const desc5 = Object.getOwnPropertyDescriptor(
        TOOL_NAMES,
        'GITHUB_VIEW_REPO_STRUCTURE'
      );

      // All should have descriptors from STATIC_TOOL_NAMES
      expect(desc1).toBeDefined();
      expect(desc1?.enumerable).toBe(true);
      expect(desc1?.configurable).toBe(true);
      expect(typeof desc1?.value).toBe('string');

      expect(desc2).toBeDefined();
      expect(desc3).toBeDefined();
      expect(desc4).toBeDefined();
      expect(desc5).toBeDefined();
    });

    it('should return undefined for non-existent tool names', async () => {
      vi.resetModules();

      const { fetchWithRetries } = await import(
        '../../src/utils/fetchWithRetries.js'
      );
      vi.mocked(fetchWithRetries).mockRejectedValue(new Error('No init'));

      const { TOOL_NAMES } = await import('../../src/tools/toolMetadata.js');

      // Access non-existent tool name
      const desc = Object.getOwnPropertyDescriptor(
        TOOL_NAMES,
        'NON_EXISTENT_TOOL'
      );

      // Should return undefined (line 243)
      expect(desc).toBeUndefined();
    });

    it('should support Object.keys on TOOL_NAMES early', async () => {
      vi.resetModules();

      const { fetchWithRetries } = await import(
        '../../src/utils/fetchWithRetries.js'
      );
      vi.mocked(fetchWithRetries).mockRejectedValue(new Error('No init'));

      const { TOOL_NAMES } = await import('../../src/tools/toolMetadata.js');

      // Object.keys triggers ownKeys and getOwnPropertyDescriptor
      const keys = Object.keys(TOOL_NAMES);

      expect(Array.isArray(keys)).toBe(true);
      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toContain('GITHUB_FETCH_CONTENT');
      expect(keys).toContain('GITHUB_SEARCH_CODE');
    });

    it('should support Object.entries on TOOL_NAMES early', async () => {
      vi.resetModules();

      const { fetchWithRetries } = await import(
        '../../src/utils/fetchWithRetries.js'
      );
      vi.mocked(fetchWithRetries).mockRejectedValue(new Error('No init'));

      const { TOOL_NAMES } = await import('../../src/tools/toolMetadata.js');

      // Object.entries also triggers getOwnPropertyDescriptor
      const entries = Object.entries(TOOL_NAMES);

      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);
    });
  });
});

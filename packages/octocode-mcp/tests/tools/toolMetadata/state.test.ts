import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fetchWithRetries } from '../../../src/utils/http/fetch.js';

vi.mock('../../../src/utils/http/fetch.js');
vi.mock('../../../src/session.js', () => ({
  logSessionError: vi.fn(() => Promise.resolve()),
}));

const mockFetchWithRetries = vi.mocked(fetchWithRetries);

// Valid mock metadata for tests
const mockMetadata = {
  instructions: 'Test instructions',
  prompts: {},
  toolNames: {
    GITHUB_SEARCH_CODE: 'githubSearchCode',
  },
  baseSchema: {
    mainResearchGoal: 'Main goal',
    researchGoal: 'Research goal',
    reasoning: 'Reasoning',
    bulkQueryTemplate: 'Query for {toolName}',
  },
  tools: {
    githubSearchCode: {
      name: 'githubSearchCode',
      description: 'Search code',
      schema: { keyword: 'Keywords to search' },
      hints: {
        hasResults: ['Found results'],
        empty: ['No results'],
      },
    },
  },
  baseHints: {
    hasResults: ['Base result hint'],
    empty: ['Base empty hint'],
  },
  genericErrorHints: ['Error hint'],
};

describe('toolMetadata/state', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initializeToolMetadata', () => {
    it('should initialize metadata from API', async () => {
      const { initializeToolMetadata, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce(mockMetadata);

      await initializeToolMetadata();

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);
      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://octocodeai.com/api/mcpContent',
        { maxRetries: 3, includeVersion: true }
      );
    });

    it('should only initialize once (idempotent)', async () => {
      const { initializeToolMetadata, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValue(mockMetadata);

      await initializeToolMetadata();
      await initializeToolMetadata();
      await initializeToolMetadata();

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent initialization calls', async () => {
      const { initializeToolMetadata, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValue(mockMetadata);

      const promises = [
        initializeToolMetadata(),
        initializeToolMetadata(),
        initializeToolMetadata(),
      ];

      await Promise.all(promises);

      // Should only fetch once despite concurrent calls
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);
    });

    it('should throw on invalid API response', async () => {
      const { initializeToolMetadata, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce({ invalid: 'data' });

      await expect(initializeToolMetadata()).rejects.toThrow();
    });

    it('should throw on network error', async () => {
      const { initializeToolMetadata, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      _resetMetadataState();
      mockFetchWithRetries.mockRejectedValueOnce(new Error('Network error'));

      await expect(initializeToolMetadata()).rejects.toThrow('Network error');
    });
  });

  describe('loadToolContent', () => {
    it('should initialize and return metadata', async () => {
      const { loadToolContent, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce(mockMetadata);

      const result = await loadToolContent();

      expect(result).toBeDefined();
      expect(result.instructions).toBe('Test instructions');
      expect(result.toolNames).toBeDefined();
    });

    it('should return cached metadata on subsequent calls', async () => {
      const { loadToolContent, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce(mockMetadata);

      const result1 = await loadToolContent();
      const result2 = await loadToolContent();

      expect(result1).toBe(result2); // Same frozen object
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);
    });

    it('should transform bulkQueryTemplate to bulkQuery function', async () => {
      const { loadToolContent, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce(mockMetadata);

      const result = await loadToolContent();

      expect(typeof result.baseSchema.bulkQuery).toBe('function');
      expect(result.baseSchema.bulkQuery('testTool')).toBe(
        'Query for testTool'
      );
    });
  });

  describe('getMetadataOrThrow', () => {
    it('should throw when metadata not initialized', async () => {
      const { getMetadataOrThrow, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      _resetMetadataState();

      expect(() => getMetadataOrThrow()).toThrow(
        'Tool metadata not initialized'
      );
    });

    it('should return metadata when initialized', async () => {
      const {
        getMetadataOrThrow,
        initializeToolMetadata,
        _resetMetadataState,
      } = await import('../../../src/tools/toolMetadata/state.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce(mockMetadata);
      await initializeToolMetadata();

      const result = getMetadataOrThrow();

      expect(result).toBeDefined();
      expect(result.instructions).toBe('Test instructions');
    });
  });

  describe('getMetadataOrNull', () => {
    it('should return null when metadata not initialized', async () => {
      const { getMetadataOrNull, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      _resetMetadataState();

      expect(getMetadataOrNull()).toBeNull();
    });

    it('should return metadata when initialized', async () => {
      const { getMetadataOrNull, initializeToolMetadata, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce(mockMetadata);
      await initializeToolMetadata();

      const result = getMetadataOrNull();

      expect(result).not.toBeNull();
      expect(result?.instructions).toBe('Test instructions');
    });
  });

  describe('_resetMetadataState', () => {
    it('should reset all state', async () => {
      const { initializeToolMetadata, getMetadataOrNull, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      mockFetchWithRetries.mockResolvedValue(mockMetadata);

      await initializeToolMetadata();
      expect(getMetadataOrNull()).not.toBeNull();

      _resetMetadataState();
      expect(getMetadataOrNull()).toBeNull();
    });

    it('should allow re-initialization after reset', async () => {
      const { initializeToolMetadata, getMetadataOrNull, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      mockFetchWithRetries.mockResolvedValue(mockMetadata);

      await initializeToolMetadata();
      _resetMetadataState();
      await initializeToolMetadata();

      expect(getMetadataOrNull()).not.toBeNull();
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
    });
  });

  describe('metadata freezing', () => {
    it('should freeze metadata to prevent mutations', async () => {
      const { loadToolContent, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce(mockMetadata);

      const result = await loadToolContent();

      expect(Object.isFrozen(result)).toBe(true);
      expect(() => {
        (result as { instructions: string }).instructions = 'mutated';
      }).toThrow();
    });

    it('should deep freeze nested objects', async () => {
      const { loadToolContent, _resetMetadataState } =
        await import('../../../src/tools/toolMetadata/state.js');
      _resetMetadataState();
      mockFetchWithRetries.mockResolvedValueOnce(mockMetadata);

      const result = await loadToolContent();

      expect(Object.isFrozen(result.tools)).toBe(true);
      expect(Object.isFrozen(result.baseHints)).toBe(true);
    });
  });
});

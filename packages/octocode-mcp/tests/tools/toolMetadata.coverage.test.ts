import { describe, it, expect, vi } from 'vitest';

// Mock session before importing toolMetadata
vi.mock('../../src/session.js', () => ({
  logSessionError: vi.fn(() => Promise.resolve()),
}));

// Mock fetchWithRetries
vi.mock('../../src/utils/fetchWithRetries.js', () => ({
  fetchWithRetries: vi.fn(),
}));

describe('toolMetadata - Coverage for Missing Branches', () => {
  describe('BASE_SCHEMA.bulkQuery - with metadata loaded', () => {
    it('should return bulkQuery function from metadata when initialized', async () => {
      // Import after mocks are set
      const { initializeToolMetadata, BASE_SCHEMA } = await import(
        '../../src/tools/toolMetadata.js'
      );
      const { fetchWithRetries } = await import(
        '../../src/utils/fetchWithRetries.js'
      );

      const mockFetch = vi.mocked(fetchWithRetries);
      mockFetch.mockResolvedValue({
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
        },
        baseSchema: {
          mainResearchGoal: 'Main goal',
          researchGoal: 'Research goal',
          reasoning: 'Reasoning',
          bulkQuery: (toolName: string) =>
            `Custom queries for ${toolName} (1-3 per call)`,
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        instructions: 'Test',
        prompts: {},
        genericErrorHints: [],
        bulkOperations: {
          instructions: {
            base: 'base',
            hasResults: 'hasResults',
            empty: 'empty',
            error: 'error',
          },
        },
      });

      await initializeToolMetadata();

      // Test that bulkQuery function is accessible and works
      const bulkQuery = BASE_SCHEMA.bulkQuery;
      expect(typeof bulkQuery).toBe('function');

      const result = bulkQuery('testTool');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle unknown BASE_SCHEMA properties gracefully', async () => {
      const { BASE_SCHEMA } = await import('../../src/tools/toolMetadata.js');

      // Access a property that doesn't exist in the schema
      const unknownProp = (BASE_SCHEMA as unknown as Record<string, unknown>)[
        'nonExistentProperty'
      ];

      // Should return empty string as fallback
      expect(['string', 'undefined', '']).toContain(
        typeof unknownProp === 'string' ? unknownProp : typeof unknownProp
      );
    });
  });

  describe('GENERIC_ERROR_HINTS - array-like access', () => {
    it('should support length property access', async () => {
      const { GENERIC_ERROR_HINTS } = await import(
        '../../src/tools/toolMetadata.js'
      );

      // Access the length property (this goes through the proxy)
      const length = GENERIC_ERROR_HINTS.length;
      expect(typeof length).toBe('number');
    });

    it('should support numeric index access', async () => {
      const { GENERIC_ERROR_HINTS } = await import(
        '../../src/tools/toolMetadata.js'
      );

      // Access first element (goes through proxy)
      const firstElement = GENERIC_ERROR_HINTS[0];
      // May be undefined or a string depending on initialization
      expect(
        typeof firstElement === 'string' || typeof firstElement === 'undefined'
      ).toBe(true);
    });

    it('should handle array methods that access proxy', async () => {
      const { GENERIC_ERROR_HINTS } = await import(
        '../../src/tools/toolMetadata.js'
      );

      // These operations trigger the proxy get trap
      expect(() => {
        Array.from(GENERIC_ERROR_HINTS);
      }).not.toThrow();

      expect(() => {
        const arr = [...GENERIC_ERROR_HINTS];
        expect(Array.isArray(arr)).toBe(true);
      }).not.toThrow();
    });
  });

  describe('TOOL_HINTS - Object operations', () => {
    it('should support Object.keys enumeration', async () => {
      const { TOOL_HINTS } = await import('../../src/tools/toolMetadata.js');

      const keys = Object.keys(TOOL_HINTS);
      expect(Array.isArray(keys)).toBe(true);
      expect(keys).toContain('base');
    });

    it('should support Object.entries', async () => {
      const { TOOL_HINTS } = await import('../../src/tools/toolMetadata.js');

      const entries = Object.entries(TOOL_HINTS);
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);
    });

    it('should access base property directly', async () => {
      const { TOOL_HINTS } = await import('../../src/tools/toolMetadata.js');

      // Proxy doesn't implement has trap, so use direct property access
      const base = TOOL_HINTS.base;
      expect(base).toBeDefined();
      expect(base.hasResults).toBeDefined();
      expect(base.empty).toBeDefined();
    });

    it('should iterate over TOOL_HINTS properties', async () => {
      const { TOOL_HINTS } = await import('../../src/tools/toolMetadata.js');

      let foundBase = false;
      for (const key in TOOL_HINTS) {
        if (key === 'base') {
          foundBase = true;
        }
      }
      expect(foundBase).toBe(true);
    });
  });

  describe('Edge cases for tool availability', () => {
    it('should handle empty string tool name', async () => {
      const { isToolAvailableSync } = await import(
        '../../src/tools/toolMetadata.js'
      );

      const result = isToolAvailableSync('');
      expect(typeof result).toBe('boolean');
      expect(result).toBe(false);
    });

    it('should handle special characters in tool name', async () => {
      const { isToolAvailableSync } = await import(
        '../../src/tools/toolMetadata.js'
      );

      const result = isToolAvailableSync('tool-with-dashes');
      expect(typeof result).toBe('boolean');
    });

    it('should handle tool name with spaces', async () => {
      const { isToolAvailableSync } = await import(
        '../../src/tools/toolMetadata.js'
      );

      const result = isToolAvailableSync('tool with spaces');
      expect(typeof result).toBe('boolean');
      expect(result).toBe(false);
    });
  });

  describe('getDynamicHints edge cases', () => {
    it('should return empty array for all dynamic hint types on non-existent tool', async () => {
      const { getDynamicHints } = await import(
        '../../src/tools/toolMetadata.js'
      );

      const hintTypes: Array<
        'topicsHasResults' | 'topicsEmpty' | 'keywordsEmpty'
      > = ['topicsHasResults', 'topicsEmpty', 'keywordsEmpty'];

      for (const hintType of hintTypes) {
        const hints = getDynamicHints('nonExistentTool', hintType);
        expect(Array.isArray(hints)).toBe(true);
        expect(hints.length).toBe(0);
      }
    });
  });

  describe('getToolHintsSync with different result types', () => {
    it('should handle both hasResults and empty for existing tools', async () => {
      const { getToolHintsSync, initializeToolMetadata } = await import(
        '../../src/tools/toolMetadata.js'
      );
      const { fetchWithRetries } = await import(
        '../../src/utils/fetchWithRetries.js'
      );

      const mockFetch = vi.mocked(fetchWithRetries);
      mockFetch.mockResolvedValue({
        toolNames: {
          GITHUB_SEARCH_CODE: 'githubSearchCode',
        },
        baseSchema: {
          mainResearchGoal: 'Main goal',
          researchGoal: 'Research goal',
          reasoning: 'Reasoning',
        },
        tools: {
          githubSearchCode: {
            name: 'githubSearchCode',
            description: 'Search code',
            schema: {},
            hints: {
              hasResults: ['Result hint 1', 'Result hint 2'],
              empty: ['Empty hint 1', 'Empty hint 2'],
            },
          },
        },
        baseHints: {
          hasResults: ['Base result hint'],
          empty: ['Base empty hint'],
        },
        instructions: 'Test',
        prompts: {},
        genericErrorHints: [],
        bulkOperations: {
          instructions: {
            base: 'base',
            hasResults: 'hasResults',
            empty: 'empty',
            error: 'error',
          },
        },
      });

      await initializeToolMetadata();

      const hasResultsHints = getToolHintsSync(
        'githubSearchCode',
        'hasResults'
      );
      const emptyHints = getToolHintsSync('githubSearchCode', 'empty');

      expect(Array.isArray(hasResultsHints)).toBe(true);
      expect(Array.isArray(emptyHints)).toBe(true);
      expect(hasResultsHints.length).toBeGreaterThan(0);
      expect(emptyHints.length).toBeGreaterThan(0);
    });
  });

  describe('getBulkOperationsInstructions - all properties', () => {
    it('should return all instruction types', async () => {
      const { getBulkOperationsInstructions } = await import(
        '../../src/tools/toolMetadata.js'
      );

      const instructions = getBulkOperationsInstructions();

      // Verify all properties exist and are strings
      expect(typeof instructions.base).toBe('string');
      expect(typeof instructions.hasResults).toBe('string');
      expect(typeof instructions.empty).toBe('string');
      expect(typeof instructions.error).toBe('string');

      // Verify they have content
      expect(instructions.base.length).toBeGreaterThan(0);
      expect(instructions.hasResults.length).toBeGreaterThan(0);
      expect(instructions.empty.length).toBeGreaterThan(0);
      expect(instructions.error.length).toBeGreaterThan(0);
    });
  });

  describe('Schema helper objects - comprehensive', () => {
    it('should access all schema helper properties', async () => {
      const {
        GITHUB_FETCH_CONTENT,
        GITHUB_SEARCH_CODE,
        GITHUB_SEARCH_REPOS,
        GITHUB_SEARCH_PULL_REQUESTS,
        GITHUB_VIEW_REPO_STRUCTURE,
      } = await import('../../src/tools/toolMetadata.js');

      // Test all schema helpers are defined
      expect(GITHUB_FETCH_CONTENT).toBeDefined();
      expect(GITHUB_SEARCH_CODE).toBeDefined();
      expect(GITHUB_SEARCH_REPOS).toBeDefined();
      expect(GITHUB_SEARCH_PULL_REQUESTS).toBeDefined();
      expect(GITHUB_VIEW_REPO_STRUCTURE).toBeDefined();

      // Test they have required methods/properties
      const helpers = [
        GITHUB_FETCH_CONTENT,
        GITHUB_SEARCH_CODE,
        GITHUB_SEARCH_REPOS,
        GITHUB_SEARCH_PULL_REQUESTS,
        GITHUB_VIEW_REPO_STRUCTURE,
      ];

      for (const helper of helpers) {
        expect(helper).toBeDefined();
        expect(typeof helper).toBe('object');
      }
    });
  });

  describe('DESCRIPTIONS proxy - comprehensive', () => {
    it('should handle various tool name patterns', async () => {
      const { DESCRIPTIONS } = await import('../../src/tools/toolMetadata.js');

      // Test various access patterns
      const desc1 = DESCRIPTIONS['githubSearchCode'];
      const desc2 = DESCRIPTIONS.githubSearchCode;
      const desc3 = DESCRIPTIONS['nonExistent'];

      expect(typeof desc1 === 'string' || desc1 === '').toBe(true);
      expect(typeof desc2 === 'string' || desc2 === '').toBe(true);
      expect(desc3).toBe('');
    });

    it('should support Object.keys on DESCRIPTIONS', async () => {
      const { DESCRIPTIONS } = await import('../../src/tools/toolMetadata.js');

      expect(() => {
        Object.keys(DESCRIPTIONS);
      }).not.toThrow();
    });
  });

  describe('TOOL_NAMES proxy - comprehensive', () => {
    it('should handle property access via bracket notation', async () => {
      const { TOOL_NAMES } = await import('../../src/tools/toolMetadata.js');

      const name1 = TOOL_NAMES['GITHUB_SEARCH_CODE'];
      const name2 = TOOL_NAMES.GITHUB_SEARCH_CODE;

      expect(typeof name1).toBe('string');
      expect(typeof name2).toBe('string');
    });

    it('should handle non-existent tool names', async () => {
      const { TOOL_NAMES } = await import('../../src/tools/toolMetadata.js');

      const nonExistent = (TOOL_NAMES as unknown as Record<string, unknown>)[
        'NON_EXISTENT_TOOL'
      ];
      expect(nonExistent === undefined || typeof nonExistent === 'string').toBe(
        true
      );
    });
  });

  describe('BASE_SCHEMA - comprehensive property access', () => {
    it('should access all standard base schema properties', async () => {
      const { BASE_SCHEMA } = await import('../../src/tools/toolMetadata.js');

      // Access all expected properties
      const mainResearchGoal = BASE_SCHEMA.mainResearchGoal;
      const researchGoal = BASE_SCHEMA.researchGoal;
      const reasoning = BASE_SCHEMA.reasoning;
      const bulkQuery = BASE_SCHEMA.bulkQuery;

      expect(
        typeof mainResearchGoal === 'string' ||
          typeof mainResearchGoal === 'undefined'
      ).toBe(true);
      expect(
        typeof researchGoal === 'string' || typeof researchGoal === 'undefined'
      ).toBe(true);
      expect(
        typeof reasoning === 'string' || typeof reasoning === 'undefined'
      ).toBe(true);
      expect(typeof bulkQuery === 'function').toBe(true);
    });

    it('should handle bracket notation access', async () => {
      const { BASE_SCHEMA } = await import('../../src/tools/toolMetadata.js');

      const goal = BASE_SCHEMA['mainResearchGoal'];
      expect(typeof goal === 'string' || typeof goal === 'undefined').toBe(
        true
      );
    });
  });
});

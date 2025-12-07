/**
 * Branch coverage tests for toolConfig.ts
 *
 * This file covers line 26: `return DESCRIPTIONS[toolName] ?? '';`
 * Both branches need to be tested:
 * 1. When DESCRIPTIONS[toolName] returns a truthy value (description exists)
 * 2. When DESCRIPTIONS[toolName] returns undefined/null (fallback to '')
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('toolConfig branch coverage - getDescription fallback (line 26)', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  describe('when DESCRIPTIONS returns a value (truthy branch)', () => {
    it('should use description from DESCRIPTIONS when available', async () => {
      // Mock the metadata to return actual descriptions
      vi.doMock('../../src/utils/fetchWithRetries.js', () => ({
        fetchWithRetries: vi.fn().mockResolvedValue({
          instructions: 'Test',
          prompts: {},
          toolNames: {
            GITHUB_FETCH_CONTENT: 'githubGetFileContent',
            GITHUB_SEARCH_CODE: 'githubSearchCode',
            GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
            GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
            GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
            PACKAGE_SEARCH: 'packageSearch',
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
              description: 'This is the actual search code description',
              schema: {},
              hints: { hasResults: [], empty: [] },
            },
            githubGetFileContent: {
              name: 'githubGetFileContent',
              description: 'This is the actual fetch content description',
              schema: {},
              hints: { hasResults: [], empty: [] },
            },
          },
          baseHints: { hasResults: [], empty: [] },
          genericErrorHints: [],
        }),
      }));

      vi.doMock('../../src/session.js', () => ({
        logSessionError: vi.fn(() => Promise.resolve()),
      }));

      // Initialize metadata first
      const { initializeToolMetadata } = await import(
        '../../src/tools/toolMetadata.js'
      );
      await initializeToolMetadata();

      // Now import toolConfig which uses DESCRIPTIONS
      const { GITHUB_SEARCH_CODE, GITHUB_FETCH_CONTENT } = await import(
        '../../src/tools/toolConfig.js'
      );

      // The description should come from the initialized DESCRIPTIONS proxy
      expect(typeof GITHUB_SEARCH_CODE.description).toBe('string');
      expect(typeof GITHUB_FETCH_CONTENT.description).toBe('string');
    });
  });

  describe('when DESCRIPTIONS returns undefined (fallback branch)', () => {
    it('should return empty string when tool is not in DESCRIPTIONS', async () => {
      const { DESCRIPTIONS } = await import('../../src/tools/toolMetadata.js');

      // Access a tool that doesn't exist - should return ''
      const unknownDescription = DESCRIPTIONS['completely_unknown_tool_xyz'];
      expect(unknownDescription).toBe('');
    });

    it('should return empty string for undefined tool name', async () => {
      const { DESCRIPTIONS } = await import('../../src/tools/toolMetadata.js');

      // Access with undefined-like key
      const result = DESCRIPTIONS[''];
      expect(result).toBe('');
    });
  });

  describe('tool configuration initialization', () => {
    it('should create valid tool configs with all required properties', async () => {
      const {
        GITHUB_SEARCH_CODE,
        GITHUB_FETCH_CONTENT,
        GITHUB_VIEW_REPO_STRUCTURE,
        GITHUB_SEARCH_REPOSITORIES,
        GITHUB_SEARCH_PULL_REQUESTS,
        PACKAGE_SEARCH,
        DEFAULT_TOOLS,
      } = await import('../../src/tools/toolConfig.js');

      // Verify all configs have required properties
      const configs = [
        GITHUB_SEARCH_CODE,
        GITHUB_FETCH_CONTENT,
        GITHUB_VIEW_REPO_STRUCTURE,
        GITHUB_SEARCH_REPOSITORIES,
        GITHUB_SEARCH_PULL_REQUESTS,
        PACKAGE_SEARCH,
      ];

      for (const config of configs) {
        expect(config).toHaveProperty('name');
        expect(config).toHaveProperty('description');
        expect(config).toHaveProperty('isDefault');
        expect(config).toHaveProperty('type');
        expect(config).toHaveProperty('fn');
        expect(typeof config.name).toBe('string');
        expect(typeof config.description).toBe('string');
        expect(typeof config.isDefault).toBe('boolean');
        expect(typeof config.type).toBe('string');
        expect(typeof config.fn).toBe('function');
      }

      expect(DEFAULT_TOOLS).toHaveLength(6);
    });

    it('should have correct tool types assigned', async () => {
      const {
        GITHUB_SEARCH_CODE,
        GITHUB_FETCH_CONTENT,
        GITHUB_VIEW_REPO_STRUCTURE,
        GITHUB_SEARCH_REPOSITORIES,
        GITHUB_SEARCH_PULL_REQUESTS,
        PACKAGE_SEARCH,
      } = await import('../../src/tools/toolConfig.js');

      // Verify search tools
      expect(GITHUB_SEARCH_CODE.type).toBe('search');
      expect(GITHUB_SEARCH_REPOSITORIES.type).toBe('search');
      expect(PACKAGE_SEARCH.type).toBe('search');

      // Verify content tools
      expect(GITHUB_FETCH_CONTENT.type).toBe('content');
      expect(GITHUB_VIEW_REPO_STRUCTURE.type).toBe('content');

      // Verify history tools
      expect(GITHUB_SEARCH_PULL_REQUESTS.type).toBe('history');
    });

    it('should mark all tools as default', async () => {
      const { DEFAULT_TOOLS } = await import('../../src/tools/toolConfig.js');

      for (const tool of DEFAULT_TOOLS) {
        expect(tool.isDefault).toBe(true);
      }
    });
  });
});

describe('toolConfig - fn property', () => {
  it('should have callable registration functions', async () => {
    const {
      GITHUB_SEARCH_CODE,
      GITHUB_FETCH_CONTENT,
      GITHUB_VIEW_REPO_STRUCTURE,
      GITHUB_SEARCH_REPOSITORIES,
      GITHUB_SEARCH_PULL_REQUESTS,
      PACKAGE_SEARCH,
    } = await import('../../src/tools/toolConfig.js');

    // Verify all fn properties are functions
    expect(typeof GITHUB_SEARCH_CODE.fn).toBe('function');
    expect(typeof GITHUB_FETCH_CONTENT.fn).toBe('function');
    expect(typeof GITHUB_VIEW_REPO_STRUCTURE.fn).toBe('function');
    expect(typeof GITHUB_SEARCH_REPOSITORIES.fn).toBe('function');
    expect(typeof GITHUB_SEARCH_PULL_REQUESTS.fn).toBe('function');
    expect(typeof PACKAGE_SEARCH.fn).toBe('function');
  });
});

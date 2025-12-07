import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TOOLS,
  GITHUB_SEARCH_CODE,
  GITHUB_FETCH_CONTENT,
  GITHUB_VIEW_REPO_STRUCTURE,
  GITHUB_SEARCH_REPOSITORIES,
  GITHUB_SEARCH_PULL_REQUESTS,
  PACKAGE_SEARCH,
} from '../../src/tools/toolConfig.js';
import { TOOL_NAMES, DESCRIPTIONS } from '../../src/tools/toolMetadata.js';

describe('Tool Configuration', () => {
  describe('DEFAULT_TOOLS', () => {
    it('should contain all expected tools', () => {
      expect(DEFAULT_TOOLS).toHaveLength(6);

      const toolNames = DEFAULT_TOOLS.map(t => t.name);
      expect(toolNames).toContain(TOOL_NAMES.GITHUB_SEARCH_CODE);
      expect(toolNames).toContain(TOOL_NAMES.GITHUB_FETCH_CONTENT);
      expect(toolNames).toContain(TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE);
      expect(toolNames).toContain(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES);
      expect(toolNames).toContain(TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS);
      expect(toolNames).toContain(TOOL_NAMES.PACKAGE_SEARCH);
    });

    it('should have all tools marked as default', () => {
      DEFAULT_TOOLS.forEach(tool => {
        expect(tool.isDefault).toBe(true);
      });
    });

    it('should have valid tool types', () => {
      const validTypes = ['search', 'content', 'history', 'debug'];
      DEFAULT_TOOLS.forEach(tool => {
        expect(validTypes).toContain(tool.type);
      });
    });
  });

  describe('Individual tool configs', () => {
    it('GITHUB_SEARCH_CODE should have correct config', () => {
      expect(GITHUB_SEARCH_CODE.name).toBe(TOOL_NAMES.GITHUB_SEARCH_CODE);
      expect(GITHUB_SEARCH_CODE.description).toBe(
        DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE]
      );
      expect(GITHUB_SEARCH_CODE.type).toBe('search');
      expect(GITHUB_SEARCH_CODE.fn).toBeTypeOf('function');
    });

    it('GITHUB_FETCH_CONTENT should have correct config', () => {
      expect(GITHUB_FETCH_CONTENT.name).toBe(TOOL_NAMES.GITHUB_FETCH_CONTENT);
      expect(GITHUB_FETCH_CONTENT.description).toBe(
        DESCRIPTIONS[TOOL_NAMES.GITHUB_FETCH_CONTENT]
      );
      expect(GITHUB_FETCH_CONTENT.type).toBe('content');
      expect(GITHUB_FETCH_CONTENT.fn).toBeTypeOf('function');
    });

    it('GITHUB_VIEW_REPO_STRUCTURE should have correct config', () => {
      expect(GITHUB_VIEW_REPO_STRUCTURE.name).toBe(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE
      );
      expect(GITHUB_VIEW_REPO_STRUCTURE.description).toBe(
        DESCRIPTIONS[TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]
      );
      expect(GITHUB_VIEW_REPO_STRUCTURE.type).toBe('content');
      expect(GITHUB_VIEW_REPO_STRUCTURE.fn).toBeTypeOf('function');
    });

    it('GITHUB_SEARCH_REPOSITORIES should have correct config', () => {
      expect(GITHUB_SEARCH_REPOSITORIES.name).toBe(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES
      );
      expect(GITHUB_SEARCH_REPOSITORIES.description).toBe(
        DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]
      );
      expect(GITHUB_SEARCH_REPOSITORIES.type).toBe('search');
      expect(GITHUB_SEARCH_REPOSITORIES.fn).toBeTypeOf('function');
    });

    it('GITHUB_SEARCH_PULL_REQUESTS should have correct config', () => {
      expect(GITHUB_SEARCH_PULL_REQUESTS.name).toBe(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS
      );
      expect(GITHUB_SEARCH_PULL_REQUESTS.description).toBe(
        DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]
      );
      expect(GITHUB_SEARCH_PULL_REQUESTS.type).toBe('history');
      expect(GITHUB_SEARCH_PULL_REQUESTS.fn).toBeTypeOf('function');
    });

    it('PACKAGE_SEARCH should have correct config', () => {
      expect(PACKAGE_SEARCH.name).toBe(TOOL_NAMES.PACKAGE_SEARCH);
      expect(PACKAGE_SEARCH.description).toBe(
        DESCRIPTIONS[TOOL_NAMES.PACKAGE_SEARCH]
      );
      expect(PACKAGE_SEARCH.type).toBe('search');
      expect(PACKAGE_SEARCH.fn).toBeTypeOf('function');
    });
  });

  describe('getDescription fallback', () => {
    it('should return empty string for unknown tool names', () => {
      // The DESCRIPTIONS Proxy returns '' for unknown keys via the ?? '' fallback
      // This tests that the fallback works correctly (line 26 branch)
      const unknownKey = 'unknown_tool_that_does_not_exist';
      expect(DESCRIPTIONS[unknownKey]).toBe('');
    });
  });
});

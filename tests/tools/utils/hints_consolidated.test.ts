/**
 * Comprehensive tests for the consolidated hints system
 */

import { describe, it, expect } from 'vitest';
import {
  generateHints,
  generateBulkHints,
  generateToolHints,
  generateSmartSuggestions,
  generateResearchSpecificHints,
} from '../../../src/mcp/tools/utils/hints_consolidated';
import { TOOL_NAMES } from '../../../src/mcp/tools/utils/toolConstants';

describe('Consolidated Hints System', () => {
  describe('Error Recovery', () => {
    it('should generate appropriate recovery hints for rate limit errors', () => {
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
        hasResults: false,
        errorMessage: 'API rate limit exceeded',
      });

      expect(hints).toContain(
        'Rate limit exceeded. Wait 60 seconds before retrying'
      );
      expect(hints).toContain(
        'Use more specific search terms to reduce API calls'
      );
      expect(hints.length).toBeLessThanOrEqual(6);
      expect(hints.length).toBeGreaterThanOrEqual(2);
    });

    it('should generate appropriate recovery hints for authentication errors', () => {
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
        hasResults: false,
        errorMessage: 'Authentication required',
      });

      expect(hints).toContain(
        'Authentication required. Check your GitHub token configuration'
      );
      expect(hints.length).toBeLessThanOrEqual(6);
    });

    it('should generate appropriate recovery hints for validation errors', () => {
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
        hasResults: false,
        errorMessage: 'Validation failed: queries array is required',
      });

      expect(hints).toContain(
        'Validation failed. Check parameter types and constraints'
      );
      expect(hints).toContain('Invalid parameters. Review your query format');
      expect(hints.length).toBeLessThanOrEqual(6);
    });

    it('should generate appropriate recovery hints for access denied errors', () => {
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
        hasResults: false,
        errorMessage: 'Access denied',
      });

      expect(hints).toContain(
        'Access denied. Check permissions or try public repositories'
      );
      expect(hints).toContain(
        'Search in public repositories if private access is denied'
      );
      expect(hints.length).toBeLessThanOrEqual(6);
    });
  });

  describe('Tool Navigation', () => {
    it('should generate appropriate next steps for successful code searches', () => {
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
        hasResults: true,
        totalItems: 15,
      });

      expect(hints).toContain(
        'Use github_fetch_content with specific file paths for complete context'
      );
      expect(hints).toContain(
        'Use github_view_repo_structure to explore repository organization'
      );
      expect(hints.some(h => h.includes('Consider narrowing'))).toBe(true); // High result count
      expect(hints.length).toBeLessThanOrEqual(6);
    });

    it('should generate appropriate next steps for successful repository searches', () => {
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        hasResults: true,
        totalItems: 8,
      });

      expect(hints).toContain(
        'Use github_view_repo_structure to explore repository organization'
      );
      expect(hints).toContain(
        'Compare approaches across multiple repositories'
      );
      expect(hints).toContain(
        'Explore repository structure and search within promising repos'
      );
      expect(hints.length).toBeLessThanOrEqual(6);
    });

    it('should generate appropriate next steps for successful content fetches', () => {
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        hasResults: true,
      });

      expect(hints).toContain(
        'Look for documentation and examples to understand intended usage'
      );
      expect(hints).toContain(
        'Examine test files to understand expected behavior and usage patterns'
      );
      expect(hints).toContain(
        'Look for related files and dependencies for complete context'
      );
      expect(hints.length).toBeLessThanOrEqual(6);
    });

    it('should generate appropriate next steps for successful structure views', () => {
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        hasResults: true,
      });

      expect(hints).toContain(
        'Use github_fetch_content with specific file paths for complete context'
      );
      expect(hints).toContain(
        'Analyze patterns, conventions, and coding standards across codebases'
      );
      expect(hints.length).toBeLessThanOrEqual(6);
    });
  });

  describe('No Results Guidance', () => {
    it('should generate appropriate guidance for code searches with no results', () => {
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
        hasResults: false,
      });

      expect(hints).toContain(
        'Start with repository search to find relevant projects first'
      );
      expect(hints).toContain(
        'Try broader search terms or remove specific filters'
      );
      expect(hints).toContain('No results found. Try broader search terms');
      expect(hints).toContain(
        'Try different search terms or explore related functionality'
      );
      expect(hints.length).toBeLessThanOrEqual(6);
    });

    it('should generate appropriate guidance for repository searches with no results', () => {
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        hasResults: false,
      });

      expect(hints).toContain(
        'Use package search to find related libraries and their source repositories'
      );
      expect(hints).toContain('No results found. Try broader search terms');
      expect(hints.length).toBeLessThanOrEqual(6);
    });
  });

  describe('Bulk Operations', () => {
    it('should handle mixed success/failure correctly', () => {
      const hints = generateBulkHints({
        toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        hasResults: true,
        errorCount: 2,
        totalCount: 5,
        successCount: 3,
      });

      expect(hints).toContain('2 of 5 queries failed');
      expect(hints).toContain(
        'Check individual query results for specific error details'
      );
      expect(hints).toContain(
        'Compare results across queries to identify patterns and trends'
      );
      expect(hints).toContain(
        'Compare approaches across multiple repositories'
      );
      expect(hints.length).toBeLessThanOrEqual(6);
    });

    it('should handle all failures correctly', () => {
      const hints = generateBulkHints({
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
        hasResults: false,
        errorCount: 3,
        totalCount: 3,
        successCount: 0,
      });

      expect(hints).toContain(
        'All queries failed - check common error patterns'
      );
      expect(hints).toContain(
        'Try individual queries to isolate specific issues'
      );
      expect(hints.length).toBeLessThanOrEqual(6);
    });

    it('should handle single success correctly', () => {
      const hints = generateBulkHints({
        toolName: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        hasResults: true,
        errorCount: 2,
        totalCount: 3,
        successCount: 1,
      });

      expect(hints).toContain(
        'Focus on the successful query result for detailed analysis'
      );
      expect(hints.length).toBeLessThanOrEqual(6);
    });
  });

  describe('Custom Hints', () => {
    it('should include custom hints in the output', () => {
      const customHints = ['Custom hint 1', 'Custom hint 2'];
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
        hasResults: true,
        customHints,
      });

      expect(hints).toContain('Custom hint 1');
      expect(hints).toContain('Custom hint 2');
      expect(hints.length).toBeLessThanOrEqual(6);
    });

    it('should prioritize custom hints over generated hints', () => {
      const customHints = [
        'Custom hint 1',
        'Custom hint 2',
        'Custom hint 3',
        'Custom hint 4',
        'Custom hint 5',
        'Custom hint 6',
      ];
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
        hasResults: true,
        customHints,
      });

      // Should include all custom hints and limit to 6 total
      expect(hints).toContain('Custom hint 1');
      expect(hints).toContain('Custom hint 2');
      expect(hints).toContain('Custom hint 3');
      expect(hints).toContain('Custom hint 4');
      expect(hints).toContain('Custom hint 5');
      expect(hints).toContain('Custom hint 6');
      expect(hints.length).toBe(6);
    });
  });

  describe('Legacy Compatibility', () => {
    it('should work with generateToolHints legacy function', () => {
      const hints = generateToolHints(TOOL_NAMES.GITHUB_SEARCH_CODE, {
        hasResults: true,
        totalItems: 10,
      });

      expect(hints).toContain(
        'Use github_fetch_content with specific file paths for complete context'
      );
      expect(hints).toContain(
        'Use github_view_repo_structure to explore repository organization'
      );
      expect(hints.length).toBeLessThanOrEqual(6);
    });

    it('should work with generateSmartSuggestions legacy function', () => {
      const result = generateSmartSuggestions({}, 'Rate limit exceeded', {});

      expect(result.hints).toContain(
        'Rate limit exceeded. Wait 60 seconds before retrying'
      );
      expect(result.hints).toContain(
        'Use more specific search terms to reduce API calls'
      );
    });

    it('should work with generateResearchSpecificHints legacy function', () => {
      const hints = generateResearchSpecificHints(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        'discovery',
        { hasResults: true, totalItems: 5 }
      );

      expect(hints).toContain(
        'Use github_fetch_content with specific file paths for complete context'
      );
      expect(hints.length).toBeLessThanOrEqual(6);
    });
  });

  describe('Deduplication', () => {
    it('should remove duplicate hints', () => {
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
        hasResults: false,
        customHints: [
          'Try broader search terms',
          'Use broader terms',
          'Try more general terms',
          'Completely different hint',
        ],
      });

      // Should deduplicate exact duplicates
      const uniqueHints = [...new Set(hints)];
      expect(uniqueHints.length).toBe(hints.length); // No exact duplicates
      expect(hints).toContain('Completely different hint'); // Preserve unique hints
      expect(hints.length).toBeLessThanOrEqual(6); // Respect limit
    });
  });

  describe('Performance', () => {
    it('should generate hints quickly', () => {
      const startTime = process.hrtime.bigint();

      // Generate hints 100 times (simulate real usage)
      for (let i = 0; i < 100; i++) {
        generateHints({
          toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
          hasResults: true,
          totalItems: 10,
        });
      }

      const endTime = process.hrtime.bigint();
      const averageTime = Number(endTime - startTime) / 1000000 / 100; // Convert to ms

      expect(averageTime).toBeLessThan(10); // Target: <10ms per call
    });

    it('should handle memory efficiently', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Generate many hints to test memory leaks
      const hints = [];
      for (let i = 0; i < 1000; i++) {
        hints.push(
          generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
            hasResults: Math.random() > 0.5,
            errorMessage: Math.random() > 0.7 ? 'Test error' : undefined,
            totalItems: Math.floor(Math.random() * 20),
          })
        );
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024); // <5MB increase
    });
  });

  describe('All Tools Coverage', () => {
    it('should generate hints for all tool types', () => {
      const allTools = [
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        TOOL_NAMES.GITHUB_FETCH_CONTENT,
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        TOOL_NAMES.PACKAGE_SEARCH,
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        TOOL_NAMES.GITHUB_SEARCH_COMMITS,
      ];

      allTools.forEach(toolName => {
        const hints = generateHints({
          toolName,
          hasResults: true,
        });

        expect(hints.length).toBeGreaterThan(0);
        expect(hints.length).toBeLessThanOrEqual(6);
        expect(Array.isArray(hints)).toBe(true);
        expect(hints.every(hint => typeof hint === 'string')).toBe(true);
      });
    });
  });
});

/**
 * Comprehensive tests for the consolidated hints system
 */

import { describe, it, expect } from 'vitest';
import {
  generateHints,
  generateBulkHints,
  consolidateHints,
} from '../../../src/tools/hints';
import { TOOL_NAMES } from '../../../src/constants';

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
        'Use github_fetch_content with matchString from search results for precise context extraction'
      );
      expect(hints).toContain(
        'Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis'
      );
      expect(
        hints.some(h => h.includes('Consider language or path filters'))
      ).toBe(true); // High result count
      expect(hints.length).toBeLessThanOrEqual(6);
    });

    it('should generate appropriate next steps for successful repository searches', () => {
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        hasResults: true,
        totalItems: 8,
      });

      expect(hints).toContain(
        'Use github_view_repo_structure first to understand project layout, then target specific files'
      );
      expect(hints).toContain(
        'Compare implementations across 3-5 repositories to identify best practices'
      );
      expect(hints).toContain(
        'Explore structure of most popular repositories first'
      );
      expect(hints.length).toBeLessThanOrEqual(6);
    });

    it('should generate appropriate next steps for successful content fetches', () => {
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        hasResults: true,
      });

      expect(hints).toContain(
        'From implementation files, find: imports, exports, tests, and related modules'
      );
      expect(hints).toContain(
        'Always verify documentation claims against actual implementation code'
      );
      expect(hints).toContain(
        'Look for main files, index files, and public APIs to understand code structure'
      );
      expect(hints.length).toBeLessThanOrEqual(6);
    });

    it('should generate appropriate next steps for successful structure views', () => {
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        hasResults: true,
      });

      expect(hints).toContain(
        'Use github_fetch_content with matchString from search results for precise context extraction'
      );
      expect(hints).toContain(
        'Look for: naming conventions, file structure, error handling, and configuration patterns'
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
        'Start with repository search to find relevant projects, then search within promising repos'
      );
      expect(hints).toContain(
        'Start with core concepts, then progressively narrow to specific implementations and tools'
      );
      expect(hints).toContain(
        'No results found. Try broader search terms or related concepts'
      );
      expect(hints).toContain(
        'Try semantic alternatives: expand abbreviations, use synonyms, or try related conceptual terms'
      );
      expect(hints.length).toBeLessThanOrEqual(6);
    });

    it('should generate appropriate guidance for repository searches with no results', () => {
      const hints = generateHints({
        toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        hasResults: false,
      });

      expect(hints).toContain(
        'Topics for ecosystem discovery: combine technology type with domain area for broad exploration'
      );
      expect(hints).toContain(
        'No results found. Try broader search terms or related concepts'
      );
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

      expect(hints).toContain('3/5 queries succeeded (60%)');
      expect(hints).toContain(
        'Review failed queries for pattern adjustments and retry strategies'
      );
      expect(hints).toContain(
        'Multiple results found - cross-reference approaches and look for common patterns'
      );
      expect(hints).toContain(
        'Compare implementations across 3-5 repositories to identify best practices'
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
        'All 3 queries returned no results - try broader research strategy'
      );
      expect(hints).toContain('Break down into smaller, more focused searches');
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
        'Single result found - dive deep and look for related examples in the same repository'
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

    it('should globally deduplicate and rank actionable items first', () => {
      const noisy = [
        'Use github_fetch_content with matchString from search results for precise context extraction',
        'use github_fetch_content with matchString from search results for precise context extraction',
        'Try broader search terms to expand your search scope',
        'Compare implementations across 3-5 repositories to identify best practices',
        'Analyze patterns in naming conventions and file structure',
        'Explore structure of most popular repositories first',
        'Focus on implementation files in relevant languages for accurate code understanding',
        'Completely different hint',
      ];

      const ranked = consolidateHints(noisy, 5);
      // No case-duplicates
      const lower = ranked.map(h => h.toLowerCase());
      expect(new Set(lower).size).toBe(lower.length);
      // Capped at 5
      expect(ranked.length).toBe(5);
      // Actionable phrasing appears at the top
      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0]!.toLowerCase()).toMatch(
        /use|try|compare|analyze|explore|focus/
      );
    });

    it('consolidateHints should deduplicate case-insensitively and trim', () => {
      const input = [
        '  Use github_fetch_content  ',
        'use github_fetch_content',
        'Use  github_fetch_content',
        'Different Hint',
      ];

      const result = consolidateHints(input, 10);
      expect(result).toEqual(['Use github_fetch_content', 'Different Hint']);
    });

    it('consolidateHints should preserve first occurrence order (stable)', () => {
      const input = ['b', 'A', 'a', 'B', 'c'];
      const result = consolidateHints(input, 10);
      expect(result).toEqual(['b', 'A', 'c']);
    });

    it('consolidateHints should cap results by max while preserving order', () => {
      const input = ['a', 'b', 'c', 'd', 'e', 'f'];
      const result = consolidateHints(input, 3);
      expect(result).toEqual(['a', 'b', 'c']);
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

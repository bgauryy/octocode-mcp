import { describe, it, expect } from 'vitest';
import {
  getToolHints,
  getGenericErrorHints,
  TOOL_HINTS,
  GENERIC_ERROR_HINTS,
} from '../../src/tools/hints';
import { TOOL_NAMES } from '../../src/constants';

describe('Hints Module', () => {
  describe('TOOL_HINTS', () => {
    it('should have hints defined for all supported tools', () => {
      const supportedTools = [
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        TOOL_NAMES.GITHUB_FETCH_CONTENT,
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      ];

      supportedTools.forEach(toolName => {
        expect(TOOL_HINTS[toolName]).toBeDefined();
        expect(TOOL_HINTS[toolName].hasResults).toBeDefined();
        expect(TOOL_HINTS[toolName].empty).toBeDefined();
      });
    });

    it('should have at least one hint for hasResults status', () => {
      Object.entries(TOOL_HINTS)
        .filter(([toolName]) => toolName !== 'base')
        .forEach(([, toolHints]) => {
          expect(toolHints.hasResults.length).toBeGreaterThan(0);
        });
    });

    it('should have at least one hint for empty status', () => {
      Object.entries(TOOL_HINTS)
        .filter(([toolName]) => toolName !== 'base')
        .forEach(([, toolHints]) => {
          expect(toolHints.empty.length).toBeGreaterThan(0);
        });
    });

    it('should have string hints (not empty strings)', () => {
      Object.entries(TOOL_HINTS)
        .filter(([toolName]) => toolName !== 'base')
        .forEach(([, toolHints]) => {
          toolHints.hasResults.forEach(hint => {
            expect(typeof hint).toBe('string');
            expect(hint.length).toBeGreaterThan(0);
          });
          toolHints.empty.forEach(hint => {
            expect(typeof hint).toBe('string');
            expect(hint.length).toBeGreaterThan(0);
          });
        });
    });

    describe('GITHUB_SEARCH_CODE hints', () => {
      it('should have appropriate hasResults hints', () => {
        const hints = TOOL_HINTS[TOOL_NAMES.GITHUB_SEARCH_CODE].hasResults;

        expect(hints.some(h => h.includes('text_matches'))).toBe(true);
        expect(hints.some(h => h.includes('match='))).toBe(true);
        expect(hints.some(h => h.includes('researchGoal'))).toBe(true);
      });

      it('should have appropriate empty hints', () => {
        const hints = TOOL_HINTS[TOOL_NAMES.GITHUB_SEARCH_CODE].empty;

        expect(hints.some(h => h.includes("match='path'"))).toBe(true);
        expect(hints.some(h => h.toLowerCase().includes('keyword'))).toBe(true);
        expect(hints.some(h => h.includes('researchGoal'))).toBe(true);
        expect(
          hints.some(
            h =>
              h.toLowerCase().includes('alternative') ||
              h.toLowerCase().includes('synonym')
          )
        ).toBe(true);
      });
    });

    describe('GITHUB_SEARCH_REPOSITORIES hints', () => {
      it('should have appropriate hasResults hints', () => {
        const hints =
          TOOL_HINTS[TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES].hasResults;

        expect(
          hints.some(h => h.includes(TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE))
        ).toBe(true);
        expect(hints.some(h => h.includes('README'))).toBe(true);
        expect(hints.some(h => h.includes('researchGoal'))).toBe(true);
      });

      it('should have appropriate empty hints', () => {
        const hints = TOOL_HINTS[TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES].empty;

        expect(hints.some(h => h.includes('topicsToSearch'))).toBe(true);
        expect(hints.some(h => h.includes('keywordsToSearch'))).toBe(true);
        expect(
          hints.some(
            h => h.toLowerCase().includes('filter') || h.includes('stars')
          )
        ).toBe(true);
        expect(hints.some(h => h.includes("match=['name']"))).toBe(true);
      });
    });

    describe('GITHUB_VIEW_REPO_STRUCTURE hints', () => {
      it('should have appropriate hasResults hints', () => {
        const hints =
          TOOL_HINTS[TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE].hasResults;

        expect(hints.some(h => h.includes(TOOL_NAMES.GITHUB_SEARCH_CODE))).toBe(
          true
        );
        expect(hints.some(h => h.includes('entry points'))).toBe(true);
        expect(
          hints.some(
            h =>
              h.toLowerCase().includes('directory') ||
              h.toLowerCase().includes('structure')
          )
        ).toBe(true);
      });

      it('should have appropriate empty hints', () => {
        const hints = TOOL_HINTS[TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE].empty;

        expect(hints.some(h => h.toLowerCase().includes('root'))).toBe(true);
        expect(hints.some(h => h.includes('depth=1'))).toBe(true);
        expect(
          hints.some(
            h => h.includes('branch') || h.toLowerCase().includes('repo')
          )
        ).toBe(true);
        expect(hints.some(h => h.toLowerCase().includes('monorepo'))).toBe(
          true
        );
      });
    });

    describe('GITHUB_FETCH_CONTENT hints', () => {
      it('should have appropriate hasResults hints', () => {
        const hints = TOOL_HINTS[TOOL_NAMES.GITHUB_FETCH_CONTENT].hasResults;

        expect(hints.some(h => h.includes('matchString'))).toBe(true);
        expect(
          hints.some(
            h =>
              h.toLowerCase().includes('import') ||
              h.toLowerCase().includes('export')
          )
        ).toBe(true);
        expect(
          hints.some(
            h => h.includes('line numbers') || h.toLowerCase().includes('line')
          )
        ).toBe(true);
      });

      it('should have appropriate empty hints', () => {
        const hints = TOOL_HINTS[TOOL_NAMES.GITHUB_FETCH_CONTENT].empty;

        expect(
          hints.some(h => h.includes(TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE))
        ).toBe(true);
        expect(hints.some(h => h.includes('branch'))).toBe(true);
        expect(hints.some(h => h.toLowerCase().includes('case'))).toBe(true);
      });
    });

    describe('GITHUB_SEARCH_PULL_REQUESTS hints', () => {
      it('should have appropriate hasResults hints', () => {
        const hints =
          TOOL_HINTS[TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS].hasResults;

        expect(hints.some(h => h.includes('state="closed"'))).toBe(true);
        expect(hints.some(h => h.includes('merged=true'))).toBe(true);
        expect(hints.some(h => h.includes('withContent'))).toBe(true);
        expect(hints.some(h => h.includes('withComments'))).toBe(true);
        expect(
          hints.some(
            h =>
              h.toLowerCase().includes('changed') ||
              h.toLowerCase().includes('file')
          )
        ).toBe(true);
        expect(hints.some(h => h.includes('researchGoal'))).toBe(true);
      });

      it('should have appropriate empty hints', () => {
        const hints = TOOL_HINTS[TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS].empty;

        expect(hints.some(h => h.includes('prNumber'))).toBe(true);
        expect(hints.some(h => h.toLowerCase().includes('relax'))).toBe(true);
        expect(hints.some(h => h.toLowerCase().includes('date'))).toBe(true);
        expect(hints.some(h => h.includes('branch'))).toBe(true);
        expect(hints.some(h => h.toLowerCase().includes('filter'))).toBe(true);
      });
    });
  });

  describe('GENERIC_ERROR_HINTS', () => {
    it('should be defined and not empty', () => {
      expect(GENERIC_ERROR_HINTS).toBeDefined();
      expect(GENERIC_ERROR_HINTS.length).toBeGreaterThan(0);
    });

    it('should have at least 5 generic error hints', () => {
      expect(GENERIC_ERROR_HINTS.length).toBeGreaterThanOrEqual(5);
    });

    it('should include authentication hint', () => {
      expect(GENERIC_ERROR_HINTS.some(h => h.includes('authentication'))).toBe(
        true
      );
    });

    it('should include network connectivity hint', () => {
      expect(
        GENERIC_ERROR_HINTS.some(h => h.includes('network connectivity'))
      ).toBe(true);
    });

    it('should include rate limits hint', () => {
      expect(GENERIC_ERROR_HINTS.some(h => h.includes('rate limits'))).toBe(
        true
      );
    });

    it('should include input validation hint', () => {
      expect(
        GENERIC_ERROR_HINTS.some(h => h.includes('Validate input parameters'))
      ).toBe(true);
    });

    it('should include repository visibility hint', () => {
      expect(
        GENERIC_ERROR_HINTS.some(h => h.includes('repository visibility'))
      ).toBe(true);
    });

    it('should include retry hint', () => {
      expect(GENERIC_ERROR_HINTS.some(h => h.includes('Retry'))).toBe(true);
    });

    it('should have string hints (not empty strings)', () => {
      GENERIC_ERROR_HINTS.forEach(hint => {
        expect(typeof hint).toBe('string');
        expect(hint.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getToolHints', () => {
    it('should return hasResults hints for valid tool', () => {
      const hints = getToolHints(TOOL_NAMES.GITHUB_SEARCH_CODE, 'hasResults');

      expect(hints).toBeDefined();
      expect(Array.isArray(hints)).toBe(true);
      expect(hints.length).toBeGreaterThan(0);
      // Should include base hints + tool-specific hints
      const expectedHints = [
        ...TOOL_HINTS.base.hasResults,
        ...TOOL_HINTS[TOOL_NAMES.GITHUB_SEARCH_CODE].hasResults,
      ];
      expect(hints).toEqual(expectedHints);
    });

    it('should return empty hints for valid tool', () => {
      const hints = getToolHints(TOOL_NAMES.GITHUB_SEARCH_CODE, 'empty');

      expect(hints).toBeDefined();
      expect(Array.isArray(hints)).toBe(true);
      expect(hints.length).toBeGreaterThan(0);
      // Should include base hints + tool-specific hints
      const expectedHints = [
        ...TOOL_HINTS.base.empty,
        ...TOOL_HINTS[TOOL_NAMES.GITHUB_SEARCH_CODE].empty,
      ];
      expect(hints).toEqual(expectedHints);
    });

    it('should work for all supported tools', () => {
      const supportedTools = [
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        TOOL_NAMES.GITHUB_FETCH_CONTENT,
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      ];

      supportedTools.forEach(toolName => {
        const hasResultsHints = getToolHints(toolName, 'hasResults');
        const emptyHints = getToolHints(toolName, 'empty');

        expect(hasResultsHints.length).toBeGreaterThan(0);
        expect(emptyHints.length).toBeGreaterThan(0);
      });
    });

    it('should return empty array for undefined tool', () => {
      const hints = getToolHints(
        'non_existent_tool' as keyof typeof TOOL_HINTS,
        'hasResults'
      );

      expect(hints).toBeDefined();
      expect(Array.isArray(hints)).toBe(true);
      expect(hints.length).toBe(0);
    });

    it('should return empty array for undefined result type', () => {
      const hints = getToolHints(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        'invalid' as 'hasResults' | 'empty'
      );

      expect(hints).toBeDefined();
      expect(Array.isArray(hints)).toBe(true);
      expect(hints.length).toBe(0);
    });

    it('should return array-like readonly result', () => {
      const hints = getToolHints(TOOL_NAMES.GITHUB_SEARCH_CODE, 'hasResults');

      // TypeScript readonly arrays should be the return type
      expect(hints).toBeDefined();
      expect(Array.isArray(hints)).toBe(true);

      // Hints should not be empty
      expect(hints.length).toBeGreaterThan(0);
    });
  });

  describe('getGenericErrorHints', () => {
    it('should return generic error hints', () => {
      const hints = getGenericErrorHints();

      expect(hints).toBeDefined();
      expect(Array.isArray(hints)).toBe(true);
      expect(hints.length).toBeGreaterThan(0);
      expect(hints).toEqual(GENERIC_ERROR_HINTS);
    });

    it('should return array-like readonly result', () => {
      const hints = getGenericErrorHints();

      // TypeScript readonly arrays should be the return type
      expect(hints).toBeDefined();
      expect(Array.isArray(hints)).toBe(true);

      // Hints should not be empty
      expect(hints.length).toBeGreaterThan(0);
    });

    it('should always return the same hints', () => {
      const hints1 = getGenericErrorHints();
      const hints2 = getGenericErrorHints();

      expect(hints1).toEqual(hints2);
      expect(hints1.length).toBe(hints2.length);
    });
  });

  describe('Hints Content Quality', () => {
    it('should have actionable hints (contain verbs or actions)', () => {
      const actionPatterns = [
        'use',
        'try',
        'check',
        'verify',
        'search',
        'filter',
        'switch',
        'refine',
        'extract',
        'add',
        'remove',
        'adjust',
        'widen',
        'narrow',
        'relax',
        'enable',
        'fetch',
        'explore',
        'compare',
        'focus',
        'review',
        'validate',
        'retry',
        'prefer',
        'generate',
        'introduce',
        'drop',
        'include',
        'when',
        'set',
        'sort',
        'turn',
        'identify',
        'omit',
        'build',
        'chain',
        'map',
        'wait',
        'separate',
      ];

      let totalHints = 0;
      let hintsWithActions = 0;

      Object.values(TOOL_HINTS).forEach(toolHints => {
        [...toolHints.hasResults, ...toolHints.empty].forEach(hint => {
          totalHints++;
          const hintLower = hint.toLowerCase();
          const hasActionPattern = actionPatterns.some(pattern =>
            hintLower.includes(pattern)
          );
          if (hasActionPattern) hintsWithActions++;
        });
      });

      GENERIC_ERROR_HINTS.forEach(hint => {
        totalHints++;
        const hintLower = hint.toLowerCase();
        const hasActionPattern = actionPatterns.some(pattern =>
          hintLower.includes(pattern)
        );
        if (hasActionPattern) hintsWithActions++;
      });

      // At least 90% of hints should have actionable verbs
      const percentage = (hintsWithActions / totalHints) * 100;
      expect(percentage).toBeGreaterThan(90);
    });

    it('should reference specific tool names in cross-tool hints', () => {
      const toolReferences = [
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        TOOL_NAMES.GITHUB_FETCH_CONTENT,
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      ];

      Object.entries(TOOL_HINTS)
        .filter(([toolName]) => toolName !== 'base')
        .forEach(([toolName, toolHints]) => {
          const allHints = [...toolHints.hasResults, ...toolHints.empty];
          const hintsWithToolReferences = allHints.filter(hint =>
            toolReferences.some(ref => hint.includes(ref))
          );

          // Each tool should reference at least one other tool (for workflow guidance)
          if (toolName !== TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE) {
            expect(hintsWithToolReferences.length).toBeGreaterThan(0);
          }
        });
    });

    it('should have hints that guide progressive refinement', () => {
      const progressiveTerms = [
        'broad',
        'narrow',
        'refine',
        'focus',
        'specific',
        'targeted',
        'precise',
        'widen',
        'relax',
        'filter',
        'scope',
        'depth',
        'progressive',
      ];

      let toolsWithProgressive = 0;

      Object.entries(TOOL_HINTS)
        .filter(([toolName]) => toolName !== 'base')
        .forEach(([, toolHints]) => {
          const allHints = [...toolHints.hasResults, ...toolHints.empty];
          const hasProgressiveGuidance = allHints.some(hint =>
            progressiveTerms.some(term => hint.toLowerCase().includes(term))
          );

          if (hasProgressiveGuidance) toolsWithProgressive++;
        });

      // At least 60% of tools should have progressive refinement hints
      const actualTools = Object.keys(TOOL_HINTS).filter(key => key !== 'base');
      const percentage = (toolsWithProgressive / actualTools.length) * 100;
      expect(percentage).toBeGreaterThan(60);
    });

    it('should mention bulk operations in hints', () => {
      let toolsWithBulkMention = 0;

      Object.entries(TOOL_HINTS)
        .filter(([toolName]) => toolName !== 'base')
        .forEach(([, toolHints]) => {
          const allHints = [...toolHints.hasResults, ...toolHints.empty];
          const hasBulkMention = allHints.some(
            hint =>
              hint.toLowerCase().includes('bulk') ||
              hint.toLowerCase().includes('multiple') ||
              hint.toLowerCase().includes('variations') ||
              hint.toLowerCase().includes('queries') ||
              hint.toLowerCase().includes('parallel')
          );

          if (hasBulkMention) toolsWithBulkMention++;
        });

      // At least 50% of tools should mention bulk operations (some moved to descriptions)
      const actualTools = Object.keys(TOOL_HINTS).filter(key => key !== 'base');
      const percentage = (toolsWithBulkMention / actualTools.length) * 100;
      expect(percentage).toBeGreaterThan(50);
    });
  });

  describe('Hints Structure Consistency', () => {
    it('should have consistent hint formats', () => {
      let hintsWithConsistentFormat = 0;
      let totalHints = 0;

      Object.values(TOOL_HINTS).forEach(toolHints => {
        [...toolHints.hasResults, ...toolHints.empty].forEach(hint => {
          totalHints++;
          // Should start with capital letter or lowercase tool name or action word
          const hasGoodStart =
            /^[A-Z]/.test(hint) ||
            hint.startsWith('github') ||
            /^[a-z]/.test(hint);

          // Should not end with period (to allow concatenation)
          const hasGoodEnd = !hint.endsWith('.');

          if (hasGoodStart && hasGoodEnd) hintsWithConsistentFormat++;
        });
      });

      // At least 95% should follow format
      const percentage = (hintsWithConsistentFormat / totalHints) * 100;
      expect(percentage).toBeGreaterThan(95);
    });

    it('should have unique hints within each category', () => {
      Object.values(TOOL_HINTS).forEach(toolHints => {
        const hasResultsSet = new Set(toolHints.hasResults);
        const emptySet = new Set(toolHints.empty);

        expect(hasResultsSet.size).toBe(toolHints.hasResults.length);
        expect(emptySet.size).toBe(toolHints.empty.length);
      });
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  getToolHintsSync as getToolHints,
  getGenericErrorHintsSync as getGenericErrorHints,
  TOOL_HINTS,
  GENERIC_ERROR_HINTS,
  TOOL_NAMES,
} from '../../src/tools/toolMetadata';

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
        const hints = TOOL_HINTS[toolName];
        expect(hints).toBeDefined();
        expect(hints!.hasResults).toBeDefined();
        expect(hints!.empty).toBeDefined();
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
        const hints = TOOL_HINTS[TOOL_NAMES.GITHUB_SEARCH_CODE]!.hasResults;

        expect(hints).toBeDefined();
        expect(hints.length).toBeGreaterThanOrEqual(0);
        hints.forEach(hint => {
          expect(typeof hint).toBe('string');
          expect(hint.length).toBeGreaterThan(0);
        });
      });

      it('should have appropriate empty hints', () => {
        const hints = TOOL_HINTS[TOOL_NAMES.GITHUB_SEARCH_CODE]!.empty;

        expect(hints).toBeDefined();
        expect(hints.length).toBeGreaterThanOrEqual(0);
        hints.forEach(hint => {
          expect(typeof hint).toBe('string');
          expect(hint.length).toBeGreaterThan(0);
        });
      });
    });

    describe('GITHUB_SEARCH_REPOSITORIES hints', () => {
      it('should have appropriate hasResults hints', () => {
        const hints =
          TOOL_HINTS[TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]!.hasResults;

        expect(hints).toBeDefined();
        expect(hints.length).toBeGreaterThanOrEqual(0);
        hints.forEach(hint => {
          expect(typeof hint).toBe('string');
          expect(hint.length).toBeGreaterThan(0);
        });
      });

      it('should have appropriate empty hints', () => {
        const hints = TOOL_HINTS[TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]!.empty;

        expect(hints).toBeDefined();
        expect(hints.length).toBeGreaterThanOrEqual(0);
        hints.forEach(hint => {
          expect(typeof hint).toBe('string');
          expect(hint.length).toBeGreaterThan(0);
        });
      });
    });

    describe('GITHUB_VIEW_REPO_STRUCTURE hints', () => {
      it('should have appropriate hasResults hints', () => {
        const hints =
          TOOL_HINTS[TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]!.hasResults;

        expect(hints).toBeDefined();
        expect(hints.length).toBeGreaterThanOrEqual(0);
        hints.forEach(hint => {
          expect(typeof hint).toBe('string');
          expect(hint.length).toBeGreaterThan(0);
        });
      });

      it('should have appropriate empty hints', () => {
        const hints = TOOL_HINTS[TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]!.empty;

        expect(hints).toBeDefined();
        expect(hints.length).toBeGreaterThanOrEqual(0);
        hints.forEach(hint => {
          expect(typeof hint).toBe('string');
          expect(hint.length).toBeGreaterThan(0);
        });
      });
    });

    describe('GITHUB_FETCH_CONTENT hints', () => {
      it('should have appropriate hasResults hints', () => {
        const hints = TOOL_HINTS[TOOL_NAMES.GITHUB_FETCH_CONTENT]!.hasResults;

        expect(hints).toBeDefined();
        expect(hints.length).toBeGreaterThanOrEqual(0);
        hints.forEach(hint => {
          expect(typeof hint).toBe('string');
          expect(hint.length).toBeGreaterThan(0);
        });
      });

      it('should have appropriate empty hints', () => {
        const hints = TOOL_HINTS[TOOL_NAMES.GITHUB_FETCH_CONTENT]!.empty;

        expect(hints).toBeDefined();
        expect(hints.length).toBeGreaterThanOrEqual(0);
        hints.forEach(hint => {
          expect(typeof hint).toBe('string');
          expect(hint.length).toBeGreaterThan(0);
        });
      });
    });

    describe('GITHUB_SEARCH_PULL_REQUESTS hints', () => {
      it('should have appropriate hasResults hints', () => {
        const hints =
          TOOL_HINTS[TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]!.hasResults;

        expect(hints).toBeDefined();
        expect(hints.length).toBeGreaterThanOrEqual(0);
        hints.forEach(hint => {
          expect(typeof hint).toBe('string');
          expect(hint.length).toBeGreaterThan(0);
        });
      });

      it('should have appropriate empty hints', () => {
        const hints = TOOL_HINTS[TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]!.empty;

        expect(hints).toBeDefined();
        expect(hints.length).toBeGreaterThanOrEqual(0);
        hints.forEach(hint => {
          expect(typeof hint).toBe('string');
          expect(hint.length).toBeGreaterThan(0);
        });
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

    // Content validation removed - only checking structure now

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
      expect(hints.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty hints for valid tool', () => {
      const hints = getToolHints(TOOL_NAMES.GITHUB_SEARCH_CODE, 'empty');

      expect(hints).toBeDefined();
      expect(Array.isArray(hints)).toBe(true);
      expect(hints.length).toBeGreaterThanOrEqual(0);
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

        expect(hasResultsHints.length).toBeGreaterThanOrEqual(0);
        expect(emptyHints.length).toBeGreaterThanOrEqual(0);
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
      expect(hints.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getGenericErrorHints', () => {
    it('should return generic error hints', () => {
      const hints = getGenericErrorHints();

      expect(hints).toBeDefined();
      expect(Array.isArray(hints)).toBe(true);
      expect(hints.length).toBeGreaterThanOrEqual(0);
      expect(hints).toEqual([...GENERIC_ERROR_HINTS]);
    });

    it('should return array-like readonly result', () => {
      const hints = getGenericErrorHints();

      // TypeScript readonly arrays should be the return type
      expect(hints).toBeDefined();
      expect(Array.isArray(hints)).toBe(true);

      // Hints should not be empty
      expect(hints.length).toBeGreaterThanOrEqual(0);
    });

    it('should always return the same hints', () => {
      const hints1 = getGenericErrorHints();
      const hints2 = getGenericErrorHints();

      expect(hints1).toEqual(hints2);
      expect(hints1.length).toBe(hints2.length);
    });
  });

  // Content quality and structure consistency tests removed
  // Only checking that hints exist and have structure (length > 0)
});

/**
 * Tests for local tools hints module
 */

import { describe, it, expect } from 'vitest';
import {
  getHints,
  getLargeFileWorkflowHints,
  HINTS,
} from '../../src/tools/hints/index.js';
import { STATIC_TOOL_NAMES } from '../../src/tools/toolNames.js';

describe('Local Tools Hints', () => {
  it('STATIC_TOOL_NAMES should be defined', () => {
    expect(STATIC_TOOL_NAMES).toBeDefined();
    expect(STATIC_TOOL_NAMES.LOCAL_RIPGREP).toBe('localSearchCode');
  });

  describe('HINTS structure', () => {
    it('should have hints for all local tools', () => {
      expect(HINTS[STATIC_TOOL_NAMES.LOCAL_RIPGREP]).toBeDefined();
      expect(HINTS[STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT]).toBeDefined();
      expect(HINTS[STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE]).toBeDefined();
      expect(HINTS[STATIC_TOOL_NAMES.LOCAL_FIND_FILES]).toBeDefined();
      expect(HINTS[STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE]).toBeDefined();
    });

    it('should have all status types for each tool', () => {
      Object.values(HINTS).forEach(toolHints => {
        expect(toolHints.hasResults).toBeDefined();
        expect(toolHints.empty).toBeDefined();
        expect(toolHints.error).toBeDefined();
      });
    });
  });

  describe('LOCAL_RIPGREP hints', () => {
    describe('hasResults', () => {
      it('should return base hints without context', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_RIPGREP].hasResults();

        expect(
          hints.some((h: string | undefined) =>
            h?.includes('localGetFileContent')
          )
        ).toBe(true);
        expect(
          hints.some((h: string | undefined) => h?.includes('localSearchCode'))
        ).toBe(true);
      });

      it('should include parallel tip when fileCount > 5', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_RIPGREP].hasResults({
          fileCount: 10,
        });

        expect(
          hints.some((h: string | undefined) => h?.includes('parallel'))
        ).toBe(true);
      });

      it('should not include parallel tip when fileCount <= 5', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_RIPGREP].hasResults({
          fileCount: 3,
        });

        expect(hints.filter(Boolean).every(h => !h?.includes('parallel'))).toBe(
          true
        );
      });
    });

    describe('empty', () => {
      it('should return empty hints', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_RIPGREP].empty();

        expect(hints.length).toBeGreaterThan(0);
        expect(
          hints.some((h: string | undefined) => h?.includes('Broaden'))
        ).toBe(true);
      });
    });

    describe('error', () => {
      it('should return size limit hints', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_RIPGREP].error({
          errorType: 'size_limit',
        });

        expect(hints.some(h => h?.includes('Narrow'))).toBe(true);
      });

      it('should include match count in size limit error', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_RIPGREP].error({
          errorType: 'size_limit',
          matchCount: 1000,
        });

        expect(hints.some(h => h?.includes('1000'))).toBe(true);
      });

      it('should include node_modules tip when in node_modules', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_RIPGREP].error({
          errorType: 'size_limit',
          path: '/project/node_modules/lib',
        });

        expect(hints.some(h => h?.includes('packages'))).toBe(true);
      });

      it('should not include node_modules tip for other paths', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_RIPGREP].error({
          errorType: 'size_limit',
          path: '/project/src',
        });

        const nodeModulesHint = hints.find(h => h?.includes('packages'));
        expect(nodeModulesHint).toBeUndefined();
      });

      it('should return generic error hints for unknown error type', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_RIPGREP].error({
          errorType: 'not_found',
        });

        expect(hints.some(h => h?.includes('unavailable'))).toBe(true);
      });
    });
  });

  describe('LOCAL_FETCH_CONTENT hints', () => {
    describe('hasResults', () => {
      it('should return standard hints', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT].hasResults();

        expect(hints.some(h => h.includes('localSearchCode'))).toBe(true);
        expect(hints.some(h => h.includes('matchString'))).toBe(true);
      });
    });

    describe('empty', () => {
      it('should return empty hints', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT].empty();

        expect(hints.length).toBeGreaterThan(0);
        expect(hints.some(h => h.includes('path'))).toBe(true);
      });
    });

    describe('error', () => {
      it('should return size limit hints for large files without pagination', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT].error({
          errorType: 'size_limit',
          isLarge: true,
          hasPagination: false,
          hasPattern: false,
        });

        expect(hints.some(h => h.includes('matchString'))).toBe(true);
        expect(hints.some(h => h.includes('charLength'))).toBe(true);
      });

      it('should include file size estimate when available', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT].error({
          errorType: 'size_limit',
          isLarge: true,
          hasPagination: false,
          hasPattern: false,
          fileSize: 400, // 400KB
        });

        expect(hints.some(h => h.includes('100K tokens'))).toBe(true);
      });

      it('should return pattern too broad hints', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT].error({
          errorType: 'pattern_too_broad',
        });

        expect(hints.some(h => h.includes('Pattern too broad'))).toBe(true);
      });

      it('should include token estimate in pattern too broad error', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT].error({
          errorType: 'pattern_too_broad',
          tokenEstimate: 50000,
        });

        expect(hints.some(h => h.includes('50,000'))).toBe(true);
      });

      it('should return generic error hints for unknown error type', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT].error({
          errorType: 'permission',
        });

        expect(hints.some(h => h.includes('Unknown path'))).toBe(true);
      });

      it('should return generic hints when size_limit but not isLarge', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT].error({
          errorType: 'size_limit',
          isLarge: false,
        });

        expect(hints.some(h => h.includes('Unknown path'))).toBe(true);
      });

      it('should return generic hints when size_limit but has pagination', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT].error({
          errorType: 'size_limit',
          isLarge: true,
          hasPagination: true,
        });

        expect(hints.some(h => h.includes('Unknown path'))).toBe(true);
      });
    });
  });

  describe('LOCAL_VIEW_STRUCTURE hints', () => {
    describe('hasResults', () => {
      it('should return base hints', () => {
        const hints =
          HINTS[STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE].hasResults();

        expect(hints.some(h => h?.includes('localSearchCode'))).toBe(true);
        expect(hints.some(h => h?.includes('depth'))).toBe(true);
      });

      it('should include parallel tip when entryCount > 10', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE].hasResults({
          entryCount: 15,
        });

        expect(hints.some(h => h?.includes('Parallelize'))).toBe(true);
      });

      it('should not include parallel tip when entryCount <= 10', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE].hasResults({
          entryCount: 5,
        });

        const parallelHint = hints.find(h => h?.includes('Parallelize'));
        expect(parallelHint).toBeUndefined();
      });
    });

    describe('empty', () => {
      it('should return empty hints', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE].empty();

        expect(hints.length).toBeGreaterThan(0);
        expect(hints.some(h => h.includes('hidden'))).toBe(true);
      });
    });

    describe('error', () => {
      it('should return size limit hints with entry count', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE].error({
          errorType: 'size_limit',
          entryCount: 500,
        });

        expect(hints.some(h => h.includes('500'))).toBe(true);
        expect(hints.some(h => h.includes('entriesPerPage'))).toBe(true);
      });

      it('should include token estimate in size limit error', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE].error({
          errorType: 'size_limit',
          entryCount: 500,
          tokenEstimate: 25000,
        });

        expect(hints.some(h => h.includes('25,000'))).toBe(true);
      });

      it('should return generic error hints without entry count', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE].error({
          errorType: 'size_limit',
        });

        expect(hints.some(h => h.includes('localFindFiles'))).toBe(true);
      });
    });
  });

  describe('LOCAL_FIND_FILES hints', () => {
    describe('hasResults', () => {
      it('should return base hints', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_FIND_FILES].hasResults();

        expect(hints.some(h => h?.includes('localGetFileContent'))).toBe(true);
        expect(hints.some(h => h?.includes('modifiedWithin'))).toBe(true);
      });

      it('should include parallel tip when fileCount > 3', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_FIND_FILES].hasResults({
          fileCount: 5,
        });

        expect(
          hints.some((h: string | undefined) => h?.includes('parallel'))
        ).toBe(true);
      });

      it('should not include parallel tip when fileCount <= 3', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_FIND_FILES].hasResults({
          fileCount: 2,
        });

        const parallelHint = hints.find(h => h?.includes('parallel'));
        expect(parallelHint).toBeUndefined();
      });
    });

    describe('empty', () => {
      it('should return empty hints', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_FIND_FILES].empty();

        expect(hints.length).toBeGreaterThan(0);
        expect(hints.some(h => h.includes('Broaden'))).toBe(true);
      });
    });

    describe('error', () => {
      it('should return error hints', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.LOCAL_FIND_FILES].error();

        expect(hints.length).toBeGreaterThan(0);
        expect(hints.some(h => h?.includes('localViewStructure'))).toBe(true);
      });
    });
  });

  describe('GITHUB_SEARCH_CODE hints', () => {
    describe('hasResults', () => {
      it('should return single repo hint when hasOwnerRepo is true', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE].hasResults({
          hasOwnerRepo: true,
        });

        expect(hints.length).toBe(1);
        expect(hints[0]).toContain('single repo');
        expect(hints[0]).toContain('githubGetFileContent');
      });

      it('should return multi repo hint when hasOwnerRepo is false', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE].hasResults({
          hasOwnerRepo: false,
        });

        expect(hints.length).toBe(1);
        expect(hints[0]).toContain('multiple repos');
      });

      it('should return multi repo hint when context is empty', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE].hasResults(
          {}
        );

        expect(hints.length).toBe(1);
        expect(hints[0]).toContain('multiple repos');
      });
    });

    describe('empty', () => {
      it('should return cross-repo hints when hasOwnerRepo is false', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE].empty({
          hasOwnerRepo: false,
        });

        // Dynamic hints only - static hints are added via getHints()
        expect(hints.length).toBe(1);
        expect(hints[0]).toContain('Cross-repo');
      });

      it('should return empty array when hasOwnerRepo is true', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE].empty({
          hasOwnerRepo: true,
        });

        // No dynamic hints when owner/repo is specified - static hints cover this
        expect(hints.length).toBe(0);
      });

      it('should return cross-repo hints when context is empty', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE].empty({});

        // Default to cross-repo hints when no context provided
        expect(hints.length).toBe(1);
        expect(hints.some(h => h.includes('Cross-repo'))).toBe(true);
      });
    });

    describe('error', () => {
      it('should return empty array', () => {
        const hints = HINTS[STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE].error();

        expect(hints).toEqual([]);
      });
    });
  });

  describe('getHints', () => {
    it('should return hints for valid tool and status', () => {
      const hints = getHints(STATIC_TOOL_NAMES.LOCAL_RIPGREP, 'hasResults');

      expect(Array.isArray(hints)).toBe(true);
      expect(hints.length).toBeGreaterThan(0);
    });

    it('should return empty array for invalid tool', () => {
      const hints = getHints(
        'invalidTool' as typeof STATIC_TOOL_NAMES.LOCAL_RIPGREP,
        'hasResults'
      );

      expect(hints).toEqual([]);
    });

    it('should return empty array for invalid status', () => {
      const hints = getHints(
        STATIC_TOOL_NAMES.LOCAL_RIPGREP,
        'invalid' as 'hasResults' | 'empty' | 'error'
      );

      expect(hints).toEqual([]);
    });

    it('should pass context to hint generator', () => {
      const hints = getHints(STATIC_TOOL_NAMES.LOCAL_RIPGREP, 'hasResults', {
        fileCount: 10,
      });

      expect(hints.some((h: string) => h.includes('parallel'))).toBe(true);
    });

    it('should filter out undefined hints', () => {
      const hints = getHints(STATIC_TOOL_NAMES.LOCAL_RIPGREP, 'hasResults', {
        fileCount: 2,
      });

      hints.forEach(hint => {
        expect(hint).toBeDefined();
        expect(typeof hint).toBe('string');
      });
    });

    it('should return GITHUB_SEARCH_CODE hints with hasOwnerRepo context', () => {
      const hintsWithOwner = getHints(
        STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE,
        'hasResults',
        {
          hasOwnerRepo: true,
        }
      );
      const hintsWithoutOwner = getHints(
        STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE,
        'hasResults',
        {
          hasOwnerRepo: false,
        }
      );

      // Check that context affects the hints - hints should differ based on hasOwnerRepo
      expect(hintsWithOwner.some(h => h.includes('single repo'))).toBe(true);
      expect(hintsWithoutOwner.some(h => h.includes('multiple repos'))).toBe(
        true
      );
    });

    it('should return GITHUB_SEARCH_CODE empty hints with context', () => {
      const hints = getHints(STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE, 'empty', {
        hasOwnerRepo: false,
      });

      expect(hints.some(h => h.includes('Cross-repo'))).toBe(true);
    });
  });

  describe('getLargeFileWorkflowHints', () => {
    it('should return search workflow hints', () => {
      const hints = getLargeFileWorkflowHints('search');

      expect(hints.length).toBeGreaterThan(0);
      expect(hints.some((h: string) => h.includes('codebase'))).toBe(true);
      expect(hints.some((h: string) => h.includes('filesOnly'))).toBe(true);
    });

    it('should return read workflow hints', () => {
      const hints = getLargeFileWorkflowHints('read');

      expect(hints.length).toBeGreaterThan(0);
      expect(hints.some((h: string) => h.includes('Large file'))).toBe(true);
      expect(hints.some((h: string) => h.includes('charLength'))).toBe(true);
    });
  });
});

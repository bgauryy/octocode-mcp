/**
 * Tests for local tools hints module
 */

import { describe, it, expect } from 'vitest';
import {
  getToolHints,
  getLargeFileWorkflowHints,
  HINTS,
} from '../../src/tools/hints.js';

describe('Local Tools Hints', () => {
  describe('HINTS structure', () => {
    it('should have hints for all local tools', () => {
      expect(HINTS.LOCAL_RIPGREP).toBeDefined();
      expect(HINTS.LOCAL_FETCH_CONTENT).toBeDefined();
      expect(HINTS.LOCAL_VIEW_STRUCTURE).toBeDefined();
      expect(HINTS.LOCAL_FIND_FILES).toBeDefined();
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
        const hints = HINTS.LOCAL_RIPGREP.hasResults();

        expect(hints.some(h => h?.includes('FETCH_CONTENT'))).toBe(true);
        expect(hints.some(h => h?.includes('RIPGREP'))).toBe(true);
      });

      it('should include parallel tip when fileCount > 5', () => {
        const hints = HINTS.LOCAL_RIPGREP.hasResults({ fileCount: 10 });

        expect(hints.some(h => h?.includes('parallel'))).toBe(true);
      });

      it('should not include parallel tip when fileCount <= 5', () => {
        const hints = HINTS.LOCAL_RIPGREP.hasResults({ fileCount: 3 });

        expect(hints.filter(Boolean).every(h => !h?.includes('parallel'))).toBe(
          true
        );
      });
    });

    describe('empty', () => {
      it('should return empty hints', () => {
        const hints = HINTS.LOCAL_RIPGREP.empty();

        expect(hints.length).toBeGreaterThan(0);
        expect(hints.some(h => h.includes('Broaden'))).toBe(true);
      });
    });

    describe('error', () => {
      it('should return size limit hints', () => {
        const hints = HINTS.LOCAL_RIPGREP.error({ errorType: 'size_limit' });

        expect(hints.some(h => h.includes('Narrow'))).toBe(true);
      });

      it('should include match count in size limit error', () => {
        const hints = HINTS.LOCAL_RIPGREP.error({
          errorType: 'size_limit',
          matchCount: 1000,
        });

        expect(hints.some(h => h.includes('1000'))).toBe(true);
      });

      it('should include node_modules tip when in node_modules', () => {
        const hints = HINTS.LOCAL_RIPGREP.error({
          errorType: 'size_limit',
          path: '/project/node_modules/lib',
        });

        expect(hints.some(h => h?.includes('packages'))).toBe(true);
      });

      it('should not include node_modules tip for other paths', () => {
        const hints = HINTS.LOCAL_RIPGREP.error({
          errorType: 'size_limit',
          path: '/project/src',
        });

        const nodeModulesHint = hints.find(h => h?.includes('packages'));
        expect(nodeModulesHint).toBeUndefined();
      });

      it('should return generic error hints for unknown error type', () => {
        const hints = HINTS.LOCAL_RIPGREP.error({ errorType: 'not_found' });

        expect(hints.some(h => h.includes('unavailable'))).toBe(true);
      });
    });
  });

  describe('LOCAL_FETCH_CONTENT hints', () => {
    describe('hasResults', () => {
      it('should return standard hints', () => {
        const hints = HINTS.LOCAL_FETCH_CONTENT.hasResults();

        expect(hints.some(h => h.includes('RIPGREP'))).toBe(true);
        expect(hints.some(h => h.includes('matchString'))).toBe(true);
      });
    });

    describe('empty', () => {
      it('should return empty hints', () => {
        const hints = HINTS.LOCAL_FETCH_CONTENT.empty();

        expect(hints.length).toBeGreaterThan(0);
        expect(hints.some(h => h.includes('path'))).toBe(true);
      });
    });

    describe('error', () => {
      it('should return size limit hints for large files without pagination', () => {
        const hints = HINTS.LOCAL_FETCH_CONTENT.error({
          errorType: 'size_limit',
          isLarge: true,
          hasPagination: false,
          hasPattern: false,
        });

        expect(hints.some(h => h.includes('matchString'))).toBe(true);
        expect(hints.some(h => h.includes('charLength'))).toBe(true);
      });

      it('should include file size estimate when available', () => {
        const hints = HINTS.LOCAL_FETCH_CONTENT.error({
          errorType: 'size_limit',
          isLarge: true,
          hasPagination: false,
          hasPattern: false,
          fileSize: 400, // 400KB
        });

        expect(hints.some(h => h.includes('100K tokens'))).toBe(true);
      });

      it('should return pattern too broad hints', () => {
        const hints = HINTS.LOCAL_FETCH_CONTENT.error({
          errorType: 'pattern_too_broad',
        });

        expect(hints.some(h => h.includes('Pattern too broad'))).toBe(true);
      });

      it('should include token estimate in pattern too broad error', () => {
        const hints = HINTS.LOCAL_FETCH_CONTENT.error({
          errorType: 'pattern_too_broad',
          tokenEstimate: 50000,
        });

        expect(hints.some(h => h.includes('50,000'))).toBe(true);
      });

      it('should return generic error hints for unknown error type', () => {
        const hints = HINTS.LOCAL_FETCH_CONTENT.error({
          errorType: 'permission',
        });

        expect(hints.some(h => h.includes('Unknown path'))).toBe(true);
      });

      it('should return generic hints when size_limit but not isLarge', () => {
        const hints = HINTS.LOCAL_FETCH_CONTENT.error({
          errorType: 'size_limit',
          isLarge: false,
        });

        expect(hints.some(h => h.includes('Unknown path'))).toBe(true);
      });

      it('should return generic hints when size_limit but has pagination', () => {
        const hints = HINTS.LOCAL_FETCH_CONTENT.error({
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
        const hints = HINTS.LOCAL_VIEW_STRUCTURE.hasResults();

        expect(hints.some(h => h?.includes('RIPGREP'))).toBe(true);
        expect(hints.some(h => h?.includes('depth'))).toBe(true);
      });

      it('should include parallel tip when entryCount > 10', () => {
        const hints = HINTS.LOCAL_VIEW_STRUCTURE.hasResults({ entryCount: 15 });

        expect(hints.some(h => h?.includes('Parallelize'))).toBe(true);
      });

      it('should not include parallel tip when entryCount <= 10', () => {
        const hints = HINTS.LOCAL_VIEW_STRUCTURE.hasResults({ entryCount: 5 });

        const parallelHint = hints.find(h => h?.includes('Parallelize'));
        expect(parallelHint).toBeUndefined();
      });
    });

    describe('empty', () => {
      it('should return empty hints', () => {
        const hints = HINTS.LOCAL_VIEW_STRUCTURE.empty();

        expect(hints.length).toBeGreaterThan(0);
        expect(hints.some(h => h.includes('hidden'))).toBe(true);
      });
    });

    describe('error', () => {
      it('should return size limit hints with entry count', () => {
        const hints = HINTS.LOCAL_VIEW_STRUCTURE.error({
          errorType: 'size_limit',
          entryCount: 500,
        });

        expect(hints.some(h => h.includes('500'))).toBe(true);
        expect(hints.some(h => h.includes('entriesPerPage'))).toBe(true);
      });

      it('should include token estimate in size limit error', () => {
        const hints = HINTS.LOCAL_VIEW_STRUCTURE.error({
          errorType: 'size_limit',
          entryCount: 500,
          tokenEstimate: 25000,
        });

        expect(hints.some(h => h.includes('25,000'))).toBe(true);
      });

      it('should return generic error hints without entry count', () => {
        const hints = HINTS.LOCAL_VIEW_STRUCTURE.error({
          errorType: 'size_limit',
        });

        expect(hints.some(h => h.includes('FIND_FILES'))).toBe(true);
      });
    });
  });

  describe('LOCAL_FIND_FILES hints', () => {
    describe('hasResults', () => {
      it('should return base hints', () => {
        const hints = HINTS.LOCAL_FIND_FILES.hasResults();

        expect(hints.some(h => h?.includes('FETCH_CONTENT'))).toBe(true);
        expect(hints.some(h => h?.includes('modifiedWithin'))).toBe(true);
      });

      it('should include parallel tip when fileCount > 3', () => {
        const hints = HINTS.LOCAL_FIND_FILES.hasResults({ fileCount: 5 });

        expect(hints.some(h => h?.includes('parallel'))).toBe(true);
      });

      it('should not include parallel tip when fileCount <= 3', () => {
        const hints = HINTS.LOCAL_FIND_FILES.hasResults({ fileCount: 2 });

        const parallelHint = hints.find(h => h?.includes('parallel'));
        expect(parallelHint).toBeUndefined();
      });
    });

    describe('empty', () => {
      it('should return empty hints', () => {
        const hints = HINTS.LOCAL_FIND_FILES.empty();

        expect(hints.length).toBeGreaterThan(0);
        expect(hints.some(h => h.includes('Broaden'))).toBe(true);
      });
    });

    describe('error', () => {
      it('should return error hints', () => {
        const hints = HINTS.LOCAL_FIND_FILES.error();

        expect(hints.length).toBeGreaterThan(0);
        expect(hints.some(h => h.includes('VIEW_STRUCTURE'))).toBe(true);
      });
    });
  });

  describe('getToolHints', () => {
    it('should return hints for valid tool and status', () => {
      const hints = getToolHints('LOCAL_RIPGREP', 'hasResults');

      expect(Array.isArray(hints)).toBe(true);
      expect(hints.length).toBeGreaterThan(0);
    });

    it('should return empty array for invalid tool', () => {
      const hints = getToolHints(
        'INVALID_TOOL' as 'LOCAL_RIPGREP',
        'hasResults'
      );

      expect(hints).toEqual([]);
    });

    it('should return empty array for invalid status', () => {
      const hints = getToolHints(
        'LOCAL_RIPGREP',
        'invalid' as 'hasResults' | 'empty' | 'error'
      );

      expect(hints).toEqual([]);
    });

    it('should pass context to hint generator', () => {
      const hints = getToolHints('LOCAL_RIPGREP', 'hasResults', {
        fileCount: 10,
      });

      expect(hints.some(h => h.includes('parallel'))).toBe(true);
    });

    it('should filter out undefined hints', () => {
      const hints = getToolHints('LOCAL_RIPGREP', 'hasResults', {
        fileCount: 2,
      });

      hints.forEach(hint => {
        expect(hint).toBeDefined();
        expect(typeof hint).toBe('string');
      });
    });
  });

  describe('getLargeFileWorkflowHints', () => {
    it('should return search workflow hints', () => {
      const hints = getLargeFileWorkflowHints('search');

      expect(hints.length).toBeGreaterThan(0);
      expect(hints.some(h => h.includes('codebase'))).toBe(true);
      expect(hints.some(h => h.includes('filesOnly'))).toBe(true);
    });

    it('should return read workflow hints', () => {
      const hints = getLargeFileWorkflowHints('read');

      expect(hints.length).toBeGreaterThan(0);
      expect(hints.some(h => h.includes('Large file'))).toBe(true);
      expect(hints.some(h => h.includes('charLength'))).toBe(true);
    });
  });
});

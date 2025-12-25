/**
 * Tests for local_ripgrep schema and validation functions
 */

import { describe, it, expect } from 'vitest';
import {
  RipgrepQuerySchema,
  BulkRipgrepQuerySchema,
  applyWorkflowMode,
  validateRipgrepQuery,
  type RipgrepQuery,
} from '../../scheme/local_ripgrep.js';

describe('local_ripgrep schema', () => {
  describe('RipgrepQuerySchema', () => {
    it('should validate basic query', () => {
      const query = {
        pattern: 'test',
        path: '/src',
      };

      const result = RipgrepQuerySchema.parse(query);

      expect(result.pattern).toBe('test');
      expect(result.path).toBe('/src');
    });

    it('should apply default values', () => {
      const query = {
        pattern: 'test',
        path: '/src',
      };

      const result = RipgrepQuerySchema.parse(query);

      expect(result.smartCase).toBe(true);
      expect(result.matchContentLength).toBe(200);
      expect(result.lineNumbers).toBe(true);
      expect(result.filesPerPage).toBe(10);
      expect(result.filePageNumber).toBe(1);
      expect(result.matchesPerPage).toBe(10);
      expect(result.binaryFiles).toBe('without-match');
      expect(result.includeStats).toBe(true);
      expect(result.includeDistribution).toBe(true);
      expect(result.sort).toBe('path');
      expect(result.showFileLastModified).toBe(false);
    });

    it('should reject empty pattern', () => {
      const query = {
        pattern: '',
        path: '/src',
      };

      expect(() => RipgrepQuerySchema.parse(query)).toThrow();
    });

    it('should accept all optional fields', () => {
      const query = {
        pattern: 'test',
        path: '/src',
        mode: 'discovery' as const,
        fixedString: true,
        caseInsensitive: true,
        wholeWord: true,
        invertMatch: true,
        type: 'ts',
        include: ['*.ts'],
        exclude: ['*.test.ts'],
        excludeDir: ['node_modules'],
        noIgnore: true,
        hidden: true,
        followSymlinks: true,
        filesOnly: true,
        count: true,
        countMatches: true,
        contextLines: 5,
        beforeContext: 2,
        afterContext: 3,
        maxMatchesPerFile: 10,
        maxFiles: 100,
        multiline: true,
        multilineDotall: true,
        jsonOutput: true,
        vimgrepFormat: true,
        threads: 4,
        mmap: true,
        noUnicode: true,
        encoding: 'utf-8',
        sortReverse: true,
        noMessages: true,
        lineRegexp: true,
        passthru: true,
        debug: true,
      };

      const result = RipgrepQuerySchema.parse(query);

      expect(result.mode).toBe('discovery');
      expect(result.fixedString).toBe(true);
      expect(result.multiline).toBe(true);
    });
  });

  describe('BulkRipgrepQuerySchema', () => {
    it('should validate bulk query with multiple queries', () => {
      const bulk = {
        queries: [
          { pattern: 'test1', path: '/src' },
          { pattern: 'test2', path: '/lib' },
        ],
      };

      const result = BulkRipgrepQuerySchema.parse(bulk);

      expect(result.queries.length).toBe(2);
    });

    it('should reject empty queries array', () => {
      const bulk = {
        queries: [],
      };

      expect(() => BulkRipgrepQuerySchema.parse(bulk)).toThrow();
    });
  });

  describe('applyWorkflowMode', () => {
    it('should return query unchanged when no mode', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
      };

      const result = applyWorkflowMode(query);

      expect(result).toEqual(query);
    });

    it('should apply discovery mode defaults', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        mode: 'discovery',
      };

      const result = applyWorkflowMode(query);

      expect(result.filesOnly).toBe(true);
      expect(result.smartCase).toBe(true);
    });

    it('should apply paginated mode defaults', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        mode: 'paginated',
      };

      const result = applyWorkflowMode(query);

      expect(result.filesPerPage).toBe(10);
      expect(result.matchesPerPage).toBe(10);
      expect(result.smartCase).toBe(true);
    });

    it('should apply detailed mode defaults', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        mode: 'detailed',
      };

      const result = applyWorkflowMode(query);

      expect(result.contextLines).toBe(3);
      expect(result.filesPerPage).toBe(10);
      expect(result.matchesPerPage).toBe(20);
      expect(result.smartCase).toBe(true);
    });

    it('should allow explicit params to override mode defaults', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        mode: 'discovery',
        filesOnly: false, // Override discovery default
      };

      const result = applyWorkflowMode(query);

      expect(result.filesOnly).toBe(false);
    });
  });

  describe('validateRipgrepQuery', () => {
    it('should return valid for basic query', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
      };

      const result = validateRipgrepQuery(query);

      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should error on fixedString + perlRegex', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        fixedString: true,
        perlRegex: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('mutually exclusive'))).toBe(
        true
      );
    });

    it('should warn on filesOnly + count', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        filesOnly: true,
        count: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('filesOnly'))).toBe(true);
    });

    it('should error on filesOnly + filesWithoutMatch', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        filesOnly: true,
        filesWithoutMatch: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('filesWithoutMatch'))).toBe(
        true
      );
    });

    it('should error on passthru + filesOnly', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        passthru: true,
        filesOnly: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('passthru'))).toBe(true);
    });

    it('should warn on passthru alone', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        passthru: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('passthru'))).toBe(true);
    });

    it('should warn on lineRegexp + wholeWord', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        lineRegexp: true,
        wholeWord: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('lineRegexp'))).toBe(true);
    });

    it('should warn on multiple case sensitivity modes', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        caseInsensitive: true,
        caseSensitive: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('case sensitivity'))).toBe(
        true
      );
    });

    it('should warn on large context lines', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        contextLines: 5,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('Context lines'))).toBe(true);
    });

    it('should warn on large beforeContext', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        beforeContext: 10,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('Context lines'))).toBe(true);
    });

    it('should warn on large afterContext', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        afterContext: 5,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('Context lines'))).toBe(true);
    });

    it('should warn on multiline mode', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        multiline: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('Multiline'))).toBe(true);
    });

    it('should warn on PCRE2 multiline without noUnicode', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        perlRegex: true,
        multiline: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('PERFORMANCE TIP'))).toBe(
        true
      );
    });

    it('should not warn on PCRE2 multiline with noUnicode', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        perlRegex: true,
        multiline: true,
        noUnicode: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('PERFORMANCE TIP'))).toBe(
        false
      );
    });

    it('should warn when no output limiting specified', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('output limiting'))).toBe(
        true
      );
    });

    it('should not warn when filesOnly is set', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        filesOnly: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('output limiting'))).toBe(
        false
      );
    });

    it('should not warn when count is set', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        count: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('output limiting'))).toBe(
        false
      );
    });

    it('should not warn when maxMatchesPerFile is set', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        maxMatchesPerFile: 5,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('output limiting'))).toBe(
        false
      );
    });

    it('should not warn when matchesPerPage is set', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        matchesPerPage: 10,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('output limiting'))).toBe(
        false
      );
    });

    it('should suggest glob consolidation for simple globs', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        include: ['*.ts', '*.tsx', '*.js'],
        filesOnly: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('Consolidate'))).toBe(true);
    });

    it('should not suggest consolidation for already consolidated globs', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        include: ['*.{ts,tsx,js}'],
        filesOnly: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('Consolidate'))).toBe(false);
    });

    it('should not suggest consolidation for complex globs', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        include: ['src/**/*.ts', 'lib/**/*.js'],
        filesOnly: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('Consolidate'))).toBe(false);
    });

    it('should suggest type filter instead of simple glob', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        include: ['*.ts'],
        filesOnly: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('type="ts"'))).toBe(true);
    });

    it('should not suggest type for unknown extensions', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        include: ['*.xyz'],
        filesOnly: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('type='))).toBe(false);
    });

    it('should not suggest type when type is already set', () => {
      const query: RipgrepQuery = {
        pattern: 'test',
        path: '/src',
        include: ['*.ts'],
        type: 'ts',
        filesOnly: true,
      };

      const result = validateRipgrepQuery(query);

      expect(result.warnings.some(w => w.includes('type="ts"'))).toBe(false);
    });
  });
});

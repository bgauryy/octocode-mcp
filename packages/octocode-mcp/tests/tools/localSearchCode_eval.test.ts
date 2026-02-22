/**
 * localSearchCode Eval Test Suite
 *
 * Comprehensive evaluation tests covering ALL schema parameters.
 * Tests are designed to validate agent behavior with the localSearchCode tool.
 *
 * Schema Parameters Covered:
 * - Required: pattern, path
 * - Workflow Modes: mode (discovery, paginated, detailed)
 * - Pattern Modes: fixedString, perlRegex
 * - Case Sensitivity: smartCase, caseInsensitive, caseSensitive
 * - Match Behavior: wholeWord, invertMatch, lineRegexp
 * - File Filtering: type, include, exclude, excludeDir, noIgnore, hidden, followSymlinks
 * - Output Control: filesOnly, filesWithoutMatch, count, countMatches
 * - Context: contextLines, beforeContext, afterContext, matchContentLength, lineNumbers, column
 * - Pagination: maxMatchesPerFile, maxFiles, filesPerPage, filePageNumber, matchesPerPage
 * - Advanced: multiline, multilineDotall, binaryFiles, includeStats, includeDistribution
 * - Sorting: sort, sortReverse
 * - Performance: threads, mmap, noUnicode, encoding
 * - Debug: noMessages, passthru, debug, showFileLastModified
 */

import { describe, it, expect } from 'vitest';
import {
  RipgrepQuerySchema,
  applyWorkflowMode,
  validateRipgrepQuery,
  type RipgrepQuery,
} from '../../src/tools/local_ripgrep/scheme.js';

// Helper to create valid queries (includes required researchGoal/reasoning)
const createQuery = (
  overrides: Partial<RipgrepQuery> & { pattern: string; path: string }
): RipgrepQuery =>
  RipgrepQuerySchema.parse({
    researchGoal: 'Eval test',
    reasoning: 'Schema validation',
    ...overrides,
  });

describe('localSearchCode Eval Tests - All Schema Parameters', () => {
  /**
   * ============================================================
   * SECTION 1: REQUIRED PARAMETERS
   * ============================================================
   */
  describe('1. Required Parameters', () => {
    it('1.1 pattern + path - basic search', () => {
      const query = createQuery({
        pattern: 'export',
        path: '/packages/octocode-mcp/src',
      });
      expect(query.pattern).toBe('export');
      expect(query.path).toBe('/packages/octocode-mcp/src');
    });

    it('1.2 pattern - regex pattern', () => {
      const query = createQuery({
        pattern: 'function\\s+\\w+',
        path: '/src',
      });
      expect(query.pattern).toBe('function\\s+\\w+');
    });

    it('1.3 pattern - special characters', () => {
      const query = createQuery({
        pattern: '\\{.*\\}',
        path: '/src',
      });
      expect(query.pattern).toBe('\\{.*\\}');
    });

    it('1.4 pattern - minimum length (1 char)', () => {
      const query = createQuery({
        pattern: 'x',
        path: '/src',
      });
      expect(query.pattern).toBe('x');
    });

    it('1.5 pattern - empty should fail', () => {
      expect(() =>
        createQuery({
          pattern: '',
          path: '/src',
        })
      ).toThrow();
    });
  });

  /**
   * ============================================================
   * SECTION 2: WORKFLOW MODES
   * ============================================================
   */
  describe('2. Workflow Modes (mode parameter)', () => {
    it('2.1 mode=discovery - sets count=true for per-file match counts', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        mode: 'discovery',
      });
      const configured = applyWorkflowMode(query);
      expect(configured.count).toBe(true);
      expect(configured.smartCase).toBe(true);
    });

    it('2.2 mode=paginated - sets pagination defaults', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        mode: 'paginated',
      });
      const configured = applyWorkflowMode(query);
      expect(configured.filesPerPage).toBe(10);
      expect(configured.matchesPerPage).toBe(10);
      expect(configured.smartCase).toBe(true);
    });

    it('2.3 mode=detailed - sets context (schema defaults override mode defaults)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        mode: 'detailed',
      });
      const configured = applyWorkflowMode(query);
      // Note: Schema defaults (matchesPerPage=10) override mode defaults (20)
      // because mode defaults are applied first, then query spreads over them
      expect(configured.contextLines).toBe(3);
      expect(configured.filesPerPage).toBe(10);
      expect(configured.matchesPerPage).toBe(10); // Schema default wins
    });

    it('2.4 mode=discovery with explicit override', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        mode: 'discovery',
        count: false, // explicit override
      });
      const configured = applyWorkflowMode(query);
      // Explicit value should win
      expect(configured.count).toBe(false);
    });

    it('2.5 no mode - returns query unchanged', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
      });
      const configured = applyWorkflowMode(query);
      expect(configured.mode).toBeUndefined();
      expect(configured.filesOnly).toBeUndefined();
    });
  });

  /**
   * ============================================================
   * SECTION 3: PATTERN MODES
   * ============================================================
   */
  describe('3. Pattern Modes', () => {
    it('3.1 fixedString=true - literal search', () => {
      const query = createQuery({
        pattern: 'console.log(',
        path: '/src',
        fixedString: true,
      });
      expect(query.fixedString).toBe(true);
    });

    it('3.2 perlRegex=true - PCRE2 mode', () => {
      const query = createQuery({
        pattern: '(?<=export )\\w+',
        path: '/src',
        perlRegex: true,
      });
      expect(query.perlRegex).toBe(true);
    });

    it('3.3 fixedString + perlRegex - mutual exclusion error', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        fixedString: true,
        perlRegex: true,
      });
      const validation = validateRipgrepQuery(query);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'fixedString and perlRegex are mutually exclusive. Choose one.'
      );
    });
  });

  /**
   * ============================================================
   * SECTION 4: CASE SENSITIVITY
   * ============================================================
   */
  describe('4. Case Sensitivity', () => {
    it('4.1 smartCase=true (default)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
      });
      expect(query.smartCase).toBe(true);
    });

    it('4.2 caseInsensitive=true', () => {
      const query = createQuery({
        pattern: 'TEST',
        path: '/src',
        caseInsensitive: true,
      });
      expect(query.caseInsensitive).toBe(true);
    });

    it('4.3 caseSensitive=true', () => {
      const query = createQuery({
        pattern: 'Test',
        path: '/src',
        caseSensitive: true,
      });
      expect(query.caseSensitive).toBe(true);
    });

    it('4.4 multiple case modes - warning', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        caseInsensitive: true,
        caseSensitive: true,
      });
      const validation = validateRipgrepQuery(query);
      expect(
        validation.warnings.some((w: string) => w.includes('case sensitivity'))
      ).toBe(true);
    });
  });

  /**
   * ============================================================
   * SECTION 5: MATCH BEHAVIOR
   * ============================================================
   */
  describe('5. Match Behavior', () => {
    it('5.1 wholeWord=true', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        wholeWord: true,
      });
      expect(query.wholeWord).toBe(true);
    });

    it('5.2 invertMatch=true - shows non-matching lines', () => {
      const query = createQuery({
        pattern: 'import',
        path: '/src',
        invertMatch: true,
      });
      expect(query.invertMatch).toBe(true);
      const validation = validateRipgrepQuery(query);
      expect(
        validation.warnings.some((w: string) => w.includes('invertMatch'))
      ).toBe(true);
    });

    it('5.3 lineRegexp=true - match entire line', () => {
      const query = createQuery({
        pattern: 'export default',
        path: '/src',
        lineRegexp: true,
      });
      expect(query.lineRegexp).toBe(true);
    });

    it('5.4 lineRegexp + wholeWord - warning', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        lineRegexp: true,
        wholeWord: true,
      });
      const validation = validateRipgrepQuery(query);
      expect(
        validation.warnings.some((w: string) =>
          w.includes('lineRegexp and wholeWord')
        )
      ).toBe(true);
    });
  });

  /**
   * ============================================================
   * SECTION 6: FILE FILTERING
   * ============================================================
   */
  describe('6. File Filtering', () => {
    it('6.1 type - file type filter', () => {
      const query = createQuery({
        pattern: 'export',
        path: '/src',
        type: 'ts',
      });
      expect(query.type).toBe('ts');
    });

    it('6.2 include - glob patterns', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        include: ['*.ts', '*.tsx'],
      });
      expect(query.include).toEqual(['*.ts', '*.tsx']);
    });

    it('6.3 exclude - glob patterns', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        exclude: ['*.test.ts', '*.spec.ts'],
      });
      expect(query.exclude).toEqual(['*.test.ts', '*.spec.ts']);
    });

    it('6.4 excludeDir - directory exclusion', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        excludeDir: ['node_modules', 'dist', '__tests__'],
      });
      expect(query.excludeDir).toEqual(['node_modules', 'dist', '__tests__']);
    });

    it('6.5 noIgnore=true - ignore .gitignore', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        noIgnore: true,
      });
      expect(query.noIgnore).toBe(true);
    });

    it('6.6 hidden=true - search hidden files', () => {
      const query = createQuery({
        pattern: 'config',
        path: '/',
        hidden: true,
      });
      expect(query.hidden).toBe(true);
    });

    it('6.7 followSymlinks=true', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        followSymlinks: true,
      });
      expect(query.followSymlinks).toBe(true);
    });

    it('6.8 include with type warning', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        include: ['*.ts'],
      });
      const validation = validateRipgrepQuery(query);
      expect(
        validation.warnings.some((w: string) => w.includes('TIP: Use type='))
      ).toBe(true);
    });

    it('6.9 multiple include globs - consolidation warning', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        include: ['*.ts', '*.js', '*.tsx'],
      });
      const validation = validateRipgrepQuery(query);
      expect(
        validation.warnings.some((w: string) => w.includes('Consolidate globs'))
      ).toBe(true);
    });
  });

  /**
   * ============================================================
   * SECTION 7: OUTPUT CONTROL
   * ============================================================
   */
  describe('7. Output Control', () => {
    it('7.1 filesOnly=true - return file paths only', () => {
      const query = createQuery({
        pattern: 'export',
        path: '/src',
        filesOnly: true,
      });
      expect(query.filesOnly).toBe(true);
    });

    it('7.2 filesWithoutMatch=true - files without pattern', () => {
      const query = createQuery({
        pattern: 'deprecated',
        path: '/src',
        filesWithoutMatch: true,
      });
      expect(query.filesWithoutMatch).toBe(true);
    });

    it('7.3 count=true - match counts', () => {
      const query = createQuery({
        pattern: 'TODO',
        path: '/src',
        count: true,
      });
      expect(query.count).toBe(true);
    });

    it('7.4 countMatches=true - count all matches', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        countMatches: true,
      });
      expect(query.countMatches).toBe(true);
    });

    it('7.5 filesOnly + count - warning', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        filesOnly: true,
        count: true,
      });
      const validation = validateRipgrepQuery(query);
      expect(
        validation.warnings.some((w: string) =>
          w.includes('filesOnly and count')
        )
      ).toBe(true);
    });

    it('7.6 filesOnly + filesWithoutMatch - error', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        filesOnly: true,
        filesWithoutMatch: true,
      });
      const validation = validateRipgrepQuery(query);
      expect(validation.isValid).toBe(false);
      expect(
        validation.errors.some((e: string) =>
          e.includes('filesOnly and filesWithoutMatch')
        )
      ).toBe(true);
    });

    it('7.7 includeStats=true (default)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
      });
      expect(query.includeStats).toBe(true);
    });

    it('7.8 includeDistribution=true (default)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
      });
      expect(query.includeDistribution).toBe(true);
    });

    it('7.9 showFileLastModified=true', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        showFileLastModified: true,
      });
      expect(query.showFileLastModified).toBe(true);
    });
  });

  /**
   * ============================================================
   * SECTION 8: CONTEXT OPTIONS
   * ============================================================
   */
  describe('8. Context Options', () => {
    it('8.1 contextLines - symmetric context', () => {
      const query = createQuery({
        pattern: 'error',
        path: '/src',
        contextLines: 5,
      });
      expect(query.contextLines).toBe(5);
    });

    it('8.2 beforeContext - lines before match', () => {
      const query = createQuery({
        pattern: 'error',
        path: '/src',
        beforeContext: 3,
      });
      expect(query.beforeContext).toBe(3);
    });

    it('8.3 afterContext - lines after match', () => {
      const query = createQuery({
        pattern: 'error',
        path: '/src',
        afterContext: 2,
      });
      expect(query.afterContext).toBe(2);
    });

    it('8.4 beforeContext + afterContext combined', () => {
      const query = createQuery({
        pattern: 'error',
        path: '/src',
        beforeContext: 5,
        afterContext: 10,
      });
      expect(query.beforeContext).toBe(5);
      expect(query.afterContext).toBe(10);
    });

    it('8.5 contextLines max (50)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        contextLines: 50,
      });
      expect(query.contextLines).toBe(50);
    });

    it('8.6 contextLines exceeds max - should fail', () => {
      expect(() =>
        createQuery({
          pattern: 'test',
          path: '/src',
          contextLines: 51,
        })
      ).toThrow();
    });

    it('8.7 matchContentLength - custom', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        matchContentLength: 500,
      });
      expect(query.matchContentLength).toBe(500);
    });

    it('8.8 matchContentLength default (200)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
      });
      expect(query.matchContentLength).toBe(200);
    });

    it('8.9 matchContentLength max (800)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        matchContentLength: 800,
      });
      expect(query.matchContentLength).toBe(800);
    });

    it('8.10 matchContentLength min (1)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        matchContentLength: 1,
      });
      expect(query.matchContentLength).toBe(1);
    });

    it('8.11 lineNumbers=true (default)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
      });
      expect(query.lineNumbers).toBe(true);
    });

    it('8.12 column=true', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        column: true,
      });
      expect(query.column).toBe(true);
    });

    it('8.13 large context - warning', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        contextLines: 10,
      });
      const validation = validateRipgrepQuery(query);
      expect(
        validation.warnings.some((w: string) => w.includes('Context lines'))
      ).toBe(true);
    });
  });

  /**
   * ============================================================
   * SECTION 9: PAGINATION
   * ============================================================
   */
  describe('9. Pagination', () => {
    it('9.1 maxMatchesPerFile', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        maxMatchesPerFile: 5,
      });
      expect(query.maxMatchesPerFile).toBe(5);
    });

    it('9.2 maxMatchesPerFile max (100)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        maxMatchesPerFile: 100,
      });
      expect(query.maxMatchesPerFile).toBe(100);
    });

    it('9.3 maxFiles', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        maxFiles: 50,
      });
      expect(query.maxFiles).toBe(50);
    });

    it('9.4 maxFiles max (1000)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        maxFiles: 1000,
      });
      expect(query.maxFiles).toBe(1000);
    });

    it('9.5 filesPerPage default (10)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
      });
      expect(query.filesPerPage).toBe(10);
    });

    it('9.6 filesPerPage custom', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        filesPerPage: 5,
      });
      expect(query.filesPerPage).toBe(5);
    });

    it('9.7 filesPerPage max (20)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        filesPerPage: 20,
      });
      expect(query.filesPerPage).toBe(20);
    });

    it('9.8 filesPerPage min (1)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        filesPerPage: 1,
      });
      expect(query.filesPerPage).toBe(1);
    });

    it('9.9 filePageNumber default (1)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
      });
      expect(query.filePageNumber).toBe(1);
    });

    it('9.10 filePageNumber custom', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        filePageNumber: 3,
      });
      expect(query.filePageNumber).toBe(3);
    });

    it('9.11 matchesPerPage default (10)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
      });
      expect(query.matchesPerPage).toBe(10);
    });

    it('9.12 matchesPerPage custom', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        matchesPerPage: 25,
      });
      expect(query.matchesPerPage).toBe(25);
    });

    it('9.13 matchesPerPage max (100)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        matchesPerPage: 100,
      });
      expect(query.matchesPerPage).toBe(100);
    });

    it('9.14 no output limiting - warning', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        matchesPerPage: undefined as unknown as number,
      });
      // Force undefined to test warning
      const testQuery = { ...query, matchesPerPage: undefined };
      const validation = validateRipgrepQuery(
        testQuery as unknown as RipgrepQuery
      );
      expect(
        validation.warnings.some((w: string) =>
          w.includes('No output limiting')
        )
      ).toBe(true);
    });
  });

  /**
   * ============================================================
   * SECTION 10: ADVANCED OPTIONS
   * ============================================================
   */
  describe('10. Advanced Options', () => {
    it('10.1 multiline=true', () => {
      const query = createQuery({
        pattern: 'async.*\\n.*await',
        path: '/src',
        multiline: true,
      });
      expect(query.multiline).toBe(true);
    });

    it('10.2 multilineDotall=true', () => {
      const query = createQuery({
        pattern: 'start.*end',
        path: '/src',
        multiline: true,
        multilineDotall: true,
      });
      expect(query.multilineDotall).toBe(true);
    });

    it('10.3 multiline - warning', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        multiline: true,
      });
      const validation = validateRipgrepQuery(query);
      expect(
        validation.warnings.some((w: string) => w.includes('Multiline mode'))
      ).toBe(true);
    });

    it('10.4 binaryFiles=text', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        binaryFiles: 'text',
      });
      expect(query.binaryFiles).toBe('text');
    });

    it('10.5 binaryFiles=without-match (default)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
      });
      expect(query.binaryFiles).toBe('without-match');
    });

    it('10.6 binaryFiles=binary', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        binaryFiles: 'binary',
      });
      expect(query.binaryFiles).toBe('binary');
    });

    it('10.7 threads custom', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        threads: 8,
      });
      expect(query.threads).toBe(8);
    });

    it('10.8 threads max (32)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        threads: 32,
      });
      expect(query.threads).toBe(32);
    });

    it('10.9 mmap=false', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        mmap: false,
      });
      expect(query.mmap).toBe(false);
    });

    it('10.10 noUnicode=true', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        noUnicode: true,
      });
      expect(query.noUnicode).toBe(true);
    });

    it('10.11 encoding custom', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        encoding: 'utf-16',
      });
      expect(query.encoding).toBe('utf-16');
    });

    it('10.12 perlRegex + multiline + noUnicode - performance tip', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        perlRegex: true,
        multiline: true,
      });
      const validation = validateRipgrepQuery(query);
      expect(
        validation.warnings.some((w: string) => w.includes('PERFORMANCE TIP'))
      ).toBe(true);
    });
  });

  /**
   * ============================================================
   * SECTION 11: SORTING
   * ============================================================
   */
  describe('11. Sorting', () => {
    it('11.1 sort=path (default)', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
      });
      expect(query.sort).toBe('path');
    });

    it('11.2 sort=modified', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        sort: 'modified',
      });
      expect(query.sort).toBe('modified');
    });

    it('11.3 sort=accessed', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        sort: 'accessed',
      });
      expect(query.sort).toBe('accessed');
    });

    it('11.4 sort=created', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        sort: 'created',
      });
      expect(query.sort).toBe('created');
    });

    it('11.5 sortReverse=true', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        sort: 'modified',
        sortReverse: true,
      });
      expect(query.sortReverse).toBe(true);
    });
  });

  /**
   * ============================================================
   * SECTION 12: DEBUG & SPECIAL OPTIONS
   * ============================================================
   */
  describe('12. Debug & Special Options', () => {
    it('12.1 noMessages=true', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        noMessages: true,
      });
      expect(query.noMessages).toBe(true);
    });

    it('12.2 passthru=true - shows all lines', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        passthru: true,
      });
      expect(query.passthru).toBe(true);
      const validation = validateRipgrepQuery(query);
      expect(
        validation.warnings.some((w: string) => w.includes('passthru'))
      ).toBe(true);
    });

    it('12.3 passthru + filesOnly - error', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        passthru: true,
        filesOnly: true,
      });
      const validation = validateRipgrepQuery(query);
      expect(validation.isValid).toBe(false);
      expect(
        validation.errors.some((e: string) =>
          e.includes('passthru and filesOnly')
        )
      ).toBe(true);
    });

    it('12.4 debug=true', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        debug: true,
      });
      expect(query.debug).toBe(true);
    });

    it('12.5 jsonOutput=true', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        jsonOutput: true,
      });
      expect(query.jsonOutput).toBe(true);
    });

    it('12.6 vimgrepFormat=true', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        vimgrepFormat: true,
      });
      expect(query.vimgrepFormat).toBe(true);
    });
  });

  /**
   * ============================================================
   * SECTION 13: COMPLEX COMBINATIONS
   * ============================================================
   */
  describe('13. Complex Parameter Combinations', () => {
    it('13.1 discovery mode with type filter', () => {
      const query = createQuery({
        pattern: 'useState',
        path: '/src',
        mode: 'discovery',
        type: 'tsx',
      });
      const configured = applyWorkflowMode(query);
      expect(configured.count).toBe(true);
      expect(configured.type).toBe('tsx');
    });

    it('13.2 detailed mode with custom context', () => {
      const query = createQuery({
        pattern: 'async function',
        path: '/src',
        mode: 'detailed',
        contextLines: 10,
        matchContentLength: 500,
      });
      const configured = applyWorkflowMode(query);
      expect(configured.contextLines).toBe(10); // explicit overrides default
    });

    it('13.3 paginated mode with exclusions', () => {
      const query = createQuery({
        pattern: 'import',
        path: '/src',
        mode: 'paginated',
        excludeDir: ['node_modules', 'dist'],
        exclude: ['*.test.ts'],
        type: 'ts',
      });
      expect(query.excludeDir).toEqual(['node_modules', 'dist']);
      expect(query.exclude).toEqual(['*.test.ts']);
    });

    it('13.4 full-featured search query', () => {
      const query = createQuery({
        pattern: '(?<=export )class \\w+',
        path: '/packages/octocode-mcp/src',
        perlRegex: true,
        type: 'ts',
        excludeDir: ['node_modules', 'dist', '__tests__'],
        contextLines: 3,
        maxMatchesPerFile: 10,
        filesPerPage: 15,
        matchesPerPage: 50,
        matchContentLength: 400,
        sort: 'modified',
        sortReverse: true,
        includeStats: true,
        showFileLastModified: true,
      });
      expect(query.perlRegex).toBe(true);
      expect(query.type).toBe('ts');
      expect(query.contextLines).toBe(3);
      expect(query.matchContentLength).toBe(400);
      expect(query.sortReverse).toBe(true);
    });

    it('13.5 search with all context options', () => {
      const query = createQuery({
        pattern: 'error',
        path: '/src',
        beforeContext: 5,
        afterContext: 10,
        lineNumbers: true,
        column: true,
        matchContentLength: 600,
      });
      expect(query.beforeContext).toBe(5);
      expect(query.afterContext).toBe(10);
      expect(query.lineNumbers).toBe(true);
      expect(query.column).toBe(true);
    });

    it('13.6 multiline PCRE2 search', () => {
      const query = createQuery({
        pattern: 'function\\s+\\w+\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\}',
        path: '/src',
        perlRegex: true,
        multiline: true,
        multilineDotall: true,
        type: 'ts',
      });
      expect(query.multiline).toBe(true);
      expect(query.multilineDotall).toBe(true);
      expect(query.perlRegex).toBe(true);
    });

    it('13.7 inverted search with file-level exclusion', () => {
      const query = createQuery({
        pattern: '@deprecated',
        path: '/src',
        filesWithoutMatch: true,
        type: 'ts',
        excludeDir: ['__tests__'],
      });
      expect(query.filesWithoutMatch).toBe(true);
    });

    it('13.8 high-performance discovery (uses count mode)', () => {
      const query = createQuery({
        pattern: 'export',
        path: '/src',
        mode: 'discovery',
        type: 'ts',
        noIgnore: false,
        threads: 16,
        mmap: true,
        noMessages: true,
      });
      const configured = applyWorkflowMode(query);
      expect(configured.count).toBe(true);
      expect(configured.threads).toBe(16);
    });
  });

  /**
   * ============================================================
   * SECTION 14: EDGE CASES & BOUNDARIES
   * ============================================================
   */
  describe('14. Edge Cases & Boundaries', () => {
    it('14.1 minimum values', () => {
      const query = createQuery({
        pattern: 'x',
        path: '/',
        contextLines: 0,
        matchContentLength: 1,
        maxMatchesPerFile: 1,
        maxFiles: 1,
        filesPerPage: 1,
        filePageNumber: 1,
        matchesPerPage: 1,
        threads: 1,
      });
      expect(query.contextLines).toBe(0);
      expect(query.matchContentLength).toBe(1);
    });

    it('14.2 maximum values', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        contextLines: 50,
        matchContentLength: 800,
        maxMatchesPerFile: 100,
        maxFiles: 1000,
        filesPerPage: 20,
        matchesPerPage: 100,
        threads: 32,
      });
      expect(query.contextLines).toBe(50);
      expect(query.maxFiles).toBe(1000);
      expect(query.threads).toBe(32);
    });

    it('14.3 empty arrays', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/src',
        include: [],
        exclude: [],
        excludeDir: [],
      });
      expect(query.include).toEqual([]);
      expect(query.exclude).toEqual([]);
    });

    it('14.4 special regex characters in pattern', () => {
      const query = createQuery({
        pattern: '\\(\\)\\[\\]\\{\\}\\$\\^',
        path: '/src',
      });
      expect(query.pattern).toBe('\\(\\)\\[\\]\\{\\}\\$\\^');
    });

    it('14.5 special characters in path', () => {
      const query = createQuery({
        pattern: 'test',
        path: '/path with spaces/src',
      });
      expect(query.path).toBe('/path with spaces/src');
    });

    it('14.6 unicode in pattern', () => {
      const query = createQuery({
        pattern: '日本語',
        path: '/src',
      });
      expect(query.pattern).toBe('日本語');
    });

    it('14.7 emoji in pattern', () => {
      const query = createQuery({
        pattern: '🔍🐙',
        path: '/src',
      });
      expect(query.pattern).toBe('🔍🐙');
    });
  });

  /**
   * ============================================================
   * SECTION 15: VALIDATION ERRORS
   * ============================================================
   */
  describe('15. Schema Validation Errors', () => {
    it('15.1 contextLines exceeds max', () => {
      expect(() =>
        createQuery({
          pattern: 'test',
          path: '/src',
          contextLines: 100,
        })
      ).toThrow();
    });

    it('15.2 matchContentLength exceeds max', () => {
      expect(() =>
        createQuery({
          pattern: 'test',
          path: '/src',
          matchContentLength: 1000,
        })
      ).toThrow();
    });

    it('15.3 filesPerPage exceeds max', () => {
      expect(() =>
        createQuery({
          pattern: 'test',
          path: '/src',
          filesPerPage: 51,
        })
      ).toThrow();
    });

    it('15.4 matchesPerPage exceeds max', () => {
      expect(() =>
        createQuery({
          pattern: 'test',
          path: '/src',
          matchesPerPage: 200,
        })
      ).toThrow();
    });

    it('15.5 threads exceeds max', () => {
      expect(() =>
        createQuery({
          pattern: 'test',
          path: '/src',
          threads: 100,
        })
      ).toThrow();
    });

    it('15.6 invalid sort value', () => {
      expect(() =>
        createQuery({
          pattern: 'test',
          path: '/src',
          sort: 'invalid' as 'path',
        })
      ).toThrow();
    });

    it('15.7 invalid mode value', () => {
      expect(() =>
        createQuery({
          pattern: 'test',
          path: '/src',
          mode: 'invalid' as 'discovery',
        })
      ).toThrow();
    });

    it('15.8 invalid binaryFiles value', () => {
      expect(() =>
        createQuery({
          pattern: 'test',
          path: '/src',
          binaryFiles: 'invalid' as 'text',
        })
      ).toThrow();
    });

    it('15.9 negative contextLines', () => {
      expect(() =>
        createQuery({
          pattern: 'test',
          path: '/src',
          contextLines: -1,
        })
      ).toThrow();
    });

    it('15.10 zero maxMatchesPerFile', () => {
      expect(() =>
        createQuery({
          pattern: 'test',
          path: '/src',
          maxMatchesPerFile: 0,
        })
      ).toThrow();
    });
  });
});

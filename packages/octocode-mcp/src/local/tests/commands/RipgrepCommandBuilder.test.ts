/**
 * Tests for RipgrepCommandBuilder
 */

import { describe, it, expect } from 'vitest';
import { RipgrepCommandBuilder } from '../../commands/RipgrepCommandBuilder.js';
import { RipgrepQuerySchema } from '../../scheme/local_ripgrep.js';

const createQuery = (query: Parameters<typeof RipgrepQuerySchema.parse>[0]) =>
  RipgrepQuerySchema.parse(query);

describe('RipgrepCommandBuilder', () => {
  describe('basic command building', () => {
    it('should build a simple search command', () => {
      const builder = new RipgrepCommandBuilder();
      const { command, args } = builder.simple('pattern', '/path').build();

      expect(command).toBe('rg');
      expect(args).toContain('-n'); // Line numbers
      expect(args).toContain('-S'); // Smart case
      expect(args).toContain('pattern');
      expect(args).toContain('/path');
    });

    it('should include default optimizations', () => {
      const builder = new RipgrepCommandBuilder();
      const { args } = builder.simple('test', '/repo').build();

      expect(args).toContain('--sort'); // Sorting enabled
      expect(args).toContain('path');
      expect(args).toContain('--color');
      expect(args).toContain('never');
    });
  });

  describe('pattern modes', () => {
    it('should use fixed string mode', () => {
      const query = createQuery({
        pattern: 'literal.string',
        path: './src',
        fixedString: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-F');
    });

    it('should use PCRE2 mode', () => {
      const query = createQuery({
        pattern: '(?<=export )\\w+',
        path: './src',
        perlRegex: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-P');
    });
  });

  describe('case sensitivity', () => {
    it('should use smart case by default', () => {
      const query = createQuery({
        pattern: 'function',
        path: './src',
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-S');
    });

    it('should override with case insensitive', () => {
      const query = createQuery({
        pattern: 'FUNCTION',
        path: './src',
        caseInsensitive: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-i');
      expect(args).not.toContain('-S');
    });
  });

  describe('file filtering', () => {
    it('should use type filtering', () => {
      const query = createQuery({
        pattern: 'import',
        path: './src',
        type: 'ts',
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-t');
      expect(args).toContain('ts');
    });

    it('should consolidate simple globs (optimization)', () => {
      const query = createQuery({
        pattern: 'export',
        path: './src',
        include: ['*.ts', '*.tsx'],
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      // Should consolidate into single glob
      const globIndex = args.indexOf('-g');
      expect(globIndex).not.toBe(-1);

      const glob = args[globIndex + 1];
      expect(glob).toBe('*.{ts,tsx}');
    });

    it('should handle complex globs separately', () => {
      const query = createQuery({
        pattern: 'test',
        path: './src',
        include: ['*.ts', 'src/**/*.test.*'],
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      // Should have both globs
      const firstGlobIndex = args.indexOf('-g');
      expect(firstGlobIndex).not.toBe(-1);

      // Check for both globs
      expect(args.filter(a => a === '-g').length).toBeGreaterThanOrEqual(1);
    });

    it('should handle exclude patterns', () => {
      const query = createQuery({
        pattern: 'function',
        path: './src',
        exclude: ['*.test.*', '*.spec.*'],
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-g');
      expect(args).toContain('!*.test.*');
      expect(args).toContain('!*.spec.*');
    });

    it('should handle excludeDir', () => {
      const query = createQuery({
        pattern: 'import',
        path: './src',
        excludeDir: ['node_modules', 'dist'],
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('!node_modules/');
      expect(args).toContain('!dist/');
    });
  });

  describe('output control', () => {
    it('should use filesOnly mode', () => {
      const query = createQuery({
        pattern: 'auth',
        path: './src',
        filesOnly: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-l');
    });

    it('should apply default maxMatchesPerFile', () => {
      const query = createQuery({
        pattern: 'function',
        path: './src',
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-m');
      expect(args).toContain('10'); // Default (matchesPerPage)
    });

    it('should not apply maxMatches in filesOnly mode', () => {
      const query = createQuery({
        pattern: 'function',
        path: './src',
        filesOnly: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      // Should have -l but not -m
      expect(args).toContain('-l');
      const mIndex = args.indexOf('-m');
      expect(mIndex).toBe(-1);
    });

    it('should use custom maxMatchesPerFile', () => {
      const query = createQuery({
        pattern: 'export',
        path: './src',
        maxMatchesPerFile: 10,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-m');
      expect(args).toContain('10');
    });
  });

  describe('context lines', () => {
    it('should add context lines', () => {
      const query = createQuery({
        pattern: 'error',
        path: './logs',
        contextLines: 5,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-C');
      expect(args).toContain('5');
    });

    it('should handle before/after context separately', () => {
      const query = createQuery({
        pattern: 'error',
        path: './logs',
        beforeContext: 3,
        afterContext: 2,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-B');
      expect(args).toContain('3');
      expect(args).toContain('-A');
      expect(args).toContain('2');
    });
  });

  describe('advanced features', () => {
    it('should enable multiline mode', () => {
      const query = createQuery({
        pattern: 'async.*\\n.*await',
        path: './src',
        multiline: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-U');
    });

    it('should enable stats', () => {
      const query = createQuery({
        pattern: 'function',
        path: './src',
        includeStats: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('--stats');
    });

    it('should enable JSON output', () => {
      const query = createQuery({
        pattern: 'export',
        path: './src',
        jsonOutput: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('--json');
    });
  });

  describe('sorting', () => {
    it('should sort by path by default', () => {
      const query = createQuery({
        pattern: 'test',
        path: './src',
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('--sort');
      expect(args).toContain('path');
    });

    it('should sort by modified time', () => {
      const query = createQuery({
        pattern: 'FIXME',
        path: './src',
        sort: 'modified',
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('--sort');
      expect(args).toContain('modified');
    });

    it('should reverse sort', () => {
      const query = createQuery({
        pattern: 'TODO',
        path: './src',
        sort: 'path',
        sortReverse: true,
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      expect(args).toContain('--sortr');
      expect(args).toContain('path');
      expect(args).not.toContain('--sort');
    });

    it('should properly handle sort option removal when switching', () => {
      // Test that --sort is removed when switching to --sortr
      const queryReverse = createQuery({
        pattern: 'test',
        path: './src',
        sort: 'modified',
        sortReverse: true,
      });

      const { args: argsReverse } = new RipgrepCommandBuilder()
        .fromQuery(queryReverse)
        .build();

      // Should have --sortr, not --sort
      const sortIndex = argsReverse.indexOf('--sort');
      const sortrIndex = argsReverse.indexOf('--sortr');

      expect(sortrIndex).not.toBe(-1);
      expect(sortIndex).toBe(-1); // --sort should not exist

      // Test that --sortr is removed when switching to --sort
      const queryNormal = createQuery({
        pattern: 'test',
        path: './src',
        sort: 'modified',
        sortReverse: false,
      });

      const { args: argsNormal } = new RipgrepCommandBuilder()
        .fromQuery(queryNormal)
        .build();

      // Should have --sort, not --sortr
      const sortIndex2 = argsNormal.indexOf('--sort');
      const sortrIndex2 = argsNormal.indexOf('--sortr');

      expect(sortIndex2).not.toBe(-1);
      expect(sortrIndex2).toBe(-1); // --sortr should not exist
    });
  });

  describe('glob consolidation', () => {
    it('should consolidate 3+ simple globs', () => {
      const query = createQuery({
        pattern: 'import',
        path: './src',
        include: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      const globIndex = args.indexOf('-g');
      expect(globIndex).not.toBe(-1);

      const glob = args[globIndex + 1];
      expect(glob).toBe('*.{ts,tsx,js,jsx}');
    });

    it('should not consolidate already-consolidated globs', () => {
      const query = createQuery({
        pattern: 'test',
        path: './src',
        include: ['*.{ts,tsx}'],
      });

      const { args } = new RipgrepCommandBuilder().fromQuery(query).build();

      const globIndex = args.indexOf('-g');
      expect(globIndex).not.toBe(-1);

      const glob = args[globIndex + 1];
      expect(glob).toBe('*.{ts,tsx}');
    });
  });

  describe('complete query', () => {
    it('should build a complex query with all features', () => {
      const query = createQuery({
        pattern: '(login|logout|session)',
        path: '/repo/src',
        type: 'ts',
        contextLines: 3,
        maxMatchesPerFile: 5,
        smartCase: true,
        excludeDir: ['node_modules', '__tests__'],
        includeStats: true,
        sort: 'modified',
      });

      const { command, args } = new RipgrepCommandBuilder()
        .fromQuery(query)
        .build();

      expect(command).toBe('rg');

      // Pattern mode
      expect(args).toContain('-S'); // Smart case

      // File filtering
      expect(args).toContain('-t');
      expect(args).toContain('ts');
      expect(args).toContain('!node_modules/');
      expect(args).toContain('!__tests__/');

      // Output control
      expect(args).toContain('-C');
      expect(args).toContain('3');
      expect(args).toContain('-m');
      expect(args).toContain('5');

      // Advanced
      expect(args).toContain('--stats');
      expect(args).toContain('--sort');
      expect(args).toContain('modified');

      // Pattern and path
      expect(args).toContain('(login|logout|session)');
      expect(args).toContain('/repo/src');
    });
  });
});

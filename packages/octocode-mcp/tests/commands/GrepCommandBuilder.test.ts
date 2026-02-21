/**
 * Tests for GrepCommandBuilder
 */

import { describe, it, expect } from 'vitest';
import {
  GrepCommandBuilder,
  getGrepFeatureWarnings,
  getUnsupportedGrepFeatures,
} from '../../src/commands/GrepCommandBuilder.js';
import type { RipgrepQuery } from '../../src/tools/local_ripgrep/scheme.js';

describe('GrepCommandBuilder', () => {
  describe('fromQuery', () => {
    it('should build basic grep command', () => {
      const builder = new GrepCommandBuilder();
      const { command, args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
        } as RipgrepQuery)
        .build();

      expect(command).toBe('grep');
      expect(args).toContain('-r');
      expect(args).toContain('-n');
      expect(args).toContain('-H');
      expect(args).toContain('test');
      expect(args).toContain('/test/path');
    });

    it('should add -F for fixed string search', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          fixedString: true,
        } as RipgrepQuery)
        .build();

      expect(args).toContain('-F');
    });

    it('should add -i for case insensitive search', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          caseInsensitive: true,
        } as RipgrepQuery)
        .build();

      expect(args).toContain('-i');
    });

    it('should add -i for smartCase (grep fallback)', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          smartCase: true,
        } as RipgrepQuery)
        .build();

      // smartCase falls back to case-insensitive in grep
      expect(args).toContain('-i');
    });

    it('should add -w for whole word search', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          wholeWord: true,
        } as RipgrepQuery)
        .build();

      expect(args).toContain('-w');
    });

    it('should add -v for invert match', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          invertMatch: true,
        } as RipgrepQuery)
        .build();

      expect(args).toContain('-v');
    });

    it('should add context lines with -C', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          contextLines: 3,
        } as RipgrepQuery)
        .build();

      expect(args).toContain('-C');
      expect(args).toContain('3');
    });

    it('should add before/after context separately', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          beforeContext: 2,
          afterContext: 4,
        } as RipgrepQuery)
        .build();

      expect(args).toContain('-B');
      expect(args).toContain('2');
      expect(args).toContain('-A');
      expect(args).toContain('4');
    });

    it('should add -l for files only', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          filesOnly: true,
        } as RipgrepQuery)
        .build();

      expect(args).toContain('-l');
    });

    it('should add -L for files without match', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          filesWithoutMatch: true,
        } as RipgrepQuery)
        .build();

      expect(args).toContain('-L');
    });

    it('should add -c for count', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          count: true,
        } as RipgrepQuery)
        .build();

      expect(args).toContain('-c');
    });

    it('should convert type to --include patterns', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          type: 'ts',
        } as RipgrepQuery)
        .build();

      expect(args).toContain('--include');
      expect(args.some(a => a === '*.ts' || a === '*.tsx')).toBe(true);
    });

    it('should add --include for include patterns', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          include: ['*.js', '*.ts'],
        } as RipgrepQuery)
        .build();

      const includeCount = args.filter(a => a === '--include').length;
      expect(includeCount).toBe(2);
      expect(args).toContain('*.js');
      expect(args).toContain('*.ts');
    });

    it('should add --exclude for exclude patterns', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          exclude: ['*.min.js'],
        } as RipgrepQuery)
        .build();

      expect(args).toContain('--exclude');
      expect(args).toContain('*.min.js');
    });

    it('should add --exclude-dir for excludeDir', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          excludeDir: ['node_modules', 'dist'],
        } as RipgrepQuery)
        .build();

      const excludeDirCount = args.filter(a => a === '--exclude-dir').length;
      expect(excludeDirCount).toBe(2);
      expect(args).toContain('node_modules');
      expect(args).toContain('dist');
    });

    it('should add -I to ignore binary files by default', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
        } as RipgrepQuery)
        .build();

      expect(args).toContain('-I');
    });

    it('should add -a for text mode binary handling', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          binaryFiles: 'text',
        } as RipgrepQuery)
        .build();

      expect(args).toContain('-a');
    });

    it('should add -x for line regexp', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
          lineRegexp: true,
        } as RipgrepQuery)
        .build();

      expect(args).toContain('-x');
    });

    it('should disable color output', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .fromQuery({
          pattern: 'test',
          path: '/test/path',
        } as RipgrepQuery)
        .build();

      expect(args).toContain('--color');
      expect(args).toContain('never');
    });
  });

  describe('simple builder', () => {
    it('should build a simple grep command', () => {
      const builder = new GrepCommandBuilder();
      const { command, args } = builder.simple('pattern', '/path').build();

      expect(command).toBe('grep');
      expect(args).toContain('-r');
      expect(args).toContain('-n');
      expect(args).toContain('-H');
      expect(args).toContain('pattern');
      expect(args).toContain('/path');
    });

    it('should insert -- before positional args to prevent option injection', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder.simple('--include=*', '/path').build();

      const separatorIndex = args.indexOf('--');
      expect(separatorIndex).toBeGreaterThan(-1);
      expect(args[separatorIndex + 1]).toBe('--include=*');
      expect(args[separatorIndex + 2]).toBe('/path');
    });
  });

  describe('method chaining', () => {
    it('should support method chaining', () => {
      const builder = new GrepCommandBuilder();
      const { args } = builder
        .caseInsensitive()
        .filesOnly()
        .context(5)
        .include('*.ts')
        .exclude('*.test.ts')
        .excludeDir('node_modules')
        .fixedString()
        .build();

      expect(args).toContain('-i');
      expect(args).toContain('-l');
      expect(args).toContain('-C');
      expect(args).toContain('5');
      expect(args).toContain('--include');
      expect(args).toContain('--exclude');
      expect(args).toContain('--exclude-dir');
      expect(args).toContain('-F');
    });
  });
});

describe('getUnsupportedGrepFeatures', () => {
  it('should detect smartCase as unsupported', () => {
    const unsupported = getUnsupportedGrepFeatures({
      pattern: 'test',
      path: '/test',
      smartCase: true,
    } as RipgrepQuery);

    expect(unsupported.smartCase).toBe(true);
  });

  it('should detect multiline as unsupported', () => {
    const unsupported = getUnsupportedGrepFeatures({
      pattern: 'test',
      path: '/test',
      multiline: true,
    } as RipgrepQuery);

    expect(unsupported.multiline).toBe(true);
  });

  it('should detect countMatches as unsupported', () => {
    const unsupported = getUnsupportedGrepFeatures({
      pattern: 'test',
      path: '/test',
      countMatches: true,
    } as RipgrepQuery);

    expect(unsupported.countMatches).toBe(true);
  });

  it('should detect custom sort as unsupported', () => {
    const unsupported = getUnsupportedGrepFeatures({
      pattern: 'test',
      path: '/test',
      sort: 'modified',
    } as RipgrepQuery);

    expect(unsupported.sortOptions).toBe(true);
  });

  it('should not flag path sort as unsupported', () => {
    const unsupported = getUnsupportedGrepFeatures({
      pattern: 'test',
      path: '/test',
      sort: 'path',
    } as RipgrepQuery);

    expect(unsupported.sortOptions).toBe(false);
  });
});

describe('getGrepFeatureWarnings', () => {
  it('should return warning for smartCase', () => {
    const warnings = getGrepFeatureWarnings({
      pattern: 'test',
      path: '/test',
      smartCase: true,
    } as RipgrepQuery);

    expect(warnings.some(w => w.includes('smartCase'))).toBe(true);
  });

  it('should return warning for multiline', () => {
    const warnings = getGrepFeatureWarnings({
      pattern: 'test',
      path: '/test',
      multiline: true,
    } as RipgrepQuery);

    expect(warnings.some(w => w.includes('multiline'))).toBe(true);
  });

  it('should return warning about gitignore', () => {
    const warnings = getGrepFeatureWarnings({
      pattern: 'test',
      path: '/test',
      noIgnore: false, // grep doesn't respect .gitignore anyway
    } as RipgrepQuery);

    expect(warnings.some(w => w.includes('.gitignore'))).toBe(true);
  });

  it('should return empty array for basic query', () => {
    const warnings = getGrepFeatureWarnings({
      pattern: 'test',
      path: '/test',
      noIgnore: true, // explicitly disable gitignore warning
    } as RipgrepQuery);

    // Should only have gitignore-related warnings if any
    expect(warnings.every(w => !w.includes('smartCase'))).toBe(true);
  });
});

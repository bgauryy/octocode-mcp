/**
 * Tests for FindCommandBuilder
 */

import { describe, it, expect } from 'vitest';
import { FindCommandBuilder } from '../../src/commands/FindCommandBuilder.js';
import type { FindFilesQuery } from '../../src/types.js';

const createQuery = (query: Partial<FindFilesQuery>): FindFilesQuery => ({
  path: '/test/path',
  ...query,
});

describe('FindCommandBuilder', () => {
  describe('basic command building', () => {
    it('should build a simple find command', () => {
      const builder = new FindCommandBuilder();
      const { command, args } = builder.simple('/path', '*.ts').build();

      expect(command).toBe('find');
      expect(args).toContain('/path');
      expect(args).toContain('-name');
      expect(args).toContain('*.ts');
    });

    it('should include the path as first argument', () => {
      const query = createQuery({ path: '/workspace' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args[0]).toBe('/workspace');
    });

    it('should include -print0 for null-separated output', () => {
      const query = createQuery({});
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-print0');
    });
  });

  describe('depth control', () => {
    it('should set maxDepth', () => {
      const query = createQuery({ maxDepth: 3 });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-maxdepth');
      expect(args.join(' ')).toContain('3');
    });

    it('should set minDepth', () => {
      const query = createQuery({ minDepth: 1 });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-mindepth');
      expect(args.join(' ')).toContain('1');
    });

    it('should support both maxDepth and minDepth', () => {
      const query = createQuery({ maxDepth: 5, minDepth: 2 });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-maxdepth');
      expect(args.join(' ')).toContain('5');
      expect(args).toContain('-mindepth');
      expect(args.join(' ')).toContain('2');
    });

    it('should use builder method for maxDepth', () => {
      const { args } = new FindCommandBuilder()
        .path('/test')
        .maxDepth(4)
        .build();

      expect(args).toContain('-maxdepth');
      expect(args).toContain('4');
    });

    it('should use builder method for minDepth', () => {
      const { args } = new FindCommandBuilder()
        .path('/test')
        .minDepth(1)
        .build();

      expect(args).toContain('-mindepth');
      expect(args).toContain('1');
    });
  });

  describe('type filtering', () => {
    it('should filter by type file', () => {
      const query = createQuery({ type: 'f' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-type');
      expect(args).toContain('f');
    });

    it('should filter by type directory', () => {
      const query = createQuery({ type: 'd' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-type');
      expect(args).toContain('d');
    });

    it('should filter by type symlink', () => {
      const query = createQuery({ type: 'l' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-type');
      expect(args).toContain('l');
    });

    it('should use builder method for type', () => {
      const { args } = new FindCommandBuilder().path('/test').type('f').build();

      expect(args).toContain('-type');
      expect(args).toContain('f');
    });
  });

  describe('name patterns', () => {
    it('should filter by name pattern', () => {
      const query = createQuery({ name: '*.ts' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-name');
      expect(args).toContain('*.ts');
    });

    it('should filter by case-insensitive name', () => {
      const query = createQuery({ iname: '*.ts' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-iname');
      expect(args).toContain('*.ts');
    });

    it('should handle single name in names array', () => {
      const query = createQuery({ names: ['*.ts'] });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-name');
      expect(args).toContain('*.ts');
    });

    it('should handle multiple names with OR grouping', () => {
      const query = createQuery({ names: ['*.ts', '*.tsx', '*.js'] });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      // Should use grouping: ( -name *.ts -o -name *.tsx -o -name *.js )
      expect(args).toContain('(');
      expect(args).toContain(')');
      expect(args).toContain('-o');
      expect(args.filter((a) => a === '-name').length).toBe(3);
    });

    it('should use builder method for name', () => {
      const { args } = new FindCommandBuilder()
        .path('/test')
        .name('*.json')
        .build();

      expect(args).toContain('-name');
      expect(args).toContain('*.json');
    });

    it('should use builder method for iname', () => {
      const { args } = new FindCommandBuilder()
        .path('/test')
        .iname('README*')
        .build();

      expect(args).toContain('-iname');
      expect(args).toContain('README*');
    });
  });

  describe('path pattern and regex', () => {
    it('should filter by path pattern', () => {
      const query = createQuery({ pathPattern: '*/src/*' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-path');
      expect(args).toContain('*/src/*');
    });

    it('should filter by regex', () => {
      const query = createQuery({ regex: '.*\\.test\\.ts$' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-regex');
      expect(args).toContain('.*\\.test\\.ts$');
    });

    it('should set regex type', () => {
      const query = createQuery({
        regex: '.*test.*',
        regexType: 'posix-egrep',
      });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-regextype');
      expect(args).toContain('posix-egrep');
      expect(args).toContain('-regex');
    });
  });

  describe('size filtering', () => {
    it('should filter by size greater than', () => {
      const query = createQuery({ sizeGreater: '1M' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-size');
      expect(args).toContain('+1M');
    });

    it('should filter by size less than', () => {
      const query = createQuery({ sizeLess: '100k' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-size');
      expect(args).toContain('-100k');
    });

    it('should use builder method for size', () => {
      const { args } = new FindCommandBuilder()
        .path('/test')
        .size('+500k')
        .build();

      expect(args).toContain('-size');
      expect(args).toContain('+500k');
    });
  });

  describe('time filtering', () => {
    it('should filter by modified within days', () => {
      const query = createQuery({ modifiedWithin: '7d' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-mtime');
      expect(args).toContain('-7');
    });

    it('should filter by modified within hours (converted to days)', () => {
      const query = createQuery({ modifiedWithin: '24h' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-mtime');
      expect(args).toContain('-1'); // 24h = 1 day
    });

    it('should filter by modified within weeks', () => {
      const query = createQuery({ modifiedWithin: '2w' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-mtime');
      expect(args).toContain('-14'); // 2 weeks = 14 days
    });

    it('should filter by modified within months', () => {
      const query = createQuery({ modifiedWithin: '1m' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-mtime');
      expect(args).toContain('-30'); // 1 month = 30 days
    });

    it('should filter by modified before', () => {
      const query = createQuery({ modifiedBefore: '30d' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-mtime');
      expect(args).toContain('+30');
    });

    it('should filter by accessed within', () => {
      const query = createQuery({ accessedWithin: '3d' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-atime');
      expect(args).toContain('-3');
    });

    it('should use builder method for mtime', () => {
      const { args } = new FindCommandBuilder()
        .path('/test')
        .mtime('-5')
        .build();

      expect(args).toContain('-mtime');
      expect(args).toContain('-5');
    });
  });

  describe('permissions and attributes', () => {
    it('should filter by permissions', () => {
      const query = createQuery({ permissions: '755' });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-perm');
      expect(args).toContain('755');
    });

    it('should filter by executable', () => {
      const query = createQuery({ executable: true });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-executable');
    });

    it('should filter by readable', () => {
      const query = createQuery({ readable: true });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-readable');
    });

    it('should filter by writable', () => {
      const query = createQuery({ writable: true });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-writable');
    });

    it('should filter empty files/directories', () => {
      const query = createQuery({ empty: true });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-empty');
    });
  });

  describe('directory exclusion', () => {
    it('should exclude single directory', () => {
      const query = createQuery({ excludeDir: ['node_modules'] });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('(');
      expect(args).toContain('-path');
      expect(args).toContain('*/node_modules');
      expect(args).toContain('-prune');
    });

    it('should exclude multiple directories', () => {
      const query = createQuery({
        excludeDir: ['node_modules', 'dist', '.git'],
      });
      const { args } = new FindCommandBuilder().fromQuery(query).build();

      expect(args).toContain('*/node_modules');
      expect(args).toContain('*/dist');
      expect(args).toContain('*/.git');
      expect(args.filter((a) => a === '-prune').length).toBe(3);
    });
  });

  describe('builder method chaining', () => {
    it('should support method chaining', () => {
      const { command, args } = new FindCommandBuilder()
        .path('/workspace')
        .type('f')
        .name('*.ts')
        .maxDepth(3)
        .build();

      expect(command).toBe('find');
      expect(args).toContain('/workspace');
      expect(args).toContain('-type');
      expect(args).toContain('f');
      expect(args).toContain('-name');
      expect(args).toContain('*.ts');
      expect(args).toContain('-maxdepth');
      expect(args).toContain('3');
    });
  });

  describe('complex queries', () => {
    it('should handle full query with all options', () => {
      const query = createQuery({
        path: '/workspace/src',
        maxDepth: 5,
        minDepth: 1,
        type: 'f',
        name: '*.ts',
        sizeGreater: '1k',
        modifiedWithin: '7d',
        excludeDir: ['node_modules'],
      });

      const { command, args } = new FindCommandBuilder()
        .fromQuery(query)
        .build();

      expect(command).toBe('find');
      expect(args).toContain('/workspace/src');
      expect(args).toContain('-maxdepth');
      expect(args).toContain('-mindepth');
      expect(args).toContain('-type');
      expect(args).toContain('-name');
      expect(args).toContain('-size');
      expect(args).toContain('-mtime');
    });
  });
});

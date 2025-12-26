/**
 * Tests for FindCommandBuilder
 */

import { describe, it, expect, afterEach } from 'vitest';
import { FindCommandBuilder } from '../../src/commands/FindCommandBuilder.js';

describe('FindCommandBuilder', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('basic command building', () => {
    it('should create a find command', () => {
      const builder = new FindCommandBuilder();
      const { command } = builder.build();

      expect(command).toBe('find');
    });

    it('should build a simple find command', () => {
      const builder = new FindCommandBuilder();
      const { command, args } = builder.simple('/path', '*.ts').build();

      expect(command).toBe('find');
      expect(args).toContain('/path');
      expect(args).toContain('-name');
      expect(args).toContain('*.ts');
    });
  });

  describe('fromQuery', () => {
    it('should handle basic path', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder.fromQuery({ path: '/test/path' }).build();

      expect(args[0]).toBe('/test/path');
      expect(args).toContain('-print0');
    });

    it('should add -O3 optimization on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const builder = new FindCommandBuilder();
      const { args } = builder.fromQuery({ path: '/test' }).build();

      expect(args).toContain('-O3');
    });

    it('should not add -O3 optimization on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const builder = new FindCommandBuilder();
      const { args } = builder.fromQuery({ path: '/test' }).build();

      expect(args).not.toContain('-O3');
    });

    it('should handle maxDepth', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', maxDepth: 3 })
        .build();

      expect(args).toContain('-maxdepth');
      expect(args).toContain('3');
    });

    it('should handle minDepth', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', minDepth: 2 })
        .build();

      expect(args).toContain('-mindepth');
      expect(args).toContain('2');
    });

    it('should handle type filter', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder.fromQuery({ path: '/test', type: 'f' }).build();

      expect(args).toContain('-type');
      expect(args).toContain('f');
    });

    it('should handle single name pattern', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', name: '*.js' })
        .build();

      expect(args).toContain('-name');
      expect(args).toContain('*.js');
    });

    it('should handle multiple names with OR logic', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', names: ['*.ts', '*.js'] })
        .build();

      expect(args).toContain('(');
      expect(args).toContain(')');
      expect(args).toContain('-o');
      expect(args.filter(a => a === '-name').length).toBe(2);
      expect(args).toContain('*.ts');
      expect(args).toContain('*.js');
    });

    it('should handle single name in names array', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', names: ['*.ts'] })
        .build();

      expect(args).toContain('-name');
      expect(args).toContain('*.ts');
      expect(args).not.toContain('(');
    });

    it('should handle iname (case-insensitive)', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', iname: 'README*' })
        .build();

      expect(args).toContain('-iname');
      expect(args).toContain('README*');
    });

    it('should handle pathPattern', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', pathPattern: '*/src/*' })
        .build();

      expect(args).toContain('-path');
      expect(args).toContain('*/src/*');
    });

    it('should handle regex with default type', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', regex: '.*\\.test\\.ts$' })
        .build();

      expect(args).toContain('-regex');
      expect(args).toContain('.*\\.test\\.ts$');
    });

    it('should handle regex with custom type', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({
          path: '/test',
          regex: '.*test.*',
          regexType: 'posix-extended',
        })
        .build();

      expect(args).toContain('-regextype');
      expect(args).toContain('posix-extended');
      expect(args).toContain('-regex');
      expect(args).toContain('.*test.*');
    });

    it('should handle empty flag', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', empty: true })
        .build();

      expect(args).toContain('-empty');
    });

    it('should handle sizeGreater', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', sizeGreater: '10M' })
        .build();

      expect(args).toContain('-size');
      expect(args).toContain('+10M');
    });

    it('should handle sizeLess', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', sizeLess: '1G' })
        .build();

      expect(args).toContain('-size');
      expect(args).toContain('-1G');
    });

    it('should handle modifiedWithin with days', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', modifiedWithin: '7d' })
        .build();

      expect(args).toContain('-mtime');
      expect(args).toContain('-7');
    });

    it('should handle modifiedWithin with hours', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', modifiedWithin: '2h' })
        .build();

      expect(args).toContain('-mmin');
      expect(args).toContain('-120');
    });

    it('should handle modifiedWithin with weeks', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', modifiedWithin: '2w' })
        .build();

      expect(args).toContain('-mtime');
      expect(args).toContain('-14');
    });

    it('should handle modifiedWithin with months', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', modifiedWithin: '3m' })
        .build();

      expect(args).toContain('-mtime');
      expect(args).toContain('-90');
    });

    it('should handle modifiedBefore', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', modifiedBefore: '30d' })
        .build();

      expect(args).toContain('-mtime');
      expect(args).toContain('+30');
    });

    it('should handle accessedWithin with days', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', accessedWithin: '7d' })
        .build();

      expect(args).toContain('-atime');
      expect(args).toContain('-7');
    });

    it('should handle accessedWithin with hours', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', accessedWithin: '4h' })
        .build();

      expect(args).toContain('-amin');
      expect(args).toContain('-240');
    });

    it('should handle accessedWithin with weeks', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', accessedWithin: '1w' })
        .build();

      expect(args).toContain('-atime');
      expect(args).toContain('-7');
    });

    it('should handle accessedWithin with months', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', accessedWithin: '2m' })
        .build();

      expect(args).toContain('-atime');
      expect(args).toContain('-60');
    });

    it('should handle permissions', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', permissions: '755' })
        .build();

      expect(args).toContain('-perm');
      expect(args).toContain('755');
    });

    it('should handle executable flag', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', executable: true })
        .build();

      expect(args).toContain('-executable');
    });

    it('should handle readable flag', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', readable: true })
        .build();

      expect(args).toContain('-readable');
    });

    it('should handle writable flag', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', writable: true })
        .build();

      expect(args).toContain('-writable');
    });

    it('should handle excludeDir', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', excludeDir: ['node_modules', 'dist'] })
        .build();

      expect(args).toContain('-prune');
      expect(args).toContain('*/node_modules');
      expect(args).toContain('*/dist');
      expect(args).toContain('-print0');
    });

    it('should handle invalid time string gracefully', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', modifiedWithin: 'invalid' })
        .build();

      expect(args).toContain('-mtime');
      expect(args).toContain('-0');
    });

    it('should handle invalid access time string gracefully', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder
        .fromQuery({ path: '/test', accessedWithin: 'invalid' })
        .build();

      expect(args).toContain('-atime');
      expect(args).toContain('-0');
    });
  });

  describe('chainable methods', () => {
    it('should chain type method', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder.path('/test').type('d').build();

      expect(args).toContain('-type');
      expect(args).toContain('d');
    });

    it('should chain name method', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder.path('/test').name('*.ts').build();

      expect(args).toContain('-name');
      expect(args).toContain('*.ts');
    });

    it('should chain iname method', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder.path('/test').iname('readme*').build();

      expect(args).toContain('-iname');
      expect(args).toContain('readme*');
    });

    it('should chain maxDepth method', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder.path('/test').maxDepth(5).build();

      expect(args).toContain('-maxdepth');
      expect(args).toContain('5');
    });

    it('should chain minDepth method', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder.path('/test').minDepth(1).build();

      expect(args).toContain('-mindepth');
      expect(args).toContain('1');
    });

    it('should chain size method', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder.path('/test').size('+100k').build();

      expect(args).toContain('-size');
      expect(args).toContain('+100k');
    });

    it('should chain mtime method', () => {
      const builder = new FindCommandBuilder();
      const { args } = builder.path('/test').mtime('-7').build();

      expect(args).toContain('-mtime');
      expect(args).toContain('-7');
    });
  });

  describe('reset', () => {
    it('should reset builder state', () => {
      const builder = new FindCommandBuilder();
      builder.path('/test').name('*.ts');

      const { args: argsBefore } = builder.build();
      expect(argsBefore.length).toBeGreaterThan(0);

      builder.reset();
      const { args: argsAfter } = builder.build();
      expect(argsAfter.length).toBe(0);
    });
  });

  describe('getArgs', () => {
    it('should return copy of args', () => {
      const builder = new FindCommandBuilder();
      builder.path('/test');

      const args = builder.getArgs();
      args.push('modified');

      const originalArgs = builder.getArgs();
      expect(originalArgs).not.toContain('modified');
    });
  });
});

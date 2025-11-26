/**
 * Tests for LsCommandBuilder
 */

import { describe, it, expect } from 'vitest';
import { LsCommandBuilder } from '../../src/commands/LsCommandBuilder.js';
import type { ViewStructureQuery } from '../../src/types.js';

const createQuery = (
  query: Partial<ViewStructureQuery>
): ViewStructureQuery => ({
  path: '/test/path',
  ...query,
});

describe('LsCommandBuilder', () => {
  describe('basic command building', () => {
    it('should build a simple ls command', () => {
      const builder = new LsCommandBuilder();
      const { command, args } = builder.simple('/path').build();

      expect(command).toBe('ls');
      expect(args).toContain('/path');
    });

    it('should include color=never for consistent output', () => {
      const query = createQuery({});
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      expect(args).toContain('--color=never');
    });

    it('should include single-column output by default', () => {
      const query = createQuery({});
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-1');
    });

    it('should include the path', () => {
      const query = createQuery({ path: '/workspace' });
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      expect(args).toContain('/workspace');
    });
  });

  describe('details mode', () => {
    it('should add -l flag for detailed listing', () => {
      const query = createQuery({ details: true });
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-l');
    });

    it('should use builder method for detailed', () => {
      const { args } = new LsCommandBuilder().detailed().build();

      expect(args).toContain('-l');
    });

    it('should not include -1 when details is true', () => {
      const query = createQuery({ details: true });
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      // -1 is for single-column, not needed with -l
      expect(args).not.toContain('-1');
    });
  });

  describe('hidden files', () => {
    it('should add -a flag for hidden files', () => {
      const query = createQuery({ hidden: true });
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-a');
    });

    it('should use builder method for all', () => {
      const { args } = new LsCommandBuilder().all().build();

      expect(args).toContain('-a');
    });
  });

  describe('human readable sizes', () => {
    it('should add -h flag for human readable sizes', () => {
      const query = createQuery({ humanReadable: true });
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-h');
    });

    it('should use builder method for humanReadable', () => {
      const { args } = new LsCommandBuilder().humanReadable().build();

      expect(args).toContain('-h');
    });
  });

  describe('recursive listing', () => {
    it('should add -R flag for recursive listing', () => {
      const query = createQuery({ recursive: true });
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-R');
    });

    it('should use builder method for recursive', () => {
      const { args } = new LsCommandBuilder().recursive().build();

      expect(args).toContain('-R');
    });
  });

  describe('sorting', () => {
    it('should sort by size', () => {
      const query = createQuery({ sortBy: 'size' });
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-S');
    });

    it('should sort by time', () => {
      const query = createQuery({ sortBy: 'time' });
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-t');
    });

    it('should sort by extension', () => {
      const query = createQuery({ sortBy: 'extension' });
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-X');
    });

    it('should use default sort (name) when not specified', () => {
      const query = createQuery({ sortBy: 'name' });
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      // Name sorting is default, no special flag needed
      expect(args).not.toContain('-S');
      expect(args).not.toContain('-t');
      expect(args).not.toContain('-X');
    });

    it('should use builder method for sortBySize', () => {
      const { args } = new LsCommandBuilder().sortBySize().build();

      expect(args).toContain('-S');
    });

    it('should use builder method for sortByTime', () => {
      const { args } = new LsCommandBuilder().sortByTime().build();

      expect(args).toContain('-t');
    });
  });

  describe('reverse sorting', () => {
    it('should add -r flag for reverse sorting', () => {
      const query = createQuery({ reverse: true });
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-r');
    });

    it('should use builder method for reverse', () => {
      const { args } = new LsCommandBuilder().reverse().build();

      expect(args).toContain('-r');
    });

    it('should combine reverse with other sort options', () => {
      const query = createQuery({ sortBy: 'time', reverse: true });
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-t');
      expect(args).toContain('-r');
    });
  });

  describe('builder method for path', () => {
    it('should set path using builder method', () => {
      const { args } = new LsCommandBuilder().path('/workspace/src').build();

      expect(args).toContain('/workspace/src');
    });
  });

  describe('method chaining', () => {
    it('should support method chaining', () => {
      const { command, args } = new LsCommandBuilder()
        .path('/workspace')
        .detailed()
        .all()
        .humanReadable()
        .sortByTime()
        .reverse()
        .build();

      expect(command).toBe('ls');
      expect(args).toContain('/workspace');
      expect(args).toContain('-l');
      expect(args).toContain('-a');
      expect(args).toContain('-h');
      expect(args).toContain('-t');
      expect(args).toContain('-r');
    });
  });

  describe('complex queries', () => {
    it('should handle full query with multiple options', () => {
      const query = createQuery({
        path: '/workspace/src',
        details: true,
        hidden: true,
        humanReadable: true,
        sortBy: 'size',
        reverse: true,
      });

      const { command, args } = new LsCommandBuilder().fromQuery(query).build();

      expect(command).toBe('ls');
      expect(args).toContain('/workspace/src');
      expect(args).toContain('-l');
      expect(args).toContain('-a');
      expect(args).toContain('-h');
      expect(args).toContain('-S');
      expect(args).toContain('-r');
      expect(args).toContain('--color=never');
    });

    it('should handle recursive with details', () => {
      const query = createQuery({
        recursive: true,
        details: true,
      });

      const { args } = new LsCommandBuilder().fromQuery(query).build();

      expect(args).toContain('-R');
      expect(args).toContain('-l');
    });
  });

  describe('default behaviors', () => {
    it('should not include filtering flags by default', () => {
      const query = createQuery({});
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      // Should not have optional flags unless specified
      expect(args).not.toContain('-a');
      expect(args).not.toContain('-h');
      expect(args).not.toContain('-R');
    });

    it('should always include color=never', () => {
      const query = createQuery({
        details: true,
        hidden: true,
      });
      const { args } = new LsCommandBuilder().fromQuery(query).build();

      expect(args).toContain('--color=never');
    });
  });
});

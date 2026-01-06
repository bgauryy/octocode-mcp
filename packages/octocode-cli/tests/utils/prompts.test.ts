/**
 * Prompts Utility Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Prompts Utilities', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('Initial state', () => {
    it('should throw error when select is called before loadInquirer', async () => {
      const { select } = await import('../../src/utils/prompts.js');

      expect(() =>
        select({
          message: 'Test',
          choices: [{ name: 'Option', value: 'opt' }],
        })
      ).toThrow('Inquirer not loaded. Call loadInquirer() first.');
    });

    it('should throw error when confirm is called before loadInquirer', async () => {
      const { confirm } = await import('../../src/utils/prompts.js');

      expect(() =>
        confirm({
          message: 'Test?',
        })
      ).toThrow('Inquirer not loaded. Call loadInquirer() first.');
    });

    it('should throw error when input is called before loadInquirer', async () => {
      const { input } = await import('../../src/utils/prompts.js');

      expect(() =>
        input({
          message: 'Enter value:',
        })
      ).toThrow('Inquirer not loaded. Call loadInquirer() first.');
    });

    it('should throw error when checkbox is called before loadInquirer', async () => {
      const { checkbox } = await import('../../src/utils/prompts.js');

      expect(() =>
        checkbox({
          message: 'Select options:',
          choices: [{ name: 'Option', value: 'opt' }],
        })
      ).toThrow('Inquirer not loaded. Call loadInquirer() first.');
    });

    it('should throw error when Separator is instantiated before loadInquirer', async () => {
      const { Separator } = await import('../../src/utils/prompts.js');

      expect(() => new Separator()).toThrow(
        'Inquirer not loaded. Call loadInquirer() first.'
      );
    });

    it('should throw error when search is called before loadInquirer', async () => {
      const { search } = await import('../../src/utils/prompts.js');

      expect(() =>
        search({
          message: 'Search:',
          source: () => [],
        })
      ).toThrow('Inquirer not loaded. Call loadInquirer() first.');
    });
  });

  describe('isInquirerLoaded', () => {
    it('should return false before loadInquirer is called', async () => {
      const { isInquirerLoaded } = await import('../../src/utils/prompts.js');

      expect(isInquirerLoaded()).toBe(false);
    });

    it('should return true after loadInquirer is called', async () => {
      // Mock the @inquirer/prompts module before importing prompts.js
      vi.doMock('@inquirer/prompts', () => ({
        select: vi.fn().mockResolvedValue('selected'),
        confirm: vi.fn().mockResolvedValue(true),
        input: vi.fn().mockResolvedValue('input value'),
        checkbox: vi.fn().mockResolvedValue(['option1']),
        search: vi.fn().mockResolvedValue('searched'),
        Separator: class {
          type = 'separator' as const;
          separator = '---';
        },
      }));

      const { loadInquirer, isInquirerLoaded } =
        await import('../../src/utils/prompts.js');

      await loadInquirer();

      expect(isInquirerLoaded()).toBe(true);
    });
  });

  describe('loadInquirer', () => {
    it('should only load once when called multiple times', async () => {
      vi.doMock('@inquirer/prompts', () => ({
        select: vi.fn(),
        confirm: vi.fn(),
        input: vi.fn(),
        checkbox: vi.fn(),
        search: vi.fn(),
        Separator: class {
          type = 'separator' as const;
          separator = '';
        },
      }));

      const { loadInquirer, isInquirerLoaded } =
        await import('../../src/utils/prompts.js');

      await loadInquirer();
      const firstLoadState = isInquirerLoaded();

      await loadInquirer();
      await loadInquirer();

      expect(firstLoadState).toBe(true);
      expect(isInquirerLoaded()).toBe(true);
    });

    it('should handle import failure gracefully', async () => {
      // Reset modules to test error handling
      vi.resetModules();
      vi.clearAllMocks();

      // Mock import failure
      vi.doMock('@inquirer/prompts', () => {
        throw new Error('Module not found');
      });

      // Mock console.error and process.exit
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      try {
        const { loadInquirer } = await import('../../src/utils/prompts.js');
        await loadInquirer();
      } catch (e) {
        expect((e as Error).message).toContain('process.exit');
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing dependency')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Loaded state functions', () => {
    it('should export functions correctly', async () => {
      // Just verify that the module exports the expected functions
      const prompts = await import('../../src/utils/prompts.js');

      expect(typeof prompts.select).toBe('function');
      expect(typeof prompts.confirm).toBe('function');
      expect(typeof prompts.input).toBe('function');
      expect(typeof prompts.checkbox).toBe('function');
      expect(typeof prompts.search).toBe('function');
      expect(typeof prompts.loadInquirer).toBe('function');
      expect(typeof prompts.isInquirerLoaded).toBe('function');
      expect(prompts.Separator).toBeDefined();
    });
  });
});

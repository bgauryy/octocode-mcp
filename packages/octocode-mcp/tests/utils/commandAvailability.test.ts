/**
 * Tests for command availability checking utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkCommandAvailability,
  checkAllCommandsAvailability,
  getMissingCommandError,
  clearAvailabilityCache,
  REQUIRED_COMMANDS,
} from '../../src/utils/exec/commandAvailability.js';

describe('commandAvailability', () => {
  beforeEach(() => {
    clearAvailabilityCache();
  });

  afterEach(() => {
    clearAvailabilityCache();
  });

  describe('checkCommandAvailability', () => {
    it('should check rg availability', async () => {
      const result = await checkCommandAvailability('rg');

      expect(result.command).toBe('rg');
      expect(typeof result.available).toBe('boolean');
    });

    it('should check find availability', async () => {
      const result = await checkCommandAvailability('find');

      expect(result.command).toBe('find');
      expect(typeof result.available).toBe('boolean');
    });

    it('should check ls availability', async () => {
      const result = await checkCommandAvailability('ls');

      expect(result.command).toBe('ls');
      expect(typeof result.available).toBe('boolean');
    });

    it('should check grep availability', async () => {
      const result = await checkCommandAvailability('grep');

      expect(result.command).toBe('grep');
      expect(typeof result.available).toBe('boolean');
    });

    it('should cache results by default', async () => {
      const result1 = await checkCommandAvailability('ls');
      const result2 = await checkCommandAvailability('ls');

      expect(result1).toBe(result2); // Same object reference
    });

    it('should bypass cache with forceCheck', async () => {
      const result1 = await checkCommandAvailability('ls');
      const result2 = await checkCommandAvailability('ls', true);

      // Results should have same values but could be different objects
      expect(result2.command).toBe(result1.command);
      expect(result2.available).toBe(result1.available);
    });

    it('should return error message when command is not available', async () => {
      // Mock spawnCheckSuccess to return false
      const spawnModule = await import('../../src/utils/exec/spawn.js');
      const spawnSpy = vi
        .spyOn(spawnModule, 'spawnCheckSuccess')
        .mockResolvedValue(false);

      clearAvailabilityCache();

      const result = await checkCommandAvailability('rg', true);

      expect(result.available).toBe(false);
      expect(result.error).toContain('not installed');

      spawnSpy.mockRestore();
    });

    it('should handle spawn errors gracefully', async () => {
      // Mock spawnCheckSuccess to throw an error
      const spawnModule = await import('../../src/utils/exec/spawn.js');
      const spawnSpy = vi
        .spyOn(spawnModule, 'spawnCheckSuccess')
        .mockRejectedValue(new Error('Spawn failed'));

      clearAvailabilityCache();

      const result = await checkCommandAvailability('rg', true);

      expect(result.available).toBe(false);
      expect(result.error).toContain('Spawn failed');

      spawnSpy.mockRestore();
    });

    it('should handle non-Error spawn failures', async () => {
      // Mock spawnCheckSuccess to throw a non-Error
      const spawnModule = await import('../../src/utils/exec/spawn.js');
      const spawnSpy = vi
        .spyOn(spawnModule, 'spawnCheckSuccess')
        .mockRejectedValue('string error');

      clearAvailabilityCache();

      const result = await checkCommandAvailability('rg', true);

      expect(result.available).toBe(false);
      expect(result.error).toContain('Failed to check');

      spawnSpy.mockRestore();
    });
  });

  describe('checkAllCommandsAvailability', () => {
    it('should check all required commands', async () => {
      const results = await checkAllCommandsAvailability();

      expect(results.has('rg')).toBe(true);
      expect(results.has('grep')).toBe(true);
      expect(results.has('find')).toBe(true);
      expect(results.has('ls')).toBe(true);

      // Verify all results have the expected structure
      for (const [command, result] of results) {
        expect(result.command).toBe(command);
        expect(typeof result.available).toBe('boolean');
      }
    });

    it('should return correct command in each result', async () => {
      const results = await checkAllCommandsAvailability();

      expect(results.get('rg')?.command).toBe('rg');
      expect(results.get('grep')?.command).toBe('grep');
      expect(results.get('find')?.command).toBe('find');
      expect(results.get('ls')?.command).toBe('ls');
    });
  });

  describe('getMissingCommandError', () => {
    it('should return install instructions for rg', () => {
      const error = getMissingCommandError('rg');

      expect(error).toContain('ripgrep');
      expect(error).toContain('brew install ripgrep');
    });

    it('should return install instructions for grep', () => {
      const error = getMissingCommandError('grep');

      expect(error).toContain('grep');
      expect(error).toContain('PATH');
    });

    it('should return install instructions for find', () => {
      const error = getMissingCommandError('find');

      expect(error).toContain('find');
      expect(error).toContain('PATH');
    });

    it('should return install instructions for ls', () => {
      const error = getMissingCommandError('ls');

      expect(error).toContain('ls');
      expect(error).toContain('PATH');
    });
  });

  describe('clearAvailabilityCache', () => {
    it('should allow clearing the cache', () => {
      // Just verify the function exists and doesn't throw
      expect(() => clearAvailabilityCache()).not.toThrow();
    });

    it('should clear cached results', async () => {
      // First check creates cache entry
      await checkCommandAvailability('ls');

      // Clear the cache
      clearAvailabilityCache();

      // Force check should work even after clearing
      const result = await checkCommandAvailability('ls', true);
      expect(result.command).toBe('ls');
    });
  });

  describe('POSIX command fast path', () => {
    it('should return available for find without calling spawnCheckSuccess on non-Windows', async () => {
      const spawnModule = await import('../../src/utils/exec/spawn.js');
      const spawnSpy = vi.spyOn(spawnModule, 'spawnCheckSuccess');

      clearAvailabilityCache();

      const result = await checkCommandAvailability('find', true);

      if (process.platform !== 'win32') {
        expect(result.available).toBe(true);
        expect(spawnSpy).not.toHaveBeenCalled();
      }

      spawnSpy.mockRestore();
    });

    it('should return available for ls without calling spawnCheckSuccess on non-Windows', async () => {
      const spawnModule = await import('../../src/utils/exec/spawn.js');
      const spawnSpy = vi.spyOn(spawnModule, 'spawnCheckSuccess');

      clearAvailabilityCache();

      const result = await checkCommandAvailability('ls', true);

      if (process.platform !== 'win32') {
        expect(result.available).toBe(true);
        expect(spawnSpy).not.toHaveBeenCalled();
      }

      spawnSpy.mockRestore();
    });

    it('should return available for grep without calling spawnCheckSuccess on non-Windows', async () => {
      const spawnModule = await import('../../src/utils/exec/spawn.js');
      const spawnSpy = vi.spyOn(spawnModule, 'spawnCheckSuccess');

      clearAvailabilityCache();

      const result = await checkCommandAvailability('grep', true);

      if (process.platform !== 'win32') {
        expect(result.available).toBe(true);
        expect(spawnSpy).not.toHaveBeenCalled();
      }

      spawnSpy.mockRestore();
    });

    it('should still call spawnCheckSuccess for rg (not POSIX)', async () => {
      const spawnModule = await import('../../src/utils/exec/spawn.js');
      const spawnSpy = vi
        .spyOn(spawnModule, 'spawnCheckSuccess')
        .mockResolvedValue(true);

      clearAvailabilityCache();

      await checkCommandAvailability('rg', true);

      expect(spawnSpy).toHaveBeenCalled();

      spawnSpy.mockRestore();
    });
  });

  describe('REQUIRED_COMMANDS', () => {
    it('should have required commands defined', () => {
      expect(REQUIRED_COMMANDS.rg).toBeDefined();
      expect(REQUIRED_COMMANDS.grep).toBeDefined();
      expect(REQUIRED_COMMANDS.find).toBeDefined();
      expect(REQUIRED_COMMANDS.ls).toBeDefined();
    });

    it('should have correct tool names', () => {
      expect(REQUIRED_COMMANDS.rg.tool).toBe('localSearchCode');
      expect(REQUIRED_COMMANDS.grep.tool).toBe('localSearchCode (fallback)');
      expect(REQUIRED_COMMANDS.find.tool).toBe('localFindFiles');
      expect(REQUIRED_COMMANDS.ls.tool).toBe('localViewStructure');
    });

    it('should have correct command names', () => {
      expect(REQUIRED_COMMANDS.rg.name).toBe('ripgrep');
      expect(REQUIRED_COMMANDS.grep.name).toBe('grep');
      expect(REQUIRED_COMMANDS.find.name).toBe('find');
      expect(REQUIRED_COMMANDS.ls.name).toBe('ls');
    });

    it('should have version flags', () => {
      expect(REQUIRED_COMMANDS.rg.versionFlag).toBe('--version');
      expect(REQUIRED_COMMANDS.grep.versionFlag).toBe('--version');
      expect(REQUIRED_COMMANDS.find.versionFlag).toBe('--version');
      expect(REQUIRED_COMMANDS.ls.versionFlag).toBe('--version');
    });
  });
});

/**
 * Tests for command availability checking utilities
 */

import { describe, it, expect } from 'vitest';
import {
  getMissingCommandError,
  clearAvailabilityCache,
  REQUIRED_COMMANDS,
} from '../../src/utils/exec/commandAvailability.js';

describe('commandAvailability', () => {
  describe('getMissingCommandError', () => {
    it('should return install instructions for rg', () => {
      const error = getMissingCommandError('rg');

      expect(error).toContain('ripgrep');
      expect(error).toContain('brew install ripgrep');
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
  });

  describe('REQUIRED_COMMANDS', () => {
    it('should have required commands defined', () => {
      expect(REQUIRED_COMMANDS.rg).toBeDefined();
      expect(REQUIRED_COMMANDS.find).toBeDefined();
      expect(REQUIRED_COMMANDS.ls).toBeDefined();
    });

    it('should have correct tool names', () => {
      expect(REQUIRED_COMMANDS.rg.tool).toBe('localSearchCode');
      expect(REQUIRED_COMMANDS.find.tool).toBe('localFindFiles');
      expect(REQUIRED_COMMANDS.ls.tool).toBe('localViewStructure');
    });

    it('should have correct command names', () => {
      expect(REQUIRED_COMMANDS.rg.name).toBe('ripgrep');
      expect(REQUIRED_COMMANDS.find.name).toBe('find');
      expect(REQUIRED_COMMANDS.ls.name).toBe('ls');
    });
  });
});

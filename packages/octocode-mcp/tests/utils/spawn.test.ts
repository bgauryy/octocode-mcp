/**
 * Tests for spawn.ts utilities - validateArgs function
 *
 * NOTE: The spawn* functions are tested via integration tests since they require
 * real process execution. The global child_process mock in test setup prevents
 * unit testing those functions directly. Use commandAvailability.test.ts for
 * spawn-related integration tests.
 *
 * This file tests validateArgs which is a pure function without spawn dependencies.
 */

import { describe, it, expect } from 'vitest';
import { validateArgs } from '../../src/utils/exec/spawn.js';

describe('spawn utilities - validateArgs', () => {
  describe('validateArgs', () => {
    it('should accept valid arguments', () => {
      const result = validateArgs(['arg1', 'arg2', 'arg3']);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject arguments with null bytes', () => {
      const result = validateArgs(['valid', 'has\0null', 'also valid']);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Null bytes');
    });

    it('should reject arguments with null byte at start', () => {
      const result = validateArgs(['\0test']);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Null bytes');
    });

    it('should reject arguments with null byte at end', () => {
      const result = validateArgs(['test\0']);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Null bytes');
    });

    it('should reject arguments with multiple null bytes', () => {
      const result = validateArgs(['te\0st\0']);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Null bytes');
    });

    it('should reject arguments that are too long', () => {
      const longArg = 'a'.repeat(1001);
      const result = validateArgs([longArg]);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should accept arguments at exact max length', () => {
      const maxArg = 'a'.repeat(1000);
      const result = validateArgs([maxArg]);

      expect(result.valid).toBe(true);
    });

    it('should use custom max length', () => {
      const result = validateArgs(['short', 'medium'], 5);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should accept arguments within custom max length', () => {
      const result = validateArgs(['ab'], 2);

      expect(result.valid).toBe(true);
    });

    it('should accept empty arguments array', () => {
      const result = validateArgs([]);

      expect(result.valid).toBe(true);
    });

    it('should accept empty strings as arguments', () => {
      const result = validateArgs(['', 'valid']);

      expect(result.valid).toBe(true);
    });

    it('should accept single empty string argument', () => {
      const result = validateArgs(['']);

      expect(result.valid).toBe(true);
    });

    it('should validate all arguments in array', () => {
      // First arg has null byte
      expect(validateArgs(['has\0null', 'valid', 'valid']).valid).toBe(false);

      // Last arg has null byte
      expect(validateArgs(['valid', 'valid', 'has\0null']).valid).toBe(false);

      // Middle arg has null byte
      expect(validateArgs(['valid', 'has\0null', 'valid']).valid).toBe(false);
    });

    it('should validate length of all arguments in array', () => {
      const longArg = 'a'.repeat(1001);

      // First arg too long
      expect(validateArgs([longArg, 'short', 'short']).valid).toBe(false);

      // Last arg too long
      expect(validateArgs(['short', 'short', longArg]).valid).toBe(false);

      // Middle arg too long
      expect(validateArgs(['short', longArg, 'short']).valid).toBe(false);
    });

    it('should handle unicode characters correctly', () => {
      // Unicode characters should be allowed
      const result = validateArgs(['こんにちは', '你好', '🎉']);

      expect(result.valid).toBe(true);
    });

    it('should count length by JavaScript string length (code units)', () => {
      // '🎉' is represented as 2 code units in JavaScript (surrogate pair)
      // So 500 emoji = 1000 code units = at max length
      const unicodeArg = '🎉'.repeat(500);
      const result = validateArgs([unicodeArg]);

      // Note: '🎉'.length === 2 in JavaScript (surrogate pair)
      expect(result.valid).toBe(true);

      // 501 emoji = 1002 code units = over max length
      const tooLong = '🎉'.repeat(501);
      expect(validateArgs([tooLong]).valid).toBe(false);
    });

    it('should handle special characters correctly', () => {
      const result = validateArgs([
        'path/to/file',
        '--flag=value',
        '-x',
        'arg with spaces',
        '"quoted"',
        "'single quoted'",
        'back\\slash',
        'tab\there',
        'newline\nhere',
      ]);

      expect(result.valid).toBe(true);
    });

    it('should return specific error for null bytes', () => {
      const result = validateArgs(['has\0null']);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Null bytes not allowed in arguments');
    });

    it('should return specific error for too long arguments', () => {
      const longArg = 'a'.repeat(1001);
      const result = validateArgs([longArg]);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Argument too long');
    });

    it('should check null bytes before length', () => {
      // Argument with null byte AND too long
      const longWithNull = 'a'.repeat(1001) + '\0';
      const result = validateArgs([longWithNull]);

      // Should fail on null byte check first (iterated first in loop)
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Null bytes');
    });

    it('should handle very large arrays', () => {
      const manyArgs = Array.from({ length: 1000 }, (_, i) => `arg${i}`);
      const result = validateArgs(manyArgs);

      expect(result.valid).toBe(true);
    });

    it('should handle custom max length of 0', () => {
      // Zero max length means only empty strings are allowed
      expect(validateArgs([''], 0).valid).toBe(true);
      expect(validateArgs(['a'], 0).valid).toBe(false);
    });
  });
});

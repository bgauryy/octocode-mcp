import { describe, it, expect } from 'vitest';
import { assertDefined, assert, assertNever } from '../../src/utils/assert.js';

describe('Assert Utilities', () => {
  describe('assertDefined', () => {
    it('should return the value when defined', () => {
      expect(assertDefined('hello', 'should be defined')).toBe('hello');
      expect(assertDefined(0, 'should be defined')).toBe(0);
      expect(assertDefined(false, 'should be defined')).toBe(false);
      expect(assertDefined('', 'should be defined')).toBe('');
    });

    it('should return objects when defined', () => {
      const obj = { foo: 'bar' };
      expect(assertDefined(obj, 'should be defined')).toBe(obj);
    });

    it('should return arrays when defined', () => {
      const arr = [1, 2, 3];
      expect(assertDefined(arr, 'should be defined')).toBe(arr);
    });

    it('should throw when value is null', () => {
      expect(() => assertDefined(null, 'value was null')).toThrow(
        'Assertion failed: value was null'
      );
    });

    it('should throw when value is undefined', () => {
      expect(() => assertDefined(undefined, 'value was undefined')).toThrow(
        'Assertion failed: value was undefined'
      );
    });

    it('should include custom message in error', () => {
      expect(() => assertDefined(null, 'Analysis should be populated')).toThrow(
        'Assertion failed: Analysis should be populated'
      );
    });
  });

  describe('assert', () => {
    it('should not throw when condition is true', () => {
      expect(() => assert(true, 'should pass')).not.toThrow();
      expect(() => assert(1 === 1, 'should pass')).not.toThrow();
      expect(() => assert(Boolean('truthy'), 'should pass')).not.toThrow();
    });

    it('should throw when condition is false', () => {
      expect(() => assert(false, 'condition was false')).toThrow(
        'Assertion failed: condition was false'
      );
    });

    it('should throw with custom message', () => {
      expect(() => assert(1 > 2, 'math is broken')).toThrow(
        'Assertion failed: math is broken'
      );
    });
  });

  describe('assertNever', () => {
    it('should throw with default message', () => {
      const value = 'unexpected' as never;
      expect(() => assertNever(value)).toThrow(
        'Unexpected value: "unexpected"'
      );
    });

    it('should throw with custom message', () => {
      const value = 'bad' as never;
      expect(() => assertNever(value, 'Invalid state reached')).toThrow(
        'Invalid state reached'
      );
    });

    it('should stringify objects in default message', () => {
      const value = { type: 'unknown' } as never;
      expect(() => assertNever(value)).toThrow(
        'Unexpected value: {"type":"unknown"}'
      );
    });
  });
});

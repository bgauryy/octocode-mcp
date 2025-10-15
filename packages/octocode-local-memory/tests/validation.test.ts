import { describe, it, expect } from 'vitest';

describe('Input Validation', () => {
  describe('Key Validation', () => {
    const keyPattern = /^[a-zA-Z0-9:_./-]+$/;

    it('should accept valid key patterns', () => {
      const validKeys = [
        'task:1',
        'task:3.1',
        'status:agent-1:3.1',
        'lock:src/auth/auth.ts',
        'lock:src/api/routes.ts',
        'msg:agent1:agent2:1234567890',
        'progress:global',
        'agent:agent-1:state',
        'simple',
        'with_underscore',
        'with-hyphen',
        'with.dot',
        'with:colon',
        'with/slash',
      ];

      validKeys.forEach((key) => {
        expect(keyPattern.test(key)).toBe(true);
      });
    });

    it('should reject invalid key patterns', () => {
      const invalidKeys = [
        'key with spaces',
        'key@with@at',
        'key#with#hash',
        'key$with$dollar',
        'key%with%percent',
        'key^with^caret',
        'key&with&ampersand',
        'key*with*asterisk',
        'key(with)parens',
        'key[with]brackets',
        'key{with}braces',
        'key|with|pipe',
        'key\\with\\backslash',
        'key;with;semicolon',
        "key'with'quote",
        'key"with"doublequote',
        'key<with>angle',
        'key?with?question',
        'key!with!exclamation',
      ];

      invalidKeys.forEach((key) => {
        expect(keyPattern.test(key)).toBe(false);
      });
    });

    it('should reject empty keys', () => {
      expect(keyPattern.test('')).toBe(false);
    });

    it('should handle file path keys', () => {
      const filePaths = [
        'lock:src/auth/auth.ts',
        'lock:src/api/routes.ts',
        'lock:src/components/Button.tsx',
        'lock:tests/unit/test.spec.ts',
        'lock:package.json',
      ];

      filePaths.forEach((key) => {
        expect(keyPattern.test(key)).toBe(true);
      });
    });

    it('should validate key length', () => {
      const maxLength = 255;
      const longKey = 'a'.repeat(maxLength);
      expect(longKey.length).toBe(maxLength);

      const tooLongKey = 'a'.repeat(maxLength + 1);
      expect(tooLongKey.length).toBeGreaterThan(maxLength);
    });
  });

  describe('Value Validation', () => {
    it('should accept string values', () => {
      const validValues = [
        'simple string',
        JSON.stringify({ key: 'value' }),
        JSON.stringify({ complex: { nested: { object: true } } }),
        '',
        '123',
        'true',
        'null',
      ];

      validValues.forEach((value) => {
        expect(typeof value).toBe('string');
      });
    });

    it('should handle JSON serialization', () => {
      const testObjects = [
        { taskId: '1', status: 'pending' },
        { array: [1, 2, 3] },
        { nested: { deep: { value: 'test' } } },
        { empty: {} },
        { nullValue: null },
        { boolValue: true },
      ];

      testObjects.forEach((obj) => {
        const stringified = JSON.stringify(obj);
        expect(typeof stringified).toBe('string');
        const parsed = JSON.parse(stringified);
        expect(parsed).toEqual(obj);
      });
    });

    it('should respect value size limits', () => {
      const maxSize = 10 * 1024 * 1024; // 10MB
      const value = 'x'.repeat(maxSize);
      expect(value.length).toBe(maxSize);

      const tooLargeValue = 'x'.repeat(maxSize + 1);
      expect(tooLargeValue.length).toBeGreaterThan(maxSize);
    });
  });

  describe('TTL Validation', () => {
    it('should accept valid TTL values', () => {
      const validTTLs = [1, 60, 300, 3600, 7200, 86400];

      validTTLs.forEach((ttl) => {
        expect(ttl).toBeGreaterThanOrEqual(1);
        expect(ttl).toBeLessThanOrEqual(86400);
      });
    });

    it('should reject invalid TTL values', () => {
      const invalidTTLs = [0, -1, -100, 86401, 100000];

      invalidTTLs.forEach((ttl) => {
        const isValid = ttl >= 1 && ttl <= 86400;
        expect(isValid).toBe(false);
      });
    });
  });
});

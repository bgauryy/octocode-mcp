import { describe, it, expect } from 'vitest';
import { tokenOptimizer } from '../src/tokenOptimizer';

describe('tokenOptimizer Quoting Behavior', () => {
  describe('Basic quoting rules', () => {
    it('should quote only strings, not numbers or booleans in simple objects', () => {
      const input = {
        stringValue: 'hello world',
        numberValue: 42,
        booleanTrue: true,
        booleanFalse: false,
        zeroValue: 0,
        negativeNumber: -123,
        floatNumber: 3.14,
      };

      const yaml = tokenOptimizer(input);

      // Strings should be quoted
      expect(yaml).toContain('stringValue: "hello world"');

      // Numbers should NOT be quoted
      expect(yaml).toContain('numberValue: 42');
      expect(yaml).toContain('zeroValue: 0');
      expect(yaml).toContain('negativeNumber: -123');
      expect(yaml).toContain('floatNumber: 3.14');

      // Booleans should NOT be quoted
      expect(yaml).toContain('booleanTrue: true');
      expect(yaml).toContain('booleanFalse: false');
    });

    it('should quote only strings in arrays', () => {
      const input = {
        mixedArray: ['string1', 42, true, false, 0, 'string2', -5, 3.14],
      };

      const yaml = tokenOptimizer(input);

      // Strings in arrays should be quoted
      expect(yaml).toContain('- "string1"');
      expect(yaml).toContain('- "string2"');

      // Numbers in arrays should NOT be quoted
      expect(yaml).toContain('- 42');
      expect(yaml).toContain('- 0');
      expect(yaml).toContain('- -5');
      expect(yaml).toContain('- 3.14');

      // Booleans in arrays should NOT be quoted
      expect(yaml).toContain('- true');
      expect(yaml).toContain('- false');
    });

    it('should quote only strings in nested objects', () => {
      const input = {
        level1: {
          stringProp: 'nested string',
          numberProp: 100,
          boolProp: true,
          level2: {
            deepString: 'deep value',
            deepNumber: 999,
            deepBool: false,
            level3: {
              veryDeepString: 'very deep',
              veryDeepNumber: 0,
              veryDeepBool: true,
            },
          },
        },
      };

      const yaml = tokenOptimizer(input);

      // All strings should be quoted at any nesting level
      expect(yaml).toContain('stringProp: "nested string"');
      expect(yaml).toContain('deepString: "deep value"');
      expect(yaml).toContain('veryDeepString: "very deep"');

      // All numbers should NOT be quoted at any nesting level
      expect(yaml).toContain('numberProp: 100');
      expect(yaml).toContain('deepNumber: 999');
      expect(yaml).toContain('veryDeepNumber: 0');

      // All booleans should NOT be quoted at any nesting level
      expect(yaml).toContain('boolProp: true');
      expect(yaml).toContain('deepBool: false');
      expect(yaml).toContain('veryDeepBool: true');
    });

    it('should quote only strings in arrays within nested objects', () => {
      const input = {
        data: {
          items: [
            { name: 'item1', count: 5, active: true },
            { name: 'item2', count: 0, active: false },
            'plain string',
            42,
            true,
          ],
          metadata: {
            tags: ['tag1', 'tag2'],
            counts: [1, 2, 3],
            flags: [true, false, true],
          },
        },
      };

      const yaml = tokenOptimizer(input);

      // Strings in nested arrays should be quoted
      expect(yaml).toContain('name: "item1"');
      expect(yaml).toContain('name: "item2"');
      expect(yaml).toContain('- "plain string"');
      expect(yaml).toContain('- "tag1"');
      expect(yaml).toContain('- "tag2"');

      // Numbers in nested arrays should NOT be quoted
      expect(yaml).toContain('count: 5');
      expect(yaml).toContain('count: 0');
      expect(yaml).toContain('- 42');
      expect(yaml).toContain('- 1');
      expect(yaml).toContain('- 2');
      expect(yaml).toContain('- 3');

      // Booleans in nested arrays should NOT be quoted
      expect(yaml).toContain('active: true');
      expect(yaml).toContain('active: false');
      expect(yaml).toContain('- true');
      expect(yaml).toContain('- false');
    });
  });

  describe('Empty string removal', () => {
    it('should remove empty strings from simple objects when removeRedundant is true', () => {
      const input = {
        validString: 'keep me',
        emptyString: '',
        number: 42,
        boolean: true,
      };

      const yaml = tokenOptimizer(input, { removeRedundant: true });

      expect(yaml).toContain('validString: "keep me"');
      expect(yaml).toContain('number: 42');
      expect(yaml).toContain('boolean: true');
      expect(yaml).not.toContain('emptyString');
      expect(yaml).not.toContain('""');
    });

    it('should remove empty strings from arrays recursively when removeRedundant is true', () => {
      const input = {
        mixedArray: [
          'valid string',
          '',
          42,
          true,
          '',
          'another valid string',
          0,
          false,
        ],
      };

      const yaml = tokenOptimizer(input, { removeRedundant: true });

      expect(yaml).toContain('- "valid string"');
      expect(yaml).toContain('- "another valid string"');
      expect(yaml).toContain('- 42');
      expect(yaml).toContain('- 0');
      expect(yaml).toContain('- true');
      expect(yaml).toContain('- false');

      // Should not contain empty strings
      expect(yaml).not.toContain('- ""');
    });

    it('should remove empty strings from nested objects recursively when removeRedundant is true', () => {
      const input = {
        level1: {
          validString: 'keep',
          emptyString: '',
          number: 123,
          level2: {
            anotherEmpty: '',
            validString2: 'also keep',
            boolean: true,
            level3: {
              deepEmpty: '',
              deepValid: 'deep value',
              deepNumber: 0,
            },
          },
        },
        topLevelEmpty: '',
        topLevelValid: 'top level',
      };

      const yaml = tokenOptimizer(input, { removeRedundant: true });

      // Valid strings should be preserved and quoted
      expect(yaml).toContain('validString: "keep"');
      expect(yaml).toContain('validString2: "also keep"');
      expect(yaml).toContain('deepValid: "deep value"');
      expect(yaml).toContain('topLevelValid: "top level"');

      // Numbers and booleans should be preserved and not quoted
      expect(yaml).toContain('number: 123');
      expect(yaml).toContain('boolean: true');
      expect(yaml).toContain('deepNumber: 0');

      // Empty strings should be removed at all levels
      expect(yaml).not.toContain('emptyString');
      expect(yaml).not.toContain('anotherEmpty');
      expect(yaml).not.toContain('deepEmpty');
      expect(yaml).not.toContain('topLevelEmpty');
      expect(yaml).not.toContain('""');
    });

    it('should remove empty strings from complex nested structures when removeRedundant is true', () => {
      const input = {
        users: [
          {
            name: 'Alice',
            bio: '',
            age: 25,
            active: true,
            tags: ['admin', '', 'user', ''],
            settings: {
              theme: 'dark',
              description: '',
              notifications: true,
              customCss: '',
            },
          },
          {
            name: 'Bob',
            bio: 'Developer',
            age: 30,
            active: false,
            tags: ['', 'developer'],
            settings: {
              theme: '',
              description: 'Custom description',
              notifications: false,
              customCss: '',
            },
          },
        ],
        metadata: {
          title: 'User List',
          description: '',
          version: 1,
          deprecated: false,
        },
      };

      const yaml = tokenOptimizer(input, { removeRedundant: true });

      // Valid strings should be quoted
      expect(yaml).toContain('name: "Alice"');
      expect(yaml).toContain('name: "Bob"');
      expect(yaml).toContain('bio: "Developer"');
      expect(yaml).toContain('theme: "dark"');
      expect(yaml).toContain('- "admin"');
      expect(yaml).toContain('- "user"');
      expect(yaml).toContain('- "developer"');
      expect(yaml).toContain('title: "User List"');
      expect(yaml).toContain('description: "Custom description"');

      // Numbers and booleans should not be quoted
      expect(yaml).toContain('age: 25');
      expect(yaml).toContain('age: 30');
      expect(yaml).toContain('active: true');
      expect(yaml).toContain('active: false');
      expect(yaml).toContain('notifications: true');
      expect(yaml).toContain('notifications: false');
      expect(yaml).toContain('version: 1');
      expect(yaml).toContain('deprecated: false');

      // Empty strings should be completely removed
      expect(yaml).not.toContain('bio: ""');
      expect(yaml).not.toContain('description: ""');
      expect(yaml).not.toContain('customCss');
      expect(yaml).not.toContain('theme: ""');

      // Should not contain any empty string literals
      const emptyStringMatches = yaml.match(/: ""/g);
      expect(emptyStringMatches).toBeNull();

      const arrayEmptyStringMatches = yaml.match(/- ""/g);
      expect(arrayEmptyStringMatches).toBeNull();
    });

    it('should preserve empty strings when removeRedundant is false', () => {
      const input = {
        validString: 'keep me',
        emptyString: '',
        number: 42,
      };

      const yaml = tokenOptimizer(input, { removeRedundant: false });

      expect(yaml).toContain('validString: "keep me"');
      expect(yaml).toContain('emptyString: ""');
      expect(yaml).toContain('number: 42');
    });
  });

  describe('Edge cases', () => {
    it('should handle strings that look like numbers or booleans', () => {
      const input = {
        stringNumber: '42',
        stringBoolean: 'true',
        stringFalse: 'false',
        stringZero: '0',
        actualNumber: 42,
        actualBoolean: true,
      };

      const yaml = tokenOptimizer(input);

      // String representations should be quoted
      expect(yaml).toContain('stringNumber: "42"');
      expect(yaml).toContain('stringBoolean: "true"');
      expect(yaml).toContain('stringFalse: "false"');
      expect(yaml).toContain('stringZero: "0"');

      // Actual values should not be quoted
      expect(yaml).toContain('actualNumber: 42');
      expect(yaml).toContain('actualBoolean: true');
    });

    it('should handle special string values', () => {
      const input = {
        nullString: 'null',
        undefinedString: 'undefined',
        nanString: 'NaN',
        actualNull: null,
        actualNumber: NaN,
      };

      const yaml = tokenOptimizer(input);

      // String representations should be quoted
      expect(yaml).toContain('nullString: "null"');
      expect(yaml).toContain('undefinedString: "undefined"');
      expect(yaml).toContain('nanString: "NaN"');

      // Actual values should not be quoted
      expect(yaml).toContain('actualNull: null');
      expect(yaml).toContain('actualNumber: .nan');
    });
  });
});

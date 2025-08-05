import { describe, it, expect } from 'vitest';
import jsonToLLMString from '../../src/utils/jsonToLLMString';

describe('jsonToLLMString', () => {
  describe('Primitive Values', () => {
    it('should handle strings without quotes', () => {
      expect(jsonToLLMString('hello world')).toBe('hello world');
      expect(jsonToLLMString('')).toBe('');
    });

    it('should handle numbers', () => {
      expect(jsonToLLMString(42)).toBe('42');
      expect(jsonToLLMString(0)).toBe('0');
      expect(jsonToLLMString(-1.5)).toBe('-1.5');
    });

    it('should handle booleans', () => {
      expect(jsonToLLMString(true)).toBe('yes');
      expect(jsonToLLMString(false)).toBe('no');
    });

    it('should handle null', () => {
      expect(jsonToLLMString(null)).toBe('none');
    });

    it('should handle undefined', () => {
      expect(jsonToLLMString(undefined)).toBe('undefined');
    });
  });

  describe('Arrays', () => {
    it('should handle empty arrays', () => {
      expect(jsonToLLMString([])).toBe('empty');
    });

    it('should handle simple arrays', () => {
      expect(jsonToLLMString([1, 2, 3])).toBe('1, 2, 3');
      expect(jsonToLLMString(['a', 'b', 'c'])).toBe('a, b, c');
      expect(jsonToLLMString([true, false, null])).toBe('yes, no, null');
    });

    it('should handle mixed primitive arrays', () => {
      expect(jsonToLLMString([1, 'hello', true, null])).toBe(
        '1, hello, yes, null'
      );
    });

    it('should handle arrays of objects', () => {
      const input = [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ];
      const expected = `Item 1:
  Name: John
  Age: 30
Item 2:
  Name: Jane
  Age: 25`;
      expect(jsonToLLMString(input)).toBe(expected);
    });

    it('should handle nested arrays', () => {
      const input = [
        [1, 2],
        [3, 4],
      ];
      const expected = `Item 1: 1, 2
Item 2: 3, 4`;
      expect(jsonToLLMString(input)).toBe(expected);
    });
  });

  describe('Objects', () => {
    it('should handle empty objects', () => {
      expect(jsonToLLMString({})).toBe('empty');
    });

    it('should handle simple objects', () => {
      const input = { name: 'John', age: 30, active: true };
      const expected = `Name: John
Age: 30
Active: yes`;
      expect(jsonToLLMString(input)).toBe(expected);
    });

    it('should handle semantic labels', () => {
      const input = { path: '/file.txt', size: 1024, data: 'content' };
      const expected = `File: /file.txt
Size: 1024
Contents: content`;
      expect(jsonToLLMString(input)).toBe(expected);
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: 'John',
          address: {
            city: 'New York',
            country: 'USA',
          },
        },
      };
      const expected = `User:
  Name: John
  Address:
    City: New York
    Country: USA`;
      expect(jsonToLLMString(input)).toBe(expected);
    });

    it('should handle objects with null values', () => {
      const input = { name: 'John', email: null, phone: undefined };
      const expected = `Name: John
Email: none
Phone: undefined`;
      expect(jsonToLLMString(input)).toBe(expected);
    });
  });

  describe('Edge Cases', () => {
    it('should handle circular references', () => {
      const obj: Record<string, unknown> = { name: 'test' };
      obj.self = obj;
      expect(jsonToLLMString(obj)).toContain('[Circular reference]');
    });

    it('should handle max depth limit', () => {
      const deepObj = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  level6: {
                    level7: {
                      level8: { level9: { level10: { level11: 'too deep' } } },
                    },
                  },
                },
              },
            },
          },
        },
      };
      expect(jsonToLLMString(deepObj, 0, 5)).toContain('[Max depth reached]');
    });

    it('should handle functions', () => {
      const input = { func: () => 'test' };
      expect(jsonToLLMString(input)).toContain('() =>');
    });

    it('should handle symbols', () => {
      const input = { sym: Symbol('test') };
      expect(jsonToLLMString(input)).toContain('Symbol');
    });

    it('should handle Date objects', () => {
      const date = new Date('2023-01-01');
      const input = { created: date };
      expect(jsonToLLMString(input)).toContain('2023');
    });

    it('should handle RegExp objects', () => {
      const input = { pattern: /test/g };
      expect(jsonToLLMString(input)).toContain('/test/g');
    });
  });

  describe('Complex Structures', () => {
    it('should handle mixed complex data', () => {
      const input = {
        users: [
          { name: 'John', roles: ['admin', 'user'] },
          { name: 'Jane', roles: ['user'] },
        ],
        settings: {
          theme: 'dark',
          notifications: true,
          limits: { maxUsers: 100, maxStorage: 1024 },
        },
      };

      const result = jsonToLLMString(input);
      expect(result).toContain('Users:');
      expect(result).toContain('Settings:');
      expect(result).toContain('Roles: admin, user');
      expect(result).toContain('Theme: dark');
      expect(result).toContain('Notifications: yes');
    });

    it('should handle arrays with mixed types', () => {
      const input = ['string', 42, { name: 'object' }, [1, 2, 3], null, true];

      const result = jsonToLLMString(input);
      expect(result).toContain('Item 1: string');
      expect(result).toContain('Item 2: 42');
      expect(result).toContain('Item');
      expect(result).toContain('Name: object');
      expect(result).toContain('1, 2, 3');
      expect(result).toContain('none');
      expect(result).toContain('yes');
    });
  });

  describe('Performance and Memory', () => {
    it('should handle large arrays efficiently', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
      }));
      const start = performance.now();
      const result = jsonToLLMString(largeArray);
      const end = performance.now();

      expect(result).toContain('Item 1:');
      expect(result).toContain('... [950 more items]');
      expect(end - start).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle deeply nested objects without stack overflow', () => {
      let deepObj: Record<string, unknown> = { value: 'deep' };
      for (let i = 0; i < 50; i++) {
        deepObj = { nested: deepObj };
      }

      expect(() => jsonToLLMString(deepObj)).not.toThrow();
    });
  });

  describe('Semantic Labeling', () => {
    it('should use semantic labels for common keys', () => {
      const input = {
        path: '/file.txt',
        size: 1024,
        data: 'content',
        items: ['a', 'b'],
        type: 'file',
        name: 'test',
        value: 42,
        content: 'text',
        description: 'A test file',
        children: ['child1', 'child2'],
      };

      const result = jsonToLLMString(input);
      expect(result).toContain('File: /file.txt');
      expect(result).toContain('Size: 1024');
      expect(result).toContain('Contents: content');
      expect(result).toContain('Items: a, b');
      expect(result).toContain('Type: file');
      expect(result).toContain('Name: test');
      expect(result).toContain('Value: 42');
      expect(result).toContain('Content: text');
      expect(result).toContain('Description: A test file');
      expect(result).toContain('Subitems: child1, child2');
    });

    it('should use GitHub-specific semantic labels', () => {
      const input = {
        owner: 'octocat',
        repo: 'test-repo',
        branch: 'main',
        commit: 'abc123',
        sha: 'def456',
        author: 'John Doe',
        created: '2023-01-01',
        updated: '2023-01-02',
        pushed: '2023-01-03',
        stars: 100,
        forks: 50,
        language: 'TypeScript',
        topics: ['web', 'api'],
        license: 'MIT',
      };

      const result = jsonToLLMString(input);
      expect(result).toContain('Owner: octocat');
      expect(result).toContain('Repository: test-repo');
      expect(result).toContain('Branch: main');
      expect(result).toContain('Commit: abc123');
      expect(result).toContain('SHA: def456');
      expect(result).toContain('Author: John Doe');
      expect(result).toContain('Created: 2023-01-01');
      expect(result).toContain('Updated: 2023-01-02');
      expect(result).toContain('Last Pushed: 2023-01-03');
      expect(result).toContain('Stars: 100');
      expect(result).toContain('Forks: 50');
      expect(result).toContain('Language: TypeScript');
      expect(result).toContain('Topics: web, api');
      expect(result).toContain('License: MIT');
    });

    it('should use NPM-specific semantic labels', () => {
      const input = {
        version: '1.0.0',
        package: 'test-package',
        dependencies: { lodash: '^4.17.21' },
        devDependencies: { jest: '^27.0.0' },
        scripts: { test: 'jest' },
        engines: { node: '>=14' },
        keywords: ['test', 'utility'],
        homepage: 'https://example.com',
        repository: 'github:user/repo',
        bugs: 'https://github.com/user/repo/issues',
        maintainers: ['John Doe'],
      };

      const result = jsonToLLMString(input);
      expect(result).toContain('Version: 1.0.0');
      expect(result).toContain('Package: test-package');
      expect(result).toContain('Dependencies:');
      expect(result).toContain('Dev Dependencies:');
      expect(result).toContain('Scripts:');
      expect(result).toContain('Engines:');
      expect(result).toContain('Keywords: test, utility');
      expect(result).toContain('Homepage: https://example.com');
      expect(result).toContain('Repository: github:user/repo');
      expect(result).toContain('Bugs: https://github.com/user/repo/issues');
      expect(result).toContain('Maintainers: John Doe');
    });

    it('should capitalize unknown keys', () => {
      const input = { customKey: 'value', anotherKey: 123 };
      const result = jsonToLLMString(input);
      expect(result).toContain('CustomKey: value');
      expect(result).toContain('AnotherKey: 123');
    });
  });

  describe('Token Efficiency Features', () => {
    it('should truncate long strings', () => {
      const longString = 'a'.repeat(1500);
      const result = jsonToLLMString(longString, 0, 10, null, '', 1000, 50);
      expect(result).toContain('... [truncated]');
      expect(result.length).toBeLessThan(1100); // 1000 + truncation message
    });

    it('should limit array items', () => {
      const largeArray = Array.from({ length: 100 }, (_, i) => `item${i}`);
      const result = jsonToLLMString(largeArray, 0, 10, null, '', 1000, 10);
      expect(result).toContain('... [90 more items]');
      expect(result.split(',').length).toBeLessThan(15); // 10 items + truncation
    });

    it('should limit array of objects', () => {
      const largeObjectArray = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
      }));
      const result = jsonToLLMString(
        largeObjectArray,
        0,
        10,
        null,
        '',
        1000,
        5
      );
      expect(result).toContain('... [95 more items]');
      // Should have 5 items + truncation message, so expect around 6-7 "Item" occurrences
      expect(result.split('Item ').length).toBeLessThan(12);
    });

    it('should not truncate when limits are not exceeded', () => {
      const shortString = 'short';
      const result = jsonToLLMString(shortString, 0, 10, null, '', 1000, 50);
      expect(result).toBe('short');
      expect(result).not.toContain('... [truncated]');
    });
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { createByEncoderName } from '@microsoft/tiktokenizer';
import { tokenOptimizer, tokenOptimizerConfig } from '../src/tokenOptimizer';

let tiktoken: { encode: (text: string) => number[] };

beforeAll(async () => {
  tiktoken = await createByEncoderName('o200k_base'); // GPT-5 / ChatGPT-5
});

function countTokens(text: string): number {
  const tokens = tiktoken.encode(text);
  return tokens.length;
}

function calculateTokenSavingsPercentage(
  jsonTokens: number,
  yamlTokens: number
): number {
  return Math.round(((jsonTokens - yamlTokens) / jsonTokens) * 100 * 100) / 100;
}

describe('tokenOptimizer Configuration Options', () => {
  const testData = {
    name: 'John Doe',
    age: 30,
    id: 'user-123',
    type: 'person',
    description: 'A test user',
    active: true,
    email: 'john@example.com',
    version: '1.0.0',
    status: 'active',
    url: 'https://example.com',
    path: '/users/john',
    roles: ['admin', 'user'],
    settings: {
      theme: 'dark',
      notifications: true,
      language: 'en',
    },
  };

  describe('Default behavior (no configuration)', () => {
    it('should preserve original key order when no config is provided', () => {
      const yaml = tokenOptimizer(testData);
      const lines = yaml.split('\n').filter(line => line.trim());

      // Should start with 'name' as it's first in the original object
      expect(lines[0]).toBe('name: "John Doe"');
      expect(lines[1]).toBe('age: 30');
      expect(lines[2]).toBe('id: "user-123"');
    });

    it('should preserve original key order with empty config', () => {
      const yaml = tokenOptimizer(testData, {});
      const lines = yaml.split('\n').filter(line => line.trim());

      expect(lines[0]).toBe('name: "John Doe"');
      expect(lines[1]).toBe('age: 30');
      expect(lines[2]).toBe('id: "user-123"');
    });
  });

  describe('sortKeys: true configuration', () => {
    it('should sort keys alphabetically when sortKeys is true', () => {
      const config: tokenOptimizerConfig = { sortKeys: true };
      const yaml = tokenOptimizer(testData, config);
      const lines = yaml
        .split('\n')
        .filter(line => line.trim() && !line.startsWith(' '));

      // Top-level keys should be in alphabetical order
      expect(lines[0]).toBe('active: true');
      expect(lines[1]).toBe('age: 30');
      expect(lines[2]).toBe('description: "A test user"');
      expect(lines[3]).toBe('email: "john@example.com"');
      expect(lines[4]).toBe('id: "user-123"');
      expect(lines[5]).toBe('name: "John Doe"');
    });

    it('should sort nested object keys alphabetically', () => {
      const config: tokenOptimizerConfig = { sortKeys: true };
      const yaml = tokenOptimizer(testData, config);

      // Check that nested settings keys are also sorted
      expect(yaml).toContain(
        `settings:
  language: "en"
  notifications: true
  theme: "dark"`
      );
    });

    it('should maintain token efficiency with alphabetical sorting', () => {
      const config: tokenOptimizerConfig = { sortKeys: true };
      const json = JSON.stringify(testData, null, 2);
      const yaml = tokenOptimizer(testData, config);

      const jsonTokens = countTokens(json);
      const yamlTokens = countTokens(yaml);

      expect(yamlTokens).toBeLessThan(jsonTokens);
      const savingsPercentage = calculateTokenSavingsPercentage(
        jsonTokens,
        yamlTokens
      );
      expect(savingsPercentage).toBeGreaterThan(15); // Should still have significant savings
    });
  });

  describe('keysPriority configuration', () => {
    it('should prioritize specified keys in order', () => {
      const config: tokenOptimizerConfig = {
        keysPriority: ['id', 'name', 'type', 'version'],
      };
      const yaml = tokenOptimizer(testData, config);
      const lines = yaml
        .split('\n')
        .filter(line => line.trim() && !line.startsWith(' '));

      // Priority keys should appear first in specified order
      expect(lines[0]).toBe('id: "user-123"');
      expect(lines[1]).toBe('name: "John Doe"');
      expect(lines[2]).toBe('type: "person"');
      expect(lines[3]).toBe('version: "1.0.0"');
    });

    it('should place non-priority keys alphabetically after priority keys', () => {
      const config: tokenOptimizerConfig = {
        keysPriority: ['id', 'name'],
      };
      const yaml = tokenOptimizer(testData, config);
      const lines = yaml
        .split('\n')
        .filter(line => line.trim() && !line.startsWith(' '));

      // First two should be priority keys
      expect(lines[0]).toBe('id: "user-123"');
      expect(lines[1]).toBe('name: "John Doe"');

      // Remaining keys should be alphabetical
      expect(lines[2]).toBe('active: true');
      expect(lines[3]).toBe('age: 30');
      expect(lines[4]).toBe('description: "A test user"');
    });

    it('should handle empty keysPriority array', () => {
      const config: tokenOptimizerConfig = {
        keysPriority: [],
      };
      const yaml = tokenOptimizer(testData, config);
      const lines = yaml.split('\n').filter(line => line.trim());

      // Should preserve original order when keysPriority is empty
      expect(lines[0]).toBe('name: "John Doe"');
      expect(lines[1]).toBe('age: 30');
    });

    it('should handle keysPriority with non-existent keys', () => {
      const config: tokenOptimizerConfig = {
        keysPriority: ['nonexistent', 'id', 'name', 'alsononexistent'],
      };
      const yaml = tokenOptimizer(testData, config);
      const lines = yaml
        .split('\n')
        .filter(line => line.trim() && !line.startsWith(' '));

      // Only existing priority keys should appear first
      expect(lines[0]).toBe('id: "user-123"');
      expect(lines[1]).toBe('name: "John Doe"');

      // Rest should be alphabetical
      expect(lines[2]).toBe('active: true');
    });

    it('should work with nested objects', () => {
      const nestedData = {
        user: {
          name: 'Alice',
          id: 'user-456',
          age: 25,
          type: 'admin',
        },
        metadata: {
          version: '2.0.0',
          created: '2024-01-01',
          id: 'meta-123',
        },
      };

      const config: tokenOptimizerConfig = {
        keysPriority: ['id', 'name', 'type'],
      };
      const yaml = tokenOptimizer(nestedData, config);

      // Check that nested objects also respect priority sorting
      expect(yaml).toContain(
        `user:
  id: "user-456"
  name: "Alice"
  type: "admin"`
      );
      expect(yaml).toContain(
        `metadata:
  id: "meta-123"
  created: "2024-01-01"
  version: "2.0.0"`
      );
    });
  });

  describe('Configuration precedence', () => {
    it('should use keysPriority when both sortKeys and keysPriority are provided', () => {
      const config: tokenOptimizerConfig = {
        sortKeys: true,
        keysPriority: ['name', 'id'],
      };
      const yaml = tokenOptimizer(testData, config);
      const lines = yaml
        .split('\n')
        .filter(line => line.trim() && !line.startsWith(' '));

      // keysPriority should take precedence over sortKeys
      expect(lines[0]).toBe('name: "John Doe"');
      expect(lines[1]).toBe('id: "user-123"');

      // Remaining keys should still be alphabetical
      expect(lines[2]).toBe('active: true');
      expect(lines[3]).toBe('age: 30');
    });

    it('should ignore sortKeys when keysPriority is provided', () => {
      const config1: tokenOptimizerConfig = {
        sortKeys: true,
        keysPriority: ['version', 'name'],
      };

      const config2: tokenOptimizerConfig = {
        sortKeys: false,
        keysPriority: ['version', 'name'],
      };

      const yaml1 = tokenOptimizer(testData, config1);
      const yaml2 = tokenOptimizer(testData, config2);

      // Both should produce the same result since keysPriority takes precedence
      expect(yaml1).toBe(yaml2);
    });
  });

  describe('LLM optimization scenarios', () => {
    it('should optimize for API response data with common priority keys', () => {
      const apiResponse = {
        data: [
          {
            created_at: '2024-01-01T00:00:00Z',
            id: 'item-1',
            name: 'First Item',
            type: 'product',
            description: 'A sample product',
            status: 'active',
            updated_at: '2024-01-02T00:00:00Z',
            version: '1.0.0',
          },
        ],
        pagination: {
          total: 100,
          page: 1,
          limit: 10,
          has_more: true,
        },
        status: 'success',
        message: 'Data retrieved successfully',
      };

      const config: tokenOptimizerConfig = {
        keysPriority: ['id', 'name', 'type', 'status', 'version', 'message'],
      };

      const yaml = tokenOptimizer(apiResponse, config);
      const json = JSON.stringify(apiResponse, null, 2);

      // Verify token efficiency
      const jsonTokens = countTokens(json);
      const yamlTokens = countTokens(yaml);
      expect(yamlTokens).toBeLessThan(jsonTokens);

      // Verify important keys appear first in nested objects
      expect(yaml).toContain(
        `data:
  - id: "item-1"
    name: "First Item"
    type: "product"`
      );
      expect(yaml).toContain(
        `status: "success"
message: "Data retrieved successfully"`
      );
    });

    it('should handle configuration objects with priority sorting', () => {
      const configData = {
        environment: 'production',
        database: {
          host: 'localhost',
          port: 5432,
          name: 'myapp',
          ssl: true,
          timeout: 30000,
        },
        cache: {
          ttl: 3600,
          host: 'redis-server',
          port: 6379,
          enabled: true,
        },
        logging: {
          level: 'info',
          format: 'json',
          enabled: true,
        },
      };

      const config: tokenOptimizerConfig = {
        keysPriority: [
          'name',
          'host',
          'port',
          'enabled',
          'level',
          'environment',
        ],
      };

      const yaml = tokenOptimizer(configData, config);

      // Verify nested objects respect priority
      expect(yaml).toContain(
        `database:
  name: "myapp"
  host: "localhost"
  port: 5432`
      );
      expect(yaml).toContain(
        `cache:
  host: "redis-server"
  port: 6379
  enabled: true`
      );
      expect(yaml).toContain(`logging:
  enabled: true
  level: "info"`);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle null and undefined values in keysPriority', () => {
      const simpleData = { a: 1, b: 2, c: 3 };
      const config: tokenOptimizerConfig = {
        keysPriority: ['b', 'a'],
      };

      const yaml = tokenOptimizer(simpleData, config);
      const lines = yaml.split('\n').filter(line => line.trim());

      expect(lines[0]).toBe('b: 2');
      expect(lines[1]).toBe('a: 1');
      expect(lines[2]).toBe('c: 3');
    });

    it('should handle arrays correctly with configuration', () => {
      const arrayData = {
        items: ['first', 'second', 'third'],
        count: 3,
        id: 'list-1',
      };

      const config: tokenOptimizerConfig = {
        keysPriority: ['id', 'count'],
      };

      const yaml = tokenOptimizer(arrayData, config);
      expect(yaml).toContain(
        `id: "list-1"
count: 3
items:
  - "first"
  - "second"
  - "third"`
      );
    });

    it('should maintain consistent output format regardless of configuration', () => {
      const data = { name: 'test', value: 42 };

      const yaml1 = tokenOptimizer(data);
      const yaml2 = tokenOptimizer(data, { sortKeys: true });
      const yaml3 = tokenOptimizer(data, { keysPriority: ['value', 'name'] });

      // All should use forced quotes and same formatting
      expect(yaml1).toContain('name: "test"');
      expect(yaml2).toContain('name: "test"');
      expect(yaml3).toContain('name: "test"');

      expect(yaml1).toContain('value: 42');
      expect(yaml2).toContain('value: 42');
      expect(yaml3).toContain('value: 42');
    });
  });

  describe('removeRedundant configuration', () => {
    describe('removeRedundant: true behavior', () => {
      it('should remove empty objects, empty arrays, empty strings, null, undefined, and NaN when removeRedundant is true', () => {
        const input = {
          name: 'John Doe',
          age: 30,
          active: true,
          inactive: false,
          score: 0, // Should be preserved (number)
          emptyObject: {},
          emptyArray: [],
          nullValue: null,
          undefinedValue: undefined,
          nanValue: NaN,
          emptyString: '', // Should be removed (empty string)
          validArray: [1, 2, 3],
          validObject: { key: 'value' },
        };

        const config: tokenOptimizerConfig = { removeRedundant: true };
        const yaml = tokenOptimizer(input, config);

        expect(yaml).toEqual(`name: "John Doe"
age: 30
active: true
inactive: false
score: 0
validArray:
  - 1
  - 2
  - 3
validObject:
  key: "value"
`);
      });

      it('should remove empty strings from arrays when removeRedundant is true', () => {
        const input = {
          mixedArray: [
            'valid string',
            '',
            42,
            true,
            '',
            'another valid',
            0,
            false,
            null,
            undefined,
            NaN,
          ],
        };

        const config: tokenOptimizerConfig = { removeRedundant: true };
        const yaml = tokenOptimizer(input, config);

        expect(yaml).toEqual(`mixedArray:
  - "valid string"
  - 42
  - true
  - "another valid"
  - 0
  - false
`);
      });

      it('should recursively remove redundant values in nested structures when removeRedundant is true', () => {
        const input = {
          user: {
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
              preferences: {
                emptyField: '',
                validField: 'keep me',
                nullField: null,
                undefinedField: undefined,
                emptyObj: {},
                emptyArr: [],
              },
            },
          },
          metadata: {
            title: 'User Profile',
            description: '',
            version: 1,
            deprecated: false,
          },
        };

        const config: tokenOptimizerConfig = { removeRedundant: true };
        const yaml = tokenOptimizer(input, config);

        expect(yaml).toEqual(`user:
  name: "Alice"
  age: 25
  active: true
  tags:
    - "admin"
    - "user"
  settings:
    theme: "dark"
    notifications: true
    preferences:
      validField: "keep me"
metadata:
  title: "User Profile"
  version: 1
  deprecated: false
`);
      });

      it('should use removeRedundant: true as default behavior (no config provided)', () => {
        const input = {
          name: 'Test',
          emptyString: '',
          emptyObject: {},
          emptyArray: [],
          nullValue: null,
          validNumber: 42,
          validBoolean: true,
        };

        // No config provided - should use default removeRedundant: true
        const yaml = tokenOptimizer(input);

        expect(yaml).toEqual(`name: "Test"
validNumber: 42
validBoolean: true
`);

        // Verify redundant values are not present
        expect(yaml).not.toContain('emptyString');
        expect(yaml).not.toContain('emptyObject');
        expect(yaml).not.toContain('emptyArray');
        expect(yaml).not.toContain('nullValue');
        expect(yaml).not.toContain('""');
        expect(yaml).not.toContain('{}');
        expect(yaml).not.toContain('[]');
        expect(yaml).not.toContain('null');
      });

      it('should use removeRedundant: true as default behavior (empty config provided)', () => {
        const input = {
          name: 'Test',
          emptyString: '',
          validNumber: 42,
        };

        // Empty config provided - should use default removeRedundant: true
        const yaml = tokenOptimizer(input, {});

        expect(yaml).toEqual(`name: "Test"
validNumber: 42
`);
        expect(yaml).not.toContain('emptyString');
      });
    });

    describe('removeRedundant: false behavior', () => {
      it('should preserve all values when removeRedundant is explicitly set to false', () => {
        const input = {
          name: 'John Doe',
          emptyString: '',
          emptyObject: {},
          emptyArray: [],
          nullValue: null,
          score: 0,
          active: false,
        };

        const config: tokenOptimizerConfig = { removeRedundant: false };
        const yaml = tokenOptimizer(input, config);

        expect(yaml).toEqual(`name: "John Doe"
emptyString: ""
emptyObject: {}
emptyArray: []
nullValue: null
score: 0
active: false
`);
      });

      it('should preserve empty strings in arrays when removeRedundant is false', () => {
        const input = {
          mixedArray: ['valid', '', 42, null, true, '', undefined],
        };

        const config: tokenOptimizerConfig = { removeRedundant: false };
        const yaml = tokenOptimizer(input, config);

        expect(yaml).toEqual(`mixedArray:
  - "valid"
  - ""
  - 42
  - null
  - true
  - ""
  - null
`);
      });

      it('should preserve all redundant values in nested structures when removeRedundant is false', () => {
        const input = {
          user: {
            name: 'Alice',
            bio: '',
            settings: {
              theme: '',
              notifications: true,
              emptyObj: {},
              emptyArr: [],
              nullField: null,
            },
          },
          emptyMetadata: {},
        };

        const config: tokenOptimizerConfig = { removeRedundant: false };
        const yaml = tokenOptimizer(input, config);

        expect(yaml).toEqual(`user:
  name: "Alice"
  bio: ""
  settings:
    theme: ""
    notifications: true
    emptyObj: {}
    emptyArr: []
    nullField: null
emptyMetadata: {}
`);
      });
    });

    describe('removeRedundant with other configurations', () => {
      it('should work with removeRedundant: true and sortKeys: true', () => {
        const input = {
          zebra: 'animal',
          emptyString: '',
          alpha: 'first',
          emptyObject: {},
          beta: 42,
          nullValue: null,
        };

        const config: tokenOptimizerConfig = {
          removeRedundant: true,
          sortKeys: true,
        };
        const yaml = tokenOptimizer(input, config);

        expect(yaml).toEqual(`alpha: "first"
beta: 42
zebra: "animal"
`);
      });

      it('should work with removeRedundant: true and keysPriority', () => {
        const input = {
          name: 'Test',
          id: 123,
          emptyData: {},
          nullValue: null,
          emptyString: '',
          version: '1.0',
          description: 'Valid description',
        };

        const config: tokenOptimizerConfig = {
          removeRedundant: true,
          keysPriority: ['id', 'name', 'version'],
        };
        const yaml = tokenOptimizer(input, config);

        expect(yaml).toEqual(`id: 123
name: "Test"
version: "1.0"
description: "Valid description"
`);
      });

      it('should work with removeRedundant: false and other configurations', () => {
        const input = {
          zebra: 'animal',
          emptyString: '',
          alpha: 'first',
          emptyObject: {},
        };

        const config: tokenOptimizerConfig = {
          removeRedundant: false,
          sortKeys: true,
        };
        const yaml = tokenOptimizer(input, config);

        expect(yaml).toEqual(`alpha: "first"
emptyObject: {}
emptyString: ""
zebra: "animal"
`);
      });
    });

    it('should handle nested objects with redundant values', () => {
      const input = {
        user: {
          name: 'Alice',
          profile: {
            bio: null,
            settings: {},
            preferences: {
              theme: 'dark',
              notifications: true,
              emptySection: {},
            },
          },
          tags: [],
          scores: [0, null, 5, undefined, NaN],
        },
        metadata: {
          created: null,
          updated: undefined,
        },
      };

      const config: tokenOptimizerConfig = { removeRedundant: true };
      const yaml = tokenOptimizer(input, config);

      expect(yaml).toEqual(`user:
  name: "Alice"
  profile:
    preferences:
      theme: "dark"
      notifications: true
  scores:
    - 0
    - 5
`);
    });

    it('should return empty string when entire object becomes empty after cleaning', () => {
      const input = {
        emptyObject: {},
        emptyArray: [],
        nullValue: null,
        undefinedValue: undefined,
        nanValue: NaN,
      };

      const config: tokenOptimizerConfig = { removeRedundant: true };
      const yaml = tokenOptimizer(input, config);

      expect(yaml).toEqual('');
    });

    it('should preserve booleans and all numbers including 0, negative numbers', () => {
      const input = {
        isActive: true,
        isDisabled: false,
        zero: 0,
        negative: -5,
        float: 3.14,
        infinity: Infinity,
        negativeInfinity: -Infinity,
        emptyObj: {},
        nullVal: null,
      };

      const config: tokenOptimizerConfig = { removeRedundant: true };
      const yaml = tokenOptimizer(input, config);

      expect(yaml).toEqual(`isActive: true
isDisabled: false
zero: 0
negative: -5
float: 3.14
infinity: .inf
negativeInfinity: -.inf
`);
    });

    it('should work with arrays containing mixed redundant and valid values', () => {
      const input = {
        mixedArray: [
          'valid string',
          null,
          undefined,
          0,
          false,
          true,
          {},
          [],
          { name: 'valid' },
          [1, 2],
          NaN,
          '',
        ],
      };

      const config: tokenOptimizerConfig = { removeRedundant: true };
      const yaml = tokenOptimizer(input, config);

      expect(yaml).toEqual(`mixedArray:
  - "valid string"
  - 0
  - false
  - true
  - name: "valid"
  - - 1
    - 2
`);
    });

    it('should work with removeRedundant combined with other configurations', () => {
      const input = {
        name: 'Test',
        id: 123,
        emptyData: {},
        nullValue: null,
        settings: {
          theme: 'dark',
          emptyPrefs: {},
          notifications: true,
        },
        tags: ['important', null, 'urgent'],
      };

      const config: tokenOptimizerConfig = {
        removeRedundant: true,
        sortKeys: true,
        keysPriority: ['id', 'name'],
      };
      const yaml = tokenOptimizer(input, config);

      expect(yaml).toEqual(`id: 123
name: "Test"
settings:
  notifications: true
  theme: "dark"
tags:
  - "important"
  - "urgent"
`);
    });

    it('should handle deeply nested structures with redundant values', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep value',
                empty: {},
              },
              nullField: null,
            },
            emptyArray: [],
          },
          validField: 'keep me',
        },
      };

      const config: tokenOptimizerConfig = { removeRedundant: true };
      const yaml = tokenOptimizer(input, config);

      expect(yaml).toEqual(`level1:
  level2:
    level3:
      level4:
        value: "deep value"
  validField: "keep me"
`);
    });

    it('should recursively remove redundant values at ALL nesting levels', () => {
      const input = {
        // Root level
        rootValid: 'keep',
        rootEmpty: {},
        rootNull: null,

        // Level 1
        level1: {
          l1Valid: true,
          l1Empty: {},
          l1Null: null,
          l1Array: [],

          // Level 2
          level2: {
            l2Valid: 42,
            l2Empty: {},
            l2Undefined: undefined,
            l2NaN: NaN,

            // Level 3
            level3: {
              l3Valid: 'deep',
              l3Empty: {},
              l3Null: null,

              // Level 4
              level4: {
                l4Valid: false, // Should be preserved
                l4Empty: {},
                l4Array: [null, undefined, {}, [], 'valid', 0, true],

                // Level 5
                level5: {
                  l5Valid: 0, // Should be preserved (number)
                  l5Empty: {},
                  l5Nested: {
                    // Level 6
                    deepValid: 'very deep',
                    deepEmpty: {},
                    deepNull: null,
                    deepArray: [null, {}, [], undefined, NaN],
                  },
                },
              },
            },
          },
        },

        // Root level array with nested objects
        complexArray: [
          {
            id: 1,
            data: null,
            nested: {
              value: 'test',
              empty: {},
              subArray: [null, undefined, { keep: 'me', remove: {} }],
            },
          },
          null,
          undefined,
          {},
          [],
          {
            id: 2,
            empty: {},
            valid: true,
          },
        ],
      };

      const config: tokenOptimizerConfig = { removeRedundant: true };
      const yaml = tokenOptimizer(input, config);

      // Should only contain valid values at ALL levels
      expect(yaml).toEqual(`rootValid: "keep"
level1:
  l1Valid: true
  level2:
    l2Valid: 42
    level3:
      l3Valid: "deep"
      level4:
        l4Valid: false
        l4Array:
          - "valid"
          - 0
          - true
        level5:
          l5Valid: 0
          l5Nested:
            deepValid: "very deep"
complexArray:
  - id: 1
    nested:
      value: "test"
      subArray:
        - keep: "me"
  - id: 2
    valid: true
`);

      // Verify no redundant values remain at any level
      expect(yaml).not.toContain('{}');
      expect(yaml).not.toContain('[]');
      expect(yaml).not.toContain('null');
      expect(yaml).not.toContain('undefined');

      // Verify meaningful values are preserved
      expect(yaml).toContain('l4Valid: false'); // Boolean false preserved
      expect(yaml).toContain('l5Valid: 0'); // Number 0 preserved
      expect(yaml).toContain('deepValid: "very deep"'); // Deep nesting works
    });
  });
});

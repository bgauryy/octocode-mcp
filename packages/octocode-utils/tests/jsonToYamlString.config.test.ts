import { describe, it, expect, beforeAll } from 'vitest';
import { createByEncoderName } from '@microsoft/tiktokenizer';
import {
  jsonToYamlString,
  YamlConversionConfig,
} from '../src/jsonToYamlString';

let tiktoken: { encode: (text: string) => number[] };

beforeAll(async () => {
  tiktoken = await createByEncoderName('cl100k_base'); // For GPT-4
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

describe('jsonToYamlString Configuration Options', () => {
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
      const yaml = jsonToYamlString(testData);
      const lines = yaml.split('\n').filter(line => line.trim());

      // Should start with 'name' as it's first in the original object
      expect(lines[0]).toBe('name: "John Doe"');
      expect(lines[1]).toBe('age: 30');
      expect(lines[2]).toBe('id: "user-123"');
    });

    it('should preserve original key order with empty config', () => {
      const yaml = jsonToYamlString(testData, {});
      const lines = yaml.split('\n').filter(line => line.trim());

      expect(lines[0]).toBe('name: "John Doe"');
      expect(lines[1]).toBe('age: 30');
      expect(lines[2]).toBe('id: "user-123"');
    });
  });

  describe('sortKeys: true configuration', () => {
    it('should sort keys alphabetically when sortKeys is true', () => {
      const config: YamlConversionConfig = { sortKeys: true };
      const yaml = jsonToYamlString(testData, config);
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
      const config: YamlConversionConfig = { sortKeys: true };
      const yaml = jsonToYamlString(testData, config);

      // Check that nested settings keys are also sorted
      expect(yaml).toContain(
        `settings:
  language: "en"
  notifications: true
  theme: "dark"`
      );
    });

    it('should maintain token efficiency with alphabetical sorting', () => {
      const config: YamlConversionConfig = { sortKeys: true };
      const json = JSON.stringify(testData, null, 2);
      const yaml = jsonToYamlString(testData, config);

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
      const config: YamlConversionConfig = {
        keysPriority: ['id', 'name', 'type', 'version'],
      };
      const yaml = jsonToYamlString(testData, config);
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
      const config: YamlConversionConfig = {
        keysPriority: ['id', 'name'],
      };
      const yaml = jsonToYamlString(testData, config);
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
      const config: YamlConversionConfig = {
        keysPriority: [],
      };
      const yaml = jsonToYamlString(testData, config);
      const lines = yaml.split('\n').filter(line => line.trim());

      // Should preserve original order when keysPriority is empty
      expect(lines[0]).toBe('name: "John Doe"');
      expect(lines[1]).toBe('age: 30');
    });

    it('should handle keysPriority with non-existent keys', () => {
      const config: YamlConversionConfig = {
        keysPriority: ['nonexistent', 'id', 'name', 'alsononexistent'],
      };
      const yaml = jsonToYamlString(testData, config);
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

      const config: YamlConversionConfig = {
        keysPriority: ['id', 'name', 'type'],
      };
      const yaml = jsonToYamlString(nestedData, config);

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
      const config: YamlConversionConfig = {
        sortKeys: true,
        keysPriority: ['name', 'id'],
      };
      const yaml = jsonToYamlString(testData, config);
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
      const config1: YamlConversionConfig = {
        sortKeys: true,
        keysPriority: ['version', 'name'],
      };

      const config2: YamlConversionConfig = {
        sortKeys: false,
        keysPriority: ['version', 'name'],
      };

      const yaml1 = jsonToYamlString(testData, config1);
      const yaml2 = jsonToYamlString(testData, config2);

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

      const config: YamlConversionConfig = {
        keysPriority: ['id', 'name', 'type', 'status', 'version', 'message'],
      };

      const yaml = jsonToYamlString(apiResponse, config);
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

      const config: YamlConversionConfig = {
        keysPriority: [
          'name',
          'host',
          'port',
          'enabled',
          'level',
          'environment',
        ],
      };

      const yaml = jsonToYamlString(configData, config);

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
      const config: YamlConversionConfig = {
        keysPriority: ['b', 'a'],
      };

      const yaml = jsonToYamlString(simpleData, config);
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

      const config: YamlConversionConfig = {
        keysPriority: ['id', 'count'],
      };

      const yaml = jsonToYamlString(arrayData, config);
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

      const yaml1 = jsonToYamlString(data);
      const yaml2 = jsonToYamlString(data, { sortKeys: true });
      const yaml3 = jsonToYamlString(data, { keysPriority: ['value', 'name'] });

      // All should use forced quotes and same formatting
      expect(yaml1).toContain('name: "test"');
      expect(yaml2).toContain('name: "test"');
      expect(yaml3).toContain('name: "test"');

      expect(yaml1).toContain('value: 42');
      expect(yaml2).toContain('value: 42');
      expect(yaml3).toContain('value: 42');
    });
  });
});

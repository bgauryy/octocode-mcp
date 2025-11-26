/**
 * Tests for responses utility
 */

import { describe, it, expect } from 'vitest';
import {
  createResponseFormat,
  createResult,
} from '../../src/utils/responses.js';

describe('responses', () => {
  describe('createResponseFormat', () => {
    it('should format simple object to YAML', () => {
      const data = {
        status: 'hasResults',
        path: '/test/path',
      };

      const result = createResponseFormat(data);

      expect(result).toContain('status:');
      expect(result).toContain('hasResults');
      expect(result).toContain('path:');
      expect(result).toContain('/test/path');
    });

    it('should remove null values', () => {
      const data = {
        status: 'hasResults',
        path: null,
        name: 'test',
      };

      const result = createResponseFormat(data);

      expect(result).toContain('status:');
      expect(result).toContain('name:');
      expect(result).not.toContain('path:');
    });

    it('should remove undefined values', () => {
      const data = {
        status: 'hasResults',
        path: undefined,
        name: 'test',
      };

      const result = createResponseFormat(data);

      expect(result).toContain('status:');
      expect(result).toContain('name:');
      expect(result).not.toContain('path:');
    });

    it('should remove empty objects', () => {
      const data = {
        status: 'hasResults',
        metadata: {},
        name: 'test',
      };

      const result = createResponseFormat(data);

      expect(result).toContain('status:');
      expect(result).toContain('name:');
      expect(result).not.toContain('metadata:');
    });

    it('should remove empty arrays', () => {
      const data = {
        status: 'hasResults',
        files: [],
        name: 'test',
      };

      const result = createResponseFormat(data);

      expect(result).toContain('status:');
      expect(result).toContain('name:');
      expect(result).not.toContain('files:');
    });

    it('should preserve non-empty arrays', () => {
      const data = {
        status: 'hasResults',
        files: ['file1.ts', 'file2.ts'],
      };

      const result = createResponseFormat(data);

      expect(result).toContain('files:');
      expect(result).toContain('file1.ts');
      expect(result).toContain('file2.ts');
    });

    it('should handle nested objects', () => {
      const data = {
        status: 'hasResults',
        pagination: {
          currentPage: 1,
          totalPages: 5,
          hasMore: true,
        },
      };

      const result = createResponseFormat(data);

      expect(result).toContain('pagination:');
      expect(result).toContain('currentPage:');
      expect(result).toContain('1');
      expect(result).toContain('totalPages:');
      expect(result).toContain('5');
    });

    it('should respect key priority ordering', () => {
      const data = {
        path: '/test',
        status: 'hasResults',
        hints: ['hint1'],
      };

      const result = createResponseFormat(data, ['status', 'path', 'hints']);

      // Status should appear before path in the output
      const statusIndex = result.indexOf('status:');
      const pathIndex = result.indexOf('path:');
      expect(statusIndex).toBeLessThan(pathIndex);
    });

    it('should handle NaN values by removing them', () => {
      const data = {
        status: 'hasResults',
        count: NaN,
        name: 'test',
      };

      const result = createResponseFormat(data);

      expect(result).toContain('status:');
      expect(result).toContain('name:');
      expect(result).not.toContain('count:');
    });

    it('should handle deeply nested empty objects', () => {
      const data = {
        status: 'hasResults',
        nested: {
          level1: {
            level2: {
              empty: {},
            },
          },
        },
        name: 'test',
      };

      const result = createResponseFormat(data);

      expect(result).toContain('status:');
      expect(result).toContain('name:');
      expect(result).not.toContain('nested:');
    });

    it('should preserve boolean false values', () => {
      const data = {
        status: 'hasResults',
        hasMore: false,
      };

      const result = createResponseFormat(data);

      expect(result).toContain('hasMore:');
      expect(result).toContain('false');
    });

    it('should preserve zero values', () => {
      const data = {
        status: 'hasResults',
        count: 0,
      };

      const result = createResponseFormat(data);

      expect(result).toContain('count:');
      expect(result).toContain('0');
    });

    it('should preserve empty string values', () => {
      const data = {
        status: 'hasResults',
        content: '',
      };

      const result = createResponseFormat(data);

      expect(result).toContain('content:');
    });
  });

  describe('createResult', () => {
    it('should create a successful result', () => {
      const result = createResult({
        data: { status: 'hasResults', path: '/test' },
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
    });

    it('should create an error result', () => {
      const result = createResult({
        data: { status: 'error', message: 'Failed' },
        isError: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should include instructions when provided', () => {
      const result = createResult({
        data: { status: 'hasResults' },
        instructions: 'Process this data',
      });

      const content = result.content[0] as { type: 'text'; text: string };
      expect(content.text).toContain('instructions:');
      expect(content.text).toContain('Process this data');
    });

    it('should handle complex data structures', () => {
      const result = createResult({
        data: {
          status: 'hasResults',
          files: [
            { path: '/file1.ts', size: 100 },
            { path: '/file2.ts', size: 200 },
          ],
          pagination: {
            currentPage: 1,
            totalPages: 3,
          },
        },
      });

      expect(result.isError).toBe(false);
      const content = result.content[0] as { type: 'text'; text: string };
      expect(content.text).toContain('files:');
      expect(content.text).toContain('pagination:');
    });
  });
});

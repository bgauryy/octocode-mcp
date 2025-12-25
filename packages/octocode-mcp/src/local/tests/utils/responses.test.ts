/**
 * Tests for response formatting utilities
 * Covers createResponseFormat, createResult
 */

import { describe, it, expect } from 'vitest';
import {
  createResponseFormat,
  createResult,
  type ToolResponse,
} from '../../utils/responses.js';

describe('responses', () => {
  describe('createResponseFormat', () => {
    it('should format simple response data as YAML', () => {
      const responseData: ToolResponse = {
        data: { key: 'value' },
      };

      const formatted = createResponseFormat(responseData);

      expect(formatted).toContain('data');
      expect(formatted).toContain('key');
      expect(formatted).toContain('value');
    });

    it('should format response with results array', () => {
      const responseData: ToolResponse = {
        results: [{ status: 'hasResults', path: '/test' }],
      };

      const formatted = createResponseFormat(responseData);

      expect(formatted).toContain('results');
      expect(formatted).toContain('hasResults');
      expect(formatted).toContain('/test');
    });

    it('should include instructions when provided', () => {
      const responseData: ToolResponse = {
        instructions: 'Use this data for research',
        data: { result: 'test' },
      };

      const formatted = createResponseFormat(responseData);

      expect(formatted).toContain('instructions');
      expect(formatted).toContain('Use this data for research');
    });

    it('should format summary correctly', () => {
      const responseData: ToolResponse = {
        summary: {
          total: 10,
          hasResults: 8,
          empty: 1,
          errors: 1,
        },
      };

      const formatted = createResponseFormat(responseData);

      expect(formatted).toContain('summary');
      expect(formatted).toContain('total');
      expect(formatted).toContain('hasResults');
    });

    it('should remove null and undefined values', () => {
      const responseData: ToolResponse = {
        data: {
          valid: 'value',
          nullValue: null,
          undefinedValue: undefined,
        },
      };

      const formatted = createResponseFormat(responseData);

      expect(formatted).toContain('valid');
      expect(formatted).not.toContain('nullValue');
      expect(formatted).not.toContain('undefinedValue');
    });

    it('should remove empty objects', () => {
      const responseData: ToolResponse = {
        data: {
          validData: 'test',
          emptyObject: {},
        },
      };

      const formatted = createResponseFormat(responseData);

      expect(formatted).toContain('validData');
      expect(formatted).not.toContain('emptyObject');
    });

    it('should remove empty arrays', () => {
      const responseData: ToolResponse = {
        data: {
          validArray: [1, 2, 3],
          emptyArray: [],
        },
      };

      const formatted = createResponseFormat(responseData);

      expect(formatted).toContain('validArray');
      expect(formatted).not.toContain('emptyArray');
    });

    it('should remove NaN values', () => {
      const responseData: ToolResponse = {
        data: {
          validNumber: 42,
          nanValue: NaN,
        },
      };

      const formatted = createResponseFormat(responseData);

      expect(formatted).toContain('validNumber');
      expect(formatted).not.toContain('nanValue');
    });

    it('should use custom key priority when provided', () => {
      const responseData: ToolResponse = {
        data: 'test',
        results: [{ status: 'hasResults' }],
        instructions: 'test instructions',
      };

      const formatted = createResponseFormat(responseData, [
        'instructions',
        'results',
        'data',
      ]);

      // Instructions should appear before results in the output
      const instructionsIndex = formatted.indexOf('instructions');
      const resultsIndex = formatted.indexOf('results');
      expect(instructionsIndex).toBeLessThan(resultsIndex);
    });

    it('should handle nested objects', () => {
      const responseData: ToolResponse = {
        data: {
          level1: {
            level2: {
              value: 'deep',
            },
          },
        },
      };

      const formatted = createResponseFormat(responseData);

      expect(formatted).toContain('level1');
      expect(formatted).toContain('level2');
      expect(formatted).toContain('deep');
    });

    it('should handle arrays with mixed content', () => {
      const responseData: ToolResponse = {
        results: [
          { status: 'hasResults', data: 'test1' },
          { status: 'empty' },
          { status: 'error', error: 'Failed' },
        ],
      };

      const formatted = createResponseFormat(responseData);

      expect(formatted).toContain('hasResults');
      expect(formatted).toContain('empty');
      expect(formatted).toContain('error');
    });
  });

  describe('createResult', () => {
    it('should create successful result', () => {
      const result = createResult({
        data: { key: 'value' },
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('key');
    });

    it('should create result with instructions', () => {
      const result = createResult({
        data: { result: 'test' },
        instructions: 'Process this data',
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('instructions');
      expect(result.content[0].text).toContain('Process this data');
    });

    it('should create error result', () => {
      const result = createResult({
        data: { error: 'Something went wrong' },
        isError: true,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('error');
    });

    it('should handle undefined isError as false', () => {
      const result = createResult({
        data: { key: 'value' },
      });

      expect(result.isError).toBe(false);
    });

    it('should handle undefined instructions', () => {
      const result = createResult({
        data: { key: 'value' },
      });

      expect(result.content[0].text).not.toContain('instructions');
    });

    it('should handle complex data structures', () => {
      const result = createResult({
        data: {
          files: [{ path: '/a', size: 100 }, { path: '/b' }],
          stats: { total: 2 },
        },
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('files');
      expect(result.content[0].text).toContain('stats');
    });
  });
});

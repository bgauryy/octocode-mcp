import { describe, it, expect } from 'vitest';
import { createResult } from '../../src/mcp/responses';

describe('Response Utilities', () => {
  describe('createResult', () => {
    it('should create success result with JSON data', () => {
      const data = { message: 'Hello' };
      const result = createResult({ data });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it('should create error result with string message', () => {
      const errorMessage = 'Something went wrong';
      const result = createResult({ error: errorMessage });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe(errorMessage);
    });

    it('should include suggestions in error result', () => {
      const result = createResult({
        error: 'Not found',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Not found');
    });

    it('should handle error object', () => {
      const error = new Error('Test error');
      const result = createResult({ error });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Test error');
    });

    it('should create success result when no error provided', () => {
      const data = { test: 'value' };
      const result = createResult({ data });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });
  });
});

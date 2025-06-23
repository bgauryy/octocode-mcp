import { describe, it, expect } from 'vitest';
import {
  createResult,
  parseJsonResponse,
} from '../../src/utils/responses';
import { needsQuoting } from '../../src/utils/query.js';

describe('Response Utilities', () => {
  describe('createResult', () => {
    it('should create success result with JSON data', () => {
      const data = { message: 'success', value: 42 };
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
      const errorMessage = 'Not found';
      const suggestions = ['try this', 'or that'];
      const result = createResult({ error: errorMessage, suggestions });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Not found | Try: try this, or that');
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

  describe('parseJsonResponse', () => {
    it('should parse valid JSON', () => {
      const jsonData = { message: 'test' };
      const jsonString = JSON.stringify(jsonData);

      const result = parseJsonResponse(jsonString);

      expect(result.parsed).toBe(true);
      expect(result.data).toEqual(jsonData);
    });

    it('should handle invalid JSON with fallback', () => {
      const invalidJson = 'not json';

      const result = parseJsonResponse(invalidJson);

      expect(result.parsed).toBe(false);
      expect(result.data).toBe(invalidJson);
    });

    it('should use original text as fallback when no fallback provided', () => {
      const invalidJson = 'still not json';

      const result = parseJsonResponse(invalidJson);

      expect(result.parsed).toBe(false);
      expect(result.data).toBe(invalidJson);
    });
  });

  describe('needsQuoting', () => {
    it('should return true for strings with spaces', () => {
      expect(needsQuoting('hello world')).toBe(true);
    });

    it('should return true for strings with special characters', () => {
      expect(needsQuoting('hello&world')).toBe(true);
      expect(needsQuoting('hello|world')).toBe(true);
      expect(needsQuoting('hello<world')).toBe(true);
      expect(needsQuoting('hello>world')).toBe(true);
    });

    it('should return true for strings with quotes or whitespace', () => {
      expect(needsQuoting('hello"world')).toBe(true);
      expect(needsQuoting('hello\tworld')).toBe(true);
      expect(needsQuoting('hello\nworld')).toBe(true);
    });

    it('should return false for simple strings', () => {
      expect(needsQuoting('hello')).toBe(false);
      expect(needsQuoting('helloworld')).toBe(false);
      expect(needsQuoting('hello123')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(needsQuoting('')).toBe(false);
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  createSuccessResult,
  createErrorResult,
  parseJsonResponse,
  needsQuoting,
  formatDateToYYYYMMDD,
} from '../../src/utils/responses.js';

describe('Response Utilities', () => {
  describe('createSuccessResult', () => {
    it('should create success result with object data', () => {
      const data = { test: 'data' };
      const result = createSuccessResult(data);

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it('should create success result with string data', () => {
      const data = 'Simple string result';
      const result = createSuccessResult(data);

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe(data);
    });
  });

  describe('createErrorResult', () => {
    it('should create error result with string message and error', () => {
      const error = new Error('Test error');
      const result = createErrorResult('Failed operation', error);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(
        'ERROR: Failed operation: Test error'
      );
    });

    it('should create error result with string message only', () => {
      const result = createErrorResult('Simple error message');

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('ERROR: Simple error message');
    });

    it('should create error result with object message', () => {
      const errorObj = { code: 'ERR_001', message: 'Something went wrong' };
      const result = createErrorResult(errorObj);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(
        `ERROR: ${JSON.stringify(errorObj, null, 2)}`
      );
    });
  });

  describe('parseJsonResponse', () => {
    it('should parse valid JSON', () => {
      const jsonString = '{"key": "value"}';
      const result = parseJsonResponse(jsonString);

      expect(result.parsed).toBe(true);
      expect(result.data).toEqual({ key: 'value' });
    });

    it('should handle invalid JSON with fallback', () => {
      const invalidJson = 'not json';
      const fallback = { fallback: 'data' };
      const result = parseJsonResponse(invalidJson, fallback);

      expect(result.parsed).toBe(false);
      expect(result.data).toEqual(fallback);
    });

    it('should use original text as fallback when no fallback provided', () => {
      const invalidJson = 'not json';
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
      expect(needsQuoting('test<script>')).toBe(true);
      expect(needsQuoting('test|pipe')).toBe(true);
      expect(needsQuoting('test&and')).toBe(true);
    });

    it('should return true for strings with quotes or whitespace', () => {
      expect(needsQuoting('test"quotes')).toBe(true);
      expect(needsQuoting('test\tincluding\ttabs')).toBe(true);
      expect(needsQuoting('test\nwith\nnewlines')).toBe(true);
    });

    it('should return false for simple strings', () => {
      expect(needsQuoting('hello')).toBe(false);
      expect(needsQuoting('test123')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(needsQuoting('')).toBe(false);
    });
  });

  describe('formatDateToYYYYMMDD', () => {
    it('should format ISO date string to YYYY-MM-DD', () => {
      const isoDate = '2023-10-26T12:30:45Z';
      const result = formatDateToYYYYMMDD(isoDate);
      expect(result).toBe('2023-10-26');
    });

    it('should format ISO date string with timezone to YYYY-MM-DD', () => {
      const isoDate = '2023-12-01T08:15:30+00:00';
      const result = formatDateToYYYYMMDD(isoDate);
      expect(result).toBe('2023-12-01');
    });

    it('should return null for null input', () => {
      const result = formatDateToYYYYMMDD(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = formatDateToYYYYMMDD(undefined);
      expect(result).toBeNull();
    });

    it('should return null for invalid date string', () => {
      const result = formatDateToYYYYMMDD('not-a-date');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = formatDateToYYYYMMDD('');
      expect(result).toBeNull();
    });

    it('should handle date strings without time component', () => {
      const dateString = '2023-05-15';
      const result = formatDateToYYYYMMDD(dateString);
      expect(result).toBe('2023-05-15');
    });
  });
});

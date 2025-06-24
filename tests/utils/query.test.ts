import { needsQuoting, safeQuote } from '../../src/utils/query.js';

describe('Query Utilities', () => {
  describe('needsQuoting', () => {
    it('should return true for strings with spaces', () => {
      expect(needsQuoting('hello world')).toBe(true);
    });

    it('should return true for strings with shell special characters', () => {
      expect(needsQuoting('hello&world')).toBe(true);
      expect(needsQuoting('hello|world')).toBe(true);
      expect(needsQuoting('hello<world')).toBe(true);
      expect(needsQuoting('hello>world')).toBe(true);
    });

    it('should return true for strings with quotes and whitespace', () => {
      expect(needsQuoting('hello"world')).toBe(true);
      expect(needsQuoting('hello\tworld')).toBe(true);
      expect(needsQuoting('hello\nworld')).toBe(true);
    });

    it('should return false for simple strings', () => {
      expect(needsQuoting('hello')).toBe(false);
      expect(needsQuoting('helloworld')).toBe(false);
      expect(needsQuoting('hello123')).toBe(false);
    });

    it('should return false for empty strings', () => {
      expect(needsQuoting('')).toBe(false);
    });
  });

  describe('safeQuote', () => {
    it('should quote strings that need quoting', () => {
      expect(safeQuote('hello world')).toBe('"hello world"');
      expect(safeQuote('hello&world')).toBe('"hello&world"');
    });

    it('should not quote strings that don\'t need quoting', () => {
      expect(safeQuote('hello')).toBe('hello');
      expect(safeQuote('helloworld')).toBe('helloworld');
    });

    it('should handle empty strings', () => {
      expect(safeQuote('')).toBe('');
    });
  });
}); 
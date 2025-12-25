/**
 * Tests for file filtering utilities
 * Covers getExtension
 */

import { describe, it, expect } from 'vitest';
import { getExtension } from '../../utils/fileFilters.js';

describe('fileFilters', () => {
  describe('getExtension', () => {
    it('should return file extension', () => {
      expect(getExtension('/path/to/file.ts')).toBe('ts');
      expect(getExtension('/path/to/file.js')).toBe('js');
      expect(getExtension('/path/to/file.json')).toBe('json');
    });

    it('should return last extension for multiple dots', () => {
      expect(getExtension('/path/to/file.test.ts')).toBe('ts');
      expect(getExtension('/path/to/file.spec.js')).toBe('js');
    });

    it('should return empty string for files without extension', () => {
      expect(getExtension('/path/to/Makefile')).toBe('');
      expect(getExtension('/path/to/Dockerfile')).toBe('');
    });

    it('should handle hidden files', () => {
      expect(getExtension('/path/to/.gitignore')).toBe('gitignore');
      expect(getExtension('/path/to/.env')).toBe('env');
    });

    it('should handle files with only extension', () => {
      expect(getExtension('.ts')).toBe('ts');
    });
  });
});

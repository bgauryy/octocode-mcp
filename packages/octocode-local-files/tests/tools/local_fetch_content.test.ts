/**
 * Tests for local_fetch_content tool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchContent } from '../../src/tools/local_fetch_content.js';
import * as pathValidator from '../../src/security/pathValidator.js';
import * as fs from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

// Mock pathValidator
vi.mock('../../src/security/pathValidator.js', () => ({
  pathValidator: {
    validate: vi.fn(),
  },
}));

describe('local_fetch_content', () => {
  const mockReadFile = vi.mocked(fs.readFile);
  const mockValidate = vi.mocked(pathValidator.pathValidator.validate);

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidate.mockReturnValue({ isValid: true });
  });

  describe('Full content fetch', () => {
    it('should fetch full file content', async () => {
      const testContent = 'line 1\nline 2\nline 3';
      mockReadFile.mockResolvedValue(testContent);

      const result = await fetchContent({
        path: 'test.txt',
        fullContent: true,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toBe(testContent);
      expect(result.isPartial).toBe(false);
      expect(result.totalLines).toBe(3);
    });

    it('should apply minification when requested', async () => {
      const testContent = 'function test() {\n  return true;\n}';
      mockReadFile.mockResolvedValue(testContent);

      const result = await fetchContent({
        path: 'test.js',
        fullContent: true,
        minified: true,
      });

      expect(result.status).toBe('hasResults');
      expect(result.minified).toBe(true);
    });
  });

  describe('Line range fetch', () => {
    it('should fetch specific line range', async () => {
      const testContent = 'line 1\nline 2\nline 3\nline 4\nline 5';
      mockReadFile.mockResolvedValue(testContent);

      const result = await fetchContent({
        path: 'test.txt',
        startLine: 2,
        endLine: 4,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toBe('line 2\nline 3\nline 4');
      expect(result.isPartial).toBe(true);
      expect(result.startLine).toBe(2);
      expect(result.endLine).toBe(4);
    });

    it('should handle end line beyond file length', async () => {
      const testContent = 'line 1\nline 2\nline 3';
      mockReadFile.mockResolvedValue(testContent);

      const result = await fetchContent({
        path: 'test.txt',
        startLine: 2,
        endLine: 10,
      });

      expect(result.status).toBe('hasResults');
      expect(result.endLine).toBe(3); // Clamped to actual file length
    });

    it('should reject invalid line ranges', async () => {
      const result = await fetchContent({
        path: 'test.txt',
        startLine: 5,
        endLine: 2,
      });

      expect(result.status).toBe('error');
      expect(result.error).toContain('startLine must be less than or equal');
    });
  });

  describe('Match string fetch', () => {
    it('should fetch lines matching pattern with context', async () => {
      const testContent = 'line 1\nline 2\nMATCH\nline 4\nline 5';
      mockReadFile.mockResolvedValue(testContent);

      const result = await fetchContent({
        path: 'test.txt',
        matchString: 'MATCH',
        matchStringContextLines: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toContain('line 2');
      expect(result.content).toContain('MATCH');
      expect(result.content).toContain('line 4');
      expect(result.isPartial).toBe(true);
    });

    it('should return empty when pattern not found', async () => {
      const testContent = 'line 1\nline 2\nline 3';
      mockReadFile.mockResolvedValue(testContent);

      const result = await fetchContent({
        path: 'test.txt',
        matchString: 'NOTFOUND',
      });

      expect(result.status).toBe('empty');
      expect(result.error).toContain('No matches found');
    });
  });

  describe('Error handling', () => {
    it('should handle invalid paths', async () => {
      mockValidate.mockReturnValue({
        isValid: false,
        error: 'Invalid path',
      });

      const result = await fetchContent({
        path: '/invalid/path',
      });

      expect(result.status).toBe('error');
      expect(result.error).toBe('Invalid path');
    });

    it('should handle file read errors', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const result = await fetchContent({
        path: 'nonexistent.txt',
      });

      expect(result.status).toBe('error');
      expect(result.error).toContain('Failed to read file');
    });
  });

  describe('Empty content handling', () => {
    it('should handle empty files', async () => {
      mockReadFile.mockResolvedValue('');

      const result = await fetchContent({
        path: 'empty.txt',
        fullContent: true,
      });

      expect(result.status).toBe('empty');
    });
  });

  describe('Research context', () => {
    it('should preserve research goal and reasoning', async () => {
      const testContent = 'test content';
      mockReadFile.mockResolvedValue(testContent);

      const result = await fetchContent({
        path: 'test.txt',
        fullContent: true,
        researchGoal: 'Find implementation',
        reasoning: 'Testing feature X',
      });

      expect(result.researchGoal).toBe('Find implementation');
      expect(result.reasoning).toBe('Testing feature X');
    });
  });
});

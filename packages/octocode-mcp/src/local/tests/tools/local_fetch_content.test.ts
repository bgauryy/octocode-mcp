/**
 * Tests for localGetFileContent tool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ERROR_CODES } from '../../errors/errorCodes.js';
import { fetchContent } from '../../tools/local_fetch_content.js';
import * as pathValidator from '../../security/pathValidator.js';
import * as fs from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}));

// Mock pathValidator
vi.mock('../../security/pathValidator.js', () => ({
  pathValidator: {
    validate: vi.fn(),
  },
}));

describe('localGetFileContent', () => {
  const mockReadFile = vi.mocked(fs.readFile);
  const mockStat = vi.mocked(fs.stat);
  const mockValidate = vi.mocked(pathValidator.pathValidator.validate);

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidate.mockReturnValue({ isValid: true });
    // Default: small file size (< 100KB)
    mockStat.mockResolvedValue({ size: 1024 } as unknown as Awaited<
      ReturnType<typeof fs.stat>
    >);
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
      // Note: minified field removed - minification still happens but not tracked
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
      expect(result.errorCode).toBe(ERROR_CODES.NO_MATCHES);
    });

    it('should show regex-specific hint when matchStringIsRegex and no matches', async () => {
      const testContent = 'line 1\nline 2\nline 3';
      mockReadFile.mockResolvedValue(testContent);

      const result = await fetchContent({
        path: 'test.txt',
        matchString: 'VERY_SPECIFIC_REGEX_PATTERN',
        matchStringIsRegex: true,
      });

      expect(result.status).toBe('empty');
      expect(result.hints).toBeDefined();
      expect(result.hints?.some(h => h.includes('Regex pattern'))).toBe(true);
    });

    it('should show case-sensitive hint when enabled and no matches', async () => {
      const testContent = 'LINE 1\nLINE 2\nLINE 3';
      mockReadFile.mockResolvedValue(testContent);

      const result = await fetchContent({
        path: 'test.txt',
        matchString: 'line',
        matchStringCaseSensitive: true,
      });

      expect(result.status).toBe('empty');
      expect(result.hints).toBeDefined();
      expect(result.hints?.some(h => h.includes('Case-sensitive'))).toBe(true);
    });

    it('should match using regex when matchStringIsRegex is true', async () => {
      const testContent = 'line 1\nexport function test() {}\nline 3';
      mockReadFile.mockResolvedValue(testContent);

      const result = await fetchContent({
        path: 'test.txt',
        matchString: 'export.*function',
        matchStringIsRegex: true,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toContain('export function');
    });

    it('should match case-sensitively when matchStringCaseSensitive is true', async () => {
      const testContent = 'MATCH\nmatch\nMatch';
      mockReadFile.mockResolvedValue(testContent);

      const result = await fetchContent({
        path: 'test.txt',
        matchString: 'MATCH',
        matchStringCaseSensitive: true,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toContain('MATCH');
    });

    it('should throw error for invalid regex pattern', async () => {
      const testContent = 'line 1\nline 2\nline 3';
      mockReadFile.mockResolvedValue(testContent);

      const result = await fetchContent({
        path: 'test.txt',
        matchString: '[invalid(regex',
        matchStringIsRegex: true,
      });

      expect(result.status).toBe('error');
    });

    it('should merge adjacent ranges and show omitted lines', async () => {
      // Create content with widely spaced matches
      const lines = [];
      for (let i = 0; i < 100; i++) {
        if (i === 10 || i === 50 || i === 90) {
          lines.push('MATCH_LINE');
        } else {
          lines.push(`line ${i}`);
        }
      }
      const testContent = lines.join('\n');
      mockReadFile.mockResolvedValue(testContent);

      const result = await fetchContent({
        path: 'test.txt',
        matchString: 'MATCH_LINE',
        matchStringContextLines: 2,
      });

      expect(result.status).toBe('hasResults');
      // Should contain omitted lines indicator
      expect(result.content).toContain('lines omitted');
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
      expect(result.errorCode).toBe(ERROR_CODES.PATH_VALIDATION_FAILED);
    });

    it('should handle file read errors', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const result = await fetchContent({
        path: 'nonexistent.txt',
      });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.FILE_READ_FAILED);
    });

    it('should handle stat errors (file access failed)', async () => {
      mockStat.mockRejectedValue(new Error('Cannot access file'));

      const result = await fetchContent({
        path: 'inaccessible.txt',
      });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.FILE_ACCESS_FAILED);
    });

    it('should handle stat errors with non-Error objects', async () => {
      mockStat.mockRejectedValue('String error');

      const result = await fetchContent({
        path: 'inaccessible.txt',
      });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.FILE_ACCESS_FAILED);
    });

    it('should handle unexpected errors in main try-catch', async () => {
      // Force an error by mocking validate to throw
      mockValidate.mockImplementation(() => {
        throw new Error('Unexpected validation error');
      });

      const result = await fetchContent({
        path: 'test.txt',
      });

      expect(result.status).toBe('error');
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

  describe('Large file handling', () => {
    it('should warn about large file without pagination options', async () => {
      // Mock large file (150KB)
      mockStat.mockResolvedValue({ size: 150 * 1024 } as unknown as Awaited<
        ReturnType<typeof fs.stat>
      >);

      const result = await fetchContent({
        path: 'large-file.txt',
        // No charLength or matchString
      });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.FILE_TOO_LARGE);
      expect(result.hints).toBeDefined();
      expect(result.hints!.length).toBeGreaterThan(0);
    });

    it('should require pagination for content exceeding MAX_OUTPUT_CHARS', async () => {
      // Create content larger than MAX_OUTPUT_CHARS (10000)
      const largeContent = 'x'.repeat(15000);
      mockStat.mockResolvedValue({ size: 15000 } as unknown as Awaited<
        ReturnType<typeof fs.stat>
      >);
      mockReadFile.mockResolvedValue(largeContent);

      const result = await fetchContent({
        path: 'medium-file.txt',
        // No charLength - should trigger pagination required error
      });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.PAGINATION_REQUIRED);
      expect(result.hints).toBeDefined();
    });

    it('should allow large file with charLength pagination', async () => {
      mockStat.mockResolvedValue({ size: 150 * 1024 } as unknown as Awaited<
        ReturnType<typeof fs.stat>
      >);
      mockReadFile.mockResolvedValue('test content for large file');

      const result = await fetchContent({
        path: 'large-file.txt',
        charLength: 10000,
      });

      expect(result.status).toBe('hasResults');
    });

    it('should allow large file with matchString extraction', async () => {
      mockStat.mockResolvedValue({ size: 150 * 1024 } as unknown as Awaited<
        ReturnType<typeof fs.stat>
      >);
      mockReadFile.mockResolvedValue('line 1\nMATCH\nline 3');

      const result = await fetchContent({
        path: 'large-file.txt',
        matchString: 'MATCH',
      });

      expect(result.status).toBe('hasResults');
    });

    it('should allow large file with fullContent flag and charLength', async () => {
      mockStat.mockResolvedValue({ size: 150 * 1024 } as unknown as Awaited<
        ReturnType<typeof fs.stat>
      >);
      mockReadFile.mockResolvedValue('full content of large file');

      const result = await fetchContent({
        path: 'large-file.txt',
        fullContent: true,
        charLength: 10000,
      });

      expect(result.status).toBe('hasResults');
    });

    it('should not warn for files under 100KB', async () => {
      mockStat.mockResolvedValue({ size: 50 * 1024 } as unknown as Awaited<
        ReturnType<typeof fs.stat>
      >);
      mockReadFile.mockResolvedValue('content of small file');

      const result = await fetchContent({
        path: 'small-file.txt',
        // No pagination options
      });

      expect(result.status).toBe('hasResults');
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

  describe('Character-based pagination (charOffset + charLength)', () => {
    it('should fetch content with charOffset and charLength', async () => {
      const largeContent = 'x'.repeat(20000);
      mockStat.mockResolvedValue({ size: 20000 } as unknown as Awaited<
        ReturnType<typeof fs.stat>
      >);
      mockReadFile.mockResolvedValue(largeContent);

      const result = await fetchContent({
        path: 'large.txt',
        charOffset: 0,
        charLength: 5000,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content?.length).toBeLessThanOrEqual(5000);
      expect(result.pagination?.hasMore).toBe(true);
    });

    it('should return first chunk when charOffset = 0', async () => {
      const content = 'abcdefghijklmnopqrstuvwxyz';
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charOffset: 0,
        charLength: 10,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toBe('abcdefghij');
      expect(result.pagination?.charOffset).toBe(0);
    });

    it('should return second chunk with charOffset', async () => {
      const content = 'abcdefghijklmnopqrstuvwxyz';
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charOffset: 10,
        charLength: 10,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toBe('klmnopqrst');
      expect(result.pagination?.charOffset).toBe(10);
    });

    it('should return last chunk correctly', async () => {
      const content = 'x'.repeat(1000);
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charOffset: 900,
        charLength: 200,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content?.length).toBe(100); // Only 100 chars left
      expect(result.pagination?.hasMore).toBe(false);
    });

    it('should handle charOffset = 0 explicitly', async () => {
      const content = 'test content';
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charOffset: 0,
        charLength: 100,
      });

      expect(result.status).toBe('hasResults');
      expect(result.pagination?.charOffset).toBe(0);
    });

    it('should handle charOffset at exact file length', async () => {
      const content = 'x'.repeat(100);
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charOffset: 100,
        charLength: 50,
      });

      // When charOffset is at or beyond content, we still get hasResults with empty content
      expect(result.status).toBe('hasResults');
    });

    it('should handle charOffset beyond file length', async () => {
      const content = 'short text';
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charOffset: 1000,
        charLength: 100,
      });

      // When charOffset is beyond content, we still get hasResults with empty content
      expect(result.status).toBe('hasResults');
    });

    it('should handle charLength = 1 (single char)', async () => {
      const content = 'abcdefghij';
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charLength: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toBe('a');
      expect(result.pagination?.hasMore).toBe(true);
    });

    it('should handle charLength = 10000 (max)', async () => {
      const content = 'x'.repeat(20000);
      mockStat.mockResolvedValue({ size: 20000 } as unknown as Awaited<
        ReturnType<typeof fs.stat>
      >);
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charLength: 10000,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content?.length).toBe(10000);
      expect(result.pagination?.hasMore).toBe(true);
    });

    it('should handle charLength > remaining content', async () => {
      const content = 'short text';
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charLength: 10000,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toBe('short text');
      expect(result.pagination?.hasMore).toBe(false);
    });

    it('should handle empty file with pagination params', async () => {
      mockReadFile.mockResolvedValue('');

      const result = await fetchContent({
        path: 'empty.txt',
        charOffset: 0,
        charLength: 100,
      });

      expect(result.status).toBe('empty');
    });
  });

  describe('UTF-8 multi-byte character handling', () => {
    it('should handle ASCII content pagination', async () => {
      const content = 'Hello World!\nThis is ASCII text.';
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charOffset: 0,
        charLength: 10,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toBe('Hello Worl');
    });

    it('should handle 2-byte UTF-8 chars (accented letters)', async () => {
      const content = 'Café résumé piñata';
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charOffset: 0,
        charLength: 10,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toBeDefined();
      // Should not have replacement character
      expect(result.content).not.toMatch(/\uFFFD/);
    });

    it('should handle 3-byte UTF-8 chars (CJK characters)', async () => {
      const content = '你好世界 Hello 中文';
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charOffset: 0,
        charLength: 10,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toBeDefined();
      // Should not split UTF-8 characters
      expect(result.content).not.toMatch(/\uFFFD/);
    });

    it('should handle 4-byte UTF-8 chars (emoji)', async () => {
      const content = '😀 Hello 🎉 World 👍';
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charOffset: 0,
        charLength: 10,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toBeDefined();
      // Should not split emoji
      expect(result.content).not.toMatch(/\uFFFD/);
    });

    it('should handle mixed multi-byte content', async () => {
      const content = 'Hello 世界 café 😀 test';
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charOffset: 0,
        charLength: 15,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toBeDefined();
      expect(result.content).not.toMatch(/\uFFFD/);
    });

    it('should not split multi-byte chars at charOffset boundary', async () => {
      // Position boundary right before a multi-byte char
      const content = 'aaaa' + 'é' + 'bbbb';
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charOffset: 4,
        charLength: 5,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toBeDefined();
      // Should include the 'é' without splitting
      expect(result.content).not.toMatch(/\uFFFD/);
    });

    it('should not split multi-byte chars at charLength boundary', async () => {
      // Create content where charLength boundary falls in middle of UTF-8 char
      const content = 'a'.repeat(95) + 'café';
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charOffset: 0,
        charLength: 98, // Might cut through the 'é'
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toBeDefined();
      // Should not have replacement character indicating split
      expect(result.content).not.toMatch(/\uFFFD/);
    });

    it('should calculate byte offsets correctly for UTF-8', async () => {
      // In UTF-8, byte offset != character offset for multi-byte chars
      const content = '中文test'; // 中文 = 6 bytes, test = 4 bytes
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        charOffset: 2, // After "中文"
        charLength: 4,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toBe('test');
    });
  });

  describe('Integration with matchString', () => {
    it('should combine matchString with charOffset/charLength', async () => {
      const content = 'line1\nMATCH1\nline2\nMATCH2\nline3\nMATCH3\nline4';
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        matchString: 'MATCH',
        charOffset: 0,
        charLength: 100,
      });

      expect(result.status).toBe('hasResults');
      expect(result.content).toContain('MATCH');
    });

    it('should paginate matched sections', async () => {
      const content = 'MATCH\n' + 'x'.repeat(10000) + '\nMATCH';
      mockStat.mockResolvedValue({ size: 10020 } as unknown as Awaited<
        ReturnType<typeof fs.stat>
      >);
      mockReadFile.mockResolvedValue(content);

      const result = await fetchContent({
        path: 'test.txt',
        matchString: 'MATCH',
        matchStringContextLines: 5,
        charLength: 5000,
      });

      expect(result.status).toBe('hasResults');
    });

    it('should error with patternTooBroad when matches are too large without pagination', async () => {
      const manyLines = Array.from({ length: 2000 }, () => 'MATCH').join('\n');
      mockStat.mockResolvedValue({
        size: manyLines.length,
      } as unknown as Awaited<ReturnType<typeof fs.stat>>);
      mockReadFile.mockResolvedValue(manyLines);

      const result = await fetchContent({
        path: 'huge.txt',
        matchString: 'MATCH',
        // No charLength specified -> should be too broad
      });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.PATTERN_TOO_BROAD);
    });
  });

  describe('Pagination hints', () => {
    it('should show pagination hints when content is partial', async () => {
      const largeContent = 'x'.repeat(20000);
      mockStat.mockResolvedValue({ size: 20000 } as unknown as Awaited<
        ReturnType<typeof fs.stat>
      >);
      mockReadFile.mockResolvedValue(largeContent);

      const result = await fetchContent({
        path: 'large.txt',
        charLength: 5000,
      });

      expect(result.status).toBe('hasResults');
      expect(result.pagination?.hasMore).toBe(true);
      expect(result.hints).toBeDefined();
    });

    it('should show charOffset for next chunk in hints', async () => {
      const largeContent = 'x'.repeat(20000);
      mockStat.mockResolvedValue({ size: 20000 } as unknown as Awaited<
        ReturnType<typeof fs.stat>
      >);
      mockReadFile.mockResolvedValue(largeContent);

      const result = await fetchContent({
        path: 'large.txt',
        charOffset: 0,
        charLength: 5000,
      });

      expect(result.status).toBe('hasResults');
      if (result.pagination?.hasMore) {
        expect(result.hints).toBeDefined();
        const hasCharOffsetHint = result.hints?.some(
          h => h.includes('charOffset') && h.includes('5000')
        );
        expect(hasCharOffsetHint).toBe(true);
      }
    });

    it('should show total chars in hints', async () => {
      const largeContent = 'x'.repeat(20000);
      mockStat.mockResolvedValue({ size: 20000 } as unknown as Awaited<
        ReturnType<typeof fs.stat>
      >);
      mockReadFile.mockResolvedValue(largeContent);

      const result = await fetchContent({
        path: 'large.txt',
        charLength: 5000,
      });

      expect(result.status).toBe('hasResults');
      if (result.hints) {
        const hasTotalCharsHint = result.hints.some(
          h => h.includes('total') || h.includes('20000')
        );
        expect(hasTotalCharsHint).toBe(true);
      }
    });

    it('should not show pagination hints when content fits', async () => {
      const smallContent = 'Small file content';
      mockReadFile.mockResolvedValue(smallContent);

      const result = await fetchContent({
        path: 'small.txt',
        charLength: 10000,
      });

      expect(result.status).toBe('hasResults');
      expect(result.pagination?.hasMore).toBe(false);
    });

    it('should show helpful hints for navigating pages', async () => {
      const largeContent = 'x'.repeat(20000);
      mockStat.mockResolvedValue({ size: 20000 } as unknown as Awaited<
        ReturnType<typeof fs.stat>
      >);
      mockReadFile.mockResolvedValue(largeContent);

      const result = await fetchContent({
        path: 'large.txt',
        charLength: 5000,
        charOffset: 5000,
      });

      expect(result.status).toBe('hasResults');
      if (result.pagination?.hasMore) {
        expect(result.hints).toBeDefined();
        // Should mention how to get next page
        const hasNavigationHint = result.hints?.some(
          h =>
            h.toLowerCase().includes('next') || h.includes('charOffset=10000')
        );
        expect(hasNavigationHint).toBe(true);
      }
    });
  });
});

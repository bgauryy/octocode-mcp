/**
 * Tests for line-aware pagination utility
 * Critical for handling large files, minified files, and mixed-line-length files
 */

import { describe, it, expect } from 'vitest';
import { sliceByCharRespectLines } from '../../src/utils/pagination.js';

describe('sliceByCharRespectLines', () => {
  describe('Basic line-aware slicing', () => {
    it('should slice at line boundaries', () => {
      const text = 'line1\nline2\nline3\nline4\n';
      const result = sliceByCharRespectLines(text, 0, 12);

      // charLength=12 from position 0 ends at position 12
      // text[11] = '\n' (after line2), so we're AT a line boundary
      // No extension needed
      expect(result.sliced).toBe('line1\nline2\n');
      expect(result.actualOffset).toBe(0);
      expect(result.actualLength).toBe(12);
      expect(result.lineCount).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    it('should adjust offset to line start if mid-line', () => {
      const text = 'line1\nline2\nline3\n';
      // Request starting at position 8 (middle of line2)
      const result = sliceByCharRespectLines(text, 8, 10);

      // Should adjust to start of line2 (position 6)
      expect(result.actualOffset).toBe(6);
      expect(result.sliced).toBe('line2\nline3\n');
      expect(result.lineCount).toBe(2);
    });

    it('should adjust end to line boundary', () => {
      const text = 'line1\nline2\nline3\n';
      // Request 8 chars from start (ends mid-line2)
      const result = sliceByCharRespectLines(text, 0, 8);

      // Should extend to end of line2 (include newline)
      expect(result.sliced).toBe('line1\nline2\n');
      expect(result.actualLength).toBe(12);
    });
  });

  describe('Minified files (single long line)', () => {
    it('should handle single-line files', () => {
      const text = 'x'.repeat(50000); // 50K chars, no newlines
      const result = sliceByCharRespectLines(text, 0, 10000);

      // Should return the entire line (no newlines to break on)
      expect(result.sliced).toBe(text);
      expect(result.actualLength).toBe(50000);
      expect(result.lineCount).toBe(0); // No newlines
      expect(result.hasMore).toBe(false);
    });

    it('should handle single-line file with trailing newline', () => {
      const text = 'x'.repeat(50000) + '\n';
      const result = sliceByCharRespectLines(text, 0, 10000);

      // Should return entire line including newline
      expect(result.sliced).toBe(text);
      expect(result.actualLength).toBe(50001);
      expect(result.lineCount).toBe(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty text', () => {
      const result = sliceByCharRespectLines('', 0, 100);

      expect(result.sliced).toBe('');
      expect(result.actualOffset).toBe(0);
      expect(result.actualLength).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.lineCount).toBe(0);
    });

    it('should handle offset beyond text length', () => {
      const text = 'line1\nline2\n';
      const result = sliceByCharRespectLines(text, 1000, 100);

      expect(result.sliced).toBe('');
      expect(result.hasMore).toBe(false);
    });

    it('should handle charLength larger than remaining text', () => {
      const text = 'line1\nline2\nline3\n';
      const result = sliceByCharRespectLines(text, 0, 100000);

      // Should return all text
      expect(result.sliced).toBe(text);
      expect(result.totalChars).toBe(text.length);
      expect(result.hasMore).toBe(false);
    });

    it('should handle text without trailing newline', () => {
      const text = 'line1\nline2\nline3';
      const result = sliceByCharRespectLines(text, 12, 10);

      // Should include last line even without newline
      expect(result.sliced).toBe('line3');
      expect(result.hasMore).toBe(false);
    });
  });

  describe('Pagination continuity', () => {
    it('should provide correct nextOffset for continued pagination', () => {
      const text = 'line1\nline2\nline3\nline4\nline5\n';

      // First page - exactly at line boundary
      const page1 = sliceByCharRespectLines(text, 0, 12);
      expect(page1.sliced).toBe('line1\nline2\n');
      expect(page1.hasMore).toBe(true);
      expect(page1.nextOffset).toBe(12);

      // Second page using nextOffset
      const page2 = sliceByCharRespectLines(text, page1.nextOffset, 12);
      expect(page2.sliced).toBe('line3\nline4\n');
      expect(page2.hasMore).toBe(true);

      // Third page
      const page3 = sliceByCharRespectLines(text, page2.nextOffset, 12);
      expect(page3.sliced).toBe('line5\n');
      expect(page3.hasMore).toBe(false);
    });

    it('should not have overlapping content between pages', () => {
      const text = 'aaa\nbbb\nccc\nddd\n';

      const page1 = sliceByCharRespectLines(text, 0, 5);
      const page2 = sliceByCharRespectLines(text, page1.nextOffset, 5);

      // Page 1: charLength=5 from 0 ends at char 5 (middle of bbb), extends to include bbb
      expect(page1.sliced).toBe('aaa\nbbb\n');
      // Page 2: starts from nextOffset (8), extends to include rest
      expect(page2.sliced).toBe('ccc\nddd\n');

      // Verify no overlap
      const page1LastLine = page1.sliced.split('\n').slice(-2, -1)[0];
      const page2FirstLine = page2.sliced.split('\n')[0];
      expect(page1LastLine).not.toBe(page2FirstLine);
    });
  });

  describe('Mixed line lengths', () => {
    it('should handle varied line lengths', () => {
      const text = 'short\n' + 'x'.repeat(1000) + '\nshort again\n';
      const result = sliceByCharRespectLines(text, 0, 500);

      // Should include complete lines, adjusting length as needed
      expect(result.sliced).toContain('short\n');
      expect(result.actualLength).toBeGreaterThan(500); // Adjusted to include full line
      expect(result.lineCount).toBeGreaterThan(0);
    });

    it('should handle realistic code file structure', () => {
      const text = [
        'import foo from "bar";',
        'import baz from "qux";',
        '',
        'function test() {',
        '  const x = 1;',
        '  return x;',
        '}',
        '',
      ].join('\n');

      const result = sliceByCharRespectLines(text, 0, 50);

      // Should slice cleanly at line boundaries
      expect(result.sliced).toMatch(/\n$/); // Ends with newline
      expect(result.sliced.split('\n').length - 1).toBe(result.lineCount);
    });
  });

  describe('Line count accuracy', () => {
    it('should count lines correctly', () => {
      const text = 'a\nb\nc\n';
      const result = sliceByCharRespectLines(text, 0, 100);

      expect(result.lineCount).toBe(3);
    });

    it('should count lines in partial slice', () => {
      const text = 'a\nb\nc\nd\ne\n';
      const result = sliceByCharRespectLines(text, 0, 6);

      // charLength=6 from 0 ends at position 6
      // text[5] = '\n' (after 'c'), so we're AT a line boundary
      expect(result.sliced).toBe('a\nb\nc\n');
      expect(result.lineCount).toBe(3);
    });

    it('should handle lines without newlines', () => {
      const text = 'single line no newline';
      const result = sliceByCharRespectLines(text, 0, 100);

      expect(result.lineCount).toBe(0); // No newlines
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle ripgrep output with line numbers', () => {
      const text =
        ['1:match one', '2:match two', '3:match three', '4:match four'].join(
          '\n'
        ) + '\n';

      const result = sliceByCharRespectLines(text, 0, 25);

      // Should include complete lines with line numbers intact
      expect(result.sliced).toMatch(/^\d+:/); // Starts with line number
      expect(result.sliced).toMatch(/\n$/); // Ends with newline
      expect(
        result.sliced
          .split('\n')
          .every((line) => line === '' || /^\d+:/.test(line))
      ).toBe(true);
    });

    it('should handle JSON output from ripgrep', () => {
      const text =
        [
          '{"type":"match","data":{"path":{"text":"file.ts"}}}',
          '{"type":"match","data":{"path":{"text":"file2.ts"}}}',
          '{"type":"match","data":{"path":{"text":"file3.ts"}}}',
        ].join('\n') + '\n';

      const result = sliceByCharRespectLines(text, 0, 60);

      // Should not cut JSON objects mid-line
      const lines = result.sliced.trim().split('\n');
      lines.forEach((line) => {
        if (line) {
          expect(() => JSON.parse(line)).not.toThrow();
        }
      });
    });

    it('should handle context lines from ripgrep', () => {
      const text =
        [
          '100-context before',
          '101:match line',
          '102-context after',
          '103-more context',
        ].join('\n') + '\n';

      const result = sliceByCharRespectLines(text, 0, 40);

      // Should preserve line structure (context markers)
      expect(result.sliced).toContain('100-');
      expect(result.sliced).toContain('101:');
      const lines = result.sliced.split('\n');
      expect(lines.some((l) => l.includes('-'))).toBe(true);
      expect(lines.some((l) => l.includes(':'))).toBe(true);
    });
  });

  describe('Performance characteristics', () => {
    it('should handle large files efficiently', () => {
      // Create a large file: 10K lines, 100 chars each
      const lines = Array(10000).fill('x'.repeat(99)).join('\n') + '\n';
      const text = lines; // ~1MB

      const start = Date.now();
      const result = sliceByCharRespectLines(text, 0, 10000);
      const duration = Date.now() - start;

      // Should complete quickly (< 100ms for 1MB)
      expect(duration).toBeLessThan(100);
      expect(result.sliced).toBeTruthy();
    });
  });
});

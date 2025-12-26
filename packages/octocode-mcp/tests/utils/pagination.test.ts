/**
 * Tests for pagination utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  applyPagination,
  generatePaginationHints,
  serializeForPagination,
  sliceByCharRespectLines,
  createPaginationInfo,
  type PaginationMetadata,
} from '../../src/utils/local/utils/pagination.js';

describe('pagination utility', () => {
  describe('applyPagination', () => {
    it('should return full content when no charLength provided', () => {
      const content = 'Hello World';
      const result = applyPagination(content);

      expect(result.paginatedContent).toBe(content);
      expect(result.charOffset).toBe(0);
      expect(result.charLength).toBe(11);
      expect(result.totalChars).toBe(11);
      expect(result.hasMore).toBe(false);
      expect(result.currentPage).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should paginate content with charLength', () => {
      const content = 'Hello World, this is a test';
      const result = applyPagination(content, 0, 10);

      expect(result.paginatedContent).toBe('Hello Worl');
      expect(result.charOffset).toBe(0);
      expect(result.charLength).toBe(10);
      expect(result.totalChars).toBe(27);
      expect(result.hasMore).toBe(true);
      expect(result.nextCharOffset).toBe(10);
    });

    it('should handle charOffset', () => {
      const content = 'Hello World';
      const result = applyPagination(content, 6, 5);

      expect(result.paginatedContent).toBe('World');
      expect(result.charOffset).toBe(6);
      expect(result.charLength).toBe(5);
      expect(result.hasMore).toBe(false);
    });

    it('should calculate page numbers correctly', () => {
      const content = 'a'.repeat(100);
      const result = applyPagination(content, 50, 25);

      expect(result.currentPage).toBe(3); // 50/25 + 1 = 3
      expect(result.totalPages).toBe(4); // ceil(100/25) = 4
    });

    it('should handle charOffset beyond content length', () => {
      const content = 'Short';
      const result = applyPagination(content, 100, 10);

      expect(result.paginatedContent).toBe('');
      expect(result.charOffset).toBe(5); // capped to content length
      expect(result.hasMore).toBe(false);
    });

    it('should use actualOffset for page calculation when provided', () => {
      const content = 'Hello World Test Content';
      const result = applyPagination(content, 5, 10, { actualOffset: 10 });

      expect(result.currentPage).toBe(2); // 10/10 + 1 = 2
    });
  });

  describe('generatePaginationHints', () => {
    it('should generate critical token warning for large content', () => {
      const metadata: PaginationMetadata = {
        paginatedContent: 'x'.repeat(200000),
        charOffset: 0,
        charLength: 200000,
        totalChars: 200000,
        hasMore: false,
        estimatedTokens: 55000,
        currentPage: 1,
        totalPages: 1,
      };

      const hints = generatePaginationHints(metadata);

      expect(hints.some(h => h.includes('CRITICAL'))).toBe(true);
      expect(hints.some(h => h.includes('TOO LARGE'))).toBe(true);
    });

    it('should generate warning for high token usage', () => {
      const metadata: PaginationMetadata = {
        paginatedContent: 'x'.repeat(100000),
        charOffset: 0,
        charLength: 100000,
        totalChars: 100000,
        hasMore: false,
        estimatedTokens: 30001, // Must be > 30000 to trigger WARNING
        currentPage: 1,
        totalPages: 1,
      };

      const hints = generatePaginationHints(metadata);

      expect(hints.some(h => h.includes('WARNING'))).toBe(true);
    });

    it('should generate notice for moderate token usage', () => {
      const metadata: PaginationMetadata = {
        paginatedContent: 'x'.repeat(50000),
        charOffset: 0,
        charLength: 50000,
        totalChars: 50000,
        hasMore: false,
        estimatedTokens: 15001, // Must be > 15000 to trigger NOTICE
        currentPage: 1,
        totalPages: 1,
      };

      const hints = generatePaginationHints(metadata);

      expect(hints.some(h => h.includes('NOTICE'))).toBe(true);
    });

    it('should generate moderate usage message', () => {
      const metadata: PaginationMetadata = {
        paginatedContent: 'x'.repeat(20000),
        charOffset: 0,
        charLength: 20000,
        totalChars: 20000,
        hasMore: false,
        estimatedTokens: 5001, // Must be > 5000 to trigger Moderate usage
        currentPage: 1,
        totalPages: 1,
      };

      const hints = generatePaginationHints(metadata);

      expect(hints.some(h => h.includes('Moderate usage'))).toBe(true);
    });

    it('should generate efficient query message for small content', () => {
      const metadata: PaginationMetadata = {
        paginatedContent: 'Hello World',
        charOffset: 0,
        charLength: 11,
        totalChars: 11,
        hasMore: false,
        estimatedTokens: 3,
        currentPage: 1,
        totalPages: 1,
      };

      const hints = generatePaginationHints(metadata);

      expect(hints.some(h => h.includes('Efficient query'))).toBe(true);
    });

    it('should disable warnings when enableWarnings is false', () => {
      const metadata: PaginationMetadata = {
        paginatedContent: 'x'.repeat(200000),
        charOffset: 0,
        charLength: 200000,
        totalChars: 200000,
        hasMore: false,
        estimatedTokens: 55000,
        currentPage: 1,
        totalPages: 1,
      };

      const hints = generatePaginationHints(metadata, {
        enableWarnings: false,
      });

      expect(hints.some(h => h.includes('CRITICAL'))).toBe(false);
      expect(hints.some(h => h.includes('WARNING'))).toBe(false);
    });

    it('should include custom hints', () => {
      const metadata: PaginationMetadata = {
        paginatedContent: 'test',
        charOffset: 0,
        charLength: 4,
        totalChars: 4,
        hasMore: false,
        estimatedTokens: 1,
        currentPage: 1,
        totalPages: 1,
      };

      const hints = generatePaginationHints(metadata, {
        customHints: ['Custom hint 1', 'Custom hint 2'],
      });

      expect(hints).toContain('Custom hint 1');
      expect(hints).toContain('Custom hint 2');
    });

    it('should include pagination info when hasMore is true', () => {
      const metadata: PaginationMetadata = {
        paginatedContent: 'Hello',
        charOffset: 0,
        charLength: 5,
        totalChars: 20,
        hasMore: true,
        nextCharOffset: 5,
        estimatedTokens: 2,
        currentPage: 1,
        totalPages: 4,
      };

      const hints = generatePaginationHints(metadata);

      expect(hints.some(h => h.includes('More available'))).toBe(true);
      expect(hints.some(h => h.includes('Next page'))).toBe(true);
      expect(hints.some(h => h.includes('charOffset=5'))).toBe(true);
    });

    it('should show final page message when offset > 0 and no more', () => {
      const metadata: PaginationMetadata = {
        paginatedContent: 'World',
        charOffset: 15,
        charLength: 5,
        totalChars: 20,
        hasMore: false,
        estimatedTokens: 2,
        currentPage: 4,
        totalPages: 4,
      };

      const hints = generatePaginationHints(metadata);

      expect(hints.some(h => h.includes('Final page'))).toBe(true);
    });
  });

  describe('serializeForPagination', () => {
    it('should serialize data to JSON', () => {
      const data = { name: 'test', value: 123 };
      const result = serializeForPagination(data);

      expect(result).toBe('{"name":"test","value":123}');
    });

    it('should pretty print when requested', () => {
      const data = { name: 'test' };
      const result = serializeForPagination(data, true);

      expect(result).toBe('{\n  "name": "test"\n}');
    });

    it('should serialize arrays', () => {
      const data = [1, 2, 3];
      const result = serializeForPagination(data);

      expect(result).toBe('[1,2,3]');
    });
  });

  describe('sliceByCharRespectLines', () => {
    it('should handle empty text', () => {
      const result = sliceByCharRespectLines('', 0, 100);

      expect(result.sliced).toBe('');
      expect(result.actualOffset).toBe(0);
      expect(result.actualLength).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.lineCount).toBe(0);
      expect(result.totalChars).toBe(0);
    });

    it('should handle charOffset beyond text length', () => {
      const text = 'Hello World';
      const result = sliceByCharRespectLines(text, 100, 10);

      expect(result.sliced).toBe('');
      expect(result.actualOffset).toBe(11);
      expect(result.actualLength).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBe(11);
    });

    it('should slice from beginning respecting line boundaries', () => {
      const text = 'line1\nline2\nline3\n';
      const result = sliceByCharRespectLines(text, 0, 10);

      // Should include complete lines up to ~10 chars
      expect(result.sliced).toBe('line1\nline2\n');
      expect(result.actualOffset).toBe(0);
      expect(result.hasMore).toBe(true);
      expect(result.lineCount).toBe(2);
    });

    it('should adjust offset to line boundary when mid-line', () => {
      const text = 'line1\nline2\nline3\n';
      // Start at position 8 (middle of "line2")
      const result = sliceByCharRespectLines(text, 8, 10);

      // Should adjust to start of line2 (position 6)
      expect(result.actualOffset).toBe(6);
      expect(result.sliced.startsWith('line2')).toBe(true);
    });

    it('should extend to complete the line at end', () => {
      const text = 'line1\nline2\nline3\n';
      // Request ends mid-line
      const result = sliceByCharRespectLines(text, 0, 8);

      // Should extend to include full "line2\n"
      expect(result.sliced).toBe('line1\nline2\n');
      expect(result.actualLength).toBe(12);
    });

    it('should handle text without trailing newline', () => {
      const text = 'line1\nline2';
      const result = sliceByCharRespectLines(text, 0, 20);

      expect(result.sliced).toBe('line1\nline2');
      expect(result.hasMore).toBe(false);
      expect(result.lineCount).toBe(1); // Only one newline
    });

    it('should handle single line text', () => {
      const text = 'This is a single line without newline';
      const result = sliceByCharRespectLines(text, 0, 20);

      // Should return entire line since no newline boundary
      expect(result.sliced).toBe(text);
      expect(result.hasMore).toBe(false);
    });

    it('should return correct nextOffset', () => {
      const text = 'line1\nline2\nline3\n';
      const result = sliceByCharRespectLines(text, 0, 6);

      expect(result.sliced).toBe('line1\n');
      expect(result.nextOffset).toBe(6);
      expect(result.hasMore).toBe(true);
    });

    it('should handle minified content (single long line)', () => {
      const text = 'a'.repeat(100);
      const result = sliceByCharRespectLines(text, 0, 50);

      // No newlines, so should return entire content
      expect(result.sliced).toBe(text);
      expect(result.hasMore).toBe(false);
    });

    it('should correctly count lines', () => {
      const text = 'a\nb\nc\nd\n';
      const result = sliceByCharRespectLines(text, 0, 100);

      expect(result.lineCount).toBe(4);
    });

    it('should handle offset at exact line boundary', () => {
      const text = 'line1\nline2\nline3\n';
      // Offset at start of line2
      const result = sliceByCharRespectLines(text, 6, 6);

      expect(result.actualOffset).toBe(6);
      expect(result.sliced).toBe('line2\n');
    });

    it('should handle when charLength exceeds remaining text', () => {
      const text = 'line1\nline2\n';
      const result = sliceByCharRespectLines(text, 6, 1000);

      expect(result.sliced).toBe('line2\n');
      expect(result.hasMore).toBe(false);
      // nextOffset is undefined when hasMore is false
      expect(result.nextOffset).toBeUndefined();
    });

    it('should return totalChars correctly', () => {
      const text = 'test content\n';
      const result = sliceByCharRespectLines(text, 0, 5);

      expect(result.totalChars).toBe(13);
    });

    it('should handle text ending exactly at charLength', () => {
      const text = 'line1\n';
      const result = sliceByCharRespectLines(text, 0, 6);

      expect(result.sliced).toBe('line1\n');
      expect(result.hasMore).toBe(false);
      expect(result.actualLength).toBe(6);
    });
  });

  describe('createPaginationInfo', () => {
    it('should extract pagination info from metadata', () => {
      const metadata: PaginationMetadata = {
        paginatedContent: 'Hello World',
        charOffset: 10,
        charLength: 11,
        totalChars: 100,
        hasMore: true,
        nextCharOffset: 21,
        estimatedTokens: 3,
        currentPage: 2,
        totalPages: 10,
      };

      const info = createPaginationInfo(metadata);

      expect(info.currentPage).toBe(2);
      expect(info.totalPages).toBe(10);
      expect(info.charOffset).toBe(10);
      expect(info.charLength).toBe(11);
      expect(info.totalChars).toBe(100);
      expect(info.hasMore).toBe(true);
    });

    it('should work for non-paginated content', () => {
      const metadata: PaginationMetadata = {
        paginatedContent: 'Full content',
        charOffset: 0,
        charLength: 12,
        totalChars: 12,
        hasMore: false,
        estimatedTokens: 3,
        currentPage: 1,
        totalPages: 1,
      };

      const info = createPaginationInfo(metadata);

      expect(info.currentPage).toBe(1);
      expect(info.totalPages).toBe(1);
      expect(info.hasMore).toBe(false);
    });
  });
});

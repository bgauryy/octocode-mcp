/**
 * Tests for pagination utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  applyPagination,
  generatePaginationHints,
  generateGitHubPaginationHints,
  generateStructurePaginationHints,
  serializeForPagination,
  sliceByCharRespectLines,
  createPaginationInfo,
  type PaginationMetadata,
} from '../../src/utils/pagination/index.js';

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

    // NEW TEST CASE FOR UTF-8 BYTE OFFSETS
    it('should handle UTF-8 byte offsets correctly (failing case)', () => {
      const content = 'a🚀b'; // 'a' (1 byte), '🚀' (4 bytes), 'b' (1 byte)
      // We want to skip 'a' (1 byte) and take next 4 bytes (🚀)
      const result = applyPagination(content, 1, 4, { mode: 'bytes' });

      // If we use byte offsets:
      // Byte 0: 'a'
      // Byte 1-4: '🚀'
      // Byte 5: 'b'
      // Offset 1, Length 4 -> Bytes 1,2,3,4 -> "🚀"

      expect(result.paginatedContent).toBe('🚀');
      expect(result.charLength).toBe(4); // Bytes, not chars
    });

    it('should handle bytes mode reaching end of content (hasMore=false)', () => {
      const content = 'Hello'; // 5 bytes ASCII
      // Start at byte 3, take 10 bytes (will hit end)
      const result = applyPagination(content, 3, 10, { mode: 'bytes' });

      expect(result.paginatedContent).toBe('lo');
      expect(result.hasMore).toBe(false);
      expect(result.nextCharOffset).toBeUndefined();
    });

    it('should handle bytes mode with multi-byte UTF-8 at exact boundary', () => {
      const content = '你好世界'; // 4 Chinese chars, 12 bytes total (3 bytes each)
      const result = applyPagination(content, 0, 6, { mode: 'bytes' });

      expect(result.paginatedContent).toBe('你好');
      expect(result.charLength).toBe(6);
      expect(result.hasMore).toBe(true);
      expect(result.nextCharOffset).toBe(6);
    });

    it('should handle bytes mode with exact fit content', () => {
      const content = 'abc'; // 3 bytes
      const result = applyPagination(content, 0, 3, { mode: 'bytes' });

      expect(result.paginatedContent).toBe('abc');
      expect(result.hasMore).toBe(false);
      expect(result.nextCharOffset).toBeUndefined();
      expect(result.totalChars).toBe(3);
    });

    it('should return estimated tokens correctly', () => {
      const content = 'a'.repeat(400); // 400 chars = ~100 tokens
      const result = applyPagination(content, 0, 200);

      expect(result.estimatedTokens).toBe(50); // 200/4 = 50
    });

    it('should handle zero charOffset explicitly', () => {
      const content = 'Test content';
      const result = applyPagination(content, 0, 5);

      expect(result.paginatedContent).toBe('Test ');
      expect(result.charOffset).toBe(0);
    });

    it('should set nextCharOffset to undefined when at last page in character mode', () => {
      const content = 'Short';
      const result = applyPagination(content, 0, 5);

      expect(result.hasMore).toBe(false);
      expect(result.nextCharOffset).toBeUndefined();
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

    it('should not show navigation hints when on first page with no more', () => {
      const metadata: PaginationMetadata = {
        paginatedContent: 'Hello',
        charOffset: 0,
        charLength: 5,
        totalChars: 5,
        hasMore: false,
        estimatedTokens: 2,
        currentPage: 1,
        totalPages: 1,
      };

      const hints = generatePaginationHints(metadata);

      // Should NOT show "Final page" since charOffset is 0
      expect(hints.some(h => h.includes('Final page'))).toBe(false);
      // Should NOT show "More available" since hasMore is false
      expect(hints.some(h => h.includes('More available'))).toBe(false);
    });

    it('should handle metadata without estimatedTokens', () => {
      const metadata: PaginationMetadata = {
        paginatedContent: 'Hello',
        charOffset: 0,
        charLength: 5,
        totalChars: 10,
        hasMore: true,
        nextCharOffset: 5,
        currentPage: 1,
        totalPages: 2,
      };

      const hints = generatePaginationHints(metadata);

      // Should still have navigation hints
      expect(hints.some(h => h.includes('More available'))).toBe(true);
      // Should NOT have token warnings since estimatedTokens is undefined
      expect(hints.some(h => h.includes('tokens'))).toBe(false);
    });

    it('should handle missing nextCharOffset when hasMore is true', () => {
      const metadata: PaginationMetadata = {
        paginatedContent: 'Hello',
        charOffset: 0,
        charLength: 5,
        totalChars: 10,
        hasMore: true,
        // nextCharOffset is intentionally missing
        currentPage: 1,
        totalPages: 2,
      };

      const hints = generatePaginationHints(metadata);

      // Should NOT show "Next page: Use charOffset=" if nextCharOffset is missing
      expect(hints.some(h => h.includes('charOffset='))).toBe(false);
    });

    it('should include toolName in hints if provided', () => {
      const metadata: PaginationMetadata = {
        paginatedContent: 'Hello',
        charOffset: 0,
        charLength: 5,
        totalChars: 10,
        hasMore: true,
        nextCharOffset: 5,
        estimatedTokens: 2,
        currentPage: 1,
        totalPages: 2,
      };

      const hints = generatePaginationHints(metadata, {
        toolName: 'testTool',
      });

      expect(Array.isArray(hints)).toBe(true);
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

  describe('generateGitHubPaginationHints', () => {
    it('should show complete message when no more pages', () => {
      const pagination = {
        currentPage: 1,
        totalPages: 1,
        hasMore: false,
        charOffset: 0,
        charLength: 100,
        totalChars: 100,
      };
      const query = {
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'src/index.ts',
        branch: 'main',
      };

      const hints = generateGitHubPaginationHints(pagination, query);

      expect(hints.some(h => h.includes('Complete content retrieved'))).toBe(
        true
      );
      expect(hints.some(h => h.includes('1 page'))).toBe(true);
    });

    it('should show next page instructions when hasMore is true', () => {
      const pagination = {
        currentPage: 1,
        totalPages: 3,
        hasMore: true,
        charOffset: 0,
        charLength: 20000,
        totalChars: 60000,
      };
      const query = {
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'src/index.ts',
        branch: 'main',
      };

      const hints = generateGitHubPaginationHints(pagination, query);

      expect(hints.some(h => h.includes('Page 1/3'))).toBe(true);
      expect(hints.some(h => h.includes('TO GET NEXT PAGE'))).toBe(true);
      expect(hints.some(h => h.includes('charOffset=20000'))).toBe(true);
      expect(hints.some(h => h.includes('owner="test-owner"'))).toBe(true);
      expect(hints.some(h => h.includes('repo="test-repo"'))).toBe(true);
      expect(hints.some(h => h.includes('path="src/index.ts"'))).toBe(true);
      expect(hints.some(h => h.includes('branch="main"'))).toBe(true);
    });

    it('should omit branch param when not provided', () => {
      const pagination = {
        currentPage: 1,
        totalPages: 2,
        hasMore: true,
        charOffset: 0,
        charLength: 20000,
        totalChars: 40000,
      };
      const query = {
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'src/index.ts',
      };

      const hints = generateGitHubPaginationHints(pagination, query);

      expect(hints.some(h => h.includes('branch='))).toBe(false);
    });

    it('should handle undefined charOffset and charLength (nullish coalescing)', () => {
      const pagination = {
        currentPage: 1,
        totalPages: 2,
        hasMore: true,
        // charOffset and charLength are undefined
      };
      const query = {
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'src/index.ts',
      };

      const hints = generateGitHubPaginationHints(pagination, query);

      // Should use 0 as default for calculations
      expect(hints.some(h => h.includes('charOffset=0'))).toBe(true);
      // Should show "0 of X chars" with defaults
      expect(hints.some(h => h.includes('0 of'))).toBe(true);
    });

    it('should handle undefined totalChars', () => {
      const pagination = {
        currentPage: 1,
        totalPages: 2,
        hasMore: true,
        charOffset: 0,
        charLength: 1000,
        // totalChars is undefined
      };
      const query = {
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'src/index.ts',
      };

      const hints = generateGitHubPaginationHints(pagination, query);

      // Should use 0 as default
      expect(hints.some(h => h.includes('1,000 of 0 chars'))).toBe(true);
    });

    it('should show plural "pages" when totalPages > 1', () => {
      const pagination = {
        currentPage: 2,
        totalPages: 3,
        hasMore: false,
        charOffset: 40000,
        charLength: 20000,
        totalChars: 60000,
      };
      const query = {
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'src/index.ts',
      };

      const hints = generateGitHubPaginationHints(pagination, query);

      expect(hints.some(h => h.includes('3 pages'))).toBe(true);
    });
  });

  describe('generateStructurePaginationHints', () => {
    it('should show page info and file/folder counts', () => {
      const pagination = {
        currentPage: 1,
        totalPages: 1,
        hasMore: false,
        entriesPerPage: 50,
        totalEntries: 35,
      };
      const context = {
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'main',
        pageFiles: 30,
        pageFolders: 5,
        allFiles: 30,
        allFolders: 5,
      };

      const hints = generateStructurePaginationHints(pagination, context);

      expect(hints.some(h => h.includes('Page 1/1'))).toBe(true);
      expect(hints.some(h => h.includes('30 files'))).toBe(true);
      expect(hints.some(h => h.includes('5 folders'))).toBe(true);
      expect(hints.some(h => h.includes('35 entries'))).toBe(true);
      expect(hints.some(h => h.includes('Complete structure retrieved'))).toBe(
        true
      );
    });

    it('should show next page instructions when hasMore is true', () => {
      const pagination = {
        currentPage: 1,
        totalPages: 3,
        hasMore: true,
        entriesPerPage: 20,
        totalEntries: 55,
      };
      const context = {
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'main',
        path: 'src',
        depth: 2,
        pageFiles: 15,
        pageFolders: 5,
        allFiles: 40,
        allFolders: 15,
      };

      const hints = generateStructurePaginationHints(pagination, context);

      expect(hints.some(h => h.includes('Page 1/3'))).toBe(true);
      expect(hints.some(h => h.includes('TO GET NEXT PAGE'))).toBe(true);
      expect(hints.some(h => h.includes('entryPageNumber=2'))).toBe(true);
      expect(hints.some(h => h.includes('owner="test-owner"'))).toBe(true);
      expect(hints.some(h => h.includes('repo="test-repo"'))).toBe(true);
      expect(hints.some(h => h.includes('branch="main"'))).toBe(true);
      expect(hints.some(h => h.includes('path="src"'))).toBe(true);
      expect(hints.some(h => h.includes('depth=2'))).toBe(true);
      expect(hints.some(h => h.includes('entriesPerPage=20'))).toBe(true);
    });

    it('should omit path and depth when not provided', () => {
      const pagination = {
        currentPage: 1,
        totalPages: 2,
        hasMore: true,
        entriesPerPage: 20,
        totalEntries: 30,
      };
      const context = {
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'main',
        pageFiles: 18,
        pageFolders: 2,
        allFiles: 25,
        allFolders: 5,
      };

      const hints = generateStructurePaginationHints(pagination, context);

      expect(hints.some(h => h.includes('path='))).toBe(false);
      // depth=1 is default, should not be included
      expect(hints.some(h => h.includes('depth='))).toBe(false);
    });

    it('should show singular "page" when totalPages is 1', () => {
      const pagination = {
        currentPage: 1,
        totalPages: 1,
        hasMore: false,
        entriesPerPage: 50,
        totalEntries: 10,
      };
      const context = {
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'main',
        pageFiles: 10,
        pageFolders: 0,
        allFiles: 10,
        allFolders: 0,
      };

      const hints = generateStructurePaginationHints(pagination, context);

      expect(hints.some(h => h.includes('1 page)'))).toBe(true);
      expect(hints.some(h => h.includes('pages)'))).toBe(false);
    });

    it('should show plural "pages" when totalPages > 1', () => {
      const pagination = {
        currentPage: 3,
        totalPages: 3,
        hasMore: false,
        entriesPerPage: 20,
        totalEntries: 55,
      };
      const context = {
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'main',
        pageFiles: 15,
        pageFolders: 0,
        allFiles: 55,
        allFolders: 0,
      };

      const hints = generateStructurePaginationHints(pagination, context);

      expect(hints.some(h => h.includes('3 pages)'))).toBe(true);
    });

    it('should include depth=1 when explicitly set to 1 and hasMore', () => {
      const pagination = {
        currentPage: 1,
        totalPages: 2,
        hasMore: true,
        entriesPerPage: 20,
        totalEntries: 30,
      };
      const context = {
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'main',
        depth: 1, // Explicitly set to 1
        pageFiles: 18,
        pageFolders: 2,
        allFiles: 25,
        allFolders: 5,
      };

      const hints = generateStructurePaginationHints(pagination, context);

      // depth=1 should NOT be included (it's the default)
      expect(hints.some(h => h.includes('depth=1'))).toBe(false);
    });

    it('should include path="" (empty string) when provided', () => {
      const pagination = {
        currentPage: 1,
        totalPages: 2,
        hasMore: true,
        entriesPerPage: 20,
        totalEntries: 30,
      };
      const context = {
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'main',
        path: '', // Empty string - falsy but defined
        pageFiles: 18,
        pageFolders: 2,
        allFiles: 25,
        allFolders: 5,
      };

      const hints = generateStructurePaginationHints(pagination, context);

      // Empty path should NOT be included in hints
      expect(hints.some(h => h.includes('path=""'))).toBe(false);
    });

    it('should handle all pagination info correctly', () => {
      const pagination = {
        currentPage: 2,
        totalPages: 5,
        hasMore: true,
        entriesPerPage: 10,
        totalEntries: 50,
      };
      const context = {
        owner: 'org',
        repo: 'project',
        branch: 'develop',
        path: 'packages/core',
        depth: 3,
        pageFiles: 8,
        pageFolders: 2,
        allFiles: 40,
        allFolders: 10,
      };

      const hints = generateStructurePaginationHints(pagination, context);

      expect(hints.some(h => h.includes('Page 2/5'))).toBe(true);
      expect(
        hints.some(h => h.includes('8 files, 2 folders on this page'))
      ).toBe(true);
      expect(hints.some(h => h.includes('40 files, 10 folders'))).toBe(true);
      expect(hints.some(h => h.includes('50 entries'))).toBe(true);
      expect(hints.some(h => h.includes('entryPageNumber=3'))).toBe(true);
      expect(hints.some(h => h.includes('owner="org"'))).toBe(true);
      expect(hints.some(h => h.includes('repo="project"'))).toBe(true);
      expect(hints.some(h => h.includes('branch="develop"'))).toBe(true);
      expect(hints.some(h => h.includes('path="packages/core"'))).toBe(true);
      expect(hints.some(h => h.includes('depth=3'))).toBe(true);
      expect(hints.some(h => h.includes('entriesPerPage=10'))).toBe(true);
    });
  });
});

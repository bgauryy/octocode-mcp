/**
 * Tests for ripgrep parsers
 */

import { describe, it, expect } from 'vitest';
import {
  parseRipgrepJson,
  parseGrepOutput,
} from '../../../src/utils/parsers/ripgrep.js';
import type { RipgrepQuery } from '../../../src/tools/local_ripgrep/scheme.js';

const baseQuery: RipgrepQuery = {
  pattern: 'test',
  path: '/test/path',
};

describe('parseRipgrepJson', () => {
  it('should parse basic match output', () => {
    const jsonOutput = JSON.stringify({
      type: 'match',
      data: {
        path: { text: '/test/file.ts' },
        lines: { text: 'const test = 1;' },
        line_number: 10,
        absolute_offset: 100,
        submatches: [{ match: { text: 'test' }, start: 6, end: 10 }],
      },
    });

    const { files, stats } = parseRipgrepJson(jsonOutput, baseQuery);

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('/test/file.ts');
    expect(files[0]!.matchCount).toBe(1);
    expect(files[0]!.matches[0]!.line).toBe(10);
    expect(files[0]!.matches[0]!.column).toBe(6);
    expect(stats).toEqual({});
  });

  it('should parse multiple matches in the same file', () => {
    const jsonOutput = [
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/test/file.ts' },
          lines: { text: 'test line 1' },
          line_number: 10,
          absolute_offset: 100,
          submatches: [{ match: { text: 'test' }, start: 0, end: 4 }],
        },
      }),
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/test/file.ts' },
          lines: { text: 'test line 2' },
          line_number: 20,
          absolute_offset: 200,
          submatches: [{ match: { text: 'test' }, start: 0, end: 4 }],
        },
      }),
    ].join('\n');

    const { files } = parseRipgrepJson(jsonOutput, baseQuery);

    expect(files).toHaveLength(1);
    expect(files[0]!.matchCount).toBe(2);
    expect(files[0]!.matches).toHaveLength(2);
  });

  it('should parse matches across multiple files', () => {
    const jsonOutput = [
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/test/file1.ts' },
          lines: { text: 'test in file 1' },
          line_number: 10,
          absolute_offset: 100,
          submatches: [{ match: { text: 'test' }, start: 0, end: 4 }],
        },
      }),
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/test/file2.ts' },
          lines: { text: 'test in file 2' },
          line_number: 5,
          absolute_offset: 50,
          submatches: [{ match: { text: 'test' }, start: 0, end: 4 }],
        },
      }),
    ].join('\n');

    const { files } = parseRipgrepJson(jsonOutput, baseQuery);

    expect(files).toHaveLength(2);
  });

  it('should parse context lines', () => {
    const jsonOutput = [
      JSON.stringify({
        type: 'context',
        data: {
          path: { text: '/test/file.ts' },
          lines: { text: 'context before' },
          line_number: 9,
          absolute_offset: 80,
        },
      }),
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/test/file.ts' },
          lines: { text: 'test match' },
          line_number: 10,
          absolute_offset: 100,
          submatches: [{ match: { text: 'test' }, start: 0, end: 4 }],
        },
      }),
      JSON.stringify({
        type: 'context',
        data: {
          path: { text: '/test/file.ts' },
          lines: { text: 'context after' },
          line_number: 11,
          absolute_offset: 120,
        },
      }),
    ].join('\n');

    const { files } = parseRipgrepJson(jsonOutput, {
      ...baseQuery,
      beforeContext: 1,
      afterContext: 1,
    });

    expect(files).toHaveLength(1);
    expect(files[0]!.matches[0]!.value).toContain('context before');
    expect(files[0]!.matches[0]!.value).toContain('test match');
    expect(files[0]!.matches[0]!.value).toContain('context after');
  });

  it('should parse summary statistics', () => {
    const jsonOutput = [
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/test/file.ts' },
          lines: { text: 'test' },
          line_number: 1,
          absolute_offset: 0,
          submatches: [{ match: { text: 'test' }, start: 0, end: 4 }],
        },
      }),
      JSON.stringify({
        type: 'summary',
        data: {
          elapsed_total: { human: '0.001s' },
          stats: {
            elapsed: { human: '0.001s' },
            searches: 10,
            searches_with_match: 3,
            bytes_searched: 1000,
            bytes_printed: 50,
            matched_lines: 5,
            matches: 7,
          },
        },
      }),
    ].join('\n');

    const { stats } = parseRipgrepJson(jsonOutput, baseQuery);

    expect(stats.matchCount).toBe(7);
    expect(stats.matchedLines).toBe(5);
    expect(stats.filesMatched).toBe(3);
    expect(stats.filesSearched).toBe(10);
    expect(stats.bytesSearched).toBe(1000);
    expect(stats.searchTime).toBe('0.001s');
  });

  it('should handle empty submatches array', () => {
    const jsonOutput = JSON.stringify({
      type: 'match',
      data: {
        path: { text: '/test/file.ts' },
        lines: { text: 'test line' },
        line_number: 10,
        absolute_offset: 100,
        submatches: [],
      },
    });

    const { files } = parseRipgrepJson(jsonOutput, baseQuery);

    expect(files).toHaveLength(1);
    expect(files[0]!.matches[0]!.column).toBe(0);
    expect(files[0]!.matches[0]!.location.byteLength).toBe(9); // Full line length
  });

  it('should truncate long match values', () => {
    const longContent = 'x'.repeat(500);
    const jsonOutput = JSON.stringify({
      type: 'match',
      data: {
        path: { text: '/test/file.ts' },
        lines: { text: longContent },
        line_number: 10,
        absolute_offset: 100,
        submatches: [{ match: { text: 'test' }, start: 0, end: 4 }],
      },
    });

    const { files } = parseRipgrepJson(jsonOutput, {
      ...baseQuery,
      matchContentLength: 100,
    });

    expect(files[0]!.matches[0]!.value.length).toBeLessThanOrEqual(100);
    expect(files[0]!.matches[0]!.value).toMatch(/\.\.\.$/);
  });

  it('should skip malformed JSON lines', () => {
    const jsonOutput = [
      'this is not json',
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/test/file.ts' },
          lines: { text: 'test' },
          line_number: 1,
          absolute_offset: 0,
          submatches: [{ match: { text: 'test' }, start: 0, end: 4 }],
        },
      }),
      'also not json {broken',
    ].join('\n');

    const { files } = parseRipgrepJson(jsonOutput, baseQuery);

    // Should only have the valid match
    expect(files).toHaveLength(1);
  });

  it('should skip non-JSON lines (like output headers)', () => {
    const jsonOutput = [
      'Searching...',
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/test/file.ts' },
          lines: { text: 'test' },
          line_number: 1,
          absolute_offset: 0,
          submatches: [{ match: { text: 'test' }, start: 0, end: 4 }],
        },
      }),
    ].join('\n');

    const { files } = parseRipgrepJson(jsonOutput, baseQuery);

    expect(files).toHaveLength(1);
  });

  it('should handle empty output', () => {
    const { files, stats } = parseRipgrepJson('', baseQuery);

    expect(files).toHaveLength(0);
    expect(stats).toEqual({});
  });

  it('should use contextLines when specific before/after not set', () => {
    const jsonOutput = [
      JSON.stringify({
        type: 'context',
        data: {
          path: { text: '/test/file.ts' },
          lines: { text: 'context before' },
          line_number: 8,
          absolute_offset: 60,
        },
      }),
      JSON.stringify({
        type: 'context',
        data: {
          path: { text: '/test/file.ts' },
          lines: { text: 'context before 2' },
          line_number: 9,
          absolute_offset: 80,
        },
      }),
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/test/file.ts' },
          lines: { text: 'test match' },
          line_number: 10,
          absolute_offset: 100,
          submatches: [{ match: { text: 'test' }, start: 0, end: 4 }],
        },
      }),
    ].join('\n');

    const { files } = parseRipgrepJson(jsonOutput, {
      ...baseQuery,
      contextLines: 2, // General context applies to both before and after
    });

    expect(files[0]!.matches[0]!.value).toContain('context before');
    expect(files[0]!.matches[0]!.value).toContain('context before 2');
  });

  it('should handle begin/end messages (ignored)', () => {
    const jsonOutput = [
      JSON.stringify({
        type: 'begin',
        data: { path: { text: '/test/file.ts' } },
      }),
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/test/file.ts' },
          lines: { text: 'test' },
          line_number: 1,
          absolute_offset: 0,
          submatches: [{ match: { text: 'test' }, start: 0, end: 4 }],
        },
      }),
      JSON.stringify({
        type: 'end',
        data: { path: { text: '/test/file.ts' } },
      }),
    ].join('\n');

    const { files } = parseRipgrepJson(jsonOutput, baseQuery);

    expect(files).toHaveLength(1);
  });
});

describe('parseGrepOutput', () => {
  it('should parse basic grep output', () => {
    const output = '/test/file.ts:10:const test = 1;';

    const files = parseGrepOutput(output, baseQuery);

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('/test/file.ts');
    expect(files[0]!.matchCount).toBe(1);
    expect(files[0]!.matches[0]!.line).toBe(10);
    expect(files[0]!.matches[0]!.value).toBe('const test = 1;');
  });

  it('should parse multiple matches', () => {
    const output = [
      '/test/file.ts:10:test line 1',
      '/test/file.ts:20:test line 2',
      '/test/file2.ts:5:test line 3',
    ].join('\n');

    const files = parseGrepOutput(output, baseQuery);

    expect(files).toHaveLength(2);
    expect(files.find(f => f.path === '/test/file.ts')?.matchCount).toBe(2);
    expect(files.find(f => f.path === '/test/file2.ts')?.matchCount).toBe(1);
  });

  it('should handle files-only mode', () => {
    const output = ['/test/file1.ts', '/test/file2.ts', '/test/file3.ts'].join(
      '\n'
    );

    const files = parseGrepOutput(output, { ...baseQuery, filesOnly: true });

    expect(files).toHaveLength(3);
    expect(files[0]!.path).toBe('/test/file1.ts');
    expect(files[0]!.matchCount).toBe(0);
    expect(files[0]!.matches).toHaveLength(0);
  });

  it('should handle lines without line numbers (fallback format)', () => {
    const output = '/test/file.ts:match content without line number';

    const files = parseGrepOutput(output, baseQuery);

    expect(files).toHaveLength(1);
    expect(files[0]!.matches[0]!.line).toBe(0);
    expect(files[0]!.matches[0]!.value).toBe(
      'match content without line number'
    );
  });

  it('should handle empty output', () => {
    const files = parseGrepOutput('', baseQuery);

    expect(files).toHaveLength(0);
  });

  it('should truncate long match values', () => {
    const longContent = 'x'.repeat(500);
    const output = `/test/file.ts:10:${longContent}`;

    const files = parseGrepOutput(output, {
      ...baseQuery,
      matchContentLength: 100,
    });

    expect(files[0]!.matches[0]!.value.length).toBeLessThanOrEqual(100);
    expect(files[0]!.matches[0]!.value).toMatch(/\.\.\.$/);
  });

  it('should handle colon in file path', () => {
    // On some systems, files might have colons (though rare)
    // The parser should handle the first colon as the path delimiter
    const output = '/test:dir/file.ts:10:test content';

    const files = parseGrepOutput(output, baseQuery);

    // Should parse correctly - first colon after digits is the line number
    expect(files).toHaveLength(1);
  });

  it('should skip lines with null bytes in path', () => {
    const output = '/test/file\x00path.ts:test content';

    const files = parseGrepOutput(output, baseQuery);

    expect(files).toHaveLength(0);
  });

  it('should provide zero byte offsets for grep output', () => {
    const output = '/test/file.ts:10:test content';

    const files = parseGrepOutput(output, baseQuery);

    expect(files[0]!.matches[0]!.location.byteOffset).toBe(0);
    expect(files[0]!.matches[0]!.location.byteLength).toBe(0);
    expect(files[0]!.matches[0]!.location.charOffset).toBe(0);
  });

  it('should deduplicate files in files-only mode', () => {
    const output = [
      '/test/file1.ts',
      '/test/file1.ts', // Duplicate
      '/test/file2.ts',
    ].join('\n');

    const files = parseGrepOutput(output, { ...baseQuery, filesOnly: true });

    expect(files).toHaveLength(2);
  });
});

/**
 * Branch coverage tests for ripgrepResultBuilder.ts
 * Targeting lines 171-179: _getStructuredResultSizeHints with large result set
 * - totalMatches > 100 || files.length > 20
 * - !query.type && !query.include
 * - !query.excludeDir?.length
 * - query.pattern.length < 5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSearchResult } from '../../src/tools/local_ripgrep/ripgrepResultBuilder.js';
import { promises as fs } from 'fs';

vi.mock('fs', () => ({
  promises: {
    stat: vi.fn(),
  },
}));

describe('ripgrepResultBuilder - _getStructuredResultSizeHints (lines 171-179)', () => {
  const mockFsStat = vi.mocked(fs.stat);

  beforeEach(() => {
    vi.clearAllMocks();
    mockFsStat.mockResolvedValue({
      mtime: new Date('2024-01-01'),
    } as any);
  });

  const makeFiles = (count: number, matchesPerFile: number = 5) =>
    Array.from({ length: count }, (_, i) => ({
      path: `/test/file${i}.ts`,
      matchCount: matchesPerFile,
      matches: Array.from({ length: matchesPerFile }, (_, j) => ({
        line: j + 1,
        column: 1,
        value: 'match',
        location: {
          byteOffset: 0,
          byteLength: 5,
          charOffset: 0,
          charLength: 5,
          line: j + 1,
          column: 1,
        },
      })),
    }));

  it('should add all refinement hints when large result set and no type/include/excludeDir and short pattern', async () => {
    // 25 files * 5 matches = 125 total matches > 100, files.length 25 > 20
    const files = makeFiles(25, 5);
    const query = {
      path: '/test',
      pattern: 'ab', // length < 5
      researchGoal: 'test',
      reasoning: 'test',
      // No type, no include, no excludeDir
    } as any;

    const result = await buildSearchResult(files, query, 'rg', []);

    expect(result.hints).toBeDefined();
    const hintsStr = result.hints!.join('\n');
    expect(hintsStr).toContain('Large result set - refine search:');
    expect(hintsStr).toContain('Narrow by file type');
    expect(hintsStr).toContain('Exclude directories');
    expect(hintsStr).toContain('Use more specific pattern');
  });

  it('should add type hint when !query.type && !query.include', async () => {
    const files = makeFiles(25, 5);
    const query = {
      path: '/test',
      pattern: 'x',
      researchGoal: 'test',
      reasoning: 'test',
    } as any;

    const result = await buildSearchResult(files, query, 'rg', []);

    expect(
      result.hints?.some(h => h.includes('type="ts"') || h.includes('include'))
    ).toBe(true);
  });

  it('should add excludeDir hint when !query.excludeDir?.length', async () => {
    const files = makeFiles(25, 5);
    const query = {
      path: '/test',
      pattern: 'ab',
      researchGoal: 'test',
      reasoning: 'test',
    } as any;

    const result = await buildSearchResult(files, query, 'rg', []);

    expect(
      result.hints?.some(
        h => h.includes('excludeDir') || h.includes('Exclude directories')
      )
    ).toBe(true);
  });

  it('should add pattern hint when query.pattern.length < 5', async () => {
    const files = makeFiles(25, 5);
    const query = {
      path: '/test',
      pattern: 'hi', // length 2 < 5
      researchGoal: 'test',
      reasoning: 'test',
    } as any;

    const result = await buildSearchResult(files, query, 'rg', []);

    expect(
      result.hints?.some(
        h => h.includes('more specific pattern') || h.includes('very short')
      )
    ).toBe(true);
  });

  it('should NOT add type hint when query.type is set', async () => {
    const files = makeFiles(25, 5);
    const query = {
      path: '/test',
      pattern: 'ab',
      type: 'ts',
      researchGoal: 'test',
      reasoning: 'test',
    } as any;

    const result = await buildSearchResult(files, query, 'rg', []);

    expect(result.hints?.some(h => h.includes('Narrow by file type'))).toBe(
      false
    );
  });

  it('should NOT add excludeDir hint when query.excludeDir has items', async () => {
    const files = makeFiles(25, 5);
    const query = {
      path: '/test',
      pattern: 'ab',
      excludeDir: ['node_modules'],
      researchGoal: 'test',
      reasoning: 'test',
    } as any;

    const result = await buildSearchResult(files, query, 'rg', []);

    expect(result.hints?.some(h => h.includes('Exclude directories'))).toBe(
      false
    );
  });

  it('should NOT add pattern hint when query.pattern.length >= 5', async () => {
    const files = makeFiles(25, 5);
    const query = {
      path: '/test',
      pattern: 'longer', // length 6 >= 5
      researchGoal: 'test',
      reasoning: 'test',
    } as any;

    const result = await buildSearchResult(files, query, 'rg', []);

    expect(
      result.hints?.some(
        h => h.includes('more specific pattern') || h.includes('very short')
      )
    ).toBe(false);
  });
});

/**
 * Branch coverage tests for local_fetch_content
 * Targets: contentMinifier catch block, contentExtractor maxMatches edge case
 */

import { describe, it, expect, vi } from 'vitest';

describe('applyMinification', () => {
  it('should return original content when minification throws', async () => {
    vi.resetModules();

    vi.doMock('../../src/utils/minifier/index.js', () => ({
      minifyContentSync: vi.fn(() => {
        throw new Error('Minification engine crashed');
      }),
    }));

    const { applyMinification } =
      await import('../../src/tools/local_fetch_content/contentMinifier.js');

    const content = 'const x = 1;\nconst y = 2;\n';
    const result = applyMinification(content, 'test.ts');

    expect(result).toBe(content);
  });

  it('should return original when minified is not smaller', async () => {
    vi.resetModules();

    vi.doMock('../../src/utils/minifier/index.js', () => ({
      minifyContentSync: vi.fn((content: string) => content + '/* padded */'),
    }));

    const { applyMinification } =
      await import('../../src/tools/local_fetch_content/contentMinifier.js');

    const content = 'short';
    const result = applyMinification(content, 'test.ts');

    expect(result).toBe(content);
  });
});

describe('extractMatchingLines - edge cases', () => {
  it('should find matches with extractMatchingLines', async () => {
    vi.resetModules();

    const { extractMatchingLines } =
      await import('../../src/tools/local_fetch_content/contentExtractor.js');

    const lines = ['line1', 'foo', 'line3', 'foo', 'line5'];
    const result = extractMatchingLines(lines, 'foo', 1, false, false);

    expect(result.matchCount).toBe(2);
    expect(result.lines.length).toBeGreaterThan(0);
  });

  it('should return empty when no matches', async () => {
    vi.resetModules();

    const { extractMatchingLines } =
      await import('../../src/tools/local_fetch_content/contentExtractor.js');

    const lines = ['line1', 'line2', 'line3'];
    const result = extractMatchingLines(lines, 'nonexistent', 1, false, false);

    expect(result.matchCount).toBe(0);
    expect(result.lines).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { relativizeResultPaths } from '../../../src/utils/response/pathRelativize.js';

describe('path metadata compaction preserves evidence', () => {
  it('keeps source, snippets, captures and rendered rows unchanged', () => {
    const content = '[source](/workspace/project/target.ts)\n';
    const snippet = 'const file = "file:///workspace/project/target.ts";';
    const captures = ['/workspace/project/target.ts', snippet];
    const data = {
      path: '/workspace/project/source.ts',
      content,
      matches: [{ path: '/workspace/project/other.ts', snippet, captures }],
      rows: ['target /workspace/project/other.ts:12'],
      next: { read: { query: { path: '/workspace/project/other.ts' } } },
      location: { uri: 'file:///workspace/project/source.ts' },
    };
    const expected = structuredClone(data);

    expect(relativizeResultPaths([{ data }])).toBe('/workspace/project');

    expect(data).toEqual({
      ...expected,
      path: 'source.ts',
      matches: [{ ...expected.matches[0], path: 'other.ts' }],
    });
  });
});

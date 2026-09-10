import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGitHubFileContentAPI } from '../../src/github/fileContent.js';
import { processFileContentAPI } from '../../src/github/fileContentProcess.js';
import { readFileEntry } from '../../src/tools/github_fetch_content/finalizer/entryParsers.js';
import { FileContentBulkQueryLocalSchema } from '@octocodeai/octocode-core/schema';
import { paginateContentWindow } from '../../src/utils/file/contentPagination.js';
import type { FileContentExecutionQuery } from '../../src/tools/github_fetch_content/types.js';

const fixture = vi.hoisted(() => ({ source: '' }));
vi.mock('../../src/github/fileContentRaw/cache.js', () => ({
  fetchCachedRawGitHubFileContent: vi.fn(async () => ({
    auth: 'fixture',
    rawResult: { data: { rawContent: fixture.source, branch: 'main' } },
  })),
}));

const source = Array.from(
  { length: 20 },
  (_, i) =>
    `// anchor ${i}\nexport function target${i}(value: number): number {\n  return value + ${i};\n}\n`
).join('\n');
const base = {
  owner: 'octo',
  repo: 'fixture',
  path: 'source.ts',
  branch: 'main',
};

beforeEach(() => {
  fixture.source = source;
});

describe('GitHub content evidence and executable minification windows', () => {
  it('does not label a small supported TypeScript outline as an unsupported type', async () => {
    fixture.source = 'export const x = 1;';
    const out = await fetchGitHubFileContentAPI({
      ...base,
      minify: 'symbols',
      noTimestamp: true,
    });
    if (!('data' in out) || !out.data) throw new Error(JSON.stringify(out));
    expect(out.data.contentView).toBe('standard');
    expect(out.data.warnings?.join(' ') ?? '').not.toContain(
      'not supported for this file type'
    );
    expect(out.data.minifyFallback?.reason).toBe('outline-unavailable');
  });
  it.each(['none', 'standard'] as const)(
    'preserves matched comments in %s mode',
    async minify => {
      const out = await processFileContentAPI(
        source,
        'octo',
        'fixture',
        'main',
        'source.ts',
        false,
        undefined,
        undefined,
        0,
        'anchor',
        false,
        true,
        minify
      );
      expect(out.contentView).toBe('none');
      expect(out.content?.match(/anchor/g)).toHaveLength(20);
      expect(out.matchedLines).toHaveLength(20);
    }
  );

  it.each(['none', 'standard', 'symbols'] as const)(
    'reassembles %s via schema-valid next queries',
    async minify => {
      const whole = await fetchGitHubFileContentAPI({
        ...base,
        minify,
        fullContent: true,
        noTimestamp: true,
      });
      expect('data' in whole && whole.data?.content).toBeTruthy();
      let query: Record<string, unknown> = { ...base, minify, chunkType: 'bytes', limit: 40 };
      let joined = '';
      let pages = 0;
      for (;;) {
        expect(
          FileContentBulkQueryLocalSchema.safeParse({ queries: [query] })
            .success
        ).toBe(true);
        const out = await fetchGitHubFileContentAPI({
          ...query,
          noTimestamp: true,
        } as FileContentExecutionQuery);
        if (!('data' in out) || !out.data) throw new Error(JSON.stringify(out));
        const file = readFileEntry(out.data as Record<string, unknown>, query);
        expect(file.content.length).toBeGreaterThan(0);
        joined += file.content;
        pages++;
        expect(pages).toBeLessThan(200);
        const next = file.next?.continue;
        if (!next) break;
        expect(next.query.minify).toBe(minify);
        expect(next.query.limit).toBe(40);
        expect(next.query.offset).toBe(joined.length);
        query = next.query;
      }
      expect(pages).toBeGreaterThan(1);
      expect(joined).toBe('data' in whole ? whole.data?.content : undefined);
    }
  );

  it('rejects chunk controls alongside an unpaged fullContent request', () => {
    expect(FileContentBulkQueryLocalSchema.safeParse({ queries: [{ ...base, minify: 'symbols', fullContent: true, chunkType: 'bytes', limit: 40 }] }).success).toBe(false);
  });

  it.each([{ matchString: 'target' }, { startLine: 1, endLine: 3 }])(
    'rejects selectors ignored by an outline: %j',
    selector => {
      expect(
        FileContentBulkQueryLocalSchema.safeParse({
          queries: [{ ...base, ...selector, minify: 'symbols' }],
        }).success
      ).toBe(false);
    }
  );
});

describe('smart local windows', () => {
  it('honors a byte offset without an explicit limit', async () => {
    const out = await paginateContentWindow(
      source,
      {
        path: '/fixture.ts',
        minify: 'none',
        chunkType: 'bytes',
        offset: 100,
      },
      'localFetch'
    );
    expect(out.windowedContent).toBe(source.slice(100));
    expect(out.pagination.offset).toBe(100);
  });
  it('keeps the requested byte limit stable and reports exact view totals', async () => {
    let query = {
      path: '/fixture.ts',
      minify: 'none' as const,
      chunkType: 'bytes' as const,
      limit: 40,
      offset: 0,
    };
    let joined = '';
    for (let page = 0; page < 200; page++) {
      const out = await paginateContentWindow(source, query, 'localFetch');
      joined += out.windowedContent;
      expect(out.pagination.totalBytes).toBe(Buffer.byteLength(source));
      if (!out.next) break;
      expect(out.next.continue.query.limit).toBe(40);
      query = out.next.continue.query as typeof query;
    }
    expect(joined).toBe(source);
  });
});

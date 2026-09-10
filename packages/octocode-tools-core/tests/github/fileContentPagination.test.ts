import { describe, expect, it } from 'vitest';

import { applyContentPagination } from '../../src/github/fileContentPagination.js';
import { processFileContentAPI } from '../../src/github/fileContentProcess.js';
import { buildGithubFetchContentFinalizer } from '../../src/tools/github_fetch_content/finalizer.js';
import type { GitHubFileContentApiResult } from '../../src/tools/github_fetch_content/types.js';
import type { FlatQueryResult } from '../../src/types/toolResults.js';

// A plain text file with no semantic boundaries so the char-limit path drives
// pagination deterministically. 3 chunks of 1000 chars over 3000 total.
const FULL = 'x'.repeat(3000);

function base(): GitHubFileContentApiResult {
  return {
    owner: 'octo',
    repo: 'engine',
    path: 'data.txt',
    content: FULL,
    branch: 'main',
    totalLines: 1,
    sourceChars: FULL.length,
    sourceBytes: FULL.length,
  } as GitHubFileContentApiResult;
}

describe('ghGetFileContent applyContentPagination — nextOffset is present', () => {
  it('a non-final chunk carries nextOffset === offset + length and hasMore:true', async () => {
    const out = await applyContentPagination(base(), { owner: 'octo', repo: 'engine', path: 'data.txt', minify: 'none', chunkType: 'bytes', offset: 0, limit: 1000 });
    const pg = out.pagination!;
    expect(pg.hasMore).toBe(true);
    expect(pg.offset).toBe(0);
    expect(pg.length).toBe(1000);
    expect(pg.nextOffset).toBe(pg.offset! + pg.length!);
    expect(pg.totalBytes).toBe(3000);
  });

  it('the final chunk has no nextOffset and hasMore:false', async () => {
    const out = await applyContentPagination(base(), { owner: 'octo', repo: 'engine', path: 'data.txt', minify: 'none', chunkType: 'bytes', offset: 2000, limit: 1000 });
    const pg = out.pagination!;
    expect(pg.hasMore).toBe(false);
    expect(pg.nextOffset).toBeUndefined();
  });

  it('walking nextOffset reassembles the full file losslessly', async () => {
    let offset = 0;
    let assembled = '';
    let guard = 0;
    for (;;) {
      const out = await applyContentPagination(base(), { owner: 'octo', repo: 'engine', path: 'data.txt', minify: 'none', chunkType: 'bytes', offset, limit: 1000 });
      assembled += out.content ?? '';
      const pg = out.pagination!;
      if (!pg.hasMore || pg.nextOffset === undefined) break;
      offset = pg.nextOffset;
      if (++guard > 100) throw new Error('pagination did not terminate');
    }
    expect(assembled).toBe(FULL);
  });
});

describe('ghGetFileContent finalizer — next.continue fires from nextOffset', () => {
  it('emits a ready continuation carrying the materialized nextOffset', async () => {
    const paginated = await applyContentPagination(base(), { owner: 'octo', repo: 'engine', path: 'data.txt', minify: 'none', chunkType: 'bytes', offset: 0, limit: 1000 });
    const query = {
      owner: 'octo',
      repo: 'engine',
      branch: 'main',
      path: 'data.txt',
      minify: 'none' as const,
    };
    const result: FlatQueryResult = {
      index: 0,
      status: 'success',
      data: paginated as unknown as Record<string, unknown>,
    };
    const finalize = buildGithubFetchContentFinalizer<typeof query>();
    const out = finalize({
      queries: [query],
      results: [result],
    } as never);

    const file = (
      out.structuredContent.results as Array<{ data?: { files?: unknown[] } }>
    )[0]?.data?.files?.[0] as {
      next?: { continue?: { query: Record<string, unknown> } };
    };

    expect(file.next?.continue).toBeDefined();
    expect(file.next?.continue?.query.offset).toBe(
      paginated.pagination!.nextOffset
    );
    expect(file.next?.continue?.query.path).toBe('data.txt');
  });

  it('stops at the selected line range rather than inventing a new range', async () => {
    const query = { owner: 'octo', repo: 'engine', path: 'data.txt', startLine: 1, endLine: 2, minify: 'none' as const };
    const selected = await processFileContentAPI('one\ntwo\nthree\n', 'octo', 'engine', 'main', 'data.txt', false, 1, 2);
    const paginated = await applyContentPagination(selected, query);
    expect(paginated.content).toBe('one\ntwo\n');
    expect(paginated.pagination?.hasMore).toBe(false);
    expect(paginated.next?.continue).toBeUndefined();
    expect(paginated.totalLines).toBe(3);
    expect(paginated.pagination?.totalLines).toBe(2);
  });

});

describe('ghGetFileContent selector completeness', () => {
  const content = ['one', 'needle', 'three', 'needle', 'five'].join('\n');

  it('treats a bounded source range as a complete selector', async () => {
    const out = await processFileContentAPI(
      content,
      'o',
      'r',
      'main',
      'a.txt',
      false,
      1,
      2,
      0,
      undefined,
      false,
      false,
      'none'
    );
    expect(out.isPartial).not.toBe(true);
  });

  it('does not report a range that reaches EOF as partial', async () => {
    const out = await processFileContentAPI(
      content,
      'o',
      'r',
      'main',
      'a.txt',
      false,
      1,
      999,
      0,
      undefined,
      false,
      false,
      'none'
    );
    expect(out.isPartial).not.toBe(true);
  });

  it('treats matchString as a complete selector when all matches are returned', async () => {
    const out = await processFileContentAPI(
      content,
      'o',
      'r',
      'main',
      'a.txt',
      false,
      undefined,
      undefined,
      0,
      'needle',
      false,
      false,
      'none'
    );
    expect(out.matchedLines).toEqual([2, 4]);
    expect(out.isPartial).not.toBe(true);
  });
});

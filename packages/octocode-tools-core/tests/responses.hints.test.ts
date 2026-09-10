import { describe, expect, it } from 'vitest';
import { buildResponseChannels } from '../src/utils/response/responseChannels.js';
import { createErrorResult } from '../src/utils/response/error.js';

const continuation = {
  tool: 'localFetch',
  query: { path: '/tmp/source.ts', chunkType: 'bytes', offset: 4, limit: 4 },
  why: 'Continue reading the selected view.',
};

describe('public response hint policy', () => {
  it('removes success advice but preserves bounds, diagnostics, and executable continuations', () => {
    const { structuredContent, text } = buildResponseChannels(
      {
        results: [
          {
            index: 0,
            meta: {
              diagnostics: {
                partial: true,
                codes: ['bounded'],
                hints: ['Diagnostic advice'],
              },
            },
            data: {
              content: 'source',
              hints: ['Success advice'],
              isPartial: true,
              pagination: { hasMore: true },
              next: {
                fetch: continuation,
                continue: continuation,
                expandScan: continuation,
              },
              files: [
                {
                  path: 'source.ts',
                  hints: ['File advice'],
                  next: { readSite: continuation },
                },
              ],
            },
          },
        ],
      },
      []
    );
    const row = structuredContent.results[0]!;
    expect(row.data.next).toEqual({
      continue: { tool: continuation.tool, query: continuation.query },
      expandScan: { tool: continuation.tool, query: continuation.query },
    });
    expect(row.meta.diagnostics).toEqual({ partial: true, codes: ['bounded'] });
    expect(row.data.isPartial).toBe(true);
    expect(row.data.files).toEqual([{ path: 'source.ts' }]);
    expect(text).not.toMatch(/advice|why:/);
  });

  it('keeps at most two distinct short hints per empty/error row in a mixed batch', () => {
    const { structuredContent, text } = buildResponseChannels(
      {
        results: [
          { index: 0, data: { content: 'found', hints: ['Success advice'] } },
          {
            index: 1,
            status: 'empty',
            data: {
              hints: [
                ' Broaden   the query. ',
                'Broaden the query.',
                'Check the path.',
                'Third hint.',
              ],
              next: { fetch: continuation },
            },
          },
          {
            index: 2,
            status: 'error',
            meta: { diagnostics: { hints: ['Check credentials.'] } },
            data: {
              error: {
                error: 'Denied',
                hints: ['Check credentials.', 'Retry.'],
              },
              hints: ['Unneeded hint.'],
            },
          },
        ],
      },
      []
    );
    expect(structuredContent.results[0]!.data).toEqual({ content: 'found' });
    expect(structuredContent.results[1]!.data.hints).toEqual([
      'Broaden the query.',
      'Check the path.',
    ]);
    expect(structuredContent.results[1]!.data.next).toEqual({
      fetch: continuation,
    });
    expect(text).not.toMatch(/Success advice|Third hint|Unneeded hint/);
  });

  it('bounds long recovery prose without altering executable queries or fetched evidence', () => {
    const query = { searchText: 'x'.repeat(300), options: {}, names: [] };
    const evidence = {
      hints: ['literal source field'],
      next: { fetch: 'literal data' },
    };
    const { structuredContent } = buildResponseChannels(
      {
        results: [
          {
            index: 0,
            data: {
              content: evidence,
              packages: [{ name: 'a', next: { cloneRepo: continuation } }],
              repositories: {
                a: { owner: 'a', next: { viewTree: continuation } },
              },
            },
          },
          {
            index: 1,
            status: 'error',
            data: {
              hints: ['A long explanation '.repeat(40)],
              next: {
                retry: {
                  tool: 'localSearch',
                  query,
                  why: 'Recovery explanation '.repeat(30),
                },
              },
            },
          },
        ],
      },
      []
    );
    expect(structuredContent.results[0]!.data.content).toEqual(evidence);
    expect(structuredContent.results[0]!.data.packages).toEqual([
      { name: 'a' },
    ]);
    expect(structuredContent.results[0]!.data.repositories).toEqual({
      a: { owner: 'a' },
    });
    const error = structuredContent.results[1]!.data;
    expect(error.hints![0]!.length).toBeLessThanOrEqual(160);
    expect(error.next!.retry.query).toEqual(query);
    expect(error.next!.retry.why.length).toBeLessThanOrEqual(160);
  });

  it('retains supplied recovery hints when creating an error', () => {
    expect(
      createErrorResult(
        'Denied',
        {},
        { extra: { hints: ['Check credentials.'] } }
      )
    ).toMatchObject({ status: 'error', hints: ['Check credentials.'] });
  });
});

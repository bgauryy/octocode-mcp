import { describe, expect, it } from 'vitest';
import { buildGithubFetchContentFinalizer } from '../../../src/tools/github_fetch_content/finalizer.js';
import type { FlatQueryResult } from '../../../src/types/toolResults.js';

type Query = {
  owner: string;
  repo: string;
  branch?: string;
  path: string;
  minify?: 'none' | 'standard' | 'symbols';
};

function run(queries: Query[], results: FlatQueryResult[]) {
  const finalizer = buildGithubFetchContentFinalizer<Query>();
  return finalizer({ queries, results } as never);
}

describe('github fetch content finalizer next.continue', () => {
  it('uses the unified tree operation in not-found recovery guidance', () => {
    const out = run(
      [{ owner: 'octo', repo: 'engine', path: 'Src/missing.ts' }],
      [
        {
          index: 0,
          status: 'error',
          data: { error: '404 not found' },
        },
      ]
    );
    const row = (
      out.structuredContent.results as Array<{ data?: { error?: string } }>
    )[0];
    expect(row?.data?.error).toContain('ghSearch with operation:"tree"');
    expect(row?.data?.error).not.toContain('github.tree');
  });

  it('preserves a structured provider error message', () => {
    const out = run(
      [{ owner: 'octo', repo: 'engine', path: 'README.md' }],
      [
        {
          index: 0,
          status: 'error',
          data: {
            error: {
              error: 'Request timed out while contacting GitHub.',
              type: 'network',
            },
          },
        },
      ]
    );
    const row = (
      out.structuredContent.results as Array<{ data?: { error?: string } }>
    )[0];
    expect(row?.data?.error).toBe('Request timed out while contacting GitHub.');
  });

  it('emits a ready continuation query when byte pagination hasMore', () => {
    const query: Query = {
      owner: 'octo',
      repo: 'engine',
      branch: 'main',
      path: 'src/big.ts',
      minify: 'standard',
      matchString: 'needle',
      matchStringIsRegex: false,
      matchStringCaseSensitive: true,
      contextLines: 3,
    };
    const result: FlatQueryResult = {
      index: 0,
      status: 'success',
      data: {
        path: 'src/big.ts',
        content: 'chunk-1',
        pagination: {
          currentPage: 1,
          totalPages: 3,
          hasMore: true,
          offset: 0,
          length: 2000,
          limit: 2000,
          chunkType: 'bytes',
          totalLines: 1,
          totalBytes: 6000,
          nextOffset: 2000,
        },
      },
    };

    const out = run([query], [result]);
    const group = (
      out.structuredContent.results as Array<{
        files?: unknown[];
        data?: { files?: unknown[]; owner?: string; repo?: string };
      }>
    )[0]!;
    // Canonical shape: owner/repo/files live ONLY under data (no flat mirror).
    expect(group.data?.owner).toBe('octo');
    expect(group.data?.repo).toBe('engine');
    expect(group.files).toBeUndefined();

    const file = group.data?.files?.[0] as {
      next?: {
        continue?: { tool: string; query: Record<string, unknown> };
      };
    };

    expect(file.next?.continue).toEqual({
      tool: 'ghGetFileContent',
      query: {
        owner: 'octo',
        repo: 'engine',
        branch: 'main',
        path: 'src/big.ts',
        matchString: 'needle',
        matchStringIsRegex: false,
        matchStringCaseSensitive: true,
        contextLines: 3,
        offset: 2000,
        limit: 2000,
        chunkType: 'bytes',
        minify: 'standard',
      },
      why: expect.any(String),
      confidence: 'exact',
    });
  });

  it('preserves a line selector and does not skip to the next line range before byte pages finish', () => {
    const query: Query = {
      owner: 'octo',
      repo: 'engine',
      path: 'src/big.ts',
      startLine: 1,
      endLine: 20,
      chunkType: 'bytes',
      limit: 10,
    };
    const result: FlatQueryResult = {
      index: 0,
      status: 'success',
      data: {
        path: 'src/big.ts',
        content: 'chunk-1',
        startLine: 1,
        endLine: 20,
        totalLines: 100,
        pagination: {
          currentPage: 1,
          totalPages: 3,
          hasMore: true,
          offset: 0,
          chunkType: 'bytes',
          length: 10,
          limit: 10,
          totalLines: 1,
          totalBytes: 30,
          nextOffset: 10,
        },
      },
    };

    const out = run([query], [result]);
    const file = (
      out.structuredContent.results as Array<{ data?: { files?: unknown[] } }>
    )[0]?.data?.files?.[0] as {
      next?: Record<string, { tool?: string; query?: Record<string, unknown> }>;
    };
    expect(file.next?.continue?.query).toMatchObject({
      startLine: 1,
      endLine: 20,
      offset: 10,
      chunkType: 'bytes',
      limit: 10,
    });
    expect(file.next?.continueLines).toBeUndefined();
  });

  it('omits next calls when the file is fully read', () => {
    const query: Query = {
      owner: 'octo',
      repo: 'engine',
      path: 'src/small.ts',
    };
    const result: FlatQueryResult = {
      index: 0,
      status: 'success',
      data: {
        path: 'src/small.ts',
        content: 'all',
        pagination: {
          currentPage: 1,
          totalPages: 1,
          hasMore: false,
          offset: 0,
          length: 3,
          limit: 3,
          chunkType: 'bytes',
          totalLines: 1,
          totalBytes: 3,
        },
      },
    };

    const out = run([query], [result]);
    const file = (
      out.structuredContent.results as Array<{ data?: { files?: unknown[] } }>
    )[0]?.data?.files?.[0] as { next?: Record<string, unknown> };

    expect(file.next).toBeUndefined();
  });

  it('keeps continuation when more pages exist', () => {
    const query: Query = {
      owner: 'octo',
      repo: 'engine',
      path: 'src/big.ts',
    };
    const result: FlatQueryResult = {
      index: 0,
      status: 'success',
      data: {
        path: 'src/big.ts',
        content: 'chunk-1',
        pagination: {
          currentPage: 1,
          totalPages: 2,
          hasMore: true,
          offset: 0,
          length: 2000,
          limit: 2000,
          chunkType: 'bytes',
          totalLines: 1,
          totalBytes: 4000,
          nextOffset: 2000,
        },
      },
    };

    const out = run([query], [result]);
    const file = (
      out.structuredContent.results as Array<{ data?: { files?: unknown[] } }>
    )[0]?.data?.files?.[0] as {
      next?: { continue?: unknown; cloneForSemantics?: unknown };
    };

    expect(file.next?.continue).toBeDefined();
    expect(file.next?.cloneForSemantics).toBeUndefined();
  });
});

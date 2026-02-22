/**
 * Branch coverage tests for prTransformation.ts
 * Targets uncovered branches: getBodyLimitForBatchSize, truncatePRBody, applyPartialContentFilter
 */

import { describe, it, expect } from 'vitest';
import {
  getBodyLimitForBatchSize,
  truncatePRBody,
  applyPartialContentFilter,
} from '../../src/github/prTransformation.js';
import type { GitHubPullRequestsSearchParams } from '../../src/github/githubAPI.js';

describe('getBodyLimitForBatchSize', () => {
  it('should return undefined (no truncation) when limit is 1', () => {
    expect(getBodyLimitForBatchSize(1)).toBeUndefined();
  });

  it('should return undefined (no truncation) when limit is 0', () => {
    expect(getBodyLimitForBatchSize(0)).toBeUndefined();
  });

  it('should return 2000 when limit is 2', () => {
    expect(getBodyLimitForBatchSize(2)).toBe(2000);
  });

  it('should return 2000 when limit is 3', () => {
    expect(getBodyLimitForBatchSize(3)).toBe(2000);
  });

  it('should return 800 when limit is 4', () => {
    expect(getBodyLimitForBatchSize(4)).toBe(800);
  });

  it('should return 800 when limit is 10', () => {
    expect(getBodyLimitForBatchSize(10)).toBe(800);
  });

  it('should default to limit=5 (returns 800) when undefined', () => {
    expect(getBodyLimitForBatchSize(undefined)).toBe(800);
  });
});

describe('truncatePRBody', () => {
  it('should return body unchanged when under limit', () => {
    expect(truncatePRBody('short body', 1, 100)).toBe('short body');
  });

  it('should return body unchanged when bodyLimit is undefined', () => {
    expect(truncatePRBody('any body', 1, undefined)).toBe('any body');
  });

  it('should return null when body is null', () => {
    expect(truncatePRBody(null, 1, 100)).toBeNull();
  });

  it('should return undefined when body is undefined', () => {
    expect(truncatePRBody(undefined, 1, 100)).toBeUndefined();
  });

  it('should return empty string unchanged', () => {
    expect(truncatePRBody('', 1, 100)).toBe('');
  });

  it('should truncate long body and include hint', () => {
    const longBody = 'x'.repeat(1000);
    const result = truncatePRBody(longBody, 42, 100);

    expect(result).toContain('x'.repeat(100));
    expect(result).toContain('[truncated 900 chars');
    expect(result).toContain('prNumber=42');
    expect(result).toContain("type='fullContent'");
  });

  it('should not truncate when body length equals limit', () => {
    const body = 'x'.repeat(100);
    expect(truncatePRBody(body, 1, 100)).toBe(body);
  });
});

describe('applyPartialContentFilter', () => {
  const createFile = (filename: string, patch?: string) => ({
    filename,
    status: 'modified' as const,
    additions: 5,
    deletions: 3,
    changes: 8,
    sha: 'abc',
    blob_url: '',
    raw_url: '',
    contents_url: '',
    patch,
  });

  it('should strip patches for metadata type', () => {
    const files = [
      createFile('a.ts', '@@ -1 +1 @@\n+hello'),
      createFile('b.ts', '@@ -1 +1 @@\n+world'),
    ];
    const params: GitHubPullRequestsSearchParams = { type: 'metadata' };

    const result = applyPartialContentFilter(files, params);

    expect(result).toHaveLength(2);
    expect(result[0]!.patch).toBeUndefined();
    expect(result[1]!.patch).toBeUndefined();
  });

  it('should default to metadata when type is not specified', () => {
    const files = [createFile('a.ts', 'some patch')];
    const params: GitHubPullRequestsSearchParams = {};

    const result = applyPartialContentFilter(files, params);

    expect(result[0]!.patch).toBeUndefined();
  });

  it('should filter files for partialContent type', () => {
    const files = [
      createFile('a.ts', '@@ -1,3 +1,5 @@\n+line1\n+line2'),
      createFile('b.ts', '@@ -1,3 +1,5 @@\n+other'),
      createFile('c.ts', '@@ -1 +1 @@\n+excluded'),
    ];
    const params: GitHubPullRequestsSearchParams = {
      type: 'partialContent',
      partialContentMetadata: [{ file: 'a.ts' }, { file: 'b.ts' }],
    };

    const result = applyPartialContentFilter(files, params);

    expect(result).toHaveLength(2);
    expect(result.map(f => f.filename)).toEqual(['a.ts', 'b.ts']);
  });

  it('should handle partialContent with no patch', () => {
    const files = [createFile('a.ts', undefined)];
    const params: GitHubPullRequestsSearchParams = {
      type: 'partialContent',
      partialContentMetadata: [{ file: 'a.ts' }],
    };

    const result = applyPartialContentFilter(files, params);

    expect(result).toHaveLength(1);
    expect(result[0]!.patch).toBeUndefined();
  });

  it('should return all files with patches for fullContent type', () => {
    const files = [
      createFile('a.ts', 'patch-a'),
      createFile('b.ts', 'patch-b'),
    ];
    const params: GitHubPullRequestsSearchParams = { type: 'fullContent' };

    const result = applyPartialContentFilter(files, params);

    expect(result).toHaveLength(2);
    expect(result[0]!.patch).toBe('patch-a');
    expect(result[1]!.patch).toBe('patch-b');
  });

  it('should handle empty partialContentMetadata', () => {
    const files = [createFile('a.ts', 'patch')];
    const params: GitHubPullRequestsSearchParams = {
      type: 'partialContent',
      partialContentMetadata: [],
    };

    const result = applyPartialContentFilter(files, params);

    expect(result).toHaveLength(0);
  });
});

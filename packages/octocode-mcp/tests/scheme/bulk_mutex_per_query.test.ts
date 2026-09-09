import { describe, it, expect } from 'vitest';
import { LocalFetchContentBulkQuerySchema } from '../../../octocode-tools-core/src/tools/local_fetch_content/scheme.js';
import { AstSearchBulkQuerySchema } from '../../../octocode-tools-core/src/tools/ast_search/scheme.js';
import { FileContentBulkQueryLocalSchema } from '../../../octocode-tools-core/src/tools/github_fetch_content/scheme.js';

describe('bulk schema cross-field validation', () => {
  it('localGetFileContent rejects a mutex-violating row in a mixed batch', () => {
    const r = LocalFetchContentBulkQuerySchema.safeParse({
      queries: [
        { path: 'a.ts', fullContent: true, matchString: 'x' },
        { path: 'b.ts', startLine: 1, endLine: 5 },
      ],
    });
    expect(r.success).toBe(false);
    expect(
      LocalFetchContentBulkQuerySchema.safeParse({
        queries: [{ path: 'b.ts', startLine: 1, endLine: 5 }],
      }).success
    ).toBe(true);
  });

  it('astSearch rejects pattern and rule together in a mixed batch', () => {
    const r = AstSearchBulkQuerySchema.safeParse({
      queries: [
        {
          operation: 'match',
          path: '/r',
          langType: 'ts',
          pattern: 'call($A)',
          rule: 'kind: call_expression',
        },
        { operation: 'files', path: '/r' },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const serialized = JSON.stringify(r.error.issues);
      expect(serialized).toContain('pattern');
      expect(serialized).toContain('rule');
    }
    expect(
      AstSearchBulkQuerySchema.safeParse({
        queries: [
          {
            operation: 'match',
            path: '/r',
            langType: 'ts',
            pattern: 'call($A)',
          },
        ],
      }).success
    ).toBe(true);
  });

  it('ghGetFileContent rejects a mutex-violating row in a mixed batch', () => {
    const r = FileContentBulkQueryLocalSchema.safeParse({
      queries: [
        {
          owner: 'o',
          repo: 'r',
          path: 'a.ts',
          fullContent: true,
          matchString: 'x',
        },
        { owner: 'o', repo: 'r', path: 'b.ts', startLine: 1, endLine: 5 },
      ],
    });
    expect(r.success).toBe(false);
    expect(
      FileContentBulkQueryLocalSchema.safeParse({
        queries: [
          { owner: 'o', repo: 'r', path: 'b.ts', startLine: 1, endLine: 5 },
        ],
      }).success
    ).toBe(true);
  });
});

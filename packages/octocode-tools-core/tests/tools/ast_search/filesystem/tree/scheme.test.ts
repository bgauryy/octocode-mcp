import { describe, expect, it } from 'vitest';

import {
  AstSearchQuerySchema,
  AstSearchBulkQuerySchema,
} from '@octocodeai/octocode-core/schema';

describe('astSearch filesystem tree schema', () => {
  const baseQuery = {
    operation: 'tree',
    treeKind: 'filesystem',
    path: '/repo',
  };

  it('accepts the entryType enum values (f / d)', () => {
    for (const entryType of ['f', 'd'] as const) {
      expect(
        AstSearchQuerySchema.safeParse({ ...baseQuery, entryType }).success
      ).toBe(true);
    }
  });

  it('rejects an invalid entryType value', () => {
    expect(
      AstSearchQuerySchema.safeParse({ ...baseQuery, entryType: 'x' }).success
    ).toBe(false);
  });

  it('accepts excludeDir so callers can override default pruning', () => {
    expect(
      AstSearchQuerySchema.safeParse({
        ...baseQuery,
        maxDepth: 5,
        excludeDir: [],
      }).success
    ).toBe(true);
  });

  it('rejects the retired recursive flag', () => {
    expect(
      AstSearchQuerySchema.safeParse({ ...baseQuery, recursive: true }).success
    ).toBe(false);
  });

  it('keeps bulk parsing relaxed so execution can report per-query errors', () => {
    const result = AstSearchBulkQuerySchema.safeParse({
      queries: [
        { ...baseQuery, entryType: 'f' },
        { ...baseQuery, path: '/repo/src' },
      ],
    });

    expect(result.success).toBe(true);
  });
});

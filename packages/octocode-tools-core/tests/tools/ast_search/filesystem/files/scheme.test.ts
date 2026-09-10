import { describe, expect, it } from 'vitest';

import {
  AstSearchQuerySchema,
  AstSearchBulkQuerySchema,
} from '@octocodeai/octocode-core/schema';

describe('astSearch files schema', () => {
  const baseQuery = { operation: 'files', path: '/repo' };

  it('rejects an inverted depth range', () => {
    const result = AstSearchQuerySchema.safeParse({
      ...baseQuery,
      minDepth: 4,
      maxDepth: 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.map(issue => issue.message).join('\n')
      ).toMatch(/minDepth must be less than or equal to maxDepth/);
    }
  });

  it('accepts an ordered depth range', () => {
    const result = AstSearchQuerySchema.safeParse({
      ...baseQuery,
      minDepth: 1,
      maxDepth: 3,
    });

    expect(result.success).toBe(true);
  });

  it('rejects the removed regexType compatibility field', () => {
    const result = AstSearchQuerySchema.safeParse({
      ...baseQuery,
      pathRegex: '.*\\.ts$',
      regexType: 'posix-extended',
    });

    expect(result.success).toBe(false);
  });

  it('rejects inverted depth in the public AST bulk contract', () => {
    const result = AstSearchBulkQuerySchema.safeParse({
      queries: [
        { ...baseQuery, minDepth: 4, maxDepth: 2 },
        { ...baseQuery, names: ['*.ts'] },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects the removed legacy name alias', () => {
    const result = AstSearchBulkQuerySchema.safeParse({
      queries: [{ ...baseQuery, name: '*.ts' }],
    });

    expect(result.success).toBe(false);
  });
});

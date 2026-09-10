import { describe, expect, it } from 'vitest';
import { AstSearchQuerySchema } from '@octocodeai/octocode-core/schema';

import { buildNextPageContinuation } from '../../src/scheme/pagination.js';

describe('buildNextPageContinuation', () => {
  it('strips auto-filled per-call metadata from the continuation query', () => {
    const cont = buildNextPageContinuation('astSearch', {
      operation: 'files',
      path: '/repo',
      goal: 'Discover TypeScript files',
      reasoning: 'Executed via octocode tool command',
      names: ['*.ts'],
      page: 2,
    });

    expect(cont.tool).toBe('astSearch');
    expect(cont.confidence).toBe('exact');
    // Real query params survive.
    expect(cont.query).toMatchObject({
      operation: 'files',
      names: ['*.ts'],
      page: 2,
    });
    expect(AstSearchQuerySchema.safeParse(cont.query).success).toBe(true);
    // Auto-filled meta is gone.
    expect(cont.query).not.toHaveProperty('goal');
    expect(cont.query).not.toHaveProperty('reasoning');
  });

  it('does not mutate the caller-supplied query object', () => {
    const original = {
      operation: 'tree',
      treeKind: 'filesystem',
      path: '/repo',
      goal: 'g',
      page: 3,
    };
    const cont = buildNextPageContinuation('astSearch', original);
    expect(original).toHaveProperty('goal', 'g');
    expect(AstSearchQuerySchema.safeParse(cont.query).success).toBe(true);
  });

  it('returns the query unchanged when there is no meta to strip', () => {
    const q = { operation: 'files', path: '/repo', names: ['*.md'], page: 2 };
    const cont = buildNextPageContinuation('astSearch', q);
    expect(cont.query).toEqual(q);
    expect(AstSearchQuerySchema.safeParse(cont.query).success).toBe(true);
  });
});

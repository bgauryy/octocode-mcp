import { describe, expect, it } from 'vitest';
import { ArtifactQuerySchema } from '@octocodeai/octocode-core/schema';

describe('artifactSearch exact and discovery selectors', () => {
  it('normalizes names and discovery terms without guessing the mode from their shape', () => {
    expect(
      ArtifactQuerySchema.parse({ type: 'npm', packageName: ' @acme/widget ' })
    ).toMatchObject({ type: 'npm', packageName: '@acme/widget' });
    expect(
      ArtifactQuerySchema.parse({
        type: 'npm',
        keywords: [' zod '],
        cursor: 'opaque',
      })
    ).toMatchObject({ type: 'npm', keywords: ['zod'], cursor: 'opaque' });
  });

  it.each([
    {},
    { type: 'npm', packageName: ' ' },
    { type: 'npm', keywords: [] },
    { type: 'npm', keywords: [' '] },
    { type: 'npm', packageName: 'zod', keywords: [] },
    { type: 'npm', packageName: 'zod', keywords: ['schema'] },
    { type: 'npm', packageName: 'zod', page: 1 },
    { type: 'npm', packageName: 'zod', page: 2 },
  ])('rejects empty, ambiguous, or inapplicable selectors: %j', query => {
    expect(ArtifactQuerySchema.safeParse(query).success).toBe(false);
  });
});

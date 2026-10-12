import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { FileContentQuerySchema } from '@octocodeai/config/schema';
import {
  GitHubSearchCodeQuerySchema,
  GitHubSearchRepoQuerySchema,
  GitHubStructureQuerySchema,
} from '@octocodeai/config/schema';
import { ArtifactSearchQueryLocalSchema } from '@octocodeai/config/schema';
import { LocalFetchContentQuerySchema } from '@octocodeai/config/schema';
import { StructureFilesQuerySchema } from '@octocodeai/config/schema';
import { LocalSearchQuerySchema } from '@octocodeai/config/schema';
import { StructureTreeQuerySchema } from '@octocodeai/config/schema';
import { LspSearchQuerySchema } from '@octocodeai/config/schema';
import { LOCAL_MAX_DEPTH, LOCAL_MAX_LIMIT } from '@octocodeai/config/schema';

const SENTINEL = 9007199254740991;

const schemas: Record<string, z.ZodTypeAny> = {
  'fileContent(remote)': FileContentQuerySchema,
  'code(remote)': GitHubSearchCodeQuerySchema,
  'repos(remote)': GitHubSearchRepoQuerySchema,
  'viewRepoStructure(remote)': GitHubStructureQuerySchema,
  'artifactSearch(remote)': ArtifactSearchQueryLocalSchema,
  'fetchContent(local)': LocalFetchContentQuerySchema,
  structureFiles: StructureFilesQuerySchema,
  localSearch: LocalSearchQuerySchema,
  structureTree: StructureTreeQuerySchema,
  lspSemantic: LspSearchQuerySchema,
};

describe('numeric schema fields are bounded', () => {
  for (const [name, schema] of Object.entries(schemas)) {
    it(`${name}: result caps avoid sentinel bounds; view offsets use safe integers`, () => {
      const js = z.toJSONSchema(schema) as {
        properties?: Record<string, { minimum?: number; maximum?: number }>;
      };
      const props = js.properties ?? {};
      const offenders = Object.entries(props)
        .filter(
          ([, v]) =>
            v &&
            (Math.abs(v.minimum ?? 0) === SENTINEL ||
              Math.abs(v.maximum ?? 0) === SENTINEL)
        )
        .map(([k]) => k);
      expect(offenders).toEqual(
        ['fetchContent(local)', 'fileContent(remote)'].includes(name)
          ? ['offset']
          : []
      );
    });
  }

  it('local view offsets accept safe integers and reject fractional or unsafe values', () => {
    const query = {
      mainGoal: 'test goal',
      reasoning: 'exercise offset bounds',
      path: '/fixture.txt',
      unit: 'bytes' as const,
    };
    expect(
      LocalFetchContentQuerySchema.safeParse({ ...query, offset: SENTINEL })
        .success
    ).toBe(true);
    for (const offset of [-1, 0.5, SENTINEL + 1]) {
      expect(
        LocalFetchContentQuerySchema.safeParse({ ...query, offset }).success
      ).toBe(false);
    }
  });

  it('github.code rejects page 0 instead of rewriting caller input', () => {
    const r = GitHubSearchCodeQuerySchema.safeParse({
      keywords: ['x'],
      page: 0,
    });
    expect(r.success).toBe(false);
  });

  it('rejects contextLines above the documented maximum', () => {
    const query = (contextLines: number) => ({
      mainGoal: 'test goal',
      reasoning: 'exercise contextLines bounds',
      owner: 'o',
      repo: 'r',
      path: 'a.ts',
      matchString: 'foo',
      contextLines,
    });
    const contextLinesSchema = z.toJSONSchema(FileContentQuerySchema).properties
      ?.contextLines;
    const maximum =
      typeof contextLinesSchema === 'object'
        ? contextLinesSchema.maximum
        : undefined;
    expect(maximum).toBe(100);
    if (typeof maximum !== 'number') return;
    expect(FileContentQuerySchema.safeParse(query(maximum)).success).toBe(true);
    const r = FileContentQuerySchema.safeParse(query(maximum + 1));
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues.map(i => i.path.join('.'))).toEqual([
        'contextLines',
      ]);
  });

  it('rejects a negative LSP line without changing the observed anchor', () => {
    const r = LspSearchQuerySchema.safeParse({
      path: 'a.ts',
      operation: 'definition',
      symbolName: 'x',
      line: -5,
    });
    expect(r.success).toBe(false);
  });
});

describe.each([
  ['files', StructureFilesQuerySchema],
  ['tree', StructureTreeQuerySchema],
] as const)('structureSearch %s maxEntries bounds', (operation, schema) => {
  it.each([-5, LOCAL_MAX_LIMIT + 1])(
    'rejects out-of-range maxEntries %s without clamping',
    maxEntries => {
      expect(
        schema.safeParse({
          mainGoal: 'test goal',
          reasoning: 'exercise scan-cap bounds',
          operation,
          path: '.',
          maxEntries,
        }).success
      ).toBe(false);
    }
  );

  it('accepts maxEntries at the maximum', () => {
    const result = schema.safeParse({
      mainGoal: 'test goal',
      reasoning: 'exercise scan-cap bounds',
      operation,
      path: '.',
      maxEntries: LOCAL_MAX_LIMIT,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.maxEntries).toBe(LOCAL_MAX_LIMIT);
  });

  it('accepts an omitted maxEntries', () => {
    expect(
      schema.safeParse({
        mainGoal: 'test goal',
        reasoning: 'exercise scan-cap bounds',
        operation,
        path: '.',
      }).success
    ).toBe(true);
  });
});

describe('structureSearch tree depth bounds', () => {
  it.each([0, LOCAL_MAX_DEPTH + 1])(
    'rejects out-of-range depth %s without clamping',
    maxDepth => {
      expect(
        StructureTreeQuerySchema.safeParse({
          mainGoal: 'test goal',
          reasoning: 'exercise depth bounds',
          operation: 'tree',
          path: '.',
          maxDepth,
        }).success
      ).toBe(false);
    }
  );

  it.each([1, LOCAL_MAX_DEPTH])(
    'accepts depth at the boundary %s',
    maxDepth => {
      const result = StructureTreeQuerySchema.safeParse({
        mainGoal: 'test goal',
        reasoning: 'exercise depth bounds',
        operation: 'tree',
        path: '.',
        maxDepth,
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.maxDepth).toBe(maxDepth);
    }
  );
});

describe('LspSearchQuerySchema has no depth field', () => {
  const base = {
    mainGoal: 'test goal',
    reasoning: 'exercise the removed depth field',
    path: '/tmp/x.ts',
    operation: 'callers',
    symbolName: 'x',
    line: 1,
  };

  it('accepts a callers query without depth', () => {
    expect(LspSearchQuerySchema.safeParse(base).success).toBe(true);
  });

  it('rejects depth as an unrecognized key, at any value', () => {
    for (const depth of [1, LOCAL_MAX_DEPTH]) {
      const result = LspSearchQuerySchema.safeParse({ ...base, depth });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]).toMatchObject({
          code: 'unrecognized_keys',
          keys: ['depth'],
        });
      }
    }
  });
});

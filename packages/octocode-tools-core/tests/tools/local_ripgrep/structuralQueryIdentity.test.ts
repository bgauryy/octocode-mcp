import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { searchContentStructural } from '../../../src/tools/local_ripgrep/structuralSearch.js';
import { cleanJsonObject } from '../../../src/responses.js';

// Real native engine: absence for one syntax shape must not become matches for a
// different shape, even when a return-type variant would find a declaration.
describe('structural query identity (real engine)', () => {
  let dir: string;
  let filePath: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(process.cwd(), 'tmp-structural-identity-'));
    filePath = join(dir, 'typed.ts');
    await writeFile(
      filePath,
      'export function foo(): number {\n  return 1;\n}\nexport function bar(): string { return "bar"; }\n',
      'utf8'
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function makeQuery(pattern: string) {
    return {
      id: 'structural-identity',
      researchGoal: 'unit-test',
      reasoning: 'preserve the requested syntax shape',
      path: filePath,
      mode: 'structural' as const,
      langType: 'ts',
      pattern,
      maxFiles: 10,
      maxMatchesPerFile: 1,
    };
  }

  it('keeps an untyped function query empty instead of adding a return type', async () => {
    const result = await searchContentStructural(
      makeQuery('function $NAME($$$ARGS) { $$$BODY }')
    );
    expect(result.status).not.toBe('error');
    expect(result.files).toHaveLength(0);
    expect(cleanJsonObject(result)).toMatchObject({
      diagnostics: [
        expect.objectContaining({ code: 'structural.query.noMatches' }),
      ],
    });
    expect(JSON.stringify(result)).not.toContain('structural.query.rewritten');
  });

  it('executes an explicit typed pattern and preserves it across match pages', async () => {
    const pattern = 'function $NAME($$$ARGS): $R { $$$BODY }';
    const query = makeQuery(pattern);
    const first = await searchContentStructural(query);
    expect(first.files).toHaveLength(1);
    expect(first.files[0]?.matches).toHaveLength(1);
    const next = (
      first as unknown as {
        next: { nextMatchPage: { query: typeof query } };
      }
    ).next.nextMatchPage;
    expect(next.query.pattern).toBe(pattern);
    const second = await searchContentStructural(next.query);
    const names = [first, second].flatMap(result =>
      result.files.flatMap(
        file =>
          file.matches?.flatMap(
            match =>
              (match as { metavars?: Record<string, string[]> }).metavars
                ?.NAME ?? []
          ) ?? []
      )
    );
    expect(names.sort()).toEqual(['bar', 'foo']);
  });
});

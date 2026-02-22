/**
 * Branch coverage tests for mergeReferenceResults in lsp_find_references.ts
 * Targets: merge dedup path, additionalRefs=0, pagination in merge, and
 * pattern-only and LSP-only scenarios
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/hints/index.js', () => ({
  getHints: vi.fn(() => []),
}));

import { mergeReferenceResults } from '../../src/tools/lsp_find_references/lsp_find_references.js';

const baseQuery = {
  uri: '/workspace/src/file.ts',
  symbolName: 'testFn',
  lineHint: 5,
  orderHint: 0,
  contextLines: 2,
  page: 1,
  includeDeclaration: true,
  referencesPerPage: 20,
  researchGoal: 'test',
  reasoning: 'test',
};

const makeLocation = (uri: string, line: number, isDef = false) => ({
  uri,
  range: { start: { line, character: 0 }, end: { line, character: 5 } },
  content: `line ${line}`,
  isDefinition: isDef,
  displayRange: { startLine: line, endLine: line },
});

describe('mergeReferenceResults - branch coverage', () => {
  it('should return patternResult when lspResult is null', () => {
    const patternResult: any = {
      status: 'hasResults',
      locations: [makeLocation('a.ts', 1)],
      totalReferences: 1,
    };
    const result = mergeReferenceResults(null, patternResult, baseQuery);
    expect(result).toBe(patternResult);
  });

  it('should return patternResult when lspResult status is empty', () => {
    const lspResult: any = { status: 'empty', locations: [] };
    const patternResult: any = {
      status: 'hasResults',
      locations: [makeLocation('a.ts', 1)],
      totalReferences: 1,
    };
    const result = mergeReferenceResults(lspResult, patternResult, baseQuery);
    expect(result).toBe(patternResult);
  });

  it('should return patternResult when lspResult has no locations', () => {
    const lspResult: any = { status: 'hasResults', locations: [] };
    const patternResult: any = {
      status: 'hasResults',
      locations: [makeLocation('a.ts', 1)],
      totalReferences: 1,
    };
    const result = mergeReferenceResults(lspResult, patternResult, baseQuery);
    expect(result).toBe(patternResult);
  });

  it('should return lspResult when patternResult is empty', () => {
    const lspResult: any = {
      status: 'hasResults',
      locations: [makeLocation('a.ts', 1)],
      totalReferences: 1,
      hints: ['lsp hint'],
    };
    const patternResult: any = { status: 'empty', locations: [] };
    const result = mergeReferenceResults(lspResult, patternResult, baseQuery);
    expect(result).toBe(lspResult);
  });

  it('should return lspResult when patternResult has no locations', () => {
    const lspResult: any = {
      status: 'hasResults',
      locations: [makeLocation('a.ts', 1)],
      totalReferences: 1,
    };
    const patternResult: any = { status: 'hasResults' };
    const result = mergeReferenceResults(lspResult, patternResult, baseQuery);
    expect(result).toBe(lspResult);
  });

  it('should return LSP result with confirmation hint when no additional refs found', () => {
    const loc = makeLocation('a.ts', 5);
    const lspResult: any = {
      status: 'hasResults',
      locations: [loc],
      totalReferences: 1,
      hints: ['existing-hint'],
    };
    const patternResult: any = {
      status: 'hasResults',
      locations: [makeLocation('a.ts', 5)],
      totalReferences: 1,
    };
    const result = mergeReferenceResults(lspResult, patternResult, baseQuery);
    expect(result.hints).toContain(
      'All references confirmed by both LSP and text search'
    );
    expect(result.hints).toContain('existing-hint');
  });

  it('should handle lspResult.hints being undefined in confirmation path', () => {
    const loc = makeLocation('a.ts', 5);
    const lspResult: any = {
      status: 'hasResults',
      locations: [loc],
      totalReferences: 1,
    };
    const patternResult: any = {
      status: 'hasResults',
      locations: [makeLocation('a.ts', 5)],
      totalReferences: 1,
    };
    const result = mergeReferenceResults(lspResult, patternResult, baseQuery);
    expect(result.hints).toContain(
      'All references confirmed by both LSP and text search'
    );
  });

  it('should merge pattern-only refs that LSP missed', () => {
    const lspLoc = makeLocation('a.ts', 5);
    const patternLoc1 = makeLocation('a.ts', 5);
    const patternLoc2 = makeLocation('b.ts', 10);

    const lspResult: any = {
      status: 'hasResults',
      locations: [lspLoc],
      totalReferences: 1,
      hints: [],
    };
    const patternResult: any = {
      status: 'hasResults',
      locations: [patternLoc1, patternLoc2],
      totalReferences: 2,
    };
    const result = mergeReferenceResults(lspResult, patternResult, baseQuery);
    expect(result.status).toBe('hasResults');
    expect(
      result.hints!.some((h: string) =>
        h.includes('Added 1 reference(s) from text search')
      )
    ).toBe(true);
  });

  it('should paginate merged results and add pagination hint', () => {
    const lspLocs = Array.from({ length: 15 }, (_, i) =>
      makeLocation('a.ts', i)
    );
    const patternLocs = [
      ...lspLocs.map(l => makeLocation(l.uri, l.range.start.line)),
      ...Array.from({ length: 10 }, (_, i) => makeLocation('b.ts', i)),
    ];
    const lspResult: any = {
      status: 'hasResults',
      locations: lspLocs,
      totalReferences: 15,
      hints: [],
    };
    const patternResult: any = {
      status: 'hasResults',
      locations: patternLocs,
      totalReferences: 25,
    };
    const result = mergeReferenceResults(lspResult, patternResult, baseQuery);
    expect(result.pagination).toBeDefined();
    expect(result.pagination!.totalResults).toBe(25);
    expect(result.pagination!.hasMore).toBe(true);
    expect(result.hints!.some((h: string) => h.includes('page 1 of 2'))).toBe(
      true
    );
  });

  it('should not add pagination hint when all results fit on one page', () => {
    const lspLoc = makeLocation('a.ts', 5);
    const patternLoc = makeLocation('b.ts', 10);
    const lspResult: any = {
      status: 'hasResults',
      locations: [lspLoc],
      totalReferences: 1,
      hints: [],
    };
    const patternResult: any = {
      status: 'hasResults',
      locations: [makeLocation('a.ts', 5), patternLoc],
      totalReferences: 2,
    };
    const result = mergeReferenceResults(lspResult, patternResult, baseQuery);
    expect(
      result.hints!.every((h: string) => !h.includes('Showing page'))
    ).toBe(true);
  });

  it('should handle undefined lspResult hints in merge path', () => {
    const lspResult: any = {
      status: 'hasResults',
      locations: [makeLocation('a.ts', 5)],
      totalReferences: 1,
    };
    const patternResult: any = {
      status: 'hasResults',
      locations: [makeLocation('a.ts', 5), makeLocation('c.ts', 3)],
      totalReferences: 2,
    };
    const result = mergeReferenceResults(lspResult, patternResult, baseQuery);
    expect(result.hints).toBeDefined();
    expect(
      result.hints!.some((h: string) => h.includes('Added 1 reference(s)'))
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type {
  DependencyState, DependencySummary, DuplicateGroup,
  FileEntry, FileCriticality,
  DependencyProfile, FunctionEntry,
} from './types.js';
import { DEFAULT_OPTS } from './types.js';
import {
  detectDependencyCycles,
  computeDependencyCriticalPaths,
  buildIssueCatalog,
  isLikelyEntrypoint,
} from './index.js';

function emptyState(): DependencyState {
  return {
    files: new Set(),
    outgoing: new Map(),
    incoming: new Map(),
    incomingFromTests: new Map(),
    incomingFromProduction: new Map(),
    externalCounts: new Map(),
    unresolvedCounts: new Map(),
    declaredExportsByFile: new Map(),
    importedSymbolsByFile: new Map(),
    reExportsByFile: new Map(),
  };
}

function addEdge(state: DependencyState, from: string, to: string, isTest = false): void {
  state.files.add(from);
  state.files.add(to);
  if (!state.outgoing.has(from)) state.outgoing.set(from, new Set());
  state.outgoing.get(from)!.add(to);
  if (!state.incoming.has(to)) state.incoming.set(to, new Set());
  state.incoming.get(to)!.add(from);
  if (isTest) {
    if (!state.incomingFromTests.has(to)) state.incomingFromTests.set(to, new Set());
    state.incomingFromTests.get(to)!.add(from);
  } else {
    if (!state.incomingFromProduction.has(to)) state.incomingFromProduction.set(to, new Set());
    state.incomingFromProduction.get(to)!.add(from);
  }
}

const emptyProfile: DependencyProfile = {
  internalDependencies: [], externalDependencies: [], unresolvedDependencies: [],
  declaredExports: [], importedSymbols: [], reExports: [],
};

function makeFn(overrides: Partial<FunctionEntry> = {}): FunctionEntry {
  return {
    kind: 'FunctionDeclaration', name: 'fn', nameHint: 'fn', file: 'src/a.ts',
    lineStart: 1, lineEnd: 10, columnStart: 1, columnEnd: 1,
    statementCount: 5, complexity: 1, maxBranchDepth: 0, maxLoopDepth: 0,
    returns: 1, awaits: 0, calls: 0, loops: 0, lengthLines: 10, cognitiveComplexity: 0,
    ...overrides,
  };
}

function makeFile(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    package: 'test', file: 'src/a.ts', parseEngine: 'typescript',
    nodeCount: 50, kindCounts: {}, functions: [], flows: [],
    dependencyProfile: emptyProfile, ...overrides,
  };
}

const testOpts = { ...DEFAULT_OPTS, root: '/repo', findingsLimit: 1000 };

function minimalDepSummary(overrides: Partial<DependencySummary> = {}): DependencySummary {
  return {
    totalModules: 0, totalEdges: 0, unresolvedEdgeCount: 0,
    externalDependencyFiles: 0, rootsCount: 0, leavesCount: 0,
    roots: [], leaves: [], criticalModules: [], testOnlyModules: [],
    unresolvedSample: [], outgoingTop: [], inboundTop: [],
    cycles: [], criticalPaths: [], ...overrides,
  };
}

// ─── isLikelyEntrypoint ─────────────────────────────────────────────────────

describe('isLikelyEntrypoint', () => {
  it('matches index files', () => {
    expect(isLikelyEntrypoint('src/index.ts')).toBe(true);
    expect(isLikelyEntrypoint('packages/foo/src/index.tsx')).toBe(true);
    expect(isLikelyEntrypoint('index.js')).toBe(true);
  });

  it('matches main, app, server, cli', () => {
    expect(isLikelyEntrypoint('src/main.ts')).toBe(true);
    expect(isLikelyEntrypoint('src/app.ts')).toBe(true);
    expect(isLikelyEntrypoint('src/server.ts')).toBe(true);
    expect(isLikelyEntrypoint('src/cli.ts')).toBe(true);
  });

  it('rejects non-entrypoint files', () => {
    expect(isLikelyEntrypoint('src/utils.ts')).toBe(false);
    expect(isLikelyEntrypoint('src/helper.ts')).toBe(false);
    expect(isLikelyEntrypoint('src/index-utils.ts')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isLikelyEntrypoint('src/Index.ts')).toBe(true);
    expect(isLikelyEntrypoint('src/MAIN.ts')).toBe(true);
  });
});

// ─── detectDependencyCycles ─────────────────────────────────────────────────

describe('detectDependencyCycles', () => {
  it('returns empty for acyclic graph', () => {
    const state = emptyState();
    addEdge(state, 'a.ts', 'b.ts');
    addEdge(state, 'b.ts', 'c.ts');
    expect(detectDependencyCycles(state)).toEqual([]);
  });

  it('detects simple 2-node cycle', () => {
    const state = emptyState();
    addEdge(state, 'a.ts', 'b.ts');
    addEdge(state, 'b.ts', 'a.ts');
    const cycles = detectDependencyCycles(state);
    expect(cycles.length).toBe(1);
    expect(cycles[0].nodeCount).toBe(2);
  });

  it('detects 3-node cycle', () => {
    const state = emptyState();
    addEdge(state, 'a.ts', 'b.ts');
    addEdge(state, 'b.ts', 'c.ts');
    addEdge(state, 'c.ts', 'a.ts');
    const cycles = detectDependencyCycles(state);
    expect(cycles.length).toBe(1);
    expect(cycles[0].nodeCount).toBe(3);
  });

  it('detects multiple cycles', () => {
    const state = emptyState();
    addEdge(state, 'a.ts', 'b.ts');
    addEdge(state, 'b.ts', 'a.ts');
    addEdge(state, 'c.ts', 'd.ts');
    addEdge(state, 'd.ts', 'c.ts');
    const cycles = detectDependencyCycles(state);
    expect(cycles.length).toBe(2);
  });

  it('deduplicates same cycle found from different start', () => {
    const state = emptyState();
    addEdge(state, 'a.ts', 'b.ts');
    addEdge(state, 'b.ts', 'a.ts');
    const cycles = detectDependencyCycles(state);
    expect(cycles.length).toBe(1);
  });

  it('returns cycles sorted by nodeCount descending', () => {
    const state = emptyState();
    addEdge(state, 'a.ts', 'b.ts');
    addEdge(state, 'b.ts', 'a.ts');
    addEdge(state, 'x.ts', 'y.ts');
    addEdge(state, 'y.ts', 'z.ts');
    addEdge(state, 'z.ts', 'x.ts');
    const cycles = detectDependencyCycles(state);
    expect(cycles[0].nodeCount).toBeGreaterThanOrEqual(cycles[cycles.length - 1].nodeCount);
  });
});

// ─── computeDependencyCriticalPaths ─────────────────────────────────────────

describe('computeDependencyCriticalPaths', () => {
  it('returns empty for isolated files', () => {
    const state = emptyState();
    state.files.add('a.ts');
    const critMap = new Map<string, FileCriticality>();
    critMap.set('a.ts', { file: 'a.ts', complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 5 });
    const paths = computeDependencyCriticalPaths(state, critMap, testOpts);
    expect(paths).toEqual([]);
  });

  it('finds longest weighted path', () => {
    const state = emptyState();
    addEdge(state, 'a.ts', 'b.ts');
    addEdge(state, 'b.ts', 'c.ts');
    const critMap = new Map<string, FileCriticality>();
    critMap.set('a.ts', { file: 'a.ts', complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 100 });
    critMap.set('b.ts', { file: 'b.ts', complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 50 });
    critMap.set('c.ts', { file: 'c.ts', complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 10 });

    const paths = computeDependencyCriticalPaths(state, critMap, testOpts);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0].path).toContain('a.ts');
    expect(paths[0].length).toBe(3);
  });

  it('handles cycles without infinite loop', () => {
    const state = emptyState();
    addEdge(state, 'a.ts', 'b.ts');
    addEdge(state, 'b.ts', 'a.ts');
    const critMap = new Map<string, FileCriticality>();
    critMap.set('a.ts', { file: 'a.ts', complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 10 });
    critMap.set('b.ts', { file: 'b.ts', complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 10 });

    const paths = computeDependencyCriticalPaths(state, critMap, testOpts);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.containsCycle)).toBe(true);
  });

  it('respects deepLinkTopN limit', () => {
    const state = emptyState();
    for (let i = 0; i < 20; i++) {
      const from = `src/m${i}.ts`;
      const to = `src/m${i + 1}.ts`;
      addEdge(state, from, to);
    }
    const critMap = new Map<string, FileCriticality>();
    for (const file of state.files) {
      critMap.set(file, { file, complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 5 });
    }
    const paths = computeDependencyCriticalPaths(state, critMap, { ...testOpts, deepLinkTopN: 3 });
    expect(paths.length).toBeLessThanOrEqual(3);
  });
});

// ─── buildIssueCatalog ──────────────────────────────────────────────────────

describe('buildIssueCatalog', () => {
  describe('duplicate findings', () => {
    it('creates duplicate-function-body findings', () => {
      const dups: DuplicateGroup[] = [{
        hash: 'abc', signature: 'handleError', kind: 'ArrowFunction',
        occurrences: 4, filesCount: 3,
        locations: Array.from({ length: 4 }, (_, i) => ({
          kind: 'ArrowFunction', name: 'handleError', nameHint: 'handleError',
          file: `src/file${i}.ts`, lineStart: 1, lineEnd: 10, columnStart: 1, columnEnd: 1,
          statementCount: 8, complexity: 3, maxBranchDepth: 1, maxLoopDepth: 0,
          returns: 1, awaits: 0, calls: 2, loops: 0, lengthLines: 10, cognitiveComplexity: 2,
          hash: 'abc', metrics: { complexity: 3, maxBranchDepth: 1, maxLoopDepth: 0, returns: 1, awaits: 0, calls: 2, loops: 0 },
        })),
      }];
      const { findings } = buildIssueCatalog(dups, [], [], minimalDepSummary(), emptyState(), testOpts);
      const dupFindings = findings.filter((f) => f.category === 'duplicate-function-body');
      expect(dupFindings.length).toBe(1);
      expect(dupFindings[0].title).toContain('handleError');
    });

    it('assigns severity based on occurrence count', () => {
      const makeDup = (occurrences: number): DuplicateGroup => ({
        hash: 'x', signature: 'fn', kind: 'FunctionDeclaration',
        occurrences, filesCount: occurrences,
        locations: Array.from({ length: occurrences }, (_, i) => ({
          kind: 'FunctionDeclaration', name: 'fn', nameHint: 'fn',
          file: `f${i}.ts`, lineStart: 1, lineEnd: 5, columnStart: 1, columnEnd: 1,
          statementCount: 6, complexity: 1, maxBranchDepth: 0, maxLoopDepth: 0,
          returns: 0, awaits: 0, calls: 0, loops: 0, lengthLines: 5, cognitiveComplexity: 0,
          hash: 'x', metrics: { complexity: 1, maxBranchDepth: 0, maxLoopDepth: 0, returns: 0, awaits: 0, calls: 0, loops: 0 },
        })),
      });

      const low = buildIssueCatalog([makeDup(2)], [], [], minimalDepSummary(), emptyState(), testOpts);
      const med = buildIssueCatalog([makeDup(3)], [], [], minimalDepSummary(), emptyState(), testOpts);
      const high = buildIssueCatalog([makeDup(6)], [], [], minimalDepSummary(), emptyState(), testOpts);

      expect(low.findings[0].severity).toBe('low');
      expect(med.findings[0].severity).toBe('medium');
      expect(high.findings[0].severity).toBe('high');
    });
  });

  describe('function-optimization findings', () => {
    it('flags high-complexity functions', () => {
      const files = [makeFile({
        functions: [makeFn({ complexity: 35, name: 'complexFn' })],
      })];
      const { findings } = buildIssueCatalog([], [], files, minimalDepSummary(), emptyState(), testOpts);
      const optFindings = findings.filter((f) => f.category === 'function-optimization');
      expect(optFindings.length).toBe(1);
      expect(optFindings[0].title).toContain('complexFn');
    });

    it('flags deeply nested functions', () => {
      const files = [makeFile({
        functions: [makeFn({ maxBranchDepth: 8, name: 'deepFn' })],
      })];
      const { findings } = buildIssueCatalog([], [], files, minimalDepSummary(), emptyState(), testOpts);
      expect(findings.some((f) => f.category === 'function-optimization')).toBe(true);
    });

    it('flags large functions', () => {
      const files = [makeFile({
        functions: [makeFn({ statementCount: 30, name: 'bigFn' })],
      })];
      const { findings } = buildIssueCatalog([], [], files, minimalDepSummary(), emptyState(), testOpts);
      expect(findings.some((f) => f.category === 'function-optimization')).toBe(true);
    });

    it('skips clean functions', () => {
      const files = [makeFile({
        functions: [makeFn({ complexity: 5, maxBranchDepth: 2, maxLoopDepth: 1, statementCount: 10 })],
      })];
      const { findings } = buildIssueCatalog([], [], files, minimalDepSummary(), emptyState(), testOpts);
      expect(findings.filter((f) => f.category === 'function-optimization')).toEqual([]);
    });
  });

  describe('dead code findings', () => {
    it('detects dead files (root with no outgoing)', () => {
      const state = emptyState();
      state.files.add('src/dead.ts');
      const depSummary = minimalDepSummary({ roots: ['src/dead.ts'] });
      const { findings } = buildIssueCatalog([], [], [], depSummary, state, testOpts);
      expect(findings.some((f) => f.category === 'dead-file' && f.file === 'src/dead.ts')).toBe(true);
    });

    it('skips entrypoints from dead-file detection', () => {
      const state = emptyState();
      state.files.add('src/index.ts');
      const depSummary = minimalDepSummary({ roots: ['src/index.ts'] });
      const { findings } = buildIssueCatalog([], [], [], depSummary, state, testOpts);
      expect(findings.some((f) => f.category === 'dead-file' && f.file === 'src/index.ts')).toBe(false);
    });

    it('detects dead exports', () => {
      const state = emptyState();
      state.files.add('src/lib.ts');
      state.declaredExportsByFile.set('src/lib.ts', [
        { name: 'usedFn', kind: 'value' },
        { name: 'deadFn', kind: 'value', lineStart: 10, lineEnd: 15 },
      ]);
      state.importedSymbolsByFile.set('src/consumer.ts', [
        { sourceModule: './lib', resolvedModule: 'src/lib.ts', importedName: 'usedFn', localName: 'usedFn', isTypeOnly: false },
      ]);
      addEdge(state, 'src/consumer.ts', 'src/lib.ts');
      const depSummary = minimalDepSummary();
      const { findings } = buildIssueCatalog([], [], [], depSummary, state, testOpts);
      const deadExports = findings.filter((f) => f.category === 'dead-export');
      expect(deadExports.some((f) => f.title.includes('deadFn'))).toBe(true);
      expect(deadExports.some((f) => f.title.includes('usedFn'))).toBe(false);
    });

    it('skips exports consumed via namespace import (*)', () => {
      const state = emptyState();
      state.files.add('src/lib.ts');
      state.declaredExportsByFile.set('src/lib.ts', [
        { name: 'foo', kind: 'value' },
      ]);
      state.importedSymbolsByFile.set('src/consumer.ts', [
        { sourceModule: './lib', resolvedModule: 'src/lib.ts', importedName: '*', localName: 'lib', isTypeOnly: false },
      ]);
      const depSummary = minimalDepSummary();
      const { findings } = buildIssueCatalog([], [], [], depSummary, state, testOpts);
      expect(findings.some((f) => f.category === 'dead-export' && f.title.includes('foo'))).toBe(false);
    });
  });

  describe('re-export findings', () => {
    it('detects dead re-exports', () => {
      const state = emptyState();
      state.files.add('src/index.ts');
      state.reExportsByFile.set('src/index.ts', [
        { sourceModule: './a', resolvedModule: 'src/a.ts', exportedAs: 'deadSymbol', importedName: 'deadSymbol', isStar: false, isTypeOnly: false, lineStart: 1, lineEnd: 1 },
      ]);
      const depSummary = minimalDepSummary();
      const { findings } = buildIssueCatalog([], [], [], depSummary, state, testOpts);
      expect(findings.some((f) => f.category === 'dead-re-export')).toBe(true);
    });

    it('detects re-export duplication', () => {
      const state = emptyState();
      state.files.add('src/barrel.ts');
      state.reExportsByFile.set('src/barrel.ts', [
        { sourceModule: './a', resolvedModule: 'src/a.ts', exportedAs: 'Foo', importedName: 'Foo', isStar: false, isTypeOnly: false },
        { sourceModule: './b', resolvedModule: 'src/b.ts', exportedAs: 'Foo', importedName: 'Foo', isStar: false, isTypeOnly: false },
      ]);
      const depSummary = minimalDepSummary();
      const { findings } = buildIssueCatalog([], [], [], depSummary, state, testOpts);
      expect(findings.some((f) => f.category === 're-export-duplication')).toBe(true);
    });

    it('detects shadowed re-exports', () => {
      const state = emptyState();
      state.files.add('src/barrel.ts');
      state.declaredExportsByFile.set('src/barrel.ts', [
        { name: 'Conflict', kind: 'value' },
      ]);
      state.reExportsByFile.set('src/barrel.ts', [
        { sourceModule: './a', resolvedModule: 'src/a.ts', exportedAs: 'Conflict', importedName: 'Conflict', isStar: false, isTypeOnly: false },
      ]);
      const depSummary = minimalDepSummary();
      const { findings } = buildIssueCatalog([], [], [], depSummary, state, testOpts);
      expect(findings.some((f) => f.category === 're-export-shadowed')).toBe(true);
    });
  });

  describe('dependency findings', () => {
    it('creates cycle findings', () => {
      const depSummary = minimalDepSummary({
        cycles: [{ path: ['a.ts', 'b.ts', 'a.ts'], nodeCount: 2 }],
      });
      const { findings } = buildIssueCatalog([], [], [], depSummary, emptyState(), testOpts);
      expect(findings.some((f) => f.category === 'dependency-cycle')).toBe(true);
    });

    it('creates critical-path findings above score threshold', () => {
      const depSummary = minimalDepSummary({
        criticalPaths: [{
          start: 'a.ts', path: ['a.ts', 'b.ts', 'c.ts'],
          score: 300, length: 3, containsCycle: false,
        }],
      });
      const { findings } = buildIssueCatalog([], [], [], depSummary, emptyState(), testOpts);
      expect(findings.some((f) => f.category === 'dependency-critical-path')).toBe(true);
    });

    it('skips critical-path findings below score threshold', () => {
      const depSummary = minimalDepSummary({
        criticalPaths: [{
          start: 'a.ts', path: ['a.ts', 'b.ts'],
          score: 10, length: 2, containsCycle: false,
        }],
      });
      const { findings } = buildIssueCatalog([], [], [], depSummary, emptyState(), testOpts);
      expect(findings.some((f) => f.category === 'dependency-critical-path')).toBe(false);
    });

    it('creates test-only module findings', () => {
      const depSummary = minimalDepSummary({
        testOnlyModules: [{
          file: 'src/test-helper.ts', outboundCount: 0, inboundCount: 1,
          inboundFromProduction: 0, inboundFromTests: 1,
          externalDependencyCount: 0, unresolvedDependencyCount: 0,
        }],
      });
      const { findings } = buildIssueCatalog([], [], [], depSummary, emptyState(), testOpts);
      expect(findings.some((f) => f.category === 'dependency-test-only')).toBe(true);
    });
  });

  describe('finding limits and sorting', () => {
    it('respects findingsLimit', () => {
      const files = [makeFile({
        functions: Array.from({ length: 50 }, (_, i) => makeFn({
          complexity: 40, name: `fn${i}`,
        })),
      })];
      const opts = { ...testOpts, findingsLimit: 5 };
      const { findings } = buildIssueCatalog([], [], files, minimalDepSummary(), emptyState(), opts);
      expect(findings.length).toBeLessThanOrEqual(5);
    });

    it('sorts findings by severity descending', () => {
      const depSummary = minimalDepSummary({
        cycles: [{ path: ['a.ts', 'b.ts', 'a.ts'], nodeCount: 2 }],
        testOnlyModules: [{
          file: 'src/t.ts', outboundCount: 0, inboundCount: 1,
          inboundFromProduction: 0, inboundFromTests: 1,
          externalDependencyCount: 0, unresolvedDependencyCount: 0,
        }],
      });
      const { findings } = buildIssueCatalog([], [], [], depSummary, emptyState(), testOpts);
      if (findings.length >= 2) {
        const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
        for (let i = 1; i < findings.length; i++) {
          expect(severityOrder[findings[i - 1].severity]).toBeGreaterThanOrEqual(severityOrder[findings[i].severity]);
        }
      }
    });

    it('assigns unique IDs to each finding', () => {
      const files = [makeFile({
        functions: [
          makeFn({ complexity: 40, name: 'fn1' }),
          makeFn({ complexity: 40, name: 'fn2' }),
        ],
      })];
      const { findings } = buildIssueCatalog([], [], files, minimalDepSummary(), emptyState(), testOpts);
      const ids = findings.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('tracks findings per file', () => {
      const files = [makeFile({
        file: 'src/hot.ts',
        functions: [makeFn({ complexity: 40, name: 'fn1', file: 'src/hot.ts' })],
      })];
      const { byFile } = buildIssueCatalog([], [], files, minimalDepSummary(), emptyState(), testOpts);
      expect(byFile.get('src/hot.ts')?.length).toBeGreaterThan(0);
    });
  });

  describe('architecture integration', () => {
    it('includes SDP violation findings from architecture module', () => {
      const state = emptyState();
      for (let i = 0; i < 10; i++) {
        const f = `src/dep${i}.ts`;
        state.files.add(f);
        addEdge(state, f, 'src/stable.ts');
      }
      addEdge(state, 'src/stable.ts', 'src/unstable.ts');
      for (let i = 0; i < 10; i++) {
        const f = `src/lib${i}.ts`;
        state.files.add(f);
        addEdge(state, 'src/unstable.ts', f);
      }
      const { findings } = buildIssueCatalog([], [], [], minimalDepSummary(), state, testOpts);
      expect(findings.some((f) => f.category === 'architecture-sdp-violation')).toBe(true);
    });

    it('includes orphan-module findings', () => {
      const state = emptyState();
      state.files.add('src/orphan.ts');
      addEdge(state, 'src/a.ts', 'src/b.ts');
      const { findings } = buildIssueCatalog([], [], [], minimalDepSummary(), state, testOpts);
      expect(findings.some((f) => f.category === 'orphan-module')).toBe(true);
    });
  });
});

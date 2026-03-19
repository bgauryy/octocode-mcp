import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  buildConsumedFromModule,
  computeAbstractness,
  computeBarrelDepth,
  computeCognitiveComplexity,
  computeHotFiles,
  computeInstability,
  detectBarrelExplosion,
  detectBoundaryViolations,
  detectCognitiveComplexity,
  detectCommonJsInEsm,
  detectCriticalPaths,
  detectDeadExports,
  detectDeadFiles,
  detectDeadReExports,
  detectDependencyCycles,
  detectDistanceFromMainSequence,
  detectDuplicateFlowStructures,
  detectDuplicateFunctionBodies,
  detectEmptyCatchBlocks,
  detectExcessiveParameters,
  detectExportStarLeak,
  detectFeatureEnvy,
  detectFunctionOptimization,
  detectGodFunctions,
  detectGodModuleCoupling,
  detectGodModules,
  detectHighCoupling,
  detectHighHalsteadEffort,
  detectLayerViolations,
  detectLowCohesion,
  detectLowMaintainability,
  detectMegaFolders,
  detectNamespaceImport,
  detectOrphanModules,
  detectSdpViolations,
  detectSwitchNoDefault,
  detectTestOnlyModules,
  detectUnreachableModules,
  detectUnsafeAny,
  detectUntestedCriticalCode,
  detectUnusedNpmDeps,
  isLikelyEntrypoint,
  mergeOverlappingChains,
} from './architecture.js';

import type { DependencyProfile, DependencyState, DuplicateGroup, FileEntry, FunctionEntry, RedundantFlowGroup } from './types.js';
import type { CodeLocation, DependencySummary, FileCriticality } from './types.js';


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

function addEdge(state: DependencyState, from: string, to: string): void {
  state.files.add(from);
  state.files.add(to);
  if (!state.outgoing.has(from)) state.outgoing.set(from, new Set());
  state.outgoing.get(from)!.add(to);
  if (!state.incoming.has(to)) state.incoming.set(to, new Set());
  state.incoming.get(to)!.add(from);
}

const emptyProfile: DependencyProfile = {
  internalDependencies: [],
  externalDependencies: [],
  unresolvedDependencies: [],
  declaredExports: [],
  importedSymbols: [],
  reExports: [],
};

function makeFn(overrides: Partial<FunctionEntry> = {}): FunctionEntry {
  return {
    kind: 'FunctionDeclaration',
    name: 'testFn',
    nameHint: 'testFn',
    file: 'src/file.ts',
    lineStart: 1,
    lineEnd: 10,
    columnStart: 1,
    columnEnd: 1,
    statementCount: 5,
    complexity: 1,
    maxBranchDepth: 0,
    maxLoopDepth: 0,
    returns: 1,
    awaits: 0,
    calls: 0,
    loops: 0,
    lengthLines: 10,
    cognitiveComplexity: 0,
    ...overrides,
  };
}

function makeFileEntry(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    package: 'test',
    file: 'src/file.ts',
    parseEngine: 'typescript',
    nodeCount: 100,
    kindCounts: {},
    functions: [],
    flows: [],
    dependencyProfile: emptyProfile,
    ...overrides,
  };
}

function minimalDepSummary(overrides: Partial<DependencySummary> = {}): DependencySummary {
  return {
    totalModules: 0, totalEdges: 0, unresolvedEdgeCount: 0,
    externalDependencyFiles: 0, rootsCount: 0, leavesCount: 0,
    roots: [], leaves: [], criticalModules: [], testOnlyModules: [],
    unresolvedSample: [], outgoingTop: [], inboundTop: [],
    cycles: [], criticalPaths: [], ...overrides,
  };
}

// ─── isLikelyEntrypoint ────────────────────────────────────────────────────

describe('isLikelyEntrypoint', () => {
  it('matches config files', () => {
    expect(isLikelyEntrypoint('vite.config.ts')).toBe(true);
    expect(isLikelyEntrypoint('webpack.config.js')).toBe(true);
  });

  it('matches public entrypoint pattern', () => {
    expect(isLikelyEntrypoint('src/public.ts')).toBe(true);
  });
});

// ─── 2A: Instability ────────────────────────────────────────────────────────

describe('computeInstability', () => {
  it('returns 0 when both counts are 0', () => {
    expect(computeInstability(0, 0)).toBe(0);
  });

  it('returns 0 for maximally stable (only depended on)', () => {
    expect(computeInstability(10, 0)).toBe(0);
  });

  it('returns 1 for maximally unstable (only depends)', () => {
    expect(computeInstability(0, 10)).toBe(1);
  });

  it('returns 0.5 for equal inbound/outbound', () => {
    expect(computeInstability(5, 5)).toBe(0.5);
  });

  it('computes fractional instability', () => {
    expect(computeInstability(3, 7)).toBeCloseTo(0.7);
  });
});

describe('detectSdpViolations', () => {
  it('returns empty for no files', () => {
    expect(detectSdpViolations(emptyState())).toEqual([]);
  });

  it('detects when stable module depends on unstable module', () => {
    const state = emptyState();
    // A is stable: many depend on it (high Ca), it depends on B only
    // B is unstable: only A depends on it, it depends on many
    state.files.add('src/a.ts');
    state.files.add('src/b.ts');
    state.files.add('src/c.ts');
    state.files.add('src/d.ts');
    state.files.add('src/e.ts');
    // c, d, e all depend on A -> A has Ca=3
    addEdge(state, 'src/c.ts', 'src/a.ts');
    addEdge(state, 'src/d.ts', 'src/a.ts');
    addEdge(state, 'src/e.ts', 'src/a.ts');
    // A depends on B -> A has Ce=1, I(A) = 1/(3+1) = 0.25
    addEdge(state, 'src/a.ts', 'src/b.ts');
    // B depends on c, d, e -> B has Ce=3, Ca=1, I(B) = 3/(1+3) = 0.75
    addEdge(state, 'src/b.ts', 'src/c.ts');
    addEdge(state, 'src/b.ts', 'src/d.ts');
    addEdge(state, 'src/b.ts', 'src/e.ts');

    const findings = detectSdpViolations(state);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].category).toBe('architecture-sdp-violation');
    expect(findings[0].file).toBe('src/a.ts');
  });

  it('does not flag when stable depends on stable', () => {
    const state = emptyState();
    state.files.add('src/a.ts');
    state.files.add('src/b.ts');
    state.files.add('src/c.ts');
    // A: Ca=1, Ce=1 -> I=0.5; B: Ca=1, Ce=1 -> I=0.5
    addEdge(state, 'src/a.ts', 'src/b.ts');
    addEdge(state, 'src/c.ts', 'src/a.ts');
    addEdge(state, 'src/b.ts', 'src/c.ts');
    const findings = detectSdpViolations(state);
    expect(findings).toEqual([]);
  });

  it('skips test files', () => {
    const state = emptyState();
    state.files.add('src/a.test.ts');
    state.files.add('src/b.ts');
    addEdge(state, 'src/a.test.ts', 'src/b.ts');
    expect(detectSdpViolations(state)).toEqual([]);
  });

  it('assigns high severity for large delta', () => {
    const state = emptyState();
    // A very stable (I~0), B very unstable (I~1)
    state.files.add('src/stable.ts');
    state.files.add('src/unstable.ts');
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
    const findings = detectSdpViolations(state);
    const sdp = findings.find((f) => f.file === 'src/stable.ts');
    expect(sdp).toBeDefined();
    expect(sdp!.severity).toBe('high');
  });
});

// ─── 2B: High Coupling ─────────────────────────────────────────────────────

describe('detectHighCoupling', () => {
  it('returns empty for uncoupled modules', () => {
    const state = emptyState();
    state.files.add('src/a.ts');
    expect(detectHighCoupling(state)).toEqual([]);
  });

  it('detects modules above threshold', () => {
    const state = emptyState();
    const hub = 'src/hub.ts';
    state.files.add(hub);
    for (let i = 0; i < 10; i++) {
      const f = `src/dep${i}.ts`;
      state.files.add(f);
      addEdge(state, hub, f);
    }
    for (let i = 0; i < 8; i++) {
      const f = `src/consumer${i}.ts`;
      state.files.add(f);
      addEdge(state, f, hub);
    }
    // hub: Ca=8, Ce=10, total=18
    const findings = detectHighCoupling(state, 15);
    const hubFinding = findings.find((f) => f.file === hub);
    expect(hubFinding).toBeDefined();
    expect(hubFinding!.category).toBe('high-coupling');
  });

  it('assigns high severity above 25', () => {
    const state = emptyState();
    const hub = 'src/hub.ts';
    state.files.add(hub);
    for (let i = 0; i < 26; i++) {
      const f = `src/m${i}.ts`;
      state.files.add(f);
      addEdge(state, f, hub);
    }
    const findings = detectHighCoupling(state, 15);
    expect(findings[0].severity).toBe('high');
  });

  it('respects custom threshold', () => {
    const state = emptyState();
    const hub = 'src/hub.ts';
    state.files.add(hub);
    for (let i = 0; i < 5; i++) {
      const f = `src/m${i}.ts`;
      state.files.add(f);
      addEdge(state, f, hub);
    }
    expect(detectHighCoupling(state, 3).length).toBeGreaterThan(0);
    expect(detectHighCoupling(state, 10)).toEqual([]);
  });
});

// ─── 2C: Fan-In / Fan-Out ──────────────────────────────────────────────────

describe('detectGodModuleCoupling', () => {
  it('returns empty for low fan-in/fan-out', () => {
    const state = emptyState();
    state.files.add('src/a.ts');
    state.files.add('src/b.ts');
    addEdge(state, 'src/a.ts', 'src/b.ts');
    expect(detectGodModuleCoupling(state)).toEqual([]);
  });

  it('detects high fan-in', () => {
    const state = emptyState();
    const hub = 'src/utils.ts';
    state.files.add(hub);
    for (let i = 0; i < 22; i++) {
      const f = `src/consumer${i}.ts`;
      state.files.add(f);
      addEdge(state, f, hub);
    }
    const findings = detectGodModuleCoupling(state, 20, 15);
    expect(findings.some((f) => f.title.includes('fan-in'))).toBe(true);
  });

  it('detects high fan-out', () => {
    const state = emptyState();
    const hub = 'src/orchestrator.ts';
    state.files.add(hub);
    for (let i = 0; i < 18; i++) {
      const f = `src/service${i}.ts`;
      state.files.add(f);
      addEdge(state, hub, f);
    }
    const findings = detectGodModuleCoupling(state, 20, 15);
    expect(findings.some((f) => f.title.includes('fan-out'))).toBe(true);
  });

  it('can detect both fan-in and fan-out for same module', () => {
    const state = emptyState();
    const hub = 'src/mega.ts';
    state.files.add(hub);
    for (let i = 0; i < 25; i++) {
      const f = `src/in${i}.ts`;
      state.files.add(f);
      addEdge(state, f, hub);
    }
    for (let i = 0; i < 20; i++) {
      const f = `src/out${i}.ts`;
      state.files.add(f);
      addEdge(state, hub, f);
    }
    const findings = detectGodModuleCoupling(state, 20, 15);
    const hubFindings = findings.filter((f) => f.file === hub);
    expect(hubFindings.length).toBe(2);
  });
});

// ─── 2D: Orphan Module ─────────────────────────────────────────────────────

describe('detectOrphanModules', () => {
  it('returns empty when all modules are connected', () => {
    const state = emptyState();
    addEdge(state, 'src/a.ts', 'src/b.ts');
    expect(detectOrphanModules(state)).toEqual([]);
  });

  it('detects disconnected module', () => {
    const state = emptyState();
    state.files.add('src/orphan.ts');
    addEdge(state, 'src/a.ts', 'src/b.ts');
    const findings = detectOrphanModules(state);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('orphan-module');
    expect(findings[0].file).toBe('src/orphan.ts');
  });

  it('skips entrypoints', () => {
    const state = emptyState();
    state.files.add('src/index.ts');
    expect(detectOrphanModules(state)).toEqual([]);
  });

  it('skips test files', () => {
    const state = emptyState();
    state.files.add('src/foo.test.ts');
    expect(detectOrphanModules(state)).toEqual([]);
  });
});

// ─── 2E: Reachability ──────────────────────────────────────────────────────

describe('detectUnreachableModules', () => {
  it('returns empty when all reachable from entrypoint', () => {
    const state = emptyState();
    addEdge(state, 'src/index.ts', 'src/a.ts');
    addEdge(state, 'src/a.ts', 'src/b.ts');
    expect(detectUnreachableModules(state)).toEqual([]);
  });

  it('detects module unreachable from entrypoints', () => {
    const state = emptyState();
    addEdge(state, 'src/index.ts', 'src/a.ts');
    // island is reachable only from itself
    addEdge(state, 'src/island.ts', 'src/leaf.ts');
    const findings = detectUnreachableModules(state);
    const unreachable = findings.map((f) => f.file).sort();
    expect(unreachable).toContain('src/island.ts');
    expect(unreachable).toContain('src/leaf.ts');
  });

  it('flags subgraphs not reachable from named entrypoints', () => {
    const state = emptyState();
    addEdge(state, 'src/main.ts', 'src/a.ts');
    addEdge(state, 'src/orphan.ts', 'src/b.ts');
    // main.ts matches isLikelyEntrypoint, orphan.ts does NOT
    // so orphan.ts and b.ts are unreachable from main.ts
    const findings = detectUnreachableModules(state);
    expect(findings.map((f) => f.file).sort()).toEqual(['src/b.ts', 'src/orphan.ts']);
  });

  it('uses roots as entrypoints when no index/main files exist', () => {
    const state = emptyState();
    // No entrypoint patterns → fallback to all root nodes
    addEdge(state, 'src/alpha.ts', 'src/a.ts');
    addEdge(state, 'src/beta.ts', 'src/b.ts');
    const findings = detectUnreachableModules(state);
    expect(findings).toEqual([]);
  });

  it('handles cycles gracefully', () => {
    const state = emptyState();
    addEdge(state, 'src/index.ts', 'src/a.ts');
    addEdge(state, 'src/a.ts', 'src/b.ts');
    addEdge(state, 'src/b.ts', 'src/a.ts');
    expect(detectUnreachableModules(state)).toEqual([]);
  });
});

// ─── 3A: Unused npm Deps ───────────────────────────────────────────────────

describe('detectUnusedNpmDeps', () => {
  it('returns empty when all deps are used', () => {
    const ext = new Map([['src/a.ts', new Set(['lodash', '@types/node'])]]);
    expect(detectUnusedNpmDeps(ext, { lodash: '^4.0.0' })).toEqual([]);
  });

  it('detects unused production dependency', () => {
    const ext = new Map([['src/a.ts', new Set(['lodash'])]]);
    const findings = detectUnusedNpmDeps(ext, { lodash: '^4', express: '^4' });
    expect(findings.length).toBe(1);
    expect(findings[0].title).toContain('express');
    expect(findings[0].severity).toBe('medium');
  });

  it('detects unused devDependency with low severity', () => {
    const ext = new Map<string, Set<string>>();
    const findings = detectUnusedNpmDeps(ext, {}, { vitest: '^1.0' });
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('low');
  });

  it('handles scoped packages correctly', () => {
    const ext = new Map([['src/a.ts', new Set(['@scope/pkg/utils'])]]);
    expect(detectUnusedNpmDeps(ext, { '@scope/pkg': '^1.0' })).toEqual([]);
  });

  it('reports both unused prod and dev deps', () => {
    const ext = new Map<string, Set<string>>();
    const findings = detectUnusedNpmDeps(ext, { react: '^18' }, { jest: '^29' });
    expect(findings.length).toBe(2);
  });
});

// ─── 3B: Package Boundary Violations ───────────────────────────────────────

describe('detectBoundaryViolations', () => {
  it('returns empty for same-package imports', () => {
    const state = emptyState();
    addEdge(state, 'packages/foo/src/a.ts', 'packages/foo/src/b.ts');
    expect(detectBoundaryViolations(state)).toEqual([]);
  });

  it('allows cross-package import via index', () => {
    const state = emptyState();
    addEdge(state, 'packages/foo/src/a.ts', 'packages/bar/src/index.ts');
    expect(detectBoundaryViolations(state)).toEqual([]);
  });

  it('detects cross-package import bypassing index', () => {
    const state = emptyState();
    addEdge(state, 'packages/foo/src/a.ts', 'packages/bar/src/utils/helper.ts');
    const findings = detectBoundaryViolations(state);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('package-boundary-violation');
    expect(findings[0].severity).toBe('medium');
  });

  it('assigns high severity for internal/ path imports', () => {
    const state = emptyState();
    addEdge(state, 'packages/foo/src/a.ts', 'packages/bar/src/internal/secret.ts');
    const findings = detectBoundaryViolations(state);
    expect(findings[0].severity).toBe('high');
  });

  it('skips non-package files', () => {
    const state = emptyState();
    addEdge(state, 'src/a.ts', 'src/b.ts');
    expect(detectBoundaryViolations(state)).toEqual([]);
  });
});

// ─── 3C: Barrel Explosion ──────────────────────────────────────────────────

describe('computeBarrelDepth', () => {
  it('returns 0 for file with no re-exports', () => {
    const state = emptyState();
    state.reExportsByFile.set('src/a.ts', []);
    expect(computeBarrelDepth('src/a.ts', state)).toBe(0);
  });

  it('returns 1 for single-level barrel', () => {
    const state = emptyState();
    state.reExportsByFile.set('src/index.ts', [
      { sourceModule: './a', resolvedModule: 'src/a.ts', exportedAs: 'A', importedName: 'A', isStar: false, isTypeOnly: false },
    ]);
    state.reExportsByFile.set('src/a.ts', []);
    expect(computeBarrelDepth('src/index.ts', state)).toBe(1);
  });

  it('returns 2 for two-level barrel chain', () => {
    const state = emptyState();
    state.reExportsByFile.set('src/index.ts', [
      { sourceModule: './sub', resolvedModule: 'src/sub/index.ts', exportedAs: '*', importedName: '*', isStar: true, isTypeOnly: false },
    ]);
    state.reExportsByFile.set('src/sub/index.ts', [
      { sourceModule: './a', resolvedModule: 'src/sub/a.ts', exportedAs: 'A', importedName: 'A', isStar: false, isTypeOnly: false },
    ]);
    state.reExportsByFile.set('src/sub/a.ts', []);
    expect(computeBarrelDepth('src/index.ts', state)).toBe(2);
  });

  it('handles cycles without infinite loop', () => {
    const state = emptyState();
    state.reExportsByFile.set('src/a.ts', [
      { sourceModule: './b', resolvedModule: 'src/b.ts', exportedAs: '*', importedName: '*', isStar: true, isTypeOnly: false },
    ]);
    state.reExportsByFile.set('src/b.ts', [
      { sourceModule: './a', resolvedModule: 'src/a.ts', exportedAs: '*', importedName: '*', isStar: true, isTypeOnly: false },
    ]);
    // a→b is depth 1, b→a is visited → 0, so a=1+1=2
    expect(computeBarrelDepth('src/a.ts', state)).toBe(2);
  });
});

describe('detectBarrelExplosion', () => {
  it('returns empty for small barrel', () => {
    const state = emptyState();
    state.reExportsByFile.set('src/index.ts', [
      { sourceModule: './a', resolvedModule: 'src/a.ts', exportedAs: 'A', importedName: 'A', isStar: false, isTypeOnly: false },
    ]);
    expect(detectBarrelExplosion(state, 30)).toEqual([]);
  });

  it('detects barrel exceeding symbol threshold', () => {
    const state = emptyState();
    const reexports = Array.from({ length: 35 }, (_, i) => ({
      sourceModule: `./m${i}`,
      resolvedModule: `src/m${i}.ts`,
      exportedAs: `S${i}`,
      importedName: `S${i}`,
      isStar: false,
      isTypeOnly: false,
    }));
    state.reExportsByFile.set('src/index.ts', reexports);
    const findings = detectBarrelExplosion(state, 30);
    expect(findings.some((f) => f.category === 'barrel-explosion' && f.title.includes('Barrel explosion'))).toBe(true);
  });
});

// ─── 3D: God Module / Function ─────────────────────────────────────────────

describe('detectGodModules', () => {
  it('returns empty for small modules', () => {
    const state = emptyState();
    const files: FileEntry[] = [makeFileEntry({ functions: [makeFn({ statementCount: 10 })] })];
    expect(detectGodModules(files, state)).toEqual([]);
  });

  it('detects module with many statements', () => {
    const state = emptyState();
    const fns = Array.from({ length: 10 }, (_, i) => makeFn({ name: `fn${i}`, statementCount: 60 }));
    const files: FileEntry[] = [makeFileEntry({ functions: fns })];
    const findings = detectGodModules(files, state, 500);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('god-module');
  });

  it('detects module with many exports', () => {
    const state = emptyState();
    const exports = Array.from({ length: 25 }, (_, i) => ({ name: `exp${i}`, kind: 'value' as const }));
    state.declaredExportsByFile.set('src/file.ts', exports);
    const files: FileEntry[] = [makeFileEntry()];
    const findings = detectGodModules(files, state, 9999, 20);
    expect(findings.length).toBe(1);
  });
});

describe('detectMegaFolders', () => {
  it('returns empty when no folder crosses the concentration threshold', () => {
    const files = [
      makeFileEntry({ file: 'src/a.ts' }),
      makeFileEntry({ file: 'src/b.ts' }),
      makeFileEntry({ file: 'src/feature/c.ts' }),
      makeFileEntry({ file: 'src/feature/d.ts' }),
    ];
    expect(detectMegaFolders(files, 3, 0.6)).toEqual([]);
  });

  it('flags large concentrated folder and includes decomposition evidence', () => {
    const files = [
      ...Array.from({ length: 6 }, (_, i) => makeFileEntry({ file: `src/core/file-${i}.ts` })),
      makeFileEntry({ file: 'src/feature/a.ts' }),
      makeFileEntry({ file: 'src/feature/b.ts' }),
    ];
    const findings = detectMegaFolders(files, 5, 0.5);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('mega-folder');
    expect(findings[0].title).toContain('src/core');
    expect((findings[0].evidence as Record<string, unknown>).fileCount).toBe(6);
  });
});

describe('detectGodFunctions', () => {
  it('returns empty for small functions', () => {
    const files: FileEntry[] = [makeFileEntry({ functions: [makeFn({ statementCount: 50 })] })];
    expect(detectGodFunctions(files, 100)).toEqual([]);
  });

  it('detects function exceeding statement threshold', () => {
    const files: FileEntry[] = [makeFileEntry({ functions: [makeFn({ statementCount: 120, name: 'bigFn' })] })];
    const findings = detectGodFunctions(files, 100);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('god-function');
    expect(findings[0].title).toContain('bigFn');
  });
});

// ─── 3E: Cognitive Complexity ──────────────────────────────────────────────

describe('computeCognitiveComplexity', () => {
  function parseExpr(code: string): ts.Node {
    const src = ts.createSourceFile('test.ts', code, ts.ScriptTarget.ESNext, true);
    return src.statements[0];
  }

  it('returns 0 for simple function', () => {
    const node = parseExpr('function f() { return 1; }');
    expect(computeCognitiveComplexity(node)).toBe(0);
  });

  it('counts simple if as 1', () => {
    const node = parseExpr('function f(x: boolean) { if (x) { return 1; } }');
    expect(computeCognitiveComplexity(node)).toBe(1);
  });

  it('penalizes nesting', () => {
    const node = parseExpr('function f(a: boolean, b: boolean) { if (a) { if (b) { return 1; } } }');
    // outer if: +1 (nesting=0), inner if: +1+1 (nesting=1) = 3
    expect(computeCognitiveComplexity(node)).toBe(3);
  });

  it('counts for loop', () => {
    const node = parseExpr('function f(arr: number[]) { for (const x of arr) { console.log(x); } }');
    expect(computeCognitiveComplexity(node)).toBeGreaterThan(0);
  });

  it('counts logical operators', () => {
    const node = parseExpr('function f(a: boolean, b: boolean) { return a && b; }');
    expect(computeCognitiveComplexity(node)).toBe(1);
  });

  it('deeply nested structures have high complexity', () => {
    const code = `function f(a: boolean, b: boolean, c: boolean) {
      if (a) {
        for (let i = 0; i < 10; i++) {
          if (b) {
            while (c) {
              break;
            }
          }
        }
      }
    }`;
    const node = parseExpr(code);
    // if: 1+0=1, for: 1+1=2, if: 1+2=3, while: 1+3=4 = 10
    expect(computeCognitiveComplexity(node)).toBe(10);
  });
});

describe('detectCognitiveComplexity', () => {
  it('returns empty for low-complexity functions', () => {
    const files: FileEntry[] = [makeFileEntry({ functions: [makeFn({ cognitiveComplexity: 5 })] })];
    expect(detectCognitiveComplexity(files, 15)).toEqual([]);
  });

  it('detects high cognitive complexity', () => {
    const files: FileEntry[] = [makeFileEntry({ functions: [makeFn({ cognitiveComplexity: 20, name: 'complexFn' })] })];
    const findings = detectCognitiveComplexity(files, 15);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('cognitive-complexity');
  });

  it('assigns high severity above 25', () => {
    const files: FileEntry[] = [makeFileEntry({ functions: [makeFn({ cognitiveComplexity: 30 })] })];
    const findings = detectCognitiveComplexity(files, 15);
    expect(findings[0].severity).toBe('high');
  });
});

// ─── 3F: Layer Violations ──────────────────────────────────────────────────

describe('detectLayerViolations', () => {
  it('returns empty with no layer config', () => {
    expect(detectLayerViolations(emptyState(), [])).toEqual([]);
  });

  it('returns empty when imports respect layer order', () => {
    const state = emptyState();
    // layers: ui -> service -> repository
    addEdge(state, 'src/ui/page.ts', 'src/service/api.ts');
    addEdge(state, 'src/service/api.ts', 'src/repository/db.ts');
    const findings = detectLayerViolations(state, ['ui', 'service', 'repository']);
    expect(findings).toEqual([]);
  });

  it('detects backward layer import', () => {
    const state = emptyState();
    // repository imports from ui — violation!
    addEdge(state, 'src/repository/db.ts', 'src/ui/page.ts');
    const findings = detectLayerViolations(state, ['ui', 'service', 'repository']);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('layer-violation');
    expect(findings[0].severity).toBe('high');
  });

  it('ignores files not in any layer', () => {
    const state = emptyState();
    addEdge(state, 'src/utils/helper.ts', 'src/ui/page.ts');
    const findings = detectLayerViolations(state, ['ui', 'service', 'repository']);
    expect(findings).toEqual([]);
  });

  it('detects multiple violations', () => {
    const state = emptyState();
    addEdge(state, 'src/repository/db.ts', 'src/ui/page.ts');
    addEdge(state, 'src/service/api.ts', 'src/ui/button.ts');
    const findings = detectLayerViolations(state, ['ui', 'service', 'repository']);
    expect(findings.length).toBe(2);
  });
});

// ─── Low Cohesion (LCOM) ───────────────────────────────────────────────────

describe('detectLowCohesion', () => {
  it('returns empty when file has few exports', () => {
    const state = emptyState();
    state.files.add('src/small.ts');
    state.declaredExportsByFile.set('src/small.ts', [
      { name: 'a', kind: 'value' },
      { name: 'b', kind: 'value' },
    ]);
    expect(detectLowCohesion(state)).toEqual([]);
  });

  it('returns empty for entrypoint files', () => {
    const state = emptyState();
    state.files.add('src/index.ts');
    state.declaredExportsByFile.set('src/index.ts', [
      { name: 'a', kind: 'value' }, { name: 'b', kind: 'value' },
      { name: 'c', kind: 'value' }, { name: 'd', kind: 'value' },
    ]);
    expect(detectLowCohesion(state)).toEqual([]);
  });

  it('returns empty when all consumers import the same symbols', () => {
    const state = emptyState();
    state.files.add('src/lib.ts');
    state.files.add('src/a.ts');
    state.files.add('src/b.ts');
    state.declaredExportsByFile.set('src/lib.ts', [
      { name: 'x', kind: 'value' }, { name: 'y', kind: 'value' },
      { name: 'z', kind: 'value' }, { name: 'w', kind: 'value' },
    ]);
    state.importedSymbolsByFile.set('src/a.ts', [
      { sourceModule: './lib', resolvedModule: 'src/lib.ts', importedName: 'x', localName: 'x', isTypeOnly: false },
      { sourceModule: './lib', resolvedModule: 'src/lib.ts', importedName: 'y', localName: 'y', isTypeOnly: false },
    ]);
    state.importedSymbolsByFile.set('src/b.ts', [
      { sourceModule: './lib', resolvedModule: 'src/lib.ts', importedName: 'x', localName: 'x', isTypeOnly: false },
      { sourceModule: './lib', resolvedModule: 'src/lib.ts', importedName: 'y', localName: 'y', isTypeOnly: false },
    ]);
    expect(detectLowCohesion(state)).toEqual([]);
  });

  it('detects low cohesion when consumers import non-overlapping symbols', () => {
    const state = emptyState();
    state.files.add('src/junkdrawer.ts');
    state.files.add('src/a.ts');
    state.files.add('src/b.ts');
    state.declaredExportsByFile.set('src/junkdrawer.ts', [
      { name: 'alpha', kind: 'value' }, { name: 'beta', kind: 'value' },
      { name: 'gamma', kind: 'value' }, { name: 'delta', kind: 'value' },
    ]);
    state.importedSymbolsByFile.set('src/a.ts', [
      { sourceModule: './junkdrawer', resolvedModule: 'src/junkdrawer.ts', importedName: 'alpha', localName: 'alpha', isTypeOnly: false },
      { sourceModule: './junkdrawer', resolvedModule: 'src/junkdrawer.ts', importedName: 'beta', localName: 'beta', isTypeOnly: false },
    ]);
    state.importedSymbolsByFile.set('src/b.ts', [
      { sourceModule: './junkdrawer', resolvedModule: 'src/junkdrawer.ts', importedName: 'gamma', localName: 'gamma', isTypeOnly: false },
      { sourceModule: './junkdrawer', resolvedModule: 'src/junkdrawer.ts', importedName: 'delta', localName: 'delta', isTypeOnly: false },
    ]);
    const findings = detectLowCohesion(state);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('low-cohesion');
    expect(findings[0].file).toBe('src/junkdrawer.ts');
  });

  it('reports LCOM component count in reason', () => {
    const state = emptyState();
    state.files.add('src/utils.ts');
    state.files.add('src/a.ts');
    state.files.add('src/b.ts');
    state.files.add('src/c.ts');
    state.declaredExportsByFile.set('src/utils.ts', [
      { name: 'e1', kind: 'value' }, { name: 'e2', kind: 'value' },
      { name: 'e3', kind: 'value' }, { name: 'e4', kind: 'value' },
    ]);
    state.importedSymbolsByFile.set('src/a.ts', [
      { sourceModule: './utils', resolvedModule: 'src/utils.ts', importedName: 'e1', localName: 'e1', isTypeOnly: false },
    ]);
    state.importedSymbolsByFile.set('src/b.ts', [
      { sourceModule: './utils', resolvedModule: 'src/utils.ts', importedName: 'e2', localName: 'e2', isTypeOnly: false },
    ]);
    state.importedSymbolsByFile.set('src/c.ts', [
      { sourceModule: './utils', resolvedModule: 'src/utils.ts', importedName: 'e3', localName: 'e3', isTypeOnly: false },
    ]);
    const findings = detectLowCohesion(state);
    expect(findings.length).toBe(1);
    expect(findings[0].reason).toContain('3');
  });

  it('skips test files', () => {
    const state = emptyState();
    state.files.add('src/utils.test.ts');
    state.declaredExportsByFile.set('src/utils.test.ts', [
      { name: 'a', kind: 'value' }, { name: 'b', kind: 'value' },
      { name: 'c', kind: 'value' }, { name: 'd', kind: 'value' },
    ]);
    expect(detectLowCohesion(state)).toEqual([]);
  });
});

// ─── Hot Files (Change Risk) ───────────────────────────────────────────────

describe('computeHotFiles', () => {
  function minimalDepSummary(overrides: Partial<DependencySummary> = {}): DependencySummary {
    return {
      totalModules: 0, totalEdges: 0, unresolvedEdgeCount: 0,
      externalDependencyFiles: 0, rootsCount: 0, leavesCount: 0,
      roots: [], leaves: [], criticalModules: [], testOnlyModules: [],
      unresolvedSample: [], outgoingTop: [], inboundTop: [],
      cycles: [], criticalPaths: [], ...overrides,
    };
  }

  it('returns empty for empty input', () => {
    const result = computeHotFiles(emptyState(), minimalDepSummary(), new Map());
    expect(result).toEqual([]);
  });

  it('scores files by fan-in + complexity', () => {
    const state = emptyState();
    const hub = 'src/hub.ts';
    state.files.add(hub);
    for (let i = 0; i < 10; i++) {
      const f = `src/c${i}.ts`;
      state.files.add(f);
      addEdge(state, f, hub);
    }
    const critMap = new Map<string, FileCriticality>();
    critMap.set(hub, { file: hub, complexityRisk: 5, highComplexityFunctions: 3, functionCount: 8, flows: 20, score: 50 });
    const result = computeHotFiles(state, minimalDepSummary(), critMap);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].file).toBe(hub);
    expect(result[0].riskScore).toBeGreaterThan(0);
    expect(result[0].fanIn).toBe(10);
  });

  it('boosts score for files in cycles', () => {
    const state = emptyState();
    state.files.add('src/a.ts');
    state.files.add('src/b.ts');
    addEdge(state, 'src/a.ts', 'src/b.ts');
    addEdge(state, 'src/b.ts', 'src/a.ts');
    const depSummary = minimalDepSummary({
      cycles: [{ path: ['src/a.ts', 'src/b.ts', 'src/a.ts'], nodeCount: 2 }],
    });
    const critMap = new Map<string, FileCriticality>();
    critMap.set('src/a.ts', { file: 'src/a.ts', complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 10 });
    critMap.set('src/b.ts', { file: 'src/b.ts', complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 10 });
    const result = computeHotFiles(state, depSummary, critMap);
    expect(result.some(f => f.inCycle)).toBe(true);
  });

  it('returns files sorted by riskScore descending', () => {
    const state = emptyState();
    state.files.add('src/hot.ts');
    state.files.add('src/cold.ts');
    for (let i = 0; i < 10; i++) addEdge(state, `src/dep${i}.ts`, 'src/hot.ts');
    const critMap = new Map<string, FileCriticality>();
    critMap.set('src/hot.ts', { file: 'src/hot.ts', complexityRisk: 5, highComplexityFunctions: 3, functionCount: 10, flows: 20, score: 100 });
    critMap.set('src/cold.ts', { file: 'src/cold.ts', complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 5 });
    const result = computeHotFiles(state, minimalDepSummary(), critMap);
    if (result.length >= 2) {
      expect(result[0].riskScore).toBeGreaterThanOrEqual(result[1].riskScore);
    }
  });

  it('limits results to top 20', () => {
    const state = emptyState();
    for (let i = 0; i < 50; i++) {
      const f = `src/file${i}.ts`;
      state.files.add(f);
      addEdge(state, `src/consumer${i}.ts`, f);
    }
    const critMap = new Map<string, FileCriticality>();
    for (const f of state.files) {
      critMap.set(f, { file: f, complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 5 });
    }
    const result = computeHotFiles(state, minimalDepSummary(), critMap);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it('skips test files', () => {
    const state = emptyState();
    state.files.add('src/a.test.ts');
    for (let i = 0; i < 10; i++) addEdge(state, `src/c${i}.ts`, 'src/a.test.ts');
    const critMap = new Map<string, FileCriticality>();
    critMap.set('src/a.test.ts', { file: 'src/a.test.ts', complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 50 });
    const result = computeHotFiles(state, minimalDepSummary(), critMap);
    expect(result.some(f => f.file === 'src/a.test.ts')).toBe(false);
  });
});

// ─── buildConsumedFromModule ────────────────────────────────────────────────

describe('buildConsumedFromModule', () => {
  it('returns empty maps for no imports', () => {
    const result = buildConsumedFromModule(emptyState());
    expect(result.production.size).toBe(0);
    expect(result.test.size).toBe(0);
  });

  it('collects consumed symbols per module in production map', () => {
    const state = emptyState();
    state.importedSymbolsByFile.set('src/a.ts', [
      { sourceModule: './lib', resolvedModule: 'src/lib.ts', importedName: 'foo', localName: 'foo', isTypeOnly: false },
      { sourceModule: './lib', resolvedModule: 'src/lib.ts', importedName: 'bar', localName: 'bar', isTypeOnly: false },
    ]);
    const result = buildConsumedFromModule(state);
    expect(result.production.get('src/lib.ts')?.size).toBe(2);
    expect(result.production.get('src/lib.ts')?.has('foo')).toBe(true);
  });

  it('routes test file imports to the test map', () => {
    const state = emptyState();
    state.importedSymbolsByFile.set('src/a.test.ts', [
      { sourceModule: './lib', resolvedModule: 'src/lib.ts', importedName: 'foo', localName: 'foo', isTypeOnly: false },
    ]);
    const result = buildConsumedFromModule(state);
    expect(result.production.size).toBe(0);
    expect(result.test.get('src/lib.ts')?.has('foo')).toBe(true);
  });

  it('collects symbols from re-exports in production map', () => {
    const state = emptyState();
    state.reExportsByFile.set('src/barrel.ts', [
      { sourceModule: './lib', resolvedModule: 'src/lib.ts', exportedAs: 'X', importedName: 'X', isStar: false, isTypeOnly: false },
    ]);
    const result = buildConsumedFromModule(state);
    expect(result.production.get('src/lib.ts')?.has('X')).toBe(true);
  });

  it('skips re-exports with unresolved target', () => {
    const state = emptyState();
    state.reExportsByFile.set('src/barrel.ts', [
      { sourceModule: './unresolved', exportedAs: 'Y', importedName: 'Y', isStar: false, isTypeOnly: false },
    ]);
    const result = buildConsumedFromModule(state);
    expect(result.production.size).toBe(0);
  });
});

// ─── detectDuplicateFunctionBodies ──────────────────────────────────────────

describe('detectDuplicateFunctionBodies', () => {
  function makeDupGroup(overrides: Partial<DuplicateGroup> = {}): DuplicateGroup {
    return {
      hash: 'abc123',
      signature: 'handleError',
      kind: 'ArrowFunction',
      occurrences: 3,
      filesCount: 2,
      locations: [
        { kind: 'ArrowFunction', name: 'handleError', nameHint: 'handleError', file: 'src/a.ts', lineStart: 1, lineEnd: 10, columnStart: 1, columnEnd: 1, statementCount: 8, complexity: 3, maxBranchDepth: 1, maxLoopDepth: 0, returns: 1, awaits: 0, calls: 2, loops: 0, lengthLines: 10, cognitiveComplexity: 2, hash: 'abc', metrics: { complexity: 3, maxBranchDepth: 1, maxLoopDepth: 0, returns: 1, awaits: 0, calls: 2, loops: 0 } },
        { kind: 'ArrowFunction', name: 'handleError', nameHint: 'handleError', file: 'src/b.ts', lineStart: 5, lineEnd: 15, columnStart: 1, columnEnd: 1, statementCount: 8, complexity: 3, maxBranchDepth: 1, maxLoopDepth: 0, returns: 1, awaits: 0, calls: 2, loops: 0, lengthLines: 10, cognitiveComplexity: 2, hash: 'abc', metrics: { complexity: 3, maxBranchDepth: 1, maxLoopDepth: 0, returns: 1, awaits: 0, calls: 2, loops: 0 } },
      ],
      ...overrides,
    };
  }

  it('returns empty for empty input', () => {
    expect(detectDuplicateFunctionBodies([])).toEqual([]);
  });

  it('creates finding for duplicate group', () => {
    const findings = detectDuplicateFunctionBodies([makeDupGroup()]);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('duplicate-function-body');
    expect(findings[0].title).toContain('handleError');
  });

  it('assigns low severity for 2 occurrences', () => {
    const findings = detectDuplicateFunctionBodies([makeDupGroup({ occurrences: 2 })]);
    expect(findings[0].severity).toBe('low');
  });

  it('assigns medium severity for 3-5 occurrences', () => {
    const findings = detectDuplicateFunctionBodies([makeDupGroup({ occurrences: 4 })]);
    expect(findings[0].severity).toBe('medium');
  });

  it('assigns high severity for 6+ occurrences', () => {
    const findings = detectDuplicateFunctionBodies([makeDupGroup({ occurrences: 7 })]);
    expect(findings[0].severity).toBe('high');
  });

  it('includes all file locations in files field', () => {
    const findings = detectDuplicateFunctionBodies([makeDupGroup()]);
    expect(findings[0].files.length).toBe(2);
  });

  it('uses plural "files" in reason when filesCount > 1', () => {
    const findings = detectDuplicateFunctionBodies([makeDupGroup({ filesCount: 3, occurrences: 4 })]);
    expect(findings[0].reason).toContain('3 file');
    expect(findings[0].reason).toContain('s');
  });
});

// ─── detectDuplicateFlowStructures ──────────────────────────────────────────

describe('detectDuplicateFlowStructures', () => {
  function makeFlowGroup(overrides: Partial<RedundantFlowGroup> = {}): RedundantFlowGroup {
    return {
      kind: 'IfStatement',
      occurrences: 5,
      filesCount: 3,
      locations: [
        { kind: 'IfStatement', file: 'src/a.ts', lineStart: 10, lineEnd: 20, columnStart: 1, columnEnd: 1, statementCount: 5, hash: 'x' },
        { kind: 'IfStatement', file: 'src/b.ts', lineStart: 15, lineEnd: 25, columnStart: 1, columnEnd: 1, statementCount: 5, hash: 'x' },
      ],
      ...overrides,
    };
  }

  it('returns empty for empty input', () => {
    expect(detectDuplicateFlowStructures([], 3)).toEqual([]);
  });

  it('skips groups below threshold', () => {
    const findings = detectDuplicateFlowStructures([makeFlowGroup({ occurrences: 2 })], 3);
    expect(findings).toEqual([]);
  });

  it('creates finding above threshold', () => {
    const findings = detectDuplicateFlowStructures([makeFlowGroup()], 3);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('duplicate-flow-structure');
  });

  it('assigns high severity for 10+ occurrences', () => {
    const findings = detectDuplicateFlowStructures([makeFlowGroup({ occurrences: 12 })], 3);
    expect(findings[0].severity).toBe('high');
  });

  it('assigns medium severity for fewer occurrences', () => {
    const findings = detectDuplicateFlowStructures([makeFlowGroup({ occurrences: 5 })], 3);
    expect(findings[0].severity).toBe('medium');
  });
});

// ─── detectFunctionOptimization ─────────────────────────────────────────────

describe('detectFunctionOptimization', () => {
  it('returns empty for simple functions', () => {
    const files = [makeFileEntry({ functions: [makeFn({ complexity: 5, maxBranchDepth: 2, maxLoopDepth: 1, statementCount: 10 })] })];
    expect(detectFunctionOptimization(files, 30)).toEqual([]);
  });

  it('flags high complexity', () => {
    const files = [makeFileEntry({ functions: [makeFn({ complexity: 35, name: 'complexFn' })] })];
    const findings = detectFunctionOptimization(files, 30);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('high');
  });

  it('flags deep branch nesting', () => {
    const files = [makeFileEntry({ functions: [makeFn({ maxBranchDepth: 8, name: 'deepFn' })] })];
    const findings = detectFunctionOptimization(files, 30);
    expect(findings.length).toBe(1);
    expect(findings[0].reason).toContain('Branch depth');
  });

  it('flags deep loop nesting', () => {
    const files = [makeFileEntry({ functions: [makeFn({ maxLoopDepth: 5, name: 'loopFn' })] })];
    const findings = detectFunctionOptimization(files, 30);
    expect(findings.length).toBe(1);
    expect(findings[0].reason).toContain('Nested loops');
  });

  it('flags large function bodies', () => {
    const files = [makeFileEntry({ functions: [makeFn({ statementCount: 30, name: 'bigFn' })] })];
    const findings = detectFunctionOptimization(files, 30);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('medium');
  });

  it('combines multiple alerts', () => {
    const files = [makeFileEntry({ functions: [makeFn({ complexity: 40, maxBranchDepth: 8, name: 'badFn' })] })];
    const findings = detectFunctionOptimization(files, 30);
    expect(findings[0].reason).toContain('Cyclomatic');
    expect(findings[0].reason).toContain('Branch depth');
  });
});

// ─── detectTestOnlyModules ──────────────────────────────────────────────────

describe('detectTestOnlyModules', () => {
  it('returns empty when no test-only modules', () => {
    expect(detectTestOnlyModules(minimalDepSummary())).toEqual([]);
  });

  it('creates finding for test-only module', () => {
    const summary = minimalDepSummary({
      testOnlyModules: [{
        file: 'src/test-helper.ts', outboundCount: 0, inboundCount: 1,
        inboundFromProduction: 0, inboundFromTests: 1,
        externalDependencyCount: 0, unresolvedDependencyCount: 0,
      }],
    });
    const findings = detectTestOnlyModules(summary);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('dependency-test-only');
    expect(findings[0].severity).toBe('medium');
  });

  it('limits to 25 findings', () => {
    const modules = Array.from({ length: 30 }, (_, i) => ({
      file: `src/helper${i}.ts`, outboundCount: 0, inboundCount: 1,
      inboundFromProduction: 0, inboundFromTests: 1,
      externalDependencyCount: 0, unresolvedDependencyCount: 0,
    }));
    const findings = detectTestOnlyModules(minimalDepSummary({ testOnlyModules: modules }));
    expect(findings.length).toBe(25);
  });
});

// ─── detectDependencyCycles (architecture detector) ─────────────────────────

describe('detectDependencyCycles (detector)', () => {
  it('returns empty for no cycles', () => {
    expect(detectDependencyCycles(minimalDepSummary(), emptyState())).toEqual([]);
  });

  it('creates finding per cycle', () => {
    const state = emptyState();
    state.files.add('a.ts');
    state.files.add('b.ts');
    const summary = minimalDepSummary({
      cycles: [{ path: ['a.ts', 'b.ts', 'a.ts'], nodeCount: 2 }],
    });
    const findings = detectDependencyCycles(summary, state);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('dependency-cycle');
    expect(findings[0].severity).toBe('high');
  });

  it('limits to 15 cycle findings', () => {
    const cycles = Array.from({ length: 20 }, (_, i) => ({
      path: [`src/a${i}.ts`, `src/b${i}.ts`, `src/a${i}.ts`], nodeCount: 2,
    }));
    const findings = detectDependencyCycles(minimalDepSummary({ cycles }), emptyState());
    expect(findings.length).toBe(15);
  });
});

// ─── detectCriticalPaths (architecture detector) ────────────────────────────

describe('detectCriticalPaths (detector)', () => {
  it('returns empty for no critical paths', () => {
    expect(detectCriticalPaths(minimalDepSummary(), emptyState(), 30)).toEqual([]);
  });

  it('creates finding for high-score path', () => {
    const state = emptyState();
    const summary = minimalDepSummary({
      criticalPaths: [{
        start: 'a.ts', path: ['a.ts', 'b.ts', 'c.ts'],
        score: 300, length: 3, containsCycle: false,
      }],
    });
    const findings = detectCriticalPaths(summary, state, 30);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('dependency-critical-path');
  });

  it('skips paths below score threshold', () => {
    const summary = minimalDepSummary({
      criticalPaths: [{
        start: 'a.ts', path: ['a.ts', 'b.ts'],
        score: 10, length: 2, containsCycle: false,
      }],
    });
    const findings = detectCriticalPaths(summary, emptyState(), 30);
    expect(findings).toEqual([]);
  });

  it('assigns critical severity for very high scores', () => {
    const summary = minimalDepSummary({
      criticalPaths: [{
        start: 'a.ts', path: ['a.ts', 'b.ts'],
        score: 500, length: 2, containsCycle: false,
      }],
    });
    const findings = detectCriticalPaths(summary, emptyState(), 30);
    expect(findings[0].severity).toBe('critical');
  });
});

// ─── mergeOverlappingChains ─────────────────────────────────────────────────

describe('mergeOverlappingChains', () => {
  type FindingDraft = Omit<import('./types.js').Finding, 'id'>;

  const makeChainFinding = (file: string, files: string[]): FindingDraft => ({
    severity: 'high',
    category: 'dependency-critical-path',
    file,
    lineStart: 1,
    lineEnd: 1,
    title: `Critical dependency chain risk: ${files.length} files`,
    reason: `Chain from ${file}.`,
    files,
    suggestedFix: { strategy: 'test', steps: ['step1'] },
  });

  it('returns input unchanged when 0 or 1 findings', () => {
    expect(mergeOverlappingChains([])).toEqual([]);
    const single = [makeChainFinding('a.ts', ['a.ts', 'b.ts'])];
    expect(mergeOverlappingChains(single)).toEqual(single);
  });

  it('merges chains with >80% overlap', () => {
    // Chain 1: a,b,c,d,e  Chain 2: x,b,c,d,e  (overlap: 4/6 = 0.67? Let's use more overlap)
    // Chain 1: a,b,c,d,e  Chain 2: f,b,c,d,e  (intersection=4, union=6, overlap=0.67 — below 0.8)
    // Use chains with higher overlap:
    // Chain 1: a,b,c,d,e  Chain 2: x,a,b,c,d,e (intersection=5, union=6, overlap=0.83)
    // intersection: {a,b,c,d} = 4, union: {entry1,entry2,a,b,c,d} = 6, overlap = 4/6 = 0.67 — NOT enough
    // Let's add more shared files
    // intersection: {a,b,c,d,e} = 5, union: {entry1,entry2,a,b,c,d,e} = 7, overlap = 5/7 = 0.71 — still below
    // Need 80%: 10 shared, 2 unique = 10/12 = 0.83
    const shared = Array.from({ length: 10 }, (_, i) => `shared-${i}.ts`);
    const chain1 = makeChainFinding('e1.ts', ['e1.ts', ...shared]);
    const chain2 = makeChainFinding('e2.ts', ['e2.ts', ...shared]);
    // intersection=10, union=12, overlap=10/12=0.833

    const result = mergeOverlappingChains([chain1, chain2]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain('2 entry points');
    expect(result[0].reason).toContain('Also reached from: e2.ts');
    expect(result[0].files.length).toBeGreaterThanOrEqual(11);
  });

  it('does NOT merge chains with <80% overlap', () => {
    const f1 = makeChainFinding('a.ts', ['a.ts', 'shared.ts']);
    const f2 = makeChainFinding('b.ts', ['b.ts', 'other.ts']);
    // intersection=0, union=4, overlap=0

    const result = mergeOverlappingChains([f1, f2]);
    expect(result).toHaveLength(2);
  });

  it('merges multiple chains into one when overlap stays above threshold', () => {
    // Use 20 shared files so even after accumulating entry points the Jaccard stays above 0.8
    // After merging all 3: union = 3 entries + 20 shared = 23, intersection with each new = 20/23 = 0.87 > 0.8
    const shared = Array.from({ length: 20 }, (_, i) => `m${i}.ts`);
    const chains = Array.from({ length: 3 }, (_, i) =>
      makeChainFinding(`entry-${i}.ts`, [`entry-${i}.ts`, ...shared])
    );
    const result = mergeOverlappingChains(chains);
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain('3 entry points');
  });

  it('keeps non-overlapping chains separate while merging overlapping ones', () => {
    const shared = Array.from({ length: 10 }, (_, i) => `s${i}.ts`);
    const overlap1 = makeChainFinding('o1.ts', ['o1.ts', ...shared]);
    const overlap2 = makeChainFinding('o2.ts', ['o2.ts', ...shared]);
    const distinct = makeChainFinding('d.ts', ['d.ts', 'unique1.ts', 'unique2.ts']);

    const result = mergeOverlappingChains([overlap1, overlap2, distinct]);
    expect(result).toHaveLength(2);
    expect(result.find(f => f.title.includes('entry points'))).toBeDefined();
    expect(result.find(f => f.file === 'd.ts')).toBeDefined();
  });
});

// ─── detectCriticalPaths — computed suggestedFix & chain merging ─────────────

describe('detectCriticalPaths — computed fix & merging', () => {
  it('names the highest-fan-out module in suggestedFix.strategy', () => {
    const state = emptyState();
    addEdge(state, 'a.ts', 'hub.ts');
    addEdge(state, 'hub.ts', 'c.ts');
    addEdge(state, 'hub.ts', 'd.ts');
    addEdge(state, 'hub.ts', 'e.ts');
    const summary = minimalDepSummary({
      criticalPaths: [{
        start: 'a.ts', path: ['a.ts', 'hub.ts', 'c.ts'],
        score: 300, length: 3, containsCycle: false,
      }],
    });
    const findings = detectCriticalPaths(summary, state, 30);
    expect(findings.length).toBe(1);
    expect(findings[0].suggestedFix.strategy).toContain('hub.ts');
    expect(findings[0].suggestedFix.strategy).toContain('fan-out: 3');
    expect(findings[0].suggestedFix.steps[0]).toContain('hub.ts');
  });

  it('uses first module as hotspot when all have zero fan-out', () => {
    const state = emptyState();
    state.files.add('x.ts');
    state.files.add('y.ts');
    const summary = minimalDepSummary({
      criticalPaths: [{
        start: 'x.ts', path: ['x.ts', 'y.ts'],
        score: 300, length: 2, containsCycle: false,
      }],
    });
    const findings = detectCriticalPaths(summary, state, 30);
    expect(findings[0].suggestedFix.strategy).toContain('x.ts');
    expect(findings[0].suggestedFix.strategy).toContain('fan-out: 0');
  });

  it('includes fan-in in the hotspot strategy', () => {
    const state = emptyState();
    addEdge(state, 'caller1.ts', 'hub.ts');
    addEdge(state, 'caller2.ts', 'hub.ts');
    addEdge(state, 'hub.ts', 'dep.ts');
    addEdge(state, 'hub.ts', 'dep2.ts');
    addEdge(state, 'hub.ts', 'dep3.ts');
    const summary = minimalDepSummary({
      criticalPaths: [{
        start: 'caller1.ts', path: ['caller1.ts', 'hub.ts', 'dep.ts'],
        score: 300, length: 3, containsCycle: false,
      }],
    });
    const findings = detectCriticalPaths(summary, state, 30);
    expect(findings[0].suggestedFix.strategy).toContain('fan-in: 2');
  });

  it('merges overlapping chain findings', () => {
    const state = emptyState();
    const shared = Array.from({ length: 10 }, (_, i) => `m${i}.ts`);
    for (let i = 0; i < shared.length - 1; i++) {
      addEdge(state, shared[i], shared[i + 1]);
    }
    addEdge(state, 'e1.ts', shared[0]);
    addEdge(state, 'e2.ts', shared[0]);

    const summary = minimalDepSummary({
      criticalPaths: [
        { start: 'e1.ts', path: ['e1.ts', ...shared], score: 300, length: shared.length + 1, containsCycle: false },
        { start: 'e2.ts', path: ['e2.ts', ...shared], score: 300, length: shared.length + 1, containsCycle: false },
      ],
    });
    const findings = detectCriticalPaths(summary, state, 30);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain('entry points');
  });
});

// ─── detectDeadFiles ────────────────────────────────────────────────────────

describe('detectDeadFiles', () => {
  it('returns empty when no dead files', () => {
    const state = emptyState();
    addEdge(state, 'src/a.ts', 'src/b.ts');
    expect(detectDeadFiles(minimalDepSummary({ roots: ['src/a.ts'] }), state)).toEqual([]);
  });

  it('flags root file with zero outgoing', () => {
    const state = emptyState();
    state.files.add('src/dead.ts');
    const findings = detectDeadFiles(minimalDepSummary({ roots: ['src/dead.ts'] }), state);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('dead-file');
  });

  it('skips entrypoints', () => {
    const state = emptyState();
    state.files.add('src/index.ts');
    const findings = detectDeadFiles(minimalDepSummary({ roots: ['src/index.ts'] }), state);
    expect(findings).toEqual([]);
  });

  it('skips test files', () => {
    const state = emptyState();
    state.files.add('src/foo.test.ts');
    const findings = detectDeadFiles(minimalDepSummary({ roots: ['src/foo.test.ts'] }), state);
    expect(findings).toEqual([]);
  });

  it('skips roots with outgoing dependencies', () => {
    const state = emptyState();
    addEdge(state, 'src/root.ts', 'src/dep.ts');
    const findings = detectDeadFiles(minimalDepSummary({ roots: ['src/root.ts'] }), state);
    expect(findings).toEqual([]);
  });
});

// ─── detectDeadExports ──────────────────────────────────────────────────────

describe('detectDeadExports', () => {
  it('returns empty when all exports consumed', () => {
    const state = emptyState();
    state.files.add('src/lib.ts');
    state.declaredExportsByFile.set('src/lib.ts', [{ name: 'foo', kind: 'value' }]);
    const consumed = new Map([['src/lib.ts', new Set(['foo'])]]);
    expect(detectDeadExports(state, consumed)).toEqual([]);
  });

  it('flags unused exports', () => {
    const state = emptyState();
    state.files.add('src/lib.ts');
    state.declaredExportsByFile.set('src/lib.ts', [
      { name: 'used', kind: 'value' },
      { name: 'dead', kind: 'value', lineStart: 10 },
    ]);
    const consumed = new Map([['src/lib.ts', new Set(['used'])]]);
    const findings = detectDeadExports(state, consumed);
    expect(findings.length).toBe(1);
    expect(findings[0].title).toContain('dead');
  });

  it('assigns medium severity for type exports', () => {
    const state = emptyState();
    state.files.add('src/lib.ts');
    state.declaredExportsByFile.set('src/lib.ts', [{ name: 'MyType', kind: 'type' }]);
    const findings = detectDeadExports(state, new Map());
    expect(findings[0].severity).toBe('medium');
  });

  it('assigns high severity for value exports', () => {
    const state = emptyState();
    state.files.add('src/lib.ts');
    state.declaredExportsByFile.set('src/lib.ts', [{ name: 'myFn', kind: 'value' }]);
    const findings = detectDeadExports(state, new Map());
    expect(findings[0].severity).toBe('high');
  });

  it('skips namespace-imported modules', () => {
    const state = emptyState();
    state.files.add('src/lib.ts');
    state.declaredExportsByFile.set('src/lib.ts', [{ name: 'foo', kind: 'value' }]);
    const consumed = new Map([['src/lib.ts', new Set(['*'])]]);
    expect(detectDeadExports(state, consumed)).toEqual([]);
  });
});

// ─── detectDeadReExports ────────────────────────────────────────────────────

describe('detectDeadReExports', () => {
  it('returns empty for consumed re-exports', () => {
    const state = emptyState();
    state.reExportsByFile.set('src/index.ts', [
      { sourceModule: './a', resolvedModule: 'src/a.ts', exportedAs: 'X', importedName: 'X', isStar: false, isTypeOnly: false },
    ]);
    const consumed = new Map([['src/index.ts', new Set(['X'])]]);
    expect(detectDeadReExports(state, consumed)).toEqual([]);
  });

  it('flags unused re-exports', () => {
    const state = emptyState();
    state.reExportsByFile.set('src/index.ts', [
      { sourceModule: './a', resolvedModule: 'src/a.ts', exportedAs: 'Dead', importedName: 'Dead', isStar: false, isTypeOnly: false },
    ]);
    const findings = detectDeadReExports(state, new Map());
    expect(findings.some(f => f.category === 'dead-re-export')).toBe(true);
  });

  it('detects duplicate re-export sources', () => {
    const state = emptyState();
    state.reExportsByFile.set('src/barrel.ts', [
      { sourceModule: './a', resolvedModule: 'src/a.ts', exportedAs: 'Foo', importedName: 'Foo', isStar: false, isTypeOnly: false },
      { sourceModule: './b', resolvedModule: 'src/b.ts', exportedAs: 'Foo', importedName: 'Foo', isStar: false, isTypeOnly: false },
    ]);
    const consumed = new Map([['src/barrel.ts', new Set(['Foo'])]]);
    const findings = detectDeadReExports(state, consumed);
    expect(findings.some(f => f.category === 're-export-duplication')).toBe(true);
  });

  it('detects shadowed re-exports', () => {
    const state = emptyState();
    state.declaredExportsByFile.set('src/barrel.ts', [{ name: 'Conflict', kind: 'value' }]);
    state.reExportsByFile.set('src/barrel.ts', [
      { sourceModule: './a', resolvedModule: 'src/a.ts', exportedAs: 'Conflict', importedName: 'Conflict', isStar: false, isTypeOnly: false },
    ]);
    const consumed = new Map([['src/barrel.ts', new Set(['Conflict'])]]);
    const findings = detectDeadReExports(state, consumed);
    expect(findings.some(f => f.category === 're-export-shadowed')).toBe(true);
  });
});

// ─── detectExcessiveParameters ──────────────────────────────────────────────

describe('detectExcessiveParameters', () => {
  it('returns empty for functions within threshold', () => {
    const files = [makeFileEntry({ functions: [makeFn({ params: 3 })] })];
    expect(detectExcessiveParameters(files, 5)).toEqual([]);
  });

  it('flags functions exceeding threshold', () => {
    const files = [makeFileEntry({ functions: [makeFn({ params: 7, name: 'manyArgs' })] })];
    const findings = detectExcessiveParameters(files, 5);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('excessive-parameters');
    expect(findings[0].title).toContain('manyArgs');
  });

  it('assigns high severity for >7 params', () => {
    const files = [makeFileEntry({ functions: [makeFn({ params: 9 })] })];
    const findings = detectExcessiveParameters(files, 5);
    expect(findings[0].severity).toBe('high');
  });

  it('assigns medium severity for 6-7 params', () => {
    const files = [makeFileEntry({ functions: [makeFn({ params: 6 })] })];
    const findings = detectExcessiveParameters(files, 5);
    expect(findings[0].severity).toBe('medium');
  });

  it('skips functions with no param count', () => {
    const files = [makeFileEntry({ functions: [makeFn()] })];
    expect(detectExcessiveParameters(files, 5)).toEqual([]);
  });

  it('skips test files', () => {
    const files = [makeFileEntry({ file: 'src/a.test.ts', functions: [makeFn({ params: 10 })] })];
    expect(detectExcessiveParameters(files, 5)).toEqual([]);
  });
});

// ─── detectEmptyCatchBlocks ─────────────────────────────────────────────────

describe('detectEmptyCatchBlocks', () => {
  it('returns empty when no empty catches', () => {
    const files = [makeFileEntry()];
    expect(detectEmptyCatchBlocks(files)).toEqual([]);
  });

  it('flags empty catch blocks', () => {
    const loc: CodeLocation = { file: 'src/file.ts', lineStart: 10, lineEnd: 12 };
    const files = [makeFileEntry({ emptyCatches: [loc] })];
    const findings = detectEmptyCatchBlocks(files);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('empty-catch');
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].lineStart).toBe(10);
  });

  it('creates finding per empty catch', () => {
    const locs: CodeLocation[] = [
      { file: 'src/file.ts', lineStart: 10, lineEnd: 12 },
      { file: 'src/file.ts', lineStart: 30, lineEnd: 32 },
    ];
    const files = [makeFileEntry({ emptyCatches: locs })];
    const findings = detectEmptyCatchBlocks(files);
    expect(findings.length).toBe(2);
  });

  it('skips test files', () => {
    const loc: CodeLocation = { file: 'src/a.test.ts', lineStart: 10, lineEnd: 12 };
    const files = [makeFileEntry({ file: 'src/a.test.ts', emptyCatches: [loc] })];
    expect(detectEmptyCatchBlocks(files)).toEqual([]);
  });
});

// ─── detectSwitchNoDefault ──────────────────────────────────────────────────

describe('detectSwitchNoDefault', () => {
  it('returns empty when no switches without default', () => {
    const files = [makeFileEntry()];
    expect(detectSwitchNoDefault(files)).toEqual([]);
  });

  it('flags switch without default', () => {
    const loc: CodeLocation = { file: 'src/file.ts', lineStart: 15, lineEnd: 30 };
    const files = [makeFileEntry({ switchesWithoutDefault: [loc] })];
    const findings = detectSwitchNoDefault(files);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('switch-no-default');
    expect(findings[0].severity).toBe('low');
  });

  it('skips test files', () => {
    const loc: CodeLocation = { file: 'src/a.test.ts', lineStart: 15, lineEnd: 30 };
    const files = [makeFileEntry({ file: 'src/a.test.ts', switchesWithoutDefault: [loc] })];
    expect(detectSwitchNoDefault(files)).toEqual([]);
  });
});

// ─── detectUnsafeAny ────────────────────────────────────────────────────────

describe('detectUnsafeAny', () => {
  it('returns empty for files below threshold', () => {
    const files = [makeFileEntry({ anyCount: 3 })];
    expect(detectUnsafeAny(files, 5)).toEqual([]);
  });

  it('flags files exceeding threshold', () => {
    const files = [makeFileEntry({ anyCount: 8 })];
    const findings = detectUnsafeAny(files, 5);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('unsafe-any');
  });

  it('assigns high severity for >10 any usages', () => {
    const files = [makeFileEntry({ anyCount: 15 })];
    const findings = detectUnsafeAny(files, 5);
    expect(findings[0].severity).toBe('high');
  });

  it('assigns medium severity for 6-10 any usages', () => {
    const files = [makeFileEntry({ anyCount: 7 })];
    const findings = detectUnsafeAny(files, 5);
    expect(findings[0].severity).toBe('medium');
  });

  it('skips files with no anyCount', () => {
    const files = [makeFileEntry()];
    expect(detectUnsafeAny(files, 5)).toEqual([]);
  });
});

// ─── detectHighHalsteadEffort ───────────────────────────────────────────────

describe('detectHighHalsteadEffort', () => {
  it('returns empty for functions below thresholds', () => {
    const files = [makeFileEntry({ functions: [makeFn({
      halstead: { operators: 10, operands: 10, distinctOperators: 5, distinctOperands: 5, vocabulary: 10, length: 20, volume: 100, difficulty: 5, effort: 500, time: 28, estimatedBugs: 0.03 },
    })] })];
    expect(detectHighHalsteadEffort(files)).toEqual([]);
  });

  it('flags functions with high effort', () => {
    const files = [makeFileEntry({ functions: [makeFn({
      name: 'heavyFn',
      halstead: { operators: 100, operands: 200, distinctOperators: 30, distinctOperands: 50, vocabulary: 80, length: 300, volume: 50000, difficulty: 20, effort: 1_000_000, time: 55556, estimatedBugs: 1.5 },
    })] })];
    const findings = detectHighHalsteadEffort(files);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('halstead-effort');
    expect(findings[0].title).toContain('heavyFn');
  });

  it('flags functions with high estimated bugs', () => {
    const files = [makeFileEntry({ functions: [makeFn({
      halstead: { operators: 50, operands: 100, distinctOperators: 15, distinctOperands: 25, vocabulary: 40, length: 150, volume: 10000, difficulty: 10, effort: 100_000, time: 5556, estimatedBugs: 3.5 },
    })] })];
    const findings = detectHighHalsteadEffort(files, 500_000, 2.0);
    expect(findings.length).toBe(1);
    expect(findings[0].reason).toContain('estimatedBugs');
  });

  it('skips functions without halstead data', () => {
    const files = [makeFileEntry({ functions: [makeFn()] })];
    expect(detectHighHalsteadEffort(files)).toEqual([]);
  });
});

// ─── detectLowMaintainability ───────────────────────────────────────────────

describe('detectLowMaintainability', () => {
  it('returns empty for functions above threshold', () => {
    const files = [makeFileEntry({ functions: [makeFn({ maintainabilityIndex: 50 })] })];
    expect(detectLowMaintainability(files, 20)).toEqual([]);
  });

  it('flags functions below threshold', () => {
    const files = [makeFileEntry({ functions: [makeFn({ maintainabilityIndex: 15, name: 'hardFn' })] })];
    const findings = detectLowMaintainability(files, 20);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('low-maintainability');
    expect(findings[0].title).toContain('hardFn');
  });

  it('assigns critical severity for MI < 10', () => {
    const files = [makeFileEntry({ functions: [makeFn({ maintainabilityIndex: 5 })] })];
    const findings = detectLowMaintainability(files, 20);
    expect(findings[0].severity).toBe('critical');
  });

  it('assigns high severity for MI 10-19', () => {
    const files = [makeFileEntry({ functions: [makeFn({ maintainabilityIndex: 15 })] })];
    const findings = detectLowMaintainability(files, 20);
    expect(findings[0].severity).toBe('high');
  });

  it('skips functions without maintainability index', () => {
    const files = [makeFileEntry({ functions: [makeFn()] })];
    expect(detectLowMaintainability(files, 20)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NEW ARCHITECTURE DETECTORS
// ═══════════════════════════════════════════════════════════════════════════

// ─── computeAbstractness ────────────────────────────────────────────────────

describe('computeAbstractness', () => {
  it('returns 0 for file with no type exports', () => {
    expect(computeAbstractness([
      { name: 'foo', kind: 'value' },
      { name: 'bar', kind: 'value' },
    ])).toBe(0);
  });

  it('returns 1 for file with only type exports', () => {
    expect(computeAbstractness([
      { name: 'Foo', kind: 'type' },
      { name: 'Bar', kind: 'type' },
    ])).toBe(1);
  });

  it('returns 0.5 for equal mix', () => {
    expect(computeAbstractness([
      { name: 'Foo', kind: 'type' },
      { name: 'foo', kind: 'value' },
    ])).toBe(0.5);
  });

  it('returns 0 for empty exports', () => {
    expect(computeAbstractness([])).toBe(0);
  });
});

// ─── detectDistanceFromMainSequence ─────────────────────────────────────────

describe('detectDistanceFromMainSequence', () => {
  it('returns empty for no files', () => {
    expect(detectDistanceFromMainSequence(emptyState())).toEqual([]);
  });

  it('flags files in Zone of Pain (concrete + stable)', () => {
    const state = emptyState();
    const hub = 'src/hub.ts';
    state.files.add(hub);
    state.declaredExportsByFile.set(hub, [
      { name: 'fn1', kind: 'value' },
      { name: 'fn2', kind: 'value' },
      { name: 'fn3', kind: 'value' },
    ]);
    for (let i = 0; i < 10; i++) {
      const f = `src/dep${i}.ts`;
      state.files.add(f);
      addEdge(state, f, hub);
    }
    const findings = detectDistanceFromMainSequence(state);
    const hubFinding = findings.find(f => f.file === hub);
    expect(hubFinding).toBeDefined();
    expect(hubFinding!.category).toBe('distance-from-main-sequence');
    expect(hubFinding!.reason).toContain('Zone of Pain');
  });

  it('does not flag files on the main sequence', () => {
    const state = emptyState();
    state.files.add('src/a.ts');
    state.files.add('src/b.ts');
    state.declaredExportsByFile.set('src/a.ts', [
      { name: 'MyType', kind: 'type' },
    ]);
    addEdge(state, 'src/b.ts', 'src/a.ts');
    const findings = detectDistanceFromMainSequence(state);
    expect(findings).toEqual([]);
  });

  it('flags files in Zone of Uselessness (abstract + unstable)', () => {
    const state = emptyState();
    const file = 'src/unused-abstractions.ts';
    state.files.add(file);
    state.declaredExportsByFile.set(file, [
      { name: 'IFoo', kind: 'type' },
      { name: 'IBar', kind: 'type' },
      { name: 'IBaz', kind: 'type' },
    ]);
    for (let i = 0; i < 8; i++) {
      const dep = `src/dep${i}.ts`;
      state.files.add(dep);
      addEdge(state, file, dep);
    }
    const findings = detectDistanceFromMainSequence(state);
    const f = findings.find(f => f.file === file);
    expect(f).toBeDefined();
    expect(f!.reason).toContain('Zone of Uselessness');
  });

  it('skips test files', () => {
    const state = emptyState();
    state.files.add('src/a.test.ts');
    state.declaredExportsByFile.set('src/a.test.ts', [{ name: 'fn', kind: 'value' }]);
    expect(detectDistanceFromMainSequence(state)).toEqual([]);
  });

  it('skips files with no exports', () => {
    const state = emptyState();
    state.files.add('src/empty.ts');
    expect(detectDistanceFromMainSequence(state)).toEqual([]);
  });
});

// ─── detectFeatureEnvy ──────────────────────────────────────────────────────

describe('detectFeatureEnvy', () => {
  it('returns empty when no envy detected', () => {
    const state = emptyState();
    state.files.add('src/a.ts');
    state.importedSymbolsByFile.set('src/a.ts', [
      { sourceModule: './b', resolvedModule: 'src/b.ts', importedName: 'x', localName: 'x', isTypeOnly: false },
      { sourceModule: './c', resolvedModule: 'src/c.ts', importedName: 'y', localName: 'y', isTypeOnly: false },
    ]);
    expect(detectFeatureEnvy(state)).toEqual([]);
  });

  it('flags file that imports many symbols from single target', () => {
    const state = emptyState();
    state.files.add('src/envious.ts');
    state.files.add('src/target.ts');
    const imports = Array.from({ length: 8 }, (_, i) => ({
      sourceModule: './target', resolvedModule: 'src/target.ts',
      importedName: `sym${i}`, localName: `sym${i}`, isTypeOnly: false,
    }));
    imports.push({
      sourceModule: './other', resolvedModule: 'src/other.ts',
      importedName: 'z', localName: 'z', isTypeOnly: false,
    });
    state.importedSymbolsByFile.set('src/envious.ts', imports);
    const findings = detectFeatureEnvy(state);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('feature-envy');
    expect(findings[0].file).toBe('src/envious.ts');
    expect(findings[0].reason).toContain('src/target.ts');
  });

  it('does not flag when imports are spread evenly', () => {
    const state = emptyState();
    state.files.add('src/balanced.ts');
    const imports = [];
    for (let m = 0; m < 5; m++) {
      for (let s = 0; s < 2; s++) {
        imports.push({
          sourceModule: `./mod${m}`, resolvedModule: `src/mod${m}.ts`,
          importedName: `fn${s}`, localName: `fn${s}`, isTypeOnly: false,
        });
      }
    }
    state.importedSymbolsByFile.set('src/balanced.ts', imports);
    expect(detectFeatureEnvy(state)).toEqual([]);
  });

  it('skips test files', () => {
    const state = emptyState();
    state.files.add('src/a.test.ts');
    const imports = Array.from({ length: 10 }, (_, i) => ({
      sourceModule: './target', resolvedModule: 'src/target.ts',
      importedName: `sym${i}`, localName: `sym${i}`, isTypeOnly: false,
    }));
    state.importedSymbolsByFile.set('src/a.test.ts', imports);
    expect(detectFeatureEnvy(state)).toEqual([]);
  });

  it('requires minimum total imports', () => {
    const state = emptyState();
    state.files.add('src/small.ts');
    state.importedSymbolsByFile.set('src/small.ts', [
      { sourceModule: './target', resolvedModule: 'src/target.ts', importedName: 'x', localName: 'x', isTypeOnly: false },
    ]);
    expect(detectFeatureEnvy(state)).toEqual([]);
  });
});

// ─── detectUntestedCriticalCode ─────────────────────────────────────────────

describe('detectUntestedCriticalCode', () => {
  it('returns empty when no hot files provided', () => {
    const state = emptyState();
    const findings = detectUntestedCriticalCode(state, [], new Map());
    expect(findings).toEqual([]);
  });

  it('flags hot file with no test imports', () => {
    const state = emptyState();
    state.files.add('src/core.ts');
    state.incomingFromTests.set('src/core.ts', new Set());
    const hotFiles = [
      { file: 'src/core.ts', riskScore: 50, fanIn: 10, fanOut: 5, complexityScore: 20, exportCount: 8, inCycle: false, onCriticalPath: true },
    ];
    const findings = detectUntestedCriticalCode(state, hotFiles, new Map());
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('untested-critical-code');
    expect(findings[0].file).toBe('src/core.ts');
    expect(findings[0].severity).toBe('high');
    expect(findings[0].tags).toContain('testing');
    expect(findings[0].tags).toContain('coverage');
  });

  it('does not flag hot file that has test imports', () => {
    const state = emptyState();
    state.files.add('src/core.ts');
    state.incomingFromTests.set('src/core.ts', new Set(['src/core.test.ts']));
    const hotFiles = [
      { file: 'src/core.ts', riskScore: 50, fanIn: 10, fanOut: 5, complexityScore: 20, exportCount: 8, inCycle: false, onCriticalPath: true },
    ];
    const findings = detectUntestedCriticalCode(state, hotFiles, new Map());
    expect(findings).toEqual([]);
  });

  it('flags critical severity for in-cycle + high risk + untested', () => {
    const state = emptyState();
    state.files.add('src/hub.ts');
    const hotFiles = [
      { file: 'src/hub.ts', riskScore: 80, fanIn: 20, fanOut: 10, complexityScore: 40, exportCount: 15, inCycle: true, onCriticalPath: true },
    ];
    const findings = detectUntestedCriticalCode(state, hotFiles, new Map());
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('critical');
  });

  it('flags high-complexity files on critical paths even if not in hotFiles list', () => {
    const state = emptyState();
    state.files.add('src/deep.ts');
    const critMap = new Map<string, FileCriticality>([
      ['src/deep.ts', { file: 'src/deep.ts', complexityRisk: 50, highComplexityFunctions: 3, functionCount: 5, flows: 2, score: 60 }],
    ]);
    const findings = detectUntestedCriticalCode(state, [], critMap);
    expect(findings.length).toBe(1);
    expect(findings[0].file).toBe('src/deep.ts');
    expect(findings[0].reason).toContain('complexity');
  });

  it('skips test files themselves', () => {
    const state = emptyState();
    state.files.add('src/core.test.ts');
    const hotFiles = [
      { file: 'src/core.test.ts', riskScore: 50, fanIn: 10, fanOut: 5, complexityScore: 20, exportCount: 8, inCycle: false, onCriticalPath: true },
    ];
    const findings = detectUntestedCriticalCode(state, hotFiles, new Map());
    expect(findings).toEqual([]);
  });

  it('deduplicates files appearing in both hotFiles and criticality map', () => {
    const state = emptyState();
    state.files.add('src/shared.ts');
    const hotFiles = [
      { file: 'src/shared.ts', riskScore: 50, fanIn: 10, fanOut: 5, complexityScore: 20, exportCount: 8, inCycle: false, onCriticalPath: false },
    ];
    const critMap = new Map<string, FileCriticality>([
      ['src/shared.ts', { file: 'src/shared.ts', complexityRisk: 50, highComplexityFunctions: 3, functionCount: 5, flows: 2, score: 60 }],
    ]);
    const findings = detectUntestedCriticalCode(state, hotFiles, critMap);
    expect(findings.length).toBe(1);
  });

  it('includes risk details in reason', () => {
    const state = emptyState();
    state.files.add('src/risky.ts');
    const hotFiles = [
      { file: 'src/risky.ts', riskScore: 60, fanIn: 15, fanOut: 8, complexityScore: 30, exportCount: 12, inCycle: true, onCriticalPath: false },
    ];
    const findings = detectUntestedCriticalCode(state, hotFiles, new Map());
    expect(findings[0].reason).toContain('risk');
    expect(findings[0].reason).toContain('60');
  });

  it('limits output to top 25 findings', () => {
    const state = emptyState();
    const hotFiles = Array.from({ length: 40 }, (_, i) => {
      const file = `src/mod${i}.ts`;
      state.files.add(file);
      return { file, riskScore: 50, fanIn: 10, fanOut: 5, complexityScore: 20, exportCount: 8, inCycle: false, onCriticalPath: true };
    });
    const findings = detectUntestedCriticalCode(state, hotFiles, new Map());
    expect(findings.length).toBeLessThanOrEqual(25);
  });
});

// ─── Tree-Shaking / Bundle Hygiene Detectors ────────────────────────────────

describe('detectNamespaceImport', () => {
  it('flags import * as X from internal module', () => {
    const state = emptyState();
    state.files.add('src/consumer.ts');
    state.files.add('src/utils.ts');
    state.importedSymbolsByFile.set('src/consumer.ts', [
      { sourceModule: './utils', resolvedModule: 'src/utils.ts', importedName: '*', localName: 'utils', isTypeOnly: false, lineStart: 1, lineEnd: 1 },
    ]);
    const findings = detectNamespaceImport(state);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('namespace-import');
    expect(findings[0].title).toContain('import * as utils');
  });

  it('flags import * as X from external module', () => {
    const state = emptyState();
    state.files.add('src/app.ts');
    state.importedSymbolsByFile.set('src/app.ts', [
      { sourceModule: 'lodash', importedName: '*', localName: 'lodash', isTypeOnly: false, lineStart: 3, lineEnd: 3 },
    ]);
    const findings = detectNamespaceImport(state);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('medium');
  });

  it('skips type-only namespace imports', () => {
    const state = emptyState();
    state.files.add('src/consumer.ts');
    state.importedSymbolsByFile.set('src/consumer.ts', [
      { sourceModule: './types', resolvedModule: 'src/types.ts', importedName: '*', localName: 'T', isTypeOnly: true, lineStart: 1, lineEnd: 1 },
    ]);
    const findings = detectNamespaceImport(state);
    expect(findings.length).toBe(0);
  });

  it('skips require() calls (handled by CJS detector)', () => {
    const state = emptyState();
    state.files.add('src/app.ts');
    state.importedSymbolsByFile.set('src/app.ts', [
      { sourceModule: 'fs', importedName: '*', localName: 'require', isTypeOnly: false, lineStart: 1, lineEnd: 1 },
    ]);
    const findings = detectNamespaceImport(state);
    expect(findings.length).toBe(0);
  });

  it('skips test files', () => {
    const state = emptyState();
    state.files.add('src/app.test.ts');
    state.importedSymbolsByFile.set('src/app.test.ts', [
      { sourceModule: './utils', importedName: '*', localName: 'utils', isTypeOnly: false, lineStart: 1, lineEnd: 1 },
    ]);
    const findings = detectNamespaceImport(state);
    expect(findings.length).toBe(0);
  });

  it('escalates severity for high-fan-in internal targets', () => {
    const state = emptyState();
    state.files.add('src/consumer.ts');
    state.files.add('src/shared.ts');
    state.importedSymbolsByFile.set('src/consumer.ts', [
      { sourceModule: './shared', resolvedModule: 'src/shared.ts', importedName: '*', localName: 'shared', isTypeOnly: false, lineStart: 2, lineEnd: 2 },
    ]);
    const incomingSet = new Set(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts']);
    state.incoming.set('src/shared.ts', incomingSet);
    const findings = detectNamespaceImport(state);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('high');
  });
});

describe('detectCommonJsInEsm', () => {
  it('flags require() as commonjs-in-esm when file has no ESM imports', () => {
    const state = emptyState();
    state.files.add('src/legacy.ts');
    state.importedSymbolsByFile.set('src/legacy.ts', [
      { sourceModule: 'fs', importedName: '*', localName: 'require', isTypeOnly: false, lineStart: 1, lineEnd: 1 },
    ]);
    const findings = detectCommonJsInEsm(state);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('commonjs-in-esm');
    expect(findings[0].severity).toBe('medium');
  });

  it('flags require() as mixed-module-format when file also has ESM imports', () => {
    const state = emptyState();
    state.files.add('src/hybrid.ts');
    state.importedSymbolsByFile.set('src/hybrid.ts', [
      { sourceModule: 'path', importedName: 'default', localName: 'path', isTypeOnly: false, lineStart: 1, lineEnd: 1 },
      { sourceModule: 'fs', importedName: '*', localName: 'require', isTypeOnly: false, lineStart: 2, lineEnd: 2 },
    ]);
    const findings = detectCommonJsInEsm(state);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('mixed-module-format');
    expect(findings[0].severity).toBe('high');
  });

  it('skips test files', () => {
    const state = emptyState();
    state.files.add('src/app.test.ts');
    state.importedSymbolsByFile.set('src/app.test.ts', [
      { sourceModule: 'fs', importedName: '*', localName: 'require', isTypeOnly: false, lineStart: 1, lineEnd: 1 },
    ]);
    const findings = detectCommonJsInEsm(state);
    expect(findings.length).toBe(0);
  });

  it('skips files with only named ESM imports', () => {
    const state = emptyState();
    state.files.add('src/clean.ts');
    state.importedSymbolsByFile.set('src/clean.ts', [
      { sourceModule: 'path', importedName: 'join', localName: 'join', isTypeOnly: false, lineStart: 1, lineEnd: 1 },
    ]);
    const findings = detectCommonJsInEsm(state);
    expect(findings.length).toBe(0);
  });

  it('flags multiple require() calls separately', () => {
    const state = emptyState();
    state.files.add('src/legacy.ts');
    state.importedSymbolsByFile.set('src/legacy.ts', [
      { sourceModule: 'fs', importedName: '*', localName: 'require', isTypeOnly: false, lineStart: 1, lineEnd: 1 },
      { sourceModule: 'path', importedName: '*', localName: 'require', isTypeOnly: false, lineStart: 2, lineEnd: 2 },
    ]);
    const findings = detectCommonJsInEsm(state);
    expect(findings.length).toBe(2);
  });
});

describe('detectExportStarLeak', () => {
  it('flags export * from internal module', () => {
    const state = emptyState();
    state.files.add('src/index.ts');
    state.files.add('src/utils.ts');
    state.reExportsByFile.set('src/index.ts', [
      { sourceModule: './utils', resolvedModule: 'src/utils.ts', exportedAs: '*', importedName: '*', isStar: true, isTypeOnly: false, lineStart: 1, lineEnd: 1 },
    ]);
    state.declaredExportsByFile.set('src/utils.ts', [
      { name: 'foo', kind: 'value' },
      { name: 'bar', kind: 'value' },
    ]);
    const findings = detectExportStarLeak(state);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('export-star-leak');
    expect(findings[0].reason).toContain('2 symbols');
  });

  it('escalates severity when target has many exports', () => {
    const state = emptyState();
    state.files.add('src/barrel.ts');
    state.files.add('src/large.ts');
    state.reExportsByFile.set('src/barrel.ts', [
      { sourceModule: './large', resolvedModule: 'src/large.ts', exportedAs: '*', importedName: '*', isStar: true, isTypeOnly: false, lineStart: 1, lineEnd: 1 },
    ]);
    const exports = Array.from({ length: 25 }, (_, i) => ({ name: `fn${i}`, kind: 'value' as const }));
    state.declaredExportsByFile.set('src/large.ts', exports);
    const findings = detectExportStarLeak(state);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('high');
  });

  it('escalates severity for chained export-star', () => {
    const state = emptyState();
    state.files.add('src/barrel.ts');
    state.files.add('src/sub-barrel.ts');
    state.reExportsByFile.set('src/barrel.ts', [
      { sourceModule: './sub-barrel', resolvedModule: 'src/sub-barrel.ts', exportedAs: '*', importedName: '*', isStar: true, isTypeOnly: false, lineStart: 1, lineEnd: 1 },
    ]);
    state.reExportsByFile.set('src/sub-barrel.ts', [
      { sourceModule: './deep', resolvedModule: 'src/deep.ts', exportedAs: '*', importedName: '*', isStar: true, isTypeOnly: false, lineStart: 1, lineEnd: 1 },
    ]);
    const findings = detectExportStarLeak(state);
    const barrelFinding = findings.find((f) => f.file === 'src/barrel.ts');
    expect(barrelFinding).toBeDefined();
    expect(barrelFinding!.severity).toBe('high');
    expect(barrelFinding!.reason).toContain('chains');
  });

  it('skips type-only export *', () => {
    const state = emptyState();
    state.files.add('src/index.ts');
    state.reExportsByFile.set('src/index.ts', [
      { sourceModule: './types', resolvedModule: 'src/types.ts', exportedAs: '*', importedName: '*', isStar: true, isTypeOnly: true, lineStart: 1, lineEnd: 1 },
    ]);
    const findings = detectExportStarLeak(state);
    expect(findings.length).toBe(0);
  });

  it('skips test files', () => {
    const state = emptyState();
    state.files.add('src/test-utils.test.ts');
    state.reExportsByFile.set('src/test-utils.test.ts', [
      { sourceModule: './helpers', exportedAs: '*', importedName: '*', isStar: true, isTypeOnly: false, lineStart: 1, lineEnd: 1 },
    ]);
    const findings = detectExportStarLeak(state);
    expect(findings.length).toBe(0);
  });

  it('flags named re-exports as non-leak', () => {
    const state = emptyState();
    state.files.add('src/index.ts');
    state.reExportsByFile.set('src/index.ts', [
      { sourceModule: './utils', resolvedModule: 'src/utils.ts', exportedAs: 'foo', importedName: 'foo', isStar: false, isTypeOnly: false, lineStart: 1, lineEnd: 1 },
    ]);
    const findings = detectExportStarLeak(state);
    expect(findings.length).toBe(0);
  });
});


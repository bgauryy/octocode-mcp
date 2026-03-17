import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import type { DependencyState, FileEntry, FunctionEntry, DependencyProfile } from './types.js';
import type { FileCriticality, DependencySummary } from './types.js';
import {
  computeInstability,
  detectSdpViolations,
  detectHighCoupling,
  detectGodModuleCoupling,
  detectOrphanModules,
  detectUnreachableModules,
  detectUnusedNpmDeps,
  detectBoundaryViolations,
  computeBarrelDepth,
  detectBarrelExplosion,
  detectGodModules,
  detectGodFunctions,
  computeCognitiveComplexity,
  detectCognitiveComplexity,
  detectLayerViolations,
  detectLowCohesion,
  detectInferredLayerViolations,
  getInferredLayer,
  computeHotFiles,
} from './architecture.js';

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

// ─── Inferred Layer Violations ─────────────────────────────────────────────

describe('getInferredLayer', () => {
  it('returns foundation layer for types/ directory', () => {
    expect(getInferredLayer('src/types/models.ts')).toBe(0);
  });

  it('returns utility layer for utils/ directory', () => {
    expect(getInferredLayer('src/utils/helpers.ts')).toBe(1);
  });

  it('returns service layer for services/ directory', () => {
    expect(getInferredLayer('src/services/api.ts')).toBe(2);
  });

  it('returns feature layer for features/ directory', () => {
    expect(getInferredLayer('src/features/auth/login.ts')).toBe(3);
  });

  it('returns feature layer for components/ directory', () => {
    expect(getInferredLayer('src/components/Button.tsx')).toBe(3);
  });

  it('returns -1 for unrecognized directory', () => {
    expect(getInferredLayer('src/random/foo.ts')).toBe(-1);
  });
});

describe('detectInferredLayerViolations', () => {
  it('returns empty when no inferred layers match', () => {
    const state = emptyState();
    addEdge(state, 'src/random/a.ts', 'src/other/b.ts');
    expect(detectInferredLayerViolations(state)).toEqual([]);
  });

  it('allows higher layers importing from lower layers', () => {
    const state = emptyState();
    addEdge(state, 'src/features/auth.ts', 'src/services/api.ts');
    addEdge(state, 'src/services/api.ts', 'src/utils/fetch.ts');
    addEdge(state, 'src/utils/fetch.ts', 'src/types/models.ts');
    expect(detectInferredLayerViolations(state)).toEqual([]);
  });

  it('detects foundation layer importing from feature layer', () => {
    const state = emptyState();
    addEdge(state, 'src/types/models.ts', 'src/features/auth.ts');
    const findings = detectInferredLayerViolations(state);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('inferred-layer-violation');
  });

  it('detects utility layer importing from service layer', () => {
    const state = emptyState();
    addEdge(state, 'src/utils/helpers.ts', 'src/services/api.ts');
    const findings = detectInferredLayerViolations(state);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('high');
  });

  it('skips test files', () => {
    const state = emptyState();
    addEdge(state, 'src/types/models.test.ts', 'src/features/auth.ts');
    expect(detectInferredLayerViolations(state)).toEqual([]);
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


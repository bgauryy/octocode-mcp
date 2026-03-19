import { describe, expect, it } from 'vitest';

import {
  buildAdvancedGraphFindings,
  computeChokepoints,
  computeGraphAnalytics,
  computePackageGraphSummary,
  computeSccClusters,
  packageKeyForFile,
} from './graph-analytics.js';

import type {
  DependencyState,
  DependencySummary,
  FileCriticality,
  FileEntry,
} from '../types/index.js';

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

function minimalSummary(
  overrides: Partial<DependencySummary> = {}
): DependencySummary {
  return {
    totalModules: 0,
    totalEdges: 0,
    unresolvedEdgeCount: 0,
    externalDependencyFiles: 0,
    rootsCount: 0,
    leavesCount: 0,
    roots: [],
    leaves: [],
    criticalModules: [],
    testOnlyModules: [],
    unresolvedSample: [],
    outgoingTop: [],
    inboundTop: [],
    cycles: [],
    criticalPaths: [],
    ...overrides,
  };
}

function makeFile(
  file: string,
  topLevelEffects: FileEntry['topLevelEffects'] = []
): FileEntry {
  return {
    package: 'test',
    file,
    parseEngine: 'typescript',
    nodeCount: 1,
    kindCounts: {},
    functions: [],
    flows: [],
    dependencyProfile: {
      internalDependencies: [],
      externalDependencies: [],
      unresolvedDependencies: [],
      declaredExports: [],
      importedSymbols: [],
      reExports: [],
    },
    topLevelEffects,
  };
}

describe('graph analytics', () => {
  it('groups files into SCC clusters', () => {
    const state = emptyState();
    addEdge(state, 'src/a.ts', 'src/b.ts');
    addEdge(state, 'src/b.ts', 'src/c.ts');
    addEdge(state, 'src/c.ts', 'src/a.ts');
    const criticality = new Map<string, FileCriticality>();
    for (const file of state.files)
      criticality.set(file, {
        file,
        complexityRisk: 1,
        highComplexityFunctions: 0,
        functionCount: 1,
        flows: 0,
        score: 5,
      });

    const analytics = computeGraphAnalytics(
      state,
      minimalSummary(),
      criticality
    );
    expect(analytics.sccClusters.length).toBe(1);
    expect(analytics.sccClusters[0].nodeCount).toBe(3);
  });

  it('computes package hotspots and chokepoints', () => {
    const state = emptyState();
    addEdge(state, 'packages/a/src/index.ts', 'packages/b/src/api.ts');
    addEdge(state, 'packages/a/src/service.ts', 'packages/b/src/api.ts');
    addEdge(state, 'packages/c/src/ui.ts', 'packages/b/src/api.ts');
    addEdge(state, 'packages/b/src/api.ts', 'packages/d/src/shared.ts');
    const criticality = new Map<string, FileCriticality>();
    for (const file of state.files)
      criticality.set(file, {
        file,
        complexityRisk: 1,
        highComplexityFunctions: 0,
        functionCount: 1,
        flows: 0,
        score: 12,
      });
    const summary = minimalSummary({
      criticalPaths: [
        {
          start: 'packages/a/src/index.ts',
          path: ['packages/a/src/index.ts', 'packages/b/src/api.ts'],
          score: 22,
          length: 2,
          containsCycle: false,
        },
      ],
    });

    const analytics = computeGraphAnalytics(state, summary, criticality);
    expect(analytics.packageGraphSummary.hotspots.length).toBeGreaterThan(0);
    expect(
      analytics.chokepoints.some(
        point => point.file === 'packages/b/src/api.ts'
      )
    ).toBe(true);
  });

  it('builds advanced graph findings for cycle clusters and startup hubs', () => {
    const state = emptyState();
    addEdge(state, 'src/a.ts', 'src/b.ts');
    addEdge(state, 'src/b.ts', 'src/c.ts');
    addEdge(state, 'src/c.ts', 'src/a.ts');
    addEdge(state, 'src/d.ts', 'src/a.ts');
    addEdge(state, 'src/e.ts', 'src/a.ts');
    addEdge(state, 'src/f.ts', 'src/a.ts');
    addEdge(state, 'src/g.ts', 'src/a.ts');
    addEdge(state, 'src/h.ts', 'src/a.ts');
    addEdge(state, 'src/i.ts', 'src/a.ts');
    addEdge(state, 'src/j.ts', 'src/a.ts');
    addEdge(state, 'src/k.ts', 'src/a.ts');
    const criticality = new Map<string, FileCriticality>();
    for (const file of state.files)
      criticality.set(file, {
        file,
        complexityRisk: 1,
        highComplexityFunctions: 0,
        functionCount: 1,
        flows: 0,
        score: 20,
      });
    const analytics = computeGraphAnalytics(
      state,
      minimalSummary(),
      criticality
    );
    const findings = buildAdvancedGraphFindings(analytics, state, [
      makeFile('src/a.ts', [
        {
          kind: 'sync-io',
          lineStart: 1,
          lineEnd: 1,
          detail: 'fs.readFileSync',
          weight: 5,
          confidence: 'high',
        },
      ]),
      makeFile('src/b.ts'),
      makeFile('src/c.ts'),
    ]);
    expect(findings.some(finding => finding.category === 'cycle-cluster')).toBe(
      true
    );
    expect(
      findings.some(finding => finding.category === 'startup-risk-hub')
    ).toBe(true);
  });

  it('normalizes package keys for non-package files', () => {
    expect(packageKeyForFile('src/server.ts')).toBe('src');
    expect(packageKeyForFile('packages/core/src/index.ts')).toBe(
      'packages/core'
    );
  });
});

describe('computeSccClusters', () => {
  it('returns 0 clusters for a linear chain (no cycle)', () => {
    const state = emptyState();
    addEdge(state, 'src/a.ts', 'src/b.ts');
    addEdge(state, 'src/b.ts', 'src/c.ts');
    const clusters = computeSccClusters(state);
    expect(clusters).toHaveLength(0);
  });

  it('detects a self-loop as 1 cluster with 1 node', () => {
    const state = emptyState();
    state.files.add('src/a.ts');
    state.outgoing.set('src/a.ts', new Set(['src/a.ts']));
    state.incoming.set('src/a.ts', new Set(['src/a.ts']));
    const clusters = computeSccClusters(state);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].nodeCount).toBe(1);
  });

  it('detects multiple disconnected cycles', () => {
    const state = emptyState();
    addEdge(state, 'src/a.ts', 'src/b.ts');
    addEdge(state, 'src/b.ts', 'src/a.ts');
    addEdge(state, 'src/c.ts', 'src/d.ts');
    addEdge(state, 'src/d.ts', 'src/c.ts');
    const clusters = computeSccClusters(state);
    expect(clusters).toHaveLength(2);
  });
});

describe('computePackageGraphSummary', () => {
  it('returns 0 hotspots when all edges are within a single package', () => {
    const state = emptyState();
    addEdge(state, 'packages/a/src/x.ts', 'packages/a/src/y.ts');
    const summary = computePackageGraphSummary(state);
    expect(summary.hotspots).toHaveLength(0);
    expect(summary.edgeCount).toBe(0);
  });

  it('reports hotspots for cross-package edges', () => {
    const state = emptyState();
    addEdge(state, 'packages/a/src/x.ts', 'packages/b/src/y.ts');
    addEdge(state, 'packages/a/src/z.ts', 'packages/b/src/w.ts');
    const summary = computePackageGraphSummary(state);
    expect(summary.packageCount).toBe(2);
    expect(summary.hotspots.length).toBeGreaterThan(0);
    expect(summary.hotspots[0].from).toBe('packages/a');
    expect(summary.hotspots[0].to).toBe('packages/b');
  });
});

describe('computeChokepoints', () => {
  it('detects articulation points', () => {
    const state = emptyState();
    addEdge(state, 'src/a.ts', 'src/b.ts');
    addEdge(state, 'src/b.ts', 'src/c.ts');
    const criticality = new Map<string, FileCriticality>();
    for (const f of state.files)
      criticality.set(f, {
        file: f,
        complexityRisk: 1,
        highComplexityFunctions: 0,
        functionCount: 1,
        flows: 0,
        score: 5,
      });
    const chokepoints = computeChokepoints(
      state,
      minimalSummary(),
      criticality,
      []
    );
    const b = chokepoints.find(p => p.file === 'src/b.ts');
    expect(b).toBeDefined();
    expect(b!.articulation).toBe(true);
  });

  it('filters out nodes with score=0 and no reasons', () => {
    const state = emptyState();
    state.files.add('src/isolated.ts');
    const criticality = new Map<string, FileCriticality>();
    criticality.set('src/isolated.ts', {
      file: 'src/isolated.ts',
      complexityRisk: 0,
      highComplexityFunctions: 0,
      functionCount: 0,
      flows: 0,
      score: 0,
    });
    const chokepoints = computeChokepoints(
      state,
      minimalSummary(),
      criticality,
      []
    );
    expect(chokepoints.find(p => p.file === 'src/isolated.ts')).toBeUndefined();
  });
});

describe('buildAdvancedGraphFindings - broker-module', () => {
  it('generates broker-module findings for high fan-in/fan-out chokepoints', () => {
    const state = emptyState();
    const hub = 'src/hub.ts';
    for (const src of ['src/a.ts', 'src/b.ts', 'src/c.ts'])
      addEdge(state, src, hub);
    for (const tgt of ['src/x.ts', 'src/y.ts', 'src/z.ts'])
      addEdge(state, hub, tgt);
    const criticality = new Map<string, FileCriticality>();
    for (const file of state.files)
      criticality.set(file, {
        file,
        complexityRisk: 1,
        highComplexityFunctions: 0,
        functionCount: 1,
        flows: 0,
        score: 30,
      });
    const analytics = computeGraphAnalytics(
      state,
      minimalSummary(),
      criticality
    );
    const findings = buildAdvancedGraphFindings(analytics, state, []);
    expect(
      findings.some(f => f.category === 'broker-module' && f.file === hub)
    ).toBe(true);
  });
});

describe('buildAdvancedGraphFindings - bridge-module', () => {
  it('generates bridge-module findings for articulation points', () => {
    const state = emptyState();
    addEdge(state, 'src/a.ts', 'src/bridge.ts');
    addEdge(state, 'src/bridge.ts', 'src/c.ts');
    const criticality = new Map<string, FileCriticality>();
    for (const file of state.files)
      criticality.set(file, {
        file,
        complexityRisk: 1,
        highComplexityFunctions: 0,
        functionCount: 1,
        flows: 0,
        score: 20,
      });
    const analytics = computeGraphAnalytics(
      state,
      minimalSummary(),
      criticality
    );
    const findings = buildAdvancedGraphFindings(analytics, state, []);
    expect(
      findings.some(
        f => f.category === 'bridge-module' && f.file === 'src/bridge.ts'
      )
    ).toBe(true);
  });
});

describe('computeSccClusters - external deps', () => {
  it('skips outgoing edges to files not in dependency state', () => {
    const state = emptyState();
    addEdge(state, 'src/a.ts', 'src/b.ts');
    addEdge(state, 'src/b.ts', 'src/c.ts');
    addEdge(state, 'src/c.ts', 'src/a.ts');
    state.outgoing.get('src/a.ts')!.add('node_modules/external/pkg');
    const clusters = computeSccClusters(state);
    expect(clusters.length).toBe(1);
    expect(clusters[0].nodeCount).toBe(3);
  });
});

describe('buildAdvancedGraphFindings - import line resolution', () => {
  it('uses importedSymbolsByFile for line numbers when available', () => {
    const state = emptyState();
    addEdge(state, 'src/a.ts', 'src/b.ts');
    addEdge(state, 'src/b.ts', 'src/c.ts');
    addEdge(state, 'src/c.ts', 'src/a.ts');
    addEdge(state, 'src/entry.ts', 'src/a.ts');
    addEdge(state, 'src/entry2.ts', 'src/a.ts');
    state.importedSymbolsByFile.set('src/a.ts', [
      {
        sourceModule: './b',
        resolvedModule: 'src/b.ts',
        importedName: 'x',
        localName: 'x',
        isTypeOnly: false,
        lineStart: 5,
        lineEnd: 7,
      },
    ]);
    const criticality = new Map<string, FileCriticality>();
    for (const f of state.files)
      criticality.set(f, {
        file: f,
        complexityRisk: 1,
        highComplexityFunctions: 0,
        functionCount: 1,
        flows: 0,
        score: 25,
      });
    const analytics = computeGraphAnalytics(
      state,
      minimalSummary(),
      criticality
    );
    const findings = buildAdvancedGraphFindings(analytics, state, []);
    const cycleFinding = findings.find(f => f.category === 'cycle-cluster');
    expect(cycleFinding).toBeDefined();
    expect(cycleFinding!.lineStart).toBe(5);
    expect(cycleFinding!.lineEnd).toBe(7);
  });
});

describe('buildAdvancedGraphFindings - package-boundary-chatter', () => {
  it('generates package-boundary-chatter findings when hotspot edges >= 4', () => {
    const state = emptyState();
    for (let i = 0; i < 5; i++)
      addEdge(state, `packages/a/src/f${i}.ts`, `packages/b/src/g${i}.ts`);
    const criticality = new Map<string, FileCriticality>();
    for (const file of state.files)
      criticality.set(file, {
        file,
        complexityRisk: 0,
        highComplexityFunctions: 0,
        functionCount: 1,
        flows: 0,
        score: 1,
      });
    const analytics = computeGraphAnalytics(
      state,
      minimalSummary(),
      criticality
    );
    const findings = buildAdvancedGraphFindings(analytics, state, []);
    expect(findings.some(f => f.category === 'package-boundary-chatter')).toBe(
      true
    );
  });
});

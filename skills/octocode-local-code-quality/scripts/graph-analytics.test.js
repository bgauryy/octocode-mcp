import { describe, expect, it } from 'vitest';
import { buildAdvancedGraphFindings, computeGraphAnalytics, packageKeyForFile } from './graph-analytics.js';
function emptyState() {
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
function addEdge(state, from, to) {
    state.files.add(from);
    state.files.add(to);
    if (!state.outgoing.has(from))
        state.outgoing.set(from, new Set());
    state.outgoing.get(from).add(to);
    if (!state.incoming.has(to))
        state.incoming.set(to, new Set());
    state.incoming.get(to).add(from);
}
function minimalSummary(overrides = {}) {
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
function makeFile(file, topLevelEffects = []) {
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
        const criticality = new Map();
        for (const file of state.files)
            criticality.set(file, { file, complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 5 });
        const analytics = computeGraphAnalytics(state, minimalSummary(), criticality);
        expect(analytics.sccClusters.length).toBe(1);
        expect(analytics.sccClusters[0].nodeCount).toBe(3);
    });
    it('computes package hotspots and chokepoints', () => {
        const state = emptyState();
        addEdge(state, 'packages/a/src/index.ts', 'packages/b/src/api.ts');
        addEdge(state, 'packages/a/src/service.ts', 'packages/b/src/api.ts');
        addEdge(state, 'packages/c/src/ui.ts', 'packages/b/src/api.ts');
        addEdge(state, 'packages/b/src/api.ts', 'packages/d/src/shared.ts');
        const criticality = new Map();
        for (const file of state.files)
            criticality.set(file, { file, complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 12 });
        const summary = minimalSummary({
            criticalPaths: [{ start: 'packages/a/src/index.ts', path: ['packages/a/src/index.ts', 'packages/b/src/api.ts'], score: 22, length: 2, containsCycle: false }],
        });
        const analytics = computeGraphAnalytics(state, summary, criticality);
        expect(analytics.packageGraphSummary.hotspots.length).toBeGreaterThan(0);
        expect(analytics.chokepoints.some((point) => point.file === 'packages/b/src/api.ts')).toBe(true);
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
        const criticality = new Map();
        for (const file of state.files)
            criticality.set(file, { file, complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 20 });
        const analytics = computeGraphAnalytics(state, minimalSummary(), criticality);
        const findings = buildAdvancedGraphFindings(analytics, state, [
            makeFile('src/a.ts', [{ kind: 'sync-io', lineStart: 1, lineEnd: 1, detail: 'fs.readFileSync', weight: 5, confidence: 'high' }]),
            makeFile('src/b.ts'),
            makeFile('src/c.ts'),
        ]);
        expect(findings.some((finding) => finding.category === 'cycle-cluster')).toBe(true);
        expect(findings.some((finding) => finding.category === 'startup-risk-hub')).toBe(true);
    });
    it('normalizes package keys for non-package files', () => {
        expect(packageKeyForFile('src/server.ts')).toBe('src');
        expect(packageKeyForFile('packages/core/src/index.ts')).toBe('packages/core');
    });
});

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DEFAULT_OPTS } from './types.js';
import { computeDependencyCycles, computeDependencyCriticalPaths, buildIssueCatalog, isLikelyEntrypoint, ARCHITECTURE_CATEGORIES, CODE_QUALITY_CATEGORIES, DEAD_CODE_CATEGORIES, writeMultiFileReport, severityBreakdown, categoryBreakdown, generateSummaryMd, diverseTopRecommendations, } from './index.js';
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
function addEdge(state, from, to, isTest = false) {
    state.files.add(from);
    state.files.add(to);
    if (!state.outgoing.has(from))
        state.outgoing.set(from, new Set());
    state.outgoing.get(from).add(to);
    if (!state.incoming.has(to))
        state.incoming.set(to, new Set());
    state.incoming.get(to).add(from);
    if (isTest) {
        if (!state.incomingFromTests.has(to))
            state.incomingFromTests.set(to, new Set());
        state.incomingFromTests.get(to).add(from);
    }
    else {
        if (!state.incomingFromProduction.has(to))
            state.incomingFromProduction.set(to, new Set());
        state.incomingFromProduction.get(to).add(from);
    }
}
const emptyProfile = {
    internalDependencies: [], externalDependencies: [], unresolvedDependencies: [],
    declaredExports: [], importedSymbols: [], reExports: [],
};
function makeFn(overrides = {}) {
    return {
        kind: 'FunctionDeclaration', name: 'fn', nameHint: 'fn', file: 'src/a.ts',
        lineStart: 1, lineEnd: 10, columnStart: 1, columnEnd: 1,
        statementCount: 5, complexity: 1, maxBranchDepth: 0, maxLoopDepth: 0,
        returns: 1, awaits: 0, calls: 0, loops: 0, lengthLines: 10, cognitiveComplexity: 0,
        ...overrides,
    };
}
function makeFile(overrides = {}) {
    return {
        package: 'test', file: 'src/a.ts', parseEngine: 'typescript',
        nodeCount: 50, kindCounts: {}, functions: [], flows: [],
        dependencyProfile: emptyProfile, ...overrides,
    };
}
const testOpts = { ...DEFAULT_OPTS, root: '/repo', findingsLimit: 1000 };
function minimalDepSummary(overrides = {}) {
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
describe('computeDependencyCycles', () => {
    it('returns empty for acyclic graph', () => {
        const state = emptyState();
        addEdge(state, 'a.ts', 'b.ts');
        addEdge(state, 'b.ts', 'c.ts');
        expect(computeDependencyCycles(state)).toEqual([]);
    });
    it('detects simple 2-node cycle', () => {
        const state = emptyState();
        addEdge(state, 'a.ts', 'b.ts');
        addEdge(state, 'b.ts', 'a.ts');
        const cycles = computeDependencyCycles(state);
        expect(cycles.length).toBe(1);
        expect(cycles[0].nodeCount).toBe(2);
    });
    it('detects 3-node cycle', () => {
        const state = emptyState();
        addEdge(state, 'a.ts', 'b.ts');
        addEdge(state, 'b.ts', 'c.ts');
        addEdge(state, 'c.ts', 'a.ts');
        const cycles = computeDependencyCycles(state);
        expect(cycles.length).toBe(1);
        expect(cycles[0].nodeCount).toBe(3);
    });
    it('detects multiple cycles', () => {
        const state = emptyState();
        addEdge(state, 'a.ts', 'b.ts');
        addEdge(state, 'b.ts', 'a.ts');
        addEdge(state, 'c.ts', 'd.ts');
        addEdge(state, 'd.ts', 'c.ts');
        const cycles = computeDependencyCycles(state);
        expect(cycles.length).toBe(2);
    });
    it('deduplicates same cycle found from different start', () => {
        const state = emptyState();
        addEdge(state, 'a.ts', 'b.ts');
        addEdge(state, 'b.ts', 'a.ts');
        const cycles = computeDependencyCycles(state);
        expect(cycles.length).toBe(1);
    });
    it('returns cycles sorted by nodeCount descending', () => {
        const state = emptyState();
        addEdge(state, 'a.ts', 'b.ts');
        addEdge(state, 'b.ts', 'a.ts');
        addEdge(state, 'x.ts', 'y.ts');
        addEdge(state, 'y.ts', 'z.ts');
        addEdge(state, 'z.ts', 'x.ts');
        const cycles = computeDependencyCycles(state);
        expect(cycles[0].nodeCount).toBeGreaterThanOrEqual(cycles[cycles.length - 1].nodeCount);
    });
});
// ─── computeDependencyCriticalPaths ─────────────────────────────────────────
describe('computeDependencyCriticalPaths', () => {
    it('returns empty for isolated files', () => {
        const state = emptyState();
        state.files.add('a.ts');
        const critMap = new Map();
        critMap.set('a.ts', { file: 'a.ts', complexityRisk: 1, highComplexityFunctions: 0, functionCount: 1, flows: 0, score: 5 });
        const paths = computeDependencyCriticalPaths(state, critMap, testOpts);
        expect(paths).toEqual([]);
    });
    it('finds longest weighted path', () => {
        const state = emptyState();
        addEdge(state, 'a.ts', 'b.ts');
        addEdge(state, 'b.ts', 'c.ts');
        const critMap = new Map();
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
        const critMap = new Map();
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
        const critMap = new Map();
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
            const dups = [{
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
            const makeDup = (occurrences) => ({
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
                const severityOrder = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
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
    describe('features filtering', () => {
        it('filters findings by features set', () => {
            const depSummary = minimalDepSummary({
                cycles: [{ path: ['a.ts', 'b.ts', 'a.ts'], nodeCount: 2 }],
                testOnlyModules: [{
                        file: 'src/t.ts', outboundCount: 0, inboundCount: 1,
                        inboundFromProduction: 0, inboundFromTests: 1,
                        externalDependencyCount: 0, unresolvedDependencyCount: 0,
                    }],
            });
            const state = emptyState();
            state.files.add('src/lib.ts');
            state.declaredExportsByFile.set('src/lib.ts', [
                { name: 'deadFn', kind: 'value', lineStart: 10, lineEnd: 15 },
            ]);
            const files = [makeFile({
                    functions: [makeFn({ complexity: 40, name: 'complexFn' })],
                })];
            const optsAll = { ...testOpts, features: null };
            const optsArchOnly = { ...testOpts, features: new Set(['dependency-cycle', 'dependency-test-only']) };
            const { findings: allFindings } = buildIssueCatalog([], [], files, depSummary, state, optsAll);
            const { findings: filteredFindings } = buildIssueCatalog([], [], files, depSummary, state, optsArchOnly);
            expect(allFindings.some(f => f.category === 'dependency-cycle')).toBe(true);
            expect(allFindings.some(f => f.category === 'dependency-test-only')).toBe(true);
            expect(allFindings.some(f => f.category === 'dead-export')).toBe(true);
            expect(allFindings.some(f => f.category === 'function-optimization')).toBe(true);
            expect(filteredFindings.every(f => f.category === 'dependency-cycle' || f.category === 'dependency-test-only')).toBe(true);
            expect(filteredFindings.some(f => f.category === 'dead-export')).toBe(false);
            expect(filteredFindings.some(f => f.category === 'function-optimization')).toBe(false);
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
// ─── Category Group Constants ───────────────────────────────────────────────
describe('category group constants', () => {
    const ALL_CATEGORIES = [
        'dependency-cycle', 'dependency-critical-path', 'dependency-test-only',
        'architecture-sdp-violation', 'high-coupling', 'god-module-coupling',
        'orphan-module', 'unreachable-module', 'layer-violation',
        'low-cohesion', 'inferred-layer-violation',
        'duplicate-function-body', 'duplicate-flow-structure', 'function-optimization',
        'cognitive-complexity', 'god-module', 'god-function',
        'dead-file', 'dead-export', 'dead-re-export', 're-export-duplication',
        're-export-shadowed', 'unused-npm-dependency', 'package-boundary-violation',
        'barrel-explosion',
    ];
    it('every known category belongs to exactly one group', () => {
        for (const cat of ALL_CATEGORIES) {
            const inArch = ARCHITECTURE_CATEGORIES.has(cat);
            const inQual = CODE_QUALITY_CATEGORIES.has(cat);
            const inDead = DEAD_CODE_CATEGORIES.has(cat);
            const count = [inArch, inQual, inDead].filter(Boolean).length;
            expect(count).toBe(1);
        }
    });
    it('groups have no overlap', () => {
        for (const cat of ARCHITECTURE_CATEGORIES) {
            expect(CODE_QUALITY_CATEGORIES.has(cat)).toBe(false);
            expect(DEAD_CODE_CATEGORIES.has(cat)).toBe(false);
        }
        for (const cat of CODE_QUALITY_CATEGORIES) {
            expect(DEAD_CODE_CATEGORIES.has(cat)).toBe(false);
        }
    });
    it('all 33 categories are covered', () => {
        const total = ARCHITECTURE_CATEGORIES.size + CODE_QUALITY_CATEGORIES.size + DEAD_CODE_CATEGORIES.size;
        expect(total).toBe(33);
    });
    it('architecture group has 11 categories', () => {
        expect(ARCHITECTURE_CATEGORIES.size).toBe(11);
    });
    it('code quality group has 14 categories', () => {
        expect(CODE_QUALITY_CATEGORIES.size).toBe(14);
    });
    it('dead code group has 8 categories', () => {
        expect(DEAD_CODE_CATEGORIES.size).toBe(8);
    });
});
// ─── severityBreakdown ──────────────────────────────────────────────────────
describe('severityBreakdown', () => {
    it('returns zero counts for empty findings', () => {
        const result = severityBreakdown([]);
        expect(result).toEqual({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
    });
    it('counts each severity correctly', () => {
        const findings = [
            { severity: 'high' },
            { severity: 'high' },
            { severity: 'medium' },
            { severity: 'critical' },
        ];
        const result = severityBreakdown(findings);
        expect(result.critical).toBe(1);
        expect(result.high).toBe(2);
        expect(result.medium).toBe(1);
        expect(result.low).toBe(0);
    });
});
// ─── categoryBreakdown ──────────────────────────────────────────────────────
describe('categoryBreakdown', () => {
    it('returns empty object for empty findings', () => {
        expect(categoryBreakdown([])).toEqual({});
    });
    it('counts each category correctly', () => {
        const findings = [
            { category: 'dead-export' },
            { category: 'dead-export' },
            { category: 'dependency-cycle' },
        ];
        const result = categoryBreakdown(findings);
        expect(result['dead-export']).toBe(2);
        expect(result['dependency-cycle']).toBe(1);
    });
});
// ─── diverseTopRecommendations ──────────────────────────────────────────────
describe('diverseTopRecommendations', () => {
    const makeFinding = (id, severity, category) => ({
        id,
        severity: severity,
        category,
        file: 'test.ts',
        lineStart: 1,
        lineEnd: 1,
        title: `Test ${id}`,
        reason: 'test',
        files: ['test.ts'],
        suggestedFix: { strategy: 'test', steps: ['step1'] },
        impact: 'test',
    });
    it('limits findings per category', () => {
        const findings = [
            makeFinding('1', 'high', 'dead-export'),
            makeFinding('2', 'high', 'dead-export'),
            makeFinding('3', 'high', 'dead-export'),
            makeFinding('4', 'high', 'cognitive-complexity'),
            makeFinding('5', 'high', 'cognitive-complexity'),
            makeFinding('6', 'high', 'cognitive-complexity'),
        ];
        const result = diverseTopRecommendations(findings, 10, 2);
        expect(result).toHaveLength(4);
        expect(result.filter(f => f.category === 'dead-export')).toHaveLength(2);
        expect(result.filter(f => f.category === 'cognitive-complexity')).toHaveLength(2);
    });
    it('respects total limit', () => {
        const findings = Array.from({ length: 30 }, (_, i) => makeFinding(`${i}`, 'high', `cat-${i % 10}`));
        const result = diverseTopRecommendations(findings, 5, 2);
        expect(result).toHaveLength(5);
    });
    it('returns empty for empty input', () => {
        expect(diverseTopRecommendations([], 10, 2)).toHaveLength(0);
    });
    it('uses maxPerCategory=1 to force maximum diversity', () => {
        const findings = [
            makeFinding('1', 'critical', 'a'),
            makeFinding('2', 'critical', 'a'),
            makeFinding('3', 'high', 'b'),
            makeFinding('4', 'high', 'b'),
            makeFinding('5', 'medium', 'c'),
        ];
        const result = diverseTopRecommendations(findings, 10, 1);
        expect(result).toHaveLength(3);
        expect(new Set(result.map(f => f.category)).size).toBe(3);
    });
});
// ─── writeMultiFileReport ───────────────────────────────────────────────────
describe('writeMultiFileReport', () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-test-'));
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    function makeReport(overrides = {}) {
        return {
            generatedAt: '2026-03-17T00:00:00.000Z',
            repoRoot: '/repo',
            options: {},
            parser: { requested: 'auto', effective: 'typescript' },
            summary: { totalFiles: 10, totalFunctions: 50, totalFlows: 200, totalDependencyFiles: 12, totalPackages: 2 },
            fileInventory: [],
            duplicateFlows: { duplicatedFunctions: [], duplicatedControlFlow: [], totalFunctionGroups: 0, totalFlowGroups: 0 },
            dependencyGraph: minimalDepSummary(),
            dependencyFindings: [],
            agentOutput: { totalFindings: 0, highPriority: 0, mediumPriority: 0, lowPriority: 0, topRecommendations: [], filesWithIssues: [] },
            optimizationOpportunities: [],
            optimizationFindings: [],
            parseErrors: [],
            ...overrides,
        };
    }
    function makeFindings(...categories) {
        return categories.map((c, i) => ({
            id: `AST-ISSUE-${i}`,
            category: c.category,
            severity: c.severity,
            file: `src/file${i}.ts`,
            lineStart: 1,
            lineEnd: 10,
            title: `Finding: ${c.category}`,
            reason: 'test reason',
            files: [`src/file${i}.ts`],
            suggestedFix: { strategy: 'fix it', steps: ['step 1'] },
        }));
    }
    it('creates all 7 expected files (6 json + summary.md)', () => {
        const outDir = path.join(tmpDir, 'scan');
        writeMultiFileReport(outDir, makeReport(), { ...DEFAULT_OPTS, graph: false }, emptyState(), minimalDepSummary(), new Map());
        const files = fs.readdirSync(outDir).sort();
        expect(files).toEqual([
            'architecture.json',
            'code-quality.json',
            'dead-code.json',
            'file-inventory.json',
            'findings.json',
            'summary.json',
            'summary.md',
        ]);
    });
    it('includes graph.md when graph option is true', () => {
        const outDir = path.join(tmpDir, 'scan-graph');
        writeMultiFileReport(outDir, makeReport(), { ...DEFAULT_OPTS, graph: true }, emptyState(), minimalDepSummary(), new Map());
        expect(fs.existsSync(path.join(outDir, 'graph.md'))).toBe(true);
    });
    it('includes ast-trees.txt in compact text format when astTrees are present', () => {
        const outDir = path.join(tmpDir, 'scan-trees');
        const tree = { kind: 'SourceFile', startLine: 1, endLine: 10, children: [
                { kind: 'ImportDeclaration', startLine: 1, endLine: 1, children: [] },
                { kind: 'FunctionDeclaration', startLine: 3, endLine: 8, children: [
                        { kind: 'Block', startLine: 3, endLine: 8, children: [], truncated: true },
                    ] },
            ] };
        const report = makeReport({ astTrees: [{ package: 'test', file: 'a.ts', tree }] });
        writeMultiFileReport(outDir, report, { ...DEFAULT_OPTS }, emptyState(), minimalDepSummary(), new Map());
        const txtPath = path.join(outDir, 'ast-trees.txt');
        expect(fs.existsSync(txtPath)).toBe(true);
        const content = fs.readFileSync(txtPath, 'utf8');
        expect(content).toContain('## test — a.ts');
        expect(content).toContain('SourceFile[1:10]');
        expect(content).toContain('  ImportDeclaration[1]');
        expect(content).toContain('  FunctionDeclaration[3:8]');
        expect(content).toContain('    Block[3:8] ...');
        expect(content).not.toContain('"kind"');
    });
    it('routes architecture findings into architecture.json', () => {
        const findings = makeFindings({ category: 'dependency-cycle', severity: 'high' }, { category: 'architecture-sdp-violation', severity: 'medium' }, { category: 'dead-export', severity: 'high' });
        const outDir = path.join(tmpDir, 'scan-arch');
        writeMultiFileReport(outDir, makeReport({ optimizationFindings: findings }), DEFAULT_OPTS, emptyState(), minimalDepSummary(), new Map());
        const archData = JSON.parse(fs.readFileSync(path.join(outDir, 'architecture.json'), 'utf8'));
        expect(archData.findingsCount).toBe(2);
        expect(archData.findings.every((f) => ARCHITECTURE_CATEGORIES.has(f.category))).toBe(true);
    });
    it('routes code quality findings into code-quality.json', () => {
        const findings = makeFindings({ category: 'function-optimization', severity: 'high' }, { category: 'cognitive-complexity', severity: 'medium' }, { category: 'dead-file', severity: 'medium' });
        const outDir = path.join(tmpDir, 'scan-qual');
        writeMultiFileReport(outDir, makeReport({ optimizationFindings: findings }), DEFAULT_OPTS, emptyState(), minimalDepSummary(), new Map());
        const qualData = JSON.parse(fs.readFileSync(path.join(outDir, 'code-quality.json'), 'utf8'));
        expect(qualData.findingsCount).toBe(2);
        expect(qualData.findings.every((f) => CODE_QUALITY_CATEGORIES.has(f.category))).toBe(true);
    });
    it('routes dead code findings into dead-code.json', () => {
        const findings = makeFindings({ category: 'dead-export', severity: 'high' }, { category: 'unused-npm-dependency', severity: 'low' }, { category: 'barrel-explosion', severity: 'medium' }, { category: 'dependency-cycle', severity: 'high' });
        const outDir = path.join(tmpDir, 'scan-dead');
        writeMultiFileReport(outDir, makeReport({ optimizationFindings: findings }), DEFAULT_OPTS, emptyState(), minimalDepSummary(), new Map());
        const deadData = JSON.parse(fs.readFileSync(path.join(outDir, 'dead-code.json'), 'utf8'));
        expect(deadData.findingsCount).toBe(3);
        expect(deadData.findings.every((f) => DEAD_CODE_CATEGORIES.has(f.category))).toBe(true);
    });
    it('findings.json contains ALL findings', () => {
        const findings = makeFindings({ category: 'dependency-cycle', severity: 'high' }, { category: 'dead-export', severity: 'medium' }, { category: 'function-optimization', severity: 'high' });
        const outDir = path.join(tmpDir, 'scan-all');
        writeMultiFileReport(outDir, makeReport({ optimizationFindings: findings }), DEFAULT_OPTS, emptyState(), minimalDepSummary(), new Map());
        const findingsData = JSON.parse(fs.readFileSync(path.join(outDir, 'findings.json'), 'utf8'));
        expect(findingsData.totalFindings).toBe(3);
    });
    it('summary.json contains outputFiles index', () => {
        const outDir = path.join(tmpDir, 'scan-idx');
        writeMultiFileReport(outDir, makeReport(), DEFAULT_OPTS, emptyState(), minimalDepSummary(), new Map());
        const summaryData = JSON.parse(fs.readFileSync(path.join(outDir, 'summary.json'), 'utf8'));
        expect(summaryData.outputFiles).toBeDefined();
        expect(summaryData.outputFiles.summary).toBe('summary.json');
        expect(summaryData.outputFiles.architecture).toBe('architecture.json');
        expect(summaryData.outputFiles.deadCode).toBe('dead-code.json');
        expect(summaryData.outputFiles.summaryMd).toBe('summary.md');
    });
    it('file-inventory.json contains fileInventory and fileCount', () => {
        const fileEntries = [makeFile({ file: 'src/a.ts' }), makeFile({ file: 'src/b.ts' })];
        const outDir = path.join(tmpDir, 'scan-inv');
        writeMultiFileReport(outDir, makeReport({ fileInventory: fileEntries }), DEFAULT_OPTS, emptyState(), minimalDepSummary(), new Map());
        const invData = JSON.parse(fs.readFileSync(path.join(outDir, 'file-inventory.json'), 'utf8'));
        expect(invData.fileCount).toBe(2);
        expect(invData.fileInventory.length).toBe(2);
    });
    it('architecture.json includes severityBreakdown and categoryBreakdown', () => {
        const findings = makeFindings({ category: 'dependency-cycle', severity: 'high' }, { category: 'dependency-cycle', severity: 'high' }, { category: 'high-coupling', severity: 'medium' });
        const outDir = path.join(tmpDir, 'scan-arch-meta');
        writeMultiFileReport(outDir, makeReport({ optimizationFindings: findings }), DEFAULT_OPTS, emptyState(), minimalDepSummary(), new Map());
        const archData = JSON.parse(fs.readFileSync(path.join(outDir, 'architecture.json'), 'utf8'));
        expect(archData.severityBreakdown.high).toBe(2);
        expect(archData.severityBreakdown.medium).toBe(1);
        expect(archData.categoryBreakdown['dependency-cycle']).toBe(2);
        expect(archData.categoryBreakdown['high-coupling']).toBe(1);
    });
    it('code-quality.json includes severityBreakdown and categoryBreakdown', () => {
        const findings = makeFindings({ category: 'function-optimization', severity: 'high' }, { category: 'god-module', severity: 'high' }, { category: 'cognitive-complexity', severity: 'medium' });
        const outDir = path.join(tmpDir, 'scan-qual-meta');
        writeMultiFileReport(outDir, makeReport({ optimizationFindings: findings }), DEFAULT_OPTS, emptyState(), minimalDepSummary(), new Map());
        const qualData = JSON.parse(fs.readFileSync(path.join(outDir, 'code-quality.json'), 'utf8'));
        expect(qualData.severityBreakdown.high).toBe(2);
        expect(qualData.categoryBreakdown['function-optimization']).toBe(1);
        expect(qualData.categoryBreakdown['god-module']).toBe(1);
    });
    it('dead-code.json includes severityBreakdown and categoryBreakdown', () => {
        const findings = makeFindings({ category: 'dead-export', severity: 'high' }, { category: 'dead-export', severity: 'medium' }, { category: 'unused-npm-dependency', severity: 'low' });
        const outDir = path.join(tmpDir, 'scan-dead-meta');
        writeMultiFileReport(outDir, makeReport({ optimizationFindings: findings }), DEFAULT_OPTS, emptyState(), minimalDepSummary(), new Map());
        const deadData = JSON.parse(fs.readFileSync(path.join(outDir, 'dead-code.json'), 'utf8'));
        expect(deadData.severityBreakdown.high).toBe(1);
        expect(deadData.severityBreakdown.medium).toBe(1);
        expect(deadData.severityBreakdown.low).toBe(1);
        expect(deadData.categoryBreakdown['dead-export']).toBe(2);
        expect(deadData.categoryBreakdown['unused-npm-dependency']).toBe(1);
    });
    it('all json files have generatedAt timestamp', () => {
        const outDir = path.join(tmpDir, 'scan-ts');
        writeMultiFileReport(outDir, makeReport(), DEFAULT_OPTS, emptyState(), minimalDepSummary(), new Map());
        for (const file of ['summary.json', 'architecture.json', 'code-quality.json', 'dead-code.json', 'file-inventory.json', 'findings.json']) {
            const data = JSON.parse(fs.readFileSync(path.join(outDir, file), 'utf8'));
            expect(data.generatedAt).toBe('2026-03-17T00:00:00.000Z');
        }
    });
    it('returns correct outputFiles mapping', () => {
        const outDir = path.join(tmpDir, 'scan-ret');
        const result = writeMultiFileReport(outDir, makeReport(), { ...DEFAULT_OPTS, graph: true }, emptyState(), minimalDepSummary(), new Map());
        expect(result.summary).toBe('summary.json');
        expect(result.architecture).toBe('architecture.json');
        expect(result.codeQuality).toBe('code-quality.json');
        expect(result.deadCode).toBe('dead-code.json');
        expect(result.fileInventory).toBe('file-inventory.json');
        expect(result.findings).toBe('findings.json');
        expect(result.graph).toBe('graph.md');
        expect(result.summaryMd).toBe('summary.md');
    });
});
// ─── generateSummaryMd ─────────────────────────────────────────────────────
describe('generateSummaryMd', () => {
    const fakeDir = '/tmp/nonexistent-scan-dir';
    function makeReportForMd(overrides = {}) {
        return {
            generatedAt: '2026-03-17T00:00:00.000Z',
            repoRoot: '/repo',
            options: {},
            parser: { requested: 'auto', effective: 'typescript' },
            summary: { totalFiles: 42, totalFunctions: 318, totalFlows: 1204, totalDependencyFiles: 50, totalPackages: 3 },
            fileInventory: [],
            duplicateFlows: {},
            dependencyGraph: minimalDepSummary({ totalModules: 42, totalEdges: 187, cycles: [{ path: ['a', 'b', 'a'], nodeCount: 2 }], criticalPaths: [] }),
            dependencyFindings: [],
            agentOutput: {
                totalFindings: 5,
                highPriority: 2,
                mediumPriority: 2,
                lowPriority: 1,
                topRecommendations: [
                    { severity: 'high', title: 'Fix cycle', file: 'src/a.ts', category: 'dependency-cycle' },
                ],
                filesWithIssues: [],
            },
            optimizationOpportunities: [],
            optimizationFindings: [],
            parseErrors: [],
            ...overrides,
        };
    }
    it('produces markdown with all major sections', () => {
        const md = generateSummaryMd(fakeDir, makeReportForMd(), { summary: 'summary.json' }, [], [], []);
        expect(md).toContain('# Code Quality Scan Report');
        expect(md).toContain('## Scan Scope');
        expect(md).toContain('## Findings Overview');
        expect(md).toContain('## Architecture Health');
        expect(md).toContain('## Code Quality');
        expect(md).toContain('## Dead Code & Hygiene');
        expect(md).toContain('## Output Files');
    });
    it('includes file counts from summary', () => {
        const md = generateSummaryMd(fakeDir, makeReportForMd(), {}, [], [], []);
        expect(md).toContain('42');
        expect(md).toContain('318');
        expect(md).toContain('1204');
    });
    it('includes severity counts', () => {
        const findings = [
            { id: '1', severity: 'high', category: 'dependency-cycle', file: 'a', lineStart: 1, lineEnd: 1, title: 't', reason: 'r', files: [], suggestedFix: { strategy: 's', steps: [] } },
            { id: '2', severity: 'medium', category: 'dead-export', file: 'b', lineStart: 1, lineEnd: 1, title: 't', reason: 'r', files: [], suggestedFix: { strategy: 's', steps: [] } },
        ];
        const md = generateSummaryMd(fakeDir, makeReportForMd({ optimizationFindings: findings }), {}, [findings[0]], [], [findings[1]]);
        expect(md).toContain('| High | 1 |');
        expect(md).toContain('| Medium | 1 |');
        expect(md).toContain('| **Total** | **2** |');
    });
    it('includes dependency graph metrics', () => {
        const md = generateSummaryMd(fakeDir, makeReportForMd(), {}, [], [], []);
        expect(md).toContain('| Modules | 42 |');
        expect(md).toContain('| Import edges | 187 |');
        expect(md).toContain('| Cycles | 1 |');
    });
    it('includes category breakdowns per section', () => {
        const archFindings = [
            { category: 'dependency-cycle', severity: 'high' },
            { category: 'dependency-cycle', severity: 'high' },
            { category: 'high-coupling', severity: 'medium' },
        ];
        const md = generateSummaryMd(fakeDir, makeReportForMd(), {}, archFindings, [], []);
        expect(md).toContain('`dependency-cycle`: 2');
        expect(md).toContain('`high-coupling`: 1');
    });
    it('includes top recommendations', () => {
        const md = generateSummaryMd(fakeDir, makeReportForMd(), {}, [], [], []);
        expect(md).toContain('## Top Recommendations');
        expect(md).toContain('Fix cycle');
        expect(md).toContain('src/a.ts');
    });
    it('includes parse errors when present', () => {
        const report = makeReportForMd({ parseErrors: [{ file: 'bad.ts', message: 'Unexpected token' }] });
        const md = generateSummaryMd(fakeDir, report, {}, [], [], []);
        expect(md).toContain('## Parse Errors');
        expect(md).toContain('bad.ts');
        expect(md).toContain('Unexpected token');
    });
    it('does not include parse errors section when none exist', () => {
        const md = generateSummaryMd(fakeDir, makeReportForMd(), {}, [], [], []);
        expect(md).not.toContain('## Parse Errors');
    });
    it('links output files in the table', () => {
        const outputFiles = { summary: 'summary.json', architecture: 'architecture.json', summaryMd: 'summary.md' };
        const md = generateSummaryMd(fakeDir, makeReportForMd(), outputFiles, [], [], []);
        expect(md).toContain('[`summary.json`](./summary.json)');
        expect(md).toContain('[`architecture.json`](./architecture.json)');
        expect(md).toContain('[`summary.md`](./summary.md)');
    });
    it('shows file sizes when files exist', () => {
        const realDir = fs.mkdtempSync(path.join(os.tmpdir(), 'summary-size-'));
        try {
            fs.writeFileSync(path.join(realDir, 'architecture.json'), '{"x":1}', 'utf8');
            fs.writeFileSync(path.join(realDir, 'big.json'), 'x'.repeat(2048), 'utf8');
            const outputFiles = { architecture: 'architecture.json', big: 'big.json' };
            const md = generateSummaryMd(realDir, makeReportForMd(), outputFiles, [], [], []);
            expect(md).toContain('| Size |');
            expect(md).toMatch(/\d+(\.\d+)?\s*(B|KB|MB)/);
        }
        finally {
            fs.rmSync(realDir, { recursive: true, force: true });
        }
    });
});
// ─── end-to-end output validation ───────────────────────────────────────────
describe('end-to-end output validation', () => {
    it('produces valid summary.md with all sections', async () => {
        const { execSync } = await import('node:child_process');
        const dir = '/tmp/cq-test-' + Date.now();
        const scriptPath = path.join(process.cwd(), 'scripts', 'index.js');
        const monorepoRoot = path.join(process.cwd(), '..', '..');
        try {
            execSync(`node "${scriptPath}" --root "${monorepoRoot}" --out "${dir}" --no-tree`, { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 });
            expect(fs.existsSync(`${dir}/summary.md`)).toBe(true);
            expect(fs.existsSync(`${dir}/summary.json`)).toBe(true);
            expect(fs.existsSync(`${dir}/architecture.json`)).toBe(true);
            expect(fs.existsSync(`${dir}/code-quality.json`)).toBe(true);
            expect(fs.existsSync(`${dir}/dead-code.json`)).toBe(true);
            expect(fs.existsSync(`${dir}/findings.json`)).toBe(true);
            expect(fs.existsSync(`${dir}/file-inventory.json`)).toBe(true);
            const summary = fs.readFileSync(`${dir}/summary.md`, 'utf8');
            expect(summary).toContain('## Scan Scope');
            expect(summary).toContain('## Findings Overview');
            expect(summary).toContain('## Architecture Health');
            expect(summary).toContain('## Code Quality');
            expect(summary).toContain('## Dead Code & Hygiene');
            expect(summary).toContain('## Output Files');
            expect(summary).toContain('`dependency-cycle`');
            expect(summary).toContain('`dead-export`');
            expect(summary).toContain('`cognitive-complexity`');
            const findingsData = JSON.parse(fs.readFileSync(`${dir}/findings.json`, 'utf8'));
            expect(findingsData.optimizationFindings).toBeDefined();
            expect(Array.isArray(findingsData.optimizationFindings)).toBe(true);
            for (const f of findingsData.optimizationFindings.slice(0, 10)) {
                expect(f.id).toBeDefined();
                expect(f.severity).toBeDefined();
                expect(f.category).toBeDefined();
                expect(f.file).toBeDefined();
                expect(f.lineStart).toBeDefined();
                expect(f.lineEnd).toBeDefined();
                expect(f.title).toBeDefined();
                expect(f.reason).toBeDefined();
                expect(f.suggestedFix).toBeDefined();
                expect(f.suggestedFix.strategy).toBeDefined();
                expect(f.suggestedFix.steps).toBeDefined();
            }
        }
        finally {
            try {
                execSync(`rm -rf "${dir}"`, { encoding: 'utf8' });
            }
            catch {
                // ignore cleanup errors
            }
        }
    }, 30000);
});

import { describe, expect, it } from 'vitest';

import {
  computeReportAnalysisSummary,
  enrichFileInventoryEntries,
  enrichFindings,
} from './analysis.js';

import type { GraphAnalyticsSummary } from '../analysis/graph-analytics.js';
import type { FileEntry, Finding } from '../types/index.js';

function makeFileEntry(override: Partial<FileEntry> = {}): FileEntry {
  return {
    package: 'pkg',
    file: 'src/file.ts',
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
    ...override,
  };
}

function makeFinding(override: Partial<Finding> = {}): Finding {
  return {
    id: 'test-1',
    severity: 'medium',
    category: 'function-optimization',
    file: 'src/file.ts',
    lineStart: 10,
    lineEnd: 20,
    title: 'Test finding',
    reason: 'Test reason',
    files: ['src/file.ts'],
    suggestedFix: { strategy: 'strategy', steps: ['step1'] },
    ...override,
  };
}

function makeGraphAnalytics(
  override: Partial<GraphAnalyticsSummary> = {}
): GraphAnalyticsSummary {
  return {
    sccClusters: [],
    chokepoints: [],
    packageGraphSummary: {
      packageCount: 0,
      edgeCount: 0,
      packages: [],
      hotspots: [],
    },
    articulationPoints: [],
    bridgeEdges: [],
    ...override,
  };
}

describe('enrichFileInventoryEntries', () => {
  it('adds effectProfile when topLevelEffects present', () => {
    const entry = makeFileEntry({
      topLevelEffects: [
        {
          kind: 'eval',
          lineStart: 1,
          lineEnd: 1,
          detail: 'eval call',
          weight: 10,
          confidence: 'high',
        },
      ],
    });
    const [enriched] = enrichFileInventoryEntries([entry]);
    expect(enriched.effectProfile).toBeDefined();
    expect(enriched.effectProfile!.totalEffects).toBe(1);
    expect(enriched.effectProfile!.highestRisk).toBe('eval');
  });

  it('adds symbolUsageSummary with declaredExportCount and importedSymbolCount', () => {
    const entry = makeFileEntry({
      dependencyProfile: {
        internalDependencies: [],
        externalDependencies: ['lodash'],
        unresolvedDependencies: [],
        declaredExports: [
          { name: 'foo', kind: 'value' },
          { name: 'bar', kind: 'value' },
        ],
        importedSymbols: [
          {
            sourceModule: 'lodash',
            importedName: 'get',
            localName: 'get',
            isTypeOnly: false,
          },
        ],
        reExports: [],
      },
    });
    const [enriched] = enrichFileInventoryEntries([entry]);
    expect(enriched.symbolUsageSummary).toBeDefined();
    expect(enriched.symbolUsageSummary!.declaredExportCount).toBe(2);
    expect(enriched.symbolUsageSummary!.importedSymbolCount).toBe(1);
  });

  it('adds boundaryRoleHints based on file path', () => {
    const entry = makeFileEntry({ file: 'src/index.ts' });
    const [enriched] = enrichFileInventoryEntries([entry]);
    expect(enriched.boundaryRoleHints).toBeDefined();
    expect(enriched.boundaryRoleHints!.length).toBeGreaterThan(0);
    expect(enriched.boundaryRoleHints!.some(h => h.role === 'entrypoint')).toBe(
      true
    );
  });

  it('adds cfgFlags when flowEnabled=true', () => {
    const entry = makeFileEntry();
    const [enriched] = enrichFileInventoryEntries([entry], {
      flowEnabled: true,
    });
    expect(enriched.cfgFlags).toBeDefined();
    expect(typeof enriched.cfgFlags!.exitPointCount).toBe('number');
    expect(typeof enriched.cfgFlags!.hasValidationChecks).toBe('boolean');
  });

  it('does NOT add cfgFlags when flowEnabled=false', () => {
    const entry = makeFileEntry();
    const [enriched] = enrichFileInventoryEntries([entry], {
      flowEnabled: false,
    });
    expect(enriched.cfgFlags).toBeUndefined();
  });

  it('preserves existing effectProfile if already set', () => {
    const existing = {
      totalEffects: 99,
      totalWeight: 100,
      byKind: {},
      highestRisk: null,
    };
    const entry = makeFileEntry({
      effectProfile: existing,
      topLevelEffects: [
        {
          kind: 'eval',
          lineStart: 1,
          lineEnd: 1,
          detail: 'eval call',
          weight: 10,
          confidence: 'high',
        },
      ],
    });
    const [enriched] = enrichFileInventoryEntries([entry]);
    expect(enriched.effectProfile!.totalEffects).toBe(99);
  });

  it('empty entry gets symbolUsageSummary with zeros', () => {
    const entry = makeFileEntry();
    const [enriched] = enrichFileInventoryEntries([entry]);
    expect(enriched.symbolUsageSummary).toBeDefined();
    expect(enriched.symbolUsageSummary!.declaredExportCount).toBe(0);
    expect(enriched.symbolUsageSummary!.importedSymbolCount).toBe(0);
    expect(enriched.symbolUsageSummary!.internalImportCount).toBe(0);
    expect(enriched.symbolUsageSummary!.externalImportCount).toBe(0);
    expect(enriched.symbolUsageSummary!.reExportCount).toBe(0);
  });

  it('adds shared-utility boundary role hint when many exports and few imports', () => {
    const entry = makeFileEntry({
      file: 'src/utils/helpers.ts',
      dependencyProfile: {
        internalDependencies: [],
        externalDependencies: [],
        unresolvedDependencies: [],
        declaredExports: Array.from({ length: 10 }, (_, i) => ({
          name: `fn${i}`,
          kind: 'value' as const,
        })),
        importedSymbols: [
          {
            sourceModule: './other',
            resolvedModule: 'src/other.ts',
            importedName: 'x',
            localName: 'x',
            isTypeOnly: false,
          },
        ],
        reExports: [],
      },
    });
    const [enriched] = enrichFileInventoryEntries([entry]);
    expect(
      enriched.boundaryRoleHints!.some(h => h.role === 'shared-utility')
    ).toBe(true);
  });

  it('adds runtime-bootstrap hint when topLevelEffects present', () => {
    const entry = makeFileEntry({
      file: 'src/bootstrap.ts',
      topLevelEffects: [
        {
          kind: 'eval',
          lineStart: 1,
          lineEnd: 1,
          detail: 'eval',
          weight: 5,
          confidence: 'medium',
        },
      ],
    });
    const [enriched] = enrichFileInventoryEntries([entry]);
    expect(
      enriched.boundaryRoleHints!.some(h => h.role === 'runtime-bootstrap')
    ).toBe(true);
  });
});

describe('enrichFindings', () => {
  it('adds analysisLens based on category', () => {
    const graphFinding = makeFinding({
      id: 'g1',
      category: 'dependency-cycle',
    });
    const astFinding = makeFinding({
      id: 'a1',
      category: 'function-optimization',
    });
    const hybridFinding = makeFinding({
      id: 'h1',
      category: 'hardcoded-secret',
    });
    const results = enrichFindings(
      [graphFinding, astFinding, hybridFinding],
      [],
      [],
      null
    );
    expect(results[0].analysisLens).toBe('graph');
    expect(results[1].analysisLens).toBe('ast');
    expect(results[2].analysisLens).toBe('hybrid');
  });

  it('adds ruleId in format {lens}.{category} when not set', () => {
    const finding = makeFinding({ category: 'function-optimization' });
    const [enriched] = enrichFindings([finding], [], [], null);
    expect(enriched.ruleId).toBe('ast.function-optimization');
  });

  it('preserves existing ruleId when already set', () => {
    const finding = makeFinding({ ruleId: 'custom.rule' });
    const [enriched] = enrichFindings([finding], [], [], null);
    expect(enriched.ruleId).toBe('custom.rule');
  });

  it('adds confidence based on severity and lens', () => {
    const critical = makeFinding({ id: 'c1', severity: 'critical' });
    const graphMedium = makeFinding({
      id: 'g1',
      severity: 'medium',
      category: 'dependency-cycle',
    });
    const astLow = makeFinding({
      id: 'a1',
      severity: 'low',
      category: 'function-optimization',
    });
    const results = enrichFindings(
      [critical, graphMedium, astLow],
      [],
      [],
      null
    );
    expect(results[0].confidence).toBe('high');
    expect(results[1].confidence).toBe('medium');
    expect(results[2].confidence).toBe('low');
  });

  it('adds correlatedSignals including hot-file when file is in hotFiles', () => {
    const finding = makeFinding({ file: 'src/hot.ts' });
    const hotFiles = [
      {
        file: 'src/hot.ts',
        riskScore: 10,
        fanIn: 5,
        fanOut: 5,
        complexityScore: 3,
        exportCount: 2,
        inCycle: false,
        onCriticalPath: false,
      },
    ];
    const [enriched] = enrichFindings([finding], [], hotFiles, null);
    expect(enriched.correlatedSignals).toContain('hot-file');
  });

  it('adds correlatedSignals cycle-context when file is in SCC cluster', () => {
    const finding = makeFinding({ file: 'src/cycle.ts' });
    const ga = makeGraphAnalytics({
      sccClusters: [
        {
          id: 'scc-0',
          files: ['src/cycle.ts', 'src/other.ts'],
          nodeCount: 2,
          edgeCount: 2,
          entryEdges: 1,
          exitEdges: 1,
          hubFiles: [],
        },
      ],
    });
    const [enriched] = enrichFindings([finding], [], [], ga);
    expect(enriched.correlatedSignals).toContain('cycle-context');
  });

  it('adds recommendedValidation with tools array', () => {
    const finding = makeFinding();
    const [enriched] = enrichFindings([finding], [], [], null);
    expect(enriched.recommendedValidation).toBeDefined();
    expect(Array.isArray(enriched.recommendedValidation!.tools)).toBe(true);
    expect(enriched.recommendedValidation!.tools.length).toBeGreaterThan(0);
  });

  it('adds flowTrace when flowEnabled=true and evidence has propagationSteps', () => {
    const finding = makeFinding({
      evidence: { propagationSteps: ['src/a.ts:10-20', 'src/b.ts:30'] },
    });
    const [enriched] = enrichFindings([finding], [], [], null, {
      flowEnabled: true,
    });
    expect(enriched.flowTrace).toBeDefined();
    expect(enriched.flowTrace!.length).toBe(2);
    expect(enriched.flowTrace![0].file).toBe('src/a.ts');
  });

  it('does NOT add flowTrace when flowEnabled=false', () => {
    const finding = makeFinding({
      evidence: { propagationSteps: ['src/a.ts:10-20'] },
    });
    const [enriched] = enrichFindings([finding], [], [], null, {
      flowEnabled: false,
    });
    expect(enriched.flowTrace).toBeUndefined();
  });

  it('adds paired:{category} to correlatedSignals for multiple findings on same file', () => {
    const f1 = makeFinding({
      id: 'f1',
      category: 'function-optimization',
      file: 'src/shared.ts',
    });
    const f2 = makeFinding({
      id: 'f2',
      category: 'cognitive-complexity',
      file: 'src/shared.ts',
    });
    const results = enrichFindings([f1, f2], [], [], null);
    expect(results[0].correlatedSignals).toContain(
      'paired:cognitive-complexity'
    );
    expect(results[1].correlatedSignals).toContain(
      'paired:function-optimization'
    );
  });
});

describe('computeReportAnalysisSummary', () => {
  it('returns graphSignals when graphAnalytics has chokepoints', () => {
    const ga = makeGraphAnalytics({
      chokepoints: [
        {
          file: 'src/hub.ts',
          score: 50,
          reasons: ['high fan-in'],
          fanIn: 10,
          fanOut: 5,
          articulation: true,
          bridgeCount: 1,
          cycleClusterCount: 0,
          onCriticalPath: true,
        },
      ],
    });
    const result = computeReportAnalysisSummary([], [], [], ga);
    expect(result.graphSignals.length).toBeGreaterThan(0);
    expect(result.graphSignals[0].kind).toBe('structural-chokepoint');
  });

  it('returns graphSignals for cycle clusters', () => {
    const ga = makeGraphAnalytics({
      sccClusters: [
        {
          id: 'scc-0',
          files: ['a.ts', 'b.ts'],
          nodeCount: 2,
          edgeCount: 3,
          entryEdges: 1,
          exitEdges: 1,
          hubFiles: ['a.ts'],
        },
      ],
    });
    const result = computeReportAnalysisSummary([], [], [], ga);
    expect(result.graphSignals.some(s => s.kind === 'cycle-cluster')).toBe(
      true
    );
  });

  it('returns astSignals for low-cohesion + feature-envy pair', () => {
    const entry = makeFileEntry({ file: 'src/leak.ts' });
    const findings = [
      makeFinding({ id: 'lc', category: 'low-cohesion', file: 'src/leak.ts' }),
      makeFinding({ id: 'fe', category: 'feature-envy', file: 'src/leak.ts' }),
    ];
    const enriched = enrichFindings(findings, [entry], [], null);
    const result = computeReportAnalysisSummary(enriched, [entry], [], null);
    expect(result.astSignals.length).toBeGreaterThan(0);
    expect(result.astSignals[0].kind).toBe('boundary-leak-shape');
  });

  it('returns combined interpretation with shared file and confidence high', () => {
    const entry = makeFileEntry({ file: 'src/shared.ts' });
    const ga = makeGraphAnalytics({
      chokepoints: [
        {
          file: 'src/shared.ts',
          score: 50,
          reasons: ['high fan-in'],
          fanIn: 10,
          fanOut: 5,
          articulation: true,
          bridgeCount: 1,
          cycleClusterCount: 0,
          onCriticalPath: true,
        },
      ],
    });
    const findings = [
      makeFinding({
        id: 'lc',
        category: 'low-cohesion',
        file: 'src/shared.ts',
      }),
      makeFinding({
        id: 'fe',
        category: 'feature-envy',
        file: 'src/shared.ts',
      }),
    ];
    const enriched = enrichFindings(findings, [entry], [], ga);
    const result = computeReportAnalysisSummary(enriched, [entry], [], ga);
    expect(result.combinedInterpretation).not.toBeNull();
    expect(result.combinedInterpretation!.confidence).toBe('high');
  });

  it('returns combined interpretation with different files and confidence medium', () => {
    const entry1 = makeFileEntry({ file: 'src/graph-file.ts' });
    const entry2 = makeFileEntry({ file: 'src/ast-file.ts' });
    const ga = makeGraphAnalytics({
      chokepoints: [
        {
          file: 'src/graph-file.ts',
          score: 50,
          reasons: ['high fan-in'],
          fanIn: 10,
          fanOut: 5,
          articulation: false,
          bridgeCount: 0,
          cycleClusterCount: 0,
          onCriticalPath: true,
        },
      ],
    });
    const findings = [
      makeFinding({
        id: 'lc',
        category: 'low-cohesion',
        file: 'src/ast-file.ts',
      }),
      makeFinding({
        id: 'fe',
        category: 'feature-envy',
        file: 'src/ast-file.ts',
      }),
    ];
    const enriched = enrichFindings(findings, [entry1, entry2], [], ga);
    const result = computeReportAnalysisSummary(
      enriched,
      [entry1, entry2],
      [],
      ga
    );
    expect(result.combinedInterpretation).not.toBeNull();
    expect(result.combinedInterpretation!.confidence).toBe('medium');
  });

  it('returns investigationPrompts based on signals', () => {
    const ga = makeGraphAnalytics({
      chokepoints: [
        {
          file: 'src/hub.ts',
          score: 50,
          reasons: ['high fan-in'],
          fanIn: 10,
          fanOut: 5,
          articulation: true,
          bridgeCount: 1,
          cycleClusterCount: 0,
          onCriticalPath: true,
        },
      ],
    });
    const result = computeReportAnalysisSummary([], [], [], ga);
    expect(Array.isArray(result.investigationPrompts)).toBe(true);
    expect(result.investigationPrompts.length).toBeGreaterThan(0);
  });

  it('empty inputs produce all fields present but empty/null', () => {
    const result = computeReportAnalysisSummary([], [], [], null);
    expect(result.graphSignals).toEqual([]);
    expect(result.astSignals).toEqual([]);
    expect(result.combinedSignals).toEqual([]);
    expect(result.strongestGraphSignal).toBeNull();
    expect(result.strongestAstSignal).toBeNull();
    expect(result.combinedInterpretation).toBeNull();
    expect(result.recommendedValidation).toBeNull();
    expect(Array.isArray(result.investigationPrompts)).toBe(true);
  });

  it('only graph signal produces combined interpretation using that signal', () => {
    const ga = makeGraphAnalytics({
      chokepoints: [
        {
          file: 'src/hub.ts',
          score: 50,
          reasons: ['high fan-in'],
          fanIn: 10,
          fanOut: 5,
          articulation: false,
          bridgeCount: 0,
          cycleClusterCount: 0,
          onCriticalPath: false,
        },
      ],
    });
    const result = computeReportAnalysisSummary([], [], [], ga);
    expect(result.strongestGraphSignal).not.toBeNull();
    expect(result.strongestAstSignal).toBeNull();
    expect(result.combinedInterpretation).not.toBeNull();
    expect(result.combinedInterpretation!.lens).toBe('graph');
  });

  it('returns high confidence for cycle cluster with nodeCount >= 5', () => {
    const ga = makeGraphAnalytics({
      sccClusters: [
        {
          id: 'scc-large',
          files: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'],
          nodeCount: 5,
          edgeCount: 8,
          entryEdges: 1,
          exitEdges: 1,
          hubFiles: ['a.ts'],
        },
      ],
    });
    const result = computeReportAnalysisSummary([], [], [], ga);
    const cycleSignal = result.graphSignals.find(
      s => s.kind === 'cycle-cluster'
    );
    expect(cycleSignal).toBeDefined();
    expect(cycleSignal!.confidence).toBe('high');
  });

  it('adds hybrid investigation prompt when combinedInterpretation exists but confidence is not high', () => {
    const entry1 = makeFileEntry({ file: 'src/graph-only.ts' });
    const entry2 = makeFileEntry({ file: 'src/ast-only.ts' });
    const ga = makeGraphAnalytics({
      chokepoints: [
        {
          file: 'src/graph-only.ts',
          score: 50,
          reasons: ['high fan-in'],
          fanIn: 10,
          fanOut: 5,
          articulation: false,
          bridgeCount: 0,
          cycleClusterCount: 0,
          onCriticalPath: true,
        },
      ],
    });
    const findings = [
      makeFinding({
        id: 'lc',
        category: 'low-cohesion',
        file: 'src/ast-only.ts',
      }),
      makeFinding({
        id: 'fe',
        category: 'feature-envy',
        file: 'src/ast-only.ts',
      }),
    ];
    const enriched = enrichFindings(findings, [entry1, entry2], [], ga);
    const result = computeReportAnalysisSummary(
      enriched,
      [entry1, entry2],
      [],
      ga
    );
    expect(result.combinedInterpretation).not.toBeNull();
    expect(result.combinedInterpretation!.confidence).toBe('medium');
    expect(
      result.investigationPrompts.some(p => p.includes('hybrid investigation'))
    ).toBe(true);
  });

  it('returns high confidence for package hotspot with edges >= 8', () => {
    const ga = makeGraphAnalytics({
      packageGraphSummary: {
        packageCount: 2,
        edgeCount: 20,
        packages: [],
        hotspots: [{ from: 'pkg-a', to: 'pkg-b', edges: 10 }],
      },
    });
    const result = computeReportAnalysisSummary([], [], [], ga);
    const pkgSignal = result.graphSignals.find(
      s => s.kind === 'package-chatter'
    );
    expect(pkgSignal).toBeDefined();
    expect(pkgSignal!.confidence).toBe('high');
  });

  it('returns mega-folder graph signal when mega-folder finding is present', () => {
    const findings = [
      makeFinding({
        id: 'mega',
        category: 'mega-folder',
        file: 'src/core/index.ts',
        files: ['src/core/a.ts', 'src/core/b.ts'],
        evidence: {
          folderPath: 'src/core',
          fileCount: 42,
          concentration: 0.54,
        },
      }),
    ];
    const result = computeReportAnalysisSummary(findings, [], [], null);
    const mega = result.graphSignals.find(
      s => s.kind === 'mega-folder-cluster'
    );
    expect(mega).toBeDefined();
    expect(mega!.summary).toContain('src/core');
    expect(
      result.investigationPrompts.some(p => p.includes('migration script'))
    ).toBe(true);
  });

  it('returns hidden-initialization ast signal when entry has effects and import-side-effect-risk', () => {
    const entry = makeFileEntry({
      file: 'src/init.ts',
      effectProfile: {
        totalEffects: 2,
        totalWeight: 15,
        byKind: {},
        highestRisk: 'eval' as const,
      },
      topLevelEffects: [
        {
          kind: 'eval',
          lineStart: 1,
          lineEnd: 1,
          detail: 'eval',
          weight: 10,
          confidence: 'high',
        },
      ],
    });
    const findings = [
      makeFinding({
        id: 'es',
        category: 'import-side-effect-risk',
        file: 'src/init.ts',
      }),
    ];
    const enriched = enrichFindings(findings, [entry], [], null);
    const result = computeReportAnalysisSummary(enriched, [entry], [], null);
    const hiddenSignal = result.astSignals.find(
      s => s.kind === 'hidden-initialization'
    );
    expect(hiddenSignal).toBeDefined();
  });

  it('returns orchestration-duplication ast signal when file has duplicate-flow-structure and function-optimization', () => {
    const entry = makeFileEntry({ file: 'src/orchestrate.ts' });
    const findings = [
      makeFinding({
        id: 'df',
        category: 'duplicate-flow-structure',
        file: 'src/orchestrate.ts',
      }),
      makeFinding({
        id: 'fo',
        category: 'function-optimization',
        file: 'src/orchestrate.ts',
      }),
    ];
    const enriched = enrichFindings(findings, [entry], [], null);
    const result = computeReportAnalysisSummary(enriched, [entry], [], null);
    const orchSignal = result.astSignals.find(
      s => s.kind === 'orchestration-duplication'
    );
    expect(orchSignal).toBeDefined();
  });

  it('adds hotFiles prompt when hotFiles provided', () => {
    const hotFiles = [
      {
        file: 'src/hot.ts',
        riskScore: 50,
        fanIn: 5,
        fanOut: 5,
        complexityScore: 3,
        exportCount: 2,
        inCycle: false,
        onCriticalPath: false,
      },
    ];
    const result = computeReportAnalysisSummary([], [], hotFiles, null);
    expect(
      result.investigationPrompts.some(
        p => p.includes('hotspot') && p.includes('hot.ts')
      )
    ).toBe(true);
  });

  it('adds critical-path-context to correlatedSignals when finding file is on critical path', () => {
    const finding = makeFinding({ file: 'src/critical.ts' });
    const ga = makeGraphAnalytics({
      chokepoints: [
        {
          file: 'src/critical.ts',
          score: 50,
          reasons: ['on critical path'],
          fanIn: 5,
          fanOut: 5,
          articulation: false,
          bridgeCount: 0,
          cycleClusterCount: 0,
          onCriticalPath: true,
        },
      ],
    });
    const [enriched] = enrichFindings([finding], [], [], ga);
    expect(enriched.correlatedSignals).toContain('critical-path-context');
  });

  it('adds top-level-effects to correlatedSignals when entry has effectProfile', () => {
    const entry = makeFileEntry({
      file: 'src/effects.ts',
      effectProfile: {
        totalEffects: 2,
        totalWeight: 10,
        byKind: {},
        highestRisk: 'eval' as const,
      },
    });
    const finding = makeFinding({ file: 'src/effects.ts' });
    const [enriched] = enrichFindings([finding], [entry], [], null);
    expect(enriched.correlatedSignals).toContain('top-level-effects');
  });
});

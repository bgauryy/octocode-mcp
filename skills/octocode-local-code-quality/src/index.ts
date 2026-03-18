#!/usr/bin/env node
/**
 * Analyze workspace ASTs and produce duplicate-flow detection plus an
 * agent-friendly flow/function report with actionable fixes.
 *
 * Usage:
 *   node scripts/index.js
 *   node scripts/index.js --parser tree-sitter --json --out .octocode/scan/scan.json
 */

import fs from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';
import type {
  AnalysisOptions, FileEntry, FlowMapEntry, ControlMapEntry,
  TreeEntry, DependencyState, PackageFileSummary, DuplicateGroup,
  RedundantFlowGroup, DuplicateFlowHint, Finding, DependencySummary,
  FileCriticality, ModuleCount, Cycle, CriticalPath, CriticalModule,
  WalkResult,
} from './types.js';
import { SEVERITY_ORDER, PILLAR_CATEGORIES } from './types.js';
import { parseArgs } from './cli.js';
import { canonicalScriptKind, increment, isTestFile, renderTreesText } from './utils.js';
import {
  loadCache,
  saveCache,
  clearCache,
  createEmptyCache,
  isCacheHit,
  getCachedResult,
  setCacheEntry,
} from './cache.js';
import { collectDependencyProfile, dependencyProfileToRecord } from './dependencies.js';
import { collectFiles, safeRead, listWorkspacePackages, fileSummaryWithFindings } from './discovery.js';
import { analyzeSourceFile, buildDependencyCriticality } from './ts-analyzer.js';
import { analyzeTreeSitterFile, resolveTreeSitter } from './tree-sitter-analyzer.js';
import { createSemanticContext, analyzeSemanticProfile, collectAllAbsoluteFiles } from './semantic.js';
import type { SemanticContext, SemanticProfile } from './semantic.js';
import { runSemanticDetectors } from './semantic-detectors.js';
import { SEMANTIC_CATEGORIES } from './types.js';
import {
  buildConsumedFromModule,
  detectSdpViolations,
  detectHighCoupling,
  detectGodModuleCoupling,
  detectOrphanModules,
  detectUnreachableModules,
  detectUnusedNpmDeps,
  detectBoundaryViolations,
  detectBarrelExplosion,
  detectGodModules,
  detectGodFunctions,
  detectCognitiveComplexity,
  detectLayerViolations,
  detectLowCohesion,
  detectInferredLayerViolations,
  computeHotFiles,
  detectExcessiveParameters,
  detectEmptyCatchBlocks,
  detectSwitchNoDefault,
  detectHighCyclomaticDensity,
  detectUnsafeAny,
  detectMagicNumbers,
  detectHighHalsteadEffort,
  detectLowMaintainability,
  detectDuplicateFunctionBodies,
  detectDuplicateFlowStructures,
  detectFunctionOptimization,
  detectTestOnlyModules,
  detectDependencyCycles,
  detectCriticalPaths,
  detectDeadExports,
  detectDeadReExports,
  detectDistanceFromMainSequence,
  detectFeatureEnvy,
  detectUntestedCriticalCode,
  detectTypeAssertionEscape,
  detectMissingErrorBoundary,
  detectPromiseMisuse,
  detectAwaitInLoop,
  detectSyncIo,
  detectUnclearedTimers,
  detectListenerLeakRisk,
  detectUnboundedCollection,
  detectSimilarFunctionBodies,
  detectImportSideEffectRisk,
} from './architecture.js';
import {
  detectHardcodedSecrets,
  detectEvalUsage,
  detectUnsafeHtml,
  detectSqlInjectionRisk,
  detectUnsafeRegex,
  detectUnvalidatedInputSink,
  detectInputPassthroughRisk,
  detectPrototypePollutionRisk,
  detectPathTraversalRisk,
  detectCommandInjectionRisk,
} from './security-detectors.js';
import {
  detectLowAssertionDensity,
  detectTestNoAssertion,
  detectExcessiveMocking,
  detectSharedMutableState,
  detectMissingTestCleanup,
  detectFocusedTests,
  detectFakeTimersWithoutRestore,
  detectMissingMockRestoration,
} from './test-quality-detectors.js';
import { buildAdvancedGraphFindings, computeGraphAnalytics } from './graph-analytics.js';
import { computeReportAnalysisSummary, enrichFileInventoryEntries, enrichFindings } from './report-analysis.js';

export const REPORT_SCHEMA_VERSION = '1.1.0';

// ─── Output Category Groups (single source of truth: PILLAR_CATEGORIES) ─────

export const ARCHITECTURE_CATEGORIES = new Set(PILLAR_CATEGORIES['architecture']);
export const CODE_QUALITY_CATEGORIES = new Set(PILLAR_CATEGORIES['code-quality']);
export const DEAD_CODE_CATEGORIES = new Set(PILLAR_CATEGORIES['dead-code']);
export const SECURITY_CATEGORIES = new Set(PILLAR_CATEGORIES['security']);
export const TEST_QUALITY_CATEGORIES = new Set(PILLAR_CATEGORIES['test-quality']);

// ─── Dependency Graph Analysis ───────────────────────────────────────────────

function buildDependencySummary(dependencyState: DependencyState, fileCriticalityByPath: Map<string, FileCriticality>, options: AnalysisOptions): DependencySummary {
  const allFiles = [...dependencyState.files].sort();
  let totalEdges = 0;
  let unresolvedEdgeCount = 0;
  const outgoingCounts: ModuleCount[] = [];
  const inboundCounts: ModuleCount[] = [];

  for (const file of allFiles) {
    totalEdges += dependencyState.outgoing.get(file)?.size || 0;
    const record = dependencyProfileToRecord(file, dependencyState);
    const crit = fileCriticalityByPath.get(file) || { score: 1 };
    outgoingCounts.push({ file, count: record.outboundCount, score: crit.score });
    inboundCounts.push({ file, count: record.inboundCount, score: crit.score });
    unresolvedEdgeCount += record.unresolvedDependencyCount;
  }

  const roots = allFiles.filter((file) => {
    const inCount = (dependencyState.incoming.get(file) || new Set()).size;
    return inCount === 0;
  });

  const leaves = allFiles.filter((file) => {
    const outCount = (dependencyState.outgoing.get(file) || new Set()).size;
    return outCount === 0;
  });

  const testOnlyModules = allFiles
    .filter((file) => !isTestFile(file))
    .filter((file) => {
      const prodIn = dependencyState.incomingFromProduction.get(file);
      const testIn = dependencyState.incomingFromTests.get(file);
      return (!prodIn || prodIn.size === 0) && (testIn && testIn.size > 0);
    })
    .map((file) => ({
      ...dependencyProfileToRecord(file, dependencyState),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));

  const criticalNodes = allFiles
    .map((file) => ({ ...dependencyProfileToRecord(file, dependencyState), ...(fileCriticalityByPath.get(file) || {} as Partial<FileCriticality>) }))
    .filter((node) => (node.score || 0) > 12 || node.outboundCount > 5 || node.inboundCount > 8)
    .sort((a, b) => ((b.score || 0) + b.inboundCount * 0.8 + b.outboundCount * 0.4) - ((a.score || 0) + a.inboundCount * 0.8 + a.outboundCount * 0.4))
    .slice(0, 150)
    .map((node) => ({
      ...node,
      score: Math.round(node.score || 0),
      riskBand: (node.score || 0) >= 60 ? 'high' : (node.score || 0) >= 30 ? 'medium' : 'low',
    }));

  const cycles = computeDependencyCycles(dependencyState);
  const criticalPaths = computeDependencyCriticalPaths(dependencyState, fileCriticalityByPath, options);

  return {
    totalModules: allFiles.length,
    totalEdges,
    unresolvedEdgeCount,
    externalDependencyFiles: [...dependencyState.externalCounts.keys()].length,
    rootsCount: roots.length,
    leavesCount: leaves.length,
    roots: roots.slice(0, 20),
    leaves: leaves.slice(0, 20),
    criticalModules: criticalNodes.slice(0, 20) as CriticalModule[],
    testOnlyModules: testOnlyModules.slice(0, 50),
    unresolvedSample: unresolvedEdgeCount > 0 ? [...dependencyState.unresolvedCounts.keys()].slice(0, 40) : [],
    outgoingTop: outgoingCounts.sort((a, b) => b.count - a.count).slice(0, 20),
    inboundTop: inboundCounts.sort((a, b) => b.count - a.count).slice(0, 20),
    cycles: cycles.slice(0, 20),
    criticalPaths: criticalPaths.slice(0, Math.max(1, options.deepLinkTopN)),
  };
}

export function computeDependencyCycles(dependencyState: DependencyState): Cycle[] {
  const cycles: Cycle[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const activeStack: string[] = [];
  const seenCycles = new Set<string>();

  const canonicalizeCycle = (cyclePath: string[]): string => {
    const rotated = [...cyclePath];
    let best = rotated.slice();
    for (let i = 1; i < rotated.length; i++) {
      const candidate = [...rotated.slice(i), ...rotated.slice(0, i)];
      if (candidate.join(' => ') < best.join(' => ')) {
        best = candidate;
      }
    }
    return best.join(' => ');
  };

  const visit = (node: string): void => {
    if (visited.has(node)) return;
    if (visiting.has(node)) return;

    visiting.add(node);
    activeStack.push(node);

    const outgoing = dependencyState.outgoing.get(node) || new Set();
    for (const dep of outgoing) {
      const idx = activeStack.indexOf(dep);
      if (idx !== -1) {
        const rawCycle = [...activeStack.slice(idx), dep];
        const normalized = canonicalizeCycle(rawCycle);
        if (!seenCycles.has(normalized)) {
          seenCycles.add(normalized);
          cycles.push({
            path: rawCycle,
            nodeCount: rawCycle.length - 1,
          });
        }
        continue;
      }

      if (dependencyState.files.has(dep)) {
        visit(dep);
      }
    }

    activeStack.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of dependencyState.files) {
    visit(node);
  }

  return cycles.sort((a, b) => b.nodeCount - a.nodeCount);
}

export function computeDependencyCriticalPaths(dependencyState: DependencyState, fileCriticalityByPath: Map<string, FileCriticality>, options: AnalysisOptions): CriticalPath[] {
  const memo = new Map<string, WalkResult>();
  const visiting = new Set<string>();

  const nodeScore = (file: string): number => {
    const entry = fileCriticalityByPath.get(file);
    return entry ? entry.score : 1;
  };

  const walk = (file: string): WalkResult => {
    if (memo.has(file)) return memo.get(file)!;
    if (visiting.has(file)) {
      return {
        path: [file],
        score: nodeScore(file) * 0.5,
        containsCycle: true,
      };
    }

    visiting.add(file);
    const edges = dependencyState.outgoing.get(file) || new Set();
    let bestPath: WalkResult = {
      path: [file],
      score: nodeScore(file),
      containsCycle: false,
    };

    for (const dep of edges) {
      if (!dependencyState.files.has(dep)) continue;
      const candidate = walk(dep);
      const candidateScore = nodeScore(file) + candidate.score;
      if (candidateScore > bestPath.score || (candidateScore === bestPath.score && candidate.path.length > bestPath.path.length)) {
        bestPath = {
          path: [file, ...candidate.path],
          score: candidateScore,
          containsCycle: candidate.containsCycle,
        };
      }
    }

    visiting.delete(file);
    memo.set(file, bestPath);
    return bestPath;
  };

  const all: CriticalPath[] = [];
  for (const file of dependencyState.files) {
    const pathEntry = walk(file);
    all.push({
      start: file,
      path: pathEntry.path,
      score: Math.round(pathEntry.score),
      length: pathEntry.path.length,
      containsCycle: pathEntry.containsCycle,
    });
  }

  return all
    .filter((item) => item.length > 1)
    .sort((a, b) => {
      const byScore = b.score - a.score;
      if (byScore !== 0) return byScore;
      return b.length - a.length;
    })
    .slice(0, Math.max(1, options.deepLinkTopN));
}

// ─── Issue Catalog ───────────────────────────────────────────────────────────

// dead re-export removed: isLikelyEntrypoint was not consumed by any module

export function buildIssueCatalog(
  duplicates: DuplicateGroup[],
  controlDuplicates: RedundantFlowGroup[],
  fileSummaries: FileEntry[],
  dependencySummary: DependencySummary,
  dependencyState: DependencyState,
  options: AnalysisOptions,
  pkgJsonDeps: Record<string, string> = {},
  pkgJsonDevDeps: Record<string, string> = {},
  fileCriticalityByPath: Map<string, FileCriticality> = new Map(),
  semanticFindings: Array<Omit<Finding, 'id'>> = [],
  flowMap: Map<string, FlowMapEntry[]> = new Map(),
  additionalFindings: Array<Omit<Finding, 'id'>> = [],
): { findings: Finding[]; byFile: Map<string, string[]>; totalBeforeTruncation: number; droppedCategories: string[] } {
  const rawFindings: Array<Omit<Finding, 'id'>> = [];

  const addFinding = (finding: Omit<Finding, 'id'>): void => {
    if (options.features && !options.features.has(finding.category)) return;
    rawFindings.push(finding);
  };

  // Build consumed-from-module map (needed by dead-code detectors)
  const { production: consumedFromModule, test: testConsumedFromModule } = buildConsumedFromModule(dependencyState);

  // All detectors - uniform pattern
  for (const f of detectDuplicateFunctionBodies(duplicates)) addFinding(f);
  for (const f of detectDuplicateFlowStructures(controlDuplicates, options.flowDupThreshold)) addFinding(f);
  for (const f of detectFunctionOptimization(fileSummaries, options.criticalComplexityThreshold)) addFinding(f);
  for (const f of detectTestOnlyModules(dependencySummary)) addFinding(f);
  for (const f of detectDependencyCycles(dependencySummary, dependencyState)) addFinding(f);
  for (const f of detectCriticalPaths(dependencySummary, dependencyState, options.criticalComplexityThreshold)) addFinding(f);
  for (const f of detectDeadExports(dependencyState, consumedFromModule, testConsumedFromModule)) addFinding(f);
  for (const f of detectDeadReExports(dependencyState, consumedFromModule)) addFinding(f);
  for (const f of detectSdpViolations(dependencyState)) addFinding(f);
  for (const f of detectHighCoupling(dependencyState, options.couplingThreshold)) addFinding(f);
  for (const f of detectGodModuleCoupling(dependencyState, options.fanInThreshold, options.fanOutThreshold)) addFinding(f);
  for (const f of detectOrphanModules(dependencyState)) addFinding(f);
  for (const f of detectUnreachableModules(dependencyState)) addFinding(f);

  // ─── Phase 3: Structural Hygiene ──────────────────────────────────────
  for (const f of detectUnusedNpmDeps(dependencyState.externalCounts, pkgJsonDeps, pkgJsonDevDeps)) addFinding(f);
  for (const f of detectBoundaryViolations(dependencyState)) addFinding(f);
  for (const f of detectBarrelExplosion(dependencyState, options.barrelSymbolThreshold)) addFinding(f);
  for (const f of detectGodModules(fileSummaries, dependencyState, options.godModuleStatements, options.godModuleExports)) addFinding(f);
  for (const f of detectGodFunctions(fileSummaries, options.godFunctionStatements)) addFinding(f);
  for (const f of detectCognitiveComplexity(fileSummaries, options.cognitiveComplexityThreshold)) addFinding(f);
  if (options.layerOrder.length >= 2) {
    for (const f of detectLayerViolations(dependencyState, options.layerOrder)) addFinding(f);
  }
  for (const f of detectLowCohesion(dependencyState)) addFinding(f);
  for (const f of detectInferredLayerViolations(dependencyState)) addFinding(f);
  for (const f of detectDistanceFromMainSequence(dependencyState)) addFinding(f);
  for (const f of detectFeatureEnvy(dependencyState)) addFinding(f);

  // ─── Phase 3B: Untested Critical Code ──────────────────────────────
  const hotFilesForDetector = computeHotFiles(dependencyState, dependencySummary, fileCriticalityByPath);
  for (const f of detectUntestedCriticalCode(dependencyState, hotFilesForDetector, fileCriticalityByPath)) addFinding(f);

  // ─── Phase 3C: Import Side-Effect Risk ────────────────────────────
  for (const f of detectImportSideEffectRisk(fileSummaries, dependencyState, dependencySummary, hotFilesForDetector)) addFinding(f);

  // ─── Phase 4: Code Quality Metrics ──────────────────────────────────
  for (const f of detectExcessiveParameters(fileSummaries, options.parameterThreshold)) addFinding(f);
  for (const f of detectEmptyCatchBlocks(fileSummaries)) addFinding(f);
  for (const f of detectSwitchNoDefault(fileSummaries)) addFinding(f);
  for (const f of detectHighCyclomaticDensity(fileSummaries, options.cyclomaticDensityThreshold)) addFinding(f);
  for (const f of detectUnsafeAny(fileSummaries, options.anyThreshold)) addFinding(f);
  for (const f of detectMagicNumbers(fileSummaries, options.magicNumberThreshold)) addFinding(f);
  for (const f of detectHighHalsteadEffort(fileSummaries, options.halsteadEffortThreshold)) addFinding(f);
  for (const f of detectLowMaintainability(fileSummaries, options.maintainabilityIndexThreshold)) addFinding(f);
  for (const f of detectTypeAssertionEscape(fileSummaries)) addFinding(f);
  for (const f of detectMissingErrorBoundary(fileSummaries)) addFinding(f);
  for (const f of detectPromiseMisuse(fileSummaries)) addFinding(f);

  // ─── Phase 4B: Performance ──────────────────────────────────────
  for (const f of detectAwaitInLoop(fileSummaries)) addFinding(f);
  for (const f of detectSyncIo(fileSummaries)) addFinding(f);
  for (const f of detectUnclearedTimers(fileSummaries)) addFinding(f);
  for (const f of detectListenerLeakRisk(fileSummaries)) addFinding(f);
  for (const f of detectUnboundedCollection(fileSummaries)) addFinding(f);
  for (const f of detectSimilarFunctionBodies(flowMap, options.similarityThreshold)) addFinding(f);

  // ─── Phase 4C: Security ───────────────────────────────────────────
  for (const f of detectHardcodedSecrets(fileSummaries)) addFinding(f);
  for (const f of detectEvalUsage(fileSummaries)) addFinding(f);
  for (const f of detectUnsafeHtml(fileSummaries)) addFinding(f);
  for (const f of detectSqlInjectionRisk(fileSummaries)) addFinding(f);
  for (const f of detectUnsafeRegex(fileSummaries)) addFinding(f);
  for (const f of detectUnvalidatedInputSink(fileSummaries)) addFinding(f);
  for (const f of detectInputPassthroughRisk(fileSummaries)) addFinding(f);
  for (const f of detectPrototypePollutionRisk(fileSummaries)) addFinding(f);
  for (const f of detectPathTraversalRisk(fileSummaries)) addFinding(f);
  for (const f of detectCommandInjectionRisk(fileSummaries)) addFinding(f);

  // ─── Phase 4D: Test Quality ───────────────────────────────────────
  for (const f of detectLowAssertionDensity(fileSummaries)) addFinding(f);
  for (const f of detectTestNoAssertion(fileSummaries)) addFinding(f);
  for (const f of detectExcessiveMocking(fileSummaries, options.mockThreshold)) addFinding(f);
  for (const f of detectSharedMutableState(fileSummaries)) addFinding(f);
  for (const f of detectMissingTestCleanup(fileSummaries)) addFinding(f);
  for (const f of detectFocusedTests(fileSummaries)) addFinding(f);
  for (const f of detectFakeTimersWithoutRestore(fileSummaries)) addFinding(f);
  for (const f of detectMissingMockRestoration(fileSummaries)) addFinding(f);

  // ─── Phase 5: Semantic Analysis (--semantic) ──────────────────────
  for (const f of semanticFindings) addFinding(f);
  for (const f of additionalFindings) addFinding(f);

  const sorted = rawFindings.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (bySeverity !== 0) return bySeverity;
    if (a.category < b.category) return -1;
    if (a.category > b.category) return 1;
    return 0;
  });

  const totalBeforeTruncation = sorted.length;
  const allCategoriesBefore = new Set(sorted.map((f) => f.category));
  const truncated = options.noDiversify
    ? sorted.slice(0, options.findingsLimit)
    : diversifyFindings(sorted, options.findingsLimit);
  const categoriesAfter = new Set(truncated.map((f) => f.category));
  const droppedCategories = [...allCategoriesBefore].filter((c) => !categoriesAfter.has(c));

  const findings: Finding[] = [];
  const perFileIssues = new Map<string, string[]>();
  for (const [i, raw] of truncated.entries()) {
    const id = `AST-ISSUE-${String(i + 1).padStart(4, '0')}`;
    const full: Finding = { id, ...raw };
    findings.push(full);
    if (full.file) {
      if (!perFileIssues.has(full.file)) perFileIssues.set(full.file, []);
      perFileIssues.get(full.file)!.push(id);
    }
  }

  return { findings, byFile: perFileIssues, totalBeforeTruncation, droppedCategories };
}

// ─── Mermaid Graph Generation ────────────────────────────────────────────────

function generateMermaidGraph(dependencyState: DependencyState, dependencySummary: DependencySummary, _fileCriticalityByPath: Map<string, FileCriticality>): string {
  const lines: string[] = [];
  lines.push('# Dependency Graph\n');
  lines.push('## Module Dependency Map\n');
  lines.push('```mermaid');
  lines.push('graph LR');

  const criticalFiles = new Set(
    (dependencySummary.criticalModules || []).map((m) => m.file),
  );
  const cycleFiles = new Set<string>();
  for (const cycle of dependencySummary.cycles || []) {
    for (const f of cycle.path) cycleFiles.add(f);
  }

  const shorten = (filePath: string): string => {
    const parts = filePath.split('/');
    if (parts.length <= 2) return parts.join('/');
    return `${parts[0]}/…/${parts[parts.length - 1]}`;
  };

  const sanitize = (id: string): string => id.replace(/[^a-zA-Z0-9]/g, '_');

  const renderedNodes = new Set<string>();
  const renderedEdges = new Set<string>();

  const topModules = [
    ...(dependencySummary.outgoingTop || []).slice(0, 15),
    ...(dependencySummary.inboundTop || []).slice(0, 15),
    ...(dependencySummary.criticalModules || []).slice(0, 10),
  ];
  const moduleSet = new Set(topModules.map((m) => m.file));
  for (const cycle of (dependencySummary.cycles || []).slice(0, 5)) {
    for (const f of cycle.path) moduleSet.add(f);
  }

  for (const file of moduleSet) {
    const id = sanitize(file);
    if (renderedNodes.has(id)) continue;
    renderedNodes.add(id);

    const label = shorten(file);
    if (cycleFiles.has(file)) {
      lines.push(`  ${id}["🔴 ${label}"]`);
    } else if (criticalFiles.has(file)) {
      lines.push(`  ${id}["⚠️ ${label}"]`);
    } else {
      lines.push(`  ${id}["${label}"]`);
    }
  }

  for (const file of moduleSet) {
    const outgoing = dependencyState.outgoing.get(file) || new Set();
    for (const dep of outgoing) {
      if (!moduleSet.has(dep)) continue;
      const edgeKey = `${sanitize(file)}-->${sanitize(dep)}`;
      if (renderedEdges.has(edgeKey)) continue;
      renderedEdges.add(edgeKey);

      if (cycleFiles.has(file) && cycleFiles.has(dep)) {
        lines.push(`  ${sanitize(file)} -. cycle .-> ${sanitize(dep)}`);
      } else {
        lines.push(`  ${sanitize(file)} --> ${sanitize(dep)}`);
      }
    }
  }

  lines.push('```\n');

  if (dependencySummary.cycles?.length > 0) {
    lines.push('## Dependency Cycles\n');
    lines.push('```mermaid');
    lines.push('graph LR');
    for (const [idx, cycle] of dependencySummary.cycles.slice(0, 10).entries()) {
      for (let i = 0; i < cycle.path.length - 1; i++) {
        const from = sanitize(cycle.path[i]);
        const to = sanitize(cycle.path[i + 1]);
        lines.push(`  ${from}["${shorten(cycle.path[i])}"] -. "cycle ${idx + 1}" .-> ${to}["${shorten(cycle.path[i + 1])}"]`);
      }
    }
    lines.push('```\n');
  }

  if (dependencySummary.criticalPaths?.length > 0) {
    lines.push('## Critical Dependency Chains\n');
    lines.push('```mermaid');
    lines.push('graph LR');
    for (const chain of dependencySummary.criticalPaths.slice(0, 8)) {
      for (let i = 0; i < chain.path.length - 1; i++) {
        const from = sanitize(chain.path[i]);
        const to = sanitize(chain.path[i + 1]);
        lines.push(`  ${from}["${shorten(chain.path[i])}"] ==> ${to}["${shorten(chain.path[i + 1])}"]`);
      }
    }
    lines.push('```\n');
  }

  lines.push('## Summary\n');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total modules | ${dependencySummary.totalModules} |`);
  lines.push(`| Total edges | ${dependencySummary.totalEdges} |`);
  lines.push(`| Root modules | ${dependencySummary.rootsCount} |`);
  lines.push(`| Leaf modules | ${dependencySummary.leavesCount} |`);
  lines.push(`| Cycles | ${dependencySummary.cycles?.length || 0} |`);
  lines.push(`| Critical paths | ${dependencySummary.criticalPaths?.length || 0} |`);
  lines.push(`| Test-only modules | ${dependencySummary.testOnlyModules?.length || 0} |`);
  lines.push(`| Unresolved imports | ${dependencySummary.unresolvedEdgeCount || 0} |`);
  lines.push('');

  if (dependencySummary.criticalModules?.length > 0) {
    lines.push('## Critical Modules (Hub Nodes)\n');
    lines.push('| Module | Score | Risk | Inbound | Outbound |');
    lines.push('|--------|-------|------|---------|----------|');
    for (const m of dependencySummary.criticalModules.slice(0, 20)) {
      lines.push(`| \`${m.file}\` | ${m.score} | ${m.riskBand || '-'} | ${m.inboundCount} | ${m.outboundCount} |`);
    }
    lines.push('');
  }

  if (dependencySummary.testOnlyModules?.length > 0) {
    lines.push('## Test-Only Modules\n');
    for (const m of dependencySummary.testOnlyModules.slice(0, 20)) {
      lines.push(`- \`${m.file}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Multi-File Report Writer ────────────────────────────────────────────────

export interface FullReport {
  generatedAt: string;
  repoRoot: string;
  options: Record<string, unknown>;
  parser: Record<string, unknown>;
  summary: Record<string, unknown>;
  fileInventory: FileEntry[];
  duplicateFlows: Record<string, unknown>;
  dependencyGraph: DependencySummary;
  dependencyFindings: Finding[];
  agentOutput: Record<string, unknown>;
  optimizationOpportunities: DuplicateFlowHint[];
  optimizationFindings: Finding[];
  parseErrors: { file: string; message: string }[];
  astTrees?: TreeEntry[];
  graphAnalytics?: import('./graph-analytics.js').GraphAnalyticsSummary;
  reportAnalysis?: import('./report-analysis.js').ReportAnalysisSummary;
}

export function writeMultiFileReport(
  dir: string,
  report: FullReport,
  options: AnalysisOptions,
  dependencyState: DependencyState,
  dependencySummary: DependencySummary,
  fileCriticalityByPath: Map<string, FileCriticality>,
): Record<string, string> {
  fs.mkdirSync(dir, { recursive: true });

  const writeJson = (name: string, data: unknown): void => {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2), 'utf8');
  };

  const outputFiles: Record<string, string> = {
    summary: 'summary.json',
    architecture: 'architecture.json',
    codeQuality: 'code-quality.json',
    deadCode: 'dead-code.json',
    fileInventory: 'file-inventory.json',
    findings: 'findings.json',
  };

  const hotFiles = computeHotFiles(dependencyState, dependencySummary, fileCriticalityByPath);
  const graphAnalytics = report.graphAnalytics ?? computeGraphAnalytics(dependencyState, dependencySummary, fileCriticalityByPath);
  const enrichedFileInventory = enrichFileInventoryEntries(report.fileInventory || [], { flowEnabled: !!options.flow });
  const allFindings = enrichFindings(
    report.optimizationFindings || [],
    enrichedFileInventory,
    hotFiles,
    graphAnalytics,
    { flowEnabled: !!options.flow },
  );
  const architectureFindings = allFindings.filter(f => ARCHITECTURE_CATEGORIES.has(f.category));
  const codeQualityFindings = allFindings.filter(f => CODE_QUALITY_CATEGORIES.has(f.category));
  const deadCodeFindings = allFindings.filter(f => DEAD_CODE_CATEGORIES.has(f.category));
  const securityFindings = allFindings.filter(f => SECURITY_CATEGORIES.has(f.category));
  const testQualityFindings = allFindings.filter(f => TEST_QUALITY_CATEGORIES.has(f.category));
  const reportAnalysis = report.reportAnalysis ?? computeReportAnalysisSummary(allFindings, enrichedFileInventory, hotFiles, graphAnalytics);

  writeJson('architecture.json', {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: report.generatedAt,
    dependencyGraph: report.dependencyGraph,
    dependencyFindings: report.dependencyFindings,
    findings: architectureFindings,
    findingsCount: architectureFindings.length,
    severityBreakdown: severityBreakdown(architectureFindings),
    categoryBreakdown: categoryBreakdown(architectureFindings),
    hotFiles,
    graphSignals: reportAnalysis.graphSignals,
    chokepoints: graphAnalytics.chokepoints,
    criticalHubCandidates: graphAnalytics.chokepoints.slice(0, 10),
    sccClusters: options.graphAdvanced ? graphAnalytics.sccClusters : [],
    packageGraphSummary: options.graphAdvanced ? graphAnalytics.packageGraphSummary : null,
    packageHotspots: options.graphAdvanced ? graphAnalytics.packageGraphSummary.hotspots : [],
  });

  writeJson('code-quality.json', {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: report.generatedAt,
    duplicateFlows: report.duplicateFlows,
    optimizationOpportunities: report.optimizationOpportunities,
    findings: codeQualityFindings,
    findingsCount: codeQualityFindings.length,
    severityBreakdown: severityBreakdown(codeQualityFindings),
    categoryBreakdown: categoryBreakdown(codeQualityFindings),
  });

  writeJson('dead-code.json', {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: report.generatedAt,
    findings: deadCodeFindings,
    findingsCount: deadCodeFindings.length,
    severityBreakdown: severityBreakdown(deadCodeFindings),
    categoryBreakdown: categoryBreakdown(deadCodeFindings),
  });

  if (securityFindings.length > 0) {
    writeJson('security.json', {
      schemaVersion: REPORT_SCHEMA_VERSION,
      generatedAt: report.generatedAt,
      findings: securityFindings,
      findingsCount: securityFindings.length,
      severityBreakdown: severityBreakdown(securityFindings),
      categoryBreakdown: categoryBreakdown(securityFindings),
    });
    outputFiles.security = 'security.json';
  }

  if (testQualityFindings.length > 0) {
    writeJson('test-quality.json', {
      schemaVersion: REPORT_SCHEMA_VERSION,
      generatedAt: report.generatedAt,
      findings: testQualityFindings,
      findingsCount: testQualityFindings.length,
      severityBreakdown: severityBreakdown(testQualityFindings),
      categoryBreakdown: categoryBreakdown(testQualityFindings),
    });
    outputFiles.testQuality = 'test-quality.json';
  }

  writeJson('file-inventory.json', {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: report.generatedAt,
    fileInventory: enrichedFileInventory,
    fileCount: enrichedFileInventory.length,
  });

  writeJson('findings.json', {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: report.generatedAt,
    optimizationFindings: allFindings,
    totalFindings: allFindings.length,
  });

  if (options.graph) {
    const graphMd = generateMermaidGraph(dependencyState, dependencySummary, fileCriticalityByPath);
    fs.writeFileSync(path.join(dir, 'graph.md'), graphMd, 'utf8');
    outputFiles.graph = 'graph.md';
  }

  if (report.astTrees) {
    fs.writeFileSync(path.join(dir, 'ast-trees.txt'), renderTreesText(report.astTrees, report.generatedAt), 'utf8');
    outputFiles.astTrees = 'ast-trees.txt';
  }

  const summaryJsonData = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: report.generatedAt,
    repoRoot: report.repoRoot,
    options: report.options,
    parser: report.parser,
    summary: report.summary,
    agentOutput: report.agentOutput,
    analysisSummary: {
      graphSignals: reportAnalysis.graphSignals,
      astSignals: reportAnalysis.astSignals,
      strongestGraphSignal: reportAnalysis.strongestGraphSignal,
      strongestAstSignal: reportAnalysis.strongestAstSignal,
      combinedSignals: reportAnalysis.combinedSignals,
      recommendedValidation: reportAnalysis.recommendedValidation,
    },
    strongestGraphSignal: reportAnalysis.strongestGraphSignal,
    strongestAstSignal: reportAnalysis.strongestAstSignal,
    combinedSignals: reportAnalysis.combinedSignals,
    recommendedValidation: reportAnalysis.recommendedValidation,
    investigationPrompts: reportAnalysis.investigationPrompts,
    parseErrors: report.parseErrors,
    outputFiles,
  };
  writeJson('summary.json', summaryJsonData);

  const summaryMd = generateSummaryMd({
    dir, report, outputFiles,
    architectureFindings, codeQualityFindings, deadCodeFindings,
    hotFiles, activeFeatures: options.features, scope: options.scope,
    root: options.root, scopeSymbols: options.scopeSymbols,
    semanticEnabled: options.semantic, securityFindings, testQualityFindings,
    reportAnalysis,
  });
  fs.writeFileSync(path.join(dir, 'summary.md'), summaryMd, 'utf8');
  outputFiles.summaryMd = 'summary.md';

  writeJson('summary.json', { ...summaryJsonData, outputFiles });

  return outputFiles;
}

export function severityBreakdown(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  return counts;
}

export function categoryBreakdown(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.category] = (counts[f.category] || 0) + 1;
  return counts;
}

export function computeHealthScore(findings: Finding[], totalFiles: number): number {
  if (totalFiles === 0) return 100;
  const weights = { critical: 25, high: 10, medium: 3, low: 1, info: 0 };
  let penalty = 0;
  for (const f of findings) penalty += weights[f.severity] || 0;
  const normalized = (penalty / totalFiles) * 10;
  return Math.max(0, Math.round(100 - normalized));
}

export function collectTagCloud(findings: Finding[]): { tag: string; count: number }[] {
  const tagCounts = new Map<string, number>();
  for (const f of findings) {
    if (!f.tags) continue;
    for (const tag of f.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  return [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface SummaryMdOptions {
  dir: string;
  report: FullReport;
  outputFiles: Record<string, string>;
  architectureFindings: Finding[];
  codeQualityFindings: Finding[];
  deadCodeFindings: Finding[];
  hotFiles?: import('./types.js').HotFile[];
  activeFeatures?: Set<string> | null;
  scope?: string[] | null;
  root?: string;
  scopeSymbols?: Map<string, string[]> | null;
  semanticEnabled?: boolean;
  securityFindings?: Finding[];
  testQualityFindings?: Finding[];
  reportAnalysis?: import('./report-analysis.js').ReportAnalysisSummary;
}

export function generateSummaryMd(opts: SummaryMdOptions): string {
  const {
    dir, report, outputFiles,
    architectureFindings, codeQualityFindings, deadCodeFindings,
    hotFiles = [], activeFeatures = null, scope = null,
    root = process.cwd(), scopeSymbols = null,
    semanticEnabled = false, securityFindings = [], testQualityFindings = [],
    reportAnalysis = null,
  } = opts;
  const allFindings = report.optimizationFindings || [];
  const sev = severityBreakdown(allFindings);
  const summary = report.summary as Record<string, unknown>;
  const agentOutput = report.agentOutput as Record<string, unknown>;
  const depGraph = report.dependencyGraph;

  const lines: string[] = [];
  lines.push('# Code Quality Scan Report\n');
  lines.push(`**Generated**: ${report.generatedAt}  `);
  lines.push(`**Root**: \`${report.repoRoot}\`\n`);

  lines.push('## Scan Scope\n');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Files analyzed | ${summary.totalFiles ?? '—'} |`);
  lines.push(`| Functions | ${summary.totalFunctions ?? '—'} |`);
  lines.push(`| Flow nodes | ${summary.totalFlows ?? '—'} |`);
  lines.push(`| Dependency files | ${summary.totalDependencyFiles ?? '—'} |`);
  lines.push(`| Packages | ${summary.totalPackages ?? '—'} |`);
  lines.push('');

  lines.push('## Findings Overview\n');
  lines.push(`| Severity | Count |`);
  lines.push(`|----------|-------|`);
  lines.push(`| Critical | ${sev.critical} |`);
  lines.push(`| High | ${sev.high} |`);
  lines.push(`| Medium | ${sev.medium} |`);
  lines.push(`| Low | ${sev.low} |`);
  lines.push(`| **Total** | **${allFindings.length}** |`);
  lines.push('');

  const totalBefore = (agentOutput as Record<string, unknown>)?.totalBeforeTruncation as number | undefined;
  const dropped = (agentOutput as Record<string, unknown>)?.droppedCategories as string[] | undefined;
  if (totalBefore && totalBefore > allFindings.length) {
    lines.push(`> **Truncated**: Showing ${allFindings.length} of ${totalBefore} findings (\`--findings-limit ${allFindings.length}\`).`);
    if (dropped && dropped.length > 0) {
      lines.push(`> Dropped categories: ${dropped.map((c) => `\`${c}\``).join(', ')}`);
    }
    lines.push('');
  }

  if (activeFeatures) {
    lines.push(`> **Features filter**: \`--features=${[...activeFeatures].join(',')}\``);
    lines.push('');
  }

  if (scope && scope.length > 0) {
    const scopeDisplay = scope.map((s) => path.relative(root, s)).filter(Boolean);
    if (scopeDisplay.length > 0) {
      let scopeLabel = scopeDisplay.map((p) => `\`${p}\``).join(', ');
      if (scopeSymbols && scopeSymbols.size > 0) {
        const symParts: string[] = [];
        for (const [absFile, names] of scopeSymbols) {
          const rel = path.relative(root, absFile);
          symParts.push(...names.map((n) => `\`${rel}:${n}\``));
        }
        scopeLabel = symParts.join(', ');
      }
      lines.push(`> **Scoped scan**: Only showing findings for: ${scopeLabel}`);
      lines.push('');
    }
  }

  if (semanticEnabled) {
    lines.push('> **Semantic analysis**: TypeChecker + LanguageService enabled (14 additional categories)');
    lines.push('');
  }

  const renderPillarCategories = (
    pillarKey: string,
    findings: Finding[],
  ): void => {
    const breakdown = categoryBreakdown(findings);
    const pillarCats = PILLAR_CATEGORIES[pillarKey] || [];
    const isFiltered = activeFeatures !== null;
    for (const cat of pillarCats) {
      const count = breakdown[cat] || 0;
      const skipped = isFiltered && !activeFeatures!.has(cat);
      if (skipped) {
        lines.push(`- \`${cat}\`: — *(skipped)*`);
      } else {
        lines.push(`- \`${cat}\`: ${count}`);
      }
    }
    lines.push('');
  };

  const totalFiles = (summary.totalFiles as number) || 1;
  const overallHealth = computeHealthScore(allFindings, totalFiles);
  const archHealth = computeHealthScore(architectureFindings, totalFiles);
  const qualHealth = computeHealthScore(codeQualityFindings, totalFiles);
  const deadHealth = computeHealthScore(deadCodeFindings, totalFiles);
  const secHealth = computeHealthScore(securityFindings, totalFiles);
  const testHealth = computeHealthScore(testQualityFindings, totalFiles);

  lines.push('## Health Scores\n');
  lines.push('| Pillar | Score | Grade |');
  lines.push('|--------|-------|-------|');
  const grade = (s: number) => s >= 80 ? 'A' : s >= 60 ? 'B' : s >= 40 ? 'C' : s >= 20 ? 'D' : 'F';
  lines.push(`| **Overall** | **${overallHealth}/100** | **${grade(overallHealth)}** |`);
  lines.push(`| Architecture | ${archHealth}/100 | ${grade(archHealth)} |`);
  lines.push(`| Code Quality | ${qualHealth}/100 | ${grade(qualHealth)} |`);
  lines.push(`| Dead Code & Hygiene | ${deadHealth}/100 | ${grade(deadHealth)} |`);
  if (securityFindings.length > 0) lines.push(`| Security | ${secHealth}/100 | ${grade(secHealth)} |`);
  if (testQualityFindings.length > 0) lines.push(`| Test Quality | ${testHealth}/100 | ${grade(testHealth)} |`);
  lines.push('');

  const tagCloud = collectTagCloud(allFindings);
  if (tagCloud.length > 0) {
    lines.push('## Top Concern Tags\n');
    lines.push('Searchable tags across all findings — use to filter `findings.json` with `jq`.\n');
    for (const { tag, count } of tagCloud.slice(0, 12)) {
      lines.push(`- \`${tag}\`: ${count} findings`);
    }
    lines.push('');
  }

  if (reportAnalysis) {
    lines.push('## Analysis Signals\n');
    lines.push(`- **Graph Signal**: ${reportAnalysis.strongestGraphSignal?.summary || 'No dominant graph signal in this scan.'}`);
    lines.push(`- **AST Signal**: ${reportAnalysis.strongestAstSignal?.summary || 'No dominant AST signal in this scan.'}`);
    lines.push(`- **Combined Interpretation**: ${reportAnalysis.combinedInterpretation?.summary || 'No combined interpretation available yet.'}`);
    lines.push(`- **Confidence**: ${reportAnalysis.combinedInterpretation?.confidence || reportAnalysis.strongestGraphSignal?.confidence || reportAnalysis.strongestAstSignal?.confidence || 'low'}`);
    const validationSummary = reportAnalysis.recommendedValidation
      ? `${reportAnalysis.recommendedValidation.summary} (tools: ${reportAnalysis.recommendedValidation.tools.join(' -> ')})`
      : 'Use Octocode local tools to confirm the strongest signal before presenting it as fact.';
    lines.push(`- **Recommended Validation**: ${validationSummary}`);
    if (reportAnalysis.investigationPrompts.length > 0) {
      lines.push('');
      lines.push('**Investigation Prompts**');
      for (const prompt of reportAnalysis.investigationPrompts.slice(0, 4)) {
        lines.push(`- ${prompt}`);
      }
    }
    lines.push('');
  }

  lines.push('## Architecture Health\n');
  lines.push(`> ${architectureFindings.length} findings (score: ${archHealth}/100) — see [\`architecture.json\`](./architecture.json)\n`);
  if (depGraph) {
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Modules | ${depGraph.totalModules} |`);
    lines.push(`| Import edges | ${depGraph.totalEdges} |`);
    lines.push(`| Cycles | ${depGraph.cycles?.length ?? 0} |`);
    lines.push(`| Critical paths | ${depGraph.criticalPaths?.length ?? 0} |`);
    lines.push(`| Root modules | ${depGraph.rootsCount} |`);
    lines.push(`| Leaf modules | ${depGraph.leavesCount} |`);
    lines.push(`| Test-only modules | ${depGraph.testOnlyModules?.length ?? 0} |`);
    lines.push(`| Unresolved imports | ${depGraph.unresolvedEdgeCount} |`);
    lines.push('');
  }
  renderPillarCategories('architecture', architectureFindings);

  if (hotFiles.length > 0) {
    lines.push('## Change Risk Hotspots\n');
    lines.push('Files most dangerous to change — high fan-in, complexity, or cycle membership.\n');
    lines.push('| File | Risk | Fan-In | Fan-Out | Complexity | Exports | Cycle | Critical Path |');
    lines.push('|------|------|--------|---------|------------|---------|-------|---------------|');
    for (const hf of hotFiles.slice(0, 15)) {
      lines.push(`| \`${hf.file}\` | ${hf.riskScore} | ${hf.fanIn} | ${hf.fanOut} | ${hf.complexityScore} | ${hf.exportCount} | ${hf.inCycle ? 'Y' : '-'} | ${hf.onCriticalPath ? 'Y' : '-'} |`);
    }
    lines.push('');
  }

  lines.push('## Code Quality\n');
  lines.push(`> ${codeQualityFindings.length} findings (score: ${qualHealth}/100) — see [\`code-quality.json\`](./code-quality.json)\n`);
  renderPillarCategories('code-quality', codeQualityFindings);

  lines.push('## Dead Code & Hygiene\n');
  lines.push(`> ${deadCodeFindings.length} findings (score: ${deadHealth}/100) — see [\`dead-code.json\`](./dead-code.json)\n`);
  renderPillarCategories('dead-code', deadCodeFindings);

  if (securityFindings.length > 0) {
    lines.push('## Security\n');
    lines.push(`> ${securityFindings.length} findings (score: ${secHealth}/100) — see [\`security.json\`](./security.json)\n`);
    renderPillarCategories('security', securityFindings);
  }

  if (testQualityFindings.length > 0) {
    lines.push('## Test Quality\n');
    lines.push(`> ${testQualityFindings.length} findings (score: ${testHealth}/100) — see [\`test-quality.json\`](./test-quality.json)\n`);
    renderPillarCategories('test-quality', testQualityFindings);
  }

  const topRecs = (agentOutput?.topRecommendations ?? []) as Array<{ severity: string; title: string; file: string; category: string }>;
  if (topRecs.length > 0) {
    lines.push('## Top Recommendations\n');
    for (const rec of topRecs.slice(0, 10)) {
      lines.push(`- **[${rec.severity.toUpperCase()}]** \`${rec.file}\` — ${rec.title} *(${rec.category})* `);
    }
    lines.push('');
  }

  if (outputFiles.astTrees) {
    lines.push('## AST Trees (`ast-trees.txt`)\n');
    lines.push('Compact indented text format — each node is `Kind[startLine:endLine]`, nesting = indentation.\n');
    lines.push('```');
    lines.push('SourceFile[1:152]');
    lines.push('  ImportDeclaration[1]');
    lines.push('  FunctionDeclaration[3:20]');
    lines.push('    Block[4:19]');
    lines.push('      IfStatement[5:12] ...');
    lines.push('```\n');
    lines.push('**Smart navigation:**\n');
    lines.push('| Goal | Command |');
    lines.push('|------|---------|');
    lines.push('| List all files | `grep "^##" ast-trees.txt` |');
    lines.push('| Find functions | `grep -E "FunctionDeclaration\\|function_declaration\\|ArrowFunction\\|arrow_function" ast-trees.txt` |');
    lines.push('| Find classes | `grep -E "ClassDeclaration\\|class_declaration" ast-trees.txt` |');
    lines.push('| Find control flow | `grep -E "IfStatement\\|SwitchStatement\\|ForStatement\\|WhileStatement" ast-trees.txt` |');
    lines.push('| Deep nesting (>3) | `grep -E "^\\s{8,}" ast-trees.txt` |');
    lines.push('| Truncated subtrees | `grep "\\.\\.\\.$" ast-trees.txt` |');
    lines.push('| Large spans (regex) | Use pattern `\\[(\\d+):(\\d+)\\]` — subtract to find span size |');
    lines.push('');
  }

  lines.push('## Output Files\n');
  lines.push('| File | Size | Description |');
  lines.push('|------|------|-------------|');
  const descriptions: Record<string, string> = {
    summary: 'Scan metadata, agent output, parse errors',
    architecture: 'Dependency graph, cycles, critical paths, architecture findings',
    codeQuality: 'Duplicate detection, complexity, god modules/functions',
    deadCode: 'Dead files/exports/re-exports, unused deps, boundary violations',
    fileInventory: 'Per-file function/flow/dependency details',
    findings: 'All findings across all categories (master list)',
    graph: 'Mermaid dependency graph',
    astTrees: 'AST tree snapshots (compact indented text — grep/regex friendly)',
    summaryMd: 'This file — human-readable overview',
  };
  for (const [key, file] of Object.entries(outputFiles)) {
    let size = '—';
    try { size = formatFileSize(fs.statSync(path.join(dir, file)).size); } catch {}
    lines.push(`| [\`${file}\`](./${file}) | ${size} | ${descriptions[key] || key} |`);
  }
  lines.push('');

  if (report.parseErrors?.length > 0) {
    lines.push('## Parse Errors\n');
    lines.push(`${report.parseErrors.length} file(s) failed to parse:\n`);
    for (const err of report.parseErrors.slice(0, 10)) {
      lines.push(`- \`${err.file}\`: ${err.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Diversify Findings (category round-robin before truncation) ─────────────

type FindingLike = Omit<Finding, 'id'> & { id?: string };

export function diversifyFindings<T extends FindingLike>(sorted: T[], limit: number): T[] {
  if (!Number.isFinite(limit) || limit >= sorted.length) return sorted;

  // Group by category, preserving severity order within each group
  const groups = new Map<string, T[]>();
  for (const f of sorted) {
    const cat = f.category;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(f);
  }

  // Order category groups by their highest-severity finding
  const categoryOrder = [...groups.entries()].sort((a, b) => {
    const aTop = SEVERITY_ORDER[a[1][0].severity] ?? 0;
    const bTop = SEVERITY_ORDER[b[1][0].severity] ?? 0;
    return bTop - aTop;
  });

  // Round-robin pick from each category group
  const result: T[] = [];
  const cursors = new Map<string, number>();
  for (const [cat] of categoryOrder) cursors.set(cat, 0);

  while (result.length < limit) {
    let picked = false;
    for (const [cat, items] of categoryOrder) {
      if (result.length >= limit) break;
      const cursor = cursors.get(cat)!;
      if (cursor < items.length) {
        result.push(items[cursor]);
        cursors.set(cat, cursor + 1);
        picked = true;
      }
    }
    if (!picked) break; // all groups exhausted
  }
  return result;
}

// ─── Top Recommendations (category-diverse) ─────────────────────────────────

export function diverseTopRecommendations(findings: Finding[], limit: number = 20, maxPerCategory: number = 2): Finding[] {
  const result: Finding[] = [];
  const countByCategory = new Map<string, number>();
  for (const f of findings) {
    const catCount = countByCategory.get(f.category) || 0;
    if (catCount >= maxPerCategory) continue;
    result.push(f);
    countByCategory.set(f.category, catCount + 1);
    if (result.length >= limit) break;
  }
  return result;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.clearCache) {
    clearCache(options.root);
    console.error('Cache cleared.');
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const isLegacyMode = options.out?.endsWith('.json');
  const outputDir = isLegacyMode ? null : (options.out || path.join(options.root, '.octocode', 'scan', timestamp));
  const outputPath = isLegacyMode ? options.out : null;

  let packages = listWorkspacePackages(options.root, options.packageRoot);
  if (!packages.length) {
    // Fallback: treat root as a single package if it has a package.json
    const rootManifest = path.join(options.root, 'package.json');
    if (fs.existsSync(rootManifest)) {
      try {
        const json = JSON.parse(fs.readFileSync(rootManifest, 'utf8'));
        const name = typeof json.name === 'string' ? json.name : path.basename(options.root);
        packages = [{ name, dir: options.root, folder: path.basename(options.root) }];
      } catch {
        console.error(`No packages found in ${options.packageRoot} and root package.json is unreadable`);
        process.exit(1);
      }
    } else {
      console.error(`No packages found in ${options.packageRoot} and no package.json in root`);
      process.exit(1);
    }
  }

  let effectiveParser = options.parser as string;
  const parserProbe = options.parser === 'tree-sitter' || options.parser === 'auto' ? await resolveTreeSitter() : { available: false, error: null, parserTs: null, parserTsx: null };
  const useTreeSitter = (options.parser === 'tree-sitter' || options.parser === 'auto') && Boolean(parserProbe?.available);

  if (options.parser === 'tree-sitter' && !parserProbe?.available) {
    console.warn(`Tree-sitter requested but unavailable: ${parserProbe?.error || 'missing parser modules'}`);
    console.warn('Falling back to TypeScript parser for duplicate detection.');
    effectiveParser = 'typescript';
  }

  if (options.parser === 'tree-sitter' && parserProbe?.available) {
    effectiveParser = 'tree-sitter (primary) + typescript (dependencies)';
  }

  if (options.parser === 'auto' && parserProbe?.available) {
    effectiveParser = 'typescript (primary) + tree-sitter (node count)';
  }

  const summary = {
    totalPackages: packages.length,
    totalFiles: 0,
    totalNodes: 0,
    totalFunctions: 0,
    totalFlows: 0,
    totalDependencyFiles: 0,
    byPackage: {} as Record<string, { files: number; nodes: number; functions: number; flows: number; topKinds: [string, number][]; rootPath: string }>,
  };

  const flowMap = new Map<string, FlowMapEntry[]>();
  const controlMap = new Map<string, ControlMapEntry[]>();
  const trees: TreeEntry[] = [];
  const fileSummaries: FileEntry[] = [];

  const cache = options.noCache ? null : loadCache(options.root);
  const newCache = createEmptyCache(options.root);
  let cacheHits = 0;
  const parseErrors: { file: string; message: string }[] = [];
  const dependencyState: DependencyState = {
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

  const packageFileStats: Record<string, PackageFileSummary> = Object.fromEntries(
    packages.map((pkg) => ([pkg.name, {
      fileCount: 0,
      nodeCount: 0,
      functionCount: 0,
      flowCount: 0,
      kindCounts: {},
      functions: [],
      flows: [],
    }]))
  );

  const allPkgJsonDeps: Record<string, string> = {};
  const allPkgJsonDevDeps: Record<string, string> = {};
  for (const pkg of packages) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(pkg.dir, 'package.json'), 'utf8'));
      Object.assign(allPkgJsonDeps, manifest.dependencies || {});
      Object.assign(allPkgJsonDevDeps, manifest.devDependencies || {});
    } catch { /* skip unreadable */ }
  }

  for (const pkg of packages) {
    let packageStats = packageFileStats[pkg.name];
    if (!packageStats) {
      packageStats = {
        fileCount: 0,
        nodeCount: 0,
        functionCount: 0,
        flowCount: 0,
        kindCounts: {},
        functions: [],
        flows: [],
      };
      packageFileStats[pkg.name] = packageStats;
    }
    const packageFiles = collectFiles(pkg.dir, options);
    const dependencyFiles = collectFiles(pkg.dir, { ...options, includeTests: true });
    const scopeMatchesPath = (absPath: string): boolean =>
      options.scope != null && options.scope.some((s) => {
        const normScope = path.normalize(s);
        const normPath = path.normalize(absPath);
        return normPath === normScope || normPath.startsWith(normScope + path.sep);
      });
    const scopedPackageFiles = options.scope
      ? packageFiles.filter((f) => scopeMatchesPath(f))
      : packageFiles;
    const analysisFileSet = new Set(scopedPackageFiles);

    for (const filePath of dependencyFiles) {
      const text = safeRead(filePath);
      if (text === null) {
        parseErrors.push({
          file: path.relative(options.root, filePath),
          message: 'Failed to read file',
        });
        continue;
      }

      const ext = path.extname(filePath);
      const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.ESNext, true, canonicalScriptKind(ext));

      try {
        const dependencyProfile = collectDependencyProfile(source, filePath, pkg.name, options, dependencyState);
        if (!analysisFileSet.has(filePath)) continue;

        const relPath = path.relative(options.root, filePath);
        const stat = fs.statSync(filePath);
        const statKey = { mtimeMs: stat.mtimeMs, size: stat.size };

        type CachedResult = {
          fileEntry: FileEntry;
          flowMapEntries: [string, FlowMapEntry[]][];
          controlMapEntries: [string, ControlMapEntry[]][];
          treeEntry?: TreeEntry;
        };

        if (cache && isCacheHit(cache, relPath, statKey)) {
          const raw = getCachedResult(cache, relPath) as CachedResult | undefined;
          if (raw?.fileEntry) {
            for (const [key, entries] of raw.flowMapEntries ?? []) {
              for (const entry of entries) increment(flowMap, key, entry);
            }
            for (const [key, entries] of raw.controlMapEntries ?? []) {
              for (const entry of entries) increment(controlMap, key, entry);
            }
            const fileSummary: FileEntry = { ...raw.fileEntry, dependencyProfile };
            packageStats.fileCount += 1;
            packageStats.nodeCount += fileSummary.nodeCount;
            packageStats.functionCount += fileSummary.functions.length;
            packageStats.flowCount += fileSummary.flows.length;
            for (const [k, count] of Object.entries(fileSummary.kindCounts)) {
              packageStats.kindCounts[k] = (packageStats.kindCounts[k] || 0) + count;
            }
            for (const fn of fileSummary.functions) packageStats.functions.push(fn);
            if (raw.treeEntry) trees.push(raw.treeEntry);

            summary.totalFiles += 1;
            summary.totalNodes += fileSummary.nodeCount;
            summary.totalFunctions += fileSummary.functions.length;
            summary.totalFlows += fileSummary.flows.length;
            fileSummaries.push(fileSummary);

            setCacheEntry(newCache, relPath, statKey, raw);
            cacheHits++;
            continue;
          }
        }

        const fileFlowMap = new Map<string, FlowMapEntry[]>();
        const fileControlMap = new Map<string, ControlMapEntry[]>();

        const treeSitterPrimary = useTreeSitter && options.parser === 'tree-sitter';

        let fileSummary: FileEntry;

        if (treeSitterPrimary) {
          const treeSitterEntry = analyzeTreeSitterFile(filePath, text, options, pkg.name, { flowMap: fileFlowMap, controlMap: fileControlMap });
          if (!treeSitterEntry) {
            const fallback = analyzeSourceFile(source, pkg.name, packageStats, options, { flowMap: fileFlowMap, controlMap: fileControlMap }, trees, dependencyProfile);
            fallback.parserFallback = 'typescript (tree-sitter failed)';
            fileSummary = fallback;
          } else {
            const fileRelative = path.relative(options.root, filePath);
            fileSummary = {
              package: pkg.name,
              file: fileRelative,
              parseEngine: 'tree-sitter',
              nodeCount: treeSitterEntry.nodeCount,
              kindCounts: {},
              functions: treeSitterEntry.functions,
              flows: treeSitterEntry.flows,
              dependencyProfile,
            };
            if (treeSitterEntry.tree && options.emitTree) {
              trees.push({ package: pkg.name, file: fileRelative, tree: treeSitterEntry.tree });
            }
            packageStats.fileCount += 1;
            packageStats.nodeCount += treeSitterEntry.nodeCount;
            packageStats.functionCount += treeSitterEntry.functions.length;
            packageStats.flowCount += treeSitterEntry.flows.length;
            for (const fn of treeSitterEntry.functions) {
              packageStats.functions.push(fn);
            }
          }
        } else {
          fileSummary = analyzeSourceFile(
            source,
            pkg.name,
            packageStats,
            options,
            { flowMap: fileFlowMap, controlMap: fileControlMap },
            trees,
            dependencyProfile,
          );

          if (useTreeSitter) {
            try {
              const treeSitterEntry = analyzeTreeSitterFile(filePath, text, options, pkg.name, null);
              if (treeSitterEntry) {
                fileSummary.treeSitterNodeCount = treeSitterEntry.nodeCount;
              }
            } catch (error: unknown) {
              fileSummary.treeSitterError = String((error as Error)?.message || error);
            }
          }
        }

        for (const [key, entries] of fileFlowMap) {
          for (const entry of entries) increment(flowMap, key, entry);
        }
        for (const [key, entries] of fileControlMap) {
          for (const entry of entries) increment(controlMap, key, entry);
        }

        const treeEntry = options.emitTree ? trees.find((t) => t.file === relPath) : undefined;
        const toCache: CachedResult = {
          fileEntry: fileSummary,
          flowMapEntries: [...fileFlowMap.entries()],
          controlMapEntries: [...fileControlMap.entries()],
          ...(treeEntry && { treeEntry }),
        };
        setCacheEntry(newCache, relPath, statKey, toCache);

        summary.totalFiles += 1;
        summary.totalNodes += fileSummary.nodeCount;
        summary.totalFunctions += fileSummary.functions.length;
        summary.totalFlows += fileSummary.flows.length;
        fileSummaries.push(fileSummary);
      } catch (error: unknown) {
        parseErrors.push({
          file: path.relative(options.root, filePath),
          message: String((error as Error)?.message || error),
        });
      }
    }

    summary.byPackage[pkg.name] = {
      files: packageStats.fileCount,
      nodes: packageStats.nodeCount,
      functions: packageStats.functionCount,
      flows: packageStats.flowCount,
      topKinds: Object.entries(packageStats.kindCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
      rootPath: pkg.folder,
    };
  }

  if (!options.noCache) {
    saveCache(options.root, newCache);
  }
  if (cacheHits > 0 && !options.json) {
    console.error(`Cache: ${cacheHits} hits, ${fileSummaries.length - cacheHits} misses`);
  }

  summary.totalDependencyFiles = dependencyState.files.size;

  const duplicateFunctions: DuplicateGroup[] = [...flowMap.entries()]
    .map(([key, locations]) => {
      if (locations.length < 2) return null;
      const [first] = locations;
      const [hash] = key.split('|');
      const signatureName = first.name || first.kind || '<flow>';
      const files = [...new Set(locations.map((item) => item.file))];
      return {
        hash,
        signature: signatureName,
        kind: first.kind,
        occurrences: locations.length,
        filesCount: files.length,
        locations: locations.slice(0, 20),
      };
    })
    .filter((item): item is DuplicateGroup => item !== null)
    .sort((a, b) => b.occurrences - a.occurrences);

  const redundantFlows: RedundantFlowGroup[] = [...controlMap.entries()]
    .map(([key, locations]) => {
      if (locations.length <= 1) return null;
      const [, kind] = key.split('|');
      const files = [...new Set(locations.map((item) => item.file))];
      return {
        kind,
        occurrences: locations.length,
        filesCount: files.length,
        locations: locations.slice(0, 20),
      };
    })
    .filter((item): item is RedundantFlowGroup => item !== null)
    .sort((a, b) => b.occurrences - a.occurrences);

  const duplicateFlowHints: DuplicateFlowHint[] = [];
  for (const fn of duplicateFunctions.slice(0, 200)) {
    if (fn.occurrences >= 2) {
      duplicateFlowHints.push({
        type: 'duplicate-function-body',
        message: `Identical function body for ${fn.signature}`,
        file: fn.locations[0]?.file,
        lineStart: fn.locations[0]?.lineStart,
        lineEnd: fn.locations[0]?.lineEnd,
        details: `Occurs ${fn.occurrences} times in ${fn.filesCount} files.`,
      });
    }
  }

  for (const [index, flow] of redundantFlows.slice(0, 100).entries()) {
    if (flow.occurrences >= options.flowDupThreshold) {
      duplicateFlowHints.push({
        type: 'repeated-flow',
        message: `Repeated ${flow.kind} control structure`,
        file: flow.locations[0]?.file,
        lineStart: flow.locations[0]?.lineStart,
        lineEnd: flow.locations[0]?.lineEnd,
        details: `Structure appears ${flow.occurrences} times across ${flow.filesCount} file(s).`,
      });
    }
    if (index > 100) break;
  }

  const fileCriticalityByPath = new Map<string, FileCriticality>(
    fileSummaries.map((item) => [item.file, buildDependencyCriticality(item, options)]),
  );
  const dependencySummary = buildDependencySummary(dependencyState, fileCriticalityByPath, options);
  const graphAnalytics = computeGraphAnalytics(dependencyState, dependencySummary, fileCriticalityByPath);
  const advancedGraphFindings = options.graphAdvanced
    ? buildAdvancedGraphFindings(graphAnalytics, dependencyState, fileSummaries)
    : [];

  // ─── Semantic Analysis Phase (--semantic) ───────────────────────────
  let semanticFindings: Array<Omit<Finding, 'id'>> = [];
  if (options.semantic) {
    const wantsAnySemantic = !options.features || [...SEMANTIC_CATEGORIES].some((c) => options.features!.has(c));
    if (wantsAnySemantic) {
      try {
        const allAbsFiles = collectAllAbsoluteFiles(fileSummaries, dependencyState, options.root);
        const semanticCtx = createSemanticContext(allAbsFiles, options.root);
        const profiles: SemanticProfile[] = [];
        for (const entry of fileSummaries) {
          const absPath = path.resolve(options.root, entry.file);
          try {
            profiles.push(analyzeSemanticProfile(semanticCtx, absPath, entry, options.includeTests));
          } catch { /* skip files that fail semantic analysis */ }
        }
        semanticFindings = runSemanticDetectors(semanticCtx, profiles, {
          typeHierarchyThreshold: options.typeHierarchyThreshold,
          overrideChainThreshold: options.overrideChainThreshold,
        });
      } catch (err: unknown) {
        parseErrors.push({ file: '<semantic>', message: `Semantic analysis failed: ${String((err as Error)?.message || err)}` });
      }
    }
  }

  const catalog = buildIssueCatalog(
    duplicateFunctions,
    redundantFlows,
    fileSummaries,
    dependencySummary,
    dependencyState,
    options,
    allPkgJsonDeps,
    allPkgJsonDevDeps,
    fileCriticalityByPath,
    semanticFindings,
    flowMap,
    advancedGraphFindings,
  );
  let findings = catalog.findings;
  let byFile = catalog.byFile;
  const { totalBeforeTruncation, droppedCategories } = catalog;

  if (options.scope) {
    const scopeMatchesRel = (file: string): boolean => {
      const absPath = path.resolve(options.root, file);
      return options.scope!.some((s) => {
        const normScope = path.normalize(s);
        const normPath = path.normalize(absPath);
        return normPath === normScope || normPath.startsWith(normScope + path.sep);
      });
    };
    findings = findings.filter(
      (f) => scopeMatchesRel(f.file) || (f.files?.some(scopeMatchesRel) ?? false),
    );
    byFile = new Map([...byFile.entries()].filter(([file]) => scopeMatchesRel(file)));

    if (options.scopeSymbols && options.scopeSymbols.size > 0) {
      const symbolRanges: Array<{ file: string; lineStart: number; lineEnd: number; name: string }> = [];
      for (const [absFile, symbolNames] of options.scopeSymbols) {
        const relFile = path.relative(options.root, absFile);
        const entry = fileSummaries.find((e) => e.file === relFile);
        if (!entry) continue;
        for (const sym of symbolNames) {
          const fn = entry.functions.find((f) => f.name === sym);
          if (fn) {
            symbolRanges.push({ file: relFile, lineStart: fn.lineStart, lineEnd: fn.lineEnd, name: sym });
            continue;
          }
          const exp = entry.dependencyProfile?.declaredExports?.find(
            (e) => e.name === sym && e.lineStart != null && e.lineEnd != null,
          );
          if (exp) {
            symbolRanges.push({ file: relFile, lineStart: exp.lineStart!, lineEnd: exp.lineEnd!, name: sym });
          }
        }
      }
      if (symbolRanges.length > 0) {
        const overlaps = (fLineStart: number, fLineEnd: number, rLineStart: number, rLineEnd: number): boolean =>
          fLineStart <= rLineEnd && fLineEnd >= rLineStart;
        findings = findings.filter((f) =>
          symbolRanges.some((r) =>
            f.file === r.file && overlaps(f.lineStart, f.lineEnd, r.lineStart, r.lineEnd),
          ),
        );
      }
    }
  }

  const enrichedFileSummaries = enrichFileInventoryEntries(fileSummaries, { flowEnabled: !!options.flow });
  const hotFiles = computeHotFiles(dependencyState, dependencySummary, fileCriticalityByPath);
  findings = enrichFindings(findings, enrichedFileSummaries, hotFiles, graphAnalytics, { flowEnabled: !!options.flow });
  const reportAnalysis = computeReportAnalysisSummary(findings, enrichedFileSummaries, hotFiles, graphAnalytics);
  const enhancedFileSummaries = fileSummaryWithFindings(enrichedFileSummaries, byFile);

  const report = {
    generatedAt: new Date().toISOString(),
    repoRoot: options.root,
    options: {
      ...options,
      ignoreDirs: [...options.ignoreDirs],
    },
    parser: {
      requested: options.parser,
      effective: effectiveParser,
      treeSitterAvailable: !!parserProbe?.available,
      treeSitterError: parserProbe?.available ? null : parserProbe?.error || null,
    },
    summary,
    fileInventory: enhancedFileSummaries,
    duplicateFlows: {
      duplicatedFunctions: duplicateFunctions.slice(0, 200),
      duplicatedControlFlow: redundantFlows.slice(0, 200),
      totalFunctionGroups: duplicateFunctions.length,
      totalFlowGroups: redundantFlows.length,
    },
    dependencyGraph: dependencySummary,
    dependencyFindings: findings.filter((item) => item.category?.startsWith('dependency')),
    agentOutput: {
      totalFindings: findings.length,
      totalBeforeTruncation,
      droppedCategories,
      analysisSummary: {
        strongestGraphSignal: reportAnalysis.strongestGraphSignal,
        strongestAstSignal: reportAnalysis.strongestAstSignal,
        combinedSignals: reportAnalysis.combinedSignals,
        recommendedValidation: reportAnalysis.recommendedValidation,
      },
      highPriority: findings.filter((f) => f.severity === 'high' || f.severity === 'critical').length,
      mediumPriority: findings.filter((f) => f.severity === 'medium').length,
      lowPriority: findings.filter((f) => f.severity === 'low' || f.severity === 'info').length,
      topRecommendations: diverseTopRecommendations(findings, 20, options.maxRecsPerCategory).map((f) => ({
        id: f.id,
        file: f.file,
        severity: f.severity,
        category: f.category,
        title: f.title,
        reason: f.reason,
        suggestedFix: f.suggestedFix,
      })),
      filesWithIssues: [...byFile.entries()].map(([file, ids]) => ({
        file,
        issueCount: ids.length,
        issueIds: ids,
      })),
    },
    optimizationOpportunities: duplicateFlowHints,
    optimizationFindings: findings,
    parseErrors,
    astTrees: undefined as TreeEntry[] | undefined,
    graphAnalytics,
    reportAnalysis,
  };

  if (options.emitTree) {
    report.astTrees = trees;
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`AST analysis complete: ${summary.totalFiles} files, ${summary.totalFunctions} functions, ${summary.totalFlows} flow nodes`);
    if (summary.totalDependencyFiles !== summary.totalFiles) {
      console.log(`Dependency scan analyzed ${summary.totalDependencyFiles} files (including tests where present).`);
    }
    console.log(`Duplicate function bodies: ${duplicateFunctions.length}`);
    for (const item of duplicateFunctions.slice(0, 20)) {
      console.log(`- ${item.kind} "${item.signature}" occurs ${item.occurrences}x in ${item.filesCount} file(s)`);
    }

    console.log(`\nRepeated control-flow structures: ${redundantFlows.length}`);
    for (const item of redundantFlows.slice(0, 20)) {
      console.log(`- ${item.kind} appears ${item.occurrences}x across ${item.filesCount} file(s)`);
    }

    console.log(`\nDependency graph: ${dependencySummary.totalModules} modules, ${dependencySummary.totalEdges} import edges`);
    if (dependencySummary.totalModules > 0) {
      console.log(`- Critical chains: ${dependencySummary.criticalPaths.length} (showing top ${Math.min(options.deepLinkTopN, dependencySummary.criticalPaths.length)})`);
      console.log(`- Root modules: ${dependencySummary.rootsCount}, Leaf modules: ${dependencySummary.leavesCount}`);
      console.log(`- Test-only modules: ${dependencySummary.testOnlyModules.length}`);
      console.log(`- Cycles: ${dependencySummary.cycles.length}`);
    }

    console.log(`\nAgent Findings: ${findings.length}`);
    for (const item of findings.slice(0, 20)) {
      console.log(`- [${item.severity.toUpperCase()}] ${item.title}`);
      console.log(`  - ${item.reason}`);
      console.log(`  - fix: ${item.suggestedFix.strategy}`);
    }

    if (parseErrors.length > 0) {
      console.log(`\nParse errors: ${parseErrors.length}`);
      parseErrors.slice(0, 10).forEach((error) => {
        console.log(`- ${error.file}: ${error.message}`);
      });
    }

    console.log(`\nParser engine used: ${report.parser.effective}`);
  }

  if (isLegacyMode && outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
    if (!options.json) {
      console.log(`\nFull report written to ${path.relative(options.root, outputPath)}`);
    }
    if (options.graph) {
      const graphMd = generateMermaidGraph(dependencyState, dependencySummary, fileCriticalityByPath);
      const graphPath = outputPath.replace(/\.json$/, '-graph.md');
      fs.writeFileSync(graphPath, graphMd, 'utf8');
      if (!options.json) {
        console.log(`Dependency graph written to ${path.relative(options.root, graphPath)}`);
      }
    }
  } else if (outputDir) {
    const outputFiles = writeMultiFileReport(outputDir, report, options, dependencyState, dependencySummary, fileCriticalityByPath);
    if (!options.json) {
      const relDir = path.relative(options.root, outputDir);
      console.log(`\nReport written to ${relDir}/`);
      for (const [key, file] of Object.entries(outputFiles)) {
        console.log(`  ${key}: ${file}`);
      }
    }
  }
}

const isDirectRun = process.argv[1] && (
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
  || import.meta.url.endsWith('/scripts/index.js')
);

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

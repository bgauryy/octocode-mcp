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
import { SEVERITY_ORDER, CONTROL_KIND_DUP_THRESHOLD } from './types.js';
import { parseArgs } from './cli.js';
import { canonicalScriptKind, isTestFile } from './utils.js';
import { collectDependencyProfile, dependencyProfileToRecord } from './dependencies.js';
import { collectFiles, safeRead, listWorkspacePackages, fileSummaryWithFindings } from './discovery.js';
import { analyzeSourceFile, buildDependencyCriticality } from './ts-analyzer.js';
import { analyzeTreeSitterFile, resolveTreeSitter } from './tree-sitter-analyzer.js';
import {
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
} from './architecture.js';

// ─── Output Category Groups ─────────────────────────────────────────────────

export const ARCHITECTURE_CATEGORIES = new Set([
  'dependency-cycle', 'dependency-critical-path', 'dependency-test-only',
  'architecture-sdp-violation', 'high-coupling', 'god-module-coupling',
  'orphan-module', 'unreachable-module', 'layer-violation',
]);

export const CODE_QUALITY_CATEGORIES = new Set([
  'duplicate-function-body', 'duplicate-flow-structure', 'function-optimization',
  'cognitive-complexity', 'god-module', 'god-function',
]);

export const DEAD_CODE_CATEGORIES = new Set([
  'dead-file', 'dead-export', 'dead-re-export', 're-export-duplication',
  're-export-shadowed', 'unused-npm-dependency', 'package-boundary-violation',
  'barrel-explosion',
]);

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

  const cycles = detectDependencyCycles(dependencyState);
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

export function detectDependencyCycles(dependencyState: DependencyState): Cycle[] {
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

function makeIssue(location: object, props: object): Omit<Finding, 'id'> {
  return {
    ...location,
    ...props,
  } as Omit<Finding, 'id'>;
}

export function isLikelyEntrypoint(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  return /(^|\/)(index|main|app|server|cli)\.[mc]?[jt]sx?$/.test(normalized);
}

export function buildIssueCatalog(
  duplicates: DuplicateGroup[],
  controlDuplicates: RedundantFlowGroup[],
  fileSummaries: FileEntry[],
  dependencySummary: DependencySummary,
  dependencyState: DependencyState,
  options: AnalysisOptions,
  pkgJsonDeps: Record<string, string> = {},
  pkgJsonDevDeps: Record<string, string> = {},
): { findings: Finding[]; byFile: Map<string, string[]> } {
  const findings: Finding[] = [];
  const perFileIssues = new Map<string, string[]>();

  const addFinding = (finding: Omit<Finding, 'id'>): void => {
    if (findings.length >= options.findingsLimit) return;
    const id = `AST-ISSUE-${String(findings.length + 1).padStart(4, '0')}`;
    const fullFinding: Finding = { id, ...finding };
    findings.push(fullFinding);

    if (fullFinding.file) {
      if (!perFileIssues.has(fullFinding.file)) perFileIssues.set(fullFinding.file, []);
      perFileIssues.get(fullFinding.file)!.push(id);
    }
  };

  for (const group of duplicates) {
    const sample = group.locations[0];
    const reason = `Same ${group.kind} body shape appears in ${group.occurrences} places (` +
      `${group.filesCount} file${group.filesCount > 1 ? 's' : ''}).`;
    const severity: Finding['severity'] = group.occurrences >= 6 ? 'high' : group.occurrences >= 3 ? 'medium' : 'low';
    addFinding(makeIssue(sample, {
      severity,
      category: 'duplicate-function-body',
      title: `Deduplicate function body: ${group.signature}`,
      reason,
      files: group.locations.map((loc) => `${loc.file}:${loc.lineStart}-${loc.lineEnd}`),
      suggestedFix: {
        strategy: 'Create a shared helper function once and replace duplicate call sites.',
        steps: [
          'Extract one function to a dedicated utility module.',
          'Keep behavior unchanged by passing function-specific differences as params.',
          'Replace duplicated blocks with calls to the shared helper.',
          'Add/extend tests around each entry point that previously used duplicates.',
        ],
      },
      impact: `Lower maintenance cost and reduce regression risk when behavior changes.`,
    }));
  }

  for (const group of controlDuplicates) {
    if (group.occurrences < CONTROL_KIND_DUP_THRESHOLD) continue;

    const sample = group.locations[0];
    const reason = `${group.kind} structure appears ${group.occurrences} times across ${group.filesCount} file(s).`;
    const severity: Finding['severity'] = group.occurrences >= 10 ? 'high' : 'medium';
    addFinding(makeIssue(sample, {
      severity,
      category: 'duplicate-flow-structure',
      title: `Extract repeated flow structure: ${group.kind}`,
      reason,
      files: group.locations.map((loc) => `${loc.file}:${loc.lineStart}-${loc.lineEnd}`),
      suggestedFix: {
        strategy: 'Extract a reusable flow helper around the repeated structure.',
        steps: [
          'Create one clear helper that accepts varying inputs as parameters.',
          'Call helper from each repeated site.',
          'Keep variable names aligned and add local adapter logic where needed.',
          'Document expected invariants for the shared flow.',
        ],
      },
      impact: `Reduces duplicate control branches and normalizes edge-case handling.`,
    }));
  }

  for (const fileEntry of fileSummaries) {
    for (const fn of fileEntry.functions) {
      const alerts: string[] = [];
      if (fn.complexity >= options.criticalComplexityThreshold) alerts.push(`Cyclomatic-like complexity is high (>=${options.criticalComplexityThreshold}).`);
      if (fn.maxBranchDepth >= 7) alerts.push('Branch depth is very deep and hard to reason about.');
      if (fn.maxLoopDepth >= 4) alerts.push('Nested loops are high and likely expensive.');
      if (fn.statementCount >= 24) alerts.push('Function body is large and may be doing multiple responsibilities.');

      if (alerts.length === 0) continue;

      const isHigh = fn.complexity >= options.criticalComplexityThreshold || fn.maxBranchDepth >= 7 || fn.maxLoopDepth >= 4;
      addFinding(makeIssue(fn, {
        severity: isHigh ? 'high' : 'medium',
        category: 'function-optimization',
        title: `Potential function refactor: ${fn.name}`,
        reason: alerts.join(' '),
        files: [`${fn.file}:${fn.lineStart}-${fn.lineEnd}`],
        suggestedFix: {
          strategy: 'Refactor for readability and testability.',
          steps: [
            'Split into smaller subroutines with single responsibilities.',
            'Convert deeply nested branches into guard clauses when safe.',
            'Replace loops with intent-specific helpers if one loop owns most lines.',
            'Add unit coverage for each extracted piece before deleting old logic.',
          ],
        },
        impact: 'Cleaner flow, easier review and safer refactors.',
      }));
    }
  }

  if (dependencySummary.testOnlyModules?.length > 0) {
    for (const file of dependencySummary.testOnlyModules.slice(0, 25)) {
      addFinding({
        severity: 'medium',
        category: 'dependency-test-only',
        file: file.file,
        lineStart: file.lineStart || 1,
        lineEnd: file.lineEnd || 1,
        title: `Module imported only from tests: ${file.file}`,
        reason: 'No production file imports this module, but tests do. Verify if this module belongs in test fixtures/helpers.',
        files: [file.file],
        suggestedFix: {
          strategy: 'Move test-only utilities to test scope or make production usage explicit.',
          steps: [
            'Re-run import scanning after moving test-only modules to __tests__ or helper folders.',
            'If this is shared production utility, add a non-test entrypoint/import.',
            'Remove dead or stale production references and delete unused module if confirmed.',
          ],
        },
        impact: 'Reduces shipping of non-production-only modules and clarifies ownership boundaries.',
      });
    }
  }

  if (dependencySummary.cycles?.length > 0) {
    for (const cycle of dependencySummary.cycles.slice(0, 15)) {
      addFinding({
        severity: 'high',
        category: 'dependency-cycle',
        file: cycle.path[0],
        lineStart: 1,
        lineEnd: 1,
        title: `Dependency cycle detected (${cycle.nodeCount} node cycle)`,
        reason: `Import cycle exists across: ${cycle.path.join(' -> ')}`,
        files: cycle.path,
        suggestedFix: {
          strategy: 'Break the cycle with a lower-level abstraction or interface module.',
          steps: [
            'Extract shared contracts/types to a dedicated contract/shared package.',
            'Move implementation in one direction using dependency inversion.',
            'Split stateful modules into protocol and runtime layers.',
          ],
        },
        impact: 'Cycles increase coupling and make incremental loading/debugging and refactors riskier.',
      });
    }
  }

  if (dependencySummary.criticalPaths?.length > 0) {
    for (const pathEntry of dependencySummary.criticalPaths.slice(0, 10)) {
      if (pathEntry.score < (options.criticalComplexityThreshold * 3)) continue;
      addFinding({
        severity: pathEntry.score >= options.criticalComplexityThreshold * 6 ? 'critical' : 'high',
        category: 'dependency-critical-path',
        file: pathEntry.path[0],
        lineStart: 1,
        lineEnd: 1,
        title: `Critical dependency chain risk: ${pathEntry.length} files`,
        reason: `Potentially high-change surface: ${pathEntry.path.join(' -> ')} (${pathEntry.score} weight).`,
        files: pathEntry.path,
        suggestedFix: {
          strategy: 'Reduce chain length and isolate high-complexity hotspots.',
          steps: [
            'Split module responsibilities so high-impact file is not transitively coupled to many modules.',
            'Add explicit interfaces for deep dependency boundaries.',
            'Cache or memoize heavy intermediate computation in chain nodes where possible.',
          ],
        },
        impact: 'Critical refactor opportunities; shorter chains reduce blast radius of change.',
      });
    }
  }

  const consumedFromModule = new Map<string, Set<string>>();
  for (const [file, imports] of dependencyState.importedSymbolsByFile.entries()) {
    if (isTestFile(file)) continue;
    for (const symbol of imports) {
      const target = symbol.resolvedModule;
      if (!target) continue;
      if (!consumedFromModule.has(target)) consumedFromModule.set(target, new Set());
      consumedFromModule.get(target)!.add(symbol.importedName);
    }
  }

  for (const [file, reexports] of dependencyState.reExportsByFile.entries()) {
    if (isTestFile(file)) continue;
    for (const reexport of reexports) {
      const target = reexport.resolvedModule;
      if (!target) continue;
      if (!consumedFromModule.has(target)) consumedFromModule.set(target, new Set());
      consumedFromModule.get(target)!.add(reexport.importedName);
    }
  }

  for (const file of dependencySummary.roots || []) {
    if (isTestFile(file)) continue;
    if (isLikelyEntrypoint(file)) continue;
    const incomingCount = (dependencyState.incoming.get(file) || new Set()).size;
    const outgoingCount = (dependencyState.outgoing.get(file) || new Set()).size;
    if (incomingCount !== 0) continue;
    if (outgoingCount > 0) continue;
    addFinding({
      severity: 'medium',
      category: 'dead-file',
      file,
      lineStart: 1,
      lineEnd: 1,
      title: `Potential dead file: ${file}`,
      reason: 'File has no inbound imports and no outbound dependencies. It may be stale or orphaned.',
      files: [file],
      suggestedFix: {
        strategy: 'Validate ownership and remove if truly unused.',
        steps: [
          'Confirm the file is not an explicit runtime entrypoint.',
          'Search runtime config/router/bootstrap references for this file path.',
          'Delete file if confirmed dead and re-run scan.',
        ],
      },
      impact: 'Reduces dead surface area and maintenance overhead.',
    });
  }

  for (const [file, exportsList] of dependencyState.declaredExportsByFile.entries()) {
    if (isTestFile(file)) continue;
    if (isLikelyEntrypoint(file)) continue;
    const consumed = consumedFromModule.get(file) || new Set<string>();
    const hasNamespaceUse = consumed.has('*');
    for (const exported of exportsList) {
      if (exported.name === 'default' && isLikelyEntrypoint(file)) continue;
      if (hasNamespaceUse || consumed.has(exported.name)) continue;
      addFinding({
        severity: exported.kind === 'type' ? 'medium' : 'high',
        category: 'dead-export',
        file,
        lineStart: exported.lineStart || 1,
        lineEnd: exported.lineEnd || exported.lineStart || 1,
        title: `Unused export: ${exported.name}`,
        reason: `Exported symbol "${exported.name}" has no observed import or re-export usage in production files.`,
        files: [`${file}:${exported.lineStart || 1}-${exported.lineEnd || exported.lineStart || 1}`],
        suggestedFix: {
          strategy: 'Remove or internalize unused exports.',
          steps: [
            'Confirm symbol is not part of intentional public API surface.',
            'Remove export modifier or delete symbol if truly unused.',
            'Re-run scan and tests to ensure no hidden runtime usage.',
          ],
        },
        impact: 'Shrinks public API surface and reduces accidental coupling.',
      });
    }
  }

  for (const [barrelFile, reexports] of dependencyState.reExportsByFile.entries()) {
    if (isTestFile(barrelFile)) continue;
    const consumed = consumedFromModule.get(barrelFile) || new Set<string>();
    const hasNamespaceUse = consumed.has('*');
    const sourceByExportedAs = new Map<string, Set<string>>();
    const localExportNames = new Set((dependencyState.declaredExportsByFile.get(barrelFile) || []).map((entry) => entry.name));

    for (const ref of reexports) {
      const exportedAs = ref.exportedAs;
      if (!sourceByExportedAs.has(exportedAs)) sourceByExportedAs.set(exportedAs, new Set());
      sourceByExportedAs.get(exportedAs)!.add(ref.resolvedModule || ref.sourceModule);

      const isUsed = hasNamespaceUse || consumed.has(exportedAs) || (ref.isStar && consumed.size > 0);
      if (!isUsed) {
        addFinding({
          severity: 'medium',
          category: 'dead-re-export',
          file: barrelFile,
          lineStart: ref.lineStart || 1,
          lineEnd: ref.lineEnd || ref.lineStart || 1,
          title: `Unused re-export: ${exportedAs}`,
          reason: `Re-exported symbol "${exportedAs}" from ${ref.sourceModule} has no observed downstream imports from this module.`,
          files: [`${barrelFile}:${ref.lineStart || 1}-${ref.lineEnd || ref.lineStart || 1}`],
          suggestedFix: {
            strategy: 'Remove stale barrel re-exports.',
            steps: [
              'Verify no dynamic import/runtime reflection depends on this export.',
              'Remove the re-export clause.',
              'Re-run scan to confirm barrel surface is still complete.',
            ],
          },
          impact: 'Keeps barrel modules focused and easier to reason about.',
        });
      }
    }

    for (const [name, sources] of sourceByExportedAs.entries()) {
      if (sources.size > 1) {
        addFinding({
          severity: 'medium',
          category: 're-export-duplication',
          file: barrelFile,
          lineStart: 1,
          lineEnd: 1,
          title: `Duplicate re-export paths: ${name}`,
          reason: `Symbol "${name}" is re-exported from multiple sources in the same barrel.`,
          files: [barrelFile],
          suggestedFix: {
            strategy: 'Keep one canonical re-export source per symbol.',
            steps: [
              'Select a canonical module for the symbol.',
              'Remove duplicate re-export paths.',
              'Document intended public export map for the barrel.',
            ],
          },
          impact: 'Reduces API ambiguity and import inconsistency.',
        });
      }
      if (name !== '*' && localExportNames.has(name)) {
        addFinding({
          severity: 'high',
          category: 're-export-shadowed',
          file: barrelFile,
          lineStart: 1,
          lineEnd: 1,
          title: `Shadowed export in barrel: ${name}`,
          reason: `Barrel exports "${name}" both locally and through re-export, which can hide origin and create ambiguity.`,
          files: [barrelFile],
          suggestedFix: {
            strategy: 'Disambiguate local vs re-exported symbol ownership.',
            steps: [
              'Pick a single source of truth for the symbol in this barrel.',
              'Rename or remove the conflicting export path.',
              'Update import call-sites to use the canonical export.',
            ],
          },
          impact: 'Prevents subtle API conflicts and shadowing confusion.',
        });
      }
    }
  }

  // ─── Phase 2: Architecture Metrics ──────────────────────────────────────
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

  const sortedFindings = [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (bySeverity !== 0) return bySeverity;
    if (a.category < b.category) return -1;
    if (a.category > b.category) return 1;
    return 0;
  });

  return { findings: sortedFindings, byFile: perFileIssues };
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

  const allFindings = report.optimizationFindings || [];
  const architectureFindings = allFindings.filter(f => ARCHITECTURE_CATEGORIES.has(f.category));
  const codeQualityFindings = allFindings.filter(f => CODE_QUALITY_CATEGORIES.has(f.category));
  const deadCodeFindings = allFindings.filter(f => DEAD_CODE_CATEGORIES.has(f.category));

  const outputFiles: Record<string, string> = {
    summary: 'summary.json',
    architecture: 'architecture.json',
    codeQuality: 'code-quality.json',
    deadCode: 'dead-code.json',
    fileInventory: 'file-inventory.json',
    findings: 'findings.json',
  };

  writeJson('architecture.json', {
    generatedAt: report.generatedAt,
    dependencyGraph: report.dependencyGraph,
    dependencyFindings: report.dependencyFindings,
    findings: architectureFindings,
    findingsCount: architectureFindings.length,
    severityBreakdown: severityBreakdown(architectureFindings),
    categoryBreakdown: categoryBreakdown(architectureFindings),
  });

  writeJson('code-quality.json', {
    generatedAt: report.generatedAt,
    duplicateFlows: report.duplicateFlows,
    optimizationOpportunities: report.optimizationOpportunities,
    findings: codeQualityFindings,
    findingsCount: codeQualityFindings.length,
    severityBreakdown: severityBreakdown(codeQualityFindings),
    categoryBreakdown: categoryBreakdown(codeQualityFindings),
  });

  writeJson('dead-code.json', {
    generatedAt: report.generatedAt,
    findings: deadCodeFindings,
    findingsCount: deadCodeFindings.length,
    severityBreakdown: severityBreakdown(deadCodeFindings),
    categoryBreakdown: categoryBreakdown(deadCodeFindings),
  });

  writeJson('file-inventory.json', {
    generatedAt: report.generatedAt,
    fileInventory: report.fileInventory,
    fileCount: report.fileInventory?.length || 0,
  });

  writeJson('findings.json', {
    generatedAt: report.generatedAt,
    optimizationFindings: report.optimizationFindings,
    totalFindings: report.optimizationFindings?.length || 0,
  });

  if (options.graph) {
    const graphMd = generateMermaidGraph(dependencyState, dependencySummary, fileCriticalityByPath);
    fs.writeFileSync(path.join(dir, 'graph.md'), graphMd, 'utf8');
    outputFiles.graph = 'graph.md';
  }

  if (report.astTrees) {
    writeJson('ast-trees.json', {
      generatedAt: report.generatedAt,
      astTrees: report.astTrees,
    });
    outputFiles.astTrees = 'ast-trees.json';
  }

  const summaryMd = generateSummaryMd(report, outputFiles, architectureFindings, codeQualityFindings, deadCodeFindings);
  fs.writeFileSync(path.join(dir, 'summary.md'), summaryMd, 'utf8');
  outputFiles.summaryMd = 'summary.md';

  writeJson('summary.json', {
    generatedAt: report.generatedAt,
    repoRoot: report.repoRoot,
    options: report.options,
    parser: report.parser,
    summary: report.summary,
    agentOutput: report.agentOutput,
    parseErrors: report.parseErrors,
    outputFiles,
  });

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

export function generateSummaryMd(
  report: FullReport,
  outputFiles: Record<string, string>,
  architectureFindings: Finding[],
  codeQualityFindings: Finding[],
  deadCodeFindings: Finding[],
): string {
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

  lines.push('## Architecture Health\n');
  lines.push(`> ${architectureFindings.length} findings — see [\`architecture.json\`](./architecture.json)\n`);
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
  const archCats = categoryBreakdown(architectureFindings);
  if (Object.keys(archCats).length > 0) {
    for (const [cat, count] of Object.entries(archCats).sort((a, b) => b[1] - a[1])) {
      lines.push(`- \`${cat}\`: ${count}`);
    }
    lines.push('');
  }

  lines.push('## Code Quality\n');
  lines.push(`> ${codeQualityFindings.length} findings — see [\`code-quality.json\`](./code-quality.json)\n`);
  const qualCats = categoryBreakdown(codeQualityFindings);
  if (Object.keys(qualCats).length > 0) {
    for (const [cat, count] of Object.entries(qualCats).sort((a, b) => b[1] - a[1])) {
      lines.push(`- \`${cat}\`: ${count}`);
    }
    lines.push('');
  }

  lines.push('## Dead Code & Hygiene\n');
  lines.push(`> ${deadCodeFindings.length} findings — see [\`dead-code.json\`](./dead-code.json)\n`);
  const deadCats = categoryBreakdown(deadCodeFindings);
  if (Object.keys(deadCats).length > 0) {
    for (const [cat, count] of Object.entries(deadCats).sort((a, b) => b[1] - a[1])) {
      lines.push(`- \`${cat}\`: ${count}`);
    }
    lines.push('');
  }

  const topRecs = (agentOutput?.topRecommendations ?? []) as Array<{ severity: string; title: string; file: string; category: string }>;
  if (topRecs.length > 0) {
    lines.push('## Top Recommendations\n');
    for (const rec of topRecs.slice(0, 10)) {
      lines.push(`- **[${rec.severity.toUpperCase()}]** \`${rec.file}\` — ${rec.title}`);
    }
    lines.push('');
  }

  lines.push('## Output Files\n');
  lines.push('| File | Description |');
  lines.push('|------|-------------|');
  const descriptions: Record<string, string> = {
    summary: 'Scan metadata, agent output, parse errors',
    architecture: 'Dependency graph, cycles, critical paths, architecture findings',
    codeQuality: 'Duplicate detection, complexity, god modules/functions',
    deadCode: 'Dead files/exports/re-exports, unused deps, boundary violations',
    fileInventory: 'Per-file function/flow/dependency details',
    findings: 'All findings across all categories (master list)',
    graph: 'Mermaid dependency graph',
    astTrees: 'AST tree snapshots',
    summaryMd: 'This file — human-readable overview',
  };
  for (const [key, file] of Object.entries(outputFiles)) {
    lines.push(`| [\`${file}\`](./${file}) | ${descriptions[key] || key} |`);
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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const isLegacyMode = options.out?.endsWith('.json');
  const outputDir = isLegacyMode ? null : (options.out || path.join(options.root, '.octocode', 'scan', timestamp));
  const outputPath = isLegacyMode ? options.out : null;

  const packages = listWorkspacePackages(options.root, options.packageRoot);
  if (!packages.length) {
    console.error(`No packages found in ${options.packageRoot}`);
    process.exit(1);
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
    const analysisFileSet = new Set(packageFiles);

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

        const treeSitterPrimary = useTreeSitter && options.parser === 'tree-sitter';

        let fileSummary: FileEntry;

        if (treeSitterPrimary) {
          const treeSitterEntry = analyzeTreeSitterFile(filePath, text, options, pkg.name, { flowMap, controlMap });
          if (!treeSitterEntry) {
            const fallback = analyzeSourceFile(source, pkg.name, packageStats, options, { flowMap, controlMap }, trees, dependencyProfile);
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
            { flowMap, controlMap },
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
    if (flow.occurrences >= CONTROL_KIND_DUP_THRESHOLD) {
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

  const { findings, byFile } = buildIssueCatalog(
    duplicateFunctions,
    redundantFlows,
    fileSummaries,
    dependencySummary,
    dependencyState,
    options,
    allPkgJsonDeps,
    allPkgJsonDevDeps,
  );

  const enhancedFileSummaries = fileSummaryWithFindings(fileSummaries, byFile);

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
      highPriority: findings.filter((f) => f.severity === 'high' || f.severity === 'critical').length,
      mediumPriority: findings.filter((f) => f.severity === 'medium').length,
      lowPriority: findings.filter((f) => f.severity === 'low' || f.severity === 'info').length,
      topRecommendations: findings.slice(0, 20).map((f) => ({
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

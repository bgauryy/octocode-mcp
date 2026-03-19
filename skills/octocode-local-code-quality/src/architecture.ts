import * as ts from 'typescript';

import { isTestFile } from './utils.js';

import type {
  DependencyState,
  DependencySummary,
  DuplicateGroup,
  FileCriticality,
  FileEntry,
  Finding,
  HotFile,
  RedundantFlowGroup,
} from './types.js';

type FindingDraft = Omit<Finding, 'id'>;

function findImportLine(state: DependencyState, fromFile: string, toFile: string): { lineStart: number; lineEnd: number } {
  const imports = state.importedSymbolsByFile.get(fromFile);
  if (imports) {
    for (const ref of imports) {
      if (ref.resolvedModule === toFile && ref.lineStart) {
        return { lineStart: ref.lineStart, lineEnd: ref.lineEnd ?? ref.lineStart };
      }
    }
  }
  const reexports = state.reExportsByFile.get(fromFile);
  if (reexports) {
    for (const ref of reexports) {
      if (ref.resolvedModule === toFile && ref.lineStart) {
        return { lineStart: ref.lineStart, lineEnd: ref.lineEnd ?? ref.lineStart };
      }
    }
  }
  return { lineStart: 1, lineEnd: 1 };
}

export function isLikelyEntrypoint(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  if (/(^|\/)(index|main|app|server|cli|public)\.[mc]?[jt]sx?$/.test(normalized)) return true;
  if (/\.(config)\.[mc]?[jt]sx?$/.test(normalized)) return true;
  return false;
}

function folderOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? '.' : normalized.slice(0, idx);
}

// ─── Consumed-From-Module Map (for dead-code detectors) ──────────────────────

export function buildConsumedFromModule(dependencyState: DependencyState): {
  production: Map<string, Set<string>>;
  test: Map<string, Set<string>>;
} {
  const production = new Map<string, Set<string>>();
  const test = new Map<string, Set<string>>();
  for (const [file, imports] of dependencyState.importedSymbolsByFile.entries()) {
    const targetMap = isTestFile(file) ? test : production;
    for (const symbol of imports) {
      const target = symbol.resolvedModule;
      if (!target) continue;
      if (!targetMap.has(target)) targetMap.set(target, new Set());
      targetMap.get(target)!.add(symbol.importedName);
    }
  }
  for (const [file, reexports] of dependencyState.reExportsByFile.entries()) {
    const targetMap = isTestFile(file) ? test : production;
    for (const reexport of reexports) {
      const target = reexport.resolvedModule;
      if (!target) continue;
      if (!targetMap.has(target)) targetMap.set(target, new Set());
      targetMap.get(target)!.add(reexport.importedName);
    }
  }
  return { production, test };
}

// ─── Duplicate Function Bodies ──────────────────────────────────────────────

export function detectDuplicateFunctionBodies(duplicates: DuplicateGroup[]): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const group of duplicates) {
    const sample = group.locations[0];
    const reason = `Same ${group.kind} body shape appears in ${group.occurrences} places (` +
      `${group.filesCount} file${group.filesCount > 1 ? 's' : ''}).`;
    const severity: Finding['severity'] = group.occurrences >= 6 ? 'high' : group.occurrences >= 3 ? 'medium' : 'low';
    findings.push({
      ...sample,
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
      tags: ['duplication', 'maintainability', 'dryness'],
      lspHints: [
        {
          tool: 'lspGotoDefinition',
          symbolName: group.signature,
          lineHint: sample.lineStart,
          file: sample.file,
          expectedResult: `navigate to one instance to compare implementations side-by-side`,
        },
      ],
    });
  }
  return findings;
}

// ─── Duplicate Flow Structures ─────────────────────────────────────────────

export function detectDuplicateFlowStructures(
  controlDuplicates: RedundantFlowGroup[],
  flowDupThreshold: number,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const group of controlDuplicates) {
    if (group.occurrences < flowDupThreshold) continue;
    const sample = group.locations[0];
    const reason = `${group.kind} structure appears ${group.occurrences} times across ${group.filesCount} file(s).`;
    const severity: Finding['severity'] = group.occurrences >= 10 ? 'high' : 'medium';
    findings.push({
      ...sample,
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
      tags: ['duplication', 'control-flow', 'dryness'],
    });
  }
  return findings;
}

// ─── Function Optimization ──────────────────────────────────────────────────

export function detectFunctionOptimization(
  fileSummaries: FileEntry[],
  criticalComplexityThreshold: number,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const fileEntry of fileSummaries) {
    for (const fn of fileEntry.functions) {
      const alerts: string[] = [];
      if (fn.complexity >= criticalComplexityThreshold) alerts.push(`Cyclomatic-like complexity is high (>=${criticalComplexityThreshold}).`);
      if (fn.maxBranchDepth >= 7) alerts.push('Branch depth is very deep and hard to reason about.');
      if (fn.maxLoopDepth >= 4) alerts.push('Nested loops are high and likely expensive.');
      if (fn.statementCount >= 24) alerts.push('Function body is large and may be doing multiple responsibilities.');

      if (alerts.length === 0) continue;

      const isHigh = fn.complexity >= criticalComplexityThreshold || fn.maxBranchDepth >= 7 || fn.maxLoopDepth >= 4;
      findings.push({
        ...fn,
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
        tags: ['complexity', 'readability', 'refactor'],
        lspHints: [
          {
            tool: 'lspCallHierarchy',
            symbolName: fn.name,
            lineHint: fn.lineStart,
            file: fn.file,
            expectedResult: `inspect callers and callees to plan safe decomposition of ${fn.name}`,
          },
        ],
      });
    }
  }
  return findings;
}

// ─── Test-Only Modules ──────────────────────────────────────────────────────

export function detectTestOnlyModules(dependencySummary: DependencySummary): FindingDraft[] {
  const findings: FindingDraft[] = [];
  if (dependencySummary.testOnlyModules?.length === 0) return findings;
  for (const file of (dependencySummary.testOnlyModules || []).slice(0, 25)) {
    findings.push({
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
      tags: ['testing', 'dead-code', 'dependency'],
    });
  }
  return findings;
}

// ─── Dependency Cycle Findings ──────────────────────────────────────────────

export function detectDependencyCycles(
  dependencySummary: DependencySummary,
  dependencyState: DependencyState,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  if (dependencySummary.cycles?.length === 0) return findings;
  for (const cycle of (dependencySummary.cycles || []).slice(0, 15)) {
    const cycleLine = findImportLine(dependencyState, cycle.path[0], cycle.path[1]);
    findings.push({
      severity: 'high',
      category: 'dependency-cycle',
      file: cycle.path[0],
      lineStart: cycleLine.lineStart,
      lineEnd: cycleLine.lineEnd,
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
      tags: ['cycle', 'coupling', 'dependency', 'change-risk'],
      lspHints: [
        {
          tool: 'lspGotoDefinition',
          symbolName: cycle.path[1],
          lineHint: cycleLine.lineStart,
          file: cycle.path[0],
          expectedResult: `navigate to the import that creates the cycle edge`,
        },
      ],
    });
  }
  return findings;
}

// ─── Critical Path Findings ──────────────────────────────────────────────────

function findChainHotspot(
  chainPath: string[],
  dependencyState: DependencyState,
): { module: string; fanOut: number; fanIn: number } {
  let best = { module: chainPath[0], fanOut: 0, fanIn: 0 };
  for (const mod of chainPath) {
    const fanOut = (dependencyState.outgoing.get(mod) || new Set()).size;
    const fanIn = (dependencyState.incoming.get(mod) || new Set()).size;
    if (fanOut > best.fanOut) {
      best = { module: mod, fanOut, fanIn };
    }
  }
  return best;
}

export function mergeOverlappingChains(findings: FindingDraft[], overlapThreshold: number = 0.8): FindingDraft[] {
  if (findings.length <= 1) return findings;

  const merged: FindingDraft[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < findings.length; i++) {
    if (consumed.has(i)) continue;
    const base = findings[i];
    const baseSet = new Set(base.files);
    const entryPoints = [base.file];

    for (let j = i + 1; j < findings.length; j++) {
      if (consumed.has(j)) continue;
      const other = findings[j];
      const otherSet = new Set(other.files);
      const intersection = [...baseSet].filter((f) => otherSet.has(f)).length;
      const union = new Set([...baseSet, ...otherSet]).size;
      const overlap = union > 0 ? intersection / union : 0;

      if (overlap >= overlapThreshold) {
        consumed.add(j);
        entryPoints.push(other.file);
        // Merge files from the other chain into base
        for (const f of other.files) baseSet.add(f);
      }
    }

    if (entryPoints.length > 1) {
      const allFiles = [...baseSet];
      merged.push({
        ...base,
        title: `Critical dependency chain risk: ${allFiles.length} files (${entryPoints.length} entry points)`,
        reason: base.reason + ` Also reached from: ${entryPoints.slice(1).join(', ')}.`,
        files: allFiles,
      });
    } else {
      merged.push(base);
    }
  }

  return merged;
}

export function detectCriticalPaths(
  dependencySummary: DependencySummary,
  dependencyState: DependencyState,
  criticalComplexityThreshold: number,
): FindingDraft[] {
  const rawFindings: FindingDraft[] = [];
  if (dependencySummary.criticalPaths?.length === 0) return rawFindings;
  for (const pathEntry of (dependencySummary.criticalPaths || []).slice(0, 10)) {
    if (pathEntry.score < (criticalComplexityThreshold * 3)) continue;
    const chainLine = findImportLine(dependencyState, pathEntry.path[0], pathEntry.path[1]);
    const hotspot = findChainHotspot(pathEntry.path, dependencyState);
    rawFindings.push({
      severity: pathEntry.score >= criticalComplexityThreshold * 6 ? 'critical' : 'high',
      category: 'dependency-critical-path',
      file: pathEntry.path[0],
      lineStart: chainLine.lineStart,
      lineEnd: chainLine.lineEnd,
      title: `Critical dependency chain risk: ${pathEntry.length} files`,
      reason: `Potentially high-change surface: ${pathEntry.path.join(' -> ')} (${pathEntry.score} weight).`,
      files: pathEntry.path,
      suggestedFix: {
        strategy: `Break chain at \`${hotspot.module}\` (fan-out: ${hotspot.fanOut}, fan-in: ${hotspot.fanIn}).`,
        steps: [
          `Extract interface from \`${hotspot.module}\` — it has ${hotspot.fanOut} outbound dependencies.`,
          'Downstream modules depend on the interface, not the implementation.',
          'This splits the chain into two independent segments.',
        ],
      },
      impact: 'Critical refactor opportunities; shorter chains reduce blast radius of change.',
      tags: ['change-risk', 'dependency', 'blast-radius'],
    });
  }
  return mergeOverlappingChains(rawFindings);
}

// ─── Dead Files ─────────────────────────────────────────────────────────────

export function detectDeadFiles(
  dependencySummary: DependencySummary,
  dependencyState: DependencyState,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const file of dependencySummary.roots || []) {
    if (isTestFile(file)) continue;
    if (isLikelyEntrypoint(file)) continue;
    const incomingCount = (dependencyState.incoming.get(file) || new Set()).size;
    const outgoingCount = (dependencyState.outgoing.get(file) || new Set()).size;
    if (incomingCount !== 0) continue;
    if (outgoingCount > 0) continue;
    findings.push({
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
      tags: ['dead-code', 'cleanup', 'hygiene'],
      lspHints: [
        {
          tool: 'lspFindReferences',
          symbolName: file.split('/').pop() || file,
          lineHint: 1,
          file,
          expectedResult: `confirm zero references exist before deletion`,
        },
      ],
    });
  }
  return findings;
}

// ─── Dead Exports ───────────────────────────────────────────────────────────

export function detectDeadExports(
  dependencyState: DependencyState,
  consumedFromModule: Map<string, Set<string>>,
  testConsumedFromModule?: Map<string, Set<string>>,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const [file, exportsList] of dependencyState.declaredExportsByFile.entries()) {
    if (isTestFile(file)) continue;
    if (isLikelyEntrypoint(file)) continue;
    const consumed = consumedFromModule.get(file) || new Set<string>();
    const testConsumed = testConsumedFromModule?.get(file) || new Set<string>();
    const hasNamespaceUse = consumed.has('*');
    const hasTestNamespaceUse = testConsumed.has('*');
    for (const exported of exportsList) {
      if (exported.name === 'default' && isLikelyEntrypoint(file)) continue;
      if (hasNamespaceUse || consumed.has(exported.name)) continue;
      // Check if consumed only by test files — report as low-severity info, not dead
      if (hasTestNamespaceUse || testConsumed.has(exported.name)) continue;
      findings.push({
        severity: exported.kind === 'type' ? 'medium' : 'high',
        category: 'dead-export',
        file,
        lineStart: exported.lineStart || 1,
        lineEnd: exported.lineEnd || exported.lineStart || 1,
        title: `Unused export: ${exported.name}`,
        reason: `Exported symbol "${exported.name}" has no observed import or re-export usage in production or test files.`,
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
        tags: ['dead-code', 'api-surface', 'cleanup'],
        lspHints: [
          {
            tool: 'lspFindReferences',
            symbolName: exported.name,
            lineHint: exported.lineStart || 1,
            file,
            expectedResult: `confirm "${exported.name}" has no import references before removing`,
          },
        ],
      });
    }
  }
  return findings;
}

// ─── Dead Re-Exports, Re-Export Duplication, Re-Export Shadowed ──────────────

export function detectDeadReExports(
  dependencyState: DependencyState,
  consumedFromModule: Map<string, Set<string>>,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
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
        findings.push({
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
          tags: ['dead-code', 'barrel', 'cleanup'],
        });
      }
    }

    for (const [name, sources] of sourceByExportedAs.entries()) {
      if (sources.size > 1) {
        findings.push({
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
          tags: ['duplication', 'barrel', 'api-surface'],
        });
      }
      if (name !== '*' && localExportNames.has(name)) {
        findings.push({
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
          tags: ['barrel', 'api-surface', 'ambiguity'],
        });
      }
    }
  }
  return findings;
}

// ─── 2A: Instability Metric (SDP) ──────────────────────────────────────────

export function computeInstability(inboundCount: number, outboundCount: number): number {
  const total = inboundCount + outboundCount;
  if (total === 0) return 0;
  return outboundCount / total;
}

export function detectSdpViolations(
  dependencyState: DependencyState,
  minDelta: number = 0.15,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const cache = new Map<string, number>();

  const getI = (file: string): number => {
    if (cache.has(file)) return cache.get(file)!;
    const ca = (dependencyState.incoming.get(file) || new Set()).size;
    const ce = (dependencyState.outgoing.get(file) || new Set()).size;
    const i = computeInstability(ca, ce);
    cache.set(file, i);
    return i;
  };

  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;
    const deps = dependencyState.outgoing.get(file) || new Set();
    const iSrc = getI(file);

    for (const dep of deps) {
      if (!dependencyState.files.has(dep) || isTestFile(dep)) continue;
      const iTgt = getI(dep);
      const delta = iTgt - iSrc;

      if (delta > minDelta && iSrc < 0.5) {
        const importRef = findImportLine(dependencyState, file, dep);
        findings.push({
          severity: delta > 0.3 ? 'high' : 'medium',
          category: 'architecture-sdp-violation',
          file,
          lineStart: importRef.lineStart,
          lineEnd: importRef.lineEnd,
          title: `SDP violation: stable module depends on unstable module`,
          reason: `"${file}" (I=${iSrc.toFixed(2)}) depends on "${dep}" (I=${iTgt.toFixed(2)}). Delta=${delta.toFixed(2)}.`,
          files: [file, dep],
          suggestedFix: {
            strategy: 'Invert dependency via interface/abstraction or move shared code to a stable utility.',
            steps: [
              'Extract a stable interface that the stable module depends on.',
              'Have the unstable module implement that interface.',
              'Consider moving shared logic to a lower-instability utility module.',
            ],
          },
          impact: 'Prevents cascading instability and reduces change propagation risk.',
          tags: ['stability', 'coupling', 'architecture', 'sdp'],
        });
      }
    }
  }

  return findings;
}

// ─── 2B: Afferent/Efferent Coupling ────────────────────────────────────────

export function detectHighCoupling(
  dependencyState: DependencyState,
  threshold: number = 15,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;
    const ca = (dependencyState.incoming.get(file) || new Set()).size;
    const ce = (dependencyState.outgoing.get(file) || new Set()).size;
    const total = ca + ce;

    if (total > threshold) {
      findings.push({
        severity: total > 25 ? 'high' : 'medium',
        category: 'high-coupling',
        file,
        lineStart: 1,
        lineEnd: 1,
        title: `High coupling: ${file}`,
        reason: `Module has ${total} total connections (Ca=${ca}, Ce=${ce}). Threshold: ${threshold}.`,
        files: [file],
        suggestedFix: {
          strategy: 'Reduce coupling by extracting interfaces or splitting module responsibilities.',
          steps: [
            'Identify groups of related imports/dependents that can be isolated.',
            'Extract focused sub-modules with single responsibilities.',
            'Use dependency inversion to reduce direct coupling.',
          ],
        },
        impact: 'Lower coupling reduces change ripple effects and improves testability.',
        tags: ['coupling', 'change-risk', 'architecture'],
      });
    }
  }

  return findings;
}

// ─── 2C: Fan-In / Fan-Out Thresholds ───────────────────────────────────────

export function detectGodModuleCoupling(
  dependencyState: DependencyState,
  fanInThreshold: number = 20,
  fanOutThreshold: number = 15,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;
    const fanIn = (dependencyState.incoming.get(file) || new Set()).size;
    const fanOut = (dependencyState.outgoing.get(file) || new Set()).size;

    if (fanIn > fanInThreshold) {
      findings.push({
        severity: fanIn > fanInThreshold * 1.5 ? 'high' : 'medium',
        category: 'god-module-coupling',
        file,
        lineStart: 1,
        lineEnd: 1,
        title: `High fan-in bottleneck: ${file}`,
        reason: `Module is depended on by ${fanIn} modules (threshold: ${fanInThreshold}). Changes ripple widely.`,
        files: [file],
        suggestedFix: {
          strategy: 'Split this module into focused sub-modules to reduce blast radius.',
          steps: [
            'Identify distinct groups of consumers using different parts of this module.',
            'Extract each group into a dedicated module.',
            'Update import paths incrementally.',
          ],
        },
        impact: 'Reduces change blast radius and improves parallel development.',
        tags: ['coupling', 'blast-radius', 'bottleneck'],
      });
    }

    if (fanOut > fanOutThreshold) {
      findings.push({
        severity: fanOut > fanOutThreshold * 1.5 ? 'high' : 'medium',
        category: 'god-module-coupling',
        file,
        lineStart: 1,
        lineEnd: 1,
        title: `High fan-out: ${file}`,
        reason: `Module depends on ${fanOut} modules (threshold: ${fanOutThreshold}). It may violate single responsibility.`,
        files: [file],
        suggestedFix: {
          strategy: 'Reduce dependencies by introducing facade or mediator patterns.',
          steps: [
            'Group related imports behind a single facade module.',
            'Consider splitting this module by responsibility.',
            'Use dependency injection to reduce direct coupling.',
          ],
        },
        impact: 'Cleaner architecture and easier testing through reduced dependencies.',
        tags: ['coupling', 'responsibility', 'sprawl'],
      });
    }
  }

  return findings;
}

// ─── 2D: Orphan Module Detection ───────────────────────────────────────────

export function detectOrphanModules(
  dependencyState: DependencyState,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;
    if (isLikelyEntrypoint(file)) continue;

    const ca = (dependencyState.incoming.get(file) || new Set()).size;
    const ce = (dependencyState.outgoing.get(file) || new Set()).size;

    if (ca === 0 && ce === 0) {
      findings.push({
        severity: 'medium',
        category: 'orphan-module',
        file,
        lineStart: 1,
        lineEnd: 1,
        title: `Orphan module: ${file}`,
        reason: 'Module has no inbound or outbound dependencies — completely disconnected from the module graph.',
        files: [file],
        suggestedFix: {
          strategy: 'Delete if truly unused, or wire into module graph.',
          steps: [
            'Check if the file is a runtime entrypoint, route, or config.',
            'If truly disconnected, delete and re-run scan.',
            'If needed, add an explicit import from the appropriate parent module.',
          ],
        },
        impact: 'Removes dead surface area and clarifies module ownership.',
        tags: ['dead-code', 'dependency', 'isolation'],
      });
    }
  }

  return findings;
}

// ─── 2E: Reachability Analysis ─────────────────────────────────────────────

export function detectUnreachableModules(
  dependencyState: DependencyState,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  const entrypoints = new Set<string>();
  for (const file of dependencyState.files) {
    if (isLikelyEntrypoint(file)) entrypoints.add(file);
  }
  if (entrypoints.size === 0) {
    for (const file of dependencyState.files) {
      if ((dependencyState.incoming.get(file) || new Set()).size === 0) {
        entrypoints.add(file);
      }
    }
  }

  const reachable = new Set<string>();
  const queue = [...entrypoints];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const dep of (dependencyState.outgoing.get(current) || new Set())) {
      if (dependencyState.files.has(dep) && !reachable.has(dep)) queue.push(dep);
    }
  }

  for (const file of dependencyState.files) {
    if (isTestFile(file) || reachable.has(file) || isLikelyEntrypoint(file)) continue;
    findings.push({
      severity: 'high',
      category: 'unreachable-module',
      file,
      lineStart: 1,
      lineEnd: 1,
      title: `Unreachable module: ${file}`,
      reason: 'Module is not reachable from any entrypoint via the import graph.',
      files: [file],
      suggestedFix: {
        strategy: 'Verify reachability and remove if truly dead.',
        steps: [
          'Check if this module is loaded dynamically or via framework conventions.',
          'Verify it is not registered as a route, plugin, or middleware.',
          'If confirmed unreachable, delete and re-run scan.',
        ],
      },
      impact: 'Identifies potentially large sections of dead code missed by direct-import checks.',
      tags: ['dead-code', 'dependency', 'reachability'],
    });
  }

  return findings;
}

// ─── 3A: Unused npm Dependencies ───────────────────────────────────────────

export function detectUnusedNpmDeps(
  externalDeps: Map<string, Set<string>>,
  packageJsonDeps: Record<string, string>,
  devDeps: Record<string, string> = {},
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  const usedPackages = new Set<string>();
  for (const depSet of externalDeps.values()) {
    for (const dep of depSet) {
      const parts = dep.split('/');
      usedPackages.add(dep.startsWith('@') && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0]);
    }
  }

  for (const pkgName of Object.keys(packageJsonDeps)) {
    if (!usedPackages.has(pkgName)) {
      findings.push({
        severity: 'medium',
        category: 'unused-npm-dependency',
        file: 'package.json',
        lineStart: 1,
        lineEnd: 1,
        title: `Unused dependency: ${pkgName}`,
        reason: `Package "${pkgName}" is in dependencies but no import was found.`,
        files: ['package.json'],
        suggestedFix: {
          strategy: 'Remove unused dependency from package.json.',
          steps: [
            'Verify the package is not loaded dynamically or via CLI scripts.',
            'Check if it is a peer dependency required at runtime.',
            'Run `npm uninstall` or remove from package.json.',
          ],
        },
        impact: 'Reduces install size and attack surface.',
        tags: ['dependency', 'hygiene', 'bundle-size'],
      });
    }
  }

  for (const pkgName of Object.keys(devDeps)) {
    if (!usedPackages.has(pkgName)) {
      findings.push({
        severity: 'low',
        category: 'unused-npm-dependency',
        file: 'package.json',
        lineStart: 1,
        lineEnd: 1,
        title: `Unused devDependency: ${pkgName}`,
        reason: `Package "${pkgName}" is in devDependencies but no import was found.`,
        files: ['package.json'],
        suggestedFix: {
          strategy: 'Remove unused devDependency from package.json.',
          steps: [
            'Verify the package is not used by build scripts, config files, or CLI tools.',
            'Run `npm uninstall` or remove from package.json.',
          ],
        },
        impact: 'Reduces install size and dependency maintenance burden.',
        tags: ['dependency', 'hygiene', 'dev-tooling'],
      });
    }
  }

  return findings;
}

// ─── 3B: Package Boundary Violations ───────────────────────────────────────

export function detectBoundaryViolations(
  dependencyState: DependencyState,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;

    const fileMatch = file.match(/^packages\/([^/]+)\//);
    if (!fileMatch) continue;
    const filePkg = fileMatch[1];

    for (const dep of (dependencyState.outgoing.get(file) || new Set())) {
      const depMatch = dep.match(/^packages\/([^/]+)\//);
      if (!depMatch) continue;
      if (depMatch[1] === filePkg) continue;

      const isPublicApi = /^packages\/[^/]+\/(src\/)?index\.[mc]?[jt]sx?$/.test(dep);
      if (!isPublicApi) {
        const isDeep = dep.includes('/internal/') || dep.includes('/private/');
        const importRef = findImportLine(dependencyState, file, dep);
        findings.push({
          severity: isDeep ? 'high' : 'medium',
          category: 'package-boundary-violation',
          file,
          lineStart: importRef.lineStart,
          lineEnd: importRef.lineEnd,
          title: `Cross-package import bypasses public API`,
          reason: `"${file}" imports "${dep}" directly instead of through the package public entry.`,
          files: [file, dep],
          suggestedFix: {
            strategy: 'Import through the package public API (index file).',
            steps: [
              'Re-export the needed symbol from the target package index.',
              'Update the import to use the package name or index path.',
              'If the symbol is internal, reconsider the dependency.',
            ],
          },
          impact: 'Enforces clean package boundaries and prevents coupling to internals.',
          tags: ['boundary', 'coupling', 'encapsulation'],
        });
      }
    }
  }

  return findings;
}

// ─── 3C: Barrel Explosion / Depth ──────────────────────────────────────────

export function computeBarrelDepth(
  file: string,
  dependencyState: DependencyState,
  visited: Set<string> = new Set(),
): number {
  if (visited.has(file)) return 0;
  visited.add(file);

  const reexports = dependencyState.reExportsByFile.get(file);
  if (!reexports || reexports.length === 0) return 0;

  let maxChild = 0;
  for (const re of reexports) {
    const target = re.resolvedModule;
    if (!target) continue;
    const targetRe = dependencyState.reExportsByFile.get(target);
    if (targetRe && targetRe.length > 0) {
      maxChild = Math.max(maxChild, computeBarrelDepth(target, dependencyState, visited));
    }
  }

  return 1 + maxChild;
}

export function detectBarrelExplosion(
  dependencyState: DependencyState,
  symbolThreshold: number = 30,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const [file, reexports] of dependencyState.reExportsByFile.entries()) {
    if (isTestFile(file)) continue;
    if (reexports.length === 0) continue;

    if (reexports.length > symbolThreshold) {
      findings.push({
        severity: reexports.length > symbolThreshold * 2 ? 'high' : 'medium',
        category: 'barrel-explosion',
        file,
        lineStart: 1,
        lineEnd: 1,
        title: `Barrel explosion: ${file}`,
        reason: `Barrel re-exports ${reexports.length} symbols (threshold: ${symbolThreshold}). Large barrels hurt bundling.`,
        files: [file],
        suggestedFix: {
          strategy: 'Split barrel or use direct imports to reduce bundler cost.',
          steps: [
            'Group re-exports by domain into sub-barrels.',
            'Let consumers import directly from source modules.',
            'Remove unused re-exports (check dead-re-export findings).',
          ],
        },
        impact: 'Reduces bundle size and speeds up IDE/tooling.',
        tags: ['barrel', 'bundle-size', 'tree-shaking'],
      });
    }

    const depth = computeBarrelDepth(file, dependencyState);
    if (depth > 2) {
      findings.push({
        severity: 'high',
        category: 'barrel-explosion',
        file,
        lineStart: 1,
        lineEnd: 1,
        title: `Deep barrel chain: ${file} (depth ${depth})`,
        reason: `Barrel chain is ${depth} levels deep. Deep chains defeat tree-shaking.`,
        files: [file],
        suggestedFix: {
          strategy: 'Flatten barrel chain to at most 2 levels.',
          steps: [
            'Re-export directly from source modules instead of intermediate barrels.',
            'Remove intermediate barrel layers that add no value.',
          ],
        },
        impact: 'Improves tree-shaking efficiency and import resolution speed.',
        tags: ['barrel', 'bundle-size', 'tree-shaking'],
      });
    }
  }

  return findings;
}

// ─── 3D: God Module / God Function ─────────────────────────────────────────

export function detectGodModules(
  fileSummaries: FileEntry[],
  dependencyState: DependencyState,
  stmtThreshold: number = 500,
  exportThreshold: number = 20,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    const totalStmts = entry.functions.reduce((s, fn) => s + fn.statementCount, 0);
    const exportCount = (dependencyState.declaredExportsByFile.get(entry.file) || []).length;
    const reasons: string[] = [];
    if (totalStmts > stmtThreshold) reasons.push(`${totalStmts} statements (threshold: ${stmtThreshold})`);
    if (exportCount > exportThreshold) reasons.push(`${exportCount} exports (threshold: ${exportThreshold})`);
    if (reasons.length === 0) continue;

    findings.push({
      severity: 'high',
      category: 'god-module',
      file: entry.file,
      lineStart: 1,
      lineEnd: 1,
      title: `God module: ${entry.file}`,
      reason: `Module is excessively large: ${reasons.join('; ')}.`,
      files: [entry.file],
      suggestedFix: {
        strategy: 'Split module into focused sub-modules with single responsibilities.',
        steps: [
          'Identify distinct functional groups within the module.',
          'Extract each group into a dedicated module.',
          'Create a barrel if backward compatibility is needed.',
          'Update imports incrementally.',
        ],
      },
        impact: 'Smaller modules are easier to understand, test, and maintain.',
        tags: ['complexity', 'responsibility', 'size'],
        lspHints: [
          {
            tool: 'lspFindReferences',
            symbolName: entry.file.split('/').pop() || entry.file,
            lineHint: 1,
            file: entry.file,
            expectedResult: `identify consumer clusters to guide module splitting strategy`,
          },
        ],
    });
  }

  return findings;
}

export function detectMegaFolders(
  fileSummaries: FileEntry[],
  minFiles: number = 25,
  concentrationThreshold: number = 0.25,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const productionFiles = fileSummaries.filter((entry) => !isTestFile(entry.file));
  if (productionFiles.length === 0) return findings;

  const byFolder = new Map<string, FileEntry[]>();
  for (const entry of productionFiles) {
    const folder = folderOf(entry.file);
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder)!.push(entry);
  }

  const sortedFolders = [...byFolder.entries()]
    .map(([folder, entries]) => ({ folder, entries, count: entries.length }))
    .filter(({ count }) => count >= minFiles && count / productionFiles.length >= concentrationThreshold)
    .sort((a, b) => b.count - a.count);

  for (const candidate of sortedFolders) {
    const concentration = candidate.count / productionFiles.length;
    const severity: Finding['severity'] = concentration >= 0.5 || candidate.count >= 50 ? 'high' : 'medium';
    const topFiles = candidate.entries
      .map((entry) => entry.file)
      .sort()
      .slice(0, 8);
    const representativeFile = candidate.entries[0]?.file ?? candidate.folder;

    findings.push({
      severity,
      category: 'mega-folder',
      file: representativeFile,
      lineStart: 1,
      lineEnd: 1,
      title: `Mega folder: ${candidate.folder} (${candidate.count} files)`,
      reason: `${candidate.folder} contains ${candidate.count} production files (${(concentration * 100).toFixed(1)}% of the codebase), which usually indicates mixed responsibilities and weak module boundaries.`,
      files: topFiles,
      suggestedFix: {
        strategy: 'Decompose the folder into focused subfolders by domain boundary and runtime role.',
        steps: [
          'Group files by bounded context (feature/domain), not by technical convenience.',
          'Split orchestration, adapters, and pure business logic into separate subfolders.',
          'Move shared primitives into a dedicated internal shared folder to avoid cross-feature coupling.',
          'Keep a shallow compatibility barrel only where needed while migrating imports.',
        ],
      },
      impact: 'Improves navigability, ownership boundaries, and change isolation.',
      tags: ['architecture', 'modularity', 'folder-structure', 'maintainability'],
      evidence: {
        folderPath: candidate.folder,
        fileCount: candidate.count,
        totalProductionFiles: productionFiles.length,
        concentration,
      },
      lspHints: [
        {
          tool: 'lspGotoDefinition',
          symbolName: candidate.folder,
          lineHint: 1,
          file: representativeFile,
          expectedResult: 'inventory representative modules in this folder before planning decomposition',
        },
      ],
    });
  }

  return findings;
}

export function detectGodFunctions(
  fileSummaries: FileEntry[],
  stmtThreshold: number = 100,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const fn of entry.functions) {
      if (fn.statementCount > stmtThreshold) {
        findings.push({
          severity: 'high',
          category: 'god-function',
          file: entry.file,
          lineStart: fn.lineStart,
          lineEnd: fn.lineEnd,
          title: `God function: ${fn.name}`,
          reason: `Function has ${fn.statementCount} statements (threshold: ${stmtThreshold}).`,
          files: [`${entry.file}:${fn.lineStart}-${fn.lineEnd}`],
          suggestedFix: {
            strategy: 'Break down into smaller, focused functions.',
            steps: [
              'Identify logical steps within the function.',
              'Extract each step into a named helper.',
              'Keep the original as a high-level orchestrator.',
              'Test each extracted function independently.',
            ],
          },
          impact: 'Improves readability, testability, and maintenance.',
          tags: ['complexity', 'responsibility', 'size'],
          lspHints: [
            {
              tool: 'lspCallHierarchy',
              symbolName: fn.name,
              lineHint: fn.lineStart,
              file: entry.file,
              expectedResult: `map callers and callees to identify safe extraction boundaries for ${fn.name}`,
            },
          ],
        });
      }
    }
  }

  return findings;
}

// ─── 3E: Cognitive Complexity ──────────────────────────────────────────────

export function computeCognitiveComplexity(node: ts.Node): number {
  let total = 0;

  const visit = (current: ts.Node, nesting: number): void => {
    let increment = 0;
    let nestable = false;

    switch (current.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.SwitchStatement:
        increment = 1;
        nestable = true;
        break;
      default:
        break;
    }

    if (
      current.kind === ts.SyntaxKind.BinaryExpression &&
      ((current as ts.BinaryExpression).operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        (current as ts.BinaryExpression).operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        (current as ts.BinaryExpression).operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      increment = 1;
    }

    if (current.kind === ts.SyntaxKind.IfStatement && current.parent && ts.isIfStatement(current.parent) && current.parent.elseStatement === current) {
      increment = 1;
      nestable = false;
    }

    if (nestable) {
      total += increment + nesting;
      ts.forEachChild(current, (child) => visit(child, nesting + 1));
      return;
    }

    total += increment;
    ts.forEachChild(current, (child) => visit(child, nesting));
  };

  visit(node, 0);
  return total;
}

export function detectCognitiveComplexity(
  fileSummaries: FileEntry[],
  threshold: number = 15,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const fn of entry.functions) {
      if (fn.cognitiveComplexity > threshold) {
        findings.push({
          severity: fn.cognitiveComplexity > 25 ? 'high' : 'medium',
          category: 'cognitive-complexity',
          file: entry.file,
          lineStart: fn.lineStart,
          lineEnd: fn.lineEnd,
          title: `High cognitive complexity: ${fn.name} (${fn.cognitiveComplexity})`,
          reason: `Function cognitive complexity is ${fn.cognitiveComplexity} (threshold: ${threshold}). Nested branches compound reading difficulty.`,
          files: [`${entry.file}:${fn.lineStart}-${fn.lineEnd}`],
          suggestedFix: {
            strategy: 'Reduce nesting and simplify control flow.',
            steps: [
              'Convert nested branches into early returns / guard clauses.',
              'Extract deeply nested blocks into named helper functions.',
              'Replace complex boolean chains with named predicates.',
            ],
          },
          impact: 'Lower cognitive complexity directly correlates with fewer bugs and faster code reviews.',
          tags: ['complexity', 'readability', 'nesting'],
          lspHints: [
            {
              tool: 'lspCallHierarchy',
              symbolName: fn.name,
              lineHint: fn.lineStart,
              file: entry.file,
              expectedResult: `understand call graph before simplifying ${fn.name}`,
            },
          ],
        });
      }
    }
  }

  return findings;
}

// ─── 3F: Layer Violation Detection ─────────────────────────────────────────

export function detectLayerViolations(
  dependencyState: DependencyState,
  layerOrder: string[],
): FindingDraft[] {
  if (layerOrder.length < 2) return [];

  const findings: FindingDraft[] = [];

  const getLayer = (file: string): number => {
    for (let i = 0; i < layerOrder.length; i++) {
      if (file.includes(layerOrder[i])) return i;
    }
    return -1;
  };

  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;
    const srcLayer = getLayer(file);
    if (srcLayer === -1) continue;

    for (const dep of (dependencyState.outgoing.get(file) || new Set())) {
      if (!dependencyState.files.has(dep) || isTestFile(dep)) continue;
      const depLayer = getLayer(dep);
      if (depLayer === -1) continue;

      if (depLayer < srcLayer) {
        const importRef = findImportLine(dependencyState, file, dep);
        findings.push({
          severity: 'high',
          category: 'layer-violation',
          file,
          lineStart: importRef.lineStart,
          lineEnd: importRef.lineEnd,
          title: `Layer violation: ${layerOrder[srcLayer]} imports from ${layerOrder[depLayer]}`,
          reason: `"${file}" (layer: ${layerOrder[srcLayer]}) imports "${dep}" (layer: ${layerOrder[depLayer]}). Layer order: ${layerOrder.join(' → ')}.`,
          files: [file, dep],
          suggestedFix: {
            strategy: 'Respect layer boundaries by inverting the dependency or moving shared logic.',
            steps: [
              'Extract shared contracts to a lower layer that both can depend on.',
              'Use dependency inversion: define an interface in the lower layer, implement in higher.',
              'If the dependency is justified, reconsider your layer boundaries.',
            ],
          },
          impact: 'Prevents architectural erosion and keeps dependency flow unidirectional.',
          tags: ['architecture', 'layering', 'coupling'],
        });
      }
    }
  }

  return findings;
}

// ─── Low Cohesion Detection (LCOM via export consumer overlap) ─────────────

export function detectLowCohesion(
  dependencyState: DependencyState,
  minExports: number = 3,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const file of dependencyState.files) {
    if (isTestFile(file) || isLikelyEntrypoint(file)) continue;

    const exports = dependencyState.declaredExportsByFile.get(file);
    if (!exports || exports.length < minExports) continue;

    const exportNames = new Set(exports.map(e => e.name));

    const symbolConsumers = new Map<string, Set<string>>();
    for (const [consumer, imports] of dependencyState.importedSymbolsByFile.entries()) {
      for (const imp of imports) {
        if (imp.resolvedModule !== file) continue;
        if (!exportNames.has(imp.importedName)) continue;
        if (!symbolConsumers.has(imp.importedName)) symbolConsumers.set(imp.importedName, new Set());
        symbolConsumers.get(imp.importedName)!.add(consumer);
      }
    }

    const consumedSymbols = [...symbolConsumers.keys()];
    if (consumedSymbols.length < 2) continue;

    const adj = new Map<string, Set<string>>();
    for (const sym of consumedSymbols) adj.set(sym, new Set());

    for (const imports of dependencyState.importedSymbolsByFile.values()) {
      const fromThisFile = imports
        .filter(i => i.resolvedModule === file && exportNames.has(i.importedName))
        .map(i => i.importedName);
      for (let i = 0; i < fromThisFile.length; i++) {
        for (let j = i + 1; j < fromThisFile.length; j++) {
          adj.get(fromThisFile[i])?.add(fromThisFile[j]);
          adj.get(fromThisFile[j])?.add(fromThisFile[i]);
        }
      }
    }

    const visited = new Set<string>();
    let components = 0;
    for (const sym of consumedSymbols) {
      if (visited.has(sym)) continue;
      components++;
      const queue = [sym];
      while (queue.length > 0) {
        const curr = queue.pop()!;
        if (visited.has(curr)) continue;
        visited.add(curr);
        for (const neighbor of adj.get(curr) || []) {
          if (!visited.has(neighbor)) queue.push(neighbor);
        }
      }
    }

    if (components > 1) {
      findings.push({
        severity: components >= 4 ? 'high' : 'medium',
        category: 'low-cohesion',
        file,
        lineStart: 1,
        lineEnd: 1,
        title: `Low cohesion: ${file} (LCOM=${components})`,
        reason: `Module exports ${consumedSymbols.length} consumed symbols that form ${components} independent groups. Consumers never import symbols across groups — the module serves unrelated purposes.`,
        files: [file],
        suggestedFix: {
          strategy: `Split into ${components} focused modules, one per cohesion group.`,
          steps: [
            'Identify which exports belong to each independent group.',
            'Create a new module for each group with a descriptive name.',
            'Move exports and their dependencies to the appropriate module.',
            'Update consumer imports to point to the new modules.',
          ],
        },
        impact: 'Higher cohesion = easier navigation, focused testing, and smaller change blast radius.',
        tags: ['cohesion', 'responsibility', 'architecture'],
      });
    }
  }

  return findings;
}

// ─── Hot Files (Change Risk Hotspots) ──────────────────────────────────────

export function computeHotFiles(
  dependencyState: DependencyState,
  dependencySummary: DependencySummary,
  fileCriticalityByPath: Map<string, FileCriticality>,
  maxResults: number = 20,
): HotFile[] {
  const cycleFiles = new Set<string>();
  for (const cycle of dependencySummary.cycles) {
    for (const node of cycle.path) cycleFiles.add(node);
  }

  const criticalPathFiles = new Set<string>();
  for (const cp of dependencySummary.criticalPaths) {
    for (const node of cp.path) criticalPathFiles.add(node);
  }

  const results: HotFile[] = [];
  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;

    const fanIn = (dependencyState.incoming.get(file) || new Set()).size;
    const fanOut = (dependencyState.outgoing.get(file) || new Set()).size;
    const crit = fileCriticalityByPath.get(file);
    const complexityScore = crit?.score ?? 0;
    const exportCount = (dependencyState.declaredExportsByFile.get(file) || []).length;
    const inCycle = cycleFiles.has(file);
    const onCriticalPath = criticalPathFiles.has(file);

    const riskScore = Math.round(
      fanIn * 3
      + complexityScore * 0.5
      + exportCount * 1.5
      + fanOut * 0.5
      + (inCycle ? 20 : 0)
      + (onCriticalPath ? 10 : 0),
    );

    if (riskScore > 0) {
      results.push({ file, riskScore, fanIn, fanOut, complexityScore, exportCount, inCycle, onCriticalPath });
    }
  }

  results.sort((a, b) => b.riskScore - a.riskScore);
  return results.slice(0, maxResults);
}

// ─── Excessive Parameters ──────────────────────────────────────────────────

export function detectExcessiveParameters(
  fileSummaries: FileEntry[],
  threshold: number = 5,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const fn of entry.functions) {
      if (fn.params == null || fn.params <= threshold) continue;
      findings.push({
        severity: fn.params > 7 ? 'high' : 'medium',
        category: 'excessive-parameters',
        file: entry.file,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
        title: `Excessive parameters: ${fn.name} (${fn.params} params)`,
        reason: `Function has ${fn.params} parameters (threshold: ${threshold}). High parameter counts make call sites hard to read and signal the function may be doing too much.`,
        files: [`${entry.file}:${fn.lineStart}-${fn.lineEnd}`],
        suggestedFix: {
          strategy: 'Introduce a parameter object or split the function.',
          steps: [
            'Group related parameters into an options/config object.',
            'Use destructuring at the function signature for clarity.',
            'Consider splitting into smaller, focused functions if params serve different concerns.',
          ],
        },
        impact: 'Improves call-site readability and makes the API easier to evolve.',
        tags: ['api-design', 'readability', 'refactor'],
      });
    }
  }
  return findings;
}

// ─── Empty Catch Blocks ────────────────────────────────────────────────────

export function detectEmptyCatchBlocks(
  fileSummaries: FileEntry[],
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    if (!entry.emptyCatches || entry.emptyCatches.length === 0) continue;
    for (const loc of entry.emptyCatches) {
      findings.push({
        severity: 'medium',
        category: 'empty-catch',
        file: entry.file,
        lineStart: loc.lineStart,
        lineEnd: loc.lineEnd,
        title: `Empty catch block silently swallows errors`,
        reason: `Catch block at line ${loc.lineStart} has no statements — errors are silently ignored.`,
        files: [`${entry.file}:${loc.lineStart}-${loc.lineEnd}`],
        suggestedFix: {
          strategy: 'Log, re-throw, or handle the error explicitly.',
          steps: [
            'Add error logging (console.error or a logger) at minimum.',
            'Re-throw if the caller should handle the error.',
            'Add a comment explaining why swallowing is intentional, if it truly is.',
          ],
        },
        impact: 'Prevents silent failures that are extremely hard to debug in production.',
        tags: ['error-handling', 'reliability', 'silent-failure'],
      });
    }
  }
  return findings;
}

// ─── Switch Without Default ────────────────────────────────────────────────

export function detectSwitchNoDefault(
  fileSummaries: FileEntry[],
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    if (!entry.switchesWithoutDefault || entry.switchesWithoutDefault.length === 0) continue;
    for (const loc of entry.switchesWithoutDefault) {
      findings.push({
        severity: 'low',
        category: 'switch-no-default',
        file: entry.file,
        lineStart: loc.lineStart,
        lineEnd: loc.lineEnd,
        title: `Switch statement missing default case`,
        reason: `Switch at line ${loc.lineStart} has no default clause — unexpected values fall through silently.`,
        files: [`${entry.file}:${loc.lineStart}-${loc.lineEnd}`],
        suggestedFix: {
          strategy: 'Add a default case with error handling or exhaustive check.',
          steps: [
            'Add a default clause that throws an unreachable error for exhaustiveness.',
            'Or log a warning for unexpected values.',
            'In TypeScript, use `never` type assertion for compile-time exhaustive checks.',
          ],
        },
        impact: 'Catches unexpected values early and prevents silent logic bugs.',
        tags: ['control-flow', 'exhaustiveness', 'safety'],
      });
    }
  }
  return findings;
}

// ─── High Cyclomatic Density ───────────────────────────────────────────────

// ─── Unsafe `any` Usage ────────────────────────────────────────────────────

export function detectUnsafeAny(
  fileSummaries: FileEntry[],
  threshold: number = 5,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    if (entry.anyCount == null || entry.anyCount <= threshold) continue;
    findings.push({
      severity: entry.anyCount > 10 ? 'high' : 'medium',
      category: 'unsafe-any',
      file: entry.file,
      lineStart: 1,
      lineEnd: 1,
      title: `Excessive \`any\` usage: ${entry.file} (${entry.anyCount} occurrences)`,
      reason: `File uses \`any\` type ${entry.anyCount} times (threshold: ${threshold}). Each \`any\` disables type checking and allows silent runtime errors.`,
      files: [entry.file],
      suggestedFix: {
        strategy: 'Replace `any` with specific types, `unknown`, or generics.',
        steps: [
          'Replace `any` with `unknown` and add type guards where needed.',
          'Use generics for functions that operate on multiple types.',
          'Define proper interfaces for complex data shapes.',
          'Use `as const` assertions instead of `as any` where possible.',
        ],
      },
      impact: 'Restores TypeScript safety and catches bugs at compile time instead of runtime.',
      tags: ['type-safety', 'reliability', 'typescript'],
    });
  }
  return findings;
}

// ─── High Halstead Effort ──────────────────────────────────────────────────

export function detectHighHalsteadEffort(
  fileSummaries: FileEntry[],
  effortThreshold: number = 500_000,
  bugThreshold: number = 2.0,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const fn of entry.functions) {
      if (!fn.halstead) continue;
      const { effort, estimatedBugs, volume } = fn.halstead;
      if (effort <= effortThreshold && estimatedBugs <= bugThreshold) continue;
      const reasons: string[] = [];
      if (effort > effortThreshold) reasons.push(`effort=${Math.round(effort)} (threshold: ${effortThreshold})`);
      if (estimatedBugs > bugThreshold) reasons.push(`estimatedBugs=${estimatedBugs.toFixed(2)} (threshold: ${bugThreshold})`);
      findings.push({
        severity: effort > effortThreshold * 2 || estimatedBugs > 5 ? 'high' : 'medium',
        category: 'halstead-effort',
        file: entry.file,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
        title: `High Halstead complexity: ${fn.name}`,
        reason: `Function has high implementation complexity: ${reasons.join('; ')}. Volume=${Math.round(volume)}.`,
        files: [`${entry.file}:${fn.lineStart}-${fn.lineEnd}`],
        suggestedFix: {
          strategy: 'Reduce operator/operand count by extracting helpers and simplifying expressions.',
          steps: [
            'Extract complex sub-expressions into named intermediate variables.',
            'Split into smaller functions with fewer unique operators/operands.',
            'Replace imperative loops with declarative array methods where clearer.',
          ],
        },
        impact: 'Lower Halstead effort correlates with fewer bugs and faster comprehension.',
        tags: ['complexity', 'maintainability', 'effort'],
      });
    }
  }
  return findings;
}

// ─── Low Maintainability Index ─────────────────────────────────────────────

export function detectLowMaintainability(
  fileSummaries: FileEntry[],
  threshold: number = 20,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const fn of entry.functions) {
      if (fn.maintainabilityIndex == null || fn.maintainabilityIndex >= threshold) continue;
      findings.push({
        severity: fn.maintainabilityIndex < 10 ? 'critical' : 'high',
        category: 'low-maintainability',
        file: entry.file,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
        title: `Low maintainability: ${fn.name} (MI=${fn.maintainabilityIndex.toFixed(1)})`,
        reason: `Maintainability Index is ${fn.maintainabilityIndex.toFixed(1)} (threshold: ${threshold}, scale 0-100). Combines Halstead volume, cyclomatic complexity, and lines of code.`,
        files: [`${entry.file}:${fn.lineStart}-${fn.lineEnd}`],
        suggestedFix: {
          strategy: 'Reduce complexity, shorten the function, and simplify expressions.',
          steps: [
            'Split into smaller functions to reduce LOC and cyclomatic complexity.',
            'Extract complex expressions to reduce Halstead volume.',
            'Convert nested logic to early returns and guard clauses.',
            'Consider if parts of the function belong in separate modules.',
          ],
        },
        impact: 'Higher MI directly predicts lower maintenance cost and defect rate.',
        tags: ['maintainability', 'complexity', 'technical-debt'],
      });
    }
  }
  return findings;
}

// ─── Abstractness + Distance from Main Sequence (Robert C. Martin) ─────────

export function computeAbstractness(exports: { name: string; kind: string }[]): number {
  if (exports.length === 0) return 0;
  const abstractCount = exports.filter(e => e.kind === 'type').length;
  return abstractCount / exports.length;
}

export function detectDistanceFromMainSequence(
  dependencyState: DependencyState,
  distanceThreshold: number = 0.7,
  minCoupling: number = 3,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;

    const exports = dependencyState.declaredExportsByFile.get(file);
    if (!exports || exports.length === 0) continue;

    const ca = (dependencyState.incoming.get(file) || new Set()).size;
    const ce = (dependencyState.outgoing.get(file) || new Set()).size;
    if (ca + ce < minCoupling) continue;

    const I = computeInstability(ca, ce);
    const A = computeAbstractness(exports);
    const D = Math.abs(A + I - 1);

    if (D < distanceThreshold) continue;

    const isZoneOfPain = A < 0.2 && I < 0.3;
    const isZoneOfUselessness = A > 0.7 && I > 0.7;

    let zone = '';
    if (isZoneOfPain) zone = 'Zone of Pain (concrete + stable): hard to extend, painful to change.';
    else if (isZoneOfUselessness) zone = 'Zone of Uselessness (abstract + unstable): over-abstracted and unused.';
    else zone = `Far from Main Sequence: balance between abstraction and stability is off.`;

    findings.push({
      severity: D > 0.85 ? 'high' : 'medium',
      category: 'distance-from-main-sequence',
      file,
      lineStart: 1,
      lineEnd: 1,
      title: `Distance from Main Sequence: ${file} (D=${D.toFixed(2)})`,
      reason: `${zone} A=${A.toFixed(2)}, I=${I.toFixed(2)}, D=${D.toFixed(2)} (threshold: ${distanceThreshold}).`,
      files: [file],
      suggestedFix: {
        strategy: isZoneOfPain
          ? 'Add abstractions (interfaces/types) or reduce inbound coupling.'
          : isZoneOfUselessness
            ? 'Add concrete implementations or remove unused abstractions.'
            : 'Rebalance by adjusting abstraction level or dependency direction.',
        steps: isZoneOfPain
          ? [
            'Extract interfaces for key behaviors to increase abstractness.',
            'Consider splitting into abstract contracts + concrete implementations.',
            'Reduce inbound coupling by narrowing the public API surface.',
          ]
          : isZoneOfUselessness
            ? [
              'Verify abstractions have concrete implementations.',
              'Remove unused interfaces/types that serve no consumer.',
              'Consider consolidating with concrete modules.',
            ]
            : [
              'Review the balance between interfaces/types and concrete exports.',
              'Adjust dependency direction to move closer to the Main Sequence.',
              'Consider splitting responsibilities between abstract and concrete modules.',
            ],
      },
      impact: 'Modules on the Main Sequence (D≈0) have optimal balance between stability and extensibility.',
      tags: ['architecture', 'stability', 'abstractness', 'sdp'],
    });
  }

  return findings;
}

// ─── Feature Envy (Module-Level) ───────────────────────────────────────────

// ─── Untested Critical Code Detection ───────────────────────────────────────

export function detectUntestedCriticalCode(
  dependencyState: DependencyState,
  hotFiles: HotFile[],
  fileCriticalityByPath: Map<string, FileCriticality>,
  criticalityScoreThreshold: number = 40,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const seen = new Set<string>();

  const hasTestCoverage = (file: string): boolean => {
    const testImporters = dependencyState.incomingFromTests.get(file);
    return !!testImporters && testImporters.size > 0;
  };

  const addFinding = (file: string, riskScore: number, reasons: string[]): void => {
    if (seen.has(file)) return;
    seen.add(file);
    if (isTestFile(file)) return;
    if (hasTestCoverage(file)) return;

    const isCritical = riskScore >= 60;
    findings.push({
      severity: isCritical ? 'critical' : 'high',
      category: 'untested-critical-code',
      file,
      lineStart: 1,
      lineEnd: 1,
      title: `Untested critical code: ${file}`,
      reason: `High-risk file has no test imports. ${reasons.join('; ')} (risk score: ${riskScore}).`,
      files: [file],
      suggestedFix: {
        strategy: 'Add test coverage for this critical module.',
        steps: [
          'Create a test file that imports and exercises the public API of this module.',
          'Focus on the highest-complexity functions and exported behaviors first.',
          'Add integration tests if this module sits on a critical dependency path.',
          'Consider property-based tests for complex data transformations.',
        ],
      },
      impact: 'Untested critical code is the highest-risk area for regressions and undetected bugs.',
      tags: ['testing', 'coverage', 'change-risk', 'critical'],
    });
  };

  for (const hf of hotFiles) {
    const reasons: string[] = [];
    reasons.push(`fan-in=${hf.fanIn}, fan-out=${hf.fanOut}, complexity=${hf.complexityScore}`);
    if (hf.inCycle) reasons.push('in dependency cycle');
    if (hf.onCriticalPath) reasons.push('on critical dependency path');
    addFinding(hf.file, hf.riskScore, reasons);
  }

  for (const [file, crit] of fileCriticalityByPath) {
    if (crit.score < criticalityScoreThreshold) continue;
    const reasons = [`high complexity score (${crit.score}), ${crit.highComplexityFunctions} high-complexity functions`];
    addFinding(file, crit.score, reasons);
  }

  findings.sort((a, b) => {
    const sevOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    return (sevOrder[b.severity] || 0) - (sevOrder[a.severity] || 0);
  });

  return findings.slice(0, 25);
}

export function detectFeatureEnvy(
  dependencyState: DependencyState,
  envyRatio: number = 0.6,
  minSymbols: number = 5,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const [file, imports] of dependencyState.importedSymbolsByFile.entries()) {
    if (isTestFile(file)) continue;
    if (!dependencyState.files.has(file)) continue;

    const internalImports = imports.filter(i => i.resolvedModule && !i.isTypeOnly);
    if (internalImports.length < minSymbols) continue;

    const countByTarget = new Map<string, number>();
    for (const imp of internalImports) {
      if (!imp.resolvedModule) continue;
      countByTarget.set(imp.resolvedModule, (countByTarget.get(imp.resolvedModule) || 0) + 1);
    }

    for (const [target, count] of countByTarget) {
      const ratio = count / internalImports.length;
      if (ratio >= envyRatio && count >= minSymbols) {
        const importRef = findImportLine(dependencyState, file, target);
        findings.push({
          severity: ratio > 0.8 ? 'high' : 'medium',
          category: 'feature-envy',
          file,
          lineStart: importRef.lineStart,
          lineEnd: importRef.lineEnd,
          title: `Feature envy: ${file} → ${target}`,
          reason: `Module imports ${count}/${internalImports.length} symbols (${(ratio * 100).toFixed(0)}%) from "${target}". This suggests the logic may belong in or closer to the target module.`,
          files: [file, target],
          suggestedFix: {
            strategy: 'Move dependent logic to the target module or extract a shared module.',
            steps: [
              'Identify which functions/logic in this file use the imported symbols.',
              'Move that logic to the target module if it belongs there.',
              'If shared, extract a dedicated module that both can import from.',
              'Reduce the import surface by passing data instead of importing behaviors.',
            ],
          },
          impact: 'Misplaced logic increases coupling and makes changes ripple across module boundaries.',
          tags: ['coupling', 'responsibility', 'misplaced-logic'],
          lspHints: [
            {
              tool: 'lspCallHierarchy',
              symbolName: file.split('/').pop() || file,
              lineHint: importRef.lineStart,
              file,
              expectedResult: `trace which functions use imports from ${target} to decide what to move`,
            },
            {
              tool: 'lspGotoDefinition',
              symbolName: target.split('/').pop() || target,
              lineHint: importRef.lineStart,
              file,
              expectedResult: `inspect target module to evaluate if logic belongs there`,
            },
          ],
        });
      }
    }
  }

  return findings;
}

// ─── Type Assertion Escape ─────────────────────────────────────────────────

export function detectTypeAssertionEscape(
  fileSummaries: FileEntry[],
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    const esc = entry.typeAssertionEscapes;
    if (!esc) continue;

    const total = esc.asAny.length + esc.doubleAssertion.length + esc.nonNull.length;
    if (total === 0) continue;

    const parts: string[] = [];
    if (esc.asAny.length > 0) parts.push(`${esc.asAny.length} \`as any\``);
    if (esc.doubleAssertion.length > 0) parts.push(`${esc.doubleAssertion.length} double-assertion`);
    if (esc.nonNull.length > 0) parts.push(`${esc.nonNull.length} non-null \`!\``);
    const allLines = [...esc.asAny, ...esc.doubleAssertion, ...esc.nonNull].map((l) => l.lineStart);
    const firstLine = Math.min(...allLines);

    findings.push({
      severity: esc.asAny.length + esc.doubleAssertion.length > 3 ? 'high' : 'medium',
      category: 'type-assertion-escape',
      file: entry.file,
      lineStart: firstLine,
      lineEnd: firstLine,
      title: `Type-safety escapes in ${entry.file} (${total})`,
      reason: `Found ${parts.join(', ')}. Each assertion bypasses TypeScript's type checker.`,
      files: [entry.file],
      suggestedFix: {
        strategy: 'Replace type assertions with proper type guards or narrow types.',
        steps: [
          'Replace `as any` with `unknown` and add runtime type checks.',
          'Replace `as unknown as T` with proper generic constraints.',
          'Replace `!` assertions with explicit null checks.',
        ],
      },
      impact: 'Type assertions silence the compiler — runtime errors go undetected.',
      tags: ['type-safety', 'assertions', 'code-quality'],
    });
  }

  return findings;
}

// ─── Missing Error Boundary ─────────────────────────────────────────────────

export function detectMissingErrorBoundary(
  fileSummaries: FileEntry[],
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    if (!entry.unprotectedAsync) continue;

    for (const fn of entry.unprotectedAsync) {
      const severity = fn.awaitCount >= 4 ? 'high' : fn.awaitCount >= 2 ? 'medium' : 'low';
      findings.push({
        severity,
        category: 'missing-error-boundary',
        file: entry.file,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
        title: `Missing error boundary: ${fn.name} (${fn.awaitCount} awaits, no try-catch)`,
        reason: `Async function "${fn.name}" has ${fn.awaitCount} await(s) but no try-catch. Rejected promises propagate as unhandled rejections.`,
        files: [entry.file],
        suggestedFix: {
          strategy: 'Wrap await calls in try-catch or add a .catch() handler.',
          steps: [
            'Add a try-catch block around the await expressions.',
            'Handle errors appropriately (log, return default, re-throw with context).',
            'If the caller handles errors, document it with a comment.',
          ],
        },
        impact: 'Unhandled promise rejections crash Node.js processes and cause silent failures in browsers.',
        tags: ['error-handling', 'async', 'reliability'],
        lspHints: [
          {
            tool: 'lspCallHierarchy',
            symbolName: fn.name,
            lineHint: fn.lineStart,
            file: entry.file,
            expectedResult: `check if callers wrap this in try-catch or .catch() — if so, the boundary may exist upstream`,
          },
        ],
      });
    }
  }

  return findings;
}

// ─── Promise Misuse (async-without-await) ───────────────────────────────────

export function detectPromiseMisuse(
  fileSummaries: FileEntry[],
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    if (!entry.asyncWithoutAwait) continue;

    for (const fn of entry.asyncWithoutAwait) {
      findings.push({
        severity: 'medium',
        category: 'promise-misuse',
        file: entry.file,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
        title: `Unnecessary async: ${fn.name} has no await`,
        reason: `Function "${fn.name}" is declared \`async\` but never uses \`await\`. The \`async\` keyword adds unnecessary Promise wrapping.`,
        files: [entry.file],
        suggestedFix: {
          strategy: 'Remove the async keyword or add the missing await.',
          steps: [
            'If the function does not need to be async, remove the `async` keyword.',
            'If an `await` was forgotten, add it to the appropriate call.',
            'Verify callers handle the return value correctly after the change.',
          ],
        },
        impact: 'Unnecessary async wrapping adds microtask overhead and misleads readers.',
        tags: ['async', 'performance', 'clarity'],
      });
    }
  }

  return findings;
}

// ─── Performance: Await in Loop ─────────────────────────────────────────────

export function detectAwaitInLoop(fileSummaries: FileEntry[]): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const loc of entry.awaitInLoopLocations || []) {
      findings.push({
        severity: 'high',
        category: 'await-in-loop',
        file: entry.file,
        lineStart: loc.lineStart,
        lineEnd: loc.lineEnd,
        title: 'await inside loop — sequential async execution',
        reason: 'Each await runs serially. For N iterations this takes N * latency instead of max(latency). Use Promise.all() or Promise.allSettled() for parallel execution.',
        files: [entry.file],
        suggestedFix: {
          strategy: 'Collect promises and await them in parallel with Promise.all().',
          steps: [
            'Collect all async operations into an array of promises.',
            'Use await Promise.all(promises) or Promise.allSettled(promises).',
            'If order matters or rate limiting is needed, use a batching utility.',
          ],
        },
        impact: 'Sequential awaits multiply latency by N iterations — parallelizing can reduce total time to max(single-latency).',
        tags: ['performance', 'async', 'n-plus-one'],
        lspHints: [
          {
            tool: 'lspGotoDefinition',
            symbolName: 'await',
            lineHint: loc.lineStart,
            file: entry.file,
            expectedResult: `navigate to the awaited call to check if parallelization is safe`,
          },
        ],
      });
    }
  }
  return findings;
}

// ─── Performance: Synchronous I/O ───────────────────────────────────────────

export function detectSyncIo(fileSummaries: FileEntry[]): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const call of entry.syncIoCalls || []) {
      findings.push({
        severity: 'medium',
        category: 'sync-io',
        file: entry.file,
        lineStart: call.lineStart,
        lineEnd: call.lineEnd,
        title: `Synchronous I/O: ${call.name}`,
        reason: `${call.name} blocks the event loop. In server or UI code this degrades responsiveness for all concurrent operations.`,
        files: [entry.file],
        suggestedFix: {
          strategy: 'Replace with async equivalent.',
          steps: [
            `Replace ${call.name} with its async counterpart (e.g. fs.promises.readFile).`,
            'Sync I/O is acceptable in CLI scripts, build tools, or one-time init code.',
          ],
        },
        impact: 'Synchronous I/O blocks the event loop, stalling all concurrent requests until the operation completes.',
        tags: ['performance', 'blocking', 'io'],
        lspHints: [
          {
            tool: 'lspCallHierarchy',
            symbolName: call.name,
            lineHint: call.lineStart,
            file: entry.file,
            expectedResult: `find callers to assess if this sync I/O is in a hot path`,
          },
        ],
      });
    }
  }
  return findings;
}

// ─── Performance: Uncleared Timers ──────────────────────────────────────────

export function detectUnclearedTimers(fileSummaries: FileEntry[]): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const timer of entry.timerCalls || []) {
      if (timer.kind === 'setInterval' && !timer.hasCleanup) {
        findings.push({
          severity: 'medium',
          category: 'uncleared-timer',
          file: entry.file,
          lineStart: timer.lineStart,
          lineEnd: timer.lineEnd,
          title: 'setInterval without clearInterval in scope',
          reason: 'setInterval without cleanup runs indefinitely, causing memory leaks and unexpected behavior after component unmount or scope exit.',
          files: [entry.file],
          suggestedFix: {
            strategy: 'Store the timer ID and call clearInterval in cleanup.',
            steps: [
              'Assign the return value: const id = setInterval(...).',
              'Call clearInterval(id) in cleanup (useEffect return, componentWillUnmount, or scope exit).',
            ],
          },
          impact: 'Uncleared intervals run indefinitely, leaking memory and CPU cycles after their scope is no longer relevant.',
          tags: ['performance', 'memory-leak', 'timer'],
        });
      }
    }
  }
  return findings;
}

// ─── Performance: Listener Leak Risk ────────────────────────────────────────

export function detectListenerLeakRisk(fileSummaries: FileEntry[]): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    const regs = entry.listenerRegistrations || [];
    const removals = entry.listenerRemovals || [];
    if (regs.length > 0 && removals.length === 0) {
      findings.push({
        severity: 'medium',
        category: 'listener-leak-risk',
        file: entry.file,
        lineStart: regs[0].lineStart,
        lineEnd: regs[regs.length - 1].lineEnd,
        title: `${regs.length} event listener(s) added without any removal`,
        reason: 'addEventListener/on without corresponding removeEventListener/off risks memory leaks if the target outlives the subscriber.',
        files: [entry.file],
        suggestedFix: {
          strategy: 'Add corresponding listener removal in cleanup.',
          steps: [
            'Store the handler reference in a variable.',
            'Call removeEventListener/off in cleanup (unmount, dispose, close).',
            'Or use AbortController signal for automatic cleanup.',
          ],
        },
        impact: 'Listener references prevent garbage collection of the subscriber, causing memory growth proportional to event-target lifetime.',
        tags: ['performance', 'memory-leak', 'events'],
      });
    }
  }
  return findings;
}

// ─── Performance: Unbounded Collection ──────────────────────────────────────

export function detectUnboundedCollection(fileSummaries: FileEntry[]): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const fn of entry.functions) {
      if (fn.loops >= 2 && fn.calls >= 5 && fn.maxLoopDepth >= 2) {
        findings.push({
          severity: 'low',
          category: 'unbounded-collection',
          file: entry.file,
          lineStart: fn.lineStart,
          lineEnd: fn.lineEnd,
          title: `Potential unbounded collection growth in ${fn.name}`,
          reason: `Function "${fn.name}" has ${fn.loops} loops nested ${fn.maxLoopDepth} levels with ${fn.calls} calls. Collections growing inside nested loops without bounds can cause OOM.`,
          files: [entry.file],
          suggestedFix: {
            strategy: 'Add size limits, pagination, or streaming.',
            steps: [
              'Add a maximum size check before adding to collections.',
              'Use pagination or streaming for large datasets.',
              'Consider using generators for lazy evaluation.',
            ],
          },
          impact: 'Unbounded collection growth inside nested loops can cause out-of-memory crashes under large input.',
          tags: ['performance', 'memory', 'collection'],
        });
      }
    }
  }
  return findings;
}

// ─── Similar Function Bodies (Type-2 clone detection) ───────────────────────

export function detectSimilarFunctionBodies(
  flowMap: Map<string, import('./types.js').FlowMapEntry[]>,
  similarityThreshold: number = 0.85,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  const allEntries: import('./types.js').FlowMapEntry[] = [];
  for (const entries of flowMap.values()) {
    for (const e of entries) {
      if (!isTestFile(e.file)) allEntries.push(e);
    }
  }

  const buckets = new Map<string, import('./types.js').FlowMapEntry[]>();
  for (const entry of allEntries) {
    const key = `${entry.kind}|${Math.round(entry.statementCount / 3)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(entry);
  }

  for (const [, bucket] of buckets) {
    if (bucket.length < 2 || bucket.length > 50) continue;

    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i];
        const b = bucket[j];
        if (a.hash === b.hash) continue;
        if (a.file === b.file && a.lineStart === b.lineStart) continue;

        const stmtRatio = Math.min(a.statementCount, b.statementCount) / Math.max(a.statementCount, b.statementCount);
        if (stmtRatio < 0.8) continue;

        const similarity = computeMetricSimilarity(a, b);
        if (similarity >= similarityThreshold) {
          findings.push({
            severity: similarity >= 0.95 ? 'high' : 'medium',
            category: 'similar-function-body',
            file: a.file,
            lineStart: a.lineStart,
            lineEnd: a.lineEnd,
            title: `Similar function: ${a.name} (${(similarity * 100).toFixed(0)}% similar to ${b.name} in ${b.file})`,
            reason: `"${a.name}" and "${b.name}" have ${(similarity * 100).toFixed(0)}% structural similarity. Near-duplicates diverge over time and should be consolidated.`,
            files: [a.file, b.file],
            suggestedFix: {
              strategy: 'Extract shared logic into a parameterized helper.',
              steps: [
                `Compare ${a.file}:${a.lineStart} with ${b.file}:${b.lineStart}.`,
                'Identify the varying parts and extract them as parameters.',
                'Create a shared function and call it from both locations.',
              ],
            },
            impact: 'Near-clone functions diverge over time, causing inconsistent behavior and multiplied maintenance cost.',
            tags: ['duplication', 'maintainability', 'near-clone'],
          });
        }
      }
    }
  }

  return findings;
}

function computeMetricSimilarity(a: import('./types.js').FlowMapEntry, b: import('./types.js').FlowMapEntry): number {
  const features = [
    [a.metrics.complexity, b.metrics.complexity],
    [a.metrics.maxBranchDepth, b.metrics.maxBranchDepth],
    [a.metrics.maxLoopDepth, b.metrics.maxLoopDepth],
    [a.metrics.returns, b.metrics.returns],
    [a.metrics.awaits, b.metrics.awaits],
    [a.metrics.calls, b.metrics.calls],
    [a.metrics.loops, b.metrics.loops],
    [a.statementCount, b.statementCount],
  ];

  let totalSimilarity = 0;
  for (const [va, vb] of features) {
    const max = Math.max(va, vb, 1);
    totalSimilarity += 1 - Math.abs(va - vb) / max;
  }
  return totalSimilarity / features.length;
}

// ─── Import Side-Effect Risk ────────────────────────────────────────────────

export function detectImportSideEffectRisk(
  fileSummaries: FileEntry[],
  dependencyState: DependencyState,
  dependencySummary: DependencySummary,
  hotFiles: HotFile[],
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  const cycleFiles = new Set<string>();
  for (const cycle of dependencySummary.cycles) {
    for (const node of cycle.path) cycleFiles.add(node);
  }
  const criticalPathFiles = new Set<string>();
  for (const cp of dependencySummary.criticalPaths) {
    for (const node of cp.path) criticalPathFiles.add(node);
  }
  const hotFileMap = new Map<string, HotFile>();
  for (const hf of hotFiles) hotFileMap.set(hf.file, hf);

  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    const effects = entry.topLevelEffects;
    if (!effects || effects.length === 0) continue;

    let astBase = 0;
    for (const eff of effects) astBase += eff.weight;

    const fanIn = (dependencyState.incoming.get(entry.file) || new Set()).size;
    let impactBoost = 0;
    if (fanIn >= 20) impactBoost += 8;
    else if (fanIn >= 8) impactBoost += 4;
    if (criticalPathFiles.has(entry.file)) impactBoost += 6;
    if (cycleFiles.has(entry.file)) impactBoost += 3;

    let roleDiscount = 0;
    if (isLikelyEntrypoint(entry.file)) roleDiscount += 4;

    const totalRisk = astBase + impactBoost - roleDiscount;
    if (totalRisk < 4) continue;

    const severity: Finding['severity'] =
      totalRisk >= 18 ? 'critical' :
      totalRisk >= 12 ? 'high' :
      totalRisk >= 7 ? 'medium' :
      'low';

    const highConfidenceEffects = effects.filter(e => e.confidence === 'high');
    const confidence: 'high' | 'medium' | 'low' =
      highConfidenceEffects.length > 0 ? 'high' :
      effects.some(e => e.confidence === 'medium') ? 'medium' :
      'low';

    const effectDetails = effects.map(e => `${e.detail} (line ${e.lineStart})`).join('; ');
    const impactDetails: string[] = [];
    if (fanIn >= 8) impactDetails.push(`fan-in=${fanIn}`);
    if (criticalPathFiles.has(entry.file)) impactDetails.push('on critical path');
    if (cycleFiles.has(entry.file)) impactDetails.push('in dependency cycle');
    if (isLikelyEntrypoint(entry.file)) impactDetails.push('entrypoint (discounted)');
    const impactSuffix = impactDetails.length > 0 ? ` Architecture context: ${impactDetails.join(', ')}.` : '';

    const firstEffect = effects[0];
    findings.push({
      severity,
      category: 'import-side-effect-risk',
      file: entry.file,
      lineStart: firstEffect.lineStart,
      lineEnd: firstEffect.lineEnd,
      title: `Import-time side effect${effects.length > 1 ? `s (${effects.length})` : ''}: ${entry.file}`,
      reason: `Module executes work at import time: ${effectDetails}. Risk score: ${totalRisk} (ast=${astBase}, impact=+${impactBoost}, role=-${roleDiscount}). Confidence: ${confidence}.${impactSuffix}`,
      files: [entry.file],
      suggestedFix: {
        strategy: 'Move import-time side effects behind explicit initialization or lazy loading.',
        steps: [
          'Wrap startup logic in an exported init() function instead of running at module scope.',
          'Replace synchronous I/O with async alternatives called at runtime.',
          'Guard side-effect imports with dynamic import() behind feature checks.',
          'If this is an intentional entrypoint, consider adding a suppression comment.',
        ],
      },
      impact: `Importing this module triggers ${effects.length} side effect(s). With fan-in=${fanIn}, unintended imports can degrade startup latency and cause surprising runtime behavior.`,
      tags: ['import-side-effect', 'startup', 'architecture', 'performance'],
      lspHints: [
        {
          tool: 'lspFindReferences',
          symbolName: entry.file.split('/').pop()?.replace(/\.[^.]+$/, '') || entry.file,
          lineHint: 1,
          file: entry.file,
          expectedResult: `find all modules that import this file and may trigger side effects`,
        },
      ],
    });
  }

  return findings;
}

// ─── Tree-Shaking / Bundle Hygiene Detectors ────────────────────────────────

export function detectNamespaceImport(
  dependencyState: DependencyState,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const [file, imports] of dependencyState.importedSymbolsByFile.entries()) {
    if (isTestFile(file)) continue;

    for (const ref of imports) {
      if (ref.importedName !== '*') continue;
      if (ref.isTypeOnly) continue;
      if (ref.localName === 'require') continue;

      const isInternal = ref.resolvedModule != null;
      const fanIn = isInternal
        ? (dependencyState.incoming.get(ref.resolvedModule!) || new Set()).size
        : 0;

      findings.push({
        severity: isInternal && fanIn > 5 ? 'high' : 'medium',
        category: 'namespace-import',
        file,
        lineStart: ref.lineStart || 1,
        lineEnd: ref.lineEnd || ref.lineStart || 1,
        title: `Namespace import blocks tree-shaking: import * as ${ref.localName}`,
        reason: `\`import * as ${ref.localName} from '${ref.sourceModule}'\` forces bundlers to include the entire module. Named imports allow dead-code elimination of unused exports.${isInternal ? ` Target module has fan-in=${fanIn}.` : ''}`,
        files: [`${file}:${ref.lineStart || 1}-${ref.lineEnd || ref.lineStart || 1}`],
        suggestedFix: {
          strategy: 'Replace namespace import with named imports for used symbols.',
          steps: [
            `Find which properties of \`${ref.localName}\` are actually accessed in this file.`,
            `Replace \`import * as ${ref.localName}\` with \`import { usedA, usedB } from '${ref.sourceModule}'\`.`,
            'If many properties are used, consider splitting the source module into smaller modules.',
          ],
        },
        impact: 'Enables bundlers to tree-shake unused exports, reducing bundle size.',
        tags: ['tree-shaking', 'bundle-size', 'namespace-import'],
      });
    }
  }

  return findings;
}

export function detectCommonJsInEsm(
  dependencyState: DependencyState,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const [file, imports] of dependencyState.importedSymbolsByFile.entries()) {
    if (isTestFile(file)) continue;

    const requireImports = imports.filter((r) => r.localName === 'require' && !r.isTypeOnly);
    if (requireImports.length === 0) continue;

    const hasEsmImport = imports.some((r) => r.localName !== 'require');
    const severity = hasEsmImport ? 'high' : 'medium';

    for (const ref of requireImports) {
      findings.push({
        severity,
        category: hasEsmImport ? 'mixed-module-format' : 'commonjs-in-esm',
        file,
        lineStart: ref.lineStart || 1,
        lineEnd: ref.lineEnd || ref.lineStart || 1,
        title: hasEsmImport
          ? `Mixed ESM/CJS: require('${ref.sourceModule}') in ESM file`
          : `CommonJS require blocks tree-shaking: require('${ref.sourceModule}')`,
        reason: hasEsmImport
          ? `File uses both ESM \`import\` and CJS \`require()\`. Mixed formats force bundlers to treat the module as CJS, disabling tree-shaking entirely. Found ${requireImports.length} require() call(s).`
          : `\`require('${ref.sourceModule}')\` is a CommonJS pattern that bundlers cannot statically analyze. ESM \`import\` enables tree-shaking.`,
        files: [`${file}:${ref.lineStart || 1}-${ref.lineEnd || ref.lineStart || 1}`],
        suggestedFix: {
          strategy: 'Convert require() to ESM import.',
          steps: [
            `Replace \`const mod = require('${ref.sourceModule}')\` with \`import mod from '${ref.sourceModule}'\` or named imports.`,
            'If the require is conditional, use dynamic `import()` instead.',
            'Ensure the target module supports ESM (check package.json "type" or "module" field).',
          ],
        },
        impact: 'ESM imports enable tree-shaking; CJS requires pull the entire module.',
        tags: ['tree-shaking', 'bundle-size', 'commonjs', 'module-format'],
      });
    }
  }

  return findings;
}

export function detectExportStarLeak(
  dependencyState: DependencyState,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const [file, reexports] of dependencyState.reExportsByFile.entries()) {
    if (isTestFile(file)) continue;

    const starReexports = reexports.filter((r) => r.isStar && !r.isTypeOnly);
    if (starReexports.length === 0) continue;

    for (const ref of starReexports) {
      const targetExportCount = ref.resolvedModule
        ? (dependencyState.declaredExportsByFile.get(ref.resolvedModule) || []).length
        : 0;

      const targetHasStars = ref.resolvedModule
        ? (dependencyState.reExportsByFile.get(ref.resolvedModule) || []).some((r) => r.isStar)
        : false;

      const severity = targetHasStars ? 'high' : targetExportCount > 20 ? 'high' : 'medium';

      findings.push({
        severity,
        category: 'export-star-leak',
        file,
        lineStart: ref.lineStart || 1,
        lineEnd: ref.lineEnd || ref.lineStart || 1,
        title: `export * leaks entire module surface: ${ref.sourceModule}`,
        reason: `\`export * from '${ref.sourceModule}'\` re-exports every symbol from the source, defeating granular tree-shaking.${targetExportCount > 0 ? ` Target exports ${targetExportCount} symbols.` : ''}${targetHasStars ? ' Target itself contains export-star chains, amplifying the leak.' : ''}`,
        files: [`${file}:${ref.lineStart || 1}-${ref.lineEnd || ref.lineStart || 1}`],
        suggestedFix: {
          strategy: 'Replace export * with explicit named re-exports.',
          steps: [
            `List the symbols actually consumed from \`${ref.sourceModule}\` by downstream modules.`,
            `Replace \`export * from '${ref.sourceModule}'\` with \`export { A, B, C } from '${ref.sourceModule}'\`.`,
            'This lets bundlers eliminate unused re-exports during tree-shaking.',
          ],
        },
        impact: 'Explicit re-exports enable precise tree-shaking and make the public API surface visible.',
        tags: ['tree-shaking', 'bundle-size', 'export-star', 'api-surface'],
      });
    }
  }

  return findings;
}

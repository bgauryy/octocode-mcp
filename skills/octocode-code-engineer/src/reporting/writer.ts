import fs from 'node:fs';
import path from 'node:path';

import {
  computeReportAnalysisSummary,
  enrichFileInventoryEntries,
  enrichFindings,
} from './analysis.js';
import {
  categoryBreakdown,
  generateSummaryMd,
  severityBreakdown,
} from './summary-md.js';
import { computeGraphAnalytics } from '../analysis/graph-analytics.js';
import { renderTreesText } from '../common/utils.js';
import { computeHotFiles } from '../detectors/index.js';
import { PILLAR_CATEGORIES } from '../types/index.js';

import type {
  AgentOutputData,
  AnalysisOptions,
  DependencyState,
  DependencySummary,
  DuplicateFlowHint,
  FileCriticality,
  FileEntry,
  Finding,
  ScanSummaryData,
  TreeEntry,
} from '../types/index.js';

export const REPORT_SCHEMA_VERSION = '1.1.0';

export const ARCHITECTURE_CATEGORIES = new Set(
  PILLAR_CATEGORIES['architecture']
);
export const CODE_QUALITY_CATEGORIES = new Set(
  PILLAR_CATEGORIES['code-quality']
);
export const DEAD_CODE_CATEGORIES = new Set(PILLAR_CATEGORIES['dead-code']);
export const SECURITY_CATEGORIES = new Set(PILLAR_CATEGORIES['security']);
export const TEST_QUALITY_CATEGORIES = new Set(
  PILLAR_CATEGORIES['test-quality']
);

export interface FullReport {
  generatedAt: string;
  repoRoot: string;
  options: Record<string, unknown>;
  parser: Record<string, unknown>;
  summary: ScanSummaryData;
  fileInventory: FileEntry[];
  duplicateFlows: Record<string, unknown>;
  dependencyGraph: DependencySummary;
  dependencyFindings: Finding[];
  agentOutput: AgentOutputData;
  optimizationOpportunities: DuplicateFlowHint[];
  optimizationFindings: Finding[];
  parseErrors: { file: string; message: string }[];
  astTrees?: TreeEntry[];
  graphAnalytics?: import('../analysis/graph-analytics.js').GraphAnalyticsSummary;
  reportAnalysis?: import('./analysis.js').ReportAnalysisSummary;
}

export function writeMultiFileReport(
  dir: string,
  report: FullReport,
  options: AnalysisOptions,
  dependencyState: DependencyState,
  dependencySummary: DependencySummary,
  fileCriticalityByPath: Map<string, FileCriticality>
): Record<string, string> {
  fs.mkdirSync(dir, { recursive: true });

  const writeJson = (name: string, data: unknown): void => {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(data), 'utf8');
  };

  const outputFiles: Record<string, string> = {
    summary: 'summary.json',
    architecture: 'architecture.json',
    codeQuality: 'code-quality.json',
    deadCode: 'dead-code.json',
    fileInventory: 'file-inventory.json',
    findings: 'findings.json',
  };

  const hotFiles = computeHotFiles(
    dependencyState,
    dependencySummary,
    fileCriticalityByPath
  );
  const graphAnalytics =
    report.graphAnalytics ??
    computeGraphAnalytics(
      dependencyState,
      dependencySummary,
      fileCriticalityByPath
    );
  const enrichedFileInventory = enrichFileInventoryEntries(
    report.fileInventory || [],
    { flowEnabled: !!options.flow }
  );
  const allFindings = enrichFindings(
    report.optimizationFindings || [],
    enrichedFileInventory,
    hotFiles,
    graphAnalytics,
    { flowEnabled: !!options.flow }
  );
  const architectureFindings = allFindings.filter(f =>
    ARCHITECTURE_CATEGORIES.has(f.category)
  );
  const codeQualityFindings = allFindings.filter(f =>
    CODE_QUALITY_CATEGORIES.has(f.category)
  );
  const deadCodeFindings = allFindings.filter(f =>
    DEAD_CODE_CATEGORIES.has(f.category)
  );
  const securityFindings = allFindings.filter(f =>
    SECURITY_CATEGORIES.has(f.category)
  );
  const testQualityFindings = allFindings.filter(f =>
    TEST_QUALITY_CATEGORIES.has(f.category)
  );
  const reportAnalysis =
    report.reportAnalysis ??
    computeReportAnalysisSummary(
      allFindings,
      enrichedFileInventory,
      hotFiles,
      graphAnalytics
    );

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
    packageGraphSummary: options.graphAdvanced
      ? graphAnalytics.packageGraphSummary
      : null,
    packageHotspots: options.graphAdvanced
      ? graphAnalytics.packageGraphSummary.hotspots
      : [],
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
    const graphMd = generateMermaidGraph(
      dependencyState,
      dependencySummary,
      fileCriticalityByPath
    );
    fs.writeFileSync(path.join(dir, 'graph.md'), graphMd, 'utf8');
    outputFiles.graph = 'graph.md';
  }

  if (report.astTrees) {
    fs.writeFileSync(
      path.join(dir, 'ast-trees.txt'),
      renderTreesText(report.astTrees, report.generatedAt),
      'utf8'
    );
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
    dir,
    report,
    outputFiles,
    architectureFindings,
    codeQualityFindings,
    deadCodeFindings,
    hotFiles,
    activeFeatures: options.features,
    scope: options.scope,
    root: options.root,
    scopeSymbols: options.scopeSymbols,
    semanticEnabled: options.semantic,
    securityFindings,
    testQualityFindings,
    reportAnalysis,
  });
  fs.writeFileSync(path.join(dir, 'summary.md'), summaryMd, 'utf8');
  outputFiles.summaryMd = 'summary.md';

  writeJson('summary.json', { ...summaryJsonData, outputFiles });

  return outputFiles;
}

export function generateMermaidGraph(
  dependencyState: DependencyState,
  dependencySummary: DependencySummary,
  _fileCriticalityByPath: Map<string, FileCriticality>
): string {
  const lines: string[] = [];
  lines.push('# Dependency Graph\n');
  lines.push('## Module Dependency Map\n');
  lines.push('```mermaid');
  lines.push('graph LR');

  const criticalFiles = new Set(
    (dependencySummary.criticalModules || []).map(m => m.file)
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
  const moduleSet = new Set(topModules.map(m => m.file));
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
    for (const [idx, cycle] of dependencySummary.cycles
      .slice(0, 10)
      .entries()) {
      for (let i = 0; i < cycle.path.length - 1; i++) {
        const from = sanitize(cycle.path[i]);
        const to = sanitize(cycle.path[i + 1]);
        lines.push(
          `  ${from}["${shorten(cycle.path[i])}"] -. "cycle ${idx + 1}" .-> ${to}["${shorten(cycle.path[i + 1])}"]`
        );
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
        lines.push(
          `  ${from}["${shorten(chain.path[i])}"] ==> ${to}["${shorten(chain.path[i + 1])}"]`
        );
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
  lines.push(
    `| Critical paths | ${dependencySummary.criticalPaths?.length || 0} |`
  );
  lines.push(
    `| Test-only modules | ${dependencySummary.testOnlyModules?.length || 0} |`
  );
  lines.push(
    `| Unresolved imports | ${dependencySummary.unresolvedEdgeCount || 0} |`
  );
  lines.push('');

  if (dependencySummary.criticalModules?.length > 0) {
    lines.push('## Critical Modules (Hub Nodes)\n');
    lines.push('| Module | Score | Risk | Inbound | Outbound |');
    lines.push('|--------|-------|------|---------|----------|');
    for (const m of dependencySummary.criticalModules.slice(0, 20)) {
      lines.push(
        `| \`${m.file}\` | ${m.score} | ${m.riskBand || '-'} | ${m.inboundCount} | ${m.outboundCount} |`
      );
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

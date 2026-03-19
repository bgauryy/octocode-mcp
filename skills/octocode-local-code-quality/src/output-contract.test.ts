import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';


import { FullReport, REPORT_SCHEMA_VERSION, writeMultiFileReport } from './index.js';
import { ARCHITECTURE_CATEGORIES, CODE_QUALITY_CATEGORIES, DEAD_CODE_CATEGORIES } from './index.js';
import { DEFAULT_OPTS } from './types.js';

import type { DependencyState, FileEntry, Finding } from './types.js';

function makeFile(override: Partial<FileEntry> = {}): FileEntry {
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

function makeFinding(category: string): Finding {
  return {
    id: `${category}-1`,
    severity: 'medium',
    category,
    file: 'src/file.ts',
    lineStart: 10,
    lineEnd: 10,
    title: `Fixture finding for ${category}`,
    reason: 'Fixture reason',
    files: ['src/file.ts'],
    suggestedFix: { strategy: 'Strategy', steps: ['step'] },
  };
}

function makeReport(overrides: Partial<{
  fileInventory: FileEntry[];
  optimizationFindings: Finding[];
  generatedAt: string;
}> = {}): FullReport {
  const baseOptimizations = [
    makeFinding([...ARCHITECTURE_CATEGORIES][0]),
    makeFinding([...CODE_QUALITY_CATEGORIES][0]),
    makeFinding([...DEAD_CODE_CATEGORIES][0]),
    makeFinding('hardcoded-secret'),
    makeFinding('test-no-assertion'),
  ];
  return {
    generatedAt: '2026-03-17T00:00:00.000Z',
    repoRoot: '/repo',
    options: {},
    parser: { requested: 'auto', effective: 'typescript' },
    summary: { totalFiles: 1, totalFunctions: 0, totalFlows: 0, totalDependencyFiles: 1, totalPackages: 1 },
    fileInventory: overrides.fileInventory || [makeFile()],
    duplicateFlows: { duplicatedFunctions: [], duplicatedControlFlow: [], totalFunctionGroups: 0, totalFlowGroups: 0 },
    dependencyGraph: { totalModules: 1, totalEdges: 0, unresolvedEdgeCount: 0, externalDependencyFiles: 0, rootsCount: 0, leavesCount: 0, roots: [], leaves: [], criticalModules: [], testOnlyModules: [], unresolvedSample: [], outgoingTop: [], inboundTop: [], cycles: [], criticalPaths: [] },
    dependencyFindings: [],
    agentOutput: { totalFindings: 0, highPriority: 0, mediumPriority: 0, lowPriority: 0, topRecommendations: [], filesWithIssues: [] },
    optimizationOpportunities: [],
    optimizationFindings: overrides.optimizationFindings || baseOptimizations,
    parseErrors: [],
    astTrees: undefined,
    ...overrides,
  };
}

function emptyDependencyState(): DependencyState {
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

function emptyDependencySummary() {
  return {
    totalModules: 1,
    totalEdges: 0,
    unresolvedEdgeCount: 0,
    externalDependencyFiles: 0,
    rootsCount: 1,
    leavesCount: 1,
    roots: ['src/file.ts'],
    leaves: ['src/file.ts'],
    criticalModules: [],
    testOnlyModules: [],
    unresolvedSample: [],
    outgoingTop: [],
    inboundTop: [],
    cycles: [],
    criticalPaths: [],
  };
}

describe('output contract', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cq-contract-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes schema version into all JSON outputs', () => {
    const outDir = path.join(tmpDir, 'scan');
    const report = makeReport();
    writeMultiFileReport(outDir, report, { ...DEFAULT_OPTS, graph: false }, emptyDependencyState(), emptyDependencySummary(), new Map());

    const files = ['architecture.json', 'code-quality.json', 'dead-code.json', 'security.json', 'test-quality.json', 'file-inventory.json', 'findings.json', 'summary.json'];
    for (const file of files) {
      const payload = JSON.parse(fs.readFileSync(path.join(outDir, file), 'utf8'));
      expect(payload.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
    }
  });

  it('keeps the required finding fields in findings.json', () => {
    const outDir = path.join(tmpDir, 'findings');
    writeMultiFileReport(outDir, makeReport(), { ...DEFAULT_OPTS, graph: false }, emptyDependencyState(), emptyDependencySummary(), new Map());
    const findingsData = JSON.parse(fs.readFileSync(path.join(outDir, 'findings.json'), 'utf8'));
    for (const f of findingsData.optimizationFindings as Finding[]) {
      expect(f.id).toBeDefined();
      expect(f.severity).toBeDefined();
      expect(f.category).toBeDefined();
      expect(f.file).toBeDefined();
      expect(typeof f.lineStart).toBe('number');
      expect(typeof f.lineEnd).toBe('number');
      expect(f.title).toBeDefined();
      expect(f.reason).toBeDefined();
      expect(f.suggestedFix).toBeDefined();
      expect(Array.isArray(f.files)).toBe(true);
      expect(Array.isArray(f.suggestedFix.steps)).toBe(true);
      expect(typeof f.suggestedFix.strategy).toBe('string');
      expect(typeof f.ruleId).toBe('string');
      expect(['graph', 'ast', 'hybrid']).toContain(f.analysisLens);
      expect(Array.isArray(f.correlatedSignals)).toBe(true);
      expect(f.recommendedValidation).toBeDefined();
    }
  });

  it('writes additive analysis summary fields into summary.json', () => {
    const outDir = path.join(tmpDir, 'summary-analysis');
    writeMultiFileReport(outDir, makeReport(), { ...DEFAULT_OPTS, graph: false }, emptyDependencyState(), emptyDependencySummary(), new Map());
    const summaryData = JSON.parse(fs.readFileSync(path.join(outDir, 'summary.json'), 'utf8'));
    expect(summaryData.analysisSummary).toBeDefined();
    expect(summaryData).toHaveProperty('strongestGraphSignal');
    expect(summaryData).toHaveProperty('strongestAstSignal');
    expect(Array.isArray(summaryData.combinedSignals)).toBe(true);
    expect(summaryData.analysisSummary.recommendedValidation || summaryData.recommendedValidation).toBeDefined();
    expect(Array.isArray(summaryData.investigationPrompts)).toBe(true);
  });

  it('writes additive graph analysis fields into architecture.json', () => {
    const outDir = path.join(tmpDir, 'architecture-analysis');
    writeMultiFileReport(outDir, makeReport(), { ...DEFAULT_OPTS, graph: false, graphAdvanced: true }, emptyDependencyState(), emptyDependencySummary(), new Map());
    const architectureData = JSON.parse(fs.readFileSync(path.join(outDir, 'architecture.json'), 'utf8'));
    expect(Array.isArray(architectureData.graphSignals)).toBe(true);
    expect(Array.isArray(architectureData.chokepoints)).toBe(true);
    expect(Array.isArray(architectureData.criticalHubCandidates)).toBe(true);
    expect(Array.isArray(architectureData.sccClusters)).toBe(true);
    expect(architectureData).toHaveProperty('packageGraphSummary');
  });

  it('writes additive inventory fields into file-inventory.json', () => {
    const outDir = path.join(tmpDir, 'inventory-analysis');
    writeMultiFileReport(outDir, makeReport(), { ...DEFAULT_OPTS, graph: false, flow: true }, emptyDependencyState(), emptyDependencySummary(), new Map());
    const inventoryData = JSON.parse(fs.readFileSync(path.join(outDir, 'file-inventory.json'), 'utf8'));
    const first = inventoryData.fileInventory[0];
    expect(first.symbolUsageSummary).toBeDefined();
    expect(first).toHaveProperty('boundaryRoleHints');
    expect(first).toHaveProperty('cfgFlags');
  });

  it('keeps flow-only inventory fields behind the --flow flag', () => {
    const outDir = path.join(tmpDir, 'inventory-no-flow');
    writeMultiFileReport(outDir, makeReport(), { ...DEFAULT_OPTS, graph: false, flow: false }, emptyDependencyState(), emptyDependencySummary(), new Map());
    const inventoryData = JSON.parse(fs.readFileSync(path.join(outDir, 'file-inventory.json'), 'utf8'));
    const first = inventoryData.fileInventory[0];
    expect(first).not.toHaveProperty('cfgFlags');
  });

  it('renders summary.md with stable sections (golden)', () => {
    const outDir = path.join(tmpDir, 'md');
    const report = makeReport();
    const outputFiles = writeMultiFileReport(outDir, report, { ...DEFAULT_OPTS, graph: false }, emptyDependencyState(), emptyDependencySummary(), new Map());
    const summary = fs.readFileSync(path.join(outDir, 'summary.md'), 'utf8');

    expect(summary).toContain('# Code Quality Scan Report');
    expect(summary).toContain('## Scan Scope');
    expect(summary).toContain('## Findings Overview');
    expect(summary).toContain('## Health Scores');
    expect(summary).toContain('## Analysis Signals');
    expect(summary).toContain('**Graph Signal**');
    expect(summary).toContain('**AST Signal**');
    expect(summary).toContain('**Recommended Validation**');
    expect(summary).toContain('## Architecture Health');
    expect(summary).toContain('## Code Quality');
    expect(summary).toContain('## Dead Code & Hygiene');
    expect(outputFiles.summary).toBe('summary.json');
  });

  it('security.json has required structure when security findings exist', () => {
    const outDir = path.join(tmpDir, 'security-struct');
    writeMultiFileReport(outDir, makeReport(), { ...DEFAULT_OPTS, graph: false }, emptyDependencyState(), emptyDependencySummary(), new Map());
    const security = JSON.parse(fs.readFileSync(path.join(outDir, 'security.json'), 'utf8'));
    expect(security.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
    expect(Array.isArray(security.findings)).toBe(true);
    expect(typeof security.findingsCount).toBe('number');
    expect(typeof security.severityBreakdown).toBe('object');
    expect(typeof security.categoryBreakdown).toBe('object');
  });

  it('test-quality.json has required structure when test findings exist', () => {
    const outDir = path.join(tmpDir, 'tq-struct');
    writeMultiFileReport(outDir, makeReport(), { ...DEFAULT_OPTS, graph: false }, emptyDependencyState(), emptyDependencySummary(), new Map());
    const tq = JSON.parse(fs.readFileSync(path.join(outDir, 'test-quality.json'), 'utf8'));
    expect(tq.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
    expect(Array.isArray(tq.findings)).toBe(true);
    expect(typeof tq.findingsCount).toBe('number');
    expect(typeof tq.severityBreakdown).toBe('object');
    expect(typeof tq.categoryBreakdown).toBe('object');
  });

  it('code-quality.json has required internal fields', () => {
    const outDir = path.join(tmpDir, 'cq-struct');
    writeMultiFileReport(outDir, makeReport(), { ...DEFAULT_OPTS, graph: false }, emptyDependencyState(), emptyDependencySummary(), new Map());
    const cq = JSON.parse(fs.readFileSync(path.join(outDir, 'code-quality.json'), 'utf8'));
    expect(typeof cq.duplicateFlows).toBe('object');
    expect(Array.isArray(cq.findings)).toBe(true);
    expect(typeof cq.findingsCount).toBe('number');
    expect(typeof cq.severityBreakdown).toBe('object');
    expect(typeof cq.categoryBreakdown).toBe('object');
  });

  it('does NOT write security.json when no security findings exist', () => {
    const outDir = path.join(tmpDir, 'no-security');
    const nonSecurityFindings = [
      makeFinding([...ARCHITECTURE_CATEGORIES][0]),
      makeFinding([...CODE_QUALITY_CATEGORIES][0]),
      makeFinding([...DEAD_CODE_CATEGORIES][0]),
    ];
    const report = makeReport({ optimizationFindings: nonSecurityFindings });
    writeMultiFileReport(outDir, report, { ...DEFAULT_OPTS, graph: false }, emptyDependencyState(), emptyDependencySummary(), new Map());
    expect(fs.existsSync(path.join(outDir, 'security.json'))).toBe(false);
  });

  it('does NOT write test-quality.json when no test findings exist', () => {
    const outDir = path.join(tmpDir, 'no-tq');
    const nonTestFindings = [
      makeFinding([...ARCHITECTURE_CATEGORIES][0]),
      makeFinding([...CODE_QUALITY_CATEGORIES][0]),
      makeFinding([...DEAD_CODE_CATEGORIES][0]),
      makeFinding('hardcoded-secret'),
    ];
    const report = makeReport({ optimizationFindings: nonTestFindings });
    writeMultiFileReport(outDir, report, { ...DEFAULT_OPTS, graph: false }, emptyDependencyState(), emptyDependencySummary(), new Map());
    expect(fs.existsSync(path.join(outDir, 'test-quality.json'))).toBe(false);
  });

  it('findings have correct types for lineStart, lineEnd, severity, and suggestedFix.steps', () => {
    const outDir = path.join(tmpDir, 'type-validation');
    writeMultiFileReport(outDir, makeReport(), { ...DEFAULT_OPTS, graph: false }, emptyDependencyState(), emptyDependencySummary(), new Map());
    const findingsData = JSON.parse(fs.readFileSync(path.join(outDir, 'findings.json'), 'utf8'));
    const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
    for (const f of findingsData.optimizationFindings as Finding[]) {
      expect(typeof f.lineStart).toBe('number');
      expect(typeof f.lineEnd).toBe('number');
      expect(validSeverities).toContain(f.severity);
      expect(Array.isArray(f.suggestedFix.steps)).toBe(true);
      for (const step of f.suggestedFix.steps) {
        expect(typeof step).toBe('string');
      }
    }
  });
});

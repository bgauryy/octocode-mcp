import fs from 'node:fs';
import path from 'node:path';

import { PILLAR_CATEGORIES, SEVERITY_ORDER } from '../types/index.js';

import type { ReportAnalysisSummary } from './analysis.js';
import type { AgentOutputData, Finding, FindingStats, ScanSummaryData } from '../types/index.js';

export function severityBreakdown(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  return counts;
}

export function categoryBreakdown(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.category] = (counts[f.category] || 0) + 1;
  return counts;
}

export function computeHealthScore(
  findings: Finding[],
  totalFiles: number
): number {
  return computeHealthScoreFromSeverityBreakdown(
    severityBreakdown(findings),
    totalFiles
  );
}

function computeHealthScoreFromSeverityBreakdown(
  breakdown: Record<string, number>,
  totalFiles: number
): number {
  if (totalFiles === 0) return 100;
  const weights = { critical: 25, high: 10, medium: 3, low: 1, info: 0 };
  let penalty = 0;
  for (const [severity, count] of Object.entries(breakdown)) {
    penalty += (weights[severity as keyof typeof weights] || 0) * count;
  }
  const weightedFindingsPerFile = penalty / totalFiles;
  return Math.max(
    0,
    Math.min(100, Math.round(100 / (1 + weightedFindingsPerFile / 10)))
  );
}

export function collectTagCloud(
  findings: Finding[]
): { tag: string; count: number }[] {
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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function summarizeActiveFeatures(activeFeatures: Set<string>): string[] {
  const remaining = new Set(activeFeatures);
  const labels: string[] = [];

  for (const [pillar, categories] of Object.entries(PILLAR_CATEGORIES)) {
    if (categories.length > 0 && categories.every(cat => remaining.has(cat))) {
      labels.push(pillar);
      for (const cat of categories) remaining.delete(cat);
    }
  }

  return [...labels, ...[...remaining].sort()];
}

function isPillarActive(
  pillarKey: string,
  activeFeatures: Set<string> | null
): boolean {
  if (!activeFeatures) return true;
  const pillarCats = PILLAR_CATEGORIES[pillarKey] || [];
  return pillarCats.some(cat => activeFeatures.has(cat));
}

type FindingLike = Omit<Finding, 'id'> & { id?: string };

export function diversifyFindings<T extends FindingLike>(
  sorted: T[],
  limit: number
): T[] {
  if (!Number.isFinite(limit) || limit >= sorted.length) return sorted;

  const groups = new Map<string, T[]>();
  for (const f of sorted) {
    const cat = f.category;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(f);
  }

  const categoryOrder = [...groups.entries()].sort((a, b) => {
    const aTop = SEVERITY_ORDER[a[1][0].severity] ?? 0;
    const bTop = SEVERITY_ORDER[b[1][0].severity] ?? 0;
    return bTop - aTop;
  });

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
    if (!picked) break;
  }
  return result;
}

export function diverseTopRecommendations(
  findings: Finding[],
  limit: number = 20,
  maxPerCategory: number = 2
): Finding[] {
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

export interface SummaryMdOptions {
  dir: string;
  report: import('./writer.js').FullReport;
  outputFiles: Record<string, string>;
  architectureFindings: Finding[];
  codeQualityFindings: Finding[];
  deadCodeFindings: Finding[];
  hotFiles?: import('../types/index.js').HotFile[];
  activeFeatures?: Set<string> | null;
  scope?: string[] | null;
  root?: string;
  scopeSymbols?: Map<string, string[]> | null;
  semanticEnabled?: boolean;
  securityFindings?: Finding[];
  testQualityFindings?: Finding[];
  reportAnalysis?: ReportAnalysisSummary;
}

function formatCliPath(filePath: string): string {
  return JSON.stringify(filePath.replace(/\\/g, '/'));
}

export function generateSummaryMd(opts: SummaryMdOptions): string {
  const {
    dir,
    report,
    outputFiles,
    architectureFindings,
    codeQualityFindings,
    deadCodeFindings,
    hotFiles = [],
    activeFeatures = null,
    scope = null,
    root = process.cwd(),
    scopeSymbols = null,
    semanticEnabled = false,
    securityFindings = [],
    testQualityFindings = [],
    reportAnalysis = null,
  } = opts;
  const allFindings = report.optimizationFindings || [];
  const summary: ScanSummaryData = report.summary;
  const agentOutput: AgentOutputData = report.agentOutput;
  const findingStats: FindingStats | null = agentOutput?.findingStats ?? null;
  const depGraph = report.dependencyGraph;
  const relativeScanDir = path.relative(root, dir) || '.';
  const exampleFileFilter = ((scope?.[0] ?? 'src/index').split(':')[0] || 'src/index')
    .replace(/\\/g, '/');
  const overallFindingStats = findingStats?.overall ?? {
    totalFindings: allFindings.length,
    severityBreakdown: severityBreakdown(allFindings),
  };

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
  lines.push(`| Critical | ${overallFindingStats.severityBreakdown.critical ?? 0} |`);
  lines.push(`| High | ${overallFindingStats.severityBreakdown.high ?? 0} |`);
  lines.push(`| Medium | ${overallFindingStats.severityBreakdown.medium ?? 0} |`);
  lines.push(`| Low | ${overallFindingStats.severityBreakdown.low ?? 0} |`);
  lines.push(`| **Total** | **${overallFindingStats.totalFindings}** |`);
  lines.push('');

  renderScanAnnotations(lines, {
    allFindings, overallFindingStats, agentOutput,
    activeFeatures, scope, root, scopeSymbols, semanticEnabled,
  });

  const renderPillarCategories = (
    pillarKey: string,
    findings: Finding[]
  ): void => {
    const breakdown = categoryBreakdown(findings);
    const pillarCats = PILLAR_CATEGORIES[pillarKey] || [];
    const isFiltered = activeFeatures !== null;
    for (const cat of pillarCats) {
      const count = breakdown[cat] || 0;
      const skipped = isFiltered && !activeFeatures!.has(cat);
      lines.push(skipped ? `- \`${cat}\`: — *(skipped)*` : `- \`${cat}\`: ${count}`);
    }
    lines.push('');
  };

  const totalFiles = summary.totalFiles || 1;
  const archStats = findingStats?.pillars?.['architecture'];
  const qualStats = findingStats?.pillars?.['code-quality'];
  const deadStats = findingStats?.pillars?.['dead-code'];
  const secStats = findingStats?.pillars?.['security'];
  const testStats = findingStats?.pillars?.['test-quality'];

  const pillarHealth = computePillarHealthScores(totalFiles, overallFindingStats, {
    archStats, qualStats, deadStats, secStats, testStats,
    architectureFindings, codeQualityFindings, deadCodeFindings,
    securityFindings, testQualityFindings,
  });

  const pushPillarSummary = buildPillarSummaryPusher(lines, activeFeatures, outputFiles);

  renderHealthScores(lines, pillarHealth, activeFeatures);

  renderTagCloud(lines, allFindings);

  if (reportAnalysis) {
    renderAnalysisSignals(lines, reportAnalysis);
  }

  renderAgentInstructions(lines, outputFiles, allFindings);

  lines.push('## Architecture Health\n');
  pushPillarSummary(
    'architecture',
    archStats?.totalFindings ?? architectureFindings.length,
    pillarHealth.archHealth,
    'architecture',
    'architecture.json'
  );
  if (depGraph) {
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Modules | ${depGraph.totalModules} |`);
    lines.push(`| Import edges | ${depGraph.totalEdges} |`);
    lines.push(`| Cycles | ${depGraph.cycles?.length ?? 0} |`);
    lines.push(`| Critical paths | ${depGraph.criticalPaths?.length ?? 0} |`);
    lines.push(`| Root modules | ${depGraph.rootsCount} |`);
    lines.push(`| Leaf modules | ${depGraph.leavesCount} |`);
    lines.push(
      `| Test-only modules | ${depGraph.testOnlyModules?.length ?? 0} |`
    );
    lines.push(`| Unresolved imports | ${depGraph.unresolvedEdgeCount} |`);
    lines.push('');
  }
  renderPillarCategories('architecture', architectureFindings);

  renderHotspots(lines, hotFiles);

  renderPillarSections(lines, {
    architectureFindings,
    codeQualityFindings,
    deadCodeFindings,
    securityFindings,
    testQualityFindings,
    archStats,
    qualStats,
    deadStats,
    secStats,
    testStats,
    ...pillarHealth,
    activeFeatures,
    outputFiles,
    renderPillarCategories,
    pushPillarSummary,
  });

  renderRecommendations(lines, agentOutput);

  if (outputFiles.astTrees) {
    renderAstTreesSection(lines, dir, outputFiles, root, relativeScanDir, exampleFileFilter);
  }

  renderOutputFilesTable(lines, dir, outputFiles);

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

interface PillarHealthScores {
  overallHealth: number;
  archHealth: number;
  qualHealth: number;
  deadHealth: number;
  secHealth: number;
  testHealth: number;
}

function computePillarHealthScores(
  totalFiles: number,
  overallFindingStats: { totalFindings: number; severityBreakdown: Record<string, number> },
  ctx: {
    archStats?: { severityBreakdown: Record<string, number> };
    qualStats?: { severityBreakdown: Record<string, number> };
    deadStats?: { severityBreakdown: Record<string, number> };
    secStats?: { severityBreakdown: Record<string, number> };
    testStats?: { severityBreakdown: Record<string, number> };
    architectureFindings: Finding[];
    codeQualityFindings: Finding[];
    deadCodeFindings: Finding[];
    securityFindings: Finding[];
    testQualityFindings: Finding[];
  }
): PillarHealthScores {
  const score = (
    stats: { severityBreakdown: Record<string, number> } | undefined,
    fallback: Finding[]
  ) => computeHealthScoreFromSeverityBreakdown(
    stats?.severityBreakdown ?? severityBreakdown(fallback), totalFiles
  );
  return {
    overallHealth: computeHealthScoreFromSeverityBreakdown(overallFindingStats.severityBreakdown, totalFiles),
    archHealth: score(ctx.archStats, ctx.architectureFindings),
    qualHealth: score(ctx.qualStats, ctx.codeQualityFindings),
    deadHealth: score(ctx.deadStats, ctx.deadCodeFindings),
    secHealth: score(ctx.secStats, ctx.securityFindings),
    testHealth: score(ctx.testStats, ctx.testQualityFindings),
  };
}

function gradeScore(s: number): string {
  return s >= 80 ? 'A' : s >= 60 ? 'B' : s >= 40 ? 'C' : s >= 20 ? 'D' : 'F';
}

function renderHealthScores(
  lines: string[],
  health: PillarHealthScores,
  activeFeatures: Set<string> | null
): void {
  lines.push('## Health Scores\n');
  lines.push('| Pillar | Score | Grade |');
  lines.push('|--------|-------|-------|');
  const pushRow = (label: string, pillarKey: string, score: number): void => {
    if (!isPillarActive(pillarKey, activeFeatures)) {
      lines.push(`| ${label} | — | skipped |`);
      return;
    }
    lines.push(`| ${label} | ${score}/100 | ${gradeScore(score)} |`);
  };
  lines.push(
    `| **Overall** | **${health.overallHealth}/100** | **${gradeScore(health.overallHealth)}** |`
  );
  pushRow('Architecture', 'architecture', health.archHealth);
  pushRow('Code Quality', 'code-quality', health.qualHealth);
  pushRow('Dead Code & Hygiene', 'dead-code', health.deadHealth);
  pushRow('Security', 'security', health.secHealth);
  pushRow('Test Quality', 'test-quality', health.testHealth);
  lines.push('');
}

function buildPillarSummaryPusher(
  lines: string[],
  activeFeatures: Set<string> | null,
  outputFiles: Record<string, string>
): (pillarKey: string, count: number, score: number, artifactKey?: string, artifactName?: string) => void {
  return (pillarKey, findingsCount, score, artifactKey, artifactName): void => {
    if (!isPillarActive(pillarKey, activeFeatures)) {
      lines.push('> skipped by feature filter\n');
      return;
    }
    if (artifactKey && outputFiles[artifactKey]) {
      lines.push(
        `> ${findingsCount} findings (score: ${score}/100) — see [\`${artifactName}\`](./${outputFiles[artifactKey]})\n`
      );
      return;
    }
    if (artifactName) {
      lines.push(
        `> ${findingsCount} findings (score: ${score}/100) — no \`${artifactName}\` written for this scan\n`
      );
      return;
    }
    lines.push(`> ${findingsCount} findings (score: ${score}/100)\n`);
  };
}

function renderScanAnnotations(
  lines: string[],
  ctx: {
    allFindings: Finding[];
    overallFindingStats: { totalFindings: number; severityBreakdown: Record<string, number> };
    agentOutput: AgentOutputData;
    activeFeatures: Set<string> | null;
    scope: string[] | null;
    root: string;
    scopeSymbols: Map<string, string[]> | null;
    semanticEnabled: boolean;
  }
): void {
  const { allFindings, overallFindingStats, agentOutput } = ctx;
  const totalBefore: number | undefined =
    overallFindingStats.totalFindings || agentOutput?.totalBeforeTruncation;
  const dropped = agentOutput?.droppedCategories;
  if (totalBefore && totalBefore > allFindings.length) {
    lines.push(
      `> **Truncated**: Showing ${allFindings.length} of ${totalBefore} findings (\`--findings-limit ${allFindings.length}\`).`
    );
    if (dropped && dropped.length > 0) {
      lines.push(`> Dropped categories: ${dropped.map(c => `\`${c}\``).join(', ')}`);
    }
    lines.push('');
  }

  if (ctx.activeFeatures) {
    const featureLabels = summarizeActiveFeatures(ctx.activeFeatures);
    lines.push(`> **Features filter**: \`--features=${featureLabels.join(',')}\``);
    lines.push('');
  }

  if (ctx.scope && ctx.scope.length > 0) {
    const scopeDisplay = ctx.scope.map(s => path.relative(ctx.root, s)).filter(Boolean);
    if (scopeDisplay.length > 0) {
      let scopeLabel = scopeDisplay.map(p => `\`${p}\``).join(', ');
      if (ctx.scopeSymbols && ctx.scopeSymbols.size > 0) {
        const symParts: string[] = [];
        for (const [absFile, names] of ctx.scopeSymbols) {
          const rel = path.relative(ctx.root, absFile);
          symParts.push(...names.map(n => `\`${rel}:${n}\``));
        }
        scopeLabel = symParts.join(', ');
      }
      lines.push(`> **Scoped scan**: Only showing findings for: ${scopeLabel}`);
      lines.push('');
    }
  }

  if (ctx.semanticEnabled) {
    lines.push(
      '> **Semantic analysis**: TypeChecker + LanguageService enabled (14 additional categories)'
    );
    lines.push('');
  }
}

function renderTagCloud(lines: string[], allFindings: Finding[]): void {
  const tagCloud = collectTagCloud(allFindings);
  if (tagCloud.length === 0) return;
  lines.push('## Top Concern Tags\n');
  lines.push(
    'Searchable tags across all findings — use to filter `findings.json` with `jq`.\n'
  );
  for (const { tag, count } of tagCloud.slice(0, 12)) {
    lines.push(`- \`${tag}\`: ${count} findings`);
  }
  lines.push('');
}

function renderAnalysisSignals(
  lines: string[],
  reportAnalysis: ReportAnalysisSummary
): void {
  lines.push('## Analysis Signals\n');
  lines.push(
    `- **Graph Signal**: ${reportAnalysis.strongestGraphSignal?.summary || 'No dominant graph signal in this scan.'}`
  );
  lines.push(
    `- **AST Signal**: ${reportAnalysis.strongestAstSignal?.summary || 'No dominant AST signal in this scan.'}`
  );
  lines.push(
    `- **Combined Interpretation**: ${reportAnalysis.combinedInterpretation?.summary || 'No combined interpretation available yet.'}`
  );
  lines.push(
    `- **Confidence**: ${reportAnalysis.combinedInterpretation?.confidence || reportAnalysis.strongestGraphSignal?.confidence || reportAnalysis.strongestAstSignal?.confidence || 'low'}`
  );
  const validationSummary = reportAnalysis.recommendedValidation
    ? `${reportAnalysis.recommendedValidation.summary} (tools: ${reportAnalysis.recommendedValidation.tools.join(' -> ')})`
    : 'Use Octocode local tools to confirm the strongest signal before presenting it as fact.';
  lines.push(`- **Recommended Validation**: ${validationSummary}`);
  const megaFolderSignal = reportAnalysis.graphSignals.find(
    signal => signal.kind === 'mega-folder-cluster'
  );
  if (megaFolderSignal) {
    lines.push(`- **Structural Layout Alert**: ${megaFolderSignal.summary}`);
  }
  if (reportAnalysis.investigationPrompts.length > 0) {
    lines.push('');
    lines.push('**Investigation Prompts**');
    for (const prompt of reportAnalysis.investigationPrompts.slice(0, 4)) {
      lines.push(`- ${prompt}`);
    }
  }
  lines.push('');
}

function renderAgentInstructions(
  lines: string[],
  outputFiles: Record<string, string>,
  allFindings: Finding[]
): void {
  const hasCriticalOrHigh = allFindings.some(
    f => f.severity === 'critical' || f.severity === 'high'
  );
  lines.push('## Agent Instructions — Validate Before Presenting\n');
  lines.push(
    '> **Core rule**: Findings are hypotheses from deterministic AST/graph detectors. '
    + 'Validate with Octocode local + LSP tools before presenting any finding as fact.\n'
  );

  lines.push('### Triage Order\n');
  lines.push('1. **This file first** — health scores + analysis signals drive triage priority');
  if (hasCriticalOrHigh) {
    lines.push(
      '2. **High/critical findings** — filter `findings.json`: '
      + '`jq \'.optimizationFindings[] | select(.severity == "critical" or .severity == "high")\' findings.json`'
    );
  } else {
    lines.push('2. **Findings by severity** — start from the top of `findings.json` (already sorted by severity)');
  }
  lines.push('3. **Pillar JSONs** — drill into `architecture.json`, `code-quality.json`, etc. only for categories that need investigation');
  lines.push('4. **`file-inventory.json`** — per-file deep dives: functions, flows, `effectProfile`, `cfgFlags`, `dependencyProfile`');
  lines.push('');

  lines.push('### Validation Tool Chain\n');
  lines.push('Each finding includes `lspHints[]`, `correlatedSignals[]`, and `recommendedValidation`. Use them.\n');
  lines.push('```');
  lines.push('Finding → localSearchCode (get lineHint) → LSP tool → localGetFileContent → verdict');
  lines.push('```\n');
  lines.push('| Step | Tool | Purpose |');
  lines.push('|------|------|---------|');
  lines.push('| 1. Search | `localSearchCode(pattern, path)` | **Always first** — get `lineHint` for LSP. Never guess lineHint. |');
  lines.push('| 2. Locate | `lspGotoDefinition(lineHint)` | Jump to definition across files |');
  lines.push('| 3. Consumers | `lspFindReferences(lineHint)` | Count usages, split test/prod with `includePattern`/`excludePattern` |');
  lines.push('| 4. Call flow | `lspCallHierarchy(lineHint, incoming/outgoing)` | Trace call chains — **functions only**, fails on types/vars |');
  lines.push('| 5. Read code | `localGetFileContent(path, matchString=...)` | Confirm code at reported location |');
  lines.push('| 6. AST proof | `ast/search.js -p <pattern> --root <path>` | Structural proof on **live source** — zero false positives |');
  if (outputFiles.astTrees) {
    lines.push('| 7. AST triage | `ast/tree-search.js -i <scan-dir> -k <Kind>` | Fast triage on scan snapshot — `-k FunctionDeclaration`, `-p \'IfStatement\\|ForStatement\'`, `--file` filter, `-C 2` context |');
  }
  lines.push('');

  lines.push('### False Positive Checklist\n');
  lines.push('Before reporting a finding to the user:\n');
  lines.push('- [ ] Ran `lspHints[]` from the finding — result matches expectation?');
  lines.push('- [ ] Code exists at reported `file:lineStart` — confirmed with `localGetFileContent`?');
  lines.push('- [ ] Pattern confirmed in live source — `ast/search.js -p` or `localSearchCode`?');
  lines.push('- [ ] Not in generated, vendored, or test-only code?');
  lines.push('- [ ] `correlatedSignals[]` — multiple signals on same file strengthen confidence');
  lines.push('- [ ] Consumer count verified with `lspFindReferences` — matches claimed impact?');
  lines.push('');
  lines.push('**Rate each finding**: `confirmed` (evidence supports) · `dismissed` (explain why) · `uncertain` (state what\'s missing)\n');
}

function renderHotspots(
  lines: string[],
  hotFiles: SummaryMdOptions['hotFiles']
): void {
  if (!hotFiles || hotFiles.length === 0) return;
  lines.push('## Change Risk Hotspots\n');
  lines.push(
    'Files most dangerous to change — high fan-in, complexity, or cycle membership.\n'
  );
  lines.push(
    '| File | Risk | Fan-In | Fan-Out | Complexity | Exports | Cycle | Critical Path |'
  );
  lines.push(
    '|------|------|--------|---------|------------|---------|-------|---------------|'
  );
  for (const hf of hotFiles.slice(0, 15)) {
    lines.push(
      `| \`${hf.file}\` | ${hf.riskScore} | ${hf.fanIn} | ${hf.fanOut} | ${hf.complexityScore} | ${hf.exportCount} | ${hf.inCycle ? 'Y' : '-'} | ${hf.onCriticalPath ? 'Y' : '-'} |`
    );
  }
  lines.push('');
}

function renderPillarSections(
  lines: string[],
  ctx: {
    architectureFindings: Finding[];
    codeQualityFindings: Finding[];
    deadCodeFindings: Finding[];
    securityFindings: Finding[];
    testQualityFindings: Finding[];
    archStats: { totalFindings: number; severityBreakdown: Record<string, number> } | undefined;
    qualStats: { totalFindings: number; severityBreakdown: Record<string, number> } | undefined;
    deadStats: { totalFindings: number; severityBreakdown: Record<string, number> } | undefined;
    secStats: { totalFindings: number; severityBreakdown: Record<string, number> } | undefined;
    testStats: { totalFindings: number; severityBreakdown: Record<string, number> } | undefined;
    archHealth: number;
    qualHealth: number;
    deadHealth: number;
    secHealth: number;
    testHealth: number;
    activeFeatures: Set<string> | null;
    outputFiles: Record<string, string>;
    renderPillarCategories: (pillarKey: string, findings: Finding[]) => void;
    pushPillarSummary: (pillarKey: string, count: number, score: number, artifactKey?: string, artifactName?: string) => void;
  }
): void {
  const { architectureFindings, codeQualityFindings, deadCodeFindings, securityFindings, testQualityFindings } = ctx;
  const { qualStats, deadStats, secStats, testStats } = ctx;
  const { qualHealth, deadHealth, secHealth, testHealth } = ctx;
  const { renderPillarCategories, pushPillarSummary } = ctx;

  lines.push('## Code Quality\n');
  pushPillarSummary(
    'code-quality',
    qualStats?.totalFindings ?? codeQualityFindings.length,
    qualHealth,
    'codeQuality',
    'code-quality.json'
  );
  renderPillarCategories('code-quality', codeQualityFindings);

  lines.push('## Dead Code & Hygiene\n');
  pushPillarSummary(
    'dead-code',
    deadStats?.totalFindings ?? deadCodeFindings.length,
    deadHealth,
    'deadCode',
    'dead-code.json'
  );
  renderPillarCategories('dead-code', deadCodeFindings);

  lines.push('## Security\n');
  pushPillarSummary(
    'security',
    secStats?.totalFindings ?? securityFindings.length,
    secHealth,
    'security',
    'security.json'
  );
  renderPillarCategories('security', securityFindings);

  lines.push('## Test Quality\n');
  pushPillarSummary(
    'test-quality',
    testStats?.totalFindings ?? testQualityFindings.length,
    testHealth,
    'testQuality',
    'test-quality.json'
  );
  renderPillarCategories('test-quality', testQualityFindings);

  const untestedCount = architectureFindings.filter(
    f => f.category === 'untested-critical-code'
  ).length;
  if (
    untestedCount > 0 &&
    (testStats?.totalFindings ?? testQualityFindings.length) === 0
  ) {
    lines.push(
      `> **Note**: Test Quality reflects analyzed test files only. ${untestedCount} modules flagged as \`untested-critical-code\` (architecture pillar) have no test coverage — use \`--include-tests\` for test-quality analysis.\n`
    );
  }
}

function renderRecommendations(
  lines: string[],
  agentOutput: AgentOutputData
): void {
  const topRecs = agentOutput?.topRecommendations ?? [];
  if (topRecs.length > 0) {
    lines.push('## Top Recommendations\n');
    for (const rec of topRecs.slice(0, 10)) {
      lines.push(
        `- **[${rec.severity.toUpperCase()}]** \`${rec.file}\` — ${rec.title} *(${rec.category})* `
      );
    }
    lines.push('');
  }
}

function renderAstTreesSection(
  lines: string[],
  dir: string,
  outputFiles: Record<string, string>,
  root: string,
  relativeScanDir: string,
  exampleFileFilter: string
): void {
  const astTreePath = path.resolve(dir, outputFiles.astTrees);
  const astTreeArg = formatCliPath(astTreePath);
  lines.push('## AST Trees (`ast-trees.txt`)\n');
  lines.push(
    'Compact indented text format — each node is `Kind[startLine:endLine]`, nesting = indentation.\n'
  );
  lines.push(
    `Run these commands from the skill directory. Current scan: \`${relativeScanDir}\`.\n`
  );
  lines.push('```');
  lines.push('SourceFile[1:152]');
  lines.push('  ImportDeclaration[1]');
  lines.push('  FunctionDeclaration[3:20]');
  lines.push('    Block[4:19]');
  lines.push('      IfStatement[5:12] ...');
  lines.push('```\n');
  lines.push('**Smart navigation:**\n');
  lines.push(
    `- Find functions: \`node scripts/ast/tree-search.js -i ${astTreeArg} -k function_declaration --limit 25\``
  );
  lines.push(
    `- Find classes: \`node scripts/ast/tree-search.js -i ${astTreeArg} -k class_declaration --limit 25\``
  );
  lines.push(
    `- Find control flow: \`node scripts/ast/tree-search.js -i ${astTreeArg} -p 'IfStatement|SwitchStatement|ForStatement|WhileStatement' --limit 25\``
  );
  lines.push(
    `- Narrow to one file: \`node scripts/ast/tree-search.js -i ${astTreeArg} --file "${exampleFileFilter}" -k function_declaration --limit 10\``
  );
  lines.push(
    `- Raw text fallback: \`rg 'FunctionDeclaration|IfStatement' ${astTreeArg}\``
  );
  lines.push('');
}

function renderOutputFilesTable(
  lines: string[],
  dir: string,
  outputFiles: Record<string, string>
): void {
  lines.push('## Output Files\n');
  lines.push('| File | Size | Description |');
  lines.push('|------|------|-------------|');
  const descriptions: Record<string, string> = {
    summary: 'Scan metadata, agent output, parse errors',
    architecture:
      'Dependency graph, cycles, critical paths, architecture findings',
    codeQuality: 'Duplicate detection, complexity, god modules/functions',
    deadCode: 'Dead files/exports/re-exports, unused deps, boundary violations',
    fileInventory: 'Per-file function/flow/dependency details',
    findings: 'All findings across all categories (master list)',
    graph: 'Mermaid dependency graph',
    astTrees:
      'AST tree snapshots (compact indented text — grep/regex friendly)',
    summaryMd: 'This file — human-readable overview',
  };
  for (const [key, file] of Object.entries(outputFiles)) {
    let size = '—';
    try {
      size = formatFileSize(fs.statSync(path.join(dir, file)).size);
    } catch {
      size = '—';
    }
    lines.push(
      `| [\`${file}\`](./${file}) | ${size} | ${descriptions[key] || key} |`
    );
  }
  lines.push('');
}

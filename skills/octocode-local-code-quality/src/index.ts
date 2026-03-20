import { isDirectRun } from './common/is-direct-run.js';
import {
  buildConsumedFromModule,
  computeHotFiles,
  detectAwaitInLoop,
  detectBarrelExplosion,
  detectBoundaryViolations,
  detectCognitiveComplexity,
  detectCommonJsInEsm,
  detectCriticalPaths,
  detectDeadExports,
  detectDeadReExports,
  detectDependencyCycles,
  detectDistanceFromMainSequence,
  detectDuplicateFlowStructures,
  detectDuplicateFunctionBodies,
  detectEmptyCatchBlocks,
  detectExcessiveParameters,
  detectExportStarLeak,
  detectFeatureEnvy,
  detectFunctionOptimization,
  detectGodFunctions,
  detectGodModuleCoupling,
  detectGodModules,
  detectHighCoupling,
  detectHighHalsteadEffort,
  detectImportSideEffectRisk,
  detectLayerViolations,
  detectListenerLeakRisk,
  detectLowCohesion,
  detectLowMaintainability,
  detectMegaFolders,
  detectMessageChains,
  detectMissingErrorBoundary,
  detectNamespaceImport,
  detectOrphanModules,
  detectPromiseMisuse,
  detectSdpViolations,
  detectSimilarFunctionBodies,
  detectSwitchNoDefault,
  detectSyncIo,
  detectTestOnlyModules,
  detectTypeAssertionEscape,
  detectUnboundedCollection,
  detectUnclearedTimers,
  detectUnreachableModules,
  detectUnsafeAny,
  detectUntestedCriticalCode,
  detectUnusedNpmDeps,
} from './detectors/index.js';
import {
  detectCommandInjectionRisk,
  detectDebugLogLeakage,
  detectEvalUsage,
  detectHardcodedSecrets,
  detectInputPassthroughRisk,
  detectPathTraversalRisk,
  detectPrototypePollutionRisk,
  detectSensitiveDataLogging,
  detectSqlInjectionRisk,
  detectUnsafeHtml,
  detectUnsafeRegex,
  detectUnvalidatedInputSink,
} from './detectors/security.js';
import {
  detectExcessiveMocking,
  detectFakeTimersWithoutRestore,
  detectFocusedTests,
  detectLowAssertionDensity,
  detectMissingMockRestoration,
  detectMissingTestCleanup,
  detectSharedMutableState,
  detectTestNoAssertion,
} from './detectors/test-quality.js';
import { diversifyFindings } from './reporting/summary-md.js';
import { SEVERITY_ORDER } from './types/index.js';

import type {
  AnalysisOptions,
  DependencyState,
  DependencySummary,
  DuplicateGroup,
  FileCriticality,
  FileEntry,
  Finding,
  FlowMapEntry,
  RedundantFlowGroup,
} from './types/index.js';

export {
  buildDependencySummary,
  computeDependencyCycles,
  computeDependencyCriticalPaths,
} from './analysis/dependency-summary.js';
export {
  REPORT_SCHEMA_VERSION,
  ARCHITECTURE_CATEGORIES,
  CODE_QUALITY_CATEGORIES,
  DEAD_CODE_CATEGORIES,
  SECURITY_CATEGORIES,
  TEST_QUALITY_CATEGORIES,
  writeMultiFileReport,
  generateMermaidGraph,
} from './reporting/writer.js';
export type { FullReport } from './reporting/writer.js';
export {
  severityBreakdown,
  categoryBreakdown,
  computeHealthScore,
  collectTagCloud,
  formatFileSize,
  diversifyFindings,
  diverseTopRecommendations,
  generateSummaryMd,
} from './reporting/summary-md.js';
export type { SummaryMdOptions } from './reporting/summary-md.js';

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
  additionalFindings: Array<Omit<Finding, 'id'>> = []
): {
  allFindings: Array<Omit<Finding, 'id'>>;
  findings: Finding[];
  byFile: Map<string, string[]>;
  totalBeforeTruncation: number;
  droppedCategories: string[];
} {
  const rawFindings: Array<Omit<Finding, 'id'>> = [];

  const addFinding = (finding: Omit<Finding, 'id'>): void => {
    if (options.features && !options.features.has(finding.category)) return;
    rawFindings.push(finding);
  };

  const { production: consumedFromModule, test: testConsumedFromModule } =
    buildConsumedFromModule(dependencyState);

  for (const f of detectDuplicateFunctionBodies(duplicates)) addFinding(f);
  for (const f of detectDuplicateFlowStructures(
    controlDuplicates,
    options.flowDupThreshold
  ))
    addFinding(f);
  for (const f of detectFunctionOptimization(
    fileSummaries,
    options.criticalComplexityThreshold
  ))
    addFinding(f);
  for (const f of detectTestOnlyModules(dependencySummary)) addFinding(f);
  for (const f of detectDependencyCycles(dependencySummary, dependencyState))
    addFinding(f);
  for (const f of detectCriticalPaths(
    dependencySummary,
    dependencyState,
    options.criticalComplexityThreshold
  ))
    addFinding(f);
  for (const f of detectDeadExports(
    dependencyState,
    consumedFromModule,
    testConsumedFromModule
  ))
    addFinding(f);
  for (const f of detectDeadReExports(dependencyState, consumedFromModule))
    addFinding(f);
  for (const f of detectSdpViolations(dependencyState)) addFinding(f);
  for (const f of detectHighCoupling(
    dependencyState,
    options.couplingThreshold
  ))
    addFinding(f);
  for (const f of detectGodModuleCoupling(
    dependencyState,
    options.fanInThreshold,
    options.fanOutThreshold
  ))
    addFinding(f);
  for (const f of detectOrphanModules(dependencyState)) addFinding(f);
  for (const f of detectUnreachableModules(dependencyState)) addFinding(f);

  for (const f of detectUnusedNpmDeps(
    dependencyState.externalCounts,
    pkgJsonDeps,
    pkgJsonDevDeps
  ))
    addFinding(f);
  for (const f of detectBoundaryViolations(dependencyState)) addFinding(f);
  for (const f of detectBarrelExplosion(
    dependencyState,
    options.barrelSymbolThreshold
  ))
    addFinding(f);
  for (const f of detectGodModules(
    fileSummaries,
    dependencyState,
    options.godModuleStatements,
    options.godModuleExports
  ))
    addFinding(f);
  for (const f of detectMegaFolders(fileSummaries)) addFinding(f);
  for (const f of detectGodFunctions(
    fileSummaries,
    options.godFunctionStatements
  ))
    addFinding(f);
  for (const f of detectCognitiveComplexity(
    fileSummaries,
    options.cognitiveComplexityThreshold
  ))
    addFinding(f);
  if (options.layerOrder.length >= 2) {
    for (const f of detectLayerViolations(dependencyState, options.layerOrder))
      addFinding(f);
  }
  for (const f of detectLowCohesion(dependencyState)) addFinding(f);
  for (const f of detectDistanceFromMainSequence(dependencyState))
    addFinding(f);
  for (const f of detectFeatureEnvy(dependencyState)) addFinding(f);

  const hotFilesForDetector = computeHotFiles(
    dependencyState,
    dependencySummary,
    fileCriticalityByPath
  );
  for (const f of detectUntestedCriticalCode(
    dependencyState,
    hotFilesForDetector,
    fileCriticalityByPath
  ))
    addFinding(f);

  for (const f of detectImportSideEffectRisk(
    fileSummaries,
    dependencyState,
    dependencySummary,
    hotFilesForDetector
  ))
    addFinding(f);

  for (const f of detectNamespaceImport(dependencyState)) addFinding(f);
  for (const f of detectCommonJsInEsm(dependencyState)) addFinding(f);
  for (const f of detectExportStarLeak(dependencyState)) addFinding(f);

  for (const f of detectExcessiveParameters(
    fileSummaries,
    options.parameterThreshold
  ))
    addFinding(f);
  for (const f of detectEmptyCatchBlocks(fileSummaries)) addFinding(f);
  for (const f of detectSwitchNoDefault(fileSummaries)) addFinding(f);
  for (const f of detectUnsafeAny(fileSummaries, options.anyThreshold))
    addFinding(f);
  for (const f of detectHighHalsteadEffort(
    fileSummaries,
    options.halsteadEffortThreshold
  ))
    addFinding(f);
  for (const f of detectLowMaintainability(
    fileSummaries,
    options.maintainabilityIndexThreshold
  ))
    addFinding(f);
  for (const f of detectTypeAssertionEscape(fileSummaries)) addFinding(f);
  for (const f of detectMissingErrorBoundary(fileSummaries)) addFinding(f);
  for (const f of detectPromiseMisuse(fileSummaries)) addFinding(f);

  for (const f of detectAwaitInLoop(fileSummaries)) addFinding(f);
  for (const f of detectSyncIo(fileSummaries)) addFinding(f);
  for (const f of detectUnclearedTimers(fileSummaries)) addFinding(f);
  for (const f of detectListenerLeakRisk(fileSummaries)) addFinding(f);
  for (const f of detectUnboundedCollection(fileSummaries)) addFinding(f);
  for (const f of detectMessageChains(fileSummaries)) addFinding(f);
  for (const f of detectSimilarFunctionBodies(
    flowMap,
    options.similarityThreshold
  ))
    addFinding(f);

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
  for (const f of detectDebugLogLeakage(fileSummaries)) addFinding(f);
  for (const f of detectSensitiveDataLogging(fileSummaries)) addFinding(f);

  for (const f of detectLowAssertionDensity(fileSummaries)) addFinding(f);
  for (const f of detectTestNoAssertion(fileSummaries)) addFinding(f);
  for (const f of detectExcessiveMocking(fileSummaries, options.mockThreshold))
    addFinding(f);
  for (const f of detectSharedMutableState(fileSummaries)) addFinding(f);
  for (const f of detectMissingTestCleanup(fileSummaries)) addFinding(f);
  for (const f of detectFocusedTests(fileSummaries)) addFinding(f);
  for (const f of detectFakeTimersWithoutRestore(fileSummaries)) addFinding(f);
  for (const f of detectMissingMockRestoration(fileSummaries)) addFinding(f);

  for (const f of semanticFindings) addFinding(f);
  for (const f of additionalFindings) addFinding(f);

  const sorted = rawFindings.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (bySeverity !== 0) return bySeverity;
    if (a.category < b.category) return -1;
    if (a.category > b.category) return 1;
    return 0;
  });

  const { findings: truncated, totalBeforeTruncation, droppedCategories } =
    applyFindingsLimit(sorted, options);
  const { findings, byFile } = assignFindingIds(truncated);

  return {
    allFindings: sorted,
    findings,
    byFile,
    totalBeforeTruncation,
    droppedCategories,
  };
}

export function applyFindingsLimit<T extends Omit<Finding, 'id'>>(
  sorted: T[],
  options: Pick<AnalysisOptions, 'findingsLimit' | 'noDiversify'>
): {
  findings: T[];
  totalBeforeTruncation: number;
  droppedCategories: string[];
} {
  const totalBeforeTruncation = sorted.length;
  const allCategoriesBefore = new Set(sorted.map(f => f.category));
  const limit = options.findingsLimit;
  const truncated =
    !Number.isFinite(limit) || limit == null
      ? sorted
      : options.noDiversify
        ? sorted.slice(0, limit)
        : diversifyFindings(sorted, limit);
  const categoriesAfter = new Set(truncated.map(f => f.category));
  const droppedCategories = [...allCategoriesBefore].filter(
    c => !categoriesAfter.has(c)
  );

  return {
    findings: truncated,
    totalBeforeTruncation,
    droppedCategories,
  };
}

export function assignFindingIds(
  rawFindings: Array<Omit<Finding, 'id'>>
): {
  findings: Finding[];
  byFile: Map<string, string[]>;
} {
  const findings: Finding[] = [];
  const byFile = new Map<string, string[]>();

  for (const [i, raw] of rawFindings.entries()) {
    const id = `AST-ISSUE-${String(i + 1).padStart(4, '0')}`;
    const full: Finding = { id, ...raw };
    findings.push(full);
    if (full.file) {
      if (!byFile.has(full.file)) byFile.set(full.file, []);
      byFile.get(full.file)!.push(id);
    }
  }

  return { findings, byFile };
}

if (isDirectRun(import.meta.url)) {
  import('./pipeline/main.js')
    .then(m => m.main())
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}

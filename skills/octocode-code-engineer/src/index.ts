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
  detectDeadFiles,
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
import { PILLAR_CATEGORIES, SEVERITY_ORDER } from './types/index.js';

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
  computeFeatureScores,
  collectTagCloud,
  formatFileSize,
  diversifyFindings,
  diverseTopRecommendations,
  generateSummaryMd,
} from './reporting/summary-md.js';
export type { SummaryMdOptions } from './reporting/summary-md.js';

type FindingDraft = Omit<Finding, 'id'>;
type DetectorFn = () => Iterable<FindingDraft>;

interface EnabledPillars {
  architecture: boolean;
  codeQuality: boolean;
  deadCode: boolean;
  security: boolean;
  testQuality: boolean;
}

function hasEnabledCategory(
  features: Set<string>,
  categories: string[]
): boolean {
  return categories.some(category => features.has(category));
}

export function resolveEnabledPillars(
  features: Set<string> | null
): EnabledPillars {
  if (!features) {
    return {
      architecture: true,
      codeQuality: true,
      deadCode: true,
      security: true,
      testQuality: true,
    };
  }
  return {
    architecture: hasEnabledCategory(features, PILLAR_CATEGORIES['architecture']),
    codeQuality: hasEnabledCategory(features, PILLAR_CATEGORIES['code-quality']),
    deadCode: hasEnabledCategory(features, PILLAR_CATEGORIES['dead-code']),
    security: hasEnabledCategory(features, PILLAR_CATEGORIES['security']),
    testQuality: hasEnabledCategory(features, PILLAR_CATEGORIES['test-quality']),
  };
}

function collectArchitectureFindings(
  dependencySummary: DependencySummary,
  dependencyState: DependencyState,
  fileSummaries: FileEntry[],
  options: AnalysisOptions,
  fileCriticalityByPath: Map<string, FileCriticality>,
  consumedFromModule: Map<string, Set<string>>,
  testConsumedFromModule: Map<string, Set<string>>,
  pkgJsonDeps: Record<string, string>,
  pkgJsonDevDeps: Record<string, string>
): DetectorFn[] {
  const hotFiles = computeHotFiles(dependencyState, dependencySummary, fileCriticalityByPath);
  const detectors: DetectorFn[] = [
    () => detectTestOnlyModules(dependencySummary),
    () => detectDependencyCycles(dependencySummary, dependencyState),
    () => detectCriticalPaths(dependencySummary, dependencyState, options.thresholds.criticalComplexityThreshold),
    () => detectDeadFiles(dependencySummary, dependencyState),
    () => detectDeadExports(dependencyState, consumedFromModule, testConsumedFromModule),
    () => detectDeadReExports(dependencyState, consumedFromModule),
    () => detectSdpViolations(dependencyState, options.thresholds.sdpMinDelta, options.thresholds.sdpMaxSourceInstability),
    () => detectHighCoupling(dependencyState, options.thresholds.couplingThreshold),
    () => detectGodModuleCoupling(dependencyState, options.thresholds.fanInThreshold, options.thresholds.fanOutThreshold),
    () => detectOrphanModules(dependencyState),
    () => detectUnreachableModules(dependencyState),
    () => detectUnusedNpmDeps(dependencyState.externalCounts, pkgJsonDeps, pkgJsonDevDeps),
    () => detectBoundaryViolations(dependencyState),
    () => detectBarrelExplosion(dependencyState, options.thresholds.barrelSymbolThreshold),
    () => detectGodModules(fileSummaries, dependencyState, options.thresholds.godModuleStatements, options.thresholds.godModuleExports),
    () => detectMegaFolders(fileSummaries),
    () => detectLowCohesion(dependencyState),
    () => detectDistanceFromMainSequence(dependencyState),
    () => detectFeatureEnvy(dependencyState),
    () => detectUntestedCriticalCode(dependencyState, hotFiles, fileCriticalityByPath),
    () => detectImportSideEffectRisk(fileSummaries, dependencyState, dependencySummary, hotFiles),
    () => detectNamespaceImport(dependencyState),
    () => detectCommonJsInEsm(dependencyState),
    () => detectExportStarLeak(dependencyState),
  ];
  if (options.thresholds.layerOrder.length >= 2) {
    detectors.push(() => detectLayerViolations(dependencyState, options.thresholds.layerOrder));
  }
  return detectors;
}

function collectCodeQualityFindings(
  duplicates: DuplicateGroup[],
  controlDuplicates: RedundantFlowGroup[],
  fileSummaries: FileEntry[],
  options: AnalysisOptions,
  flowMap: Map<string, FlowMapEntry[]>
): DetectorFn[] {
  return [
    () => detectDuplicateFunctionBodies(duplicates),
    () => detectDuplicateFlowStructures(controlDuplicates, options.thresholds.flowDupThreshold),
    () => detectFunctionOptimization(fileSummaries, options.thresholds.criticalComplexityThreshold),
    () => detectGodFunctions(fileSummaries, options.thresholds.godFunctionStatements, options.thresholds.godFunctionMiThreshold),
    () => detectCognitiveComplexity(fileSummaries, options.thresholds.cognitiveComplexityThreshold),
    () => detectExcessiveParameters(fileSummaries, options.thresholds.parameterThreshold),
    () => detectEmptyCatchBlocks(fileSummaries),
    () => detectSwitchNoDefault(fileSummaries),
    () => detectUnsafeAny(fileSummaries, options.thresholds.anyThreshold),
    () => detectHighHalsteadEffort(fileSummaries, options.thresholds.halsteadEffortThreshold),
    () => detectLowMaintainability(fileSummaries, options.thresholds.maintainabilityIndexThreshold),
    () => detectTypeAssertionEscape(fileSummaries),
    () => detectMissingErrorBoundary(fileSummaries),
    () => detectPromiseMisuse(fileSummaries),
    () => detectAwaitInLoop(fileSummaries),
    () => detectSyncIo(fileSummaries),
    () => detectUnclearedTimers(fileSummaries),
    () => detectListenerLeakRisk(fileSummaries),
    () => detectUnboundedCollection(fileSummaries),
    () => detectMessageChains(fileSummaries),
    () => detectSimilarFunctionBodies(flowMap, options.thresholds.similarityThreshold),
  ];
}

function collectSecurityFindings(fileSummaries: FileEntry[]): DetectorFn[] {
  return [
    () => detectHardcodedSecrets(fileSummaries),
    () => detectEvalUsage(fileSummaries),
    () => detectUnsafeHtml(fileSummaries),
    () => detectSqlInjectionRisk(fileSummaries),
    () => detectUnsafeRegex(fileSummaries),
    () => detectUnvalidatedInputSink(fileSummaries),
    () => detectInputPassthroughRisk(fileSummaries),
    () => detectPrototypePollutionRisk(fileSummaries),
    () => detectPathTraversalRisk(fileSummaries),
    () => detectCommandInjectionRisk(fileSummaries),
    () => detectDebugLogLeakage(fileSummaries),
    () => detectSensitiveDataLogging(fileSummaries),
  ];
}

function collectTestQualityFindings(
  fileSummaries: FileEntry[],
  options: AnalysisOptions
): DetectorFn[] {
  return [
    () => detectLowAssertionDensity(fileSummaries),
    () => detectTestNoAssertion(fileSummaries),
    () => detectExcessiveMocking(fileSummaries, options.thresholds.mockThreshold),
    () => detectSharedMutableState(fileSummaries),
    () => detectMissingTestCleanup(fileSummaries),
    () => detectFocusedTests(fileSummaries),
    () => detectFakeTimersWithoutRestore(fileSummaries),
    () => detectMissingMockRestoration(fileSummaries),
  ];
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
  fileCriticalityByPath: Map<string, FileCriticality> = new Map(),
  semanticFindings: Array<FindingDraft> = [],
  flowMap: Map<string, FlowMapEntry[]> = new Map(),
  additionalFindings: Array<FindingDraft> = []
): {
  allFindings: Array<FindingDraft>;
  findings: Finding[];
  byFile: Map<string, string[]>;
  totalBeforeTruncation: number;
  droppedCategories: string[];
} {
  const rawFindings: Array<FindingDraft> = [];

  const addFinding = (finding: FindingDraft): void => {
    if (options.features && !options.features.has(finding.category)) return;
    rawFindings.push(finding);
  };

  const { production: consumedFromModule, test: testConsumedFromModule } =
    buildConsumedFromModule(dependencyState);
  const enabledPillars = resolveEnabledPillars(options.features);

  const detectors: DetectorFn[] = [
    ...(enabledPillars.architecture || enabledPillars.deadCode
      ? collectArchitectureFindings(
        dependencySummary, dependencyState, fileSummaries, options,
        fileCriticalityByPath, consumedFromModule, testConsumedFromModule,
        pkgJsonDeps, pkgJsonDevDeps
      )
      : []),
    ...(enabledPillars.codeQuality
      ? collectCodeQualityFindings(
        duplicates,
        controlDuplicates,
        fileSummaries,
        options,
        flowMap
      )
      : []),
    ...(enabledPillars.security ? collectSecurityFindings(fileSummaries) : []),
    ...(enabledPillars.testQuality
      ? collectTestQualityFindings(fileSummaries, options)
      : []),
  ];

  for (const detect of detectors) {
    for (const f of detect()) addFinding(f);
  }
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

export type { FindingDraft } from './shared.js';
export { isLikelyEntrypoint } from './shared.js';

export {
  detectTestOnlyModules,
  detectDependencyCycles,
  mergeOverlappingChains,
  detectCriticalPaths,
  detectDeadFiles,
  detectOrphanModules,
  detectUnreachableModules,
} from './cycle.js';

export {
  computeInstability,
  detectSdpViolations,
  detectHighCoupling,
  detectGodModuleCoupling,
  detectLayerViolations,
  computeAbstractness,
  detectDistanceFromMainSequence,
} from './coupling.js';

export {
  detectGodModules,
  detectMegaFolders,
  detectGodFunctions,
  detectLowCohesion,
  computeHotFiles,
  detectUntestedCriticalCode,
  detectFeatureEnvy,
} from './cohesion.js';

export {
  computeBarrelDepth,
  detectBarrelExplosion,
  detectImportSideEffectRisk,
  detectNamespaceImport,
  detectCommonJsInEsm,
  detectExportStarLeak,
} from './import-style.js';

export {
  buildConsumedFromModule,
  detectDeadExports,
  detectDeadReExports,
  detectUnusedNpmDeps,
  detectBoundaryViolations,
} from './dead-code.js';

export {
  detectDuplicateFunctionBodies,
  detectDuplicateFlowStructures,
  detectFunctionOptimization,
  computeCognitiveComplexity,
  detectCognitiveComplexity,
  detectExcessiveParameters,
  detectEmptyCatchBlocks,
  detectSwitchNoDefault,
  detectUnsafeAny,
  detectHighHalsteadEffort,
  detectLowMaintainability,
  detectTypeAssertionEscape,
  detectMessageChains,
  detectMissingErrorBoundary,
  detectPromiseMisuse,
  detectAwaitInLoop,
  detectSyncIo,
  detectUnclearedTimers,
  detectListenerLeakRisk,
  detectUnboundedCollection,
  detectSimilarFunctionBodies,
  detectDeepNesting,
  detectMultipleReturnPaths,
  detectCatchRethrow,
  detectMagicStrings,
  detectBooleanParameterCluster,
  detectPromiseAllUnhandled,
  detectExportSurfaceDensity,
  detectChangeRisk,
} from './code-quality.js';

export {
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
} from './security.js';

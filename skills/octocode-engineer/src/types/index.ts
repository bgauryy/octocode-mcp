export type {
  AnalysisOptions,
  BooleanParamCluster,
  CatchRethrowEntry,
  CodeLocation,
  ConsoleLogEntry,
  ControlMapEntry,
  FlowEntry,
  FlowMapEntry,
  FunctionEntry,
  HalsteadMetrics,
  Location,
  MagicNumberEntry,
  MagicStringEntry,
  MessageChainEntry,
  Metrics,
  PromiseAllUnhandledEntry,
  ReporterFormat,
  Thresholds,
  TreeSitterMetrics,
} from './core.js';

export type {
  Chokepoint,
  CriticalModule,
  CriticalPath,
  Cycle,
  DependencyProfile,
  DependencyRecord,
  DependencyState,
  DependencySummary,
  DuplicateFlowHint,
  DuplicateGroup,
  ExportSymbol,
  FileCriticality,
  FlowMaps,
  HotFile,
  ImportedSymbolRef,
  ModuleCount,
  PackageGraphNode,
  PackageGraphSummary,
  PackageHotspot,
  ReExportRef,
  RedundantFlowGroup,
  SccCluster,
  TestOnlyModule,
  WalkResult,
} from './dependency.js';

export type {
  AnalysisLens,
  AnalysisSignal,
  FlowTraceStep,
  RecommendedValidation,
} from './analysis.js';

export type {
  AgentOutputData,
  Finding,
  FindingStats,
  PillarFindingStats,
  ScanSummaryData,
  TopRecommendation,
} from './findings.js';

export type {
  BoundaryRoleHint,
  CfgFlags,
  EffectProfile,
  FocusedTestCall,
  InputSourceInfo,
  MockControlCall,
  SuspiciousString,
  SymbolUsageSummary,
  TestBlock,
  TestProfile,
  TimerCall,
  TimerControlCall,
  TopLevelEffect,
  TopLevelEffectKind,
} from './collectors.js';

export type {
  NodeBudget,
  NodeTree,
  SyntaxNode,
  TreeEntry,
  TreeSitterFileEntry,
  TreeSitterRuntime,
} from './tree-sitter.js';

export type {
  FileEntry,
  PackageFileSummary,
  PackageInfo,
} from './file-entry.js';

export {
  ALL_CATEGORIES,
  ALLOWED_EXTS,
  DEFAULT_OPTS,
  DEFAULT_THRESHOLDS,
  IMPORT_RESOLVE_EXTS,
  PILLAR_CATEGORIES,
  SEMANTIC_CATEGORIES,
  SEVERITY_ORDER,
  TS_CONTROL_KINDS,
  TS_TREE_SITTER_CONTROL_TYPES,
  TS_TREE_SITTER_FUNCTION_TYPES,
} from './constants.js';

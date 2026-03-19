import type Parser from 'tree-sitter';

export type SyntaxNode = Parser.SyntaxNode;

export interface AnalysisOptions {
  minFunctionStatements: number;
  minFlowStatements: number;
  root: string;
  includeTests: boolean;
  emitTree: boolean;
  json: boolean;
  graph: boolean;
  out: string | null;
  treeDepth: number;
  findingsLimit: number;
  parser: 'auto' | 'typescript' | 'tree-sitter';
  criticalComplexityThreshold: number;
  deepLinkTopN: number;
  packageRoot: string;
  ignoreDirs: Set<string>;
  couplingThreshold: number;
  fanInThreshold: number;
  fanOutThreshold: number;
  godModuleStatements: number;
  godModuleExports: number;
  godFunctionStatements: number;
  cognitiveComplexityThreshold: number;
  barrelSymbolThreshold: number;
  layerOrder: string[];
  parameterThreshold: number;
  halsteadEffortThreshold: number;
  maintainabilityIndexThreshold: number;
  anyThreshold: number;
  flowDupThreshold: number;
  maxRecsPerCategory: number;
  features: Set<string> | null;
  scope: string[] | null;
  scopeSymbols: Map<string, string[]> | null;
  noCache: boolean;
  clearCache: boolean;
  semantic: boolean;
  overrideChainThreshold: number;
  secretEntropyThreshold: number;
  secretMinLength: number;
  similarityThreshold: number;
  mockThreshold: number;
  noDiversify: boolean;
  graphAdvanced: boolean;
  flow: boolean;
}

export interface Location {
  file: string;
  lineStart: number;
  lineEnd: number;
  columnStart: number;
  columnEnd: number;
}

export interface Metrics {
  complexity: number;
  maxBranchDepth: number;
  maxLoopDepth: number;
  returns: number;
  awaits: number;
  calls: number;
  loops: number;
}

export interface HalsteadMetrics {
  operators: number;
  operands: number;
  distinctOperators: number;
  distinctOperands: number;
  vocabulary: number;
  length: number;
  volume: number;
  difficulty: number;
  effort: number;
  time: number;
  estimatedBugs: number;
}

export interface CodeLocation {
  file: string;
  lineStart: number;
  lineEnd: number;
}

export interface MagicNumberEntry extends CodeLocation {
  value: number;
}

export interface TreeSitterMetrics extends Metrics {
  statements: number;
}

export interface FunctionEntry {
  kind: string;
  name: string;
  nameHint: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  columnStart: number;
  columnEnd: number;
  statementCount: number;
  complexity: number;
  maxBranchDepth: number;
  maxLoopDepth: number;
  returns: number;
  awaits: number;
  calls: number;
  loops: number;
  lengthLines: number;
  cognitiveComplexity: number;
  halstead?: HalsteadMetrics;
  maintainabilityIndex?: number;
  declared?: boolean;
  params?: number;
  source?: string;
}

export interface FlowEntry {
  kind: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  columnStart: number;
  columnEnd: number;
  statementCount: number;
}

export interface FlowMapEntry extends FunctionEntry {
  hash: string;
  metrics: Metrics;
}

export interface ControlMapEntry extends FlowEntry {
  hash: string;
}

export interface DependencyProfile {
  internalDependencies: string[];
  externalDependencies: string[];
  unresolvedDependencies: string[];
  declaredExports: ExportSymbol[];
  importedSymbols: ImportedSymbolRef[];
  reExports: ReExportRef[];
  package?: string;
  file?: string;
}

export interface ExportSymbol {
  name: string;
  kind: 'value' | 'type' | 'unknown';
  isDefault?: boolean;
  lineStart?: number;
  lineEnd?: number;
}

export interface ImportedSymbolRef {
  sourceModule: string;
  resolvedModule?: string;
  importedName: string;
  localName: string;
  isTypeOnly: boolean;
  lineStart?: number;
  lineEnd?: number;
}

export interface ReExportRef {
  sourceModule: string;
  resolvedModule?: string;
  exportedAs: string;
  importedName: string;
  isStar: boolean;
  isTypeOnly: boolean;
  lineStart?: number;
  lineEnd?: number;
}

export interface DependencyState {
  files: Set<string>;
  outgoing: Map<string, Set<string>>;
  incoming: Map<string, Set<string>>;
  incomingFromTests: Map<string, Set<string>>;
  incomingFromProduction: Map<string, Set<string>>;
  externalCounts: Map<string, Set<string>>;
  unresolvedCounts: Map<string, Set<string>>;
  declaredExportsByFile: Map<string, ExportSymbol[]>;
  importedSymbolsByFile: Map<string, ImportedSymbolRef[]>;
  reExportsByFile: Map<string, ReExportRef[]>;
}

export interface DependencyRecord {
  file: string;
  outboundCount: number;
  inboundCount: number;
  inboundFromProduction: number;
  inboundFromTests: number;
  externalDependencyCount: number;
  unresolvedDependencyCount: number;
}

export interface FileCriticality {
  file: string;
  complexityRisk: number;
  highComplexityFunctions: number;
  functionCount: number;
  flows: number;
  score: number;
  complexitySum?: number;
}

export interface DuplicateGroup {
  hash: string;
  signature: string;
  kind: string;
  occurrences: number;
  filesCount: number;
  locations: FlowMapEntry[];
}

export interface RedundantFlowGroup {
  kind: string;
  occurrences: number;
  filesCount: number;
  locations: ControlMapEntry[];
}

export interface Cycle {
  path: string[];
  nodeCount: number;
}

export interface CriticalPath {
  start: string;
  path: string[];
  score: number;
  length: number;
  containsCycle: boolean;
}

export interface SccCluster {
  id: string;
  files: string[];
  nodeCount: number;
  edgeCount: number;
  entryEdges: number;
  exitEdges: number;
  hubFiles: string[];
}

export interface Chokepoint {
  file: string;
  score: number;
  reasons: string[];
  fanIn: number;
  fanOut: number;
  articulation: boolean;
  bridgeCount: number;
  cycleClusterCount: number;
  onCriticalPath: boolean;
}

export interface PackageGraphNode {
  package: string;
  inbound: number;
  outbound: number;
  internalFiles: number;
}

export interface PackageHotspot {
  from: string;
  to: string;
  edges: number;
  [key: string]: unknown;
}

export interface PackageGraphSummary {
  packageCount: number;
  edgeCount: number;
  packages: PackageGraphNode[];
  hotspots: PackageHotspot[];
}

export interface DependencySummary {
  totalModules: number;
  totalEdges: number;
  unresolvedEdgeCount: number;
  externalDependencyFiles: number;
  rootsCount: number;
  leavesCount: number;
  roots: string[];
  leaves: string[];
  criticalModules: CriticalModule[];
  testOnlyModules: TestOnlyModule[];
  unresolvedSample: string[];
  outgoingTop: ModuleCount[];
  inboundTop: ModuleCount[];
  cycles: Cycle[];
  criticalPaths: CriticalPath[];
}

export interface CriticalModule extends DependencyRecord {
  score: number;
  riskBand: string;
  [key: string]: unknown;
}

export interface HotFile {
  file: string;
  riskScore: number;
  fanIn: number;
  fanOut: number;
  complexityScore: number;
  exportCount: number;
  inCycle: boolean;
  onCriticalPath: boolean;
}

export interface TestOnlyModule extends DependencyRecord {
  lineStart?: number;
  lineEnd?: number;
}

export interface ModuleCount {
  file: string;
  count: number;
  score: number;
}

interface SuggestedFix {
  strategy: string;
  steps: string[];
}

interface LspHint {
  tool: 'lspFindReferences' | 'lspCallHierarchy' | 'lspGotoDefinition';
  symbolName: string;
  lineHint: number;
  file: string;
  expectedResult: string;
}

export type AnalysisLens = 'graph' | 'ast' | 'hybrid';

export interface RecommendedValidation {
  summary: string;
  tools: string[];
}

export interface FlowTraceStep {
  file: string;
  lineStart: number;
  lineEnd: number;
  label: string;
}

export interface AnalysisSignal {
  kind: string;
  lens: AnalysisLens;
  title: string;
  summary: string;
  confidence: 'high' | 'medium' | 'low';
  score: number;
  files: string[];
  categories: string[];
  evidence: Record<string, unknown>;
}

export interface Finding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  title: string;
  reason: string;
  files: string[];
  suggestedFix: SuggestedFix;
  impact?: string;
  tags?: string[];
  columnStart?: number;
  columnEnd?: number;
  lspHints?: LspHint[];
  ruleId?: string;
  analysisLens?: AnalysisLens;
  confidence?: 'high' | 'medium' | 'low';
  evidence?: Record<string, unknown>;
  correlatedSignals?: string[];
  recommendedValidation?: RecommendedValidation;
  flowTrace?: FlowTraceStep[];
}

export interface NodeTree {
  kind: string;
  startLine: number;
  endLine: number;
  children: NodeTree[];
  truncated?: boolean;
}

export interface TreeEntry {
  package: string;
  file: string;
  tree: NodeTree;
}

export interface SuspiciousString {
  lineStart: number;
  lineEnd: number;
  kind: 'hardcoded-secret' | 'sql-injection' | 'secret-assignment';
  snippet?: string;
  context?:
    | 'literal'
    | 'regex-definition'
    | 'template'
    | 'comment'
    | 'error-message';
}

export interface TimerCall {
  kind: 'setInterval' | 'setTimeout';
  lineStart: number;
  lineEnd: number;
  hasCleanup: boolean;
}

export interface TestBlock {
  name: string;
  lineStart: number;
  lineEnd: number;
  assertionCount: number;
}

export interface FocusedTestCall {
  kind:
    | 'it.only'
    | 'test.only'
    | 'describe.only'
    | 'it.skip'
    | 'test.skip'
    | 'describe.skip'
    | 'it.todo'
    | 'test.todo';
  lineStart: number;
  lineEnd: number;
}

export interface TimerControlCall {
  kind:
    | 'jest.useFakeTimers'
    | 'jest.useRealTimers'
    | 'vi.useFakeTimers'
    | 'vi.useRealTimers'
    | 'other';
  lineStart: number;
  lineEnd: number;
}

export interface MockControlCall extends CodeLocation {
  kind: 'spy' | 'stub' | 'restore' | 'restoreAll';
  target?: string;
}

export interface TestProfile {
  testBlocks: TestBlock[];
  mockCalls: CodeLocation[];
  setupCalls: Array<{
    kind: 'beforeAll' | 'beforeEach' | 'afterAll' | 'afterEach';
    lineStart: number;
  }>;
  mutableStateDecls: CodeLocation[];
  focusedCalls: FocusedTestCall[];
  timerControls: TimerControlCall[];
  mockRestores: MockControlCall[];
  spyOrStubCalls: MockControlCall[];
}

export interface InputSourceInfo {
  functionName: string;
  lineStart: number;
  lineEnd: number;
  sourceParams: string[];
  hasSinkInBody: boolean;
  sinkKinds: string[];
  hasValidation: boolean;
  callsWithInputArgs: Array<{ callee: string; lineStart: number }>;
  paramConfidence: 'high' | 'medium' | 'low';
}

export type TopLevelEffectKind =
  | 'sync-io'
  | 'exec-sync'
  | 'eval'
  | 'timer'
  | 'listener'
  | 'process-handler'
  | 'side-effect-import'
  | 'top-level-await'
  | 'dynamic-import';

export interface TopLevelEffect {
  kind: TopLevelEffectKind;
  lineStart: number;
  lineEnd: number;
  detail: string;
  weight: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface EffectProfile {
  totalEffects: number;
  totalWeight: number;
  byKind: Partial<Record<TopLevelEffectKind, number>>;
  highestRisk: TopLevelEffectKind | null;
}

export interface SymbolUsageSummary {
  declaredExportCount: number;
  importedSymbolCount: number;
  internalImportCount: number;
  externalImportCount: number;
  reExportCount: number;
  dominantInternalDependency: string | null;
}

export interface BoundaryRoleHint {
  role: string;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}

export interface CfgFlags {
  hasValidationChecks: boolean;
  hasCleanupHooks: boolean;
  exitPointCount: number;
  asyncBoundaryCount: number;
  hasTopLevelEffects: boolean;
}

export interface FileEntry {
  package: string;
  file: string;
  parseEngine: string;
  nodeCount: number;
  kindCounts: Record<string, number>;
  functions: FunctionEntry[];
  flows: FlowEntry[];
  dependencyProfile: DependencyProfile;
  emptyCatches?: CodeLocation[];
  switchesWithoutDefault?: CodeLocation[];
  anyCount?: number;
  magicNumbers?: MagicNumberEntry[];
  typeAssertionEscapes?: {
    asAny: CodeLocation[];
    doubleAssertion: CodeLocation[];
    nonNull: CodeLocation[];
  };
  asyncWithoutAwait?: Array<{
    name: string;
    lineStart: number;
    lineEnd: number;
  }>;
  unprotectedAsync?: Array<{
    name: string;
    awaitCount: number;
    lineStart: number;
    lineEnd: number;
  }>;
  evalUsages?: CodeLocation[];
  unsafeHtmlAssignments?: CodeLocation[];
  suspiciousStrings?: SuspiciousString[];
  regexLiterals?: Array<{
    lineStart: number;
    lineEnd: number;
    pattern: string;
  }>;
  awaitInLoopLocations?: CodeLocation[];
  syncIoCalls?: Array<{ name: string; lineStart: number; lineEnd: number }>;
  timerCalls?: TimerCall[];
  listenerRegistrations?: CodeLocation[];
  listenerRemovals?: CodeLocation[];
  testProfile?: TestProfile;
  inputSources?: InputSourceInfo[];
  treeSitterNodeCount?: number;
  treeSitterError?: string;
  parserFallback?: string;
  topLevelEffects?: TopLevelEffect[];
  prototypePollutionSites?: Array<{
    kind: string;
    detail: string;
    lineStart: number;
    lineEnd: number;
    guarded: boolean;
  }>;
  effectProfile?: EffectProfile;
  symbolUsageSummary?: SymbolUsageSummary;
  boundaryRoleHints?: BoundaryRoleHint[];
  cfgFlags?: CfgFlags;
  issueIds?: string[];
}

export interface PackageFileSummary {
  fileCount: number;
  nodeCount: number;
  functionCount: number;
  flowCount: number;
  kindCounts: Record<string, number>;
  functions: FunctionEntry[];
  flows: FlowEntry[];
}

export interface PackageInfo {
  name: string;
  dir: string;
  folder: string;
}

export interface DuplicateFlowHint {
  type: string;
  message: string;
  file: string | undefined;
  lineStart: number | undefined;
  lineEnd: number | undefined;
  details: string;
}

export interface FlowMaps {
  flowMap: Map<string, FlowMapEntry[]>;
  controlMap: Map<string, ControlMapEntry[]>;
}

export interface TreeSitterFileEntry {
  parseEngine: string;
  nodeCount: number;
  functions: FunctionEntry[];
  flows: FlowEntry[];
  tree?: NodeTree;
}

export interface TreeSitterRuntime {
  available: boolean;
  parserTs: Parser | null;
  parserTsx: Parser | null;
  error?: string;
}

export interface NodeBudget {
  size: number;
}


export interface WalkResult {
  path: string[];
  score: number;
  containsCycle: boolean;
}

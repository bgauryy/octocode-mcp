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

export interface ConsoleLogEntry {
  method: string;
  lineStart: number;
  lineEnd: number;
  hasSensitiveArg: boolean;
  argSnippet?: string;
}

export interface MessageChainEntry {
  chain: string;
  depth: number;
  lineStart: number;
  lineEnd: number;
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

export interface Thresholds {
  // Architecture
  couplingThreshold: number;
  fanInThreshold: number;
  fanOutThreshold: number;
  godModuleStatements: number;
  godModuleExports: number;
  barrelSymbolThreshold: number;
  sdpMinDelta: number;
  sdpMaxSourceInstability: number;
  layerOrder: string[];

  // Code quality
  minFunctionStatements: number;
  minFlowStatements: number;
  criticalComplexityThreshold: number;
  godFunctionStatements: number;
  godFunctionMiThreshold: number;
  cognitiveComplexityThreshold: number;
  parameterThreshold: number;
  halsteadEffortThreshold: number;
  maintainabilityIndexThreshold: number;
  anyThreshold: number;
  flowDupThreshold: number;
  similarityThreshold: number;

  // Semantic
  overrideChainThreshold: number;
  shotgunThreshold: number;

  // Security
  secretEntropyThreshold: number;
  secretMinLength: number;

  // Test quality
  mockThreshold: number;
}

export interface AnalysisOptions {
  root: string;
  out: string | null;
  json: boolean;
  packageRoot: string;
  parser: 'auto' | 'typescript' | 'tree-sitter';
  includeTests: boolean;
  emitTree: boolean;
  treeDepth: number;
  noCache: boolean;
  clearCache: boolean;
  semantic: boolean;
  graph: boolean;
  graphAdvanced: boolean;
  flow: boolean;
  scope: string[] | null;
  scopeSymbols: Map<string, string[]> | null;
  features: Set<string> | null;
  ignoreDirs: Set<string>;
  findingsLimit: number;
  noDiversify: boolean;
  maxRecsPerCategory: number;
  deepLinkTopN: number;
  thresholds: Thresholds;
}

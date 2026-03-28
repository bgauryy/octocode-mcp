import type {
  ControlMapEntry,
  FlowMapEntry,
} from './core.js';

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

export interface CriticalModule extends DependencyRecord {
  score: number;
  riskBand: string;
  [key: string]: unknown;
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

export interface WalkResult {
  path: string[];
  score: number;
  containsCycle: boolean;
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

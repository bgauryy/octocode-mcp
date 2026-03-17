import type Parser from 'tree-sitter';
import * as ts from 'typescript';

// ─── Tree-sitter type aliases (official types, zero runtime cost) ────────────

export type SyntaxNode = Parser.SyntaxNode;
export type TreeSitterTree = Parser.Tree;

// ─── Interfaces ──────────────────────────────────────────────────────────────

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

export interface TestOnlyModule extends DependencyRecord {
  lineStart?: number;
  lineEnd?: number;
}

export interface ModuleCount {
  file: string;
  count: number;
  score: number;
}

export interface SuggestedFix {
  strategy: string;
  steps: string[];
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
  columnStart?: number;
  columnEnd?: number;
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

export interface FileEntry {
  package: string;
  file: string;
  parseEngine: string;
  nodeCount: number;
  kindCounts: Record<string, number>;
  functions: FunctionEntry[];
  flows: FlowEntry[];
  dependencyProfile: DependencyProfile;
  treeSitterNodeCount?: number;
  treeSitterError?: string;
  parserFallback?: string;
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

export interface SeverityOrder {
  [key: string]: number;
}

export interface WalkResult {
  path: string[];
  score: number;
  containsCycle: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

import path from 'node:path';

export const DEFAULT_OPTS: AnalysisOptions = {
  minFunctionStatements: 6,
  minFlowStatements: 6,
  root: process.cwd(),
  includeTests: false,
  emitTree: true,
  json: false,
  graph: false,
  out: null,
  treeDepth: 4,
  findingsLimit: 250,
  parser: 'auto',
  criticalComplexityThreshold: 30,
  deepLinkTopN: 12,
  packageRoot: path.join(process.cwd(), 'packages'),
  ignoreDirs: new Set([
    '.git',
    '.next',
    '.yarn',
    '.cache',
    '.octocode',
    'node_modules',
    'dist',
    'coverage',
    'out',
  ]),
};

export const CONTROL_KIND_DUP_THRESHOLD = 3;
export const ALLOWED_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
export const IMPORT_RESOLVE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.d.ts'];

export const TS_CONTROL_KINDS = new Set<number>([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.SwitchStatement,
  ts.SyntaxKind.TryStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ConditionalExpression,
]);

export const TS_TREE_SITTER_CONTROL_TYPES = new Set<string>([
  'if_statement',
  'switch_statement',
  'try_statement',
  'for_statement',
  'while_statement',
  'do_statement',
  'for_in_statement',
  'for_of_statement',
  'for_await_statement',
  'conditional_expression',
  'conditional_expression?',
  'catch_clause',
]);

export const TS_TREE_SITTER_FUNCTION_TYPES = new Set<string>([
  'function_declaration',
  'function',
  'generator_function',
  'generator_function_declaration',
  'method_definition',
  'arrow_function',
  'function_expression',
]);

export const SEVERITY_ORDER: SeverityOrder = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

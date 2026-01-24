#!/usr/bin/env node
//#region src/types.d.ts
interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  module?: string;
  types?: string;
  typings?: string;
  bin?: string | Record<string, string>;
  exports?: ExportsField;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: string[] | {
    packages: string[];
  };
  repository?: string | {
    type: string;
    url: string;
  };
  keywords?: string[];
  author?: string | {
    name: string;
    email?: string;
  };
  license?: string;
}
type ExportsField = string | ExportsObject | (string | ExportsObject)[];
interface ExportsObject {
  [key: string]: string | ExportsObject | null;
}
interface PackageConfig {
  name: string;
  version: string;
  description?: string;
  entryPoints: EntryPoints;
  dependencies: DependencyInfo;
  scripts: Record<string, string>;
  workspaces?: string[];
  repository?: string;
  keywords: string[];
}
interface EntryPoints {
  main?: string;
  module?: string;
  types?: string;
  exports?: Map<string, string>;
  bin?: Map<string, string>;
  all: Set<string>;
}
interface DependencyInfo {
  production: string[];
  development: string[];
  peer: string[];
  all: Set<string>;
}
type SymbolType = 'function' | 'class' | 'interface' | 'type' | 'enum' | 'const' | 'variable' | 'default' | 'unknown';
interface Position {
  line: number;
  column: number;
}
interface ImportInfo {
  specifier: string;
  resolvedPath?: string;
  identifiers: string[];
  isTypeOnly: boolean;
  isDynamic: boolean;
  position: Position;
}
interface ExportInfo {
  name: string;
  type: SymbolType;
  isDefault: boolean;
  isReExport: boolean;
  members?: MemberInfo[];
  jsDoc?: string;
  signature?: string;
  position: Position;
}
interface MemberInfo {
  name: string;
  type: SymbolType;
  isPrivate: boolean;
  isStatic: boolean;
  signature?: string;
}
interface FileNode {
  path: string;
  relativePath: string;
  imports: {
    internal: Map<string, ImportInfo[]>;
    external: Set<string>;
    unresolved: Set<string>;
  };
  exports: ExportInfo[];
  importedBy: Set<string>;
  scripts: Set<string>;
  role: FileRole;
}
type FileRole = 'entry' | 'config' | 'test' | 'util' | 'component' | 'service' | 'type' | 'barrel' | 'unknown';
type ModuleGraph = Map<string, FileNode>;
interface RepoAnalysis {
  metadata: AnalysisMetadata;
  package: PackageConfig;
  publicAPI: PublicAPIEntry[];
  moduleGraph: ModuleGraphSummary;
  dependencies: DependencyAnalysis;
  files: FileAnalysis[];
  insights: AnalysisInsights;
}
interface AnalysisMetadata {
  version: string;
  generatedAt: string;
  repositoryPath: string;
  analysisType: 'full' | 'partial';
  duration: number;
}
interface PublicAPIEntry {
  entryPoint: string;
  exports: ExportInfo[];
}
interface ModuleGraphSummary {
  totalFiles: number;
  totalImports: number;
  totalExports: number;
  internalDependencies: DependencyEdge[];
  externalDependencies: ExternalDependency[];
}
interface DependencyEdge {
  from: string;
  to: string;
  importCount: number;
  identifiers: string[];
}
interface ExternalDependency {
  name: string;
  usedBy: string[];
  isDeclared: boolean;
  isDevOnly: boolean;
}
interface DependencyAnalysis {
  declared: {
    production: string[];
    development: string[];
    peer: string[];
  };
  used: {
    production: string[];
    development: string[];
  };
  unused: string[];
  unlisted: string[];
  misplaced: string[];
}
interface FileAnalysis {
  path: string;
  relativePath: string;
  role: FileRole;
  exportCount: number;
  importCount: number;
  externalImportCount: number;
  linesOfCode: number;
  isBarrel: boolean;
  isEntryPoint: boolean;
}
interface AnalysisInsights {
  unusedExports: UnusedExport[];
  circularDependencies: string[][];
  barrelFiles: string[];
  largestFiles: string[];
  mostImported: MostImportedFile[];
  orphanFiles: string[];
  typeOnlyFiles: string[];
}
interface UnusedExport {
  file: string;
  export: string;
  type: SymbolType;
}
interface MostImportedFile {
  file: string;
  importedByCount: number;
}
interface ExportFlow {
  /** Where the symbol is originally defined */
  definedIn: string;
  /** How it's exported from the source file */
  exportType: 'named' | 'default' | 'namespace';
  /** Re-export chain: barrel files it passes through */
  reExportChain: string[];
  /** Public entry points that expose this symbol */
  publicFrom: string[];
  /** Which package.json export conditions expose it */
  conditions: string[];
}
interface EnhancedExportInfo extends ExportInfo {
  /** Symbol flow tracking */
  flow?: ExportFlow;
  /** For re-exports: original source file */
  originalSource?: string;
  /** Release tag from JSDoc (@public, @internal, @beta, @alpha) */
  releaseTag?: 'public' | 'internal' | 'beta' | 'alpha';
}
interface DependencyUsageLocation {
  file: string;
  symbols: string[];
  isNamespace: boolean;
  isDefault: boolean;
  isTypeOnly: boolean;
  isDynamic: boolean;
}
interface DependencyUsageStats {
  totalImports: number;
  uniqueSymbols: string[];
  filesUsedIn: number;
  typeOnlyCount: number;
}
interface DependencyUsage {
  /** Package name */
  package: string;
  /** Is it declared in dependencies/devDependencies/peerDependencies? */
  declaredAs: 'production' | 'development' | 'peer' | 'unlisted';
  /** All locations where it's imported */
  usageLocations: DependencyUsageLocation[];
  /** Summary stats */
  stats: DependencyUsageStats;
}
interface ArchitectureLayer {
  name: string;
  description: string;
  paths: string[];
  dependsOn: string[];
  files: string[];
  violatedBy?: string[];
}
interface LayerViolation {
  from: string;
  to: string;
  fromLayer: string;
  toLayer: string;
}
interface FeatureBoundary {
  name: string;
  entryPoint: string;
  files: string[];
  externalDeps: string[];
}
interface ArchitectureAnalysis {
  /** Detected architecture pattern */
  pattern: 'layered' | 'feature-based' | 'flat' | 'monorepo' | 'unknown';
  /** Detected layers */
  layers: ArchitectureLayer[];
  /** Layer violations (lower layer importing higher) */
  violations: LayerViolation[];
  /** Feature boundaries (for feature-based architecture) */
  features?: FeatureBoundary[];
}
interface ExportsCondition {
  condition: string;
  target: string;
  resolved?: string;
}
interface ExportsPath {
  path: string;
  conditions: ExportsCondition[];
  exports?: string[];
}
interface ExportsMapAnalysis {
  /** All export paths (., ./utils, ./types, etc.) */
  paths: ExportsPath[];
  /** Wildcards like "./*" */
  wildcards: string[];
  /** Files that are NOT exposed via exports (internal only) */
  internalOnly: string[];
}
interface EnhancedRepoAnalysis extends RepoAnalysis {
  /** Export flow tracking */
  exportFlows?: Record<string, ExportFlow>;
  /** Detailed dependency usage */
  dependencyUsage?: Record<string, DependencyUsage>;
  /** Architecture analysis */
  architecture?: ArchitectureAnalysis;
  /** Package.json exports map analysis */
  exportsMap?: ExportsMapAnalysis;
}
interface AnalysisOptions {
  rootPath: string;
  outputPath?: string;
  includeTests?: boolean;
  includeNodeModules?: boolean;
  tsConfigPath?: string;
  extensions?: string[];
  excludePatterns?: string[];
  /** Enable enhanced analysis features */
  enhanced?: boolean;
}
//#endregion
//#region src/package-analyzer.d.ts
/**
 * Analyze a package.json file
 */
declare function analyzePackageJson(packageJsonPath: string): Promise<PackageConfig>;
/**
 * Check if a directory is a monorepo
 */
declare function isMonorepo(rootPath: string): Promise<boolean>;
/**
 * Analyze the package.json exports field
 */
declare function analyzeExportsMap(packageJson: PackageJson, rootPath: string, graph?: ModuleGraph): ExportsMapAnalysis;
//#endregion
//#region src/module-graph.d.ts
/**
 * Build the module graph from a TypeScript/JavaScript project
 */
declare function buildModuleGraph(options: AnalysisOptions): Promise<ModuleGraph>;
/**
 * Build export flows for all exports in the graph
 */
declare function buildExportFlows(graph: ModuleGraph, entryPaths: Set<string>): Map<string, ExportFlow>;
//#endregion
//#region src/dependency-analyzer.d.ts
/**
 * Analyze dependencies comparing declared vs used
 */
declare function analyzeDependencies(graph: ModuleGraph, declaredDeps: DependencyInfo): DependencyAnalysis;
/**
 * Find circular dependencies in the module graph
 */
declare function findCircularDependencies(graph: ModuleGraph): string[][];
/**
 * Find unused exports in the module graph
 */
declare function findUnusedExports(graph: ModuleGraph, entryPoints: Set<string>): UnusedExport[];
/**
 * Analyze detailed dependency usage - which symbols are imported from each package
 */
declare function analyzeDetailedDependencyUsage(graph: ModuleGraph, declaredDeps: DependencyInfo): Map<string, DependencyUsage>;
/**
 * Detect architecture pattern and analyze layers
 */
declare function detectArchitecture(graph: ModuleGraph): ArchitectureAnalysis;
//#endregion
//#region src/index.d.ts
/**
 * Analyze a repository/package and output documentation
 *
 * @param repoPath - Path to the repository root (must contain package.json)
 * @param outputPath - Path to output the analysis results (optional, defaults to scripts/)
 * @param options - Additional analysis options
 * @returns The complete analysis result with enhanced features
 *
 * @example
 * ```typescript
 * const analysis = await analyzeRepository('/path/to/repo', '/path/to/output');
 * console.log(analysis.package.name);
 * console.log(analysis.insights.unusedExports);
 * console.log(analysis.exportFlows); // NEW: Export flow tracking
 * console.log(analysis.architecture); // NEW: Architecture detection
 * ```
 */
declare function analyzeRepository(repoPath: string, outputPath?: string, options?: Partial<AnalysisOptions>): Promise<EnhancedRepoAnalysis>;
/**
 * Quick analysis - returns just the analysis without writing files
 */
declare function quickAnalyze(repoPath: string, options?: Partial<AnalysisOptions>): Promise<EnhancedRepoAnalysis>;
//#endregion
export { AnalysisInsights, AnalysisMetadata, AnalysisOptions, ArchitectureAnalysis, ArchitectureLayer, DependencyAnalysis, DependencyEdge, DependencyInfo, DependencyUsage, DependencyUsageLocation, DependencyUsageStats, EnhancedExportInfo, EnhancedRepoAnalysis, EntryPoints, ExportFlow, ExportInfo, ExportsCondition, ExportsField, ExportsMapAnalysis, ExportsObject, ExportsPath, ExternalDependency, FeatureBoundary, FileAnalysis, FileNode, FileRole, ImportInfo, LayerViolation, MemberInfo, ModuleGraph, ModuleGraphSummary, MostImportedFile, PackageConfig, PackageJson, Position, PublicAPIEntry, RepoAnalysis, SymbolType, UnusedExport, analyzeDependencies, analyzeDetailedDependencyUsage, analyzeExportsMap, analyzePackageJson, analyzeRepository, buildExportFlows, buildModuleGraph, detectArchitecture, findCircularDependencies, findUnusedExports, isMonorepo, quickAnalyze };
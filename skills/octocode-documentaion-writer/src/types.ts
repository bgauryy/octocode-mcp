/**
 * Type definitions for repository analysis
 * Based on Knip's architecture patterns
 */

// ============================================================================
// Package Configuration Types
// ============================================================================

export interface PackageJson {
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
  workspaces?: string[] | { packages: string[] };
  repository?: string | { type: string; url: string };
  keywords?: string[];
  author?: string | { name: string; email?: string };
  license?: string;
}

export type ExportsField = string | ExportsObject | (string | ExportsObject)[];

export interface ExportsObject {
  [key: string]: string | ExportsObject | null;
}

export interface PackageConfig {
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

export interface EntryPoints {
  main?: string;
  module?: string;
  types?: string;
  exports?: Map<string, string>;
  bin?: Map<string, string>;
  all: Set<string>;
}

export interface DependencyInfo {
  production: string[];
  development: string[];
  peer: string[];
  all: Set<string>;
}

// ============================================================================
// Module Graph Types (based on Knip's architecture)
// ============================================================================

export type SymbolType =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'const'
  | 'variable'
  | 'default'
  | 'unknown';

export interface Position {
  line: number;
  column: number;
}

export interface ImportInfo {
  specifier: string;
  resolvedPath?: string;
  identifiers: string[];
  isTypeOnly: boolean;
  isDynamic: boolean;
  position: Position;
}

export interface ExportInfo {
  name: string;
  type: SymbolType;
  isDefault: boolean;
  isReExport: boolean;
  members?: MemberInfo[];
  jsDoc?: string;
  signature?: string;
  position: Position;
}

export interface MemberInfo {
  name: string;
  type: SymbolType;
  isPrivate: boolean;
  isStatic: boolean;
  signature?: string;
}

export interface FileNode {
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

export type FileRole =
  | 'entry'
  | 'config'
  | 'test'
  | 'util'
  | 'component'
  | 'service'
  | 'type'
  | 'barrel'
  | 'unknown';

export type ModuleGraph = Map<string, FileNode>;

// ============================================================================
// Analysis Output Types
// ============================================================================

export interface RepoAnalysis {
  metadata: AnalysisMetadata;
  package: PackageConfig;
  publicAPI: PublicAPIEntry[];
  moduleGraph: ModuleGraphSummary;
  dependencies: DependencyAnalysis;
  files: FileAnalysis[];
  insights: AnalysisInsights;
}

export interface AnalysisMetadata {
  version: string;
  generatedAt: string;
  repositoryPath: string;
  analysisType: 'full' | 'partial';
  duration: number;
}

export interface PublicAPIEntry {
  entryPoint: string;
  exports: ExportInfo[];
}

export interface ModuleGraphSummary {
  totalFiles: number;
  totalImports: number;
  totalExports: number;
  internalDependencies: DependencyEdge[];
  externalDependencies: ExternalDependency[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  importCount: number;
  identifiers: string[];
}

export interface ExternalDependency {
  name: string;
  usedBy: string[];
  isDeclared: boolean;
  isDevOnly: boolean;
}

export interface DependencyAnalysis {
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
  misplaced: string[]; // prod deps only used in tests
}

export interface FileAnalysis {
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

export interface AnalysisInsights {
  unusedExports: UnusedExport[];
  circularDependencies: string[][];
  barrelFiles: string[];
  largestFiles: string[];
  mostImported: MostImportedFile[];
  orphanFiles: string[];
  typeOnlyFiles: string[];
}

export interface UnusedExport {
  file: string;
  export: string;
  type: SymbolType;
}

export interface MostImportedFile {
  file: string;
  importedByCount: number;
}

// ============================================================================
// Analysis Options
// ============================================================================

export interface AnalysisOptions {
  rootPath: string;
  outputPath?: string;
  includeTests?: boolean;
  includeNodeModules?: boolean;
  tsConfigPath?: string;
  extensions?: string[];
  excludePatterns?: string[];
}

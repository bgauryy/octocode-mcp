import * as path from 'path';
import * as fs from 'fs';
import type { EnhancedRepoAnalysis, AnalysisOptions, PackageJson } from './types.js';
import {
  analyzePackageJson,
  isMonorepo,
  analyzeExportsMap,
} from './package-analyzer.js';
import { buildModuleGraph, markEntryPoints, buildExportFlows } from './module-graph.js';
import { analyzeDependencies, analyzeDetailedDependencyUsage, detectArchitecture } from './dependency-analyzer.js';
import { generateAnalysisOutput, writeAnalysisOutput } from './output.js';

export * from './types.js';
export { analyzePackageJson, isMonorepo, analyzeExportsMap } from './package-analyzer.js';
export { buildModuleGraph, buildExportFlows } from './module-graph.js';
export {
  analyzeDependencies,
  findCircularDependencies,
  findUnusedExports,
  analyzeDetailedDependencyUsage,
  detectArchitecture,
} from './dependency-analyzer.js';

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
export async function analyzeRepository(
  repoPath: string,
  outputPath?: string,
  options: Partial<AnalysisOptions> = {}
): Promise<EnhancedRepoAnalysis> {
  const startTime = Date.now();

  // Resolve paths
  const rootPath = path.resolve(repoPath);
  const outputDir = outputPath
    ? path.resolve(outputPath)
    : path.join(rootPath, 'scripts');

  // Validate repository path
  const packageJsonPath = path.join(rootPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`No package.json found at ${rootPath}`);
  }

  console.log(`📦 Analyzing repository: ${rootPath}`);

  // Phase 1: Configuration Discovery
  console.log('🔍 Phase 1: Discovering configuration...');
  const packageJsonContent = await fs.promises.readFile(packageJsonPath, 'utf-8');
  const packageJson: PackageJson = JSON.parse(packageJsonContent);
  const packageConfig = await analyzePackageJson(packageJsonPath);
  console.log(`   Package: ${packageConfig.name}@${packageConfig.version}`);
  console.log(`   Entry points: ${packageConfig.entryPoints.all.size}`);
  console.log(`   Dependencies: ${packageConfig.dependencies.all.size}`);

  // Check for monorepo
  const isMonorepoProject = await isMonorepo(rootPath);
  if (isMonorepoProject) {
    console.log(`   📁 Monorepo detected with workspaces: ${packageConfig.workspaces?.join(', ')}`);
  }

  // Phase 2: Build Module Graph
  console.log('🔨 Phase 2: Building module graph...');
  const analysisOptions: AnalysisOptions = {
    rootPath,
    outputPath: outputDir,
    includeTests: options.includeTests ?? false,
    extensions: options.extensions ?? ['.ts', '.tsx', '.js', '.jsx'],
    excludePatterns: options.excludePatterns ?? [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
    ],
    ...options,
  };

  const moduleGraph = await buildModuleGraph(analysisOptions);
  console.log(`   Files analyzed: ${moduleGraph.size}`);

  // Mark entry points
  markEntryPoints(moduleGraph, packageConfig.entryPoints.all, rootPath);

  // Count exports and imports
  let totalExports = 0;
  let totalInternalImports = 0;
  let totalExternalImports = 0;

  for (const fileNode of moduleGraph.values()) {
    totalExports += fileNode.exports.length;
    totalInternalImports += fileNode.imports.internal.size;
    totalExternalImports += fileNode.imports.external.size;
  }

  console.log(`   Total exports: ${totalExports}`);
  console.log(`   Internal imports: ${totalInternalImports}`);
  console.log(`   External imports: ${totalExternalImports}`);

  // Phase 3: Analyze Dependencies
  console.log('📊 Phase 3: Analyzing dependencies...');
  const dependencyAnalysis = analyzeDependencies(moduleGraph, packageConfig.dependencies);
  console.log(`   Unused dependencies: ${dependencyAnalysis.unused.length}`);
  console.log(`   Unlisted dependencies: ${dependencyAnalysis.unlisted.length}`);
  console.log(`   Misplaced dependencies: ${dependencyAnalysis.misplaced.length}`);

  // Phase 4: Enhanced Analysis
  console.log('🔬 Phase 4: Enhanced analysis...');
  const architecture = detectArchitecture(moduleGraph);
  console.log(`   Architecture pattern: ${architecture.pattern}`);
  console.log(`   Layers detected: ${architecture.layers.length}`);
  console.log(`   Layer violations: ${architecture.violations.length}`);

  // Phase 5: Generate Output
  console.log('📝 Phase 5: Generating output...');
  const analysis = generateAnalysisOutput(
    moduleGraph,
    packageConfig,
    dependencyAnalysis,
    rootPath,
    startTime,
    packageJson
  );

  // Write output files
  await writeAnalysisOutput(analysis, outputDir);

  const duration = Date.now() - startTime;
  console.log(`\n✅ Analysis complete in ${duration}ms`);
  console.log(`📁 Output written to: ${outputDir}`);
  console.log(`   - analysis.json`);
  if (analysis.files.length > 300) {
    console.log(`   - static-analysis-files-*.json (split chunks)`);
  }
  console.log(`   - ANALYSIS_SUMMARY.md`);
  console.log(`   - PUBLIC_API.md`);
  console.log(`   - DEPENDENCIES.md`);
  console.log(`   - INSIGHTS.md`);
  console.log(`   - MODULE_GRAPH.md`);
  console.log(`   - EXPORT_FLOWS.md (NEW)`);
  console.log(`   - ARCHITECTURE.md (NEW)`);
  console.log(`   - DEPENDENCY_USAGE.md (NEW)`);

  return analysis;
}

/**
 * Quick analysis - returns just the analysis without writing files
 */
export async function quickAnalyze(
  repoPath: string,
  options: Partial<AnalysisOptions> = {}
): Promise<EnhancedRepoAnalysis> {
  const startTime = Date.now();
  const rootPath = path.resolve(repoPath);

  const packageJsonPath = path.join(rootPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`No package.json found at ${rootPath}`);
  }

  const packageJsonContent = await fs.promises.readFile(packageJsonPath, 'utf-8');
  const packageJson: PackageJson = JSON.parse(packageJsonContent);
  const packageConfig = await analyzePackageJson(packageJsonPath);
  const moduleGraph = await buildModuleGraph({
    rootPath,
    ...options,
  });

  markEntryPoints(moduleGraph, packageConfig.entryPoints.all, rootPath);
  const dependencyAnalysis = analyzeDependencies(moduleGraph, packageConfig.dependencies);

  return generateAnalysisOutput(
    moduleGraph,
    packageConfig,
    dependencyAnalysis,
    rootPath,
    startTime,
    packageJson
  );
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Repository Analyzer - Analyze TypeScript/JavaScript projects

Usage:
  npx ts-node src/index.ts <repo-path> [output-path]

Arguments:
  repo-path    Path to the repository root (must contain package.json)
  output-path  Optional path for output files (defaults to scripts/)

Example:
  npx ts-node src/index.ts ./my-project ./analysis-output
`);
    process.exit(0);
  }

  const repoPath = args[0];
  const outputPath = args[1];

  try {
    await analyzeRepository(repoPath, outputPath);
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

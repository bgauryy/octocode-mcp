import type {
  ModuleGraph,
  DependencyInfo,
  DependencyAnalysis,
  DependencyEdge,
  ExternalDependency,
  UnusedExport,
  DependencyUsage,
  DependencyUsageLocation,
  ArchitectureAnalysis,
  ArchitectureLayer,
  LayerViolation,
} from './types.js';

/**
 * Build a list of internal dependency edges from the module graph
 */
export function buildInternalDependencies(graph: ModuleGraph): DependencyEdge[] {
  const edges: DependencyEdge[] = [];

  for (const [_filePath, fileNode] of graph) {
    for (const [importedPath, imports] of fileNode.imports.internal) {
      const identifiers = imports.flatMap((i) => i.identifiers);
      edges.push({
        from: fileNode.relativePath,
        to: graph.get(importedPath)?.relativePath || importedPath,
        importCount: imports.length,
        identifiers,
      });
    }
  }

  return edges;
}

/**
 * Build a list of external dependencies with usage info
 */
export function buildExternalDependencies(
  graph: ModuleGraph,
  declaredDeps: DependencyInfo
): ExternalDependency[] {
  const usageMap = new Map<string, Set<string>>();

  // Collect usage from all files
  for (const [_filePath, fileNode] of graph) {
    for (const pkgName of fileNode.imports.external) {
      if (!usageMap.has(pkgName)) {
        usageMap.set(pkgName, new Set());
      }
      usageMap.get(pkgName)!.add(fileNode.relativePath);
    }
  }

  const dependencies: ExternalDependency[] = [];

  // Add all used dependencies
  for (const [pkgName, usedBy] of usageMap) {
    dependencies.push({
      name: pkgName,
      usedBy: Array.from(usedBy),
      isDeclared: declaredDeps.all.has(pkgName),
      isDevOnly: isDevOnlyDependency(pkgName, usedBy, graph),
    });
  }

  return dependencies;
}

/**
 * Check if a dependency is only used in dev/test files
 */
function isDevOnlyDependency(
  _pkgName: string,
  usedBy: Set<string>,
  graph: ModuleGraph
): boolean {
  for (const filePath of usedBy) {
    const fileNode = Array.from(graph.values()).find(
      (f) => f.relativePath === filePath
    );
    if (fileNode && fileNode.role !== 'test' && fileNode.role !== 'config') {
      return false;
    }
  }
  return true;
}

/**
 * Analyze dependencies comparing declared vs used
 */
export function analyzeDependencies(
  graph: ModuleGraph,
  declaredDeps: DependencyInfo
): DependencyAnalysis {
  const usedExternal = new Set<string>();
  const usedInTests = new Set<string>();
  const usedInProd = new Set<string>();

  // Collect all used external dependencies
  for (const [_filePath, fileNode] of graph) {
    for (const pkgName of fileNode.imports.external) {
      usedExternal.add(pkgName);

      if (fileNode.role === 'test') {
        usedInTests.add(pkgName);
      } else {
        usedInProd.add(pkgName);
      }
    }
  }

  // Find unused dependencies
  const unused: string[] = [];
  for (const dep of declaredDeps.production) {
    if (!usedExternal.has(dep)) {
      unused.push(dep);
    }
  }
  for (const dep of declaredDeps.development) {
    if (!usedExternal.has(dep)) {
      unused.push(dep);
    }
  }

  // Find unlisted dependencies (used but not declared)
  const unlisted: string[] = [];
  for (const pkg of usedExternal) {
    if (!declaredDeps.all.has(pkg)) {
      // Skip Node.js built-ins
      if (!isBuiltinModule(pkg)) {
        unlisted.push(pkg);
      }
    }
  }

  // Find misplaced dependencies (prod deps only used in tests)
  const misplaced: string[] = [];
  for (const dep of declaredDeps.production) {
    if (usedInTests.has(dep) && !usedInProd.has(dep)) {
      misplaced.push(dep);
    }
  }

  return {
    declared: {
      production: declaredDeps.production,
      development: declaredDeps.development,
      peer: declaredDeps.peer,
    },
    used: {
      production: Array.from(usedInProd),
      development: Array.from(usedInTests),
    },
    unused,
    unlisted,
    misplaced,
  };
}

/**
 * Check if a module is a Node.js built-in
 */
function isBuiltinModule(moduleName: string): boolean {
  const builtins = new Set([
    'assert',
    'async_hooks',
    'buffer',
    'child_process',
    'cluster',
    'console',
    'constants',
    'crypto',
    'dgram',
    'dns',
    'domain',
    'events',
    'fs',
    'http',
    'http2',
    'https',
    'inspector',
    'module',
    'net',
    'os',
    'path',
    'perf_hooks',
    'process',
    'punycode',
    'querystring',
    'readline',
    'repl',
    'stream',
    'string_decoder',
    'timers',
    'tls',
    'trace_events',
    'tty',
    'url',
    'util',
    'v8',
    'vm',
    'wasi',
    'worker_threads',
    'zlib',
  ]);

  // Handle node: prefix
  const name = moduleName.startsWith('node:')
    ? moduleName.slice(5)
    : moduleName;

  return builtins.has(name);
}

/**
 * Find circular dependencies in the module graph
 */
export function findCircularDependencies(graph: ModuleGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const pathStack: string[] = [];

  function dfs(filePath: string): void {
    visited.add(filePath);
    recursionStack.add(filePath);
    pathStack.push(filePath);

    const fileNode = graph.get(filePath);
    if (fileNode) {
      for (const importedPath of fileNode.imports.internal.keys()) {
        if (!visited.has(importedPath)) {
          dfs(importedPath);
        } else if (recursionStack.has(importedPath)) {
          // Found a cycle
          const cycleStart = pathStack.indexOf(importedPath);
          const cycle = pathStack.slice(cycleStart).map((p) => {
            const node = graph.get(p);
            return node?.relativePath || p;
          });
          cycle.push(graph.get(importedPath)?.relativePath || importedPath);
          cycles.push(cycle);
        }
      }
    }

    pathStack.pop();
    recursionStack.delete(filePath);
  }

  for (const filePath of graph.keys()) {
    if (!visited.has(filePath)) {
      dfs(filePath);
    }
  }

  return cycles;
}

/**
 * Find unused exports in the module graph
 */
export function findUnusedExports(
  graph: ModuleGraph,
  entryPoints: Set<string>
): UnusedExport[] {
  const unused: UnusedExport[] = [];

  // Build a map of all imported identifiers per file
  const importedIdentifiers = new Map<string, Set<string>>();

  for (const [_filePath, fileNode] of graph) {
    for (const [importedPath, imports] of fileNode.imports.internal) {
      if (!importedIdentifiers.has(importedPath)) {
        importedIdentifiers.set(importedPath, new Set());
      }
      const identifiers = importedIdentifiers.get(importedPath)!;
      for (const imp of imports) {
        for (const id of imp.identifiers) {
          // Handle namespace imports
          if (id.startsWith('* as ')) {
            // Namespace import - assume all exports are used
            const node = graph.get(importedPath);
            if (node) {
              for (const exp of node.exports) {
                identifiers.add(exp.name);
              }
            }
          } else {
            identifiers.add(id);
          }
        }
      }
    }
  }

  // Check each file's exports
  for (const [filePath, fileNode] of graph) {
    // Skip entry points - their exports are considered "used" by definition
    if (entryPoints.has(filePath)) {
      continue;
    }

    // Skip barrel files - they're meant to re-export
    if (fileNode.role === 'barrel') {
      continue;
    }

    const usedIdentifiers = importedIdentifiers.get(filePath) || new Set();

    for (const exp of fileNode.exports) {
      // Skip re-exports
      if (exp.isReExport) {
        continue;
      }

      // Check if export is used
      if (!usedIdentifiers.has(exp.name) && !usedIdentifiers.has('default')) {
        unused.push({
          file: fileNode.relativePath,
          export: exp.name,
          type: exp.type,
        });
      }
    }
  }

  return unused;
}

/**
 * Find barrel files (index files that mainly re-export)
 */
export function findBarrelFiles(graph: ModuleGraph): string[] {
  const barrels: string[] = [];

  for (const [_filePath, fileNode] of graph) {
    if (fileNode.role === 'barrel') {
      barrels.push(fileNode.relativePath);
    }
  }

  return barrels;
}

/**
 * Find the most imported files
 */
export function findMostImportedFiles(
  graph: ModuleGraph,
  limit = 10
): { file: string; importedByCount: number }[] {
  const files = Array.from(graph.values())
    .map((node) => ({
      file: node.relativePath,
      importedByCount: node.importedBy.size,
    }))
    .filter((f) => f.importedByCount > 0)
    .sort((a, b) => b.importedByCount - a.importedByCount)
    .slice(0, limit);

  return files;
}

/**
 * Find orphan files (not imported by anyone and not entry points)
 */
export function findOrphanFiles(
  graph: ModuleGraph,
  entryPoints: Set<string>
): string[] {
  const orphans: string[] = [];

  for (const [filePath, fileNode] of graph) {
    if (
      fileNode.importedBy.size === 0 &&
      !entryPoints.has(filePath) &&
      fileNode.role !== 'entry' &&
      fileNode.role !== 'test' &&
      fileNode.role !== 'config'
    ) {
      orphans.push(fileNode.relativePath);
    }
  }

  return orphans;
}

/**
 * Find type-only files (files that only export types)
 */
export function findTypeOnlyFiles(graph: ModuleGraph): string[] {
  const typeOnly: string[] = [];

  for (const [_filePath, fileNode] of graph) {
    if (fileNode.exports.length === 0) {
      continue;
    }

    const hasValueExport = fileNode.exports.some(
      (exp) =>
        exp.type !== 'type' &&
        exp.type !== 'interface' &&
        !exp.isReExport
    );

    if (!hasValueExport) {
      typeOnly.push(fileNode.relativePath);
    }
  }

  return typeOnly;
}

// ============================================================================
// Detailed Dependency Usage Analysis (Priority 2)
// ============================================================================

/**
 * Get the declared type for a package
 */
function getDeclaredType(
  pkgName: string,
  declaredDeps: DependencyInfo
): DependencyUsage['declaredAs'] {
  if (declaredDeps.production.includes(pkgName)) return 'production';
  if (declaredDeps.development.includes(pkgName)) return 'development';
  if (declaredDeps.peer.includes(pkgName)) return 'peer';
  return 'unlisted';
}

/**
 * Analyze detailed dependency usage - which symbols are imported from each package
 */
export function analyzeDetailedDependencyUsage(
  graph: ModuleGraph,
  declaredDeps: DependencyInfo
): Map<string, DependencyUsage> {
  const usage = new Map<string, DependencyUsage>();

  for (const [_filePath, node] of graph) {
    for (const externalPkg of node.imports.external) {
      // Get or create usage entry
      let depUsage = usage.get(externalPkg);
      if (!depUsage) {
        depUsage = {
          package: externalPkg,
          declaredAs: getDeclaredType(externalPkg, declaredDeps),
          usageLocations: [],
          stats: {
            totalImports: 0,
            uniqueSymbols: [],
            filesUsedIn: 0,
            typeOnlyCount: 0,
          },
        };
        usage.set(externalPkg, depUsage);
      }

      // Extract import details from the internal imports map
      // Note: External packages are tracked separately, so we infer from file context
      const usageLocation: DependencyUsageLocation = {
        file: node.relativePath,
        symbols: [], // Would need AST re-analysis for full symbol extraction
        isNamespace: false,
        isDefault: false,
        isTypeOnly: false,
        isDynamic: false,
      };

      depUsage.usageLocations.push(usageLocation);
    }
  }

  // Calculate stats for each dependency
  for (const [_pkg, depUsage] of usage) {
    const allSymbols = depUsage.usageLocations.flatMap((l) => l.symbols);
    depUsage.stats = {
      totalImports: depUsage.usageLocations.length,
      uniqueSymbols: [...new Set(allSymbols)],
      filesUsedIn: new Set(depUsage.usageLocations.map((l) => l.file)).size,
      typeOnlyCount: depUsage.usageLocations.filter((l) => l.isTypeOnly).length,
    };
  }

  return usage;
}

// ============================================================================
// Architecture Layer Detection (Priority 4)
// ============================================================================

const DEFAULT_LAYERS: Omit<ArchitectureLayer, 'files'>[] = [
  {
    name: 'presentation',
    paths: ['**/components/**', '**/pages/**', '**/views/**', '**/ui/**'],
    dependsOn: ['domain', 'infrastructure', 'shared'],
    description: 'UI layer - components, pages, views',
  },
  {
    name: 'domain',
    paths: ['**/domain/**', '**/models/**', '**/entities/**', '**/core/**'],
    dependsOn: ['shared'],
    description: 'Business logic - domain models, entities',
  },
  {
    name: 'infrastructure',
    paths: ['**/services/**', '**/api/**', '**/repositories/**', '**/adapters/**'],
    dependsOn: ['domain', 'shared'],
    description: 'External services - APIs, repositories',
  },
  {
    name: 'shared',
    paths: ['**/utils/**', '**/helpers/**', '**/lib/**', '**/types/**', '**/common/**'],
    dependsOn: [],
    description: 'Shared utilities - types, helpers',
  },
];

/**
 * Match a file path against a glob pattern
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  const normalizedPattern = pattern.replace(/\\/g, '/').toLowerCase();

  // Convert glob to regex
  const regex = new RegExp(
    normalizedPattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\./g, '\\.')
  );

  return regex.test(normalizedPath);
}

/**
 * Detect the architecture pattern based on directory structure
 */
function detectArchitecturePattern(
  graph: ModuleGraph
): ArchitectureAnalysis['pattern'] {
  const paths = [...graph.values()].map((n) => n.relativePath.replace(/\\/g, '/'));

  // Check for monorepo
  if (paths.some((p) => p.includes('/packages/') || p.includes('/apps/'))) {
    return 'monorepo';
  }

  // Check for feature-based (features/, modules/)
  if (paths.some((p) => p.includes('/features/') || p.includes('/modules/'))) {
    return 'feature-based';
  }

  // Check for layered (components/, services/, utils/)
  const hasComponents = paths.some((p) => p.includes('/components/'));
  const hasServices = paths.some((p) => p.includes('/services/'));
  const hasUtils = paths.some((p) => p.includes('/utils/'));
  if (hasComponents && (hasServices || hasUtils)) {
    return 'layered';
  }

  // Check for flat (all in src/ with minimal nesting)
  const srcPaths = paths.filter((p) => p.startsWith('src/'));
  if (srcPaths.length > 0) {
    const maxDepth = Math.max(...srcPaths.map((p) => p.split('/').length));
    if (maxDepth <= 3) {
      return 'flat';
    }
  }

  return 'unknown';
}

/**
 * Assign files to architecture layers
 */
function assignFilesToLayers(
  graph: ModuleGraph,
  layerDefs: Omit<ArchitectureLayer, 'files'>[]
): ArchitectureLayer[] {
  const layers: ArchitectureLayer[] = layerDefs.map((def) => ({
    ...def,
    files: [],
  }));

  for (const [_filePath, node] of graph) {
    const relativePath = node.relativePath;

    for (const layer of layers) {
      const matches = layer.paths.some((pattern) =>
        matchesPattern(relativePath, pattern)
      );
      if (matches) {
        layer.files.push(relativePath);
        break; // File belongs to first matching layer
      }
    }
  }

  return layers;
}

/**
 * Find layer violations where lower layers import from higher layers
 */
function findLayerViolations(
  graph: ModuleGraph,
  layers: ArchitectureLayer[]
): LayerViolation[] {
  const violations: LayerViolation[] = [];

  // Build file-to-layer mapping
  const fileToLayer = new Map<string, string>();
  for (const layer of layers) {
    for (const file of layer.files) {
      fileToLayer.set(file, layer.name);
    }
  }

  // Build layer dependency rules
  const layerAllowedDeps = new Map<string, Set<string>>();
  for (const layer of layers) {
    layerAllowedDeps.set(layer.name, new Set([layer.name, ...layer.dependsOn]));
  }

  // Check each import for violations
  for (const [_filePath, node] of graph) {
    const fromLayer = fileToLayer.get(node.relativePath);
    if (!fromLayer) continue;

    const allowedDeps = layerAllowedDeps.get(fromLayer);
    if (!allowedDeps) continue;

    for (const [importedPath, _imports] of node.imports.internal) {
      const importedNode = graph.get(importedPath);
      if (!importedNode) continue;

      const toLayer = fileToLayer.get(importedNode.relativePath);
      if (!toLayer) continue;

      // Check if this is a violation
      if (!allowedDeps.has(toLayer)) {
        violations.push({
          from: node.relativePath,
          to: importedNode.relativePath,
          fromLayer,
          toLayer,
        });
      }
    }
  }

  return violations;
}

/**
 * Detect architecture pattern and analyze layers
 */
export function detectArchitecture(graph: ModuleGraph): ArchitectureAnalysis {
  const pattern = detectArchitecturePattern(graph);
  const layers = assignFilesToLayers(graph, DEFAULT_LAYERS);
  const violations = findLayerViolations(graph, layers);

  // Mark layers with violations
  for (const layer of layers) {
    layer.violatedBy = violations
      .filter((v) => v.toLayer === layer.name)
      .map((v) => v.from);
  }

  return {
    pattern,
    layers: layers.filter((l) => l.files.length > 0), // Only include layers with files
    violations,
  };
}

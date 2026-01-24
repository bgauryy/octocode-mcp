import * as fs from 'fs';
import * as path from 'path';
import type {
  PackageJson,
  PackageConfig,
  EntryPoints,
  DependencyInfo,
  ExportsField,
  ExportsMapAnalysis,
  ExportsPath,
  ModuleGraph,
} from './types.js';

/**
 * Recursively extract entry paths from the exports field
 */
function extractEntriesFromExports(
  obj: ExportsField,
  entries: Set<string>,
  prefix = ''
): void {
  if (typeof obj === 'string') {
    // Skip negated entries
    if (!obj.startsWith('!')) {
      entries.add(obj);
    }
    return;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractEntriesFromExports(item, entries, prefix);
    }
    return;
  }

  if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (value === null) {
        // null means this export is intentionally hidden
        entries.add(`!${key}`);
      } else if (typeof value === 'string') {
        entries.add(value);
      } else if (typeof value === 'object') {
        extractEntriesFromExports(value as ExportsField, entries, key);
      }
    }
  }
}

/**
 * Get entry points from package.json
 */
function getEntryPoints(manifest: PackageJson): EntryPoints {
  const all = new Set<string>();
  const exportsMap = new Map<string, string>();
  const binMap = new Map<string, string>();

  // Main entry
  if (manifest.main) {
    all.add(manifest.main);
  }

  // ESM entry
  if (manifest.module) {
    all.add(manifest.module);
  }

  // Types entry
  if (manifest.types) {
    all.add(manifest.types);
  }
  if (manifest.typings) {
    all.add(manifest.typings);
  }

  // Binary entries
  if (manifest.bin) {
    if (typeof manifest.bin === 'string') {
      all.add(manifest.bin);
      binMap.set(manifest.name || 'default', manifest.bin);
    } else {
      for (const [name, binPath] of Object.entries(manifest.bin)) {
        all.add(binPath);
        binMap.set(name, binPath);
      }
    }
  }

  // Exports field (complex nested structure)
  if (manifest.exports) {
    const exportEntries = new Set<string>();
    extractEntriesFromExports(manifest.exports, exportEntries);

    for (const entry of exportEntries) {
      if (!entry.startsWith('!')) {
        all.add(entry);
        // Try to extract the export key
        if (typeof manifest.exports === 'object' && !Array.isArray(manifest.exports)) {
          for (const [key, value] of Object.entries(manifest.exports)) {
            if (value === entry || (typeof value === 'object' && JSON.stringify(value).includes(entry))) {
              exportsMap.set(key, entry);
            }
          }
        }
      }
    }
  }

  return {
    main: manifest.main,
    module: manifest.module,
    types: manifest.types || manifest.typings,
    exports: exportsMap.size > 0 ? exportsMap : undefined,
    bin: binMap.size > 0 ? binMap : undefined,
    all,
  };
}

/**
 * Get dependencies from package.json
 */
function getDependencies(manifest: PackageJson): DependencyInfo {
  const production = Object.keys(manifest.dependencies || {});
  const development = Object.keys(manifest.devDependencies || {});
  const peer = Object.keys(manifest.peerDependencies || {});

  return {
    production,
    development,
    peer,
    all: new Set([...production, ...development, ...peer]),
  };
}

/**
 * Get workspaces from package.json
 */
function getWorkspaces(manifest: PackageJson): string[] | undefined {
  if (!manifest.workspaces) {
    return undefined;
  }

  if (Array.isArray(manifest.workspaces)) {
    return manifest.workspaces;
  }

  if (manifest.workspaces.packages) {
    return manifest.workspaces.packages;
  }

  return undefined;
}

/**
 * Get repository URL from package.json
 */
function getRepositoryUrl(manifest: PackageJson): string | undefined {
  if (!manifest.repository) {
    return undefined;
  }

  if (typeof manifest.repository === 'string') {
    return manifest.repository;
  }

  return manifest.repository.url;
}

/**
 * Analyze a package.json file
 */
export async function analyzePackageJson(packageJsonPath: string): Promise<PackageConfig> {
  const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
  const manifest: PackageJson = JSON.parse(content);

  return {
    name: manifest.name || path.basename(path.dirname(packageJsonPath)),
    version: manifest.version || '0.0.0',
    description: manifest.description,
    entryPoints: getEntryPoints(manifest),
    dependencies: getDependencies(manifest),
    scripts: manifest.scripts || {},
    workspaces: getWorkspaces(manifest),
    repository: getRepositoryUrl(manifest),
    keywords: manifest.keywords || [],
  };
}

/**
 * Find all package.json files in a directory (for monorepos)
 */
export async function findPackageJsonFiles(
  rootPath: string,
  workspacePatterns?: string[]
): Promise<string[]> {
  const packageJsonFiles: string[] = [];

  // Always include root package.json
  const rootPackageJson = path.join(rootPath, 'package.json');
  if (fs.existsSync(rootPackageJson)) {
    packageJsonFiles.push(rootPackageJson);
  }

  // If no workspace patterns, just return root
  if (!workspacePatterns || workspacePatterns.length === 0) {
    return packageJsonFiles;
  }

  // Simple glob matching for workspace patterns
  for (const pattern of workspacePatterns) {
    const basePath = pattern.replace(/\/?\*.*$/, '');
    const searchPath = path.join(rootPath, basePath);

    if (!fs.existsSync(searchPath)) {
      continue;
    }

    const entries = await fs.promises.readdir(searchPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const packageJsonPath = path.join(searchPath, entry.name, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          packageJsonFiles.push(packageJsonPath);
        }
      }
    }
  }

  return packageJsonFiles;
}

/**
 * Check if a directory is a monorepo
 */
export async function isMonorepo(rootPath: string): Promise<boolean> {
  const packageJsonPath = path.join(rootPath, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
    const manifest: PackageJson = JSON.parse(content);
    return !!manifest.workspaces;
  } catch {
    return false;
  }
}

// ============================================================================
// Package.json Exports Map Analysis (Priority 5)
// ============================================================================

/**
 * Resolve an export path to an actual file path
 */
function resolveExportPath(exportTarget: string, rootPath: string): string {
  // Remove leading ./ if present
  const cleanTarget = exportTarget.startsWith('./') ? exportTarget.slice(2) : exportTarget;
  return path.join(rootPath, cleanTarget);
}

/**
 * Process an export entry (string, object, or array)
 */
function processExportEntry(
  exportPath: string,
  value: ExportsField,
  exposedFiles: Set<string>,
  rootPath: string
): ExportsPath {
  const result: ExportsPath = {
    path: exportPath,
    conditions: [],
  };

  if (typeof value === 'string') {
    // Simple: "./utils": "./dist/utils.js"
    const resolved = resolveExportPath(value, rootPath);
    exposedFiles.add(resolved);
    result.conditions.push({
      condition: 'default',
      target: value,
      resolved,
    });
  } else if (Array.isArray(value)) {
    // Array of fallbacks - take the first
    for (const item of value) {
      if (typeof item === 'string') {
        const resolved = resolveExportPath(item, rootPath);
        exposedFiles.add(resolved);
        result.conditions.push({
          condition: 'default',
          target: item,
          resolved,
        });
        break;
      }
    }
  } else if (typeof value === 'object' && value !== null) {
    // Conditional: { "import": "./esm/index.js", "require": "./cjs/index.js" }
    for (const [condition, target] of Object.entries(value)) {
      if (target === null) continue;

      if (typeof target === 'string') {
        const resolved = resolveExportPath(target, rootPath);
        exposedFiles.add(resolved);
        result.conditions.push({
          condition,
          target,
          resolved,
        });
      } else if (typeof target === 'object') {
        // Nested conditions - recurse
        const nested = processExportEntry(exportPath, target as ExportsField, exposedFiles, rootPath);
        result.conditions.push(...nested.conditions);
      }
    }
  }

  return result;
}

/**
 * Analyze the package.json exports field
 */
export function analyzeExportsMap(
  packageJson: PackageJson,
  rootPath: string,
  graph?: ModuleGraph
): ExportsMapAnalysis {
  const exports = packageJson.exports;
  const allFiles = graph ? new Set(graph.keys()) : new Set<string>();

  if (!exports) {
    return {
      paths: [],
      wildcards: [],
      internalOnly: [...allFiles],
    };
  }

  const analysis: ExportsMapAnalysis = {
    paths: [],
    wildcards: [],
    internalOnly: [],
  };

  const exposedFiles = new Set<string>();

  // Process exports field
  if (typeof exports === 'string') {
    analysis.paths.push(processExportEntry('.', exports, exposedFiles, rootPath));
  } else if (typeof exports === 'object' && !Array.isArray(exports)) {
    for (const [exportPath, value] of Object.entries(exports)) {
      if (value === null) continue;

      // Check for wildcards
      if (exportPath.includes('*')) {
        analysis.wildcards.push(exportPath);
        continue;
      }

      analysis.paths.push(processExportEntry(exportPath, value as ExportsField, exposedFiles, rootPath));
    }
  }

  // Find internal-only files (files not exposed via exports)
  if (graph) {
    for (const filePath of graph.keys()) {
      // Normalize paths for comparison
      const isExposed = [...exposedFiles].some((exposed) => {
        const normalizedExposed = path.normalize(exposed);
        const normalizedFile = path.normalize(filePath);
        return normalizedFile === normalizedExposed ||
               normalizedFile.replace(/\.(ts|tsx)$/, '.js') === normalizedExposed ||
               normalizedFile.replace(/\.(ts|tsx)$/, '.d.ts') === normalizedExposed;
      });

      if (!isExposed) {
        const node = graph.get(filePath);
        if (node) {
          analysis.internalOnly.push(node.relativePath);
        }
      }
    }
  }

  return analysis;
}

# Repository Analyzer - API Documentation

Static analysis tool built with `ts-morph` for TypeScript/JavaScript projects. Discovers entry points, builds module graphs, analyzes dependencies, tracks export flows, and detects architecture patterns.

- **Export Flow Tracking** - Trace where symbols originate and flow through barrel files
- **Architecture Detection** - Automatically detect layered, feature-based, flat, or monorepo patterns
- **Layer Violation Detection** - Find imports that violate architecture boundaries
- **Detailed Dependency Usage** - Track which symbols are imported from each package
- **Package.json Exports Map Analysis** - Full support for modern conditional exports

## Supported Languages

| Language | Extensions | Supported |
|----------|------------|-----------|
| TypeScript | `.ts`, `.tsx` | ✅ Yes |
| JavaScript | `.js`, `.jsx` | ✅ Yes |
| Python | `.py` | ❌ No |
| Go | `.go` | ❌ No |
| Rust | `.rs` | ❌ No |
| Java | `.java` | ❌ No |

**Limitations:**
- Requires `package.json` (Node.js/npm ecosystem only)
- Uses `ts-morph` (TypeScript compiler API) - cannot parse other languages
- Configurable via `options.extensions` but limited to JS/TS syntax

## Quick Start

```bash
# Run analysis
npm run analyze -- /path/to/repo /path/to/output

# Self-analysis
npm run analyze:self
```

## CLI Usage

```
node dist/src/index.js <repo-path> [output-path]

Arguments:
  repo-path    Path to repository root (must contain package.json)
  output-path  Output directory (defaults to repo-path/scripts/)
```

---

## Exported Functions

### `analyzeRepository(repoPath, outputPath?, options?)`

Main entry point - Analyzes a repository and writes output files.

```typescript
import { analyzeRepository } from 'octocode-documentaion-writer';

const analysis = await analyzeRepository(
  '/path/to/repo',
  '/path/to/output',
  { includeTests: false }
);
```

**Returns:** `EnhancedRepoAnalysis` object + writes files to output directory.

---

### `quickAnalyze(repoPath, options?)`

Returns analysis without writing files - useful for programmatic use.

```typescript
import { quickAnalyze } from 'octocode-documentaion-writer';

const analysis = await quickAnalyze('/path/to/repo');
console.log(analysis.insights.unusedExports);
```

---

### `analyzePackageJson(packageJsonPath)`

Extracts entry points and dependencies from `package.json`.

```typescript
import { analyzePackageJson } from 'octocode-documentaion-writer';

const config = await analyzePackageJson('/path/to/package.json');
console.log(config.entryPoints.all); // Set of all entry points
console.log(config.dependencies.production); // string[]
```

**Entry points discovered:**
- `main` - CommonJS entry
- `module` - ESM entry
- `types` / `typings` - TypeScript declarations
- `bin` - CLI binaries (string or object format)
- `exports` - Package exports (handles nested conditional exports)

---

### `buildModuleGraph(options)`

Builds a module graph using ts-morph AST analysis.

```typescript
import { buildModuleGraph } from 'octocode-documentaion-writer';

const graph = await buildModuleGraph({
  rootPath: '/path/to/repo',
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  excludePatterns: ['**/node_modules/**', '**/dist/**'],
  includeTests: false,
});

// graph is Map<filePath, FileNode>
for (const [path, node] of graph) {
  console.log(node.relativePath, node.exports.length, node.imports.internal.size);
}
```

---

### `analyzeDependencies(graph, declaredDeps)`

Compares declared vs. used dependencies.

```typescript
import { analyzeDependencies } from 'octocode-documentaion-writer';

const result = analyzeDependencies(moduleGraph, packageConfig.dependencies);
console.log(result.unused);    // Declared but not imported
console.log(result.unlisted);  // Imported but not declared
console.log(result.misplaced); // Prod deps only used in tests
```

---

### `findCircularDependencies(graph)`

Detects circular import chains using DFS.

```typescript
import { findCircularDependencies } from 'octocode-documentaion-writer';

const cycles = findCircularDependencies(moduleGraph);
// cycles: string[][] - each cycle is array of file paths
```

---

### `findUnusedExports(graph, entryPoints)`

Finds exports not imported anywhere.

```typescript
import { findUnusedExports } from 'octocode-documentaion-writer';

const unused = findUnusedExports(moduleGraph, entryPoints);
// unused: { file: string, export: string, type: SymbolType }[]
```

---

### `isMonorepo(rootPath)`

Checks if directory is a monorepo (has `workspaces` in package.json).

```typescript
import { isMonorepo } from 'octocode-documentaion-writer';

const isMono = await isMonorepo('/path/to/repo');
```

---

### `buildExportFlows(graph, entryPaths)`

Builds export flow tracking - traces where symbols originate and how they flow through barrel files.

```typescript
import { buildExportFlows } from 'octocode-documentaion-writer';

const flows = buildExportFlows(moduleGraph, entryPoints);
// flows: Map<symbolName, ExportFlow>
for (const [name, flow] of flows) {
  console.log(name, flow.definedIn, flow.reExportChain);
}
```

---

### `detectArchitecture(graph)`

Detects the architecture pattern and analyzes layers.

```typescript
import { detectArchitecture } from 'octocode-documentaion-writer';

const arch = detectArchitecture(moduleGraph);
console.log(arch.pattern);     // 'layered' | 'feature-based' | 'flat' | 'monorepo' | 'unknown'
console.log(arch.layers);      // ArchitectureLayer[]
console.log(arch.violations);  // LayerViolation[]
```

**Detected patterns:**
- `layered` - Has components/, services/, utils/ directories
- `feature-based` - Has features/ or modules/ directories
- `flat` - Minimal directory nesting in src/
- `monorepo` - Has packages/ or apps/ directories

---

### `analyzeDetailedDependencyUsage(graph, declaredDeps)`

Analyzes which symbols are imported from each external dependency.

```typescript
import { analyzeDetailedDependencyUsage } from 'octocode-documentaion-writer';

const usage = analyzeDetailedDependencyUsage(moduleGraph, packageConfig.dependencies);
// usage: Map<packageName, DependencyUsage>
for (const [pkg, info] of usage) {
  console.log(pkg, info.stats.filesUsedIn, info.stats.uniqueSymbols);
}
```

---

### `analyzeExportsMap(packageJson, rootPath, graph?)`

Analyzes the package.json exports field for conditional exports and internal-only files.

```typescript
import { analyzeExportsMap } from 'octocode-documentaion-writer';

const exportsMap = analyzeExportsMap(packageJson, rootPath, moduleGraph);
console.log(exportsMap.paths);        // Export paths with conditions
console.log(exportsMap.wildcards);    // Wildcard patterns
console.log(exportsMap.internalOnly); // Files not exposed via exports
```

---

## Output Files

| File | Description |
|------|-------------|
| `analysis.json` | Structured analysis data (primary output) |
| `ANALYSIS_SUMMARY.md` | Human-readable overview |
| `PUBLIC_API.md` | All exports with signatures and JSDoc |
| `DEPENDENCIES.md` | Dependency tree and issues |
| `INSIGHTS.md` | Circular deps, unused exports, orphans |
| `MODULE_GRAPH.md` | Mermaid dependency diagrams |
| `EXPORT_FLOWS.md` | How symbols travel from source to public API |
| `ARCHITECTURE.md` | Detected patterns and layer analysis |
| `DEPENDENCY_USAGE.md` | Which symbols used from each package |

---

## Type Definitions

### `EnhancedRepoAnalysis`

```typescript
interface EnhancedRepoAnalysis extends RepoAnalysis {
  metadata: {
    version: string;           // "2.0.0"
    generatedAt: string;       // ISO timestamp
    repositoryPath: string;
    analysisType: 'full' | 'partial';
    duration: number;          // ms
  };
  package: PackageConfig;
  publicAPI: PublicAPIEntry[];
  moduleGraph: ModuleGraphSummary;
  dependencies: DependencyAnalysis;
  files: FileAnalysis[];
  insights: AnalysisInsights;
  exportFlows?: Record<string, ExportFlow>;
  dependencyUsage?: Record<string, DependencyUsage>;
  architecture?: ArchitectureAnalysis;
  exportsMap?: ExportsMapAnalysis;
}
```

### `PackageConfig`

```typescript
interface PackageConfig {
  name: string;
  version: string;
  description?: string;
  entryPoints: {
    main?: string;
    module?: string;
    types?: string;
    exports?: Map<string, string>;
    bin?: Map<string, string>;
    all: Set<string>;         // All entry points combined
  };
  dependencies: {
    production: string[];
    development: string[];
    peer: string[];
    all: Set<string>;
  };
  scripts: Record<string, string>;
  workspaces?: string[];
  repository?: string;
  keywords: string[];
}
```

### `FileNode`

```typescript
interface FileNode {
  path: string;               // Absolute path
  relativePath: string;       // Relative to root
  imports: {
    internal: Map<string, ImportInfo[]>;  // File imports
    external: Set<string>;                // Package imports
    unresolved: Set<string>;              // Failed resolution
  };
  exports: ExportInfo[];
  importedBy: Set<string>;    // Reverse references
  scripts: Set<string>;
  role: FileRole;
}

type FileRole = 'entry' | 'config' | 'test' | 'util' |
                'component' | 'service' | 'type' | 'barrel' | 'unknown';
```

### `ExportInfo`

```typescript
interface ExportInfo {
  name: string;
  type: SymbolType;           // 'function' | 'class' | 'interface' | 'type' | etc.
  isDefault: boolean;
  isReExport: boolean;
  members?: MemberInfo[];     // For classes/enums
  jsDoc?: string;
  signature?: string;
  position: { line: number; column: number };
}
```

### `AnalysisInsights`

```typescript
interface AnalysisInsights {
  unusedExports: UnusedExport[];
  circularDependencies: string[][];
  barrelFiles: string[];
  largestFiles: string[];
  mostImported: { file: string; importedByCount: number }[];
  orphanFiles: string[];
  typeOnlyFiles: string[];
}
```

### `DependencyAnalysis`

```typescript
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
  unused: string[];       // Declared but not imported
  unlisted: string[];     // Imported but not declared
  misplaced: string[];    // Prod deps only used in tests
}
```

### `ExportFlow`

```typescript
interface ExportFlow {
  definedIn: string;      // Where the symbol is originally defined
  exportType: 'named' | 'default' | 'namespace';
  reExportChain: string[];   // Barrel files it passes through
  publicFrom: string[];      // Entry points that expose it
  conditions: string[];      // package.json export conditions
}
```

### `ArchitectureAnalysis`

```typescript
interface ArchitectureAnalysis {
  pattern: 'layered' | 'feature-based' | 'flat' | 'monorepo' | 'unknown';
  layers: ArchitectureLayer[];
  violations: LayerViolation[];
  features?: FeatureBoundary[];
}

interface ArchitectureLayer {
  name: string;           // 'presentation', 'domain', 'infrastructure', 'shared'
  description: string;
  paths: string[];        // Glob patterns
  dependsOn: string[];    // Allowed layer dependencies
  files: string[];        // Files in this layer
  violatedBy?: string[];  // Files that violate this layer
}

interface LayerViolation {
  from: string;           // Importing file
  to: string;             // Imported file
  fromLayer: string;      // Layer of importing file
  toLayer: string;        // Layer of imported file
}
```

### `DependencyUsage`

```typescript
interface DependencyUsage {
  package: string;
  declaredAs: 'production' | 'development' | 'peer' | 'unlisted';
  usageLocations: {
    file: string;
    symbols: string[];
    isNamespace: boolean;
    isDefault: boolean;
    isTypeOnly: boolean;
    isDynamic: boolean;
  }[];
  stats: {
    totalImports: number;
    uniqueSymbols: string[];
    filesUsedIn: number;
    typeOnlyCount: number;
  };
}
```

### `ExportsMapAnalysis`

```typescript
interface ExportsMapAnalysis {
  paths: {
    path: string;         // "./utils", ".", etc.
    conditions: {
      condition: string;  // "import", "require", "types", "default"
      target: string;     // "./dist/utils.js"
      resolved?: string;  // Actual file path
    }[];
    exports?: string[];
  }[];
  wildcards: string[];    // "./*" patterns
  internalOnly: string[]; // Files not exposed via exports
}
```

---

## Analysis Pipeline

```
Phase 1: Configuration Discovery
├── Parse package.json
├── Extract entry points (main, module, types, bin, exports)
├── Extract dependencies (production, dev, peer)
└── Detect monorepo workspaces

Phase 2: Build Module Graph (ts-morph)
├── Scan all .ts/.tsx/.js/.jsx files
├── Extract imports (internal + external)
├── Extract exports (name, type, signature, JSDoc, members)
├── Build importedBy reverse references
└── Classify files by role

Phase 3: Analyze Dependencies
├── unused: declared but not imported
├── unlisted: imported but not declared
└── misplaced: prod deps only used in tests

Phase 4: Enhanced Analysis
├── Detect architecture pattern (layered, feature-based, flat, monorepo)
├── Assign files to architecture layers
├── Find layer violations
├── Build export flow tracking
├── Analyze detailed dependency usage
└── Analyze package.json exports map

Phase 5: Generate Output
├── analysis.json (structured data)
├── ANALYSIS_SUMMARY.md
├── PUBLIC_API.md
├── DEPENDENCIES.md
├── INSIGHTS.md
├── MODULE_GRAPH.md (Mermaid diagrams)
├── EXPORT_FLOWS.md
├── ARCHITECTURE.md
└── DEPENDENCY_USAGE.md
```

---

## File Role Classification

| Role | Detection Logic |
|------|-----------------|
| `entry` | Matches package.json entry points |
| `config` | Contains `.config.` or `rc.` in filename |
| `test` | Contains `.test.` or `.spec.` or in `__tests__/` |
| `type` | Ends with `.d.ts` or in `/types/` |
| `barrel` | `index.ts` where >50% exports are re-exports |
| `util` | In `/utils/`, `/util/`, `/helpers/`, `/lib/` |
| `component` | In `/components/` or `.tsx`/`.vue` files |
| `service` | In `/services/` or contains `service.` |
| `unknown` | Default |

---

## Source Files

| File | Purpose | Lines |
|------|---------|-------|
| `index.ts` | CLI entry + main exports | ~232 |
| `package-analyzer.ts` | Parse package.json + exports map analysis | ~394 |
| `module-graph.ts` | Build AST graph + export flow tracing | ~694 |
| `dependency-analyzer.ts` | Analyze deps + architecture detection | ~680 |
| `output.ts` | Generate JSON + Markdown (9 output files) | ~868 |
| `types.ts` | TypeScript type definitions | ~391 |

---

## Dependencies

- **ts-morph** - TypeScript AST analysis (wraps TypeScript compiler API)

## Requirements

- Node.js >= 18.0.0
- Target repository must have `package.json`

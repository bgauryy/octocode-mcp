import path from 'node:path';
import type { AnalysisOptions } from './types.js';
import { DEFAULT_OPTS } from './types.js';

export function parseArgs(argv: string[]): AnalysisOptions {
  const opts: AnalysisOptions = { ...DEFAULT_OPTS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--json') {
      opts.json = true;
      continue;
    }

    if (arg === '--include-tests') {
      opts.includeTests = true;
      continue;
    }

    if (arg === '--emit-tree') {
      opts.emitTree = true;
      continue;
    }

    if (arg === '--no-tree') {
      opts.emitTree = false;
      continue;
    }

    if (arg === '--graph') {
      opts.graph = true;
      continue;
    }

    if (arg === '--parser') {
      const next = argv[++i];
      if (!['auto', 'typescript', 'tree-sitter'].includes(next)) {
        console.error(`Unsupported parser: ${next}. Use auto|typescript|tree-sitter`);
        process.exit(1);
      }
      opts.parser = next as AnalysisOptions['parser'];
      continue;
    }

    if (arg === '--findings-limit') {
      opts.findingsLimit = parseInt(argv[++i], 10);
      continue;
    }

    if (arg === '--root') {
      opts.root = path.resolve(argv[++i]);
      continue;
    }

    if (arg === '--out') {
      opts.out = argv[++i];
      continue;
    }

    if (arg.startsWith('--out=')) {
      opts.out = arg.slice('--out='.length);
      continue;
    }

    if (arg === '--min-function-statements') {
      opts.minFunctionStatements = parseInt(argv[++i], 10);
      continue;
    }

    if (arg === '--min-flow-statements') {
      opts.minFlowStatements = parseInt(argv[++i], 10);
      continue;
    }

    if (arg === '--critical-complexity-threshold') {
      opts.criticalComplexityThreshold = parseInt(argv[++i], 10);
      continue;
    }

    if (arg === '--deep-link-topn') {
      opts.deepLinkTopN = parseInt(argv[++i], 10);
      continue;
    }

    if (arg === '--tree-depth') {
      opts.treeDepth = parseInt(argv[++i], 10);
      continue;
    }

    if (arg === '--coupling-threshold') {
      opts.couplingThreshold = parseInt(argv[++i], 10);
      continue;
    }

    if (arg === '--fan-in-threshold') {
      opts.fanInThreshold = parseInt(argv[++i], 10);
      continue;
    }

    if (arg === '--fan-out-threshold') {
      opts.fanOutThreshold = parseInt(argv[++i], 10);
      continue;
    }

    if (arg === '--god-module-statements') {
      opts.godModuleStatements = parseInt(argv[++i], 10);
      continue;
    }

    if (arg === '--god-module-exports') {
      opts.godModuleExports = parseInt(argv[++i], 10);
      continue;
    }

    if (arg === '--god-function-statements') {
      opts.godFunctionStatements = parseInt(argv[++i], 10);
      continue;
    }

    if (arg === '--cognitive-complexity-threshold') {
      opts.cognitiveComplexityThreshold = parseInt(argv[++i], 10);
      continue;
    }

    if (arg === '--barrel-symbol-threshold') {
      opts.barrelSymbolThreshold = parseInt(argv[++i], 10);
      continue;
    }

    if (arg === '--layer-order') {
      opts.layerOrder = argv[++i].split(',').map((s) => s.trim());
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  opts.packageRoot = path.join(opts.root, 'packages');

  if (Number.isNaN(opts.minFunctionStatements)) opts.minFunctionStatements = DEFAULT_OPTS.minFunctionStatements;
  if (Number.isNaN(opts.minFlowStatements)) opts.minFlowStatements = DEFAULT_OPTS.minFlowStatements;
  if (Number.isNaN(opts.findingsLimit)) opts.findingsLimit = DEFAULT_OPTS.findingsLimit;
  if (Number.isNaN(opts.treeDepth)) opts.treeDepth = DEFAULT_OPTS.treeDepth;
  if (Number.isNaN(opts.criticalComplexityThreshold)) {
    opts.criticalComplexityThreshold = DEFAULT_OPTS.criticalComplexityThreshold;
  }
  if (Number.isNaN(opts.deepLinkTopN)) {
    opts.deepLinkTopN = DEFAULT_OPTS.deepLinkTopN;
  }
  if (Number.isNaN(opts.couplingThreshold)) opts.couplingThreshold = DEFAULT_OPTS.couplingThreshold;
  if (Number.isNaN(opts.fanInThreshold)) opts.fanInThreshold = DEFAULT_OPTS.fanInThreshold;
  if (Number.isNaN(opts.fanOutThreshold)) opts.fanOutThreshold = DEFAULT_OPTS.fanOutThreshold;
  if (Number.isNaN(opts.godModuleStatements)) opts.godModuleStatements = DEFAULT_OPTS.godModuleStatements;
  if (Number.isNaN(opts.godModuleExports)) opts.godModuleExports = DEFAULT_OPTS.godModuleExports;
  if (Number.isNaN(opts.godFunctionStatements)) opts.godFunctionStatements = DEFAULT_OPTS.godFunctionStatements;
  if (Number.isNaN(opts.cognitiveComplexityThreshold)) opts.cognitiveComplexityThreshold = DEFAULT_OPTS.cognitiveComplexityThreshold;
  if (Number.isNaN(opts.barrelSymbolThreshold)) opts.barrelSymbolThreshold = DEFAULT_OPTS.barrelSymbolThreshold;

  return opts;
}

export function printHelp(): void {
  console.log(`
Usage:
  node scripts/index.js [options]

Options:
  --root <path>                 Analyze a different repo root (default: cwd)
  --out <path>                  Write full report JSON to path
  --json                        Print report JSON to stdout
  --include-tests               Include *.test* and *.spec* files
  --parser <auto|typescript|tree-sitter>
                                Parser engine for extra AST metadata (default: auto)
  --no-tree                     Do not write AST trees to report
  --emit-tree                   Force include tree blocks
  --graph                       Emit Mermaid dependency graph to .md file alongside JSON
  --min-function-statements N    Minimum function body statement count for duplicate matching (default 6)
  --min-flow-statements N        Minimum control-flow statement count for duplicate matching (default 6)
  --critical-complexity-threshold N
                                Complexity threshold for HIGH complexity findings and critical path weighting.
  --findings-limit N            Maximum findings written to the report (default 250)
  --deep-link-topn N            Max number of critical dependency paths to report (default 12)
  --tree-depth N                AST tree depth when tree snapshots are emitted (default 4)
  --coupling-threshold N        Ca+Ce threshold for high-coupling findings (default 15)
  --fan-in-threshold N          Fan-in threshold for god-module-coupling (default 20)
  --fan-out-threshold N         Fan-out threshold for god-module-coupling (default 15)
  --god-module-statements N     Statement threshold for god-module findings (default 500)
  --god-module-exports N        Export threshold for god-module findings (default 20)
  --god-function-statements N   Statement threshold for god-function findings (default 100)
  --cognitive-complexity-threshold N
                                Cognitive complexity threshold for findings (default 15)
  --barrel-symbol-threshold N   Re-export count threshold for barrel-explosion (default 30)
  --layer-order <layers>        Comma-separated layer names for violation detection (e.g. ui,service,repository)
  --help                        Show this message
`);
}

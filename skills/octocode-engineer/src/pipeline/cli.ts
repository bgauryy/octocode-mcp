import path from 'node:path';

import { ALL_CATEGORIES, DEFAULT_OPTS, PILLAR_CATEGORIES } from '../types/index.js';
import { OptionsError, resolveExcludeToFeatures } from './create-options.js';

import type { AnalysisOptions, Thresholds } from '../types/index.js';

function parseNumeric(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw ?? '', 10);
  return Number.isNaN(n) ? fallback : n;
}

function parseDecimal(raw: string | undefined, fallback: number): number {
  const n = parseFloat(raw ?? '');
  return Number.isNaN(n) ? fallback : n;
}

function setIntOpt(
  target: Record<string, number>,
  key: string,
  raw: string,
  defaults: Record<string, number>
): void {
  target[key] = parseNumeric(raw, defaults[key]);
}

function setFloatOpt(
  target: Record<string, number>,
  key: string,
  raw: string,
  defaults: Record<string, number>
): void {
  target[key] = parseDecimal(raw, defaults[key]);
}

function resolveCategories(val: string, flagName: string): Set<string> {
  const tokens = val
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const resolved = new Set<string>();
  for (const token of tokens) {
    if (PILLAR_CATEGORIES[token]) {
      for (const cat of PILLAR_CATEGORIES[token]) resolved.add(cat);
    } else if (ALL_CATEGORIES.has(token)) {
      resolved.add(token);
    } else {
      console.error(
        `Unknown ${flagName}: "${token}". Use pillar names (${Object.keys(PILLAR_CATEGORIES).join(', ')}) or category names.`
      );
      process.exit(1);
    }
  }
  return resolved;
}

function parseScope(
  val: string,
  root: string
): { paths: string[]; symbols: Map<string, string[]> } {
  const splitScopeToken = (
    token: string
  ): { filePath: string; symbolName: string | null } => {
    const colonIdx = token.lastIndexOf(':');
    if (colonIdx <= 0 || colonIdx === token.length - 1) {
      return { filePath: token, symbolName: null };
    }
    const symbolName = token.substring(colonIdx + 1);
    if (symbolName.includes('/') || symbolName.includes('\\')) {
      return { filePath: token, symbolName: null };
    }
    return {
      filePath: token.substring(0, colonIdx),
      symbolName,
    };
  };

  const paths: string[] = [];
  const symbols = new Map<string, string[]>();
  for (const token of val
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)) {
    const { filePath, symbolName } = splitScopeToken(token);
    const absFile = path.resolve(root, filePath);
    paths.push(absFile);
    if (symbolName) {
      if (!symbols.has(absFile)) symbols.set(absFile, []);
      symbols.get(absFile)!.push(symbolName);
    }
  }
  return { paths, symbols };
}

type FlagHandler = (opts: AnalysisOptions, argv: string[], i: number) => number;

const BOOL_FLAGS: Record<
  string,
  (opts: AnalysisOptions, value: boolean) => void
> = {
  '--json': o => {
    o.json = true;
  },
  '--include-tests': o => {
    o.includeTests = true;
  },
  '--emit-tree': o => {
    o.emitTree = true;
  },
  '--no-tree': o => {
    o.emitTree = false;
  },
  '--graph': o => {
    o.graph = true;
  },
  '--semantic': o => {
    o.semantic = true;
  },
  '--no-diversify': o => {
    o.noDiversify = true;
  },
  '--no-cache': o => {
    o.noCache = true;
  },
  '--clear-cache': o => {
    o.clearCache = true;
  },
  '--graph-advanced': o => {
    o.graphAdvanced = true;
  },
  '--flow': o => {
    o.flow = true;
  },
  '--all': o => {
    o.includeTests = true;
    o.semantic = true;
  },
  '--save-baseline': o => {
    o.saveBaseline = true;
  },
};

const CORE_INT_FLAGS: Record<string, keyof AnalysisOptions> = {
  '--findings-limit': 'findingsLimit',
  '--deep-link-topn': 'deepLinkTopN',
  '--tree-depth': 'treeDepth',
  '--max-recs-per-category': 'maxRecsPerCategory',
  '--focus-depth': 'focusDepth',
};

const THRESHOLD_INT_FLAGS: Record<string, keyof Thresholds> = {
  '--min-function-statements': 'minFunctionStatements',
  '--min-flow-statements': 'minFlowStatements',
  '--critical-complexity-threshold': 'criticalComplexityThreshold',
  '--coupling-threshold': 'couplingThreshold',
  '--fan-in-threshold': 'fanInThreshold',
  '--fan-out-threshold': 'fanOutThreshold',
  '--god-module-statements': 'godModuleStatements',
  '--god-module-exports': 'godModuleExports',
  '--god-function-statements': 'godFunctionStatements',
  '--god-function-mi-threshold': 'godFunctionMiThreshold',
  '--cognitive-complexity-threshold': 'cognitiveComplexityThreshold',
  '--barrel-symbol-threshold': 'barrelSymbolThreshold',
  '--parameter-threshold': 'parameterThreshold',
  '--halstead-effort-threshold': 'halsteadEffortThreshold',
  '--maintainability-index-threshold': 'maintainabilityIndexThreshold',
  '--any-threshold': 'anyThreshold',
  '--flow-dup-threshold': 'flowDupThreshold',
  '--override-chain-threshold': 'overrideChainThreshold',
  '--shotgun-threshold': 'shotgunThreshold',
  '--secret-min-length': 'secretMinLength',
  '--mock-threshold': 'mockThreshold',
  '--deep-nesting-threshold': 'deepNestingThreshold',
  '--multiple-return-threshold': 'multipleReturnThreshold',
  '--magic-string-min-occurrences': 'magicStringMinOccurrences',
  '--boolean-param-threshold': 'booleanParamThreshold',
};

const THRESHOLD_FLOAT_FLAGS: Record<string, keyof Thresholds> = {
  '--secret-entropy-threshold': 'secretEntropyThreshold',
  '--similarity-threshold': 'similarityThreshold',
  '--sdp-min-delta': 'sdpMinDelta',
  '--sdp-max-source-instability': 'sdpMaxSourceInstability',
};

const SPECIAL_FLAGS: Record<string, FlagHandler> = {
  '--parser': (opts, argv, i) => {
    const next = argv[i + 1];
    if (!['auto', 'typescript', 'tree-sitter'].includes(next)) {
      console.error(
        `Unsupported parser: ${next}. Use auto|typescript|tree-sitter`
      );
      process.exit(1);
    }
    opts.parser = next as AnalysisOptions['parser'];
    return i + 1;
  },
  '--root': (opts, argv, i) => {
    opts.root = path.resolve(argv[i + 1]);
    return i + 1;
  },
  '--out': (opts, argv, i) => {
    opts.out = argv[i + 1];
    return i + 1;
  },
  '--layer-order': (opts, argv, i) => {
    opts.thresholds.layerOrder = argv[i + 1].split(',').map(s => s.trim());
    return i + 1;
  },
  '--reporter': (opts, argv, i) => {
    const next = argv[i + 1];
    if (!['default', 'compact', 'github-actions'].includes(next)) {
      console.error(`Unsupported reporter: ${next}. Use default|compact|github-actions`);
      process.exit(1);
    }
    opts.reporter = next as AnalysisOptions['reporter'];
    return i + 1;
  },
  '--config': (opts, argv, i) => {
    opts.configFile = argv[i + 1];
    return i + 1;
  },
  '--help': () => {
    printHelp();
    return process.exit(0) as never;
  },
  '-h': () => {
    printHelp();
    return process.exit(0) as never;
  },
};

export function parseArgs(argv: string[]): AnalysisOptions {
  const opts: AnalysisOptions = { ...DEFAULT_OPTS, thresholds: { ...DEFAULT_OPTS.thresholds } };
  let excludeSet: Set<string> | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (BOOL_FLAGS[arg]) {
      BOOL_FLAGS[arg](opts, true);
      continue;
    }

    if (CORE_INT_FLAGS[arg]) {
      const key = CORE_INT_FLAGS[arg];
      setIntOpt(
        opts as unknown as Record<string, number>,
        key, argv[++i],
        DEFAULT_OPTS as unknown as Record<string, number>
      );
      continue;
    }

    if (THRESHOLD_INT_FLAGS[arg]) {
      const key = THRESHOLD_INT_FLAGS[arg];
      setIntOpt(
        opts.thresholds as unknown as Record<string, number>,
        key, argv[++i],
        DEFAULT_OPTS.thresholds as unknown as Record<string, number>
      );
      continue;
    }

    if (THRESHOLD_FLOAT_FLAGS[arg]) {
      const key = THRESHOLD_FLOAT_FLAGS[arg];
      setFloatOpt(
        opts.thresholds as unknown as Record<string, number>,
        key, argv[++i],
        DEFAULT_OPTS.thresholds as unknown as Record<string, number>
      );
      continue;
    }

    if (SPECIAL_FLAGS[arg]) {
      i = SPECIAL_FLAGS[arg](opts, argv, i);
      continue;
    }

    if (arg.startsWith('--out=')) {
      opts.out = arg.slice('--out='.length);
      continue;
    }

    if (arg === '--scope' || arg.startsWith('--scope=')) {
      const val = arg.startsWith('--scope=')
        ? arg.slice('--scope='.length)
        : argv[++i];
      const { paths, symbols } = parseScope(val, opts.root);
      opts.scope = paths;
      if (symbols.size > 0) opts.scopeSymbols = symbols;
      continue;
    }

    if (arg === '--features' || arg.startsWith('--features=')) {
      const val = arg.startsWith('--features=')
        ? arg.slice('--features='.length)
        : argv[++i];
      opts.features = resolveCategories(val, 'feature');
      continue;
    }

    if (arg === '--exclude' || arg.startsWith('--exclude=')) {
      const val = arg.startsWith('--exclude=')
        ? arg.slice('--exclude='.length)
        : argv[++i];
      excludeSet = resolveCategories(val, 'exclude');
      continue;
    }

    if (arg === '--affected' || arg.startsWith('--affected=')) {
      opts.affected = arg.startsWith('--affected=')
        ? arg.slice('--affected='.length)
        : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'HEAD');
      continue;
    }

    if (arg === '--ignore-known' || arg.startsWith('--ignore-known=')) {
      opts.ignoreKnown = arg.startsWith('--ignore-known=')
        ? arg.slice('--ignore-known='.length)
        : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '.octocode/baseline.json');
      continue;
    }

    if (arg === '--focus' || arg.startsWith('--focus=')) {
      opts.focus = arg.startsWith('--focus=')
        ? arg.slice('--focus='.length)
        : argv[++i];
      continue;
    }

    if (arg === '--collapse' || arg.startsWith('--collapse=')) {
      const val = arg.startsWith('--collapse=')
        ? arg.slice('--collapse='.length)
        : argv[++i];
      opts.collapse = parseNumeric(val, 2);
      continue;
    }

    if (arg === '--at-least' || arg.startsWith('--at-least=')) {
      const val = arg.startsWith('--at-least=')
        ? arg.slice('--at-least='.length)
        : argv[++i];
      opts.atLeast = parseNumeric(val, 0);
      continue;
    }

    if (arg.startsWith('--')) {
      console.warn(`Warning: unknown flag "${arg}" — ignored.`);
    }
  }

  opts.packageRoot = path.join(opts.root, 'packages');

  if (opts.features !== null && excludeSet !== null) {
    throw new OptionsError(
      '--features and --exclude are mutually exclusive. Use one or the other.'
    );
  }
  if (excludeSet !== null) {
    opts.features = resolveExcludeToFeatures(excludeSet);
  }

  if (opts.features !== null) {
    const testQualityCats = new Set(PILLAR_CATEGORIES['test-quality']);
    if ([...opts.features].some(f => testQualityCats.has(f))) {
      opts.includeTests = true;
    }
  }

  return opts;
}

export const HELP_TEXT = `
Usage:
  node scripts/run.js [options]

Options:
  --root <path>                 Analyze a different repo root (default: cwd)
  --out <path>                  Output directory for split report files (timestamped dir by default).
                                If path ends with .json, writes single monolithic file (legacy mode).
  --json                        Print report JSON to stdout
  --include-tests               Include *.test* and *.spec* files
  --parser <auto|typescript|tree-sitter>
                                Parser engine for extra AST metadata (default: auto)
  --no-tree                     Do not write AST trees to report
  --emit-tree                   Force include tree blocks
  --graph                       Emit Mermaid dependency graph to .md file alongside JSON
  --graph-advanced              Enable advanced graph overlays and additional architecture findings
  --flow                        Enable lightweight flow enrichment for evidence traces and cfgFlags
  --min-function-statements N    Minimum function body statement count for duplicate matching (default 6)
  --min-flow-statements N        Minimum control-flow statement count for duplicate matching (default 6)
  --critical-complexity-threshold N
                                Complexity threshold for HIGH complexity findings and critical path weighting.
  --findings-limit N            Cap findings in the report (default: no limit)
  --deep-link-topn N            Max number of critical dependency paths to report (default 12)
  --tree-depth N                AST tree depth when tree snapshots are emitted (default 4)
  --coupling-threshold N        Ca+Ce threshold for high-coupling findings (default 15)
  --fan-in-threshold N          Fan-in threshold for god-module-coupling (default 20)
  --fan-out-threshold N         Fan-out threshold for god-module-coupling (default 15)
  --god-module-statements N     Statement threshold for god-module findings (default 500)
  --god-module-exports N        Export threshold for god-module findings (default 20)
  --god-function-statements N   Statement threshold for god-function findings (default 100)
  --god-function-mi-threshold N MI threshold for god-function findings (default 10, fires when MI < N and LOC > 30)
  --cognitive-complexity-threshold N
                                Cognitive complexity threshold for findings (default 15)
  --barrel-symbol-threshold N   Re-export count threshold for barrel-explosion (default 30)
  --layer-order <layers>        Comma-separated layer names for violation detection (e.g. ui,service,repository)
  --parameter-threshold N       Max function parameters before flagging (default 5)
  --halstead-effort-threshold N Halstead effort threshold for findings (default 500000)
  --maintainability-index-threshold N
                                MI below this triggers a finding (default 20, scale 0-100)
  --any-threshold N             Max \`any\` type usages per file before flagging (default 5)
  --flow-dup-threshold N        Min occurrences for a repeated flow to become a finding (default 3)
  --max-recs-per-category N     Max findings per category in top recommendations (default 2)
  --scope=X,Y,Z                 Limit scan to specific paths, files, or functions. Comma-separated.
                                Supports file:functionName to drill into a specific function.
                                Examples: --scope=packages/octocode-mcp
                                          --scope=packages/octocode-mcp/src/tools
                                          --scope=packages/octocode-mcp/src/session.ts
                                          --scope=packages/octocode-mcp/src/session.ts:initSession
                                          --scope=packages/foo,packages/bar
  --features=X,Y,Z              Run only selected features. Accepts pillar names (architecture,
                                code-quality, dead-code, security, test-quality) or individual
                                category names. Comma-separated.
                                Examples: --features=architecture
                                          --features=dead-code,cognitive-complexity
                                          --features=dependency-cycle,dead-export
  --exclude=X,Y,Z               Run everything EXCEPT the given pillars or categories. Mutually
                                exclusive with --features. Same pillar/category names as --features.
                                Examples: --exclude=architecture
                                          --exclude=dead-export,unsafe-any
  --semantic                    Enable semantic analysis phase (TypeChecker + LanguageService).
                                Adds 12 categories: over-abstraction, concrete-dependency,
                                circular-type-dependency, unused-parameter,
                                deep-override-chain, interface-compliance, unused-import,
                                orphan-implementation, shotgun-surgery, move-to-caller,
                                narrowable-type, semantic-dead-export.
  --override-chain-threshold N  Max method override depth before flagging (default 3, requires --semantic)
  --shotgun-threshold N         Unique-file threshold for shotgun-surgery (default 8, requires --semantic)
  --sdp-min-delta N             Min instability delta for SDP violations (default 0.15)
  --sdp-max-source-instability N  Max source instability to report SDP (default 0.6)
  --secret-entropy-threshold N  Shannon entropy threshold for secret detection (default 4.5)
  --secret-min-length N         Min string length for entropy-based secret detection (default 20)
  --similarity-threshold N      Jaccard similarity threshold for near-clone detection (default 0.85)
  --deep-nesting-threshold N    Max branch/loop nesting depth before flagging (default 5)
  --multiple-return-threshold N Max return/throw paths per function before flagging (default 6)
  --magic-string-min-occurrences N
                                Min repeated string comparisons to flag as magic string (default 3)
  --boolean-param-threshold N   Min boolean params per function to flag as cluster (default 3)
  --mock-threshold N            Max mock/spy calls per test file (default 10)
  --no-diversify                Disable category-aware diversification when truncating findings.
                                By default, --findings-limit interleaves categories so the
                                truncated list is diverse. Use this to get pure severity ordering.
  --no-cache                    Disable incremental cache; re-parse all files
  --clear-cache                 Delete the analysis cache and exit (no scan)
  --all                         Enable all features: --include-tests --semantic

  --affected [revision]         Scope to files changed since git revision (default: HEAD) plus
                                their transitive dependents. Like dep-cruiser's --affected flag.
                                Examples: --affected
                                          --affected HEAD~3
                                          --affected main
  --save-baseline               Save current findings to .octocode/baseline.json for future
                                comparison. Use with --ignore-known for progressive adoption.
  --ignore-known [file]         Suppress findings matching a baseline file (default:
                                .octocode/baseline.json). Findings are matched by (category, file).
  --reporter <format>           Output format: default|compact|github-actions (default: default)
                                compact: one-line per finding for terminal/CI logs
                                github-actions: ::warning annotations for GitHub Actions
  --focus <module>              Show only this module and its neighbors in the dependency graph.
                                Requires --graph. Use with --focus-depth to control neighbor hops.
                                Examples: --focus src/session.ts
                                          --focus=src/session.ts
                                          --focus packages/octocode-mcp/src/tools
  --focus-depth N               Neighbor depth for --focus (default 1). 2 = friends-of-friends.
  --collapse N                  Collapse graph nodes to folder depth N. Reduces large graphs to
                                high-level architecture view. Example: --collapse 2
  --at-least N                  Fail (exit 1) if health score drops below N (0-100). Use in CI
                                to enforce a quality floor. Example: --at-least 60
  --config <file>               Path to config file. Also auto-discovers .octocode-scan.json,
                                .octocode-scan.jsonc, or package.json#octocode in the project root.
  --help                        Show this message
`;

export function printHelp(): void {
  console.log(HELP_TEXT);
}

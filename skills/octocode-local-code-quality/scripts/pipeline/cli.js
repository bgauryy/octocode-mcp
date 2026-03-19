import path from 'node:path';
import { ALL_CATEGORIES, DEFAULT_OPTS, PILLAR_CATEGORIES } from '../types/index.js';
function parseNumeric(raw, fallback) {
    const n = parseInt(raw ?? '', 10);
    return Number.isNaN(n) ? fallback : n;
}
function parseDecimal(raw, fallback) {
    const n = parseFloat(raw ?? '');
    return Number.isNaN(n) ? fallback : n;
}
function resolveCategories(val, flagName) {
    const tokens = val
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    const resolved = new Set();
    for (const token of tokens) {
        if (PILLAR_CATEGORIES[token]) {
            for (const cat of PILLAR_CATEGORIES[token])
                resolved.add(cat);
        }
        else if (ALL_CATEGORIES.has(token)) {
            resolved.add(token);
        }
        else {
            console.error(`Unknown ${flagName}: "${token}". Use pillar names (${Object.keys(PILLAR_CATEGORIES).join(', ')}) or category names.`);
            process.exit(1);
        }
    }
    return resolved;
}
function parseScope(val, root) {
    const paths = [];
    const symbols = new Map();
    for (const token of val
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)) {
        const colonIdx = token.lastIndexOf(':');
        if (colonIdx > 0 && !token.substring(0, colonIdx).includes(':')) {
            const filePart = token.substring(0, colonIdx);
            const symbolPart = token.substring(colonIdx + 1);
            const absFile = path.resolve(root, filePart);
            paths.push(absFile);
            if (!symbols.has(absFile))
                symbols.set(absFile, []);
            symbols.get(absFile).push(symbolPart);
        }
        else {
            paths.push(path.resolve(root, token));
        }
    }
    return { paths, symbols };
}
const BOOL_FLAGS = {
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
};
const INT_FLAGS = {
    '--findings-limit': 'findingsLimit',
    '--min-function-statements': 'minFunctionStatements',
    '--min-flow-statements': 'minFlowStatements',
    '--critical-complexity-threshold': 'criticalComplexityThreshold',
    '--deep-link-topn': 'deepLinkTopN',
    '--tree-depth': 'treeDepth',
    '--coupling-threshold': 'couplingThreshold',
    '--fan-in-threshold': 'fanInThreshold',
    '--fan-out-threshold': 'fanOutThreshold',
    '--god-module-statements': 'godModuleStatements',
    '--god-module-exports': 'godModuleExports',
    '--god-function-statements': 'godFunctionStatements',
    '--cognitive-complexity-threshold': 'cognitiveComplexityThreshold',
    '--barrel-symbol-threshold': 'barrelSymbolThreshold',
    '--parameter-threshold': 'parameterThreshold',
    '--halstead-effort-threshold': 'halsteadEffortThreshold',
    '--maintainability-index-threshold': 'maintainabilityIndexThreshold',
    '--any-threshold': 'anyThreshold',
    '--flow-dup-threshold': 'flowDupThreshold',
    '--max-recs-per-category': 'maxRecsPerCategory',
    '--override-chain-threshold': 'overrideChainThreshold',
    '--secret-min-length': 'secretMinLength',
    '--mock-threshold': 'mockThreshold',
};
const FLOAT_FLAGS = {
    '--secret-entropy-threshold': 'secretEntropyThreshold',
    '--similarity-threshold': 'similarityThreshold',
};
const SPECIAL_FLAGS = {
    '--parser': (opts, argv, i) => {
        const next = argv[i + 1];
        if (!['auto', 'typescript', 'tree-sitter'].includes(next)) {
            console.error(`Unsupported parser: ${next}. Use auto|typescript|tree-sitter`);
            process.exit(1);
        }
        opts.parser = next;
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
        opts.layerOrder = argv[i + 1].split(',').map(s => s.trim());
        return i + 1;
    },
    '--help': () => {
        printHelp();
        return process.exit(0);
    },
    '-h': () => {
        printHelp();
        return process.exit(0);
    },
};
export function parseArgs(argv) {
    const opts = { ...DEFAULT_OPTS };
    let excludeSet = null;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (BOOL_FLAGS[arg]) {
            BOOL_FLAGS[arg](opts, true);
            continue;
        }
        if (INT_FLAGS[arg]) {
            const key = INT_FLAGS[arg];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            opts[key] = parseNumeric(argv[++i], DEFAULT_OPTS[key]);
            continue;
        }
        if (FLOAT_FLAGS[arg]) {
            const key = FLOAT_FLAGS[arg];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            opts[key] = parseDecimal(argv[++i], DEFAULT_OPTS[key]);
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
            const val = arg.includes('=') ? arg.split('=')[1] : argv[++i];
            const { paths, symbols } = parseScope(val, opts.root);
            opts.scope = paths;
            if (symbols.size > 0)
                opts.scopeSymbols = symbols;
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
    }
    opts.packageRoot = path.join(opts.root, 'packages');
    if (opts.features !== null && excludeSet !== null) {
        console.error('--features and --exclude are mutually exclusive. Use one or the other.');
        process.exit(1);
    }
    if (excludeSet !== null) {
        opts.features = new Set([...ALL_CATEGORIES].filter(c => !excludeSet.has(c)));
    }
    if (opts.features !== null) {
        const testQualityCats = new Set(PILLAR_CATEGORIES['test-quality']);
        if ([...opts.features].some(f => testQualityCats.has(f))) {
            opts.includeTests = true;
        }
    }
    return opts;
}
export function printHelp() {
    console.log(`
Usage:
  node scripts/run-scan.js [options]

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
                                Adds 14 categories: over-abstraction, concrete-dependency,
                                circular-type-dependency, unused-parameter,
                                deep-override-chain, interface-compliance, unused-import,
                                orphan-implementation, shotgun-surgery, move-to-caller,
                                narrowable-type, semantic-dead-export.
  --override-chain-threshold N  Max method override depth before flagging (default 3, requires --semantic)
  --secret-entropy-threshold N  Shannon entropy threshold for secret detection (default 4.5)
  --secret-min-length N         Min string length for entropy-based secret detection (default 20)
  --similarity-threshold N      Jaccard similarity threshold for near-clone detection (default 0.85)
  --mock-threshold N            Max mock/spy calls per test file (default 10)
  --no-diversify                Disable category-aware diversification when truncating findings.
                                By default, --findings-limit interleaves categories so the
                                truncated list is diverse. Use this to get pure severity ordering.
  --no-cache                    Disable incremental cache; re-parse all files
  --clear-cache                 Delete the analysis cache and exit (no scan)
  --all                         Enable all features: --include-tests --semantic
  --help                        Show this message
`);
}

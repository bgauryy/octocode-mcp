import path from 'node:path';
import { DEFAULT_OPTS, PILLAR_CATEGORIES, ALL_CATEGORIES } from './types.js';
export function parseArgs(argv) {
    const opts = { ...DEFAULT_OPTS };
    let excludeSet = null;
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
            opts.parser = next;
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
        if (arg === '--parameter-threshold') {
            opts.parameterThreshold = parseInt(argv[++i], 10);
            continue;
        }
        if (arg === '--halstead-effort-threshold') {
            opts.halsteadEffortThreshold = parseInt(argv[++i], 10);
            continue;
        }
        if (arg === '--maintainability-index-threshold') {
            opts.maintainabilityIndexThreshold = parseInt(argv[++i], 10);
            continue;
        }
        if (arg === '--cyclomatic-density-threshold') {
            opts.cyclomaticDensityThreshold = parseFloat(argv[++i]);
            continue;
        }
        if (arg === '--any-threshold') {
            opts.anyThreshold = parseInt(argv[++i], 10);
            continue;
        }
        if (arg === '--magic-number-threshold') {
            opts.magicNumberThreshold = parseInt(argv[++i], 10);
            continue;
        }
        if (arg === '--flow-dup-threshold') {
            opts.flowDupThreshold = parseInt(argv[++i], 10);
            continue;
        }
        if (arg === '--max-recs-per-category') {
            opts.maxRecsPerCategory = parseInt(argv[++i], 10);
            continue;
        }
        if (arg === '--scope' || arg.startsWith('--scope=')) {
            const val = arg.includes('=') ? arg.split('=')[1] : argv[++i];
            const paths = [];
            const symbols = new Map();
            for (const token of val.split(',').map((s) => s.trim()).filter(Boolean)) {
                const colonIdx = token.lastIndexOf(':');
                if (colonIdx > 0 && !token.substring(0, colonIdx).includes(':')) {
                    const filePart = token.substring(0, colonIdx);
                    const symbolPart = token.substring(colonIdx + 1);
                    const absFile = path.resolve(opts.root, filePart);
                    paths.push(absFile);
                    if (!symbols.has(absFile))
                        symbols.set(absFile, []);
                    symbols.get(absFile).push(symbolPart);
                }
                else {
                    paths.push(path.resolve(opts.root, token));
                }
            }
            opts.scope = paths;
            if (symbols.size > 0)
                opts.scopeSymbols = symbols;
            continue;
        }
        if (arg === '--features' || arg.startsWith('--features=')) {
            const val = arg.startsWith('--features=') ? arg.slice('--features='.length) : argv[++i];
            const tokens = val.split(',').map((s) => s.trim()).filter(Boolean);
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
                    console.error(`Unknown feature: "${token}". Use pillar names (${Object.keys(PILLAR_CATEGORIES).join(', ')}) or category names.`);
                    process.exit(1);
                }
            }
            opts.features = resolved;
            continue;
        }
        if (arg === '--exclude' || arg.startsWith('--exclude=')) {
            const val = arg.startsWith('--exclude=') ? arg.slice('--exclude='.length) : argv[++i];
            const tokens = val.split(',').map((s) => s.trim()).filter(Boolean);
            excludeSet = new Set();
            for (const token of tokens) {
                if (PILLAR_CATEGORIES[token]) {
                    for (const cat of PILLAR_CATEGORIES[token])
                        excludeSet.add(cat);
                }
                else if (ALL_CATEGORIES.has(token)) {
                    excludeSet.add(token);
                }
                else {
                    console.error(`Unknown exclude: "${token}". Use pillar names (${Object.keys(PILLAR_CATEGORIES).join(', ')}) or category names.`);
                    process.exit(1);
                }
            }
            continue;
        }
        if (arg === '--semantic') {
            opts.semantic = true;
            continue;
        }
        if (arg === '--type-hierarchy-threshold') {
            opts.typeHierarchyThreshold = parseInt(argv[++i], 10);
            continue;
        }
        if (arg === '--override-chain-threshold') {
            opts.overrideChainThreshold = parseInt(argv[++i], 10);
            continue;
        }
        if (arg === '--no-cache') {
            opts.noCache = true;
            continue;
        }
        if (arg === '--clear-cache') {
            opts.clearCache = true;
            continue;
        }
        if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        }
    }
    opts.packageRoot = path.join(opts.root, 'packages');
    if (Number.isNaN(opts.minFunctionStatements))
        opts.minFunctionStatements = DEFAULT_OPTS.minFunctionStatements;
    if (Number.isNaN(opts.minFlowStatements))
        opts.minFlowStatements = DEFAULT_OPTS.minFlowStatements;
    if (Number.isNaN(opts.findingsLimit))
        opts.findingsLimit = DEFAULT_OPTS.findingsLimit;
    if (Number.isNaN(opts.treeDepth))
        opts.treeDepth = DEFAULT_OPTS.treeDepth;
    if (Number.isNaN(opts.criticalComplexityThreshold)) {
        opts.criticalComplexityThreshold = DEFAULT_OPTS.criticalComplexityThreshold;
    }
    if (Number.isNaN(opts.deepLinkTopN)) {
        opts.deepLinkTopN = DEFAULT_OPTS.deepLinkTopN;
    }
    if (Number.isNaN(opts.couplingThreshold))
        opts.couplingThreshold = DEFAULT_OPTS.couplingThreshold;
    if (Number.isNaN(opts.fanInThreshold))
        opts.fanInThreshold = DEFAULT_OPTS.fanInThreshold;
    if (Number.isNaN(opts.fanOutThreshold))
        opts.fanOutThreshold = DEFAULT_OPTS.fanOutThreshold;
    if (Number.isNaN(opts.godModuleStatements))
        opts.godModuleStatements = DEFAULT_OPTS.godModuleStatements;
    if (Number.isNaN(opts.godModuleExports))
        opts.godModuleExports = DEFAULT_OPTS.godModuleExports;
    if (Number.isNaN(opts.godFunctionStatements))
        opts.godFunctionStatements = DEFAULT_OPTS.godFunctionStatements;
    if (Number.isNaN(opts.cognitiveComplexityThreshold))
        opts.cognitiveComplexityThreshold = DEFAULT_OPTS.cognitiveComplexityThreshold;
    if (Number.isNaN(opts.barrelSymbolThreshold))
        opts.barrelSymbolThreshold = DEFAULT_OPTS.barrelSymbolThreshold;
    if (Number.isNaN(opts.parameterThreshold))
        opts.parameterThreshold = DEFAULT_OPTS.parameterThreshold;
    if (Number.isNaN(opts.halsteadEffortThreshold))
        opts.halsteadEffortThreshold = DEFAULT_OPTS.halsteadEffortThreshold;
    if (Number.isNaN(opts.maintainabilityIndexThreshold))
        opts.maintainabilityIndexThreshold = DEFAULT_OPTS.maintainabilityIndexThreshold;
    if (Number.isNaN(opts.cyclomaticDensityThreshold))
        opts.cyclomaticDensityThreshold = DEFAULT_OPTS.cyclomaticDensityThreshold;
    if (Number.isNaN(opts.anyThreshold))
        opts.anyThreshold = DEFAULT_OPTS.anyThreshold;
    if (Number.isNaN(opts.magicNumberThreshold))
        opts.magicNumberThreshold = DEFAULT_OPTS.magicNumberThreshold;
    if (Number.isNaN(opts.flowDupThreshold))
        opts.flowDupThreshold = DEFAULT_OPTS.flowDupThreshold;
    if (Number.isNaN(opts.maxRecsPerCategory))
        opts.maxRecsPerCategory = DEFAULT_OPTS.maxRecsPerCategory;
    if (Number.isNaN(opts.typeHierarchyThreshold))
        opts.typeHierarchyThreshold = DEFAULT_OPTS.typeHierarchyThreshold;
    if (Number.isNaN(opts.overrideChainThreshold))
        opts.overrideChainThreshold = DEFAULT_OPTS.overrideChainThreshold;
    if (opts.features !== null && excludeSet !== null) {
        console.error('--features and --exclude are mutually exclusive. Use one or the other.');
        process.exit(1);
    }
    if (excludeSet !== null) {
        opts.features = new Set([...ALL_CATEGORIES].filter((c) => !excludeSet.has(c)));
    }
    return opts;
}
export function printHelp() {
    console.log(`
Usage:
  node scripts/index.js [options]

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
  --cyclomatic-density-threshold N
                                Cyclomatic/LOC ratio threshold (default 0.5)
  --any-threshold N             Max \`any\` type usages per file before flagging (default 5)
  --magic-number-threshold N    Max magic number occurrences per file before flagging (default 3)
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
                                code-quality, dead-code) or individual category names. Comma-separated.
                                Examples: --features=architecture
                                          --features=dead-code,cognitive-complexity
                                          --features=dependency-cycle,dead-export
  --exclude=X,Y,Z               Run everything EXCEPT the given pillars or categories. Mutually
                                exclusive with --features. Same pillar/category names as --features.
                                Examples: --exclude=architecture
                                          --exclude=dead-export,magic-number
  --semantic                    Enable semantic analysis phase (TypeChecker + LanguageService).
                                Adds 10 categories: semantic-dead-export, over-abstraction,
                                concrete-dependency, circular-type-dependency, unused-parameter,
                                type-hierarchy-depth, deep-override-chain, interface-compliance,
                                unused-import, orphan-implementation.
  --type-hierarchy-threshold N  Max inheritance depth before flagging (default 4, requires --semantic)
  --override-chain-threshold N  Max method override depth before flagging (default 3, requires --semantic)
  --no-cache                    Disable incremental cache; re-parse all files
  --clear-cache                 Delete the analysis cache and exit (no scan)
  --help                        Show this message
`);
}

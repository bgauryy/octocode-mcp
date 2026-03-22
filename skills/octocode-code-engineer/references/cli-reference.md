# CLI Reference

```bash
node <SKILL_DIR>/scripts/index.js [flags]
```

Output goes to `.octocode/scan/<timestamp>/` by default. Results are cached — subsequent runs skip unchanged files (~4x faster).

---

## CLI Presets

| Situation | Flags |
|---|---|
| Default scan | _(none)_ |
| Analyze different repo | `--root /path/to/other/repo` |
| Legacy single-file output | `--out path/to/report.json` |
| Scope to one package | `--scope=packages/my-package` |
| Scope to a directory | `--scope=packages/my-package/src/tools` |
| Scope to a single file | `--scope=packages/my-package/src/session.ts` |
| Scope to a function | `--scope=packages/my-package/src/session.ts:initSession` |
| Scope to multiple areas | `--scope=packages/foo/src/tools,packages/bar/src/ui` |
| Architecture only | `--features=architecture` |
| Code quality only | `--features=code-quality` |
| Dead code only | `--features=dead-code` |
| Security only | `--features=security` |
| Test quality only | `--features=test-quality --include-tests` |
| Single category | `--features=cognitive-complexity` |
| Mix pillars + categories | `--features=dead-code,dependency-cycle` |
| Everything except X | `--exclude=architecture` |
| Exclude specific categories | `--exclude=dead-export,magic-number` |
| Cap findings (diverse) | `--findings-limit 500` |
| Cap findings (pure severity) | `--findings-limit 500 --no-diversify` |
| Include tests | `--include-tests` |
| Architecture graph | `--graph` |
| Advanced graph overlays | `--graph --graph-advanced` |
| Flow enrichment | `--flow` |
| Suppress AST tree output | `--no-tree` |
| Strict complexity | `--critical-complexity-threshold 20 --cognitive-complexity-threshold 10` |
| Strict type safety | `--any-threshold 0` |
| Strict maintainability | `--maintainability-index-threshold 30 --halstead-effort-threshold 200000` |
| Layer enforcement | `--layer-order ui,service,repository` |
| Sensitive flow dups | `--flow-dup-threshold 2 --min-flow-statements 4` |
| Diverse top recs | `--max-recs-per-category 1` |
| Enable semantic analysis | `--semantic` |
| Semantic + scope combo | `--semantic --scope=packages/my-package` |
| Only semantic categories | `--semantic --features=unused-parameter,shotgun-surgery` |
| Deep hierarchy threshold | `--semantic --type-hierarchy-threshold 6` |
| Detect near-clones | `--similarity-threshold 0.8` |
| Strict security | `--secret-entropy-threshold 4.0 --secret-min-length 16` |
| Strict test quality | `--mock-threshold 5 --include-tests --features=test-quality` |
| Force full re-parse | `--no-cache` |
| Clear cache | `--clear-cache` |
| JSON to stdout | `--json` |

---

## Flag Details

`--scope` focuses on specific paths (comma-separated, relative to root). Use `file:symbol` syntax to drill into a specific function or exported variable — only findings whose line range overlaps with that symbol are returned. The full dependency graph is still built so architecture findings involving scoped files are reported. Combinable with `--features`/`--exclude`.

`--features` and `--exclude` are mutually exclusive. Both accept pillar names (`architecture`, `code-quality`, `dead-code`, `security`, `test-quality`) and individual category names, comma-separated.

`--semantic` enables TypeChecker + LanguageService analysis (additional categories). Off by default since it adds ~3-5s. Semantic categories require `--semantic` to appear in results.

`--out` changes the output destination. If the path ends with `.json`, writes a single monolithic file (legacy mode). Otherwise, writes to the given directory instead of the default timestamped directory.

`--parser` selects the parse engine: `auto` (default — uses tree-sitter with TS fallback), `typescript` (TS compiler only), or `tree-sitter` (tree-sitter only).

---

## All Flags Reference

### Core

| Flag | Default | Description |
|------|---------|-------------|
| `--root <path>` | cwd | Analyze a different repo root |
| `--out <path>` | `.octocode/scan/<ts>/` | Output path. Ends in `.json` → single-file legacy mode |
| `--json` | off | Print report JSON to stdout |
| `--include-tests` | off | Include `*.test.*` and `*.spec.*` files |
| `--scope=X,Y,Z` | _(all files)_ | Limit to specific paths/files/functions (comma-separated) |
| `--features=X,Y,Z` | _(all)_ | Run only selected pillars/categories |
| `--exclude=X,Y,Z` | _(none)_ | Exclude specific pillars/categories (mutually exclusive with `--features`) |
| `--findings-limit N` | no limit | Cap total findings in report |
| `--graph` | off | Emit Mermaid dependency graph (`graph.md`) |
| `--graph-advanced` | off | Enable SCC clusters, chokepoints, package graph hotspots, and advanced architecture findings |
| `--flow` | off | Enable lightweight flow enrichment such as `cfgFlags`, `flowTrace`, and richer evidence metadata |
| `--emit-tree` | **on** | Force include AST tree blocks in output |
| `--no-tree` | — | Suppress AST tree output (`ast-trees.txt`) |
| `--parser <engine>` | `auto` | Parse engine: `auto`, `typescript`, `tree-sitter` |
| `--semantic` | off | Enable semantic analysis (TypeChecker + LanguageService) |
| `--no-diversify` | off | Disable category-aware diversification when truncating. By default `--findings-limit` interleaves categories so the capped list is diverse. Use this for pure severity ordering. |
| `--no-cache` | off | Disable incremental cache; re-parse all files |
| `--clear-cache` | — | Delete the analysis cache and exit (no scan) |
| `--all` | off | Enable all features: `--include-tests --semantic` |
| `--help`, `-h` | — | Show help message |

### Thresholds — Architecture

| Flag | Default | Controls |
|------|---------|----------|
| `--coupling-threshold N` | 15 | Ca+Ce threshold for `high-coupling` |
| `--fan-in-threshold N` | 20 | Fan-in threshold for `god-module-coupling` |
| `--fan-out-threshold N` | 15 | Fan-out threshold for `god-module-coupling` |
| `--layer-order <layers>` | _(none)_ | Comma-separated layer names for violation detection |
| `--deep-link-topn N` | 12 | Max critical dependency paths to report |

### Thresholds — Code Quality

| Flag | Default | Controls |
|------|---------|----------|
| `--critical-complexity-threshold N` | 30 | Complexity for HIGH findings + critical path weighting |
| `--cognitive-complexity-threshold N` | 15 | Cognitive complexity threshold |
| `--halstead-effort-threshold N` | 500000 | Halstead effort threshold |
| `--maintainability-index-threshold N` | 20 | MI below this triggers a finding (0-100 scale) |
| `--parameter-threshold N` | 5 | Max function parameters before flagging |
| `--any-threshold N` | 5 | Max `any` type usages per file |
| `--god-module-statements N` | 500 | Statement threshold for `god-module` |
| `--god-module-exports N` | 20 | Export threshold for `god-module` |
| `--god-function-statements N` | 100 | Statement threshold for `god-function` |
| `--god-function-mi-threshold N` | 10 | MI threshold for `god-function` (fires when MI < N and LOC > 30) |
| `--min-function-statements N` | 6 | Min function body statements for duplicate matching |
| `--min-flow-statements N` | 6 | Min control-flow statements for duplicate matching |
| `--flow-dup-threshold N` | 3 | Min occurrences for a repeated flow to become a finding |
| `--similarity-threshold N` | 0.85 | Jaccard similarity threshold for near-clone detection |
| `--max-recs-per-category N` | 2 | Max findings per category in top recommendations |

### Thresholds — Semantic (require `--semantic`)

| Flag | Default | Controls |
|------|---------|----------|
| `--type-hierarchy-threshold N` | 4 | Max inheritance depth before flagging |
| `--override-chain-threshold N` | 3 | Max method override depth before flagging |
| `--shotgun-threshold N` | 8 | Unique-file threshold for `shotgun-surgery` |

### Thresholds — Security

| Flag | Default | Controls |
|------|---------|----------|
| `--secret-entropy-threshold N` | 4.5 | Shannon entropy threshold for high-entropy string detection |
| `--secret-min-length N` | 20 | Min string length for entropy-based secret detection |

### Thresholds — Test Quality

| Flag | Default | Controls |
|------|---------|----------|
| `--mock-threshold N` | 10 | Max mock/spy calls per test file before flagging |

### Output Tuning

| Flag | Default | Controls |
|------|---------|----------|
| `--tree-depth N` | 4 | AST tree depth when tree snapshots are emitted |
| `--barrel-symbol-threshold N` | 30 | Re-export count threshold for `barrel-explosion` |

---

## Drill-Down Workflow

```
1. Full scan                     → identify hotspots from summary.md
2. --scope=critical/area         → deep-dive into the worst package/directory
3. --scope=file.ts               → investigate a single file's findings
4. --scope=file.ts:functionName  → drill into a specific function or variable
5. Fix → re-scan with scope      → verify finding count drops
```

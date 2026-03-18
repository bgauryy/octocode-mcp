<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">

  <h1>Octocode Local Code Quality</h1>

  <p><strong>AST + semantic code quality scanner for TypeScript/JavaScript monorepos</strong></p>
  <p>51 finding categories · severity-ranked · file:line precision · lspHints for validation · actionable fix strategies</p>

  [![Skill](https://img.shields.io/badge/skill-agentskills.io-purple)](https://agentskills.io/what-are-skills)
  [![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE)

</div>

---

## Why This Tool?

Most linters catch syntax issues. This scanner catches **architectural rot** — the kind of problems that make codebases expensive to change, hard to onboard into, and fragile under refactoring.

**What it finds that ESLint/TSC won't:**

- Dependency cycles hiding across 5 modules that nobody notices until a refactor breaks everything
- "God modules" that 40 other files depend on — a single change ripples everywhere
- 200+ dead exports that bloat your public API surface and confuse contributors
- Stable core modules coupled to volatile helpers, violating the Stable Dependencies Principle
- Entire file subgraphs unreachable from any entrypoint — dead code your IDE can't detect
- Barrel files re-exporting 80+ symbols, creating import chains 3 levels deep

**With `--semantic`:** TypeChecker + LanguageService upgrade adds 13 more categories — shotgun surgery risk, leaky abstractions, narrowable types, move-to-caller candidates, over-abstraction, DIP violations, unused parameters, deep inheritance, and more. Findings include `lspHints` for instant agent validation.

**Why it's fast:** Incremental caching means the first scan takes ~3s for a 400-file monorepo; subsequent scans take <1s by skipping unchanged files.

**Why it's actionable:** Every finding comes with a severity, exact `file:line` location, a reason explaining *why* it matters, and a `suggestedFix` with concrete remediation steps.

---

## Quick Start

```bash
# Run from your monorepo root (scripts are pre-built — no install needed)
node skills/octocode-local-code-quality/scripts/index.js
```

Output goes to `.octocode/scan/<timestamp>/` with 7+ structured files. Start with `summary.md`.

### Common Patterns

```bash
# Architecture issues only
node skills/octocode-local-code-quality/scripts/index.js --features=architecture

# Everything except dead-code noise
node skills/octocode-local-code-quality/scripts/index.js --exclude=dead-code

# Include test files in scan
node skills/octocode-local-code-quality/scripts/index.js --include-tests

# Visual dependency graph (Mermaid)
node skills/octocode-local-code-quality/scripts/index.js --graph

# Enforce layer architecture
node skills/octocode-local-code-quality/scripts/index.js --layer-order ui,service,repository

# Stricter thresholds for a mature codebase
node skills/octocode-local-code-quality/scripts/index.js \
  --critical-complexity-threshold 20 \
  --cognitive-complexity-threshold 10 \
  --any-threshold 0

# Focus on a specific package
node skills/octocode-local-code-quality/scripts/index.js --scope=packages/octocode-mcp

# Focus on a directory or file
node skills/octocode-local-code-quality/scripts/index.js --scope=packages/octocode-mcp/src/tools
node skills/octocode-local-code-quality/scripts/index.js --scope=packages/octocode-mcp/src/session.ts

# Focus on a specific function or exported variable
node skills/octocode-local-code-quality/scripts/index.js --scope=packages/octocode-mcp/src/session.ts:sendLog
node skills/octocode-local-code-quality/scripts/index.js --scope=packages/octocode-mcp/src/utils/exec/spawn.ts:spawnWithTimeout

# Combine scope with features
node skills/octocode-local-code-quality/scripts/index.js --scope=packages/octocode-mcp --features=architecture

# JSON to stdout for piping
node skills/octocode-local-code-quality/scripts/index.js --json

# Force full re-parse (ignore cache)
node skills/octocode-local-code-quality/scripts/index.js --no-cache

# Enable semantic analysis (TypeChecker + LanguageService, 10 extra categories)
node skills/octocode-local-code-quality/scripts/index.js --semantic

# Semantic + scope for targeted deep analysis
node skills/octocode-local-code-quality/scripts/index.js --semantic --scope=packages/octocode-mcp

# Only semantic categories (e.g. dead exports + unused params)
node skills/octocode-local-code-quality/scripts/index.js --semantic --features=shotgun-surgery,unused-parameter
```

### Drill-Down Workflow

The recommended workflow for investigating a codebase:

```
1. Full scan        → node scripts/index.js
                      Read summary.md to identify worst areas

2. Package scope    → node scripts/index.js --scope=packages/worst-package
                      Get detailed findings for one package

3. Directory scope  → node scripts/index.js --scope=packages/worst-package/src/tools
                      Narrow to the hotspot directory

4. File scope       → node scripts/index.js --scope=packages/worst-package/src/tools/hub.ts
                      Single-file analysis (4 findings for a typical file)

5. Function scope   → node scripts/index.js --scope=packages/worst-package/src/tools/hub.ts:processRequest
                      Only findings within that function's line range

6. Fix & re-scan    → Fix issues, re-run with same --scope, verify count drops
```

`--scope` accepts comma-separated paths (relative to root). Use `file:symbol` syntax to drill into a specific function or exported variable — only findings whose line range overlaps with that symbol are returned. The full dependency graph is always built, so architecture findings involving scoped files (cycles, critical paths) are still reported.

---

## What Gets Scanned

| Included | Excluded |
|----------|----------|
| `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` | `.d.ts` declaration files |
| All files under `packages/*/` | `node_modules/`, `dist/`, `.git/`, `.next/`, `.cache/`, `.octocode/`, `coverage/` |
| Production code (default) | Test files (unless `--include-tests`) |

---

## Finding Categories (51)

Every finding includes: severity (`critical`/`high`/`medium`/`low`), exact `file:line`, reason, `suggestedFix` with strategy + steps, and optional `lspHints[]` for agent validation.

### Architecture Risk (19)

| Category | Severity | What It Detects | Requires |
|----------|----------|-----------------|----------|
| `dependency-cycle` | high | Circular import chains between modules | — |
| `dependency-critical-path` | high — critical | High-weight transitive dependency chains (blast radius) | — |
| `dependency-test-only` | medium | Production modules imported only from tests | — |
| `architecture-sdp-violation` | medium — high | Stable module depends on unstable module (`I = Ce/(Ca+Ce)`) | — |
| `high-coupling` | medium — high | Excessive total connections (Ca + Ce) | — |
| `god-module-coupling` | medium — high | Too many dependents (fan-in) or dependencies (fan-out) | — |
| `orphan-module` | medium | Zero inbound and zero outbound dependencies | — |
| `unreachable-module` | high | Not reachable from any entrypoint via BFS | — |
| `layer-violation` | high | Import backwards in configured layer order | — |
| `low-cohesion` | medium — high | Exports serve unrelated purposes (LCOM > 1) | — |
| `inferred-layer-violation` | medium — high | Auto-detected layer boundary crossed | — |
| `distance-from-main-sequence` | medium — high | Module far from A + I = 1 ideal | — |
| `feature-envy` | medium — high | Module imports 60%+ symbols from a single external module | — |
| `untested-critical-code` | high — critical | High-risk file with zero test imports | — |
| `over-abstraction` | medium | Interface/abstract with exactly 1 implementor | `--semantic` |
| `concrete-dependency` | medium | Import resolves to concrete class (DIP violation) | `--semantic` |
| `circular-type-dependency` | high | Type-level circular references between types | `--semantic` |
| `shotgun-surgery` | medium — high | Export referenced from 8+ unique files (change amplification risk) | `--semantic` |
| `leaky-abstraction` | medium | Exported function returns type defined in internal module | `--semantic` |

### Code Quality (22)

| Category | Severity | What It Detects | Requires |
|----------|----------|-----------------|----------|
| `duplicate-function-body` | low — high | Identical function implementations (AST fingerprint) | — |
| `duplicate-flow-structure` | medium — high | Repeated if/switch/try control-flow patterns | — |
| `function-optimization` | medium — high | High cyclomatic complexity, deep nesting, oversized functions | — |
| `cognitive-complexity` | medium — high | Nesting-aware complexity score | — |
| `god-module` | high | Files >500 statements or >20 exports | — |
| `god-function` | high | Functions >100 statements | — |
| `halstead-effort` | medium — high | Halstead effort > 500K or estimated bugs > 2.0 | — |
| `low-maintainability` | high — critical | Maintainability Index < 20 (scale 0-100) | — |
| `high-cyclomatic-density` | medium — high | Complexity/LOC > 0.5 | — |
| `excessive-parameters` | medium — high | Function >5 parameters | — |
| `magic-number` | medium — high | >3 magic number literals per file | — |
| `unsafe-any` | medium — high | >5 `any` types per file | — |
| `empty-catch` | medium | Empty catch block silently swallows errors | — |
| `switch-no-default` | low | Switch missing default case | — |
| `type-assertion-escape` | medium — high | `as any`, `as unknown as T`, non-null `!` assertions | — |
| `missing-error-boundary` | medium — high | Async function with await(s) but no try-catch | — |
| `promise-misuse` | medium | `async` function that never uses `await` | — |
| `unused-parameter` | medium | Function parameter never referenced in body (semantic) | `--semantic` |
| `type-hierarchy-depth` | medium — high | Inheritance chain > 4 levels deep | `--semantic` |
| `deep-override-chain` | medium — high | Method overridden > 3 levels deep in hierarchy | `--semantic` |
| `interface-compliance` | medium — high | Class `implements I` with missing/any-cast members | `--semantic` |
| `narrowable-type` | low | Parameter declared broad but all callers pass narrow type | `--semantic` |

### Dead Code & Hygiene (10)

| Category | Severity | What It Detects | Requires |
|----------|----------|-----------------|----------|
| `dead-export` | medium — high | Exported symbol with no observed usage (import matching) | — |
| `dead-re-export` | medium | Barrel re-export with no downstream consumers | — |
| `re-export-duplication` | medium | Same symbol re-exported from multiple paths | — |
| `re-export-shadowed` | high | Local export and re-export name collision in barrel | — |
| `unused-npm-dependency` | low — medium | package.json dependency not imported anywhere | — |
| `package-boundary-violation` | medium — high | Cross-package import bypassing public API | — |
| `barrel-explosion` | medium — high | Barrel >30 re-exports or chain >2 levels deep | — |
| `unused-import` | low | Imported symbol never semantically used (TypeChecker) | `--semantic` |
| `orphan-implementation` | medium | Exported class with no external refs and no interface | `--semantic` |
| `move-to-caller` | low | Exported symbol consumed by exactly 1 file (candidate for inlining) | `--semantic` |

---

## Output Files

Each scan writes to `.octocode/scan/<timestamp>/`:

| File | What's Inside |
|------|--------------|
| **`summary.md`** | Start here. Scope, severity breakdown, per-pillar category counts, change risk hotspots, top 10 recommendations, output file index |
| `summary.json` | Machine-readable counters, `topRecommendations[]`, `parseErrors[]` |
| `architecture.json` | Dependency graph, up to 19 arch findings, `hotFiles[]` (riskScore, fanIn, fanOut, inCycle, onCriticalPath) |
| `code-quality.json` | Up to 22 quality findings with severity/category breakdowns |
| `dead-code.json` | Up to 10 hygiene findings with severity/category breakdowns |
| `file-inventory.json` | Per-file: `functions[]` (Halstead, MI, cognitive), `flows[]`, `dependencyProfile`, `issueIds[]` |
| `findings.json` | ALL findings across all 51 categories, sorted by severity, with `lspHints[]` |
| `graph.md` | Mermaid dependency graph (with `--graph`) |
| `ast-trees.txt` | Compact AST snapshots (with `--emit-tree`) |

### Each Finding

```json
{
  "id": "AST-ISSUE-0001",
  "severity": "high",
  "category": "shotgun-surgery",
  "file": "packages/core/src/utils.ts",
  "lineStart": 15,
  "lineEnd": 15,
  "title": "Semantically dead export: formatDate",
  "reason": "Exported symbol \"formatDate\" has zero semantic references across the entire program.",
  "files": ["packages/core/src/utils.ts"],
  "suggestedFix": {
    "strategy": "Remove the export or delete the symbol if unused internally.",
    "steps": [
      "Verify not used via dynamic imports or runtime reflection.",
      "Remove the export keyword, or delete the symbol entirely.",
      "Re-run scan to confirm finding is resolved."
    ]
  },
  "impact": "Dead exports bloat the public API surface and confuse contributors.",
  "tags": ["architecture", "dead-code", "semantic"],
  "lspHints": [{
    "tool": "lspFindReferences",
    "symbolName": "formatDate",
    "lineHint": 15,
    "file": "packages/core/src/utils.ts",
    "expectedResult": "zero references confirms dead export"
  }]
}
```

---

## Scan + Octocode MCP = Full Picture

The scan works standalone, but pairing it with [Octocode MCP local & LSP tools](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) gives **semantic validation** — confirming findings and eliminating false positives before you change code.

| Scan finds | Octocode MCP confirms with |
|------------|---------------------------|
| Dead export at `file:line` | `lspFindReferences` — zero consumers? confirmed dead |
| Dependency cycle `A → B → A` | `localSearchCode` → `lspGotoDefinition` — traces the circular import |
| High-complexity function | `lspCallHierarchy(outgoing)` — maps callees to understand scope |
| Unused npm dependency | `localSearchCode(filesOnly=true)` — no imports? safe to remove |
| SDP violation | `lspCallHierarchy(incoming/outgoing)` — confirms instability values |

**Enable local tools** by setting `ENABLE_LOCAL=true` in your Octocode MCP configuration:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp"],
      "env": { "ENABLE_LOCAL": "true" }
    }
  }
}
```

> **No Octocode MCP?** The scan still produces all 51 categories with full detail. You just skip the LSP validation step. Semantic findings include `lspHints[]` that make Octocode MCP validation a single-step operation.

---

## Performance

| Metric | Value |
|--------|-------|
| Cold scan (400-file monorepo) | ~3s |
| Cold scan + `--semantic` | ~5-8s |
| Cached scan (no changes) | <1s |
| Cache location | `.octocode/scan/.cache/` |
| Cache key | file path + mtime + size |

Incremental caching stores per-file AST analysis results. On subsequent runs, unchanged files are served from cache. Dependency graph analysis always runs fresh since it depends on cross-file relationships.

`--semantic` adds ~3-5s for TypeChecker + LanguageService program creation. `--scope` limits which files get semantic profiling but the full program is still created for type resolution.

Use `--no-cache` to force a full re-parse. Use `--clear-cache` to delete the cache and exit.

---

## CLI Reference

```
node scripts/index.js [options]

Core:
  --root <path>                       Repo root (default: cwd)
  --out <path>                        Output directory (timestamped by default).
                                      Ends with .json → single monolithic file (legacy).
  --json                              Print JSON to stdout
  --include-tests                     Include test files in scan
  --parser <auto|typescript|tree-sitter>  Parser engine (default: auto)
  --graph                             Emit Mermaid dependency graph

Scope:
  --scope=X,Y,Z                       Focus scan on specific paths (comma-separated, relative to root).
                                      Accepts packages, directories, files, or file:symbol.
                                      file:symbol drills into a specific function or variable.
                                      Full dep graph is still built for architecture findings.

Feature selection:
  --features=X,Y,Z                    Run only selected pillars/categories
                                      Pillars: architecture, code-quality, dead-code
                                      Categories: any of the 51 category names
  --exclude=X,Y,Z                     Run everything EXCEPT the listed pillars/categories
                                      Mutually exclusive with --features

Semantic analysis:
  --semantic                           Enable TypeChecker + LanguageService (10 extra categories)
  --type-hierarchy-threshold N         Max inheritance depth (default: 4, requires --semantic)
  --override-chain-threshold N         Max override depth (default: 3, requires --semantic)

Findings:
  --findings-limit N                  Cap findings in report (default: no limit)
  --max-recs-per-category N           Max per category in top recommendations (default: 2)

Complexity thresholds:
  --critical-complexity-threshold N   Cyclomatic complexity for HIGH (default: 30)
  --cognitive-complexity-threshold N  Cognitive complexity threshold (default: 15)
  --min-function-statements N         Min statements for duplicate matching (default: 6)
  --min-flow-statements N             Min control-flow statements for matching (default: 6)
  --flow-dup-threshold N              Min occurrences for flow duplicate finding (default: 3)

Architecture thresholds:
  --coupling-threshold N              Ca+Ce for high-coupling (default: 15)
  --fan-in-threshold N                Fan-in for god-module-coupling (default: 20)
  --fan-out-threshold N               Fan-out for god-module-coupling (default: 15)
  --layer-order <layers>              Comma-separated layer order (e.g. ui,service,repository)

Module size thresholds:
  --god-module-statements N           Statements for god-module (default: 500)
  --god-module-exports N              Exports for god-module (default: 20)
  --god-function-statements N         Statements for god-function (default: 100)
  --barrel-symbol-threshold N         Re-exports for barrel-explosion (default: 30)

Code quality thresholds:
  --parameter-threshold N             Max function parameters (default: 5)
  --halstead-effort-threshold N       Halstead effort threshold (default: 500000)
  --maintainability-index-threshold N MI below this triggers finding (default: 20)
  --cyclomatic-density-threshold N    CC/LOC ratio threshold (default: 0.5)
  --any-threshold N                   Max any types per file (default: 5)
  --magic-number-threshold N          Max magic numbers per file (default: 3)

Cache:
  --no-cache                          Force full re-parse (ignore cache)
  --clear-cache                       Delete analysis cache and exit

Output:
  --deep-link-topn N                  Max critical paths reported (default: 12)
  --tree-depth N                      AST tree depth (default: 4)
  --no-tree                           Skip AST tree snapshots
  --emit-tree                         Force include AST trees
  --help                              Show help
```

---

## How It Works

Analysis through 11 stages:

```
 1. DISCOVER     Find packages/ with valid package.json, read npm deps
 2. CACHE CHECK  Load incremental cache, skip unchanged files
 3. PARSE        TypeScript compiler API parses each file into AST
 4. EXTRACT      Functions (complexity, nesting, Halstead, cognitive, MI)
                 Control flow patterns (if/switch/try/for fingerprints)
                 Exports, imports, re-exports (symbol-level tracking)
 5. FINGERPRINT  Hash function bodies + control structures → find duplicates
 6. GRAPH        Build import graph from import/require statements
                 Detect cycles (DFS), compute critical paths (weighted DAG)
                 Identify roots, leaves, hubs, test-only modules
 7. ARCHITECTURE Instability + SDP, coupling metrics, fan-in/fan-out
                 Orphan detection, BFS reachability, layer violations
 8. HYGIENE      Dead files/exports/re-exports, npm deps, barrel explosion
 9. SEMANTIC     (--semantic) TypeChecker + LanguageService analysis:
                 Dead exports, over-abstraction, DIP violations, type cycles,
                 unused params, deep inheritance, interface compliance,
                 unused imports, orphan implementations
10. CATALOG      46-category findings with severity, locations, fix strategies, lspHints
11. REPORT       Split files to output dir, summary.md, optional graph
```

---

## Key Concepts

### Instability (SDP)

`I(module) = Ce / (Ca + Ce)` — Ca = modules depending on this (inbound), Ce = modules this depends on (outbound). I=0 maximally stable, I=1 maximally unstable. The **Stable Dependencies Principle** says stable modules should not depend on unstable modules.

### Cognitive Complexity

Unlike cyclomatic complexity (branch counting), cognitive complexity penalizes **nesting depth**. Each `if`/`for`/`while`/`switch`/`catch`/`&&`/`||` adds +1, each nesting level adds +1 more. Higher scores correlate with more bugs and slower reviews.

### Reachability

BFS traversal from entrypoints (`index`, `main`, `app`, `server`, `cli`, `public`, `*.config.*`). Modules not reached are flagged as `unreachable-module`. This catches entire dead subgraphs that direct-import checks miss.

### Package Boundaries

In monorepos, `packages/A/` should import from `packages/B/src/index.ts` (public API), not `packages/B/src/internal/bar.ts`. Bypassing the public entry couples code to another package's internals.

---

## Testing

```bash
yarn test          # Run all tests
yarn test:watch    # Watch mode
```

450 tests across 8 test files:

| Test File | Coverage |
|-----------|----------|
| `cli.test.ts` | CLI flags, NaN guards, `--features`/`--exclude`/`--semantic` parsing, defaults |
| `utils.test.ts` | Hash, fingerprint, path normalization, test file detection |
| `dependencies.test.ts` | Import/export/re-export parsing from AST, edge tracking |
| `ts-analyzer.test.ts` | Function detection, metric collection, source file analysis |
| `architecture.test.ts` | All architecture + hygiene detection functions |
| `index.test.ts` | Cycles, critical paths, issue catalog, dead code, `diverseTopRecommendations`, features filtering, end-to-end output validation |
| `semantic.test.ts` | SemanticContext creation, all 10 semantic detectors, `SEMANTIC_CATEGORIES`, `collectAllAbsoluteFiles` |
| `sanity.test.ts` | Basic sanity checks |

---

## Project Structure

```
skills/octocode-local-code-quality/
├── src/
│   ├── index.ts              Orchestrator: scan pipeline + issue catalog
│   ├── architecture.ts       36 detect*() functions (architecture + quality + dead code)
│   ├── semantic.ts           SemanticContext, LanguageService, semantic profiling
│   ├── semantic-detectors.ts 10 detect*() functions for semantic categories
│   ├── ts-analyzer.ts        TypeScript AST analysis + metric collection
│   ├── tree-sitter-analyzer.ts  Optional tree-sitter enrichment
│   ├── dependencies.ts       Import/export/re-export tracking
│   ├── discovery.ts          File discovery + package listing
│   ├── ast-search.ts         Structural search CLI (ast-grep powered)
│   ├── cli.ts                CLI argument parsing
│   ├── types.ts              Interfaces, constants, PILLAR_CATEGORIES, defaults
│   ├── utils.ts              Hash, fingerprint, path, helpers
│   ├── cache.ts              Incremental analysis cache (mtime+size keyed)
│   └── *.test.ts             Test files (9 files, 500+ tests)
├── scripts/                  Compiled JS output (pre-built, ready to run)
├── references/
│   └── ast-search.md         AST Search reference (patterns, presets, CLI, API)
├── SKILL.md                  Agent workflow protocol
├── README.md                 This file
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## References

| Document | Description |
|----------|-------------|
| [SKILL.md](./SKILL.md) | Agent workflow: how to run, present, validate, and investigate findings |
| [AST Search Reference](./references/ast-search.md) | Structural code search: patterns, kinds, 16 presets, raw rules, CLI flags, API |
| [Local Tools Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) | Octocode MCP local + LSP tools for semantic validation |
| [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md) | Octocode MCP config (`ENABLE_LOCAL=true`) |
| [Troubleshooting](https://github.com/bgauryy/octocode-mcp/blob/main/docs/TROUBLESHOOTING.md) | Common issues and solutions |

---

## License

MIT License © 2026 Octocode — see [LICENSE](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE).

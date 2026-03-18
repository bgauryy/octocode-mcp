<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">

  <h1>Octocode Local Code Quality</h1>

  <p><strong>AST + semantic code quality scanner for TypeScript/JavaScript monorepos</strong></p>
  <p>Architecture · Code Quality · Performance · Security · Dead Code · Test Quality</p>

  [![Skill](https://img.shields.io/badge/skill-agentskills.io-purple)](https://agentskills.io/what-are-skills)
  [![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE)

</div>

---

## Capabilities

| Pillar | What it finds | When to use |
|--------|--------------|-------------|
| **Architecture** | Dependency cycles, SDP violations, coupling hotspots, god modules, unreachable code, layer violations, critical paths (auto-merged overlapping chains with computed break points), untested critical code, import side-effect risk, feature envy, distance from main sequence, cohesion | "Check architecture", "find cycles", "trace dependencies" |
| **Code Quality** | Complexity (cognitive, Halstead, MI), duplicates (exact + near-clone), excessive parameters, magic numbers, type safety (`any`, assertions) | "Audit code quality", "find complex code", "find duplicates" |
| **Performance** | await-in-loop (N+1), synchronous I/O, uncleared timers, event listener leaks, unbounded collections | "Find performance issues", "check async patterns" |
| **Security** | Hardcoded secrets, eval/Function injection, innerHTML/XSS, SQL injection risk, catastrophic regex, prototype pollution (Object.assign, deep merge, computed property writes), unvalidated input-to-sink flows, input passthrough with confidence tiers | "Security review", "find secrets", "check for XSS", "check input validation" |
| **Dead Code** | Dead exports, dead re-exports, semantic dead exports, unused npm deps, package boundary violations, barrel explosion | "Find dead code", "unused exports", "clean up imports" |
| **Test Quality** | Missing assertions, low assertion density, excessive mocking, shared mutable state, missing cleanup, focused tests, fake timers without restore, missing mock restoration | "Check test quality", "find flaky tests" |
| **Semantic** (`--semantic`) | Over-abstraction, DIP violations, type cycles, shotgun surgery, leaky abstractions, unused params, narrowable types | "Deep type analysis", "find design issues" |

### Smart Output

- **Category-diverse truncation** — `--findings-limit` round-robins across categories by severity tier so the capped list represents all detected issue types, not just the noisiest category. Use `--no-diversify` for pure severity ordering.
- **Chain deduplication** — Critical dependency chain findings that share >80% of their modules are auto-merged into a single finding listing all entry points, reducing noise.
- **Computed remediation** — Architecture chain findings name the specific module to break at (highest fan-out in the chain) with concrete fan-out/fan-in numbers.
- **lspHints on most findings** — Pre-computed validation instructions (tool, symbol, lineHint, expectedResult) for one-step Octocode MCP validation.
- **Category tags in Top Recommendations** — Each recommendation shows its category for disambiguation (e.g., `input-passthrough-risk` vs `unvalidated-input-sink`).

### When NOT to use

- **Syntax errors** → use `tsc`
- **Code style** → use ESLint / Prettier
- **Runtime bugs** → use tests / debugger
- **Security SAST/SCA** → use Semgrep for deep taint analysis

---

## Quick Start

```bash
# Run from your monorepo root (scripts are pre-built — no install needed)
node skills/octocode-local-code-quality/scripts/index.js
```

Output goes to `.octocode/scan/<timestamp>/` with structured files. Start with `summary.md`, especially the `Analysis Signals` section.

### Common Patterns

```bash
# Architecture issues only
node scripts/index.js --features=architecture

# Security scan
node scripts/index.js --features=security

# Test quality (auto-includes test files)
node scripts/index.js --features=test-quality --include-tests

# Everything except dead-code
node scripts/index.js --exclude=dead-code

# Visual dependency graph
node scripts/index.js --graph

# Advanced graph overlays
node scripts/index.js --graph --graph-advanced

# Flow-aware evidence enrichment
node scripts/index.js --flow

# Enforce layer architecture
node scripts/index.js --layer-order ui,service,repository

# Stricter thresholds
node scripts/index.js --critical-complexity-threshold 20 --any-threshold 0

# Focus on a specific package
node scripts/index.js --scope=packages/octocode-mcp

# Focus on a function
node scripts/index.js --scope=packages/octocode-mcp/src/session.ts:initSession

# Enable semantic analysis
node scripts/index.js --semantic

# Force full re-parse
node scripts/index.js --no-cache
```

### Drill-Down Workflow

```
1. Full scan        → node scripts/index.js
                      Read summary.md to identify worst areas

2. Package scope    → node scripts/index.js --scope=packages/worst-package
                      Detailed findings for one package

3. File scope       → node scripts/index.js --scope=packages/worst-package/src/tools/hub.ts
                      Single-file analysis

4. Function scope   → node scripts/index.js --scope=path/file.ts:functionName
                      Only findings within that function's line range

5. Fix & re-scan    → Fix issues, re-run with same --scope, verify count drops
```

`--scope` accepts comma-separated paths (relative to root). Use `file:symbol` to drill into a specific function or exported variable. The full dependency graph is always built, so architecture findings involving scoped files are still reported.

---

## What Gets Scanned

| Included | Excluded |
|----------|----------|
| `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` | `.d.ts` declaration files |
| All files under `packages/*/` | `node_modules/`, `dist/`, `.git/`, `.next/`, `.cache/`, `.octocode/`, `coverage/` |
| Production code (default) | Test files (unless `--include-tests`) |

---

## Output Files

Each scan writes to `.octocode/scan/<timestamp>/`:

| File | What's Inside |
|------|--------------|
| **`summary.md`** | Start here. Scope, severity breakdown, per-pillar category counts, health scores, analysis signals, change risk hotspots, top recommendations |
| `summary.json` | Machine-readable counters, `topRecommendations[]`, `analysisSummary`, `investigationPrompts[]`, `parseErrors[]` |
| `architecture.json` | Dependency graph, architecture findings, `hotFiles[]`, `graphSignals[]`, chokepoints, and optional advanced graph overlays |
| `code-quality.json` | Code quality findings with severity/category breakdowns |
| `dead-code.json` | Hygiene findings with severity/category breakdowns |
| `security.json` | Security findings (only if security issues found) |
| `test-quality.json` | Test quality findings (only if test issues found) |
| `file-inventory.json` | Per-file: `functions[]`, `flows[]`, `dependencyProfile`, `effectProfile`, `symbolUsageSummary`, `boundaryRoleHints[]`, optional `cfgFlags`, `issueIds[]` |
| `findings.json` | ALL findings across all categories, sorted by severity, with `ruleId`, `analysisLens`, `confidence`, `correlatedSignals[]`, `recommendedValidation`, and optional `flowTrace[]` |
| `graph.md` | Mermaid dependency graph (with `--graph`) |
| `ast-trees.txt` | Compact AST snapshots (on by default, disable with `--no-tree`) |

### How To Read Results Well

Use the outputs with this reasoning loop:

- **Choose lens**: graph, AST, or hybrid
- **Correlate signals**: compare graph and AST evidence before jumping to a conclusion
- **State confidence**: say whether the evidence is high, medium, or low confidence
- **Validate**: confirm live-code claims with Octocode local tools when available
- **Present**: summarize the graph signal, AST signal, combined interpretation, and next validation step

Use the outputs with two main lenses:

- **Graph lens**: `summary.md`, `architecture.json`, and `graph.md`
- **AST lens**: `file-inventory.json`, `findings.json`, `ast-trees.txt`, and `ast-search.js`

Good architecture decisions usually come from combining both:

- If `summary.md` shows cycles, critical paths, and hot files, start with the graph lens
- If a hotspot also has top-level effects, duplicate orchestration, or heavy control flow, switch to the AST lens
- If `low-cohesion` and `feature-envy` co-occur, suspect a bad module boundary
- If `import-side-effect-risk` appears on a high fan-in file, suspect hidden startup or initialization problems
- If graph and AST signals disagree, do not flatten them into one claim; treat that as a hybrid investigation

### Each Finding

```json
{
  "id": "AST-ISSUE-0001",
  "ruleId": "performance.await-in-loop",
  "severity": "high",
  "category": "await-in-loop",
  "analysisLens": "ast",
  "confidence": "medium",
  "file": "packages/core/src/sync.ts",
  "lineStart": 42,
  "lineEnd": 42,
  "title": "await inside loop — sequential async execution",
  "reason": "Each await runs serially. Use Promise.all() for parallel execution.",
  "files": ["packages/core/src/sync.ts"],
  "suggestedFix": {
    "strategy": "Collect promises and await them in parallel.",
    "steps": [
      "Collect all async operations into an array of promises.",
      "Use await Promise.all(promises).",
      "If order matters, use a batching utility."
    ]
  },
  "impact": "Sequential awaits multiply latency by N iterations — parallelizing can reduce total time to max(single-latency).",
  "correlatedSignals": ["paired:function-optimization"],
  "tags": ["performance", "async", "n-plus-one"],
  "recommendedValidation": {
    "summary": "Confirm the awaited call and inspect whether parallel execution is safe.",
    "tools": ["localSearchCode", "lspGotoDefinition"]
  },
  "lspHints": [{
    "tool": "lspGotoDefinition",
    "symbolName": "await",
    "lineHint": 42,
    "file": "packages/core/src/sync.ts",
    "expectedResult": "navigate to the awaited call to check if parallelization is safe"
  }]
}
```

---

## Hybrid Validation: CLI + Octocode MCP

The scan works standalone, but combining CLI tools with [Octocode MCP local & LSP tools](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) gives the most complete validation — CLI for broad discovery, MCP for precise semantic confirmation.

### Validation Policy

When Octocode MCP local tools are available, every statement about live code should be validated with them before it is presented as fact.

- Start with `localSearchCode` to anchor the statement to a file and `lineHint`
- Confirm with `lspGotoDefinition`, `lspFindReferences`, or `lspCallHierarchy`
- Use `localGetFileContent` only after the location is known and the statement to verify is specific

### Three Validation Paths

| Path | When to use | Tools |
|------|------------|-------|
| **CLI only** | No Octocode MCP installed | `scripts/index.js` (scan) + `scripts/ast-search.js` (structural search) + file reads |
| **Octocode MCP only** | MCP available, quick LSP checks | `localSearchCode` → `lspGotoDefinition` / `lspFindReferences` / `lspCallHierarchy` |
| **Hybrid** (recommended) | Both available — broadest coverage | CLI for bulk discovery → MCP for semantic precision |

### Hybrid Workflow

```
1. CLI scan:     node scripts/index.js --features=security --flow      → identify findings
2. CLI search:   node scripts/ast-search.js -p 'eval($$$A)'     → find all instances structurally
3. MCP locate:   localSearchCode(symbol) → lineHint             → get precise location
4. MCP confirm:  lspCallHierarchy(incoming) on eval call         → trace how user input reaches it
5. Fix + rescan: node scripts/index.js --scope=file.ts           → verify count drops
```

### Quick Reference

| Scan finds | CLI check | Octocode MCP check |
|------------|-----------|-------------------|
| Dead export at `file:line` | `ast-search -p 'import { symbol } from $MOD'` — 0 hits | `lspFindReferences` — 0 consumers = confirmed dead |
| Dependency cycle `A → B → A` | `--graph` → inspect Mermaid cycle edges | `localSearchCode` → `lspGotoDefinition` — traces the circular import |
| High-complexity function | `--scope=file.ts:fn --features=cognitive-complexity` | `lspCallHierarchy(outgoing)` — maps callees to understand scope |
| Unused npm dependency | `ast-search -p 'import $$$N from "pkg"'` — 0 hits | `localSearchCode(filesOnly=true)` — no imports? safe to remove |
| Security finding | `ast-search -p 'eval($$$A)'` + `--preset` patterns | `lspCallHierarchy(incoming)` → verify if user input reaches sink |
| Import side-effect risk | Check `file-inventory.json` → `topLevelEffects` | `lspFindReferences` on file → confirm fan-in count |
| Prototype pollution | `ast-search -p 'Object.assign($$$A)'` + `ast-search -p '$O[$K] = $V'` | `lspCallHierarchy(incoming)` → trace if user data reaches site |

Most findings include `impact` (explains *why* it matters) and `lspHints[]` (pre-computed validation instructions for Octocode MCP).

### Architecture Reading Heuristics

Use these as investigation heuristics when reading `summary.md` and `architecture.json`:

- `dependency-cycle` + `critical-path` + high `fanIn` suggests a chokepoint module
- `low-cohesion` + `feature-envy` suggests a split-brain or misplaced module
- `layer-violation` + `feature-envy` suggests a boundary leak
- `import-side-effect-risk` + high `fanIn` suggests hidden initialization risk
- `unreachable-module` + low `fanIn` suggests dead subsystem edges or missing entrypoints
- `cycle-cluster` + `broker-module` suggests a structural hub inside an SCC, not just an isolated bad import
- `package-boundary-chatter` + `feature-envy` suggests a subsystem boundary leak
- `startup-risk-hub` + top-level effects suggests import-time orchestration hidden behind a commonly imported module

Treat these as leads, then validate them with Octocode local tools before presenting them as conclusions.

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

> **No Octocode MCP?** The scan still produces all categories with full detail. You just skip the LSP validation step. Use `ast-search.js` for structural validation instead. Findings include `lspHints[]` that make Octocode MCP validation a single-step operation when available.
>
> **Per-category hybrid playbooks:** → [references/playbooks.md](./references/playbooks.md)
>
> **Upgrade roadmap:** → [references/improvement-roadmap.md](./references/improvement-roadmap.md)

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

Post-scan processing (category diversification, chain merging, health scoring) is O(n) in finding count — negligible overhead even on large scans.

Use `--no-cache` to force a full re-parse. Use `--clear-cache` to delete the cache and exit.

---

## CLI Reference

Run `node scripts/index.js --help` for the full flag list. Key flags:

```
Core:
  --root <path>                 Repo root (default: cwd)
  --out <path>                  Output directory (timestamped by default)
  --json                        Print JSON to stdout
  --include-tests               Include test files in scan
  --parser <auto|typescript|tree-sitter>
  --graph                       Emit Mermaid dependency graph

Scope & Filtering:
  --scope=X,Y,Z                 Focus on specific paths/files/functions
  --features=X,Y,Z              Run only selected pillars/categories
  --exclude=X,Y,Z               Exclude pillars/categories (mutually exclusive with --features)
  --findings-limit N             Cap findings (category-diverse by default)

Semantic:
  --semantic                    Enable TypeChecker + LanguageService analysis

Thresholds (key):
  --critical-complexity-threshold N   Complexity for HIGH findings (default: 30)
  --cognitive-complexity-threshold N  Cognitive complexity limit (default: 15)
  --coupling-threshold N              Ca+Ce for high-coupling (default: 15)
  --maintainability-index-threshold N MI below this triggers finding (default: 20)
  --parameter-threshold N             Max function params (default: 5)
  --any-threshold N                   Max `any` per file (default: 5)
  --secret-entropy-threshold N        Shannon entropy threshold (default: 4.5)
  --secret-min-length N               Min string length for entropy check (default: 20)
  --mock-threshold N                  Max mocks per test file (default: 10)
  --similarity-threshold N            Near-clone similarity threshold (default: 0.85)
  --max-recs-per-category N           Findings per category in top recs (default: 2)

Truncation:
  --no-diversify                Pure severity ordering when truncating (default: category-diverse)
  --all                         Enable all features: --include-tests --semantic

Cache:
  --no-cache                    Force full re-parse
  --clear-cache                 Delete cache and exit
```

For all threshold flags, see `--help`.

---

## Testing

```bash
yarn test          # Run all tests
yarn test:watch    # Watch mode
```

---

## Project Structure

```
skills/octocode-local-code-quality/
├── src/
│   ├── index.ts              Orchestrator: scan pipeline + issue catalog
│   ├── architecture.ts       Architecture, quality, perf, similarity detectors
│   ├── security-detectors.ts Security detection categories
│   ├── test-quality-detectors.ts Test quality detection categories
│   ├── semantic.ts           SemanticContext, LanguageService, semantic profiling
│   ├── semantic-detectors.ts Semantic category detectors
│   ├── ts-analyzer.ts        TypeScript AST analysis + metric collection
│   ├── tree-sitter-analyzer.ts  Optional tree-sitter enrichment
│   ├── dependencies.ts       Import/export/re-export tracking
│   ├── discovery.ts          File discovery + package listing
│   ├── ast-search.ts         Structural search CLI (ast-grep powered)
│   ├── cli.ts                CLI argument parsing
│   ├── types.ts              Interfaces, constants, PILLAR_CATEGORIES, defaults
│   ├── utils.ts              Hash, fingerprint, path, helpers
│   ├── cache.ts              Incremental analysis cache (mtime+size keyed)
│   └── *.test.ts             Test files
├── scripts/                  Compiled JS output (pre-built, ready to run)
├── references/               Detailed reference docs for agent navigation
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
| [Finding Categories](./references/finding-categories.md) | All categories with severity and detection details |
| [CLI Reference](./references/cli-reference.md) | All flags, presets, scope syntax |
| [AST Search Reference](./references/ast-search.md) | Structural code search: patterns, kinds, presets, rules |
| [Playbooks](./references/playbooks.md) | Per-category validate & fix instructions |
| [Improvement Roadmap](./references/improvement-roadmap.md) | Research-backed upgrade plan for security, test quality, semantic analysis, reporting, and tests |
| [Local Tools Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) | Octocode MCP local + LSP tools for semantic validation |

---

## License

MIT License © 2026 Octocode — see [LICENSE](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE).

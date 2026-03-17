<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">

  <h1>Octocode Local Code Quality</h1>

  <p><strong>AST-based code quality scanner for TypeScript/JavaScript monorepos — powered by <a href="https://github.com/bgauryy/octocode-mcp">Octocode MCP</a> local & LSP tools</strong></p>

  [![Skill](https://img.shields.io/badge/skill-agentskills.io-purple)](https://agentskills.io/what-are-skills)
  [![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE)

</div>

---

## What It Does

Scans every TypeScript/JavaScript file in your monorepo's `packages/` directory using the TypeScript compiler API. Produces a JSON report with prioritized, actionable findings across three areas:

**Architecture Risk** — dependency cycles, critical dependency chains, coupling analysis (SDP/instability, afferent/efferent, fan-in/fan-out), orphan and unreachable modules, layer violations.

**Code Quality** — duplicate function bodies, repeated control-flow patterns, cyclomatic and cognitive complexity, god modules and god functions.

**Dead Code & Hygiene** — dead files, unused exports, unused re-exports, re-export conflicts, unused npm dependencies, package boundary violations, barrel explosion, test-only production modules.

Every finding includes: exact `file:line` location, severity (`critical` / `high` / `medium` / `low`), a reason explaining why it was flagged, and a `suggestedFix` with a strategy and ordered remediation steps.

### Scan + Octocode MCP = Full Picture

The scan script works standalone, but pairing it with [Octocode MCP local & LSP tools](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) gives you **semantic validation** — confirming findings and eliminating false positives before you change code.

| Scan finds | Octocode MCP confirms with |
|------------|---------------------------|
| Dead export at `file:line` | `lspFindReferences` — zero consumers? confirmed dead |
| Dependency cycle `A → B → A` | `localSearchCode` → `lspGotoDefinition` — traces the circular import |
| High-complexity function | `lspCallHierarchy(outgoing)` — maps callees to understand scope |
| Unused npm dependency | `localSearchCode(filesOnly=true)` — no imports? safe to remove |
| SDP violation | `lspCallHierarchy(incoming/outgoing)` — confirms instability values |
| Critical dependency chain | `lspCallHierarchy(incoming)` — reveals actual blast radius |

**Workflow:** scan → present → validate with Octocode MCP → fix → re-scan. See [Investigating Findings with Octocode MCP](#investigating-findings-with-octocode-mcp).

> **No Octocode MCP?** The scan still produces all 23 finding categories with full detail. You just skip the LSP validation step. Enable it anytime with `ENABLE_LOCAL=true` — see [setup](#investigating-findings-with-octocode-mcp).

---

## Quick Start

### 1. Build

```bash
cd skills/octocode-local-code-quality && npm run build
```

### 2. Run (from repo root)

```bash
node skills/octocode-local-code-quality/scripts/index.js
```

This scans all packages and prints a summary to stdout. A JSON report is automatically saved to `.octocode/scan/`.

### 3. Common Patterns

```bash
# Save report to specific path
node skills/octocode-local-code-quality/scripts/index.js --out .octocode/scan/scan.json

# Include test files in the scan
node skills/octocode-local-code-quality/scripts/index.js --include-tests

# More findings (default: 250)
node skills/octocode-local-code-quality/scripts/index.js --findings-limit 500

# Generate Mermaid dependency graph
node skills/octocode-local-code-quality/scripts/index.js --graph --out .octocode/scan/scan.json

# Enforce layer architecture
node skills/octocode-local-code-quality/scripts/index.js --layer-order ui,service,repository

# Stricter thresholds
node skills/octocode-local-code-quality/scripts/index.js --critical-complexity-threshold 20 --cognitive-complexity-threshold 10

# Raw JSON to stdout
node skills/octocode-local-code-quality/scripts/index.js --json
```

---

## Requirements

- **Node.js** v18+
- **TypeScript** npm package (used as the parser — already a devDependency)
- A monorepo with `packages/` containing subdirectories with `package.json` files
- **Optional**: `tree-sitter` + `tree-sitter-typescript` for enhanced AST node counting (installed as dependencies)

---

## What Gets Scanned

| Included | Excluded |
|----------|----------|
| `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` | `.d.ts` declaration files |
| All files under `packages/*/` | `node_modules/`, `dist/`, `.git/`, `.next/`, `.yarn/`, `.cache/`, `.octocode/`, `coverage/`, `out/` |
| Production code (default) | Test files (unless `--include-tests`) |

---

## Finding Categories

23 categories organized into three pillars:

### Architecture Risk (8)

| Category | Severity | What It Detects |
|----------|----------|-----------------|
| `dependency-cycle` | high | Circular import chains between modules |
| `dependency-critical-path` | high — critical | High-weight transitive dependency chains (blast radius of change) |
| `architecture-sdp-violation` | medium — high | Stable module depends on unstable module. Uses instability metric: `I = Ce / (Ca + Ce)` |
| `high-coupling` | medium — high | Module with excessive total connections (Ca + Ce above threshold) |
| `god-module-coupling` | medium — high | Module with too many dependents (fan-in bottleneck) or too many dependencies (fan-out sprawl) |
| `orphan-module` | medium | Module with zero inbound and zero outbound dependencies |
| `unreachable-module` | high | Module not reachable from any entrypoint via BFS traversal of the import graph |
| `layer-violation` | high | Import going backwards in a configured layer order (e.g. repository importing from UI) |

### Code Quality (6)

| Category | Severity | What It Detects |
|----------|----------|-----------------|
| `duplicate-function-body` | low — high | Identical function implementations (same AST fingerprint) across files |
| `duplicate-flow-structure` | medium — high | Repeated if/switch/try control-flow patterns |
| `function-optimization` | medium — high | High cyclomatic complexity, deep branch nesting, deep loop nesting, oversized functions |
| `cognitive-complexity` | medium — high | Nesting-aware complexity scoring. Nested branches compound reading difficulty exponentially |
| `god-module` | high | Files exceeding statement count (default: 500) or export count (default: 20) thresholds |
| `god-function` | high | Functions exceeding statement count threshold (default: 100) |

### Dead Code & Hygiene (9)

| Category | Severity | What It Detects |
|----------|----------|-----------------|
| `dead-file` | medium | Non-test file with no inbound imports, no outbound dependencies, and not an entrypoint |
| `dead-export` | medium — high | Exported symbol with no observed import or re-export usage in production files |
| `dead-re-export` | medium | Barrel re-export with no downstream consumers |
| `re-export-duplication` | medium | Same symbol re-exported from multiple competing source paths in the same barrel |
| `re-export-shadowed` | high | Local export and re-export collide on the same name in a barrel |
| `unused-npm-dependency` | low — medium | Dependency listed in package.json but never imported by any scanned file |
| `package-boundary-violation` | medium — high | Cross-package import bypassing the public API entry (e.g. importing `packages/bar/src/internal/x.ts` instead of `packages/bar/src/index.ts`) |
| `barrel-explosion` | medium — high | Barrel with more than 30 re-exports or a chain deeper than 2 levels |
| `dependency-test-only` | medium | Production module imported only from test files |

---

## Report Structure

The JSON report (written to `--out` or stdout with `--json`) contains:

```
{
  summary                 Total files, functions, flows, per-package stats
  fileInventory[]         Per-file: functions, flows, dependency profile, linked issue IDs
  duplicateFlows          Duplicate function-body groups + repeated control-flow groups
  dependencyGraph         Modules, edges, roots, leaves, cycles, critical paths, hub modules
  dependencyFindings[]    Cycle, critical-path, test-only findings
  optimizationFindings[]  ALL 23-category findings, sorted by severity
  agentOutput             Summary counters, top 20 recommendations, per-file issue mapping
  parseErrors[]           Files that failed to parse
  astTrees[]              AST tree snapshots (when --emit-tree)
}
```

### Each Finding

```json
{
  "id": "AST-ISSUE-0001",
  "severity": "high",
  "category": "dependency-cycle",
  "file": "packages/core/src/auth.ts",
  "lineStart": 1,
  "lineEnd": 1,
  "title": "Dependency cycle detected (3 node cycle)",
  "reason": "Import cycle exists across: auth.ts -> session.ts -> user.ts -> auth.ts",
  "files": ["packages/core/src/auth.ts", "packages/core/src/session.ts", "packages/core/src/user.ts"],
  "suggestedFix": {
    "strategy": "Break the cycle with a lower-level abstraction or interface module.",
    "steps": [
      "Extract shared contracts/types to a dedicated contract/shared package.",
      "Move implementation in one direction using dependency inversion.",
      "Split stateful modules into protocol and runtime layers."
    ]
  },
  "impact": "Cycles increase coupling and make incremental loading/debugging and refactors riskier."
}
```

---

## Dependency Graph

The `dependencyGraph` section maps your entire module relationship structure:

| Field | Description |
|-------|-------------|
| `totalModules` | Number of analyzed modules |
| `totalEdges` | Total import edges |
| `roots[]` | Modules with no inbound imports (entry points) |
| `leaves[]` | Modules with no outbound imports (leaf nodes) |
| `cycles[]` | Circular dependency chains with path and node count |
| `criticalPaths[]` | Highest-weight transitive chains (score + length) |
| `criticalModules[]` | Hub modules ranked by score and connectivity |
| `testOnlyModules[]` | Production files imported only from tests |
| `outgoingTop[]` | Modules with most outbound imports |
| `inboundTop[]` | Modules with most inbound imports |
| `unresolvedSample[]` | Sample of unresolved import paths |

---

## Investigating Findings with Octocode MCP

The scan finds issues; [Octocode MCP local & LSP tools](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) **validate them semantically** — eliminating false positives and showing real impact before you touch code. Use both together for best results; the scan works standalone if Octocode MCP is not available.

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

### Tools Quick Reference

| Tool | Purpose | When to use |
|------|---------|-------------|
| [`localSearchCode`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) | Text/regex search across workspace | **Always first** — gets `lineHint` required by all LSP tools |
| [`lspGotoDefinition`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) | Jump to where a symbol is defined | Trace imports to source, follow re-exports |
| [`lspFindReferences`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) | Find all usages of any symbol | Dead exports, unused types/variables, impact analysis |
| [`lspCallHierarchy`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) | Trace caller/callee relationships | Dependency chains, complexity analysis, coupling validation |
| [`localGetFileContent`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) | Read file content with targeted extraction | **Always last** — read implementation after analysis |

### Investigation Workflow

```
1. Pick highest-severity finding from the report
2. localSearchCode(pattern="symbolName") → get lineHint
3. lspGotoDefinition(lineHint=N) → jump to definition
4. lspFindReferences(lineHint=N) → see all consumers
5. lspCallHierarchy(direction="incoming") → who calls this?
6. localGetFileContent(path, startLine, endLine) → read context
7. Fix following the suggestedFix.steps
8. Re-run scan → verify finding count dropped
```

### Example: SDP Violation

The scan flags: `[HIGH] SDP violation — "packages/core/src/auth.ts" (I=0.15) depends on "packages/core/src/helpers/format.ts" (I=0.80)`

```
1. localSearchCode(pattern="auth", path="packages/core/src")
   → auth.ts at line 1

2. lspCallHierarchy(direction="incoming", lineHint=1)
   → 12 modules depend on auth.ts (very stable, low instability)

3. lspCallHierarchy(direction="outgoing", lineHint=1)
   → auth.ts imports format.ts (which has high instability)

4. localGetFileContent(path="packages/core/src/helpers/format.ts")
   → Read the unstable module to see what auth.ts actually needs

5. Extract the shared formatting logic into a stable utility
   Both auth.ts and format.ts can depend on it safely

6. Re-run scan → SDP violation gone
```

### Example: Dead Export

The scan flags: `[HIGH] Unused export: processPayment — "packages/billing/src/processor.ts:45-60"`

```
1. localSearchCode(pattern="processPayment")
   → Found at line 45

2. lspFindReferences(lineHint=45)
   → Zero references outside the declaring file

3. localSearchCode(pattern="processPayment", filesOnly=true)
   → No other file mentions this symbol

4. Remove the export keyword (keep function if used internally)
   or delete entirely if dead. Re-run scan to confirm.
```

> **Full tool docs:** [Local Tools Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) | [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md)

---

## How It Works

The scan runs in a single pass through 9 stages:

```
1. DISCOVER     Find packages/ with valid package.json, read npm deps
2. PARSE        TypeScript compiler API parses each file
3. EXTRACT      Functions (name, complexity, nesting, size, cognitive complexity)
                Control flow patterns (if/switch/try/for)
                Exports, imports, re-exports (symbol-level tracking)
4. FINGERPRINT  Hash function bodies and control structures to find duplicates
5. GRAPH        Build import graph from import/require statements
                Detect cycles (DFS), compute critical paths (weighted DAG)
                Identify roots, leaves, hub modules, test-only modules
6. ARCHITECTURE Instability + SDP check, coupling metrics, fan-in/fan-out
                Orphan detection, BFS reachability, layer violation checks
7. HYGIENE      Dead files/exports/re-exports, re-export conflicts
                Unused npm deps, barrel explosion, boundary violations
8. CATALOG      23-category findings with severity, locations, fix strategies
9. REPORT       JSON to --out, summary to stdout, optional Mermaid graph
```

---

## CLI Reference

```
node scripts/index.js [options]

Core:
  --root <path>                       Repo root (default: cwd)
  --out <path>                        Write JSON report to file
  --json                              Print JSON to stdout
  --include-tests                     Include test files in scan
  --parser <auto|typescript|tree-sitter>  Parser engine (default: auto)
  --graph                             Emit Mermaid dependency graph
  --findings-limit N                  Max findings (default: 250)

Complexity thresholds:
  --critical-complexity-threshold N   Cyclomatic complexity for HIGH (default: 30)
  --cognitive-complexity-threshold N  Cognitive complexity threshold (default: 15)
  --min-function-statements N         Min statements for duplicate matching (default: 6)
  --min-flow-statements N             Min control-flow statements for matching (default: 6)

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

Output:
  --deep-link-topn N                  Max critical paths reported (default: 12)
  --tree-depth N                      AST tree depth (default: 4)
  --no-tree                           Skip AST tree snapshots
  --emit-tree                         Force include AST trees
  --help                              Show help
```

---

## Key Concepts

### Instability (SDP)

```
I(module) = Ce / (Ca + Ce)

Ca = afferent coupling  = modules that depend on this module (inbound)
Ce = efferent coupling  = modules this module depends on (outbound)

I = 0  → maximally stable (everyone depends on it, it depends on nothing)
I = 1  → maximally unstable (it depends on everything, nothing depends on it)
```

The **Stable Dependencies Principle** says: stable modules should not depend on unstable modules. When a module with I=0.15 imports a module with I=0.80, the stable module is coupled to something volatile.

### Cognitive Complexity

Unlike cyclomatic complexity (which counts branches), cognitive complexity penalizes **nesting depth**:

- Each `if`, `for`, `while`, `switch`, `catch`, `&&`, `||`, `??` adds +1
- Each **nested** structural element adds +1 per nesting level on top
- `if (a) { if (b) { ... } }` scores 1 + (1+1) = 3, not 2

Higher cognitive complexity correlates with more bugs and slower code reviews.

### Reachability

BFS traversal from entrypoints (`index`, `main`, `app`, `server`, `cli`). Any module not reached is flagged as `unreachable-module`. This catches entire dead subgraphs that direct-import checks miss.

### Package Boundaries

In monorepos, `packages/A/src/foo.ts` should import from `packages/B/src/index.ts` (public API), not from `packages/B/src/internal/bar.ts`. Bypassing the public entry couples code to another package's internals.

---

## Sample Output

```text
AST analysis complete: 564 files, 9145 functions, 6775 flow nodes
Dependency scan analyzed 620 files (including tests where present).
Duplicate function bodies: 28
- ArrowFunction "handleError" occurs 4x in 3 file(s)
- FunctionDeclaration "validateInput" occurs 3x in 2 file(s)

Repeated control-flow structures: 15
- IfStatement appears 12x across 8 file(s)
- TryStatement appears 6x across 4 file(s)

Dependency graph: 564 modules, 1800 import edges
- Critical chains: 30 (showing top 12)
- Root modules: 190, Leaf modules: 95
- Test-only modules: 10
- Cycles: 20

Agent Findings: 125
- [CRITICAL] Critical dependency chain risk: 8 files
  - Potentially high-change surface: src/core/index.ts -> ... (420 weight)
  - fix: Reduce chain length and isolate high-complexity hotspots.
- [HIGH] Dependency cycle detected (4 node cycle)
  - Import cycle exists across: src/a.ts -> src/b.ts -> src/c.ts -> src/a.ts
  - fix: Break the cycle with a lower-level abstraction or interface module.
- [HIGH] Deduplicate function body: handleError
  - Same ArrowFunction body shape appears in 4 places (3 files).
  - fix: Create a shared helper function once and replace duplicate call sites.

Parser engine used: auto (tree-sitter metadata + typescript analysis)
Full report written to .octocode/scan/scan-2026-03-17T10-30-00-000Z.json
```

---

## Testing

```bash
npm test          # Run all tests
npm run test:watch  # Watch mode
```

222 tests across 7 test files covering:

| Test File | What It Tests |
|-----------|---------------|
| `cli.test.ts` | All CLI flags, NaN guards, flag combinations, defaults |
| `utils.test.ts` | Hash, fingerprint, path normalization, test file detection, map utilities |
| `dependencies.test.ts` | Import/export/re-export parsing from TypeScript AST, edge tracking |
| `ts-analyzer.test.ts` | Function detection, metric collection, source file analysis |
| `architecture.test.ts` | All 12 architecture + hygiene detection functions |
| `index.test.ts` | Cycle detection, critical paths, full issue catalog, dead code logic |
| `sanity.test.ts` | Basic sanity checks |

---

## Project Structure

```
skills/octocode-local-code-quality/
├── src/
│   ├── index.ts              Main orchestrator: scan pipeline + issue catalog
│   ├── architecture.ts       Architecture + hygiene detection (12 functions)
│   ├── ts-analyzer.ts        TypeScript AST analysis + metric collection
│   ├── tree-sitter-analyzer.ts  Optional tree-sitter enrichment
│   ├── dependencies.ts       Import/export/re-export tracking
│   ├── discovery.ts          File discovery + package listing
│   ├── cli.ts                CLI argument parsing
│   ├── types.ts              All interfaces, constants, defaults
│   ├── utils.ts              Hash, fingerprint, path, and helper utilities
│   ├── *.test.ts             Test files (7 files, 222 tests)
│   └── ...
├── scripts/                  Compiled JS output (tsc builds here)
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
| [SKILL.md](./SKILL.md) | Agent workflow protocol: how to run, present, and investigate findings |
| [**Local & LSP Tools Reference**](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) | Octocode MCP local + LSP tools used to validate and deepen scan findings |
| [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md) | Octocode MCP configuration options (`ENABLE_LOCAL=true` for local tools) |
| [Troubleshooting](https://github.com/bgauryy/octocode-mcp/blob/main/docs/TROUBLESHOOTING.md) | Common issues and solutions |

---

## License

MIT License © 2026 Octocode

See [LICENSE](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE) for details.

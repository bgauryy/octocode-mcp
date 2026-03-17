---
name: octocode-local-code-quality
description: Scan TS/JS monorepo for architecture issues, code quality problems, and dead code. Use when asked to check architecture, audit code/repo quality, trace code flows, find cycles, unused exports, complexity, or dead files. Produces severity-ranked findings with file:line locations — validate with Octocode MCP local & LSP tools before fixing.
---

# Octocode Local Code Quality — Full-Stack Code Analysis

## What This Skill Does

Single-scan code analysis for TS/JS monorepos that combines architecture risk, code quality, and dead-code hygiene into one report. Analyzes every file under `packages/` and produces **severity-ranked findings** with exact `file:line` locations and fix strategies.

The scan is step one. Use **Octocode MCP local & LSP tools** to validate findings semantically — confirm dead exports have zero consumers via `lspFindReferences`, trace dependency chains with `lspCallHierarchy`, verify cycles with `lspGotoDefinition` — before changing any code.

### Three Analysis Pillars

```
┌──────────────────────────────────────────────────────────────┐
│                    octocode-local-code-quality                │
│                                                              │
│  ┌──────────────────┐ ┌────────────────┐ ┌────────────────┐ │
│  │  Architecture     │ │  Code Quality  │ │  Dead Code     │ │
│  │  Risk (7 types)   │ │  (5 types)     │ │  Hygiene       │ │
│  │                   │ │                │ │  (11 types)    │ │
│  │ • Dep cycles      │ │ • Duplicates   │ │ • Dead files   │ │
│  │ • Critical paths  │ │ • Complexity   │ │ • Dead exports │ │
│  │ • SDP violations  │ │ • Cognitive    │ │ • Dead re-exp  │ │
│  │ • High coupling   │ │ • God modules  │ │ • Unused npm   │ │
│  │ • Fan-in/fan-out  │ │ • God functions│ │ • Orphans      │ │
│  │ • Orphan modules  │ │                │ │ • Unreachable  │ │
│  │ • Unreachable     │ │                │ │ • Boundaries   │ │
│  │ • Layer violations│ │                │ │ • Barrel bloat │ │
│  └──────────────────┘ └────────────────┘ └────────────────┘ │
│                                                              │
│            Severity-ranked • file:line precision              │
│            Fix strategies • MCP/LSP playbooks                │
└──────────────────────────────────────────────────────────────┘
```

### All 23 Finding Categories

| # | Category | Severity | What It Detects |
|---|----------|----------|-----------------|
| 1 | `duplicate-function-body` | low — high | Identical function implementations across files |
| 2 | `duplicate-flow-structure` | medium — high | Repeated if/switch/try control-flow patterns |
| 3 | `function-optimization` | medium — high | High cyclomatic complexity, deep nesting, oversized functions |
| 4 | `cognitive-complexity` | medium — high | Nesting-aware complexity score (nested branches compound reading difficulty) |
| 5 | `god-module` | high | Files with >500 statements or >20 exports |
| 6 | `god-function` | high | Functions with >100 statements |
| 7 | `dependency-cycle` | high | Circular import chains |
| 8 | `dependency-critical-path` | high — critical | High-weight transitive dependency chains (blast radius) |
| 9 | `dependency-test-only` | medium | Production modules imported only from tests |
| 10 | `architecture-sdp-violation` | medium — high | Stable module depends on unstable module (I = Ce/(Ca+Ce)) |
| 11 | `high-coupling` | medium — high | Module with excessive Ca + Ce total connections |
| 12 | `god-module-coupling` | medium — high | High fan-in (bottleneck) or high fan-out (knows too much) |
| 13 | `orphan-module` | medium | Module with zero inbound AND zero outbound dependencies |
| 14 | `unreachable-module` | high | Module not reachable from any entrypoint via BFS traversal |
| 15 | `dead-file` | medium | Non-test file with no inbound imports, no outbound deps, not an entrypoint |
| 16 | `dead-export` | medium — high | Exported symbol with no observed import/re-export usage |
| 17 | `dead-re-export` | medium | Barrel re-export with no downstream consumers |
| 18 | `re-export-duplication` | medium | Same symbol re-exported from multiple competing paths |
| 19 | `re-export-shadowed` | high | Local export and re-export collide on same name |
| 20 | `unused-npm-dependency` | low — medium | Dependency in package.json not imported anywhere |
| 21 | `package-boundary-violation` | medium — high | Cross-package import bypassing public API (index) |
| 22 | `barrel-explosion` | medium — high | Barrel with >30 re-exports or >2 chain levels deep |
| 23 | `layer-violation` | high | Import going backwards in configured layer order |

---

## How to Use

This skill uses **two complementary tools together**: the scan script finds issues statically, and Octocode MCP local & LSP tools validate them semantically. Always use both when available.

```
SCAN (scripts/index.js) → PRESENT → VALIDATE (Octocode local/LSP) → FIX → RE-SCAN
```

If Octocode MCP is not installed or `ENABLE_LOCAL` is not `"true"`, fall back to the scan script alone — see [Fallback Policy](#fallback-policy-when-mcplsp-is-unavailable).

### 1. Run the scan

> **IMPORTANT**: Scripts are **pre-built** in `scripts/` — do NOT run `npm install`, `npm build`, or any setup. Do NOT execute source files from `src/`. Just run the entry point directly:

```bash
node <SKILL_BASE_DIRECTORY>/scripts/index.js
```

255 tests passing. Only run `scripts/index.js` (the single entry point; all other files in `scripts/` are internal modules).

By default the scan creates a **timestamped directory** under `.octocode/scan/<timestamp>/` with separate files per feature area. To write a single monolithic JSON instead (legacy mode), pass `--out path/to/file.json`.

### 2. Present results to user

Read `summary.md` first — it contains a complete human-readable overview with stats, severity breakdown, per-feature category counts, top recommendations, and links to all output files. Then drill into feature JSON files as needed. Always present in this structure:

```markdown
## Scan Summary
- **Output**: `.octocode/scan/<timestamp>/` (<n> files)
- **Scope**: <n> files, <n> functions, <n> flows, <n> dependency edges
- **Findings**: <n> total — <n> critical, <n> high, <n> medium, <n> low

## Top Findings (by severity)
### Critical
- `<file>:<line>` — <title> — <reason>
### High
- `<file>:<line>` — <title> — <reason>
### Medium (top 5)
- ...

## Architecture Health (from architecture.json)
- Cycles: <n>, Critical paths: <n>, SDP violations: <n>
- Coupling hotspots: <n>, Unreachable modules: <n>, Orphan modules: <n>

## Code Quality (from code-quality.json)
- Duplicates: <n>, Complex functions: <n>, God modules: <n>

## Dead Code Summary (from dead-code.json)
- Dead exports: <n>, Dead re-exports: <n>, Dead files: <n>
- Unused npm deps: <n>, Boundary violations: <n>

## Next Step
Which findings should I investigate first?
```

Severity order: `critical` > `high` > `medium` > `low` > `info`.

### 3. Validate findings with Octocode local & LSP tools

**Do not fix based on scan output alone.** Use Octocode MCP tools to confirm each finding semantically — this catches false positives and reveals the true blast radius:

```
localSearchCode(pattern) → get lineHint
  → lspGotoDefinition(lineHint)    — trace to source
  → lspFindReferences(lineHint)    — confirm zero/few consumers
  → lspCallHierarchy(lineHint)     — map caller/callee impact
  → localGetFileContent             — read context (last)
```

If Octocode MCP is unavailable (`ENABLE_LOCAL` not set), skip this step and follow the [Fallback Policy](#fallback-policy-when-mcplsp-is-unavailable).

See [Investigation Playbooks](#investigation-playbooks) for per-category recipes. After fixes, re-run scan to verify finding count decreased.

---

## CLI Reference

Run directly — no install or build required:

```bash
node <SKILL_BASE_DIRECTORY>/scripts/index.js --help
```

### Command Presets

| Situation | Command |
|---|---|
| Default scan | `node <SKILL_BASE_DIRECTORY>/scripts/index.js` |
| Deep scan (more findings) | `node <SKILL_BASE_DIRECTORY>/scripts/index.js --findings-limit 1000` |
| Include test files | `node <SKILL_BASE_DIRECTORY>/scripts/index.js --include-tests` |
| Architecture graph (Mermaid) | `node <SKILL_BASE_DIRECTORY>/scripts/index.js --graph` |
| Strict complexity | `node <SKILL_BASE_DIRECTORY>/scripts/index.js --critical-complexity-threshold 20 --cognitive-complexity-threshold 10` |
| Layer enforcement | `node <SKILL_BASE_DIRECTORY>/scripts/index.js --layer-order ui,service,repository` |
| Custom output dir | `node <SKILL_BASE_DIRECTORY>/scripts/index.js --out .octocode/scan/my-scan` |
| Legacy single-file | `node <SKILL_BASE_DIRECTORY>/scripts/index.js --out .octocode/scan/scan.json` |
| After fixes (verify) | `node <SKILL_BASE_DIRECTORY>/scripts/index.js` (compare with previous scan dir) |
| User asks about one topic | Same scan, then read only the relevant feature file (e.g. `dead-code.json`) |

### Parser Modes

| Mode | Behavior |
|---|---|
| `auto` (default) | TypeScript primary analysis, optional tree-sitter node enrichment |
| `typescript` | TypeScript only |
| `tree-sitter` | Tree-sitter primary for functions/flows/complexity, TypeScript for dependencies; falls back if needed |

---

## Expected Output

### Default mode (no `--json`)

Human-readable terminal summary:

```
AST analysis complete: 42 files, 318 functions, 1204 flow nodes
Duplicate function bodies: 5
- function "parseConfig" occurs 3x in 2 file(s)

Repeated control-flow structures: 12
- IfStatement appears 4x across 3 file(s)

Dependency graph: 42 modules, 187 import edges
- Critical chains: 8 (showing top 8)
- Root modules: 3, Leaf modules: 11
- Test-only modules: 2
- Cycles: 1

Agent Findings: 34
- [HIGH] dependency-cycle — ...
  - Circular import chain between moduleA → moduleB → moduleA
  - fix: Break cycle with shared contracts or dependency inversion

Parser engine used: typescript

Report written to .octocode/scan/2026-03-17T10-30-00-000Z/
  summary: summary.json
  architecture: architecture.json
  codeQuality: code-quality.json
  deadCode: dead-code.json
  fileInventory: file-inventory.json
  findings: findings.json
```

### JSON mode (`--json`)

Full structured JSON to stdout. No human-readable text.

### Graph mode (`--graph`)

Default mode output + writes `graph.md` (Mermaid dependency graph) inside the scan directory.

### Output Directory Structure

Each scan writes to `.octocode/scan/<timestamp>/`:

```
.octocode/scan/2026-03-17T10-30-00-000Z/
├── summary.md            # Human/agent-readable overview with stats (READ THIS FIRST)
├── summary.json          # Metadata, counters, parser info, top recommendations
├── architecture.json     # Dependency graph, cycles, critical paths, SDP, coupling findings
├── code-quality.json     # Duplicates, function optimization, god modules, cognitive complexity
├── dead-code.json        # Dead files/exports/re-exports, unused npm deps, boundary violations
├── file-inventory.json   # Per-file summaries with linked issue IDs
├── findings.json         # All findings across all categories, sorted by severity
├── graph.md              # Mermaid dependency graph (only with --graph)
└── ast-trees.json        # AST trees (only with --emit-tree)
```

### Output Files by Feature

| File | Contents | When to Read |
|------|----------|-------------|
| `summary.md` | Human-readable overview: scope, severity table, per-feature category breakdown, top recommendations, output file index | **Always first** — fastest way to understand the scan |
| `summary.json` | Scan metadata, `agentOutput` (counters + top 20 recommendations), `parseErrors`, `outputFiles` index | Programmatic access to summary data |
| `architecture.json` | `dependencyGraph`, `dependencyFindings`, architecture-category findings | Investigating cycles, coupling, SDP, critical paths |
| `code-quality.json` | `duplicateFlows`, `optimizationOpportunities`, quality-category findings | Investigating duplicates, complexity, god modules |
| `dead-code.json` | Dead-code/hygiene-category findings | Cleaning up dead exports, unused deps, boundary violations |
| `file-inventory.json` | `fileInventory[]` — per-file functions, flows, dependency profiles, linked issue IDs | Deep-diving into specific files |
| `findings.json` | `optimizationFindings[]` — ALL findings sorted by severity (23 categories) | Full findings list when needed |
| `graph.md` | Mermaid dependency graph | Visual architecture review |

### Legacy Single-File Mode

Pass `--out path/to/file.json` to get the original monolithic report format:

| Key | Contents |
|-----|----------|
| `summary` | File, function, flow, package counts |
| `fileInventory[]` | Per-file: functions, flows, dependency profile, linked issue IDs |
| `duplicateFlows` | Duplicate function body + control-flow groups |
| `dependencyGraph` | Modules, edges, roots, leaves, cycles, critical paths, hubs |
| `dependencyFindings[]` | Cycle, critical-path, test-only findings |
| `optimizationFindings[]` | ALL findings sorted by severity (23 categories) |
| `agentOutput` | Summary counters, top recommendations, per-file issue mapping |
| `parseErrors[]` | Files that failed to parse |

---

## Investigation Playbooks

Use when user chooses specific findings to act on. Always validate with MCP/LSP before changing code.

<mcp_discovery>
Before investigating, check if Octocode MCP local tools are available:
1. Try a quick `localSearchCode` call. If it works → use the full scan + Octocode workflow.
2. If it fails or returns an MCP error → Octocode is not installed or `ENABLE_LOCAL` is not `"true"`.
   - Suggest once: "Enable local tools by setting `ENABLE_LOCAL=true` in your Octocode MCP config."
   - Continue with scan-only mode (script findings + targeted file reads). Do not block on MCP.
</mcp_discovery>

### General Investigation Loop

1. Read finding (`file`, `lineStart`, `lineEnd`, `category`, `reason`, `suggestedFix`).
2. `localSearchCode` for symbol/context to get `lineHint`.
3. Use LSP tools with that `lineHint`.
4. Cross-check `fileInventory` and related findings in same file.
5. Follow the `suggestedFix.steps` from the finding.
6. After fix, re-run scan and compare finding counts.

### Architecture Findings

**`architecture-sdp-violation`** — Stable module depends on unstable module
1. Read `reason` for instability values (I = Ce/(Ca+Ce), 0 = maximally stable, 1 = maximally unstable).
2. `lspCallHierarchy(direction="incoming", lineHint=N)` on the stable module to understand its dependents.
3. `lspCallHierarchy(direction="outgoing", lineHint=N)` on the unstable module.
4. Fix: invert dependency via interface extraction, or move shared code to a stable utility module.

**`high-coupling`** — Module with excessive total connections
1. Read `reason` for Ca (afferent/incoming) and Ce (efferent/outgoing) breakdown.
2. `lspFindReferences(lineHint=N)` on key exports to identify consumer clusters.
3. Fix: extract focused sub-modules by consumer group, use dependency inversion.

**`god-module-coupling`** — Fan-in bottleneck or fan-out sprawl
1. For fan-in: `lspFindReferences(lineHint=N)` to map all consumer modules.
2. For fan-out: `lspCallHierarchy(direction="outgoing", lineHint=N)` to list dependencies.
3. Fix: split into sub-modules by responsibility, introduce facade patterns.

**`orphan-module`** — Completely disconnected from module graph
1. `localSearchCode(pattern="fileName", filesOnly=true)` to verify no references.
2. Check runtime config, router registrations, framework conventions.
3. Fix: delete if truly disconnected, or wire into module graph with explicit import.

**`unreachable-module`** — Not reachable from any entrypoint
1. `localSearchCode(pattern="moduleName")` to check for dynamic imports or `require()`.
2. Check framework plugin/middleware/route registrations.
3. Fix: if confirmed unreachable, delete entire subgraph and re-run scan.

**`dependency-cycle`** — Circular import chain
1. `localSearchCode(pattern="import.*from")` on cycle files.
2. `lspGotoDefinition(lineHint=importLine)`.
3. Fix: break cycle with shared contracts or dependency inversion.

**`dependency-critical-path`** — High-weight transitive chain
1. `localSearchCode(pattern="export")` on hub module.
2. `lspCallHierarchy(direction="incoming", lineHint=N)`.
3. Fix: split hub responsibilities and enforce boundaries.

**`layer-violation`** — Import going backwards in layer order
1. Check `reason` for source and target layer names.
2. `lspGotoDefinition(lineHint=N)` on the violating import.
3. Fix: extract shared contracts to a lower layer, or use dependency inversion.

### Code Quality Findings

**`duplicate-function-body`** — Same function body in multiple places
1. `localSearchCode(pattern="functionName")`.
2. `lspFindReferences(lineHint=N)` + `lspCallHierarchy(direction="incoming", lineHint=N)`.
3. Fix: extract shared helper function, pass differences as params.

**`duplicate-flow-structure`** — Same control-flow pattern repeated
1. `localGetFileContent(path="file", startLine=X, endLine=Y)`.
2. `localSearchCode(pattern="key flow expression")`.
3. Fix: extract reusable flow helper.

**`function-optimization`** — Complex, deeply nested, or oversized function
1. `localSearchCode(pattern="functionName")`.
2. `lspCallHierarchy(direction="incoming", lineHint=N)` and `(direction="outgoing")`.
3. Fix: split along responsibilities, convert nested branches to guard clauses.

**`cognitive-complexity`** — High cognitive complexity score
1. `localGetFileContent(path="file", startLine=X, endLine=Y)` to read the function.
2. Fix: convert nested branches into early returns, extract deeply nested blocks into helpers, replace complex boolean chains with named predicates.

**`god-module`** — Module with >500 stmts or >20 exports
1. `localGetFileContent(path="file")` to understand module structure.
2. Fix: identify functional groups, extract each into dedicated module, create barrel for compat.

**`god-function`** — Function with >100 statements
1. `localGetFileContent(path="file", startLine=X, endLine=Y)`.
2. Fix: identify logical steps, extract each into named helper, keep original as orchestrator.

### Dead Code & Hygiene Findings

**`dead-file`** — File with no imports and no dependency role
1. `localSearchCode(pattern="fileNameWithoutExt", filesOnly=true)`.
2. `lspFindReferences(lineHint=N)` from any top-level symbol.
3. Fix: confirm not a runtime entrypoint, then delete.

**`dead-export`** — Unused exported symbol
1. `localSearchCode(pattern="export ... symbolName")`.
2. `lspFindReferences(lineHint=N)` to confirm no consumers.
3. Fix: check public API intent, then remove export modifier or delete symbol.

**`dead-re-export`** — Barrel re-export with no consumers
1. `localSearchCode(pattern="export .* from")` on barrel files.
2. `lspFindReferences(lineHint=N)` on re-exported symbols.
3. Fix: remove stale re-export, keep one canonical path.

**`re-export-duplication` / `re-export-shadowed`**
1. `localSearchCode(pattern="export {", path="barrel file")`.
2. `lspFindReferences(lineHint=N)` for conflicting symbol names.
3. Fix: keep one source-of-truth per exported name, remove conflicts.

**`unused-npm-dependency`** — Package in package.json but never imported
1. `localSearchCode(pattern="packageName")` to verify no imports.
2. Check build scripts, config files, CLI tools.
3. Fix: `npm uninstall <package>` and verify build/tests.

**`package-boundary-violation`** — Cross-package import bypassing public API
1. `lspGotoDefinition(lineHint=N)` on the cross-package import.
2. Fix: re-export the needed symbol from target package index, update import path.

**`barrel-explosion`** — Too many re-exports or deep barrel chain
1. `localGetFileContent(path="barrel file")` to review re-exports.
2. Fix: group into sub-barrels, or let consumers import directly from source.

**`dependency-test-only`** — Production module only imported from tests
1. `lspFindReferences(lineHint=N)` for exported symbol.
2. `localSearchCode(pattern="from.*moduleName", filesOnly=true)`.
3. Fix: move to test fixtures or add production usage.

---

## Fallback Policy (When MCP/LSP Is Unavailable)

When Octocode MCP is not installed or `ENABLE_LOCAL` is not `"true"`, the scan script still works standalone:

1. Run `scripts/index.js` as usual — all 23 finding categories are fully functional without MCP.
2. Trust scan report and category evidence first.
3. Validate with targeted file reads only (no broad refactors without LSP confirmation).
4. Mark confidence explicitly (`high` if scan evidence is strong, `medium` if ambiguous, `low` if needs LSP).
5. Recommend minimal-risk fixes and request user confirmation before wide changes.
6. Suggest enabling Octocode local tools for deeper validation: `"env": { "ENABLE_LOCAL": "true" }`.

---

## Architecture Concepts Reference

### Instability (SDP)
```
I(module) = Ce / (Ca + Ce)
  Ca = afferent coupling  = # modules that depend on this module
  Ce = efferent coupling  = # modules this module depends on
  I = 0  → maximally stable (only depended on, never depends)
  I = 1  → maximally unstable (only depends, never depended on)
```
**Stable Dependencies Principle (SDP)**: stable modules should NOT depend on unstable modules. A violation means `I(source) < I(target)` — the stable module depends on a more unstable one.

### Cognitive Complexity
Unlike cyclomatic complexity which counts branches, cognitive complexity penalizes **nesting**:
- Each `if`, `for`, `while`, `switch`, `catch`, `&&`, `||` adds +1.
- Each **nested** structural element adds +1 per nesting level on top.
- So `if (a) { if (b) { ... } }` = 1 + (1+1) = 3, not 2.

### Reachability
BFS from entrypoints (`index`, `main`, `app`, `server`, `cli`). Modules not reached are unreachable — stricter than `dead-file` which only checks direct edges.

### Package Boundaries
In monorepos, `packages/A/src/foo.ts` should import from `packages/B/src/index.ts` (public API), never from `packages/B/src/internal/bar.ts` (bypasses encapsulation).

---

## Octocode MCP Best Practices

### Tool Chain Order
Always follow the funnel: **search → locate → analyze → read**.
1. `localSearchCode(pattern, path)` — get file + `lineHint` (1-indexed). Start here for every investigation.
2. `lspGotoDefinition(uri, symbolName, lineHint)` — jump to the actual definition.
3. `lspFindReferences(uri, symbolName, lineHint)` — find all usages (types, variables, exports).
4. `lspCallHierarchy(uri, symbolName, lineHint, direction)` — trace call flow (`incoming` = callers, `outgoing` = callees). Functions only.
5. `localGetFileContent` — read implementation details. **Always last**.

### Key Rules
- **lineHint is mandatory** for all LSP tools. Always run `localSearchCode` first to obtain it.
- **Paths must be absolute** (e.g. `/Users/.../packages/octocode-mcp/src/foo.ts`).
- **lspFindReferences vs lspCallHierarchy**: use `lspFindReferences` for types/variables/all usages; use `lspCallHierarchy` for function call relationships only.
- **Batch queries**: `localSearchCode` supports up to 5 queries per call; LSP tools support 3–5. Batch independent lookups to reduce round-trips.
- **Chain manually**: use `lspCallHierarchy(depth=1)` and chain on results rather than `depth=3` — faster and more controlled.

### Validation Patterns by Finding Category
| Finding | Tool Chain |
|---------|-----------|
| Dead export | `localSearchCode` → `lspFindReferences(includeDeclaration=false)` — zero non-test results = confirmed dead |
| Dependency cycle | `localSearchCode(pattern="import.*from")` on cycle files → `lspGotoDefinition` on circular import |
| Unused function | `localSearchCode` → `lspCallHierarchy(incoming)` — zero callers = confirmed unused |
| High coupling | `localSearchCode` → `lspFindReferences` on key exports → count unique consumer files |
| Complex function | `localSearchCode` → `lspCallHierarchy(outgoing)` to understand responsibilities before splitting |

### Common Pitfalls
- LSP returns 0-indexed lines; `localSearchCode` returns 1-indexed. Use the 1-indexed value for `lineHint`.
- If LSP returns empty, try broader `localSearchCode` variants (synonyms, regex) before concluding.
- For external packages, switch to `packageSearch` → `githubSearchCode` — LSP only works on local code.

---

## Guardrails

- **No install, no build**: scripts are pre-built. Do NOT run `npm install`, `yarn`, `npm run build`, or any setup command. Run `scripts/index.js` directly.
- **Never execute `src/` files**: the `src/` directory contains TypeScript source — only `scripts/` contains runnable JS.
- Run only `scripts/index.js` — never execute other scripts in `scripts/` directly (they are internal modules).
- Never present findings without `file:line` references.
- Never use LSP tools without `lineHint` from `localSearchCode`.
- Let the user choose which findings to address before making broad refactors.

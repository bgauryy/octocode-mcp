---
name: octocode-local-code-quality
description: The most comprehensive single-scan code quality tool for TS/JS monorepos. Combines architecture analysis (instability/SDP, coupling, cycles, reachability), code quality (duplicates, complexity, cognitive complexity, god modules), and dead-code hygiene (dead files, exports, re-exports, unused npm deps) — all in one agent-friendly scan with severity-ranked, actionable findings. Run scripts/index.js, present prioritized findings, then investigate with MCP/LSP before fixing.
---

# Octocode Local Code Quality — Full-Stack Code Analysis

## What This Skill Does

This is the **only tool that combines architecture risk analysis + code quality + dead-code hygiene** in a single lightweight scan. It analyzes every TS/JS file in your monorepo `packages/` directory and produces **severity-ranked, actionable findings** with exact `file:line` locations and step-by-step fix strategies.

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
| 10 | `architecture-sdp-violation` | medium — high | Stable module depends on unstable module (Stable Dependencies Principle: I = Ce/(Ca+Ce)) |
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

## TL;DR for Agents

- Run exactly one executable: `scripts/index.js`.
- Default command (from workspace root): `node <SKILL_BASE_DIRECTORY>/scripts/index.js --out .octocode/scan/scan.json`.
- Present results in this order: **Summary → Top Findings (severity first) → Architecture Highlights → Ask what to fix first**.
- Severity order: `critical` > `high` > `medium` > `low` > `info`.
- Prefer MCP + LSP validation before code fixes when available.
- Every finding includes file:line, severity, reason, and `suggestedFix` with strategy + steps.

## Prime Directive

```
SCAN → ANALYZE → PRIORITIZE → INVESTIGATE → FIX
```

1. **Data-driven**: every finding has location, severity, reason, and fix strategy.
2. **Prioritized**: highest-risk findings first.
3. **Actionable**: concrete, ordered remediation steps.
4. **Validated**: investigate with MCP/LSP before changing code.

---

## Quick Start

### Step 1: Discover

1. Confirm workspace root contains `packages/`.
2. Confirm `<SKILL_BASE_DIRECTORY>/scripts/index.js` exists.
3. Detect whether Octocode MCP local/LSP tools are available.

### Step 2: Run

```bash
node <SKILL_BASE_DIRECTORY>/scripts/index.js --out .octocode/scan/scan.json
```

### Step 3: Present

Always use this structure:

1. **Summary**: files, functions, flows, dependency edges, finding counts by severity.
2. **Top Findings**: highest severity first, grouped by category.
3. **Architecture Highlights**: cycles, critical paths, SDP violations, coupling hotspots, unreachable modules.
4. **Dead Code Highlights**: dead exports, unused npm deps, orphan modules.
5. **Next Step**: ask which findings to fix first.

---

## Command Presets

| Situation | Command |
|---|---|
| Default scan | `node <SKILL_BASE_DIRECTORY>/scripts/index.js --out .octocode/scan/scan.json` |
| Deep scan (more findings) | `node <SKILL_BASE_DIRECTORY>/scripts/index.js --findings-limit 1000 --out .octocode/scan/scan.json` |
| Include test files | `node <SKILL_BASE_DIRECTORY>/scripts/index.js --include-tests --out .octocode/scan/scan.json` |
| Architecture graph (Mermaid) | `node <SKILL_BASE_DIRECTORY>/scripts/index.js --graph --out .octocode/scan/scan.json` |
| Strict complexity | `node <SKILL_BASE_DIRECTORY>/scripts/index.js --critical-complexity-threshold 20 --cognitive-complexity-threshold 10 --out .octocode/scan/scan.json` |
| Layer enforcement | `node <SKILL_BASE_DIRECTORY>/scripts/index.js --layer-order ui,service,repository --out .octocode/scan/scan.json` |
| After fixes (verify) | `node <SKILL_BASE_DIRECTORY>/scripts/index.js --out .octocode/scan/scan-after.json` |
| User asks about one topic | Same scan, then filter & present only selected categories from the JSON |

---

## Investigation Playbooks

Use when user chooses specific findings to act on. Always validate with MCP/LSP before changing code.

### MCP Discovery

<mcp_discovery>
Before deep investigation, detect research tooling.

If Octocode local tools return empty, suggest: "Add `ENABLE_LOCAL=true` to your Octocode MCP config."

If Octocode MCP is not installed, suggest setup once and continue with available tools.
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

1. Trust scan report and category evidence first.
2. Validate with targeted file reads only (no broad refactors).
3. Mark confidence explicitly (`high`, `medium`, `low`).
4. Recommend minimal-risk fixes and request user confirmation before wide changes.

---

## Response Template

```markdown
## Scan Summary
- **Scope**: <n> files, <n> functions, <n> flows, <n> dependency edges
- **Findings**: <n> total — <n> critical, <n> high, <n> medium, <n> low

## Top Findings (by severity)

### Critical
- `<file>:<line>` — <title> — <reason>

### High
- `<file>:<line>` — <title> — <reason>

### Medium (top 5)
- ...

## Architecture Health
- Cycles: <n>, Critical paths: <n>, SDP violations: <n>
- Coupling hotspots: <n>, Unreachable modules: <n>
- Orphan modules: <n>

## Dead Code Summary
- Dead exports: <n>, Dead re-exports: <n>, Dead files: <n>
- Unused npm deps: <n>, Boundary violations: <n>

## Next Step
Which findings should I investigate first?
```

---

## Report Reference

Primary JSON output: `.octocode/scan/scan.json`

Key sections:
- `summary` — file, function, flow, package counts
- `fileInventory[]` — per-file: functions, flows, dependency profile, linked issue IDs
- `duplicateFlows` — duplicate function body + control-flow groups
- `dependencyGraph` — modules, edges, roots, leaves, cycles, critical paths, hubs
- `dependencyFindings[]` — cycle, critical-path, test-only findings
- `optimizationFindings[]` — ALL findings sorted by severity (23 categories)
- `agentOutput` — summary counters, top recommendations, per-file issue mapping
- `parseErrors[]` — files that failed to parse

---

## Parser Modes

| Mode | Behavior |
|---|---|
| `auto` (default) | TypeScript primary analysis, optional tree-sitter node enrichment |
| `typescript` | TypeScript only |
| `tree-sitter` | Tree-sitter primary for functions/flows/complexity, TypeScript for dependencies; falls back if needed |

---

## Full CLI Reference

```
node scripts/index.js [options]

Core:
  --root <path>                       Repo root directory (default: cwd)
  --out <path>                        Write JSON report to file
  --json                              Print JSON report to stdout
  --include-tests                     Include test files in scan
  --parser <auto|typescript|tree-sitter>  Parser engine (default: auto)
  --graph                             Emit Mermaid dependency graph alongside JSON
  --findings-limit N                  Max findings in report (default: 250)

Complexity:
  --critical-complexity-threshold N   Cyclomatic complexity for HIGH findings (default: 30)
  --cognitive-complexity-threshold N  Cognitive complexity threshold (default: 15)
  --min-function-statements N         Min body statements for duplicate matching (default: 6)
  --min-flow-statements N             Min control-flow statements for matching (default: 6)

Architecture:
  --coupling-threshold N              Ca+Ce threshold for high-coupling (default: 15)
  --fan-in-threshold N                Fan-in threshold for god-module-coupling (default: 20)
  --fan-out-threshold N               Fan-out threshold for god-module-coupling (default: 15)
  --layer-order <layers>              Comma-separated layer order (e.g. ui,service,repository)

Module size:
  --god-module-statements N           Statement threshold for god-module (default: 500)
  --god-module-exports N              Export threshold for god-module (default: 20)
  --god-function-statements N         Statement threshold for god-function (default: 100)
  --barrel-symbol-threshold N         Re-export count for barrel-explosion (default: 30)

Output:
  --deep-link-topn N                  Max critical dependency paths reported (default: 12)
  --tree-depth N                      AST tree snapshot depth (default: 4)
  --no-tree                           Skip AST tree snapshots
  --emit-tree                         Force include AST tree snapshots
  --help                              Show help
```

---

## Architecture Concepts Reference

These concepts appear in findings and help agents explain results to users.

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

## Guardrails

- Run only `scripts/index.js` — do not execute internal source files.
- Never skip the summary before presenting detailed findings.
- Never present findings without `file:line` references.
- Never use LSP tools without `lineHint` from `localSearchCode`.
- Prefer MCP validation before fixing when available; use fallback policy when not.
- Let the user choose which findings to address before making broad refactors.
- After fixes, re-run scan to verify regression count.

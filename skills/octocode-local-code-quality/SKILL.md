---
name: octocode-local-code-quality
description: Scan TS/JS monorepo for architecture issues, code quality problems, and dead code. Use when asked to check architecture, audit code/repo quality, trace code flows, find cycles, unused exports, complexity, or dead files. Produces severity-ranked findings with file:line locations — validate with Octocode MCP local & LSP tools before fixing.
---

# Octocode Local Code Quality

Single-scan code analysis for TS/JS monorepos combining architecture risk, code quality, and dead-code hygiene. Produces **severity-ranked findings** with `file:line` locations across 33 categories.

```
SCAN (scripts/index.js) → PRESENT (summary.md) → VALIDATE (Octocode LSP + Local Search Tools) → FIX → RE-SCAN
```

## Guardrails

- **Pre-built scripts** — run `scripts/index.js` directly. NEVER `npm install`, `yarn`, `npm run build`, or any setup.
- **Never execute `src/` files** — only `scripts/` contains runnable JS. Only `scripts/index.js` is the entry point (other files are internal).
- **Always `localSearchCode` first** — `lineHint` is mandatory for all LSP tools. Never call LSP without it.
- **Absolute paths** for all MCP/LSP tools (e.g. `/Users/.../packages/foo/src/bar.ts`).
- Never present findings without `file:line` references.
- Let the user choose which findings to address before broad refactors.

---

## 1. Run the Scan

```bash
node <SKILL_BASE_DIRECTORY>/scripts/index.js
```

Output goes to `.octocode/scan/<timestamp>/` by default. Pass `--out path/to/file.json` for legacy single-file mode.

### CLI Presets

All commands start with `node <SKILL_BASE_DIRECTORY>/scripts/index.js`:

| Situation | Flags |
|---|---|
| Default scan | _(none)_ |
| Cap findings | `--findings-limit 500` |
| Architecture only | `--features=architecture` |
| Dead code only | `--features=dead-code` |
| Single category | `--features=cognitive-complexity` |
| Mix pillars + categories | `--features=dead-code,dependency-cycle` |
| Include tests | `--include-tests` |
| Architecture graph | `--graph` |
| Strict complexity | `--critical-complexity-threshold 20 --cognitive-complexity-threshold 10` |
| Strict type safety | `--any-threshold 0` |
| Strict maintainability | `--maintainability-index-threshold 30 --halstead-effort-threshold 200000` |
| Layer enforcement | `--layer-order ui,service,repository` |
| Sensitive flow dups | `--flow-dup-threshold 2 --min-flow-statements 4` |
| Diverse top recs | `--max-recs-per-category 1` |
| JSON to stdout | `--json` |

Parser modes: `auto` (default — TS primary + optional tree-sitter), `typescript`, `tree-sitter`.

---

## 2. Present Results

Read `summary.md` first — it has scope, severity breakdown, per-pillar counts, top 10 recommendations, change risk hotspots, and links to all output files. Drill into feature JSONs only for investigation.

### Presentation Template

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
- Cycles, Critical paths, SDP violations, Coupling hotspots
- Unreachable/orphan modules, Low cohesion, Layer violations
- Change Risk Hotspots: top files by blast radius

## Code Quality (from code-quality.json)
- Duplicates, Complex functions, God modules/functions
- Halstead, Maintainability, Cyclomatic density
- Params, Magic numbers, Unsafe `any`, Empty catches, Switch no-default

## Dead Code & Hygiene (from dead-code.json)
- Dead exports/re-exports/files, Unused npm deps
- Boundary violations, Barrel explosions

## Next Step
Which findings should I investigate first?
```

Severity order: `critical` > `high` > `medium` > `low` > `info`.

---

## 3. Output Reference

Each scan writes to `.octocode/scan/<timestamp>/`:

| File | Contents | When to Read |
|------|----------|-------------|
| `summary.md` | Scope, severity, per-pillar counts, top 10 recs, change risk hotspots, file index | **Always first** |
| `summary.json` | Machine-readable counters, `topRecommendations[]`, `parseErrors[]` | Programmatic access |
| `architecture.json` | Dep graph (modules, edges, cycles, criticalPaths, roots, leaves), 11 arch findings, `hotFiles[]` (riskScore, fanIn, fanOut, inCycle, onCriticalPath), severity/category breakdowns | Cycles, coupling, SDP, layers, change risk |
| `code-quality.json` | `duplicateFlows` groups, 14 quality findings (Halstead, MI, density, params, magic, `any`, catch, switch), severity/category breakdowns | Duplicates, complexity, type safety |
| `dead-code.json` | 8 hygiene findings, severity/category breakdowns | Cleaning up dead code |
| `file-inventory.json` | Per-file: `functions[]` (halstead, MI, params, cognitive), `flows[]`, `dependencyProfile`, `issueIds[]`, `emptyCatches[]`, `magicNumbers[]`, `anyCount` | Deep-diving a specific file |
| `findings.json` | ALL findings sorted by severity across all 33 categories | Complete sorted list |
| `graph.md` | Mermaid dependency graph (only with `--graph`) | Visual architecture |
| `ast-trees.txt` | Compact `Kind[startLine:endLine]` per file (only with `--emit-tree`) | Structural overview |

### Reading `summary.md` (fixed section order — read top-down, stop when enough)

1. **Scan Scope** — files, functions, flows, packages
2. **Findings Overview** — severity table + truncation/features-filter notices
3. **Architecture Health** — dep graph metrics + all 11 categories with counts (0 = clean, `skipped` = filtered out by `--features`)
4. **Change Risk Hotspots** — top 15 riskiest files (riskScore, fanIn, fanOut, complexity, cycle/critical-path flags)
5. **Code Quality** — all 14 categories with counts
6. **Dead Code & Hygiene** — all 8 categories with counts
7. **Top Recommendations** — 10 highest-severity findings
8. **Output Files** — table with sizes

### Navigating `ast-trees.txt`

Format: `Kind[startLine:endLine]` per node, indented by depth. Truncated subtrees end with `...`.

| Goal | Command |
|------|---------|
| List all files | `grep "^##" ast-trees.txt` |
| Find functions | `grep -E "FunctionDeclaration\|ArrowFunction" ast-trees.txt` |
| Find classes | `grep -E "ClassDeclaration" ast-trees.txt` |
| Deep nesting (>3) | `grep -E "^\s{8,}" ast-trees.txt` |

### Legacy Single-File Mode (`--out path/to/file.json`)

Keys: `summary`, `fileInventory[]`, `duplicateFlows`, `dependencyGraph`, `dependencyFindings[]`, `optimizationFindings[]`, `agentOutput`, `parseErrors[]`.

---

## 4. Validate & Investigate

**Do not fix based on scan output alone.** Validate each finding with Octocode MCP tools before changing code.

### MCP Availability

Try `localSearchCode` first. If it fails → Octocode not installed or `ENABLE_LOCAL ≠ "true"`.
- Suggest once: "Enable local tools by setting `ENABLE_LOCAL=true` in your Octocode MCP config."
- **Without MCP**: trust scan evidence, validate with targeted file reads only, mark confidence (`high`/`medium`/`low`), avoid broad refactors, request user confirmation for wide changes.

### Tool Chain (search → locate → analyze → read)

```
1. localSearchCode(pattern)         → get lineHint (1-indexed)
2. lspGotoDefinition(lineHint)      → jump to definition
3. lspFindReferences(lineHint)      → all usages (types, variables, exports)
4. lspCallHierarchy(lineHint, dir)  → call flow (functions only: incoming=callers, outgoing=callees)
5. localGetFileContent              → read implementation (ALWAYS LAST)
```

**Rules:**
- `lspFindReferences` for types/variables/all usages; `lspCallHierarchy` for function calls only
- Batch: `localSearchCode` up to 5 queries/call, LSP tools 3–5
- Use `lspCallHierarchy(depth=1)` and chain manually (faster than `depth=3`)
- LSP returns 0-indexed lines; `localSearchCode` returns 1-indexed — use 1-indexed for `lineHint`
- If LSP returns empty, try broader search variants before concluding
- External packages: `packageSearch` → `githubSearchCode` (LSP is local-only)

### Investigation Loop

1. Read finding: `file`, `lineStart`, `lineEnd`, `category`, `reason`, `suggestedFix`
2. `localSearchCode` for symbol → get `lineHint`
3. LSP tools with `lineHint`
4. Cross-check `fileInventory` and related findings in same file
5. Follow `suggestedFix.steps`
6. After fix, re-run scan and compare finding counts

### Architecture Playbooks

| Finding | Validate | Fix |
|---------|----------|-----|
| `dependency-cycle` | `localSearchCode(import.*from)` on cycle files → `lspGotoDefinition` | Break with shared contracts or dependency inversion |
| `dependency-critical-path` | `localSearchCode(export)` on hub → `lspCallHierarchy(incoming)` | Split hub responsibilities, enforce boundaries |
| `architecture-sdp-violation` | `lspCallHierarchy(incoming)` on stable; `lspCallHierarchy(outgoing)` on unstable. Read `reason` for I values | Invert via interface extraction or move to stable utility |
| `high-coupling` | `lspFindReferences` on key exports → count consumer files. Read `reason` for Ca/Ce | Extract focused sub-modules by consumer group |
| `god-module-coupling` | Fan-in: `lspFindReferences`; Fan-out: `lspCallHierarchy(outgoing)` | Split by responsibility, introduce facade |
| `orphan-module` | `localSearchCode(fileName, filesOnly=true)` — check runtime config, routes | Delete if disconnected, or wire in explicitly |
| `unreachable-module` | `localSearchCode(moduleName)` — check dynamic imports, plugins | Delete subgraph if confirmed |
| `layer-violation` | `lspGotoDefinition` on violating import. Check `reason` for layer names | Extract shared contracts to lower layer or invert |
| `inferred-layer-violation` | Same as `layer-violation`. Auto-detected: `types/`→foundation, `utils/`→utility, `services/`→service, `features/`→feature | Same as `layer-violation` |
| `low-cohesion` | `lspFindReferences` on each export → map consumer clusters. Read `reason` for LCOM count | Split into N focused modules (one per component) |

**Change Risk Hotspots** (`architecture.json` → `hotFiles[]`): riskScore = fan-in + complexity + exports + cycle/critical-path membership. Prioritize these for refactoring.

### Code Quality Playbooks

| Finding | Validate | Fix |
|---------|----------|-----|
| `duplicate-function-body` | `localSearchCode` → `lspFindReferences` + `lspCallHierarchy(incoming)` | Extract shared helper, pass differences as params |
| `duplicate-flow-structure` | `localGetFileContent(startLine, endLine)` → `localSearchCode(key expression)` | Extract reusable flow helper |
| `function-optimization` | `lspCallHierarchy(incoming)` + `(outgoing)` | Split along responsibilities, guard clauses |
| `cognitive-complexity` | `localGetFileContent(startLine, endLine)` | Early returns, extract nested blocks, named predicates |
| `god-module` | `localGetFileContent` → identify functional groups | Extract each group into dedicated module |
| `god-function` | `localGetFileContent(startLine, endLine)` | Extract logical steps into named helpers, keep orchestrator |
| `halstead-effort` | `localGetFileContent(startLine, endLine)` + `lspCallHierarchy(outgoing)` | Extract sub-expressions, split into smaller functions |
| `low-maintainability` | Check `reason` for MI components. `localGetFileContent(startLine, endLine)` | Reduce LOC, lower complexity with early returns, simplify expressions |
| `high-cyclomatic-density` | `localGetFileContent(startLine, endLine)` | Guard clauses, named predicates, lookup tables, strategy pattern |
| `excessive-parameters` | `lspCallHierarchy(incoming)` → check caller diversity | Group into options object, split if params serve different concerns |
| `unsafe-any` | `localSearchCode(": any\|as any")` → `lspFindReferences` on typed alternatives | `unknown` + type guards, generics, proper interfaces |
| `magic-number` | `localSearchCode(literal value)` → count cross-file usages | Named `const` (e.g. `MAX_RETRY_COUNT = 3`), config objects |
| `empty-catch` | `localGetFileContent(startLine, endLine)` | Add logging, re-throw, or comment explaining intent |
| `switch-no-default` | `localGetFileContent(startLine, endLine)` | `default` with unreachable error or `never` assertion |

### Dead Code & Hygiene Playbooks

| Finding | Validate | Fix |
|---------|----------|-----|
| `dead-file` | `localSearchCode(fileNameWithoutExt, filesOnly=true)` → `lspFindReferences` | Confirm not runtime entrypoint, then delete |
| `dead-export` | `localSearchCode(export symbolName)` → `lspFindReferences(includeDeclaration=false)` | Check public API intent, remove export or delete symbol |
| `dead-re-export` | `localSearchCode(export.*from)` on barrel → `lspFindReferences` | Remove stale re-export |
| `re-export-duplication` / `re-export-shadowed` | `localSearchCode(export {)` in barrel → `lspFindReferences` | Keep one source-of-truth per name |
| `unused-npm-dependency` | `localSearchCode(packageName)` — check build scripts, configs | `npm uninstall`, verify build/tests |
| `package-boundary-violation` | `lspGotoDefinition` on cross-package import | Re-export from target index, update import path |
| `barrel-explosion` | `localGetFileContent(barrel file)` | Group into sub-barrels or import directly from source |
| `dependency-test-only` | `lspFindReferences` + `localSearchCode(from.*moduleName, filesOnly=true)` | Move to test fixtures or add production usage |

---

## 5. Finding Categories Reference

33 categories across three pillars. Every finding has: `severity`, `file:line`, `suggestedFix`.

### Architecture Risk (11)

| # | Category | Severity | Detects |
|---|----------|----------|---------|
| 1 | `dependency-cycle` | high | Circular import chains |
| 2 | `dependency-critical-path` | high — critical | High-weight transitive dependency chains (blast radius) |
| 3 | `dependency-test-only` | medium | Production modules imported only from tests |
| 4 | `architecture-sdp-violation` | medium — high | Stable module depends on unstable module (I = Ce/(Ca+Ce)) |
| 5 | `high-coupling` | medium — high | Excessive Ca + Ce total connections |
| 6 | `god-module-coupling` | medium — high | High fan-in (bottleneck) or fan-out (knows too much) |
| 7 | `orphan-module` | medium | Zero inbound AND zero outbound dependencies |
| 8 | `unreachable-module` | high | Not reachable from any entrypoint via BFS |
| 9 | `layer-violation` | high | Import backwards in configured layer order |
| 10 | `low-cohesion` | medium — high | Exports serve unrelated purposes (LCOM > 1) |
| 11 | `inferred-layer-violation` | medium — high | Auto-detected layer boundary crossed |

### Code Quality (14)

| # | Category | Severity | Detects |
|---|----------|----------|---------|
| 12 | `duplicate-function-body` | low — high | Identical function implementations across files |
| 13 | `duplicate-flow-structure` | medium — high | Repeated if/switch/try control-flow patterns |
| 14 | `function-optimization` | medium — high | High cyclomatic complexity, deep nesting, oversized functions |
| 15 | `cognitive-complexity` | medium — high | Nesting-aware complexity score |
| 16 | `god-module` | high | Files >500 statements or >20 exports |
| 17 | `god-function` | high | Functions >100 statements |
| 18 | `halstead-effort` | medium — high | Halstead effort > 500K or estimated bugs > 2.0 |
| 19 | `low-maintainability` | high — critical | Maintainability Index < 20 (scale 0-100) |
| 20 | `high-cyclomatic-density` | medium — high | Complexity/LOC > 0.5 (every other line is a branch) |
| 21 | `excessive-parameters` | medium — high | Function >5 parameters (`--parameter-threshold`) |
| 22 | `magic-number` | medium — high | >3 magic number literals (`--magic-number-threshold`) |
| 23 | `unsafe-any` | medium — high | >5 `any` types (`--any-threshold`) |
| 24 | `empty-catch` | medium | Empty catch block silently swallows errors |
| 25 | `switch-no-default` | low | Switch missing default case |

### Dead Code & Hygiene (8)

| # | Category | Severity | Detects |
|---|----------|----------|---------|
| 26 | `dead-file` | medium | No inbound imports, no outbound deps, not entrypoint |
| 27 | `dead-export` | medium — high | Exported symbol with no observed usage |
| 28 | `dead-re-export` | medium | Barrel re-export with no downstream consumers |
| 29 | `re-export-duplication` | medium | Same symbol re-exported from multiple paths |
| 30 | `re-export-shadowed` | high | Local export and re-export collide on same name |
| 31 | `unused-npm-dependency` | low — medium | package.json dependency not imported anywhere |
| 32 | `package-boundary-violation` | medium — high | Cross-package import bypassing public API |
| 33 | `barrel-explosion` | medium — high | Barrel >30 re-exports or >2 chain levels |

---

## 6. Architecture Concepts

**Instability (SDP)**: `I = Ce / (Ca + Ce)` — Ca = modules depending on this, Ce = modules this depends on. I=0 maximally stable, I=1 maximally unstable. Violation: `I(source) < I(target)`.

**Cognitive Complexity**: Penalizes nesting, not just branches. Each `if`/`for`/`while`/`switch`/`catch`/`&&`/`||` adds +1, each nesting level adds +1 more. `if(a){if(b){}}` = 3.

**Halstead**: Vocabulary = distinct operators + operands. Volume = Length x log2(Vocabulary). Effort = Volume x Difficulty. >500K effort or >2.0 estimated bugs = too complex.

**Maintainability Index**: `MI = 171 - 5.2*ln(Volume) - 0.23*CC - 16.2*ln(LOC)`, rescaled 0-100. >40 easy, 20-40 moderate, <20 flagged, <10 critical.

**Cyclomatic Density**: `CC / LOC`. >0.5 means every other line is a branch.

**Reachability**: BFS from entrypoints (`index`, `main`, `app`, `server`, `cli`, `public`, `*.config.*`). Stricter than `dead-file` (checks transitive paths, not just direct edges).

**Package Boundaries**: `packages/A/` should import from `packages/B/src/index.ts` (public API), never `packages/B/src/internal/bar.ts`.

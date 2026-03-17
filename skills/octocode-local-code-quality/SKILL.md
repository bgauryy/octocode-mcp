---
name: octocode-local-code-quality
description: Scan TS/JS monorepo for architecture issues, code quality problems, and dead code. Use when asked to check architecture, audit code/repo quality, trace code flows, find cycles, unused exports, complexity, or dead files. Produces severity-ranked findings with file:line locations — validate with Octocode MCP local & LSP tools before fixing.
---

# Octocode Local Code Quality

Single-scan analysis for TS/JS monorepos. 33 finding categories across architecture risk, code quality, and dead-code hygiene. Severity-ranked findings with `file:line` locations and actionable fix strategies.

```
SCAN → READ summary.md → VALIDATE (Octocode LSP) → FIX → RE-SCAN
```

## Guardrails

- **Pre-built scripts** — run `scripts/index.js` directly. NEVER `npm install`, `yarn`, `npm run build`, or any setup.
- **Never execute `src/` files** — only `scripts/` contains runnable JS.
- **Always `localSearchCode` first** — `lineHint` is mandatory for all LSP tools.
- **Absolute paths** for all MCP/LSP tools.
- Never present findings without `file:line` references.
- Let the user choose which findings to address before broad refactors.

---

## 1. Run the Scan

```bash
node <SKILL_BASE_DIRECTORY>/scripts/index.js
```

Output goes to `.octocode/scan/<timestamp>/` by default. Results are cached — subsequent runs skip unchanged files (~4x faster).

### CLI Presets

| Situation | Flags |
|---|---|
| Default scan | _(none)_ |
| Architecture only | `--features=architecture` |
| Code quality only | `--features=code-quality` |
| Dead code only | `--features=dead-code` |
| Single category | `--features=cognitive-complexity` |
| Mix pillars + categories | `--features=dead-code,dependency-cycle` |
| Everything except X | `--exclude=architecture` |
| Exclude specific categories | `--exclude=dead-export,magic-number` |
| Cap findings | `--findings-limit 500` |
| Include tests | `--include-tests` |
| Architecture graph | `--graph` |
| Strict complexity | `--critical-complexity-threshold 20 --cognitive-complexity-threshold 10` |
| Strict type safety | `--any-threshold 0` |
| Strict maintainability | `--maintainability-index-threshold 30 --halstead-effort-threshold 200000` |
| Layer enforcement | `--layer-order ui,service,repository` |
| Sensitive flow dups | `--flow-dup-threshold 2 --min-flow-statements 4` |
| Diverse top recs | `--max-recs-per-category 1` |
| Force full re-parse | `--no-cache` |
| Clear cache | `--clear-cache` |
| JSON to stdout | `--json` |

`--features` and `--exclude` are mutually exclusive. Both accept pillar names (`architecture`, `code-quality`, `dead-code`) and individual category names, comma-separated.

Parser modes: `auto` (default — TS primary + optional tree-sitter), `typescript`, `tree-sitter`.

---

## 2. Present Results

Read `summary.md` first — it has everything needed for a top-level presentation. Only drill into feature JSONs for investigation.

**Summary sections** (fixed order — read top-down, stop when enough):

1. **Scan Scope** — files, functions, flows, packages
2. **Findings Overview** — severity table + truncation/features-filter notices
3. **Architecture Health** — dep graph metrics + all 11 categories with counts (0 = clean, `skipped` = filtered by `--features`/`--exclude`)
4. **Change Risk Hotspots** — top 15 riskiest files (riskScore, fanIn, fanOut, complexity, cycle/critical-path flags)
5. **Code Quality** — all 14 categories with counts
6. **Dead Code & Hygiene** — all 8 categories with counts
7. **Top Recommendations** — 10 highest-severity findings (diverse by default)
8. **Output Files** — table with sizes

Present to user:

```markdown
## Scan Summary
- **Scope**: <n> files, <n> functions, <n> flows, <n> dependency edges
- **Findings**: <n> total — <n> critical, <n> high, <n> medium, <n> low

## Top Findings (by severity)
### Critical
- `<file>:<line>` — <title> — <reason>
### High
- `<file>:<line>` — <title> — <reason>

## Next Step
Which findings should I investigate first?
```

Severity order: `critical` > `high` > `medium` > `low` > `info`.

---

## 3. Output Files

Each scan writes to `.octocode/scan/<timestamp>/`:

| File | Contents | When to Read |
|------|----------|-------------|
| `summary.md` | Scope, severity, per-pillar counts, top recs, change risk hotspots | **Always first** |
| `summary.json` | Machine-readable counters, `topRecommendations[]`, `parseErrors[]` | Programmatic access |
| `architecture.json` | Dep graph, 11 arch findings, `hotFiles[]`, severity/category breakdowns | Cycles, coupling, SDP, layers |
| `code-quality.json` | 14 quality findings, severity/category breakdowns | Duplicates, complexity |
| `dead-code.json` | 8 hygiene findings, severity/category breakdowns | Dead code cleanup |
| `file-inventory.json` | Per-file: functions, flows, metrics, `issueIds[]` | Deep-diving a specific file |
| `findings.json` | ALL findings sorted by severity across all 33 categories | Complete sorted list |
| `graph.md` | Mermaid dependency graph (only with `--graph`) | Visual architecture |
| `ast-trees.txt` | `Kind[startLine:endLine]` per file (only with `--emit-tree`) | Structural overview |

### Legacy Single-File Mode (`--out path/to/file.json`)

Keys: `summary`, `fileInventory[]`, `duplicateFlows`, `dependencyGraph`, `dependencyFindings[]`, `optimizationFindings[]`, `agentOutput`, `parseErrors[]`.

---

## 4. Validate & Investigate

**Do not fix based on scan output alone.** Validate each finding with Octocode MCP tools before changing code.

### MCP Availability

Try `localSearchCode` first. If it fails → Octocode not installed or `ENABLE_LOCAL ≠ "true"`.
- Suggest once: "Enable local tools by setting `ENABLE_LOCAL=true` in your Octocode MCP config."
- **Without MCP**: trust scan evidence, validate with targeted file reads, mark confidence (`high`/`medium`/`low`), avoid broad refactors.

### Tool Chain

```
1. localSearchCode(pattern)         → get lineHint (1-indexed)
2. lspGotoDefinition(lineHint)      → jump to definition
3. lspFindReferences(lineHint)      → all usages (types, variables, exports)
4. lspCallHierarchy(lineHint, dir)  → call flow (functions only: incoming/outgoing)
5. localGetFileContent              → read implementation (ALWAYS LAST)
```

**Rules:**
- `lspFindReferences` for types/variables; `lspCallHierarchy` for function calls only
- Batch: `localSearchCode` up to 5/call, LSP tools 3–5
- Use `lspCallHierarchy(depth=1)` and chain manually
- External packages: `packageSearch` → `githubSearchCode`

### Investigation Loop

1. Read finding: `file`, `lineStart`, `category`, `reason`, `suggestedFix`
2. `localSearchCode` for symbol → get `lineHint`
3. LSP tools with `lineHint`
4. Cross-check `fileInventory` and related findings in same file
5. Follow `suggestedFix.steps`
6. After fix, re-run scan and compare counts

### Architecture Playbooks

| Finding | Validate | Fix |
|---------|----------|-----|
| `dependency-cycle` | `localSearchCode(import.*from)` on cycle files → `lspGotoDefinition` | Break with shared contracts or dependency inversion |
| `dependency-critical-path` | `localSearchCode(export)` on hub → `lspCallHierarchy(incoming)` | Split hub, enforce boundaries |
| `architecture-sdp-violation` | `lspCallHierarchy(incoming)` on stable; `(outgoing)` on unstable | Invert via interface or move to stable utility |
| `high-coupling` | `lspFindReferences` on key exports → count consumers | Extract focused sub-modules by consumer group |
| `god-module-coupling` | Fan-in: `lspFindReferences`; Fan-out: `lspCallHierarchy(outgoing)` | Split by responsibility, introduce facade |
| `orphan-module` | `localSearchCode(fileName, filesOnly=true)` — check runtime config | Delete if disconnected |
| `unreachable-module` | `localSearchCode(moduleName)` — check dynamic imports | Delete subgraph if confirmed |
| `layer-violation` | `lspGotoDefinition` on violating import | Extract shared contracts to lower layer |
| `inferred-layer-violation` | Same as `layer-violation` (auto-detected: `types/`→foundation, `utils/`→utility, `services/`→service) | Same fix |
| `low-cohesion` | `lspFindReferences` per export → map consumer clusters | Split into N focused modules |
| `dependency-test-only` | `lspFindReferences` + `localSearchCode(from.*moduleName, filesOnly=true)` | Move to test fixtures or add production usage |

### Code Quality Playbooks

| Finding | Validate | Fix |
|---------|----------|-----|
| `duplicate-function-body` | `localSearchCode` → `lspFindReferences` + `lspCallHierarchy(incoming)` | Extract shared helper |
| `duplicate-flow-structure` | `localGetFileContent(startLine, endLine)` | Extract reusable flow helper |
| `function-optimization` | `lspCallHierarchy(incoming)` + `(outgoing)` | Split along responsibilities |
| `cognitive-complexity` | `localGetFileContent(startLine, endLine)` | Early returns, extract nested blocks |
| `god-module` | `localGetFileContent` → identify groups | Extract each into dedicated module |
| `god-function` | `localGetFileContent(startLine, endLine)` | Extract steps into named helpers |
| `high-halstead-effort` | `localGetFileContent` + `lspCallHierarchy(outgoing)` | Split into smaller functions |
| `low-maintainability` | Check `reason` for MI components | Reduce LOC, simplify expressions |
| `high-cyclomatic-density` | `localGetFileContent(startLine, endLine)` | Guard clauses, lookup tables |
| `excessive-parameters` | `lspCallHierarchy(incoming)` → check caller diversity | Group into options object |
| `unsafe-any` | `localSearchCode(": any\|as any")` | `unknown` + type guards, generics |
| `magic-number` | `localSearchCode(literal value)` | Named `const`, config objects |
| `empty-catch` | `localGetFileContent(startLine, endLine)` | Add logging or re-throw |
| `switch-no-default` | `localGetFileContent(startLine, endLine)` | Add `default` with unreachable error |

### Dead Code & Hygiene Playbooks

| Finding | Validate | Fix |
|---------|----------|-----|
| `dead-file` | `localSearchCode(fileNameWithoutExt, filesOnly=true)` → `lspFindReferences` | Confirm not runtime entrypoint, then delete |
| `dead-export` | `localSearchCode(export symbolName)` → `lspFindReferences(includeDeclaration=false)` | Remove export or delete symbol |
| `dead-re-export` | `localSearchCode(export.*from)` on barrel → `lspFindReferences` | Remove stale re-export |
| `re-export-duplication` / `re-export-shadowed` | `localSearchCode(export {)` in barrel | Keep one source-of-truth per name |
| `unused-npm-dependency` | `localSearchCode(packageName)` — check build scripts | `npm uninstall`, verify build |
| `package-boundary-violation` | `lspGotoDefinition` on cross-package import | Re-export from target index |
| `barrel-explosion` | `localGetFileContent(barrel file)` | Group into sub-barrels |

**Change Risk Hotspots** (`architecture.json` → `hotFiles[]`): riskScore = fan-in + complexity + exports + cycle/critical-path membership. Prioritize for refactoring.

---

## 5. Finding Categories (33)

### Architecture Risk (11)

| # | Category | Severity | Detects |
|---|----------|----------|---------|
| 1 | `dependency-cycle` | high | Circular import chains |
| 2 | `dependency-critical-path` | high — critical | High-weight transitive dependency chains |
| 3 | `dependency-test-only` | medium | Production modules imported only from tests |
| 4 | `architecture-sdp-violation` | medium — high | Stable module depends on unstable module (I = Ce/(Ca+Ce)) |
| 5 | `high-coupling` | medium — high | Excessive Ca + Ce connections |
| 6 | `god-module-coupling` | medium — high | High fan-in (bottleneck) or fan-out (sprawl) |
| 7 | `orphan-module` | medium | Zero inbound AND zero outbound dependencies |
| 8 | `unreachable-module` | high | Not reachable from any entrypoint via BFS |
| 9 | `layer-violation` | high | Import backwards in configured layer order |
| 10 | `low-cohesion` | medium — high | Exports serve unrelated purposes (LCOM > 1) |
| 11 | `inferred-layer-violation` | medium — high | Auto-detected layer boundary crossed |

### Code Quality (14)

| # | Category | Severity | Detects |
|---|----------|----------|---------|
| 12 | `duplicate-function-body` | low — high | Identical function implementations across files |
| 13 | `duplicate-flow-structure` | medium — high | Repeated control-flow patterns |
| 14 | `function-optimization` | medium — high | High complexity, deep nesting, oversized functions |
| 15 | `cognitive-complexity` | medium — high | Nesting-aware complexity score |
| 16 | `god-module` | high | Files >500 statements or >20 exports |
| 17 | `god-function` | high | Functions >100 statements |
| 18 | `high-halstead-effort` | medium — high | Halstead effort > 500K or estimated bugs > 2.0 |
| 19 | `low-maintainability` | high — critical | Maintainability Index < 20 |
| 20 | `high-cyclomatic-density` | medium — high | CC/LOC > 0.5 |
| 21 | `excessive-parameters` | medium — high | Function >5 parameters |
| 22 | `magic-number` | medium — high | >3 magic number literals |
| 23 | `unsafe-any` | medium — high | >5 `any` types |
| 24 | `empty-catch` | medium | Empty catch block |
| 25 | `switch-no-default` | low | Switch missing default case |

### Dead Code & Hygiene (8)

| # | Category | Severity | Detects |
|---|----------|----------|---------|
| 26 | `dead-file` | medium | No imports, no deps, not entrypoint |
| 27 | `dead-export` | medium — high | Exported symbol with no usage |
| 28 | `dead-re-export` | medium | Barrel re-export with no consumers |
| 29 | `re-export-duplication` | medium | Same symbol re-exported from multiple paths |
| 30 | `re-export-shadowed` | high | Local export and re-export name collision |
| 31 | `unused-npm-dependency` | low — medium | package.json dep not imported anywhere |
| 32 | `package-boundary-violation` | medium — high | Cross-package import bypassing public API |
| 33 | `barrel-explosion` | medium — high | Barrel >30 re-exports or >2 chain levels |

---

## 6. Concepts

**Instability (SDP)**: `I = Ce / (Ca + Ce)`. Ca = inbound, Ce = outbound. I=0 stable, I=1 unstable. Violation: stable depends on unstable.

**Cognitive Complexity**: Penalizes nesting. Each `if`/`for`/`while`/`switch`/`catch`/`&&`/`||` adds +1, each nesting level adds +1 more.

**Halstead**: Volume = Length x log2(Vocabulary). Effort = Volume x Difficulty. >500K effort = too complex.

**Maintainability Index**: `MI = 171 - 5.2*ln(Volume) - 0.23*CC - 16.2*ln(LOC)`, rescaled 0-100. >40 easy, 20-40 moderate, <20 flagged.

**Cyclomatic Density**: `CC / LOC`. >0.5 means every other line is a branch.

**Reachability**: BFS from entrypoints (`index`, `main`, `app`, `server`, `cli`, `public`, `*.config.*`). Stricter than `dead-file`.

**Package Boundaries**: `packages/A/` should import from `packages/B/src/index.ts` (public API), never `packages/B/src/internal/bar.ts`.

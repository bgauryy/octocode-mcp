---
name: octocode-local-code-quality
description: Scan TS/JS monorepo for architecture issues, code quality problems, and dead code. Use when asked to check architecture, audit code/repo quality, trace code flows, find cycles, unused exports, complexity, or dead files. Produces severity-ranked findings with file:line locations — validate with Octocode MCP local & LSP tools before fixing.
---

# Octocode Local Code Quality

Single-scan analysis for TS/JS monorepos. 51 finding categories across architecture risk, code quality, and dead-code hygiene (38 AST-based + 13 semantic with `--semantic`). Severity-ranked findings with `file:line` locations, searchable `tags`, health scores per pillar, `lspHints` for agent validation, and actionable fix strategies.

## Core Workflow

```
SCAN → READ summary.md → VALIDATE (Octocode LSP) → FIX → RE-SCAN
```

---

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

Output: `.octocode/scan/<timestamp>/`. Cached — re-runs skip unchanged files (~4x faster).

Common flags: `--scope=<path>`, `--features=<pillar|category>`, `--exclude=<pillar|category>`, `--semantic`, `--graph`, `--json`, `--no-cache`.

> **Need flag details, presets, or drill-down workflow?** → [references/cli-reference.md](./references/cli-reference.md)

---

## 2. Present Results

Read `summary.md` first — it has everything for a top-level presentation. Only drill into feature JSONs for investigation.

Present: Scope → Health scores → Findings by severity → Top tags → Ask user which to investigate.

> **Need the presentation template or summary section details?** → [references/present-results.md](./references/present-results.md)

---

## 3. Output Files

Each scan writes to `.octocode/scan/<timestamp>/`: `summary.md`, `summary.json`, `architecture.json`, `code-quality.json`, `dead-code.json`, `file-inventory.json`, `findings.json`, `ast-trees.txt`, and optionally `graph.md`.

> **Need the full file table or legacy mode details?** → [references/output-files.md](./references/output-files.md)

---

## 4. Validate & Investigate

**Do not fix based on scan output alone.** Validate each finding with Octocode MCP tools first.

**Quick tool chain:**

```
localSearchCode(pattern) → lineHint → lspGotoDefinition / lspFindReferences / lspCallHierarchy → localGetFileContent (LAST)
```

**Investigation loop:** Read finding → check `lspHints[]` → search → LSP validate → cross-check `fileInventory` → follow `suggestedFix.steps` → re-scan.

> **Need MCP availability checks, tool chain rules, or lspHints details?** → [references/validate-investigate.md](./references/validate-investigate.md)
>
> **Need per-category validate & fix instructions?** → [references/playbooks.md](./references/playbooks.md)

---

## 5. Finding Categories (51)

19 architecture risk + 22 code quality + 10 dead code & hygiene. 13 of the 51 require `--semantic`.

> **Need the full category tables?** → [references/finding-categories.md](./references/finding-categories.md)

---

## 6. AST Search — Structural Code Search

Finds code by **shape** (AST structure), not text. Use after scan to locate specific patterns, or independently for any structural query.

```bash
node <SKILL_BASE_DIRECTORY>/scripts/ast-search.js [options]
```

### When to Use

- Scan flags `unsafe-any` → `--preset any-type --root <package>` to get every location
- Need all calls to a function → `-p 'fetchData($$$ARGS)' --root ./src --json`
- Hunt code smells across monorepo → `--preset empty-catch --root ../..`
- Explore AST structure → `-k function_declaration --root ./src --limit 10`
- Complex structural query → `--rule '{"rule":{"kind":"if_statement","not":{"has":{"kind":"else_clause"}}}}' --root ./src`

### Search Modes (pick one)

| Mode | Flag | Use when | Example |
|------|------|----------|---------|
| Pattern | `-p` | You know the code shape | `-p 'console.$M($$$A)'` |
| Kind | `-k` | You want all nodes of a type | `-k class_declaration` |
| Preset | `--preset` | Common code smell | `--preset empty-catch` |
| Rule | `--rule` | Need negation, regex, or nesting | `--rule '{"rule":{...}}'` |

### Key Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `--root <path>` | cwd | Search directory |
| `--json` | off | Machine-readable output (always use for programmatic consumption) |
| `--limit N` | 500 | Cap total matches |
| `--include-tests` | off | Include test files |
| `-C N` | 0 | Context lines around matches (text mode) |
| `--list-presets` | — | Show all 16 presets |

### Pattern Wildcards

- `$NAME` — matches **one** AST node (captured in `metaVariables`)
- `$$$NAME` — matches **zero or more** nodes (variadic)
- Use `$MOD` for imports to avoid quote-style mismatch (`'x'` vs `"x"`)

### Quick Recipes

```bash
# Calls
-p 'console.$METHOD($$$ARGS)'        # any console method
-p 'JSON.parse($$$A)'                # all JSON.parse
-p 'process.env.$VAR'                # env access (captures var name)

# Declarations
-p 'export const $NAME = $VAL'       # exported constants
-p 'function $NAME($$$P) { $$$B }'   # all functions

# Imports
-p 'import { $$$N } from $MOD'       # named imports (any module)
-p 'import type { $$$N } from $MOD'  # type imports

# Security
--rule '{"rule":{"kind":"string","regex":"password|secret|token"}}'
-p 'eval($$$A)'

# Negation (requires --rule)
--rule '{"rule":{"kind":"if_statement","not":{"has":{"kind":"else_clause"}}}}'
```

### 16 Presets

`empty-catch` · `console-log` · `console-any` · `debugger` · `todo-fixme` · `any-type` · `type-assertion` · `non-null-assertion` · `fat-arrow-body` · `nested-ternary` · `throw-string` · `switch-no-default` · `class-declaration` · `async-function` · `export-default` · `import-star`

> **Full reference**: rule operators, kind table, all presets with descriptions, output format → [references/ast-search.md](./references/ast-search.md)

---

## 7. Concepts

Metric definitions: Instability (SDP), Cognitive Complexity, Halstead, Maintainability Index, Cyclomatic Density, Reachability, Package Boundaries.

> **Need metric formulas and thresholds?** → [references/concepts.md](./references/concepts.md)

---

## References

| Reference | Contents |
|-----------|----------|
| [cli-reference.md](./references/cli-reference.md) | All CLI flags, presets, scope syntax, drill-down workflow |
| [present-results.md](./references/present-results.md) | Summary sections, presentation template |
| [output-files.md](./references/output-files.md) | Output file table, legacy single-file mode |
| [validate-investigate.md](./references/validate-investigate.md) | MCP availability, tool chain, investigation loop, lspHints |
| [playbooks.md](./references/playbooks.md) | Per-category validate & fix (architecture, quality, dead code, semantic) |
| [finding-categories.md](./references/finding-categories.md) | All 51 categories with severity and detection details |
| [ast-search.md](./references/ast-search.md) | AST Search modes, presets, pattern composition |
| [concepts.md](./references/concepts.md) | Metric definitions and thresholds |

---
name: octocode-local-code-quality
description: "Scan TS/JS codebases for architecture rot, code quality, security risks, dead code, test quality, and performance patterns. Use for: audit code, check architecture, find cycles, trace flows, dead exports, complexity, security review, input validation, test coverage gaps, performance issues, duplicate code. Produces severity-ranked findings with file:line locations — validate with Octocode MCP tools before fixing."
compatibility: "Requires Node.js >= 18. Works with any AI coding agent. Best with Octocode MCP (ENABLE_LOCAL=true) for LSP validation; without it, use CLI tools (ast-search + scan flags) for structural validation. Pre-built scripts — no npm install needed."
---

# Octocode Local Code Quality

Single-scan analysis for TS/JS monorepos. Finding categories span architecture risk, code quality, performance, security, dead-code hygiene, and test quality. Optional `--semantic` adds TypeChecker-based categories. Severity-ranked findings with `file:line` locations, searchable `tags`, health scores per pillar, `lspHints` for agent validation, and actionable fix strategies.

## Core Workflow

```
SCAN → READ summary.md → VALIDATE (CLI + Octocode LSP) → FIX → RE-SCAN
```

Validation supports three modes: **CLI only** (ast-search + scan flags), **Octocode MCP only** (LSP tools), or **Hybrid** (both — recommended). See playbooks for per-category details.

Agent reasoning loop:

```
CHOOSE LENS → CORRELATE SIGNALS → STATE CONFIDENCE → VALIDATE → PRESENT
```

---

## Working Mindset

Use the scan as two complementary lenses:

- **Graph lens** — dependency structure, cycles, critical paths, fan-in / fan-out, reachability, layering, hotspots
- **AST lens** — code shape, control flow, top-level effects, repeated structures, boundary patterns, suspicious constructs

When deciding what to investigate first:

- Prefer the **graph lens** when the problem sounds like architecture erosion, coupling, layering, startup risk, or change blast radius
- Prefer the **AST lens** when the problem sounds like a code smell, repeated orchestration, control-flow complexity, or a missing structural guard
- Use **both together** when multiple architecture findings cluster in the same file or package

Decision heuristics:

- `dependency-cycle` + `critical-path` + high `fanIn` usually means a structural chokepoint
- `low-cohesion` + `feature-envy` usually means the module boundary is wrong
- `import-side-effect-risk` + high `fanIn` usually means startup or hidden initialization risk
- `layer-violation` + `feature-envy` usually means a boundary leak, not just a bad import
- Large `hotFiles` scores mean "expensive to change", even if the file has few direct findings

These are investigation heuristics, not proof. Validate with Octocode local tools before stating them as facts.

When the current outputs are not enough to explain an architecture problem, escalate deliberately:

- **Deeper graph techniques** — SCC condensation graphs, folder/package dependency graphs, articulation points, broker/betweenness centrality, change-coupling from git history
- **Deeper AST/semantic techniques** — relational AST rules, symbol-level usage graphs, CFG/dataflow checks, import-time effect tracing, boundary-leak analysis

Use those techniques to sharpen the question you ask next, not to jump straight to a refactor.

---

## Guardrails

- **Pre-built scripts** — run `scripts/index.js` directly. NEVER `npm install`, `yarn`, `npm run build`, or any setup.
- **Never execute `src/` files** — only `scripts/` contains runnable JS.
- **`localSearchCode` before LSP** — `lineHint` is mandatory for LSP tools, unless an `lspHint` from the finding already provides it.
- **Validate every code statement with Octocode local tools when available** — any claim about live code should be backed by `localSearchCode` plus the relevant LSP tool before you present it as fact.
- **Absolute paths** for all MCP/LSP tools.
- Never present findings without `file:line` references.
- Let the user choose which findings to address before broad refactors.

---

## 1. Run the Scan

```bash
node <SKILL_DIR>/scripts/index.js [flags]
```

If no arguments are provided, run a default scan. If arguments are provided (e.g. `--scope=src --features=security`), pass them as CLI flags.

Output: `.octocode/scan/<timestamp>/`. Cached — re-runs skip unchanged files (~4x faster).

Common flags: `--scope=<path>`, `--features=<pillar|category>`, `--exclude=<pillar|category>`, `--semantic`, `--graph`, `--graph-advanced`, `--flow`, `--json`, `--no-cache`, `--include-tests`.

Pillars: `architecture`, `code-quality`, `dead-code`, `security`, `test-quality`. Use `--help` for the full flag list.

> **Need flag details, presets, or drill-down workflow?** → [references/cli-reference.md](./references/cli-reference.md)

---

## 2. Present Results

Read `summary.md` first — it has everything for a top-level presentation. Only drill into feature JSONs for investigation.

Present: Scope → Health scores → Findings by severity → Top tags → Graph signal → AST signal → Combined interpretation → Confidence → Recommended validation.

When summarizing architecture, always mention the strongest **graph signal**, the strongest **AST signal**, the **combined interpretation**, your **confidence**, and the **next validation step**.

> **Need the presentation template or summary section details?** → [references/present-results.md](./references/present-results.md)

---

## 3. Output Files

Each scan writes to `.octocode/scan/<timestamp>/`: `summary.md`, `summary.json`, `architecture.json`, `code-quality.json`, `dead-code.json`, `security.json` (if security findings), `test-quality.json` (if test findings), `file-inventory.json`, `findings.json`, `ast-trees.txt`, and optionally `graph.md`.

> **Need the full file table or legacy mode details?** → [references/output-files.md](./references/output-files.md)

---

## 4. Validate & Investigate

**Do not fix based on scan output alone.** Validate each finding before changing code.

**Statement validation rule:** if Octocode MCP local tools are available, validate every statement about live code with them before presenting it. Use `localSearchCode` to anchor the claim, then `lspGotoDefinition`, `lspFindReferences`, or `lspCallHierarchy` to confirm behavior or usage.

**Hybrid tool chain** (CLI + Octocode MCP):

```
CLI:  node scripts/ast-search.js -p 'pattern'    → structural search for all instances
MCP:  localSearchCode(pattern) → lineHint         → locate in codebase
MCP:  lspGotoDefinition / lspFindReferences / lspCallHierarchy → semantic confirmation
CLI:  node scripts/index.js --scope=file.ts       → re-scan after fix
```

**CLI-only validation** (no Octocode MCP): Use `ast-search.js` patterns + scan flags (`--scope`, `--features`, `--json`) to validate findings structurally.

**Investigation loop:** Read finding → check `impact` (explains why it matters) → check `lspHints[]` (pre-computed validation) → search → validate → cross-check `fileInventory` → follow `suggestedFix.steps` → re-scan.

**Security findings require Octocode validation.** Unlike structural findings (empty-catch, switch-no-default), security findings are context-sensitive — a `prototype-pollution-risk` on `cache[key] = value` is a false positive if `key` comes from internal iteration. Always trace the data flow with `lspCallHierarchy` before acting on security findings. See the taint tracing workflow in [validate-investigate.md](./references/validate-investigate.md#security-finding-validation--taint-tracing).

> **Need MCP availability checks, tool chain rules, or lspHints details?** → [references/validate-investigate.md](./references/validate-investigate.md)
>
> **Need per-category validate & fix instructions (CLI, MCP, or hybrid)?** → [references/playbooks.md](./references/playbooks.md)
>
> **Need the roadmap for security, semantic scale, reporting, and test-suite upgrades?** → [references/improvement-roadmap.md](./references/improvement-roadmap.md)

---

## 5. Finding Categories

Categories are grouped into pillars. Each pillar has its own health score. Some categories require `--semantic`.

- **Architecture Risk** (25 categories) — dependency cycles, critical paths, cycle clusters, broker modules, bridge modules, package boundary chatter, startup-risk hubs, SDP violations, coupling, god modules, reachability, layer violations, cohesion, import side-effect risk, feature envy, distance from main sequence, and semantic categories (over-abstraction, DIP violations, type cycles, shotgun surgery, leaky abstractions)
- **Code Quality** (28 categories) — complexity metrics (cognitive, Halstead, MI, cyclomatic density), function/module size, duplicates (exact + near-clone), type safety (any, assertions), error handling (missing error boundary with severity tiers, empty catch, promise misuse), performance patterns (await-in-loop, sync I/O, uncleared timers, listener leaks, unbounded collections), and semantic categories (unused params, type hierarchy, narrowable types)
- **Dead Code & Hygiene** (11 categories) — dead exports, dead re-exports, unused npm deps, package boundary violations, barrel explosion, and semantic categories (unused imports, orphan implementations, move-to-caller, semantic-dead-export)
- **Security** (10 categories) — hardcoded secrets, eval/Function usage, unsafe HTML (innerHTML/XSS), SQL injection risk, catastrophic regex, prototype pollution (Object.assign, deep merge, computed property writes), unvalidated input reaching sinks, input passthrough with confidence tiers, path traversal risk (fs operations with untrusted paths), command injection risk (exec/spawn with user input)
  - **Agentic Security**: when scanning agentic/MCP tool code, the scanner detects prompt → path and prompt → command flows. Path traversal and command injection are the #1 threat in agentic systems (OWASP Agentic Top 10)
- **Test Quality** (8 categories) — assertion density, tests without assertions, excessive mocking, shared mutable state, missing test cleanup, focused tests, fake timers without restore, and missing mock restoration (requires `--include-tests`)

> **Need the full category tables?** → [references/finding-categories.md](./references/finding-categories.md)

---

## 6. AST Search — Structural Code Search

Finds code by **shape** (AST structure), not text. Use after scan to locate specific patterns, or independently for any structural query.

```bash
node <SKILL_DIR>/scripts/ast-search.js [options]
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
| `--list-presets` | — | Show all available presets |

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

### Presets

Run `--list-presets` to see all available presets with descriptions.

Common: `empty-catch` · `console-log` · `any-type` · `type-assertion` · `non-null-assertion` · `nested-ternary` · `todo-fixme` · `debugger` · `switch-no-default`

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
| [playbooks.md](./references/playbooks.md) | Per-category validate & fix (architecture, quality, dead code, security, test quality, semantic) |
| [architecture-techniques.md](./references/architecture-techniques.md) | Graph + AST techniques for ambiguous architecture findings |
| [finding-categories.md](./references/finding-categories.md) | All categories with severity and detection details |
| [ast-search.md](./references/ast-search.md) | AST Search modes, presets, pattern composition |
| [concepts.md](./references/concepts.md) | Metric definitions and thresholds |
| [improvement-roadmap.md](./references/improvement-roadmap.md) | Research-backed upgrade plan for security, test quality, semantic analysis, reporting, and tests |

---
name: octocode-local-code-quality
description: "Scan TS/JS codebases for architecture rot, code quality, security risks, dead code, test quality, and performance patterns. Use for: audit code, check architecture, find cycles, trace flows, dead exports, complexity, security review, input validation, test coverage gaps, performance issues, duplicate code, redundant comments, redundant re-exports. Produces validated findings with file:line evidence and a prioritized improvement plan. Fixes use TDD when possible and are validated with the project's lint, test, and build toolchain."
compatibility: "Requires Node.js >= 18. Works with any AI coding agent. Best with Octocode MCP local + LSP tools for hybrid validation. Pre-built scripts only; no install or build step required."
---

# Octocode Local Code Quality

The scanner is a hypothesis generator, not a source of truth. Every finding must be validated before it becomes a recommendation.

---

## Workflow

```
Scan (CLI) → Read summary.md → Triage findings.json
  → Validate each finding with Octocode local tools
  → Present validated findings to user
  → ASK: "Want me to plan fixes for these?"
  → If yes → Output prioritized improvement plan
  → ASK: "Should I apply these fixes?"
  → If yes → Apply fixes (TDD when possible)
  → Validate with lint (--fix), tests, build
  → Re-scan to verify finding count drops
```

---

## Tools

**Layer 1 — CLI scan scripts** (hypothesis generation):

| Script | Purpose |
|--------|---------|
| `scripts/index.js` | Full scan — findings, health scores, dependency graph |
| `scripts/ast/search.js` | Structural search on source files (`@ast-grep/napi`) |
| `scripts/ast/tree-search.js` | Query AST snapshots from scan output |

**Layer 2 — Octocode local MCP tools** (validation):

| Tool | What it does |
|------|-------------|
| `localSearchCode` | Find patterns in code, get file + line hints |
| `localViewStructure` | Explore directory trees, understand project layout |
| `localFindFiles` | Find files by name, size, modification time |
| `localGetFileContent` | Read file content with targeted line ranges or match strings |
| `lspGotoDefinition` | Jump to where a symbol is defined (requires `lineHint` from search) |
| `lspFindReferences` | Find all usages of a symbol — types, vars, exports |
| `lspCallHierarchy` | Trace incoming/outgoing call chains (functions only) |

**MCP detection**: try `localSearchCode`. If it fails → MCP unavailable, use CLI-only mode.

> For which tool to use for which task, see [validate & investigate](./references/validate-investigate.md).

---

## Confidence Tiers

Every finding has a detection method. Use this to decide how much validation is required before presenting it as a fact:

| Tier | Label | Detection method | Examples | Validation required |
|------|-------|-----------------|---------|---------------------|
| 1 | **Deterministic** | Pure AST — structural, no heuristic | `empty-catch`, `eval-usage`, `debugger`, `unsafe-html`, `debug-log-leakage`, `sensitive-data-logging` | `localGetFileContent` to confirm location and that it is not test-gated |
| 2 | **Statistical** | Threshold crossing on a metric | `excessive-parameters`, `cognitive-complexity`, `god-function`, `message-chain`, `halstead-effort` | Read code with `localGetFileContent`; use `lspGotoDefinition` to confirm symbol |
| 3 | **Graph-inferred** | Depends on dependency graph edges | `dependency-cycle`, `dead-export`, `high-coupling`, `architecture-sdp-violation` | `lspFindReferences` or `lspCallHierarchy` to confirm the edges |
| 4 | **Pattern/flow** | Heuristic pattern + data-flow trace | `hardcoded-secret`, `sql-injection-risk`, `unvalidated-input-sink`, `command-injection-risk` | `lspCallHierarchy(incoming)` + `localGetFileContent` to confirm source-to-sink path |

Label each reported finding with its tier: `(deterministic)`, `(statistical)`, `(graph)`, `(pattern/flow)`. Tier 1–2 can be reported as **validated** after a single read. Tier 3–4 require at least one MCP tool call confirming the path or context.

---

## Principles

- Findings are leads, not facts — validate with Octocode local tools before presenting.
- Read `summary.md` first: scope, health scores, analysis signals, hotspots, recommended validation.
- Let the problem drive tool choice — pick the tools that fit the finding, not a fixed sequence.
- CLI-only is the fallback when Octocode MCP is unavailable, not the default.
- Use `--help` and reference docs for flags, categories, and presets — do not restate them.
- Detect the project environment before running commands — see Project Environment.
- **TDD when possible**: write a failing test first, then fix. Skip for mechanical cleanups (comment removal, dead re-export deletion). See [TDD Fix Playbook](./references/playbooks.md).
- **Validate fixes with the project toolchain**: after each fix batch, run lint (with `--fix` if supported) → tests → build. Do not present fixes as done until all three pass.
- **Hygiene is part of every fix**: when touching a file, also remove redundant comments (comments that restate what the code says) and redundant re-exports (barrel re-exports with 0 consumers).
- **Use the task tool**: create a todo list at the start of every review — one item per workflow step. Update status as you go. Always stop and ask the user before planning fixes (after Step 5) and before applying them (after Step 6).
- **Active MCP sanity checks**: after finding a cluster of issues in an area, re-scan with `--scope` to confirm density, then use one MCP tool to verify each high-severity finding. Only present findings that survive this check.
- Run only the pre-built scripts in `scripts/`. Never execute files from `src/`.
- Use absolute paths with MCP/LSP tools.
- Do not present live-code claims without validation when local/LSP tools are available.
- Do not recommend broad refactors from one noisy finding.
- If the scan and validation disagree, say so explicitly and lower confidence.
- **Shell commands for mechanical operations**: prefer `mv`, `sed`, `find + xargs`, `rg` over manual edits when renaming, moving files, or rewriting imports in bulk. Detect OS (`uname`) if commands differ across platforms.

---

## Project Environment

Never hardcode tool names. Detect the project setup before running lint, build, or test commands:

1. **Package manager**: `yarn.lock` → yarn, `pnpm-lock.yaml` → pnpm, `package-lock.json` → npm.
2. **Scripts**: read `package.json` `scripts` (both root and package-level in monorepos). Use actual script names — do not invent commands.
3. **Workspace context**: in monorepos, check `workspaces` config to decide between root-level (`yarn workspace <name> test`) or package-level (`cd packages/foo && yarn test`).

### Validation Commands

| Command | How to detect | Fallback |
|---------|--------------|----------|
| **Lint** | `scripts.lint` in `package.json`. If it wraps eslint/biome/oxlint, use `<pm> run lint --fix`. | Skip, warn user |
| **Test** | `scripts.test` in `package.json`. In monorepos, prefer package-level scope. | Skip, warn user |
| **Build** | `scripts.build` in `package.json`. | Skip, warn user |

Run all three after every fix batch. If lint `--fix` auto-corrects files, stage those corrections as part of the fix.

---

## Quick Start

**Placeholders:**
- `<SKILL_DIR>` — absolute path to this skill's directory (where `SKILL.md` lives).
- `<CURRENT_SCAN>` — timestamped scan output directory (e.g., `.octocode/scan/2026-03-19T00-01-19-468Z`).
- `<TARGET_ROOT>` — root of the codebase being analyzed (defaults to cwd).

```bash
# 1. Scan
node <SKILL_DIR>/scripts/index.js --graph --flow
# 2. Summary
cat .octocode/scan/<latest>/summary.md
# 3. Top findings
cat .octocode/scan/<latest>/findings.json | jq '.optimizationFindings[:5]'
# 4. Structural search on source files
node <SKILL_DIR>/scripts/ast/search.js -p 'console.log($$$ARGS)' --root ./src --json
# 5. AST snapshot search on scan output
node <SKILL_DIR>/scripts/ast/tree-search.js -i .octocode/scan -k function_declaration --limit 25
```

Use `--help` on any script for the full flag reference.

---

## Workflow Steps

### Step 1. Get Scan Context

Inspect the latest `.octocode/scan/<timestamp>/` first. Re-run only when outputs are missing, stale, or too narrow.

```bash
node <SKILL_DIR>/scripts/index.js [flags]          # default entry point
node <SKILL_DIR>/scripts/index.js --graph --flow    # recommended starting point
node <SKILL_DIR>/scripts/index.js --help            # full flag reference
```

Choose features deliberately — start broad only when the problem shape is unknown:

| Flag | When to use |
|------|-------------|
| `--features=architecture` | Cycles, coupling, reachability, dependency pressure |
| `--features=code-quality` | Complexity, maintainability, duplication, performance smells |
| `--features=dead-code` | Dead exports, unused deps, boundary violations |
| `--features=security` | Sink-risk, validation-sensitive findings |
| `--features=test-quality` | Flaky or misleading test patterns |
| `--graph` | Dependency structure, hotspots, critical paths |
| `--flow` | Path-sensitive claims, control-flow evidence |
| `--semantic` | Type-aware design signals (adds ~3–5 s) |
| `--scope=<path>` | Narrow to a specific path, file, or `file:symbol` |

For full flag and threshold reference, see [CLI reference](./references/cli-reference.md).

### Step 2. Read Output Files

Read `summary.md` first. Pull in other files only as needed.

| File | Use for |
|------|---------|
| `summary.md` | Health scores, severity ordering, analysis signals, top recommendations |
| `summary.json` | Machine-readable metadata, `agentOutput`, `investigationPrompts` |
| `findings.json` | Full prioritized finding queue with `lspHints`, `impact`, `suggestedFix` |
| `architecture.json` | Dependency graph, cycles, critical paths, hotspots, chokepoints |
| `code-quality.json` | Complexity, duplicates, god modules/functions |
| `dead-code.json` | Dead exports, boundary violations, unused deps |
| `security.json` / `test-quality.json` | Pillar-specific findings |
| `file-inventory.json` | Per-file functions, flows, dependencies, effects |
| `ast-trees.txt` | AST snapshot for structural triage |
| `graph.md` | Mermaid dependency graph (with `--graph`) |

For JSON schemas and field reference, see [output files](./references/output-files.md).

**AST tools — which one to use:**

| Tool | Searches | Input | Best for |
|------|----------|-------|---------|
| `ast/tree-search.js` | Generated `ast-trees.txt` | `-i .octocode/scan` | Fast structure triage — decide where to look |
| `ast/search.js` | Actual source files on disk | `--root <dir>` | Structural proof — confirm a pattern exists |

Do not point `ast/search.js` at scan output files — it searches source files only.

### Step 3. Triage Before Validating

Prioritize:
- findings with high severity or repeated occurrence
- clusters in the same file, package, or call path
- security findings and behavior-sensitive findings
- architecture signals that align with hotspots or high fan-in / fan-out

Label each finding: `observed` (scan shows it), `suspected` (inferred from signals), or `validated` (confirmed by tools). Assign the **confidence tier** (1–4) from the Confidence Tiers table above — this determines how much MCP validation is needed. Use `lspHints` from `findings.json` directly when present.

### Step 4. Validate Findings

**Every finding must be validated before presenting it as a fact.**

Per-finding validation guidance by tier:

| Category / type | Tier | Minimum validation |
|----------------|------|-------------------|
| `empty-catch`, `switch-no-default`, `eval-usage`, `unsafe-html`, `debugger` | 1 | `localGetFileContent` → confirm location |
| `debug-log-leakage`, `sensitive-data-logging` | 1 | `localGetFileContent` → confirm call; rule out test-only path |
| `message-chain` | 2 | `localGetFileContent` → read chain; `lspGotoDefinition` → root type |
| `excessive-parameters`, `cognitive-complexity`, `god-function`, `halstead-effort` | 2 | `localGetFileContent` → read function body |
| `dependency-cycle`, `dead-export`, `high-coupling`, `architecture-sdp-violation` | 3 | `lspFindReferences` or `lspCallHierarchy` to confirm edges |
| `hardcoded-secret`, `sql-injection-risk` | 4 | `localGetFileContent` → read context; rule out test fixture or placeholder |
| `unvalidated-input-sink`, `command-injection-risk`, `path-traversal-risk` | 4 | `lspCallHierarchy(incoming)` + `localGetFileContent` → confirm source reaches sink without sanitizer |

**Active MCP sanity check loop:**
```
1. Identify a cluster (e.g., 5 security findings in src/api/)
2. Re-scan: node <SKILL_DIR>/scripts/index.js --scope=src/api/ --features=security
3. For each high-severity finding, call one MCP tool to confirm
4. If scan and MCP disagree → lower confidence, note discrepancy
5. Only present findings that survived step 3
```

For detailed per-category validation, see [playbooks](./references/playbooks.md).
For investigation methodology, taint tracing, and tool selection, see [validate & investigate](./references/validate-investigate.md).

### Step 5. Present Findings and Ask User

Report structure: what the scan suggested → what validation confirmed or disproved → what remains uncertain.

Rules: only validated claims are facts; unvalidated items are hypotheses; always include `file:line` evidence; state confidence tier; explain why it matters (not just what matched).

See [present results](./references/present-results.md) for the full template and decision heuristics.

**After presenting findings, ask:** "Want me to plan fixes for these findings?" Do not jump to a plan automatically.

### Step 6. Output an Improvement Plan (on user request)

Only after the user confirms. Structure:

1. Immediate fixes — validated high-signal problems
2. Follow-up checks — important but not yet fully proven
3. Structural improvements — recurring patterns or architectural pressure
4. Re-scan steps — confirm finding count drops

Each item: target files, reason, expected benefit, evidence level, execution tactic.

For mechanical/repeated fixes, prefer `rg + sed`, `find + xargs`, `mv`, `jq` over manual editing.

**After presenting the plan, ask:** "Should I apply these fixes?" Do not make code changes without confirmation.

### Step 7. Apply Fixes

1. **TDD-first for behavioral fixes**: write failing test → run → apply fix → confirm pass → run full suite.
2. **Remove redundant comments**: strip comments that restate what the code says. Keep *why* comments.
3. **Remove redundant re-exports**: check each barrel re-export with `lspFindReferences` — 0 consumers = remove.
4. **Validate with project toolchain**: lint (with `--fix`) → tests → build.

See [playbooks](./references/playbooks.md) for detailed fix steps by category.

### Step 8. Re-scan and Verify

1. Re-scan with `--scope` targeting changed files/directories.
2. Compare finding counts — they should drop.
3. If new findings appear, triage them (fix may have exposed a deeper issue).
4. Report the before/after delta to the user.

---

## References

| Reference | Contains |
|-----------|---------|
| [CLI reference](./references/cli-reference.md) | All flags, thresholds, presets, drill-down workflow |
| [Output files](./references/output-files.md) | JSON schemas, key reference, reading guide |
| [Finding categories](./references/finding-categories.md) | All detectable categories by pillar with severity and description |
| [Validate & investigate](./references/validate-investigate.md) | Investigation loop, tool selection guide, taint tracing, false positive dismissal, CLI-only fallback |
| [Playbooks](./references/playbooks.md) | Per-category validate & fix tables, TDD playbook, fix validation, mega-folder restructuring |
| [Present results](./references/present-results.md) | Summary sections, decision heuristics, presentation template |
| [Architecture techniques](./references/architecture-techniques.md) | SCC condensation, broker/articulation analysis, symbol-level usage graphs |
| [Concepts](./references/concepts.md) | Metric definitions — SDP, cognitive complexity, Halstead, MI, cyclomatic density |
| [AST tree search](./references/ast-tree-search.md) | `ast/tree-search.js` — scan artifact navigation, usage, examples |
| [AST search](./references/ast-search.md) | `ast/search.js` — source-level structural search, patterns, rules, presets |
| [Improvement roadmap](./references/improvement-roadmap.md) | Known gaps and planned upgrades |

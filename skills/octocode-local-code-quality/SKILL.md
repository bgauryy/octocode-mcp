---
name: octocode-local-code-quality
description: "Scan TS/JS codebases for architecture rot, code quality, security risks, dead code, test quality, and performance patterns. Use for: audit code, check architecture, find cycles, trace flows, dead exports, complexity, security review, input validation, test coverage gaps, performance issues, duplicate code, redundant comments, redundant re-exports. Produces validated findings with file:line evidence and a prioritized improvement plan. Fixes use TDD when possible and are validated with the project's lint, test, and build toolchain."
compatibility: "Requires Node.js >= 18. Works with any AI coding agent. Best with Octocode MCP local + LSP tools for hybrid validation. Pre-built scripts only; no install or build step required."
---

# Octocode Local Code Quality

Use this skill to turn scan output into reliable engineering guidance.

The scanner is a hypothesis generator, not a source of truth. Every finding must be validated before it becomes a recommendation.

## Flow at a Glance

```
Scan (CLI) → Read summary.md → Triage findings.json
  → Validate each finding with Octocode local tools (choose what fits)
  → Present validated findings to user
  → ASK user: "Want me to plan fixes for these?"
  → If yes → Output prioritized improvement plan
  → ASK user: "Should I apply these fixes?"
  → If yes → Apply fixes (TDD when possible, clean up redundant comments & re-exports)
  → Validate with project lint (--fix), tests, and build
  → Re-scan to verify finding count drops
```

## Tools

Two layers work together — use any combination that fits the problem.

**Layer 1: CLI scan scripts** — broad hypothesis generation

| Script | Purpose |
|--------|---------|
| `scripts/index.js` | Full scan — findings, health scores, dependency graph |
| `scripts/ast/search.js` | Structural search on source files (`@ast-grep/napi`) |
| `scripts/ast/tree-search.js` | Query AST snapshots from scan output |

**Layer 2: Octocode local tools** — validate findings against live code

| Tool | What it does |
|------|-------------|
| `localSearchCode` | Find patterns in code, get file + line hints |
| `localViewStructure` | Explore directory trees, understand project layout |
| `localFindFiles` | Find files by name, size, modification time |
| `localGetFileContent` | Read file content with targeted line ranges or match strings |
| `lspGotoDefinition` | Jump to where a symbol is defined |
| `lspFindReferences` | Find all usages of a symbol (types, vars, exports) |
| `lspCallHierarchy` | Trace incoming/outgoing call chains (functions only) |

The agent decides which tools to use. No required order — pick what makes sense for the finding. If Octocode MCP is unavailable, fall back to CLI-only and mark confidence explicitly.

**MCP detection**: try any local tool (e.g. `localSearchCode`). If it fails → MCP not available, use CLI-only.

## Principles

- Findings are leads, not facts — validate with Octocode local tools before presenting.
- Read `summary.md` first: scope, health scores, analysis signals, hotspots, recommended validation.
- Let the problem drive tool choice — pick the tools that fit the finding, not a fixed sequence.
- CLI-only is the fallback when Octocode MCP is unavailable, not the default.
- Use `--help` and reference docs for flags, categories, and presets — do not restate them.
- Detect the project environment before running commands — see Project Environment.
- **TDD when possible**: for behavioral or logic fixes, write a failing test first, then make it pass. Skip for mechanical cleanups (comment removal, dead re-export deletion). See [TDD Fix Playbook](./references/playbooks.md).
- **Validate fixes with the project toolchain**: after each fix batch, run the project's lint (with `--fix` if supported), tests, and build. Do not present fixes as done until the toolchain passes.
- **Hygiene is part of every fix**: when touching a file, also remove redundant comments (comments that just restate the code) and redundant re-exports (barrel re-exports with 0 consumers). See [playbooks](./references/playbooks.md).
- **Use the task tool** to create a todo list at the start of every review — one item per workflow step. Update status as you go. Always stop and ask the user before planning fixes (after Step 5) and before applying them (after Step 6).
- Run only the pre-built scripts in `scripts/`. Never execute files from `src/`.
- Use absolute paths with MCP/LSP tools.
- Do not present live-code claims without validation when local/LSP tools are available.
- Do not recommend broad refactors from one noisy finding.
- If the scan and validation disagree, say so explicitly and lower confidence.
- **Use shell commands for mechanical file operations**: for renaming, moving files, and bulk import-path rewrites, prefer `mv`, `sed`, `find + xargs`, `rg` over manual edits. Batch changes into scripts when touching many files. Detect the OS (`uname`) if commands differ across platforms (e.g. `sed -i` on Linux vs `sed -i ''` on macOS).

## Project Environment

Never hardcode tool names. Detect the project setup before running lint, build, or test commands:

1. **Package manager**: `yarn.lock` → yarn, `pnpm-lock.yaml` → pnpm, `package-lock.json` → npm.
2. **Scripts**: read `package.json` `scripts` (both root and package-level in monorepos). Use actual script names — do not invent commands.
3. **Workspace context**: in monorepos, check `workspaces` config to decide between root-level (`yarn workspace <name> test`) or package-level (`cd packages/foo && yarn test`).

### Validation Commands

After detecting the project environment, identify these three commands for post-fix validation:

| Command | How to detect | Fallback |
|---------|--------------|----------|
| **Lint** | `scripts.lint` in `package.json`. If the script wraps eslint/biome/oxlint, use `<pm> run lint --fix`. | Skip lint step, warn user |
| **Test** | `scripts.test` in `package.json`. In monorepos, prefer package-level test scope. | Skip test step, warn user |
| **Build** | `scripts.build` in `package.json`. | Skip build step, warn user |

Run all three after every fix batch. If lint `--fix` auto-corrects files, stage those corrections as part of the fix. If tests fail, investigate before continuing — the fix may have introduced a regression.

## Quick Start

**Placeholders** used throughout this skill:

- `<SKILL_DIR>` — absolute path to this skill's directory (where `SKILL.md` lives). All script paths are relative to it.
- `<CURRENT_SCAN>` — timestamped scan output directory (e.g., `.octocode/scan/2026-03-19T00-01-19-468Z`). Find it at the top of `summary.md` or use the latest directory in `.octocode/scan/`.
- `<TARGET_ROOT>` — root of the codebase being analyzed. Defaults to cwd, override with `--root`.

Minimum path for a fresh scan — adapt based on the question:

```bash
# 1. Scan (from target repo root)
node <SKILL_DIR>/scripts/index.js --graph --flow
# 2. Summary
cat .octocode/scan/<latest>/summary.md
# 3. Top findings
cat .octocode/scan/<latest>/findings.json | jq '.optimizationFindings[:5]'
# 4. Structural search (source files)
node <SKILL_DIR>/scripts/ast/search.js -p 'console.log($$$ARGS)' --root ./src --json
# 5. AST snapshot search (scan output)
node <SKILL_DIR>/scripts/ast/tree-search.js -i .octocode/scan -k function_declaration --limit 25
```

Use `--help` on any script for the full flag reference.

## Workflow

### Step 1. Get Scan Context

If the user already ran the CLI, inspect the latest `.octocode/scan/<timestamp>/` output directory first. Re-run only when outputs are missing, stale, or too narrow.

```bash
node <SKILL_DIR>/scripts/index.js [flags]          # default entry point
node <SKILL_DIR>/scripts/index.js --graph --flow    # good starting point
node <SKILL_DIR>/scripts/index.js --help            # full flag reference
```

Choose scan features deliberately — start broad only when you do not know the problem shape:

| Flag | When to use |
|------|-------------|
| `--features=architecture` | Cycles, coupling, reachability, dependency pressure |
| `--features=code-quality` | Complexity, maintainability, duplication, performance smells |
| `--features=dead-code` | Dead exports, unused deps, boundary violations |
| `--features=security` | Sink-risk, validation-sensitive findings |
| `--features=test-quality` | Flaky or misleading test patterns |
| `--graph` | Dependency structure, hotspots, critical paths |
| `--flow` | Path-sensitive claims, control-flow evidence |
| `--semantic` | Type-aware design signals (adds ~3-5s) |
| `--scope=<path>` | Narrow to specific path, file, or `file:symbol` |

Once the summary shows the dominant area, narrow the scan around it.

### Step 2. Read Output Files

Read `summary.md` first. Then pull in only the files that help answer the current question.

`summary.md` follows a fixed structure — health scores → analysis signals → top recommendations. Use health scores to gauge severity, analysis signals to choose the investigation lens, and hotspots + top recommendations to decide where validation is worth the time. See [present results](./references/present-results.md) for the full section breakdown.

Default solving set: `summary.md` (priorities) + `findings.json` (work queue) + relevant pillar JSON (evidence). Do not jump from a single finding to a fix — check pattern density and related files first.

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

For JSON key schemas and field reference, see [output files](./references/output-files.md).

**AST tools — which one to use:**

| Tool | Searches | Input | Purpose |
|------|----------|-------|---------|
| `ast/tree-search.js` | Generated `ast-trees.txt` from a scan | `-i .octocode/scan` (auto-resolves latest) | Fast structure triage — decide where to look |
| `ast/search.js` | Actual source files on disk | `--root <dir>` | Structural proof — find code by AST shape |

Do not point `ast/search.js` at `.octocode/scan/...` output files — it searches source files, not generated AST text artifacts.

### Step 3. Triage Before Validating

Decide what deserves deeper work first:

- findings with high severity or repeated occurrence
- clusters in the same file, package, or call path
- security findings and behavior-sensitive findings
- architecture signals that line up with hotspots or high fan-in / fan-out

Each finding in `findings.json` includes `lspHints` (pre-computed validation with exact tool, symbol, and line), `impact` (real-world consequence for prioritization), and `suggestedFix`. Use `lspHints` directly when present.

Label each finding: `observed` (scan shows it), `suspected` (inferred from signals), or `validated` (confirmed by tools). Build the work queue from `findings.json`, not `summary.md` alone.

### Step 4. Validate Findings

**Every finding must be validated before presenting it as fact.**

Choose the tools that fit the finding — there is no required sequence:

| Finding type | Useful tools | Why |
|-------------|-------------|-----|
| Dead export | `lspFindReferences` → 0 refs confirms dead | Direct proof |
| Dependency cycle | `localViewStructure` → layout, `lspCallHierarchy` → trace chain | Structure + flow |
| Security sink | `localGetFileContent` → context, `lspCallHierarchy(incoming)` → callers | Context + data-flow |
| Coupling hotspot | `localSearchCode` → usages, `lspFindReferences` → consumers | Blast radius |
| God module | `localViewStructure` → file count, `localSearchCode` → cross-imports | Scope the problem |
| Complex function | `localGetFileContent` → code, `lspCallHierarchy(outgoing)` → callees | Understand complexity |

For detailed per-category validation and fix guidance, see [playbooks](./references/playbooks.md). For investigation methodology, see [validate & investigate](./references/validate-investigate.md).

**CLI-only fallback** (only if Octocode MCP is unavailable): use `ast/search.js` for structural verification, read source at `lineStart:lineEnd`, re-scan with `--scope`. Mark confidence: `high` = structural (empty-catch, switch-no-default), `medium` = semantic (dead-export, coupling), `low` = behavioral (security, data-flow).

### Step 5. Present Findings and Ask User

Report structure: what the scan suggested → what validation confirmed or disproved → what remains uncertain.

Rules: only validated claims are facts, unvalidated items are hypotheses, always include `file:line` evidence, explain why it matters (not just what matched), state confidence level. See [present results](./references/present-results.md) for template and examples.

**After presenting findings, ask the user:** "Want me to plan fixes for these findings?" Do not jump into an improvement plan automatically.

### Step 6. Output an Improvement Plan (on user request)

Only produce the plan after the user confirms. The plan should be prioritized and practical:

1. Immediate fixes for validated high-signal problems
2. Short follow-up checks for important but not yet fully proven issues
3. Structural improvements for recurring patterns or architectural pressure
4. Re-scan scope and validation steps to confirm the outcome

Each item should name the target files, reason, expected benefit, evidence level, and execution tactic.

For mechanical or repeated fixes, prefer `rg` + `sed`, `find` + `xargs`, `mv`, `jq` over manual editing. Use manual edits for nuanced logic changes. For mega-folder restructuring, see the [playbooks](./references/playbooks.md).

**After presenting the plan, ask the user:** "Should I apply these fixes?" Do not make code changes without confirmation.

### Step 7. Apply Fixes

Once the user approves, apply fixes using these methods (detailed steps in [playbooks](./references/playbooks.md)):

1. **TDD-first for behavioral fixes**: write a failing test → run it → apply the fix → confirm pass → run full suite. Skip TDD for mechanical cleanups (comment removal, dead re-export deletion, import rewriting, formatting).

2. **Remove redundant comments**: when touching a file, strip comments that just restate what the code says. Keep comments explaining *why*, trade-offs, constraints, or non-obvious intent. Rule: if deleting the comment loses zero information, delete it.

3. **Remove redundant re-exports**: when touching a barrel/index file, check each re-export for consumers via `lspFindReferences` — 0 consumers = dead, remove it.

4. **Validate with project toolchain**: after each fix batch, run lint (with `--fix` if available) → tests → build. See Validation Commands in Project Environment. Do not present a fix as complete until the toolchain passes (or pre-existing failures are documented).

### Step 8. Re-scan and Verify

After all fixes are applied and validated:

1. Re-scan with `--scope` targeting the changed files/directories.
2. Compare finding counts — they should drop.
3. If new findings appeared, triage them (the fix may have exposed a deeper issue).
4. Report the before/after delta to the user.

## References

Use these when you need specifics instead of copying detailed reference material into the response:

- [CLI reference](./references/cli-reference.md) — all flags, thresholds, presets
- [Output files](./references/output-files.md) — JSON schemas, key reference, reading guide
- [AST tree search](./references/ast-tree-search.md) — `ast/tree-search.js` usage and examples
- [AST search](./references/ast-search.md) — `ast/search.js` patterns, rules, presets
- [Validation and investigation](./references/validate-investigate.md) — reasoning loop, hybrid validation, taint tracing, lspHints
- [Playbooks](./references/playbooks.md) — per-category validate & fix, TDD, validation, comments, re-exports
- [Finding categories](./references/finding-categories.md) — all detectable categories by pillar
- [Present results](./references/present-results.md) — summary sections, decision heuristics, templates
- [Architecture techniques](./references/architecture-techniques.md) — SCC, broker, symbol-level analysis
- [Concepts](./references/concepts.md) — metric definitions (SDP, cognitive complexity, Halstead, MI)
- [Improvement roadmap](./references/improvement-roadmap.md) — planned upgrades for security, semantic, test quality

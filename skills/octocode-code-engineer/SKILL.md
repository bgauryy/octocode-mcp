---
name: octocode-code-engineer
description: "Use when the user asks to understand, write, implement, plan, review, or analyze code. Triggers: 'how does X work', 'implement this feature', 'add this safely', 'fix this bug', 'refactor this', 'explore this module', 'where should this live', 'audit code quality', 'check architecture', 'find test gaps', 'security review', 'analyze dependencies', 'what is the blast radius', 'scan for problems', 'find cycles', multi-file flow tracing, change impact analysis, or any task requiring deep file-level comprehension. Combines AST structural scanning, dependency graph analysis, local search, and LSP semantic analysis for full codebase awareness. For research-only exploration use octocode-researcher. For formal design documents use octocode-rfc-generator."
compatibility: "Requires Node.js >= 18. Works with any AI coding agent. Best with Octocode MCP local + LSP tools for hybrid validation. Pre-built scripts only; no install or build step required."
---

# Octocode Code Engineer

Code engineering platform — understand, build, and improve code with full codebase awareness.

The scanner is a hypothesis generator, not a source of truth. Every finding must be validated before it becomes a recommendation.

**Architecture principle: deterministic detection + AI-powered validation.** Detectors use cheap structural AST signals (loop depth, call count, fan-in/fan-out, statement count) to flag candidates. They intentionally do NOT hardcode domain-specific heuristics (regex patterns, method name lists, keyword matching). The AI agent is the smart layer — it uses its tools (AST search, LSP, localGetFileContent) to read the actual code, confirm or dismiss the hypothesis, and explain the evidence. This separation keeps detectors fast, maintainable, and language-generic while the agent adapts to any codebase.

## Skill Surfaces

This skill has two agent-facing surfaces:

- **CLI surface** — `scripts/index.js` runs full scans, `scripts/ast/search.js` queries live source by AST shape, and `scripts/ast/tree-search.js` queries generated `ast-trees.txt`.
- **Artifact API** — `summary.md` / `summary.json` provide the overview, `findings.json` is the prioritized validation queue, `architecture.json` carries graph signals, and `file-inventory.json` carries per-file structure.

Normal loop: CLI produces artifacts → the agent reads the artifact API → Octocode local/LSP tools validate the live code.

## Capabilities

Use this skill throughout your engineering workflow — not just for reviews.

**Understand & Navigate**

| Mode | Trigger | What it does |
|------|---------|-------------|
| **Codebase Exploration** | "how does X work", "explore this module", "understand this codebase" | Structure → Search → Fetch funnel with LSP semantic tracing |
| **Pre-Implementation Check** | "before I build X", "where should this live" | Layout → existing patterns → dependency map → pick safe location |

**Build & Change**

| Mode | Trigger | What it does |
|------|---------|-------------|
| **Smart Coding** | "implement this", "code this safely", "add feature", "fix this" | Behavior contract → pre-check (blast radius, consumers, coupling) → code → verify (tests, contracts, docs, re-scan) |
| **Interface Change Safety** | "change CLI", "rename flag", "modify endpoint", "change payload" | Public contract map → compatibility check → caller impact → docs/migration → verify |
| **Refactoring Planning** | "plan this refactor", "safe to rename", "how to restructure" | Impact analysis → blast radius → test/prod split → decomposition candidates |

**Analyze & Improve**

| Mode | Trigger | What it does |
|------|---------|-------------|
| **Architecture Analysis** | "check architecture", "find cycles", "dependency analysis" | Dependency graph, cycles, SCC clusters, coupling hotspots, chokepoints, layer violations |
| **Quality Audit** | "audit code", "find issues", "scan for problems" | Scan → triage → validate → present → plan fixes → apply → verify |
| **Code Quality Review** | "review this module", "is this code good" | AST smell sweep + complexity + dead code + maintainability |
| **Code Review** | "review impact of changes", "what does this PR touch" | Change impact → architecture delta → new issues → test coverage |
| **Test Strategy** | "test coverage gaps", "what needs testing" | Coverage mapping + test quality (requires `--include-tests`) + critical untested code (graph-based, always on) |
| **Security Analysis** | "security review", "find vulnerabilities", "check sensitive flows" | Map project security context → identify critical paths (auth, payments, user data, DB, external services) → trace sensitive flows with LSP → validate scanner findings → check exposure points (APIs, logs, errors, third-party) |
| **Dependency Health** | "unused deps", "import analysis" | Dead-code scan + reference counting + import mapping |

## Flow at a Glance

Use the mode-specific steps in [Workflow](#workflow) as the canonical process:
- **Explore**: Structure → Search → Fetch → Present evidence
- **Code**: Contract → Pre-check → Implement → Verify
- **Analyze**: Scan graph → Validate hotspots → Report
- **Audit**: Scan → Triage → Validate → Present → (with approval) plan/apply/verify

## Tools

Three layers work together — use any combination that fits the problem.

**Layer 1: CLI scan scripts** — broad hypothesis generation, structural proof

| Script | Purpose |
|--------|---------|
| `scripts/index.js` | Full scan with `--scope`, `--graph`, `--flow`, `--semantic`; scoped re-scan for verification |
| `scripts/ast/search.js` | Structural search on source files (`@ast-grep/napi`); presets (`--list-presets`), pattern/kind/rule modes; zero false-positive structural checks |
| `scripts/ast/tree-search.js` | Fast AST triage from scan artifacts; decides where to look before deeper tools |

**Layer 2: Octocode local tools** — fast text search, file discovery, targeted reading

| Tool | Purpose |
|------|---------|
| `localSearchCode` | The bridge tool — provides `lineHint` for all LSP calls; `filesOnly=true` for fast discovery |
| `localGetFileContent` | `matchString` jumps to exact section; `charOffset` pagination for large files; `fullContent` for small files |
| `localViewStructure` | Project layout at any depth; `filesOnly`/`directoriesOnly` filters |
| `localFindFiles` | `sortBy=size` finds hotspots; `modifiedWithin` finds active code; multi-name patterns |

**Layer 3: LSP tools** — semantic proof (definitions, usages, call chains)

| Tool | Purpose |
|------|---------|
| `lspFindReferences` | Definitive consumer count; `includePattern`/`excludePattern` for test/prod split; works on types, vars, exports |
| `lspCallHierarchy` | `incoming` = who calls this; `outgoing` = what does this call; `fromRanges[]` for exact sites. **Functions only** — fails on types/vars |
| `lspGotoDefinition` | Jump to where a symbol is defined; cross-file resolution |

### Research Approach

Three primitives power every investigation: **Search** (find targets), **Fetch** (read evidence), **Structure** (see shape). Chain them as a funnel:

```
STRUCTURE → SEARCH → FETCH
 80-90%      90-99%    100%
```

**Core rules:**
- `localSearchCode` is the default first step → produces `lineHint` for all LSP tools. Never guess `lineHint`.
- `ast/search.js` for structural proof (zero false positives); `ast/tree-search.js` for fast triage from scan artifacts.
- `lspFindReferences` for types/vars/exports; `lspCallHierarchy` for functions only (fails on types).
- `localGetFileContent(matchString=...)` for targeted reading; prefer `fullContent` for smaller files (about <200 lines).
- Use `localViewStructure` before deep reading.
- If a finding includes `lspHints[]`, run those first.

For the complete methodology (all tool tables, flags, decision tables, AST presets, efficiency tips) and all validated hybrid workflows, see [tool workflows](./references/tool-workflows.md).

The agent decides which tools to use. No required order — pick what makes sense for the finding. If Octocode MCP is unavailable, fall back to CLI-only and mark confidence explicitly.

**MCP detection**: try any local tool (e.g. `localSearchCode`). If it fails → MCP not available, use CLI-only.

## Confidence Tiers

| Tier | Evidence type | Minimum validation | Example categories |
|------|--------------|-------------------|-------------------|
| **high** | Structural AST proof | Code read at `file:line` is sufficient | `empty-catch`, `switch-no-default`, `debugger`, `console-log`, `any-type` |
| **medium** | Semantic / graph signal | Confirm with `lspFindReferences` or `lspCallHierarchy` | `dead-export`, `high-coupling`, `dependency-cycle`, `god-module-coupling` |
| **low** | Behavioral / data-flow | Trace source → propagator → sink with LSP + code reading | `unvalidated-input-sink`, `command-injection-risk`, `prototype-pollution-risk` |

When presenting findings, always label confidence. When MCP/LSP is unavailable, downgrade: `high` stays `high` (structural proof via AST), `medium` drops to `medium` (re-scan + `ast/search.js`), `low` drops to `uncertain` (no semantic tracing available).

## Coding Standards

Follow these when writing, modifying, or fixing code. Architecture thinking first, clean code second.

**Phase 1 — Before coding (think):**

1. **Behavior first.** Write down current behavior, desired behavior, acceptance criteria, invariants, non-goals, and key edge cases BEFORE touching code. If the change is user-facing, include a concrete CLI/API example.
2. **Architecture first, code second.** Map the module structure, dependencies, and coupling BEFORE touching code. Run `localViewStructure` + `index.js --graph` + `lspCallHierarchy` to understand the landscape. Decide *where* a change belongs based on module boundaries, not convenience.
3. **Interface contracts are code.** Treat CLI flags, help output, stdout/stderr, exit codes, request/response schemas, status codes, and error shapes as part of the implementation. Map compatibility and versioning before changing them.
4. **Edge cases and impact.** Identify failure modes and downstream impact BEFORE implementing. Use `lspFindReferences` to count consumers, `lspCallHierarchy(incoming)` to trace callers. As a default heuristic, >20 production consumers is high risk and often needs a feature flag or incremental approach.
5. **TDD when possible.** Write a failing test first, then make it pass. This proves the fix works and catches regressions. Skip ONLY for mechanical cleanups (dead code removal, rename-only, comment cleanup). See the TDD section in [validation playbooks](./references/validation-playbooks.md).

**Phase 2 — While coding (standards):**

1. **No patches or duplications.** Never copy-paste to "fix" a problem. If similar logic exists elsewhere, extract a shared function. Use `ast/search.js -p 'pattern' --json` to find existing implementations and `localSearchCode` to check if the pattern already exists — BEFORE writing new code.
2. **No redundant comments.** Comments explain *why*, never *what*. Remove `// Import X`, `// Define Y`, `// Return result`, `// Handle error`. If code needs a comment to explain what it does, make the code clearer instead.
3. **Validate with the project toolchain.** After each fix batch, run whatever lint, test, and build scripts the project provides (see Project Environment). Do not present fixes as done until the toolchain passes.

**Phase 3 — After coding (verify with both layers):**

Every code change must be verified with BOTH agentic intelligence AND deterministic proof. Neither alone is sufficient.

| Layer | Tools | Proves |
|-------|-------|--------|
| **Agentic** (Octocode MCP) | `localSearchCode` for text patterns, `lspFindReferences` for usage proof, `lspCallHierarchy` for call flow, `lspGotoDefinition` for cross-file jumps | Semantic correctness — symbols resolve, consumers intact, no orphaned references |
| **Deterministic** (AST/CLI) | `ast/search.js --preset` for structural smells, `ast/search.js -p 'pattern'` for zero-false-positive proof, `index.js --scope=<changed>` for re-scan | Structural correctness — no new `: any`, no empty catches, no duplications, finding count drops |

After changes: `index.js --scope=<changed-files>` + `ast/search.js --preset` for deterministic check, then `lspFindReferences` + `lspCallHierarchy` for semantic check.

**When changing external behavior in the target repo:**

- **CLI changes**: validate `--help`, commands/subcommands, flags/options, env/config inputs, stdout/stderr, exit codes, and one backward-compatible path when applicable.
- **API changes**: validate request/response schemas, status codes, error shapes, auth/pagination/versioning, and contract/integration tests when present.
- **Functional changes**: prove happy path, negative path, edge cases, invariants, and regression coverage.
- **Docs changes**: update README/help output/examples/OpenAPI or reference docs/migration notes when external behavior changes.
- **Risky changes**: define feature flag, rollout, telemetry, migration/backfill, and rollback plan.

See [tool workflows](./references/tool-workflows.md) for detailed public-change checklist workflows.

## Principles

- **Validate before presenting.** Findings are leads, not facts; always verify with code + semantic context.
- **Read order for audits.** `summary.md` first, then `findings.json`, then pillar files as needed.
- **Audit gates are mandatory.** Ask before planning fixes and before applying fixes.
- **Public contracts are code.** If behavior changes, validate contract compatibility and update docs/examples in the same task.
- **Prefer references over duplication.** Use the 5 reference docs for details instead of restating long rule lists here.

### FORBIDDEN

- **NEVER** present scanner findings as confirmed facts without tool validation.
- **NEVER** guess `lineHint` — always get it from `localSearchCode` first.
- **NEVER** use `lspCallHierarchy` on types or variables — it only works on functions. Use `lspFindReferences` instead.
- **NEVER** point `ast/search.js` at `.octocode/scan/` output files — it searches live source files only.
- **Avoid by default** using `fullContent` on large files (>200 lines) — use `matchString` for targeted reading.
- **Avoid by default** executing ad-hoc source entrypoints from `src/`; prefer stable scripts in `scripts/` unless the target repo explicitly uses source execution in its workflow.
- **NEVER** jump to fixing code without explicit user approval.
- **NEVER** recommend broad refactors from a single noisy finding.
- **NEVER** present live-code claims without validation when MCP/LSP tools are available.
- **NEVER** use relative paths with MCP/LSP tools — always use absolute paths.

## Project Environment

**Do not assume any toolchain.** Before running any lint, test, or build commands:

1. Read `package.json` `scripts` to discover what exists and what the actual command names are.
2. Detect the package manager from the lockfile (`yarn.lock`, `pnpm-lock.yaml`, `package-lock.json`).
3. In monorepos, check `workspaces` config to decide scope (root vs package-level).
4. If a script doesn't exist, skip it and warn the user — do not invent commands.

After every fix batch, run whatever lint, test, and build scripts the project provides. If tests fail, investigate before continuing.

## Error Recovery

| Failure | What it means | What to do |
|---------|--------------|------------|
| Scan produces 0 findings | Codebase may be clean, or scope/features too narrow | Check `--scope` and `--features` flags. Try without `--scope`. Read `summary.md` for parse errors. If truly 0 findings, report the codebase as healthy. See **Scope sanity checks** in [CLI reference](./references/cli-reference.md). |
| `--scope=file:symbol` warns "could not resolve" | Symbol name doesn't match an export, or the file uses patterns that prevent resolution | Falls back to file-level scope automatically. Check the exact exported function name and retry, or use file-level scope directly. |
| LSP tool returns empty/error | MCP may be unavailable, or `lineHint` is wrong | Verify MCP is running (try `localSearchCode` as a health check). If MCP is down, switch to CLI-only mode and mark confidence as `medium`. If `lineHint` is wrong, re-run `localSearchCode` to get a fresh one. |
| `ast/search.js` finds 0 matches | Pattern may not exist, or `--root` points to wrong directory | Check the `--root` path. Try a broader pattern. Use `--limit 0` to see all matches. Try `-k` (kind) instead of `-p` (pattern) for structural shape matching. |
| Project has no lint/test/build scripts | Cannot run post-fix validation toolchain | Warn the user that automated validation is limited. Skip the missing steps. Still run `index.js --scope` + `ast/search.js --preset` for deterministic verification. |
| Scan and LSP disagree on a finding | Conflicting evidence — structural vs semantic | Report both signals explicitly. Lower confidence to `uncertain`. Explain what each tool found and where they diverge. Let the user decide. |

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

> Start by selecting the mode that matches the user goal.

### Choose Your Mode

| Your goal | Mode | Entry point |
|-----------|------|------------|
| Understand code, explore a module, trace a flow | **Explore** | Structure → Search → Fetch |
| Write code, implement features, fix bugs | **Code** | Pre-check → Implement → Verify |
| Check architecture health, find cycles/coupling | **Analyze** | Full scan → Validate → Report |
| Audit quality, review code, find issues to fix | **Audit** | Scan → Triage → Validate → Fix → Verify |

**Decision rules:**
- User says "implement", "add", "fix", "build", "code" → **Code**
- User says "understand", "explore", "how does X work", "trace" → **Explore**
- User says "architecture", "cycles", "coupling", "dependencies" → **Analyze**
- User says "audit", "review", "scan", "find issues", "quality" → **Audit**
- Ambiguous? Start with **Explore** to understand the target, then switch to **Code** or **Audit**.

Modes compose — e.g. "implement X" triggers **Code** mode, which uses **Explore** internally to understand the target area first.

---

### Explore Mode

Use when understanding code — tracing flows, learning a codebase, finding where things live, pre-implementation research.

1. **Orient** — `localViewStructure` + `localFindFiles` + `ast/tree-search.js` to see the shape before searching.
2. **Search** — `localSearchCode` for text + `lineHint`, `ast/search.js` for structural proof, LSP for semantic usages.
3. **Deep-dive** — `localGetFileContent(matchString=...)` to read evidence, `lspGotoDefinition` + `lspCallHierarchy` chain to trace across files.
4. **Present** — explain with `file:line` citations, call chains, dependency maps.

For full command sequences, see [Workflow 13 in tool-workflows.md](./references/tool-workflows.md) (codebase exploration) and [Workflow 2](./references/tool-workflows.md) (symbol deep dive).

---

### Code Mode

Use when implementing features, fixing bugs, refactoring, or making any code change. Wraps every change with pre-check and verification.

**Step 1. Define the behavior contract**: current behavior, desired behavior, acceptance criteria (happy + negative path), invariants/non-goals. If user-facing, include a concrete CLI/API example.

**Step 2. Understand the target** — use Explore Mode internally to map the module layout and read current code.

**Step 3. Pre-check — blast radius**: `lspFindReferences` (total consumers, prod-only via `excludePattern`, test coverage via `includePattern`) + `lspCallHierarchy(incoming)` for direct callers.

**Step 4. Architecture safety + existing patterns**: `index.js --scope=<target> --features=architecture --graph` for coupling/cycle risk + `ast/search.js` / `localSearchCode` to find analogous implementations and follow conventions.

**Step 5. Implement the change**.

**Step 6. Verify**: run project tests, `index.js --scope=<changed>` + `ast/search.js --preset` for deterministic check, `lspFindReferences` for semantic check, project lint + build.

For public changes: also run CLI / integration / contract checks and update docs/examples/help output. For the expanded 10-step version with full tool commands, see [Workflow 18 in tool-workflows.md](./references/tool-workflows.md). For CLI/API contract safety, see [Workflows 19-21](./references/tool-workflows.md).

**If LSP unavailable** (Steps 3, 6): fall back to `localSearchCode` for usage counting, `ast/search.js` for structural verification, and scan JSON (`architecture.json` hotFiles/fan-in) for dependency data. Mark confidence as `medium` (structural) instead of `high` (semantic).

**Decision gates**:
- Step 3: >20 production consumers = high-risk, consider feature flag or incremental approach
- Step 4: target touches cycle member or hotfile = extra caution
- Step 6: docs/contract drift, new findings, or test failures = fix before committing
- Breaking public behavior needs a migration note or explicit user approval

---

### Analyze Mode

Use for architecture health checks, dependency analysis, cycle detection, coupling assessment.

1. **Full architecture scan** — `index.js --graph --graph-advanced --flow --features=architecture`. Read `summary.md` for health scores, `architecture.json` for cycles/hotFiles/SCC/chokepoints, `graph.md` for visualization.
2. **Validate hotspots with LSP** — `lspFindReferences` for fan-in per module, `lspCallHierarchy(outgoing)` for fan-out, `ast/search.js` for cross-module import patterns.
3. **Present** — architecture health report with cycle list, SCC clusters, chokepoints, hotfiles (ranked), boundary violations, critical paths, fan-in/fan-out per module.

For the full command sequence, see [Workflow 17 in tool-workflows.md](./references/tool-workflows.md).

---

### Audit Mode

Use for quality audits, code reviews, finding and fixing issues. This is the full review loop.

**Step 1. Scan** — get hypotheses:

```bash
node <SKILL_DIR>/scripts/index.js [flags]          # default entry point
node <SKILL_DIR>/scripts/index.js --graph --flow    # good starting point
node <SKILL_DIR>/scripts/index.js --help            # full flag reference
```

| Flag | When to use |
|------|-------------|
| `--features=architecture` | Cycles, coupling, reachability, dependency pressure |
| `--features=code-quality` | Complexity, maintainability, duplication, performance smells |
| `--features=dead-code` | Dead exports, unused deps, boundary violations |
| `--features=security` | Sink-risk, validation-sensitive findings |
| `--features=test-quality` | Flaky or misleading test patterns |
| `--graph` | Dependency structure, hotspots, critical paths |
| `--flow` | Path-sensitive claims, control-flow evidence |
| `--semantic` | Type-aware design signals (adds ~3-5s; run `--help` for current category list) |
| `--scope=<path>` | Narrow to specific path, file, or `file:symbol` (see [scope sanity checks](./references/cli-reference.md)) |

**Step 2. Read outputs** — in this order (stop when you have enough context):

| Priority | File | Use for |
|----------|------|---------|
| **1st** | `summary.md` | Health scores, severity ordering, analysis signals, top recommendations |
| **2nd** | `findings.json` | Full prioritized finding queue with `lspHints`, `impact`, `suggestedFix` |
| **3rd** | `architecture.json` | Only when architecture findings dominate — cycles, hotFiles, SCC, chokepoints |
| As needed | `summary.json` | Machine-readable metadata, `agentOutput`, `investigationPrompts` |
| As needed | `code-quality.json` | Complexity, duplicates, god modules/functions |
| As needed | `dead-code.json` | Dead exports, boundary violations, unused deps |
| As needed | `security.json` / `test-quality.json` | Pillar-specific findings |
| As needed | `file-inventory.json` | Per-file functions, flows, dependencies, effects |
| As needed | `ast-trees.txt` | AST snapshot for structural triage |
| As needed | `graph.md` | Mermaid dependency graph (with `--graph`) |

For JSON key schemas and field reference, see [output files](./references/output-files.md).
For AST tool choice and syntax, use [ast reference](./references/ast-reference.md).

**Step 3. Triage** — prioritize findings with high severity, clusters in the same call path, security-sensitive items, architecture signals that align with hotspots. Label each: `observed`, `suspected`, or `validated`.

**Step 4. Validate** — every finding must be confirmed before presenting as fact.

Detectors produce structural candidates (loops × calls × depth). You are the intelligence layer. Read the code, trace the graph, and decide:

1. **Check `lspHints`** — if the finding has `lspHints[]`, run those tool calls first. They're pre-computed shortcuts to the fastest validation.
2. **Read evidence** — `localGetFileContent(matchString=functionName)` to see the actual code.
3. **Trace context** — `lspCallHierarchy` / `lspFindReferences` to understand callers, consumers, blast radius.
4. **Decide** — `confirmed` (evidence supports), `dismissed` (false positive — explain why), `uncertain` (need more data — say what's missing).

For per-category validation tables and fix tactics, see [validation playbooks](./references/validation-playbooks.md).

**CLI-only fallback** (if Octocode MCP unavailable): use `ast/search.js` for structural verification, re-scan with `--scope`. See **Confidence Tiers** for how to label without LSP.

**Step 5. Present** — what the scan suggested → what validation confirmed/disproved → what remains uncertain. Always include `file:line` evidence and confidence. See reporting guidance in [output files](./references/output-files.md).

> **GATE — User approval required.**
> Ask: "Want me to plan fixes?" **Do NOT proceed to Step 6 without explicit user approval.**

**Step 6. Plan fixes** (on user request) — prioritized improvement plan:
1. Immediate fixes for validated high-signal problems
2. Short follow-up checks for suspected issues
3. Structural improvements for recurring patterns
4. Contract/docs/rollout work for public behavior changes
5. Re-scan scope and validation steps

> **GATE — User approval required.**
> Ask: "Should I apply these fixes?" **Do NOT proceed to Step 7 without explicit user approval.**

**Step 7. Apply fixes** (on user approval):
1. TDD-first for behavioral fixes — write failing test → fix → pass → full suite. Skip TDD for mechanical cleanups.
2. When touching a file: remove redundant comments (restate the code) and dead re-exports (0 consumers via `lspFindReferences`).
3. If public behavior changes: update docs/examples/help output and note compatibility or migration impact.
4. Validate with whatever lint, test, and build scripts the project provides.

**Step 8. Verify** — re-scan with `--scope`, compare finding counts, report before/after delta.

## References

Use only these 5 docs. They are intentionally non-overlapping. **SKILL.md** is the normative document (principles, decision rules, gates, constraints). **References** are operational documents (runnable procedures, exact commands, schemas).

| Reference | Primary purpose |
|-----------|-----------------|
| [Tool workflows](./references/tool-workflows.md) | **Canonical command cookbook** — end-to-end task execution flows (explore, code, analyze, audit, contract safety) with full tool commands |
| [CLI reference](./references/cli-reference.md) | Exact scanner flags, presets, command syntax, scope sanity checks |
| [Output files](./references/output-files.md) | Artifact read order, schema fields, and reporting signals |
| [AST reference](./references/ast-reference.md) | AST triage + AST structural proof (`tree-search` + `search`), all presets |
| [Validation playbooks](./references/validation-playbooks.md) | Validation loop, category fix tactics, architecture interpretation, metrics cheat sheet |

### MUST read docs when needed

| Situation | MUST read |
|-----------|-----------|
| Need exact command flags/presets | [CLI reference](./references/cli-reference.md) |
| Need to run a mode end-to-end | [Tool workflows](./references/tool-workflows.md) |
| Need AST triage/proof syntax | [AST reference](./references/ast-reference.md) |
| Need validation verdict + fix path | [Validation playbooks](./references/validation-playbooks.md) |
| Need output schema/reporting/read order | [Output files](./references/output-files.md) |

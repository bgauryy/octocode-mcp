---
name: octocode-code-engineer
description: "Code engineering platform: CLI scanner + AST engine + Octocode MCP local/LSP tools. Use for any engineering task — not just reviews. Understand unfamiliar code, explore architecture, write code with blast radius awareness, plan refactors safely, audit quality, review changes, analyze test gaps, check security, or assess dependency health. Integrates into your coding workflow: pre-implementation checks, impact-aware coding, and post-change verification."
compatibility: "Requires Node.js >= 18. Works with any AI coding agent. Best with Octocode MCP local + LSP tools for hybrid validation. Pre-built scripts only; no install or build step required."
---

# Octocode Code Engineer

Code engineering platform — understand, build, and improve code with full codebase awareness.

The scanner is a hypothesis generator, not a source of truth. Every finding must be validated before it becomes a recommendation.

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
| **Smart Coding** | "implement this", "code this safely", "add feature", "fix this" | Pre-check (blast radius, consumers, coupling) → code → verify (re-scan, lint, test, build) |
| **Refactoring Planning** | "plan this refactor", "safe to rename", "how to restructure" | Impact analysis → blast radius → test/prod split → decomposition candidates |

**Analyze & Improve**

| Mode | Trigger | What it does |
|------|---------|-------------|
| **Architecture Analysis** | "check architecture", "find cycles", "dependency analysis" | Dependency graph, cycles, SCC clusters, coupling hotspots, chokepoints, layer violations |
| **Quality Audit** | "audit code", "find issues", "scan for problems" | Scan → triage → validate → present → plan fixes → apply → verify |
| **Code Quality Review** | "review this module", "is this code good" | AST smell sweep + complexity + dead code + maintainability |
| **Code Review** | "review impact of changes", "what does this PR touch" | Change impact → architecture delta → new issues → test coverage |
| **Test Strategy** | "test coverage gaps", "what needs testing" | Coverage mapping + test quality + critical untested code |
| **Security Analysis** | "security review", "find vulnerabilities" | AST sink patterns + LSP taint tracing + sanitizer detection |
| **Dependency Health** | "unused deps", "import analysis" | Dead-code scan + reference counting + import mapping |

## Flow at a Glance

**Explore** (understand code):
```
Structure (localViewStructure, ast/tree-search.js, index.js --graph)
  → Search (localSearchCode, ast/search.js, lspFindReferences)
  → Fetch (localGetFileContent, lspGotoDefinition)
  → Present understanding with evidence
```

**Code** (implement with awareness):
```
Pre-check: blast radius (lspFindReferences → consumer count, test/prod split)
  → Architecture safety (index.js --scope=<target> --graph → coupling/cycle risk)
  → Existing patterns (ast/search.js, localSearchCode → follow conventions)
  → Code the change
  → Verify: lint + test + build + re-scan --scope=<changed>
```

**Analyze** (architecture health):
```
index.js --graph --graph-advanced --flow --semantic
  → architecture.json: cycles, SCC clusters, chokepoints, hotFiles, critical paths
  → Validate with LSP: fan-in/fan-out per module, consumer maps
  → Present architecture health with evidence
```

**Audit** (quality review):
```
Scan (CLI) → Read summary.md → Triage findings.json
  → Validate each finding with Octocode local tools
  → Present validated findings → ASK user before planning fixes
  → Apply fixes (TDD when possible) → lint + test + build
  → Re-scan to verify finding count drops
```

## Tools

Three layers work together — use any combination that fits the problem.

**Layer 1: CLI scan scripts** — broad hypothesis generation, structural proof

| Script | Purpose |
|--------|---------|
| `scripts/index.js` | Full scan with `--scope`, `--graph`, `--flow`, `--semantic`; scoped re-scan for verification |
| `scripts/ast/search.js` | Structural search on source files (`@ast-grep/napi`); 16 presets, pattern/kind/rule modes; zero false-positive structural checks |
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
- `localSearchCode` always first → produces `lineHint` for all LSP tools. Never guess `lineHint`.
- `ast/search.js` for structural proof (zero false positives); `ast/tree-search.js` for fast triage from scan artifacts.
- `lspFindReferences` for types/vars/exports; `lspCallHierarchy` for functions only (fails on types).
- `localGetFileContent(matchString=...)` for targeted reading; `fullContent` only for files <200 lines.
- `localViewStructure` before deep reading — know the layout first.
- Reverse the funnel when `lspHints` from `findings.json` provide exact coordinates.

For the complete methodology (all tool tables, flags, decision tables, AST presets, efficiency tips) and all validated hybrid workflows, see [tool workflows](./references/tool-workflows.md).

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

### Choose Your Mode

| Your goal | Mode | Entry point |
|-----------|------|------------|
| Understand code, explore a module, trace a flow | **Explore** | Structure → Search → Fetch |
| Write code, implement features, fix bugs | **Code** | Pre-check → Implement → Verify |
| Check architecture health, find cycles/coupling | **Analyze** | Full scan → Validate → Report |
| Audit quality, review code, find issues to fix | **Audit** | Scan → Triage → Validate → Fix → Verify |

The agent picks the right mode based on your request. Modes compose — e.g. "implement X" triggers **Code** mode, which uses **Explore** internally to understand the target area first.

---

### Explore Mode

Use when understanding code — tracing flows, learning a codebase, finding where things live, pre-implementation research.

**Step 1. Orient** — see the shape before searching:
```
localViewStructure(depth=2, directoriesOnly=true)                → project layout
localFindFiles(sortBy="size", sizeGreater="10k")                 → hotspot files
ast/tree-search.js -k function_declaration --limit 25            → code structure triage
```

**Step 2. Search** — find what you need:
```
localSearchCode(pattern="target", filesOnly=true)                → text matches + lineHint
ast/search.js -p 'pattern' --json --root <dir>                  → structural matches
lspFindReferences(lineHint=N)                                    → all usages of a symbol
lspCallHierarchy(incoming/outgoing, depth=1)                     → call relationships
```

**Step 3. Deep-dive** — read evidence, trace across files:
```
localGetFileContent(matchString="target", contextLines=5)        → read specific section
lspGotoDefinition(lineHint=N)                                    → jump to definition
lspCallHierarchy chain                                           → follow call path across files
```

**Step 4. Present** — explain with evidence (`file:line` citations, call chains, dependency maps).

---

### Code Mode

Use when implementing features, fixing bugs, refactoring, or making any code change. Wraps every change with pre-check and verification.

**Step 1. Understand the target** (uses Explore internally):
```
localViewStructure(path="target/dir", depth=2)                   → module layout
localGetFileContent(matchString="targetFunction", contextLines=10) → current code
lspGotoDefinition(lineHint=N)                                    → follow definitions
```

**Step 2. Pre-check — blast radius**:
```
lspFindReferences(lineHint=N, includeDeclaration=false)          → total consumers
lspFindReferences(excludePattern=["**/tests/**"])                → production consumers
lspFindReferences(includePattern=["**/tests/**"])                → test coverage
lspCallHierarchy(incoming, depth=1)                              → direct callers
```

**Step 3. Architecture safety**:
```
index.js --scope=<target-files> --features=architecture --graph  → coupling/cycle risk
ast/search.js -p 'similar-pattern' --json --root <nearby-dir>   → follow existing conventions
```

**Step 4. Implement the change**.

**Step 5. Verify**:
```
index.js --scope=<changed-files> --features=code-quality,architecture → no new issues
ast/search.js --preset any-type --json --root <changed-dir>      → no new : any
lspFindReferences(lineHint=N)                                    → moved/renamed symbols resolve
<pm> run lint --fix && <pm> run test && <pm> run build           → toolchain passes
```

**Decision gates**:
- Step 2: >20 production consumers = high-risk, consider feature flag or incremental approach
- Step 3: target touches cycle member or hotfile = extra caution
- Step 5: new findings or test failures = fix before committing

---

### Analyze Mode

Use for architecture health checks, dependency analysis, cycle detection, coupling assessment.

**Step 1. Full architecture scan**:
```
index.js --graph --graph-advanced --flow --features=architecture
summary.md                                                       → architecture health score
architecture.json → cycles, hotFiles, sccClusters, chokepoints   → raw data
graph.md                                                         → Mermaid visualization
```

**Step 2. Validate hotspots with LSP**:
```
lspFindReferences(lineHint=N, includeDeclaration=false)          → fan-in per module
lspCallHierarchy(outgoing, depth=1)                              → fan-out per module
ast/search.js -p 'import { $$$N } from $MOD' --json             → cross-module imports
```

**Step 3. Present** — architecture health report with cycle list, SCC clusters, chokepoints, hotfiles (ranked), boundary violations, critical paths, fan-in/fan-out per module.

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
| `--semantic` | Type-aware design signals (adds ~3-5s) |
| `--scope=<path>` | Narrow to specific path, file, or `file:symbol` |

**Step 2. Read outputs** — `summary.md` first (health scores → analysis signals → top recommendations), then `findings.json` (work queue with `lspHints`, `impact`, `suggestedFix`).

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

**Step 3. Triage** — prioritize findings with high severity, clusters in the same call path, security-sensitive items, architecture signals that align with hotspots. Label each: `observed`, `suspected`, or `validated`.

**Step 4. Validate** — every finding must be confirmed before presenting as fact:

| Finding type | Useful tools | Why |
|-------------|-------------|-----|
| Dead export | `lspFindReferences` → 0 refs confirms dead | Direct proof |
| Dependency cycle | `localViewStructure` → layout, `lspCallHierarchy` → trace chain | Structure + flow |
| Security sink | `localGetFileContent` → context, `lspCallHierarchy(incoming)` → callers | Context + data-flow |
| Coupling hotspot | `localSearchCode` → usages, `lspFindReferences` → consumers | Blast radius |
| God module | `localViewStructure` → file count, `localSearchCode` → cross-imports | Scope the problem |
| Complex function | `localGetFileContent` → code, `lspCallHierarchy(outgoing)` → callees | Understand complexity |

For detailed per-category guidance, see [playbooks](./references/playbooks.md) and [validate & investigate](./references/validate-investigate.md).

**CLI-only fallback** (if Octocode MCP unavailable): use `ast/search.js` for structural verification, re-scan with `--scope`. Mark confidence: `high` = structural, `medium` = semantic, `low` = behavioral.

**Step 5. Present** — what the scan suggested → what validation confirmed/disproved → what remains uncertain. Always include `file:line` evidence and confidence. See [present results](./references/present-results.md).

**After presenting, ask:** "Want me to plan fixes?" Do not jump into fixes automatically.

**Step 6. Plan fixes** (on user request) — prioritized improvement plan:
1. Immediate fixes for validated high-signal problems
2. Short follow-up checks for suspected issues
3. Structural improvements for recurring patterns
4. Re-scan scope and validation steps

**After presenting the plan, ask:** "Should I apply these fixes?"

**Step 7. Apply fixes** (on user approval):
1. TDD-first for behavioral fixes — write failing test → fix → pass → full suite. Skip TDD for mechanical cleanups.
2. When touching a file: remove redundant comments (restate the code) and dead re-exports (0 consumers via `lspFindReferences`).
3. Validate with project toolchain: lint (`--fix`) → tests → build.

**Step 8. Verify** — re-scan with `--scope`, compare finding counts, report before/after delta.

## References

Use these when you need specifics instead of copying detailed reference material into the response:

- [CLI reference](./references/cli-reference.md) — all flags, thresholds, presets
- [Output files](./references/output-files.md) — JSON schemas, key reference, reading guide
- [AST tree search](./references/ast-tree-search.md) — `ast/tree-search.js` usage and examples
- [AST search](./references/ast-search.md) — `ast/search.js` patterns, rules, presets
- [Tool workflows](./references/tool-workflows.md) — 18 hybrid workflows: audits, architecture, smart coding, quality, refactoring, exploration, testing, security, reviews
- [Validation and investigation](./references/validate-investigate.md) — reasoning loop, hybrid validation, taint tracing, lspHints
- [Playbooks](./references/playbooks.md) — per-category validate & fix, TDD, validation, comments, re-exports
- [Finding categories](./references/finding-categories.md) — all detectable categories by pillar
- [Present results](./references/present-results.md) — summary sections, decision heuristics, templates
- [Architecture techniques](./references/architecture-techniques.md) — SCC, broker, symbol-level analysis
- [Concepts](./references/concepts.md) — metric definitions (SDP, cognitive complexity, Halstead, MI)
- [Improvement roadmap](./references/improvement-roadmap.md) — planned upgrades for security, semantic, test quality

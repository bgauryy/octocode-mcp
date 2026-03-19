---
name: octocode-local-code-quality
description: "Scan TS/JS codebases for architecture rot, code quality, security risks, dead code, test quality, and performance patterns. Use for: audit code, check architecture, find cycles, trace flows, dead exports, complexity, security review, input validation, test coverage gaps, performance issues, duplicate code. Produces validated findings with file:line evidence and a prioritized improvement plan."
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
  → If yes → Apply fixes → Re-scan to verify
```

Two tool layers work together — use any combination that fits the problem:

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

**The agent decides which tools to use.** There is no required order — pick what makes sense for the finding. A dead-export check might only need `lspFindReferences`. A cycle investigation might start with `localViewStructure` to understand layout, then `lspCallHierarchy` to trace the chain. A security finding might need `localGetFileContent` to read the surrounding code, then `lspCallHierarchy` to trace callers.

If Octocode MCP is unavailable, use CLI-only and mark confidence explicitly.

## Placeholders

- `<SKILL_DIR>` — absolute path to this skill's directory (where `SKILL.md` lives). All script paths are relative to it.
- `<CURRENT_SCAN>` — timestamped scan output directory (e.g., `.octocode/scan/2026-03-19T00-01-19-468Z`). Find it at the top of `summary.md` or use the latest directory in `.octocode/scan/`.
- `<TARGET_ROOT>` — root of the codebase being analyzed. Defaults to cwd, override with `--root`.

## Quick Start

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

## Working Principles

- Findings are leads, not facts — validate with Octocode local tools before presenting.
- Read `summary.md` first: scope, health scores, analysis signals, hotspots, recommended validation.
- Let the problem drive tool choice — pick the Octocode tools that fit the finding, not a fixed sequence.
- All Octocode local tools are available: search, structure, files, content, LSP definition/references/calls.
- CLI-only is the fallback when Octocode MCP is unavailable, not the default.
- Use `--help` and reference docs for flags, categories, and presets — do not restate them.
- Detect the project environment before running commands — see Project Environment.
- **Use the task tool** to create a todo list at the start of every review — one item per workflow step. Update status as you go. Always stop and ask the user before planning fixes (after Step 5) and before applying them (after Step 6).

## Project Environment

Never hardcode tool names. Detect the project setup before running lint, build, or test commands:

1. **Package manager**: `yarn.lock` → yarn, `pnpm-lock.yaml` → pnpm, `package-lock.json` → npm.
2. **Scripts**: read `package.json` `scripts` (both root and package-level in monorepos). Use actual script names — do not invent commands.
3. **Workspace context**: in monorepos, check `workspaces` config to decide between root-level (`yarn workspace <name> test`) or package-level (`cd packages/foo && yarn test`).

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

### Step 2. Check Output Files

Read `summary.md` first. Then pull in only the files that help answer the current question.

How to read `summary.md` — it follows a fixed structure:

```
## Health Scores
| Pillar        | Score  | Grade |
| Overall       | 61/100 | D     |
| Architecture  | 54/100 | D     |
| Code Quality  | 72/100 | C     |

## Analysis Signals
- Graph Signal: src/tools.ts concentrates dependency pressure (high fan-in, on critical path)
- AST Signal: No dominant AST signal in this scan.
- Confidence: high
- Recommended Validation: Confirm with localSearchCode -> lspGotoDefinition

## Top Recommendations
- [CRITICAL] src/server.ts — Dependency cycle detected (4 node cycle)
- [HIGH] src/utils.ts:89 — 6 unused exports
```

Use health scores to gauge severity, analysis signals to choose the investigation lens, and hotspots + top recommendations to decide where validation is worth the time.

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

`ast-trees.txt` is a compact indented text snapshot of every file's AST. Each node is `Kind[startLine:endLine]`, nesting depth = indentation level:

```
## my-package — src/services/storage.ts
SourceFile[1:152]
  ImportDeclaration[1:3]
  FunctionDeclaration[10:45]
    Block[11:44]
      IfStatement[12:20] ...
      ReturnStatement[43]
```

### AST Tools — Which One to Use

| Tool | Searches | Input | Purpose |
|------|----------|-------|---------|
| `ast/tree-search.js` | Generated `ast-trees.txt` from a scan | `-i <CURRENT_SCAN>/ast-trees.txt` or `-i .octocode/scan` (auto-resolves latest) | Fast structure triage — decide where to look |
| `ast/search.js` | Actual source files on disk | `--root <dir>` | Structural proof — find code by AST shape with `@ast-grep/napi` |

Do not point `ast/search.js` at `.octocode/scan/...` output files — it searches source files, not generated AST text artifacts. Use `ast/tree-search.js` for scan artifacts.

### Step 3. Triage Before Validating

Decide what deserves deeper work first:

- findings with high severity or repeated occurrence
- clusters in the same file, package, or call path
- security findings and behavior-sensitive findings
- architecture signals that line up with hotspots or high fan-in / fan-out

Each finding in `findings.json` has this shape:

```json
{
  "id": "AST-ISSUE-0001", "severity": "high", "category": "dependency-critical-path",
  "file": "src/tools/manager.ts", "lineStart": 45, "lineEnd": 45,
  "title": "Critical dependency chain risk: 27 files",
  "reason": "Long transitive chain increases change propagation risk",
  "impact": "Changes may cascade through 27 downstream consumers",
  "suggestedFix": { "strategy": "Break chain at src/providers/factory.ts" },
  "lspHints": [{ "tool": "lspCallHierarchy", "symbolName": "factory", "lineHint": 45 }],
  "tags": ["coupling", "change-risk"], "confidence": "high"
}
```

Use `lspHints` directly when present — pre-computed validation with exact tool, symbol, and line. Use `impact` to prioritize.

Label each finding: `observed` (scan shows it), `suspected` (inferred from signals), or `validated` (confirmed by tools). Build the work queue from `findings.json`, not `summary.md` alone — validate the top items before recommending changes.

### Step 4. Validate Findings with Octocode

**Every finding must be validated with Octocode local tools before presenting it as fact.**

Choose the tools that fit the finding — there is no required sequence. Examples of how different finding types map to tools:

| Finding type | Useful tools | Why |
|-------------|-------------|-----|
| Dead export | `lspFindReferences` → 0 refs confirms dead | Direct proof |
| Dependency cycle | `localViewStructure` → see layout, `lspCallHierarchy` → trace chain | Understand structure + prove flow |
| Security sink | `localGetFileContent` → read surrounding code, `lspCallHierarchy(incoming)` → trace callers | Need context + data-flow |
| Coupling hotspot | `localSearchCode` → find usages, `lspFindReferences` → count consumers | Quantify blast radius |
| God module | `localViewStructure` → see file count, `localSearchCode` → find cross-imports | Scope the problem |
| Complex function | `localGetFileContent` → read implementation, `lspCallHierarchy(outgoing)` → see what it calls | Understand why it's complex |

Use `lspHints` from `findings.json` when present — they provide pre-computed tool + symbol + line for direct validation.

After fixes, re-scan with `--scope` to verify finding count drops.

**Fallback (CLI-only — only if Octocode MCP is unavailable):**

Use `ast/search.js` for structural verification, read source at `lineStart:lineEnd`, and re-scan with `--scope`. Mark confidence: `high` = structural (empty-catch, switch-no-default), `medium` = semantic (dead-export, coupling), `low` = behavioral (security, data-flow).

### Step 5. Present Findings and Ask User

Report structure: what the scan suggested → what validation confirmed or disproved → what remains uncertain.

Rules: only validated claims are facts, unvalidated items are hypotheses, always include `file:line` evidence, explain why it matters (not just what matched), state confidence level.

**After presenting findings, ask the user:** "Want me to plan fixes for these findings?" Do not jump into an improvement plan automatically — let the user decide scope and priority first.

### Step 6. Output an Improvement Plan (on user request)

Only produce the plan after the user confirms.

The plan should be prioritized and practical:

1. Immediate fixes for validated high-signal problems
2. Short follow-up checks for important but not yet fully proven issues
3. Structural improvements for recurring patterns or architectural pressure
4. Re-scan scope and validation steps to confirm the outcome

Each item should name the target files, reason, expected benefit, evidence level, and execution tactic.

For mechanical or repeated fixes, prefer `rg` + `sed`, `find` + `xargs`, `mv`, `jq` over manual editing. Use manual edits for nuanced logic changes. For mega-folder restructuring, see the [playbooks reference](./references/playbooks.md).

**After presenting the plan, ask the user:** "Should I apply these fixes?" Do not make code changes without confirmation. Once approved, apply fixes in priority order, then re-scan with `--scope` to verify improvements.

## Tool Strategy

Choose the lightest approach that gives reliable conclusions — use any Octocode tool that fits:

| Strategy | When | Available tools | Confidence |
|----------|------|----------------|------------|
| **Hybrid** | Octocode MCP available | CLI scan + all local tools (`localSearchCode`, `localViewStructure`, `localFindFiles`, `localGetFileContent`) + LSP (`lspGotoDefinition`, `lspFindReferences`, `lspCallHierarchy`) | Highest — semantic proof |
| **CLI-first** | Scan output already gives strong context | CLI scan + `ast/search.js` + targeted re-scan | High for structural findings |
| **CLI-only** | No MCP/LSP available | CLI scan + `ast/search.js` + `ast/tree-search.js` + file reads | Mark confidence explicitly |

**Detect MCP**: try any local tool (e.g. `localSearchCode`). If it fails → CLI-only fallback.

## Guardrails

- Run only the pre-built scripts in `scripts/`.
- Never execute files from `src/`.
- Use absolute paths with MCP/LSP tools.
- Do not present live-code claims without validation when local/LSP tools are available.
- Do not recommend broad refactors from one noisy finding.
- If the scan and validation disagree, say so explicitly and lower confidence.

## References

Use these when you need specifics instead of copying detailed reference material into the response:

- [CLI reference](./references/cli-reference.md)
- [Output files](./references/output-files.md)
- [AST tree search](./references/ast-tree-search.md)
- [AST search](./references/ast-search.md)
- [Validation and investigation](./references/validate-investigate.md)
- [Playbooks](./references/playbooks.md)
- [Finding categories](./references/finding-categories.md)
- [Present results](./references/present-results.md)
- [Architecture techniques](./references/architecture-techniques.md)
- [Concepts](./references/concepts.md)
- [Agent AST reading RFC](./references/agent-ast-reading-rfc.md)
- [Improvement roadmap](./references/improvement-roadmap.md)

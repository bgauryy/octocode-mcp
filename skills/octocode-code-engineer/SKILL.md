---
name: octocode-code-engineer
description: "Codebase-aware engineering skill for analysis, planning, and implementation. Use for understanding code, bug fixes, refactors, audits, and architecture/security/test-quality reviews. Combines deterministic scanning (AST/graph/LSP) with AI validation and prioritization."
compatibility: "Requires Node.js >= 18. Full capability with Octocode MCP local tools (ENABLE_LOCAL=true). Falls back to CLI-only AST mode when MCP is unavailable."
---

# Octocode Code Engineer

Use this skill before and during code changes when correctness, architecture safety, and blast-radius awareness matter.

## Core principle
Detectors produce hypotheses. AI validates and prioritizes.

- Scanner/AST/graph/LSP output is not final truth by itself.
- Confirm important findings with semantic proof (`localSearchCode` → LSP → `localGetFileContent`).
- Prefer converging evidence (multiple signals on the same file/symbol).

## When to use
Use for:
- code understanding (`how does X work?`)
- bug fixing and refactoring
- architecture and quality audits
- dead code cleanup
- security review (static risk patterns)
- test quality and coverage gap analysis

## When NOT to use
Do not use this as the primary tool for:
- syntax/compiler failures (`tsc`, linter first)
- code style/formatting policy (ESLint/Prettier)
- runtime debugging/profiling (debugger, logs, profilers)
- dependency vulnerability management (SCA tools)
- scaffolding boilerplate projects

## Task sizing
Classify first. This controls depth and speed.

| Size | Typical work | Required steps |
|------|---------------|----------------|
| S | single-file, low-risk edit | UNDERSTAND → RESEARCH → IMPLEMENT → VERIFY(lite) |
| M | multi-file change with consumers | UNDERSTAND → STRUCTURE(lite) → RESEARCH → PLAN → IMPLEMENT → VERIFY |
| L | cross-cutting or architectural change | full workflow (all steps) |

Upgrade to L if any appears during research:
- high fan-in / many consumers (>20 prod refs)
- cycle/hotspot involvement
- unclear ownership or contract risk

## Tool policy
Prefer Octocode tools and skill scripts over generic shell search.

- Use `localSearchCode` instead of `grep/rg` for first discovery when possible.
- Use `localViewStructure` / `localFindFiles` for structure and metadata-driven discovery.
- Use `localGetFileContent` for targeted reading.
- Use LSP tools for semantic proof.
- Use skill scripts for deterministic scan evidence.

### Core tools
- `localViewStructure`: layout, naming, depth, hotspots by directory.
- `localFindFiles`: find by size/time/type/name.
- `localSearchCode`: text match + `lineHint` source for LSP.
- `localGetFileContent`: read code around evidence.
- `lspGotoDefinition`: jump cross-file.
- `lspFindReferences`: real consumer count (types/vars/functions).
- `lspCallHierarchy`: function call chains only.
- `<SKILL_DIR>/scripts/run.js`: full scan.
- `<SKILL_DIR>/scripts/ast/search.js`: live-source structural proof.
- `<SKILL_DIR>/scripts/ast/tree-search.js`: scan-artifact AST triage.

`<SKILL_DIR>` = directory containing this `SKILL.md`.

### MCP availability check
Run a quick `localSearchCode` query.
- If available: full workflow (MCP + scripts).
- If unavailable: CLI-only mode (`run.js` + AST scripts), and report lower confidence for semantic claims.

## Workflow

```text
UNDERSTAND → STRUCTURE → RESEARCH → SCAN → OUTPUT → PLAN → IMPLEMENT → VERIFY
```

Apply full workflow for L tasks. For S/M, run only required steps from Task sizing.

### 1) UNDERSTAND
Capture:
- desired outcome (current vs expected behavior)
- target scope (module/files/features)
- acceptance criteria + edge cases

Ask the user only if scope or intent is truly ambiguous.

### 2) STRUCTURE (M/L)
Build quick map before deep search.

Recommended queries:
- skeleton: `localViewStructure` (`directoriesOnly=true`, `depth=3`)
- source spread: `localViewStructure` (`filesOnly=true`, `extension=.ts/.js`)
- large files: `localFindFiles` (`sizeGreater`, `sortBy=size`)
- recent churn: `localFindFiles` (`modifiedWithin=7d`)
- test layout: `localViewStructure` (`pattern=*.test.*`)

Batch independent queries.

### 3) RESEARCH
Canonical funnel:
1. `localSearchCode` to locate targets and get `lineHint`.
2. LSP tracing (`gotoDefinition`, `findReferences`, `callHierarchy`).
3. `localGetFileContent` for final proof context.

Rules:
- Never guess `lineHint`.
- Use `lspFindReferences` for types/vars/exports.
- Use `lspCallHierarchy` for functions only.

### 4) SCAN (L, or when risk is unclear)
Run from target repo root:

```bash
node <SKILL_DIR>/scripts/run.js [flags]
```

Common profiles:
- general audit: `--graph --flow`
- architecture: `--features=architecture --graph --graph-advanced`
- quality: `--features=code-quality --flow`
- dead code: `--features=dead-code`
- security: `--features=security --flow`
- test quality: `--features=test-quality --include-tests`
- deep dive: `--scope=<path> --graph --flow --semantic`
- post-change verify: `--scope=<changed-paths> --no-cache`

AST commands:

```bash
# live source proof
node <SKILL_DIR>/scripts/ast/search.js --preset empty-catch --root ./src
node <SKILL_DIR>/scripts/ast/search.js -p 'console.log($$$ARGS)' --root ./src --json

# triage scan artifact trees
node <SKILL_DIR>/scripts/ast/tree-search.js -i .octocode/scan -k FunctionDeclaration
```

### 5) OUTPUT + VALIDATE (L)
Read in this order:
1. `summary.md`
2. `findings.json`
3. pillar files (`architecture.json`, `code-quality.json`, `dead-code.json`, optional `security.json`, `test-quality.json`)
4. `file-inventory.json`

Validate findings before presenting:
1. run suggested `lspHints[]` if present
2. inspect code content at flagged location
3. trace references/callers
4. prove structure with AST search when needed
5. rate each item: `confirmed` / `dismissed` / `uncertain`

### 6) PLAN (M/L)
Build implementation plan with explicit risk fields per change:
- target file/symbol
- intended change
- production blast radius (consumer count)
- test coverage status
- risk level and rollout strategy

Required checks before changing shared contracts:
- production references count
- test references count
- cycle/hotspot involvement (for L)

Decision thresholds:
- `>20` production consumers: high-risk path (incremental/flagged rollout)
- `0` test refs for changed behavior: add tests first

### 7) IMPLEMENT
- S: direct fix + quick verification.
- M: test-first for changed behavior, then implementation.
- L: strict TDD loop + scoped re-scan before finalizing.

Always avoid introducing:
- `any`
- empty catches
- debug logging in production paths

### 8) VERIFY
Minimum by size:
- S: lint + relevant tests
- M: lint + tests + build
- L: lint + tests + build + scoped no-cache re-scan + semantic symbol checks

For L tasks, provide before/after delta (finding count and severity trend).

## Output quality standard
Every report should be:
- evidence-based (tool output + code proof)
- prioritized (risk + impact)
- explicit about uncertainty
- actionable (exact files/symbols + next steps)

## Hard rules (forbidden)
- Present unvalidated scan findings as facts.
- Guess `lineHint`.
- Use `lspCallHierarchy` for non-function symbols.
- Run broad refactors from one noisy signal.
- Modify code without user approval when explicit approval is expected.
- Skip blast-radius checks on shared symbols (M/L).

## Error recovery
| Problem | Recovery |
|---------|----------|
| 0 findings | relax scope/features; inspect parse errors in `summary.md` |
| LSP unavailable | switch to CLI-only mode; reduce confidence claims |
| AST search no matches | widen root/pattern or switch kind/preset |
| scan vs LSP mismatch | report both; treat as uncertain until resolved |
| huge findings file | triage via `summary.md` first, then filter with `jq` |

## References
- [Tool workflows](./references/tool-workflows.md)
- [CLI reference](./references/cli-reference.md)
- [Output files](./references/output-files.md)
- [AST reference](./references/ast-reference.md)
- [Validation playbooks](./references/validation-playbooks.md)

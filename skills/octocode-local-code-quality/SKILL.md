---
name: octocode-local-code-quality
description: "Scan TS/JS codebases for architecture rot, code quality, security risks, dead code, test quality, and performance patterns. Use for: audit code, check architecture, find cycles, trace flows, dead exports, complexity, security review, input validation, test coverage gaps, performance issues, duplicate code. Produces validated findings with file:line evidence and a prioritized improvement plan."
compatibility: "Requires Node.js >= 18. Works with any AI coding agent. Best with Octocode MCP local + LSP tools for hybrid validation. Pre-built scripts only; no install or build step required."
---

# Octocode Local Code Quality

Use this skill to turn scan output into reliable engineering guidance.

The scanner is a hypothesis generator, not a source of truth. Start from the CLI output files, validate important findings with Octocode local and LSP tools, then produce an improvement plan. When both CLI evidence and MCP/LSP validation are available, prefer the hybrid flow because it reduces false positives and usually gives better recommendations.

## Working Principles

- Treat scan findings as leads that need confirmation before you present them as facts.
- Check the generated output files from CLI usage, not just terminal output.
- Read `summary.md` like the control panel for the scan: start with scope, health scores, severity ordering, analysis signals, hotspots, and recommended validation before drilling into raw JSON.
- Let the investigation adapt to the problem: architecture issues may need graph evidence, while code-quality and security issues often need semantic validation.
- Prefer hybrid validation when available:
  - CLI gives broad structural coverage and scan context.
  - `localSearchCode` anchors the claim in the live codebase.
  - LSP tools confirm symbol usage, call paths, and real behavior.
- Use `--help` and the reference docs for detailed flags, categories, and presets instead of restating them in the response.

## Workflow

### Step 1. Get Scan Context

If the user already ran the CLI, inspect the latest `.octocode/scan/<timestamp>/` output directory first. Re-run the scan only when outputs are missing, stale, or too narrow for the question.

Default entry point:

```bash
node <SKILL_DIR>/scripts/run-scan.js [flags]
```

Useful starting point:

```bash
node <SKILL_DIR>/scripts/run-scan.js --graph --flow
```

Use `--help` when you need the exact flag list or a narrower preset.

### Step 2. Check Output Files

Read `summary.md` first. Then pull in only the files that help answer the current question.

How to read `summary.md`:

- use it to identify the worst area before opening any JSON
- note scope, health scores, and severity ordering to understand whether the problem is isolated or systemic
- read the analysis signals section for the strongest graph signal, strongest AST signal, combined interpretation, confidence, and recommended validation
- use hotspots and recommendations to decide where deeper validation is worth the time

Commonly useful outputs:

- `summary.md` for the top-level story, health scores, and severity ordering
- `findings.json` for the raw finding set
- pillar files such as `architecture.json`, `code-quality.json`, `dead-code.json`, `security.json`, or `test-quality.json` for focused investigation
- `file-inventory.json` to understand hotspots and file-level context
- `ast-trees.txt` for a searchable AST snapshot you can inspect with the AST-tree CLI before you move to source-level validation
- `graph.md` when the architecture story depends on dependency structure

Do not jump from a single finding directly to a fix. Use the output files to understand pattern density, related files, and whether multiple signals point to the same area.

Use `ast-trees.txt` for simple structure-first exploration after it is generated. It is a plain text artifact, so you can search it with the dedicated AST-tree CLI first and fall back to `rg` only when you need raw indentation or text checks.

- which files have large or deeply nested trees
- whether a file contains many functions, classes, or control-flow nodes
- where a suspicious file deserves deeper source-level validation

Use `ast-tree-search.js` when you want to search the generated `ast-trees.txt` artifact from a specific scan.
Use `ast-search.js` when you need structural matching against the actual source code.
Do not point `ast-search.js` at `.octocode/scan/...` output files like `ast-trees.txt`; it searches source files, not generated AST text artifacts.

### Step 3. Triage Before Validating

Decide what deserves deeper work first:

- findings with high severity or repeated occurrence
- clusters in the same file, package, or call path
- security findings and behavior-sensitive findings
- architecture signals that line up with hotspots or high fan-in / fan-out

At this stage, keep a distinction between:

- `observed`: what the scan output explicitly shows
- `suspected`: what you infer from combined signals
- `validated`: what Octocode tools confirm in the code

### Step 4. Validate with a Hybrid Flow

Prefer this order when Octocode MCP tools are available:

1. Use CLI output files to understand the finding and the surrounding context.
2. Use `localSearchCode` to anchor the finding in the current code and get reliable line hints.
3. Use LSP tools such as `lspGotoDefinition`, `lspFindReferences`, and `lspCallHierarchy` to confirm semantics, usage, and reachability.
4. Use CLI structural tools again when you need broader pattern confirmation or want to re-scan a narrowed scope after changes.

Typical structural follow-up:

```bash
node <SKILL_DIR>/scripts/ast-search.js [options]
```

Typical AST snapshot queries:

```bash
node <SKILL_DIR>/scripts/ast-tree-search.js -i <CURRENT_SCAN>/ast-trees.txt -k function_declaration --limit 25
node <SKILL_DIR>/scripts/ast-tree-search.js -i <CURRENT_SCAN>/ast-trees.txt --file 'src/index' -k ClassDeclaration --limit 10
node <SKILL_DIR>/scripts/ast-tree-search.js -i <CURRENT_SCAN>/ast-trees.txt -p 'IfStatement|SwitchStatement|ForStatement|WhileStatement' --limit 25
```

Prefer the current scan path from `summary.md` so you do not accidentally inspect the wrong run.
If you only need raw text filtering, `rg` against the pinned `ast-trees.txt` path is still fine as a fallback.

Typical narrowed re-scan:

```bash
node <SKILL_DIR>/scripts/index.js --scope=<path> [flags]
```

Use hybrid validation by default because it lowers false positives:

- CLI is good at surfacing patterns and breadth.
- LSP is good at proving whether the pattern actually matters.
- Together they help separate true issues from superficial matches.

Important rule: security findings, data-flow concerns, and behavior claims should not be treated as confirmed without semantic validation when LSP tools are available.

### Step 5. Present Findings Carefully

When you report findings:

- present only validated claims as facts
- keep unvalidated items labeled as hypotheses or follow-up checks
- include `file:line` evidence
- explain why the issue matters, not just what was matched
- mention confidence, especially when the evidence is mixed

Good output shape:

- what the scan suggested
- what the hybrid validation confirmed or disproved
- what remains uncertain
- what change would reduce risk or improve maintainability

### Step 6. Output an Improvement Plan

End with a concrete improvement plan, not just a list of issues.

The plan should be prioritized and practical:

1. Immediate fixes for validated high-signal problems
2. Short follow-up checks for important but not yet fully proven issues
3. Structural improvements for recurring patterns or architectural pressure
4. Re-scan scope and validation steps to confirm the outcome

A good plan names the target files or areas, the reason for each change, the expected benefit, and the evidence level behind it.

## Tool Strategy

Choose the lightest strategy that still gives reliable conclusions:

- `Hybrid`: preferred whenever Octocode local + LSP tools are available
- `CLI-first`: useful when scan output already gives strong context and you only need targeted validation
- `CLI-only`: fallback when MCP/LSP tools are unavailable

Let the problem drive the tool choice. The skill should guide the agent, not force a rigid sequence when a simpler path is enough.

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
- [Validation and investigation](./references/validate-investigate.md)
- [Playbooks](./references/playbooks.md)
- [Finding categories](./references/finding-categories.md)
- [AST search](./references/ast-search.md)
- [Concepts](./references/concepts.md)
- [Improvement roadmap](./references/improvement-roadmap.md)

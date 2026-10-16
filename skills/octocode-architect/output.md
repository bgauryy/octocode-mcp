# Output

Task content only: no probe output or process metadata.

## Response

BLUF: decision or finding and confidence first, then affected boundary, evidence, tradeoffs, limits, next check.

## Decision record

Consequential work only; material slots, any layout; Mermaid for wiring of 3+ hops, candidate edges marked. Each recommendation carries its because (evidence) and the check that would change it.
- Decision (ADR): context, decision, status (header `status`), consequences.
- Low-risk change: slice, impact, verify.
- Plan: slice, wiring (source -> transform -> boundary -> sink), scope, interface and invariants, contract and data flow, tests as `Check: given <state>, when <action>, then <result>` from the first failing case (absent, concurrent, replay), blast radius, rollout and revert, rejected options. Risky plan: optional Premortem (assume it failed; list reasons independently).
- Review: one major objection (blocks; states the consequence) or none, concerns (non-blocking), verification, verdict (block or approve).
- Material replan or unresolved verification: After Action Review: intended, happened, why different or still unknown, next check; follow [workflow recovery](../octocode-workflows/references/verification.md#diagnose-and-replan-from-evidence).
- Architecture findings, as needed: model, finding (boundary -> mechanism -> impact -> proof) with its [hypothesis-test result](SKILL.md#steps) and confidence, alternatives, refactor (seam, slices, preserved contract, rollback), hot path (workload, baseline, attributed cost).
- Deep review: critical paths and reviewed concerns, healthy invariants to preserve, proven defects and candidates, AST/LSP coverage limits, runtime evidence, measured efficiency and memory where relevant, and justified keep/delete/unify decisions. Do not assign health or efficiency from source shape alone.

When a workflow is selected, use its [coverage ledger](../octocode-workflows/references/verification.md#keep-one-compact-coverage-ledger) for working state and resume. Final results summarize the verified scope, failed or unverified checks, and remaining work; keep process identities and handoff bookkeeping in linked scratch evidence.

## Saved result

Keep approved edits in the source tree. Save notes at `<workspace>/.octocode/octocode-architect/<YYYY-MM-DD>-<slug>.md` (`<workspace>`: repository root, else current directory; never inside an existing `.octocode/`). A user- or parent-named path wins; a scratch folder does not (link from there).

## Saved report

Save and render a result with a table, a diagram, 40+ lines, or 5+ findings, or when the user or `AGENTS.md` asks; otherwise answer in chat.

Start the file with this header, one value per line: `status` (one listed word) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`).

```yaml
---
status: Proposed | Accepted | Needs work
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Follow the header with the `#` title and a lead paragraph that states the answer. Put findings under `## Findings` in one table, most severe first, then add `## Decision` and `## Checks`:

| Location | Finding | Boundary | Consequence | Confidence | Change |
|---|---|---|---|---|---|

Confidence: `high`, `medium`, or `low`; a candidate gets `low` and a Finding starting `Unproven:`.

Date the file name with `date +%F`; one report, one `.md`. Render, fix every `warning:` line, and reply with a summary and the `.html` and `.md` paths:

```bash
node <skill-folder>/scripts/render-report.mjs <saved.md>
```

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

`<skill-folder>` holds this file; `--open` only when asked. Pass `<workspace>/.octocode/octocode-architect` to list only this skill's reports; read their Markdown, not HTML. Re-render after edits.

Evidence and visuals: back every claim with its evidence (a `path:line` reference, a command and its result, or a source link), and show shaped data (shares, scores, trends, trade-offs, flows) as a chart or diagram, not prose.

Charts: a `flowchart` of modules and dependency direction, changed part highlighted; a `quadrantChart` of refactor options by impact and effort.

Markdown that renders well: `##` sections; tables with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (shown as a colored chip); `> [!WARNING]` alerts for risks; task lists for next steps; `mermaid` flows (`flowchart`, `sequenceDiagram`, `timeline`, `gantt`) and charts (`pie`, `xychart-beta`, `quadrantChart`, `radar-beta`); code references as `` `path/to/file.ts:42` ``; source links with a short label.

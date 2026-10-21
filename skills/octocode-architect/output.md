# Output

<!-- report-contract {"statuses":["Proposed","Accepted","Needs work"],"required":["Findings","Decision","Checks"],"anyOf":[]} -->

Task content only: no probe output or process metadata.

## Response

BLUF: decision or finding and confidence first, then affected boundary, evidence, tradeoffs, limits, next check.

## Decision record

Consequential work only; material slots, any layout; Mermaid for wiring of 3+ hops, candidate edges marked. Claim–evidence: each recommendation sits beside its evidence and the check that would change it.
- Decision (ADR): context, decision, status (header `status`), consequences.
- Low-risk change: slice, impact, verify.
- Plan: slice, wiring (source -> transform -> boundary -> sink), scope, interface and invariants, contract and data flow, tests as Given–When–Then (given <state>, when <action>, then <result>) from the first failing case (absent, concurrent, replay), blast radius, rollout and revert, rejected options. Risky plan: optional Premortem (assume it failed; list reasons independently).
- Review, Objection vs concern: one major objection (blocks; states the consequence) or none, concerns (non-blocking); then verification, verdict (block or approve).
- Material replan or unresolved verification: After Action Review: intended, happened, why different or still unknown, next check; follow [workflow recovery](../octocode-workflows/references/verification.md#diagnose-and-replan-from-evidence).
- Architecture findings, as needed: model, finding (boundary -> mechanism -> impact -> proof) with its [hypothesis-test result](SKILL.md#steps) and confidence, alternatives, refactor (seam, slices, preserved contract, rollback), hot path (workload, baseline, attributed cost).
- Deep review: critical paths and reviewed concerns, healthy invariants to preserve, proven defects and candidates, AST/LSP coverage limits, runtime evidence, measured efficiency and memory where relevant, and justified keep/delete/unify decisions. Do not assign health or efficiency from source shape alone.

When a workflow is selected, use its [coverage ledger](../octocode-workflows/references/verification.md#keep-one-compact-coverage-ledger) for working state and resume. Final results (BLUF) summarize the verified scope, failed or unverified checks, and remaining work; keep process identities and handoff bookkeeping in linked scratch evidence.

## Saved result

Keep approved edits in the source tree. Save notes at `<workspace>/.octocode/octocode-architect/<YYYY-MM-DD>-<slug>.md` (`<workspace>`: repository root, else current directory; never inside an existing `.octocode/`). A user- or parent-named path wins; a scratch folder does not (link from there).

## Presentation choices

Decision → boundary and evidence → alternatives → checks. Separate confirmed edges from candidate relationships.

| Format | Use when / why |
|---|---|
| `C4Context` / `C4Container` / `C4Component` | Explain one abstraction level at a time. |
| `flowchart` / `sequenceDiagram` / `architecture-beta` | Show dependencies / runtime calls / deployment topology. |
| `graph` / comparison table | Explore larger networks / compare consequences and tradeoffs; the specialized architecture viewer owns scan/model exploration. |

Follow the [shared visual-first, content-only rules](references/report-output.md#choose-the-format), including image embedding and iframe alternatives; load the [Mermaid chooser](references/report-mermaid.md) for specialized syntax or [widget schemas](references/report-widgets.md) before authoring graph/chart JSON.

## Saved report

Save and render a result with a table, a diagram, 40+ lines, or 5+ findings, or when the user or `AGENTS.md` asks; otherwise answer in chat.

Use the [shared header rules](references/report-output.md#report-header) with these skill-specific status values:

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

Follow [shared report guidance](references/report-output.md) for rendering, `--manifest`, evidence, diagrams, and presentation.

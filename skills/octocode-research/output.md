# Output

<!-- report-contract {"statuses":["Confirmed","Likely","Refuted","Open"],"required":["Answer","Scope","Evidence","Gaps","Checks"],"anyOf":[]} -->

Task content only; no probe output or process metadata. Plain text or Markdown with source links; tables only to compare evidence.

## Response

BLUF with Claim–evidence: answer and confidence first, then each claim beside its exact source anchor, limits (material coverage gaps), next check only if needed. Add by result kind:

| Result | Adds |
|---|---|
| Decision | verdict, risk, verification |
| Root cause | cause, affected contract, fix, verification |
| Refactor | mode and tier, invariants, changes, and verification commands with exit codes |

## Saved result

Reports: `<workspace>/.octocode/octocode-research/<YYYY-MM-DD>-<slug>.md`; intermediate files in its `tmp/`. `<workspace>` = repository root, else the current directory, never a folder inside `.octocode/`. A user-named path wins; a scratch folder such as `.octocode/tmp/` does not (save here, link from scratch notes).

## Presentation choices

Answer → scope → claim-linked evidence → gaps → checks. Separate observed behavior from inference.

| Format | Use when / why |
|---|---|
| `flowchart` / `sequenceDiagram` | Trace a verified dependency path / runtime interaction, with source anchors nearby. |
| `timeline` / `gitGraph` | Explain relevant chronology / branch history supported by repository evidence. |
| Evidence table / `graph` | Compare conflicting sources / inspect a larger relationship network; label unconfirmed edges. |

Follow the [shared visual-first, content-only rules](references/report-output.md#choose-the-format), including image embedding and iframe alternatives; load the [Mermaid chooser](references/report-mermaid.md) for specialized syntax or [widget schemas](references/report-widgets.md) before authoring graph/chart JSON.

## Saved report

Save and render when the result has a table, a diagram, over ~40 lines or five findings, or the user asks; else answer in chat. Save every result when the user or project instructions say so.

Use the [shared header rules](references/report-output.md#report-header) with these skill-specific status values:

```yaml
---
status: Confirmed | Likely | Refuted | Open
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Follow the header with the `#` title and a lead paragraph that states the answer. Always include, in this order, `## Answer` (the direct answer and its confidence), `## Scope` (repositories, refs, and paths covered), `## Evidence` (Claim–evidence: each claim beside its exact source anchor; only what the sources show), `## Gaps` (Facts–assumptions–unknowns: unread or unproven parts, and any assumption marked as one), and `## Checks` (what ran and its result). Add `## Next` only when something is pending.

Follow [shared report guidance](references/report-output.md) for rendering, `--manifest`, evidence, diagrams, and presentation.

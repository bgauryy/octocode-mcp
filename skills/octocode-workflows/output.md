# Output

<!-- report-contract {"statuses":["Proposed","Accepted","Needs work"],"required":["Evidence","Limits"],"anyOf":[["Selection","Completion"]]} -->

Return task content, not a worker roster or transcript. A domain owner's output format wins.

## Response

Lead with the conclusion (BLUF), then claim–evidence and limits.

For workflow selection: primary workflow, why it fits, orchestrator and actor duties (RACI), owner skills, next check, and limits.

For completion: result and confidence first; then verified scope, decisive evidence, changed or observed boundary, failed/unverified/stale work, and next action. The orchestrator merges raw actor observations into the sole ledger; do not present a message delivery as verified work.

## Presentation choices

Selection or completion → decisive evidence → limits and next action. The domain owner’s artifact format wins.

| Format | Use when / why |
|---|---|
| `flowchart` / `agentflow-beta` | Explain branches, recovery and agent/tool steps. |
| `swimlane-beta` / `sequenceDiagram` | Show responsibility boundaries / ordered handoffs and acknowledgements. |
| Acceptance table / linked ledger | Distinguish verified, failed and pending work without copying process logs. |

Follow the [shared visual-first, content-only rules](references/report-output.md#choose-the-format), including image embedding and iframe alternatives; load the [Mermaid chooser](references/report-mermaid.md) for specialized syntax or [widget schemas](references/report-widgets.md) before authoring graph/chart JSON.

## Saved report

Save a workflow selection, handoff, or multi-file completion report at `<workspace>/.octocode/octocode-workflows/<YYYY-MM-DD>-<slug>.md` when the user requests it or it needs durable resume evidence. Working ledgers and captures belong under that task's `tmp/`; reuse an existing ledger rather than moving it.

Use the [shared header rules](references/report-output.md#report-header) with these skill-specific status values:

```yaml
---
status: Proposed | Accepted | Needs work
confidence: high | medium | low
question: <workflow goal>
next: <one next action>
---
```

Include `## Selection` or `## Completion`, `## Evidence`, and `## Limits`. The ledger may be linked, not copied. A saved handoff is a Handoff packet: current state and next action under `## Completion`, evidence anchors under `## Evidence`, blockers and constraints under `## Limits`, and the header's `next`.

Follow [shared report guidance](references/report-output.md) for rendering, `--manifest`, evidence, diagrams, and presentation.

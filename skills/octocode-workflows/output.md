# Output

Return task content, not a worker roster or transcript. A domain owner's output format wins.

## Response

For workflow selection: primary workflow, why it fits, orchestrator and actor duties, owner skills, next check, and limits.

For completion: result first; then verified scope, decisive evidence, changed or observed boundary, failed/unverified/stale work, and next action. The orchestrator merges raw actor observations into the sole ledger; do not present a message delivery as verified work.

## Saved report

Save a workflow selection, handoff, or multi-file completion report at `<workspace>/.octocode/octocode-workflows/<YYYY-MM-DD>-<slug>.md` when the user requests it or it needs durable resume evidence. Working ledgers and captures belong under that task's `tmp/`; reuse an existing ledger rather than moving it.

Start the file with this header, one value per line: `status` (one listed word) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`).

```yaml
---
status: Proposed | Accepted | Needs work
confidence: high | medium | low
question: <workflow goal>
next: <one next action>
---
```

Include `## Selection` or `## Completion`, `## Evidence`, and `## Limits`. The ledger may be linked, not copied.

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

Render a report with the synchronized renderer:

```bash
node <skill-folder>/scripts/render-report.mjs <saved.md>
```

`--open` only when asked. Re-render after edits and report the Markdown and HTML paths.

Evidence and visuals: back every claim with its evidence (a `path:line` reference, a command and its result, or a source link), and show shaped data (shares, scores, trends, trade-offs, flows) as a chart or diagram, not prose.

Markdown that renders well: `##` sections; tables with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (shown as a colored chip); `> [!WARNING]` alerts for risks; task lists for next steps; `mermaid` flows (`flowchart`, `sequenceDiagram`, `timeline`, `gantt`) and charts (`pie`, `xychart-beta`, `quadrantChart`, `radar-beta`); code references as `` `path/to/file.ts:42` ``; source links with a short label.

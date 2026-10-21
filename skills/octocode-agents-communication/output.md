# Output

<!-- report-contract {"statuses":["Resolved","Waiting","Blocked"],"required":["Outcome","Pending"],"anyOf":[]} -->

Task content only, never probe output or process metadata; plain text or Markdown (`/cli <command> --json` for machine-readable output).

## Response

BLUF: Outcome first, then any pending conflict and who must act; message and lease identifiers stay in the protocol.

## Saved result

Report path: `<workspace>/.octocode/octocode-agents-communication/<YYYY-MM-DD>-<slug>.md` (`<workspace>` = repository root, else current directory; never a folder inside an existing `.octocode/`). A user-named path wins; a harness or subagent scratch folder does not (save here, link from scratch notes).

## Presentation choices

Outcome → unresolved conflict → responsible actor and next action. Keep protocol identifiers only where someone needs them to act.

| Format | Use when / why |
|---|---|
| `sequenceDiagram` | Explain message order, acknowledgements and retries. |
| `swimlane-beta` | Clarify responsibility and handoffs across agents. |
| Pending-item table | Make blockers and ownership actionable; link detailed records instead of pasting logs. |

Follow the [shared visual-first, content-only rules](references/report-output.md#choose-the-format), including image embedding and iframe alternatives; load the [Mermaid chooser](references/report-mermaid.md) for specialized syntax or [widget schemas](references/report-widgets.md) before authoring graph/chart JSON.

## Saved report

The caller-selected database, not the report, holds messages and evidence; a chat summary naming `activity`, `locks`, or `view` usually suffices. Save and render a report when the outcome spans several agents or open conflicts, the user asks for multi-agent status, or instructions (e.g. `AGENTS.md`) say to keep every result.

Use the [shared header rules](references/report-output.md#report-header) with these skill-specific status values:

```yaml
---
status: Resolved | Waiting | Blocked
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Then a `#` title and a lead paragraph stating the answer. Always include `## Outcome` and `## Pending` (write `None.` when nothing is open), with one row per open item:

| Item | Conflict or blocker | Who acts |
|---|---|---|

Plain-word item names; a message or lease identifier only when another agent must act on it.

Follow [shared report guidance](references/report-output.md) for rendering, `--manifest`, evidence, diagrams, and presentation.

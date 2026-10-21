# Output

<!-- report-contract {"statuses":["Done","Partial"],"required":["Removed","Deferred","Checks"],"anyOf":[]} -->

## Response

BLUF: outcome first, then removed or consolidated items as claim–evidence (proof of redundancy, behavior preserved), checks run, uncertain deferrals. Markdown, task content only (no probe output or process metadata); the source diff is the implementation.

## Saved result

Approved edits stay in place. Report: `<workspace>/.octocode/octocode-clean-agentic-code/<YYYY-MM-DD>-<slug>.md`; `<workspace>` = repository root, else current directory, never inside an existing `.octocode/`. A user- or parent-named path wins; harness or subagent scratch folders do not (link from scratch notes).

## Presentation choices

Removed or consolidated items → proof → preserved behavior → deferred candidates and checks.

| Format | Use when / why |
|---|---|
| Short evidence table / `diff` fence | Tie each removal to proof and its behavior check; show focused changes. |
| `flowchart` | Explain ownership or dependency changes when the refactor is hard to follow. |
| `chart` bar | Compare measured size or runtime before/after; fewer lines alone do not prove better quality. |

Follow the [shared visual-first, content-only rules](references/report-output.md#choose-the-format), including image embedding and iframe alternatives; load the [Mermaid chooser](references/report-mermaid.md) for specialized syntax or [widget schemas](references/report-widgets.md) before authoring graph/chart JSON.

## Saved report

Save and render on a table, diagram, over ~40 lines or five findings, or user request; else answer briefly in chat. Save every result when user or project instructions say so.

Use the [shared header rules](references/report-output.md#report-header) with these skill-specific status values:

```yaml
---
status: Done | Partial
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Then the `#` title and a lead paragraph stating the answer. Always include `## Removed`, `## Deferred`, and `## Checks` (write `None.` under an empty one), with these tables under the first two (Removed rows are claim–evidence; Deferred rows are unresolved hypothesis tests, each with the check that would settle it):

| Path | Change | Proof of redundancy | Behavior check |
|---|---|---|---|

| Item | Why deferred | What would settle it |
|---|---|---|

End `## Checks` with the change command, such as `git diff -- <paths>`.

Follow [shared report guidance](references/report-output.md) for rendering, `--manifest`, evidence, diagrams, and presentation.

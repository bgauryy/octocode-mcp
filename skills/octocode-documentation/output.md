# Output

Task content only: no probe output, process metadata, or narration. Match the requested format and repo conventions; reviews in Markdown.

## Response

The document, or a review: BLUF verdict, then findings as [review comments](references/style-guide.md#review-procedure) with their claim and link checks.

## Saved result

| Result | Location |
|---|---|
| Shipped document (README, guide, ADR) | The requested path or project docs location |
| Review, audit, or draft with no named destination | `<workspace>/.octocode/octocode-documentation/<YYYY-MM-DD>-<slug>.md` |

A user-named path wins.

## Saved report

Save and render a review, audit, or draft when it has a table, a diagram, over ~40 lines, or five findings, or when asked. Keep every result when instructions say so.

Start the file with this header, one value per line: `status` (one listed word) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`).

```yaml
---
status: Needs work | Ready
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Open the `#` title with a lead stating the answer.

| Saved report | After the lead | Then |
|---|---|---|
| Review | `## Findings`: one table, most severe first | `## Unverified`: facts that still need a check |
| Draft | The document | `## Destination` (where it ships), then `## Unverified` |

Every saved report has either `## Findings` (a review) or `## Destination` (a draft). The findings table:

| Location | Issue | Correction | Severity | Verified |
|---|---|---|---|---|

Severity: `Critical`, `High`, `Medium`, `Low`; `Verified`: `Yes` or `No`.

Date the file name with `date +%F`. Render, fix every `warning:` line, and reply with a short summary and the `.html` and `.md` paths:

```bash
node <skill-folder>/scripts/render-report.mjs <saved.md>
```

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

`<skill-folder>` holds this file; `--open` only when asked. `<workspace>/.octocode/octocode-documentation` lists only this skill's reports; read their Markdown, not HTML. Re-render after edits.

Evidence and visuals: back every claim with its evidence (a `path:line` reference, a command and its result, or a source link), and show shaped data (shares, scores, trends, trade-offs, flows) as a chart or diagram, not prose.

Charts: a `flowchart` of the process or reader path; a `pie` of findings by kind.

Markdown that renders well: `##` sections; tables with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (shown as a colored chip); `> [!WARNING]` alerts for risks; task lists for next steps; `mermaid` flows (`flowchart`, `sequenceDiagram`, `timeline`, `gantt`) and charts (`pie`, `xychart-beta`, `quadrantChart`, `radar-beta`); code references as `` `path/to/file.ts:42` ``; source links with a short label.

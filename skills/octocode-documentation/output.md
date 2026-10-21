# Output

<!-- report-contract {"statuses":["Needs work","Ready"],"required":["Unverified"],"anyOf":[["Findings","Destination"]]} -->

Task content only: no probe output, process metadata, or narration. Match the requested format and repo conventions; reviews in Markdown.

## Response

The document, or a review: BLUF verdict, then findings as [review comments](references/style-guide.md#review-procedure) with their claim and link checks.

## Saved result

| Result | Location |
|---|---|
| Shipped document (README, guide, ADR) | The requested path or project docs location |
| Review, audit, or draft with no named destination | `<workspace>/.octocode/octocode-documentation/<YYYY-MM-DD>-<slug>.md` |

A user-named path wins.

## Presentation choices

Preserve the shipped document’s natural structure. For reviews, lead with the verdict, then corrections and unverified claims; do not force a taxonomy.

| Format | Use when / why |
|---|---|
| Numbered steps / language-tagged fences | Teach procedures with prerequisites and expected results beside commands. |
| `flowchart` / `sequenceDiagram` / `erDiagram` | Explain decisions / interactions / data relationships that prose alone obscures. |
| Markdown images / comparison tables | Show relevant UI states / compare options; keep screenshots captioned and long explanations outside table cells. |

Follow the [shared visual-first, content-only rules](references/report-output.md#choose-the-format), including image embedding and iframe alternatives; load the [Mermaid chooser](references/report-mermaid.md) for specialized syntax or [widget schemas](references/report-widgets.md) before authoring graph/chart JSON.

## Saved report

Save and render a review, audit, or draft when it has a table, a diagram, over ~40 lines, or five findings, or when asked. Keep every result when instructions say so.

Use the [shared header rules](references/report-output.md#report-header) with these skill-specific status values:

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

Follow [shared report guidance](references/report-output.md) for rendering, `--manifest`, evidence, diagrams, and presentation.

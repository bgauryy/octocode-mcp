# Output

<!-- report-contract {"statuses":["Keep","Accept","Revert","Inconclusive","Invalid"],"required":["Question","Conditions","Results","Guardrails","Limits","Decision"],"anyOf":[]} -->

Task content only: no probe output, traces, receipts, run IDs, or process metadata. Lead with the verdict; visualize metric comparisons and retain exact values in tables. Machine results stay JSON or JSONL.

## Response

BLUF: result and confidence, then question, checks, limits, next check; a comparison adds baseline and candidate conditions (scope, budget), metrics, guardrails, uncertainty, coverage, failures, cost.

## Saved result

Save and link run evidence at `<workspace>/.octocode/octocode-eval-benchmark/<YYYY-MM-DD>-<slug>/`, never inside the installed skill. `<workspace>`: repository root, else current directory, never inside an existing `.octocode/`. A user-named path wins; a scratch folder (`.octocode/tmp/`) does not: save here, link from scratch notes.

## Presentation choices

Question and conditions → results → guardrails and limits → decision. Keep baseline and candidate comparable.

| Format | Use when / why |
|---|---|
| `chart` bar or line | Compare measured outcomes / ordered observations; label units, sample size and uncertainty nearby. |
| Metric tables | Expose exact values, failures and split coverage; distinguish development from held-out results. |
| Linked JSON/JSONL or CSV | Preserve reusable raw results without duplicating them in the report. |

Follow the [shared visual-first, content-only rules](references/report-output.md#choose-the-format), including image embedding and iframe alternatives; load the [Mermaid chooser](references/report-mermaid.md) for specialized syntax or [widget schemas](references/report-widgets.md) before authoring graph/chart JSON.

## Saved report

Save every run, even a smoke test, with `README.md` as entry point.

Use the [shared header rules](references/report-output.md#report-header) with these skill-specific status values:

```yaml
---
status: Keep | Accept | Revert | Inconclusive | Invalid
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Then the `#` title and a lead paragraph stating the answer. Always include `## Question`, `## Conditions`, `## Results`, `## Guardrails`, `## Limits`, and `## Decision`, with a metric table per split under Results. `Keep` marks development evidence. Link JSON or JSONL results in `dev/` and `held-out/`; don't paste them.

Follow [shared report guidance](references/report-output.md) for rendering, `--manifest`, evidence, diagrams, and presentation.

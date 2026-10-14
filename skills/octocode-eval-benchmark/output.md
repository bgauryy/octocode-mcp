# Output

Task content only: no probe output, traces, receipts, run IDs, or process metadata. Verdict and metrics in Markdown tables; machine results stay JSON or JSONL.

## Response

BLUF: result and confidence, then question, checks, limits, next check; a comparison adds baseline and candidate conditions (scope, budget), metrics, guardrails, uncertainty, coverage, failures, cost.

## Saved result

Save and link run evidence at `<workspace>/.octocode/octocode-eval-benchmark/<YYYY-MM-DD>-<slug>/`, never inside the installed skill. `<workspace>`: repository root, else current directory, never inside an existing `.octocode/`. A user-named path wins; a scratch folder (`.octocode/tmp/`) does not: save here, link from scratch notes.

## Saved report

Save every run, even a smoke test, with `README.md` as entry point.

Start the file with this header, one value per line: `status` (one listed word) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`).

```yaml
---
status: Keep | Accept | Revert | Inconclusive | Invalid
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Then the `#` title and a lead paragraph stating the answer. Always include `## Question`, `## Conditions`, `## Results`, `## Guardrails`, `## Limits`, and `## Decision`, with a metric table per split under Results. `Keep` marks development evidence. Link JSON or JSONL results in `dev/` and `held-out/`; don't paste them.

Date the folder with `date +%F`. Render, fix every `warning:` line, and reply with a summary plus the `.html` and `README.md` paths:

```bash
node <skill-folder>/scripts/render-report.mjs <run-folder>
```

`<skill-folder>` holds this file. Pass `--open` only when asked; re-render after Markdown edits.

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

Pass `<workspace>/.octocode/octocode-eval-benchmark` for this skill only; read matches' Markdown, not HTML.

Evidence and visuals: back every claim with its evidence (a `path:line` reference, a command and its result, or a source link), and show shaped data (shares, scores, trends, trade-offs, flows) as a chart or diagram, not prose.

Markdown that renders well: `##` sections; tables with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (shown as a colored chip); `> [!WARNING]` alerts for risks; task lists for next steps; `mermaid` flows (`flowchart`, `sequenceDiagram`, `timeline`, `gantt`) and charts (`pie`, `xychart-beta`, `quadrantChart`, `radar-beta`); code references as `` `path/to/file.ts:42` ``; source links with a short label.

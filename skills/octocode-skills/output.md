# Output

Markdown, task content only. `skill-review.mjs --json` returns `errorCount`, `warnCount`, and per-skill `results` (structural findings, not quality scores); `skill-sync.mjs --json` returns a destination plan or applied results.

## Response

- Review: BLUF readiness verdict; findings as review comments (Conventional Comments): label (issue, suggestion, question, nitpick, praise), blocking or not, file anchor, why (impact, kind); unchecked areas.
- Edits: changed skills, support-file changes, checks run.
- Install: destination, reload step.

## Saved report

Authored skills stay in their canonical folders; a separate review goes to `<workspace>/.octocode/octocode-skills/<YYYY-MM-DD>-<slug>.md` unless the user names a path. Save and render a review, or a multi-file change report, when it has a table, a diagram, over ~40 lines or five findings, or the user asks; keep every result when the user or project instructions say so.

Start the file with this header, one value per line: `status` (one listed word) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`).

```yaml
---
status: Ready | Needs work
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

A lead paragraph under the `#` title states the answer.

Put findings under `## Findings` as one table, most severe first, then add `## Unchecked` for areas that were not reviewed:

| Skill | Location | Finding | Kind | Severity | Fix |
|---|---|---|---|---|---|

`Kind`: `lint`, `editorial`, or `activation`; severity: `Critical`, `High`, `Medium`, or `Low`. A change report has `## Changes`, one row per edited file, ending with the `skill-review.mjs` result. Every saved report has either `## Findings` (a review) or `## Changes` (a change report).

Date the file name with `date +%F`, never from memory. Render, fix every `warning:` line, and reply with a short summary and the `.html` and `.md` paths:

```bash
node <skill-folder>/scripts/render-report.mjs <saved.md>
```

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

`<skill-folder>` holds this file; `--open` only when the user asks. `<workspace>/.octocode/octocode-skills` lists only this skill's reports. Read the Markdown, not the HTML; re-render after edits.

Evidence and visuals: back every claim with its evidence (a `path:line` reference, a command and its result, or a source link), and show shaped data (shares, scores, trends, trade-offs, flows) as a chart or diagram, not prose.

Charts here: `radar-beta` of rating criteria before and after; `pie` of findings by kind.

Markdown that renders well: `##` sections; tables with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (shown as a colored chip); `> [!WARNING]` alerts for risks; task lists for next steps; `mermaid` flows (`flowchart`, `sequenceDiagram`, `timeline`, `gantt`) and charts (`pie`, `xychart-beta`, `quadrantChart`, `radar-beta`); code references as `` `path/to/file.ts:42` ``; source links with a short label.

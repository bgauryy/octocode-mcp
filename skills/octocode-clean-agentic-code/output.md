# Output

## Response

BLUF: outcome first, then removed or consolidated items as claim–evidence (proof of redundancy, behavior preserved), checks run, uncertain deferrals. Markdown, task content only (no probe output or process metadata); the source diff is the implementation.

## Saved result

Approved edits stay in place. Report: `<workspace>/.octocode/octocode-clean-agentic-code/<YYYY-MM-DD>-<slug>.md`; `<workspace>` = repository root, else current directory, never inside an existing `.octocode/`. A user- or parent-named path wins; harness or subagent scratch folders do not (link from scratch notes).

## Saved report

Save and render on a table, diagram, over ~40 lines or five findings, or user request; else answer briefly in chat. Save every result when user or project instructions say so.

Start the file with this header, one value per line: `status` (one listed word) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`).

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

Date the file name with `date +%F`; one report, one `.md`. Render, fix every `warning:` line, reply with a short summary and the `.html` and `.md` paths:

```bash
node <skill-folder>/scripts/render-report.mjs <saved.md>
```

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

`<skill-folder>` holds this file; `--open` only on request; `<workspace>/.octocode/octocode-clean-agentic-code` lists this skill's reports only. Read and edit Markdown, not HTML; re-render after edits.

Evidence and visuals: back every claim with its evidence (a `path:line` reference, a command and its result, or a source link), and show shaped data (shares, scores, trends, trade-offs, flows) as a chart or diagram, not prose.

Charts: `xychart-beta` of lines or files before and after; `pie` of removals by category.

Markdown that renders well: `##` sections; tables with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (shown as a colored chip); `> [!WARNING]` alerts for risks; task lists for next steps; `mermaid` flows (`flowchart`, `sequenceDiagram`, `timeline`, `gantt`) and charts (`pie`, `xychart-beta`, `quadrantChart`, `radar-beta`); code references as `` `path/to/file.ts:42` ``; source links with a short label.

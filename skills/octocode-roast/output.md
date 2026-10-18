# Output

Task content only; no probe output or process metadata. Tone never changes the evidence. Response: BLUF (verdict, worst finding, confidence), then ranked findings in the [finding shape](SKILL.md#flow).

## Saved report

Save and render when the result has a table, diagram, ~40+ lines, or five findings, or when the user or project instructions ask; else answer in chat.

Path: `<workspace>/.octocode/octocode-roast/<YYYY-MM-DD>-<slug>.md`; `<workspace>` is the repo root, else cwd, never inside an existing `.octocode/`. A user-named path wins; scratch folders such as `.octocode/tmp/` do not (link from scratch notes).

Start the file with this header, one value per line: `status` (one listed word) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`).

```yaml
---
status: Blocking | Needs work | Acceptable
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Follow the header with the `#` title and a lead paragraph that states the answer. Put findings under `## Findings` in one table, most severe first, then add `## Fix order` (rows as in [redemption options](references/redemption-flow.md#checkpoint): #1 = do now):

| # | Location | Finding and mechanism | Consequence | Severity | Confidence | Repair |
|---|---|---|---|---|---|---|

Severity: `Critical`, `High`, `Medium`, `Low` ([tier labels](references/sin-catalog.md)); confidence: `high`, `medium`, `low`.

Date the file name with `date +%F`, never from memory; one report is one `.md` file. Render it, fix every `warning:` line, and reply with a summary and the `.html` and `.md` paths:

```bash
node <skill-folder>/scripts/render-report.mjs <saved.md>
```

`<skill-folder>` holds this file; `--open` only on request; re-render after edits.

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

`<workspace>/.octocode/octocode-roast` lists this skill's reports only; read the Markdown, not the HTML.

Evidence and visuals: back every claim with its evidence (a `path:line` reference, a command and its result, or a source link), and show shaped data (shares, scores, trends, trade-offs, flows) as a chart or diagram, not prose.

Charts: `pie` of findings by severity; `xychart-beta` of hottest files by finding count.

Markdown that renders well: `##` sections; tables with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (shown as a colored chip); `> [!WARNING]` alerts for risks; task lists for next steps; `mermaid` flows (`flowchart`, `sequenceDiagram`, `timeline`, `gantt`) and charts (`pie`, `xychart-beta`, `quadrantChart`, `radar-beta`); code references as `` `path/to/file.ts:42` ``; source links with a short label.

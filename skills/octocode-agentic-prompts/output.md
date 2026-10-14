# Output

Deliver task content only; no probe output or process metadata.

## Response

Prompts in the requested format. Edit: full replacement, change summary, verification. Review: affected text, behavioral effect, repair.

A standalone review or new prompt with no destination goes to `<workspace>/.octocode/octocode-agentic-prompts/<YYYY-MM-DD>-<slug>.md`; a user-named path wins; a small chat edit needs no file.

## Saved report

Save and render when the result has a table, a diagram, over ~40 lines or five findings, or the user asks. Keep every result when user or project instructions say so.

Start the file with this header, one value per line: `status` (one listed word) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`).

```yaml
---
status: Ready | Needs work
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Open the `#` title with a lead paragraph that states the answer.

Put findings under `## Findings` as one table, most severe first, with `Critical`, `High`, `Medium`, or `Low` severity. When a rewrite was requested, give the full replacement text in a fenced block under `## Replacement`:

| Location | Text | Behavioral effect | Severity | Repair |
|---|---|---|---|---|

A change report has `## Changes`, one row per edit; every saved report has `## Findings` or `## Changes`.

Date the file name with `date +%F`, never memory. Render, fix every `warning:` line, and reply with a short summary and the `.html` and `.md` paths:

```bash
node <skill-folder>/scripts/render-report.mjs <saved.md>
```

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

`<skill-folder>` holds this file; `--open` only when the user asks; `<workspace>/.octocode/octocode-agentic-prompts` lists only this skill's reports; read Markdown, not HTML. Markdown is the source; re-render after edits.

Evidence and visuals: back every claim with its evidence (a `path:line` reference, a command and its result, or a source link), and show shaped data (shares, scores, trends, trade-offs, flows) as a chart or diagram, not prose.

Charts: a `flowchart` of how an instruction reaches the agent (source, loader, prompt, tool, action), findings marked in place; a `pie` of findings by severity.

Markdown that renders well: `##` sections; tables with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (shown as a colored chip); `> [!WARNING]` alerts for risks; task lists for next steps; `mermaid` flows (`flowchart`, `sequenceDiagram`, `timeline`, `gantt`) and charts (`pie`, `xychart-beta`, `quadrantChart`, `radar-beta`); code references as `` `path/to/file.ts:42` ``; source links with a short label.

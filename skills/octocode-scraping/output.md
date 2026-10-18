# Output

Deliver task content only; no probe output or process metadata. Answers and citations in Markdown; source text, HTML, JSON, and captures stay in session formats ([corpus](references/corpus.md)).

## Response

BLUF: answer and confidence first, then evidence (Claim–evidence: each claim beside its source URL and saved artifact path), pages covered, and blocked or unread portions.

## Saved result

Session pages: `<workspace>/.octocode/octocode-scraping/tmp/<sessionId>/` (`--out` must stay under `<workspace>/.octocode/`). Report: `<workspace>/.octocode/octocode-scraping/<YYYY-MM-DD>-<slug>.md`. `<workspace>` is the project root (repository root, else current directory), never inside an existing `.octocode/`. A user-named path wins; a harness or subagent scratch folder such as `.octocode/tmp/` does not: save here and link from scratch notes.

## Saved report

Save and render when the result has a table, a diagram, over ~40 lines or five findings, or the user or project instructions (`AGENTS.md`) ask; keep a short answer in chat. Link fetched pages and `reports/summary.md`; never paste them.

Start the file with this header, one value per line: `status` (one listed word) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`).

```yaml
---
status: Complete | Partial | Blocked
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Then the `#` title and a BLUF lead paragraph (answer first). Add `session: <workspace-relative session folder>` to the header. Always include `## Answer`, `## Pages covered`, `## Blocked or unread`, and `## Session` (the folder and its `AGENT_INDEX.json`):

| URL | Status | Session file | Notes |
|---|---|---|---|

`## Blocked or unread` is the stop report: a `Partial` result hands over unfinished work as a Handoff packet; a `Blocked` one asks for someone else's action as an SBAR ([recovery](references/recovery.md#on-a-stop)). The header `next` is that report's next action.

Date the file name with `date +%F`, never from memory; one report, one `.md`. Render, fix every `warning:` line, reply with a short summary plus `.html` and `.md` paths:

```bash
node <skill-folder>/scripts/render-report.mjs <saved.md>
```

`<skill-folder>` holds this file. `--open` only on user request. Re-render after Markdown edits.

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

Pass `<workspace>/.octocode/octocode-scraping` to list only this skill's reports; read a match's Markdown, not its HTML.

Evidence and visuals: back every claim with its evidence (a `path:line` reference, a command and its result, or a source link), and show shaped data (shares, scores, trends, trade-offs, flows) as a chart or diagram, not prose.

Charts: a `flowchart` of pages crawled and the path to the answer; a `pie` of page statuses.

Markdown that renders well: `##` sections; tables with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (shown as a colored chip); `> [!WARNING]` alerts for risks; task lists for next steps; `mermaid` flows (`flowchart`, `sequenceDiagram`, `timeline`, `gantt`) and charts (`pie`, `xychart-beta`, `quadrantChart`, `radar-beta`); code references as `` `path/to/file.ts:42` ``; source links with a short label.

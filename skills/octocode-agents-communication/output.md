# Output

Task content only, never probe output or process metadata; plain text or Markdown (`/cli <command> --json` for machine-readable output).

## Response

BLUF: Outcome first, then any pending conflict and who must act; message and lease identifiers stay in the protocol.

## Saved result

Report path: `<workspace>/.octocode/octocode-agents-communication/<YYYY-MM-DD>-<slug>.md` (`<workspace>` = repository root, else current directory; never a folder inside an existing `.octocode/`). A user-named path wins; a harness or subagent scratch folder does not (save here, link from scratch notes).

## Saved report

The caller-selected database, not the report, holds messages and evidence; a chat summary naming `activity`, `locks`, or `view` usually suffices. Save and render a report when the outcome spans several agents or open conflicts, the user asks for multi-agent status, or instructions (e.g. `AGENTS.md`) say to keep every result.

Start the file with this header, one value per line: `status` (one listed word) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`).

```yaml
---
status: Resolved | Waiting | Blocked
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Then a `#` title and a lead paragraph stating the answer. Always include `## Outcome` and `## Pending` (write `None.` when nothing is open), with one row per open item:

| Item | Conflict or blocker | Who acts |
|---|---|---|

Plain-word item names; a message or lease identifier only when another agent must act on it.

Date the name with `date +%F`, never from memory; one report is one `.md` file. Render, fix every `warning:` line, and reply with a short summary and the `.html` and `.md` paths:

```bash
node <skill-folder>/scripts/render-report.mjs <saved.md>
```

`<skill-folder>` holds this file; `--open` only on request. Markdown is the source; re-render after edits.

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

`<workspace>/.octocode/octocode-agents-communication` lists only this skill's; read Markdown, not HTML.

Evidence and visuals: back every claim with its evidence (a `path:line` reference, a command and its result, or a source link), and show shaped data (shares, scores, trends, trade-offs, flows) as a chart or diagram, not prose.

Fitting charts: `sequenceDiagram` of messages, leases, handoffs; `flowchart` of delivery or recovery.

Markdown that renders well: `##` sections; tables with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (shown as a colored chip); `> [!WARNING]` alerts for risks; task lists for next steps; `mermaid` flows (`flowchart`, `sequenceDiagram`, `timeline`, `gantt`) and charts (`pie`, `xychart-beta`, `quadrantChart`, `radar-beta`); code references as `` `path/to/file.ts:42` ``; source links with a short label.

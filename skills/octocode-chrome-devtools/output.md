# Output

## Response

Markdown, task content only. BLUF: the supported finding first, each claim beside its source URL or capture path (Claim–evidence), then the observed post-action state and the coverage gap. No probe output or process metadata.

## Saved result

Captures keep their returned formats (JSON, images) in the runtime folder (normally `<workspace>/.octocode/octocode-chrome-devtools/tmp/`); link large ones, never paste. Reports go to `<workspace>/.octocode/octocode-chrome-devtools/<YYYY-MM-DD>-<slug>.md`; `<workspace>` is the repository root, else cwd, never inside an existing `.octocode/`. A user-named path wins; harness or subagent scratch (`.octocode/tmp/`) does not: save here, link from scratch.

## Saved report

Save and render a result with a table, diagram, 40+ lines, or five findings, or when the user or project instructions ask; short answers stay in chat.

Start the file with this header, one value per line: `status` (one listed word) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`).

```yaml
---
status: Pass | Fail | Partial
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Then a `#` title and a BLUF lead paragraph. Always include `## Finding`, `## Steps`, and `## Gaps` (write `None.` when nothing is missing). Steps is one table:

| # | Action | Observed state | Capture | Result |
|---|---|---|---|---|

Result: `Pass`, `Fail`, or `Partial`. Capture files (screenshots, HAR, traces): add `captures: <workspace-relative capture folder>` to the header and a `## Captures` section linking each; inline-only captures get `inline only` in the Capture cell.

Unfinished work (`next` set) is a Handoff packet: current state and evidence in `## Finding`, attempts in Steps, blockers in `## Gaps`, next action in `next`, plus constraints and the target, frame, or session ids the next call needs. A blocker that needs someone else's action leads the BLUF as an SBAR: situation, background, assessment, recommendation.

Date the file name with `date +%F`, never from memory; one report, one `.md`. Render, fix every `warning:` line, reply with a short summary plus `.html` and `.md` paths:

```bash
node <skill-folder>/scripts/render-report.mjs <saved.md>
```

`<skill-folder>` holds this file. `--open` only on user request. Re-render after Markdown edits.

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

`<workspace>/.octocode/octocode-chrome-devtools` lists only this skill's reports; read a match's Markdown, not its HTML.

Evidence and visuals: back every claim with its evidence (a `path:line` reference, a command and its result, or a source link), and show shaped data (shares, scores, trends, trade-offs, flows) as a chart or diagram, not prose.

Charts here: `sequenceDiagram` (browser steps, network calls), `xychart-beta` (timings, performance).

Markdown that renders well: `##` sections; tables with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (shown as a colored chip); `> [!WARNING]` alerts for risks; task lists for next steps; `mermaid` flows (`flowchart`, `sequenceDiagram`, `timeline`, `gantt`) and charts (`pie`, `xychart-beta`, `quadrantChart`, `radar-beta`); code references as `` `path/to/file.ts:42` ``; source links with a short label.

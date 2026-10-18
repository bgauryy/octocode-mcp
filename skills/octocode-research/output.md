# Output

Task content only; no probe output or process metadata. Plain text or Markdown with source links; tables only to compare evidence.

## Response

BLUF with Claim–evidence: answer and confidence first, then each claim beside its exact source anchor, limits (material coverage gaps), next check only if needed. Add by result kind:

| Result | Adds |
|---|---|
| Decision | verdict, risk, verification |
| Root cause | cause, affected contract, fix, verification |
| Refactor | mode and tier, invariants, changes, and verification commands with exit codes |

## Saved result

Reports: `<workspace>/.octocode/octocode-research/<YYYY-MM-DD>-<slug>.md`; intermediate files in its `tmp/`. `<workspace>` = repository root, else the current directory, never a folder inside `.octocode/`. A user-named path wins; a scratch folder such as `.octocode/tmp/` does not (save here, link from scratch notes).

## Saved report

Save and render when the result has a table, a diagram, over ~40 lines or five findings, or the user asks; else answer in chat. Save every result when the user or project instructions say so.

Start the file with this header, one value per line: `status` (one listed word) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`).

```yaml
---
status: Confirmed | Likely | Refuted | Open
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Follow the header with the `#` title and a lead paragraph that states the answer. Always include, in this order, `## Answer` (the direct answer and its confidence), `## Scope` (repositories, refs, and paths covered), `## Evidence` (Claim–evidence: each claim beside its exact source anchor; only what the sources show), `## Gaps` (Facts–assumptions–unknowns: unread or unproven parts, and any assumption marked as one), and `## Checks` (what ran and its result). Add `## Next` only when something is pending.

Date the file name with `date +%F`, never from memory; one report = one `.md` file. Render, fix every `warning:` line, and reply with a short summary and the `.html` and `.md` paths:

```bash
node <skill-folder>/scripts/render-report.mjs <saved.md>
```

`<skill-folder>` holds this file; `--open` only when the user asks. Markdown is the source; re-render after edits.

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

`<workspace>/.octocode/octocode-research` lists only this skill's reports; read the Markdown, not the HTML.

Evidence and visuals: back every claim with its evidence (a `path:line` reference, a command and its result, or a source link), and show shaped data (shares, scores, trends, trade-offs, flows) as a chart or diagram, not prose.

Charts here: a `flowchart` of the traced path (caller to callee, request to handler) labeled `path:line`; a `timeline` of relevant history.

Markdown that renders well: `##` sections; tables with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (shown as a colored chip); `> [!WARNING]` alerts for risks; task lists for next steps; `mermaid` flows (`flowchart`, `sequenceDiagram`, `timeline`, `gantt`) and charts (`pie`, `xychart-beta`, `quadrantChart`, `radar-beta`); code references as `` `path/to/file.ts:42` ``; source links with a short label.

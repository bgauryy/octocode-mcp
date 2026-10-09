# Output

Deliver task content only. Never append probe output or generated process metadata.

Use Markdown for answers and citations. Preserve source text, HTML, JSON, and browser captures in the session formats described in [data contracts](references/data-contract.md).

## Response

Answer with source URL, saved artifact path, pages covered, and blocked or unread portions.

## Saved result

Keep fetched pages in one session directory under `<workspace>/.octocode/tmp/scrape/<sessionId>/` (`--out` must stay under `<workspace>/.octocode/`). Save a separate report under the rule in Saved report, at `<workspace>/.octocode/octocode-scraping/<YYYY-MM-DD>-<slug>.md`. `<workspace>` is the root of the project being worked on (its repository root, else the current directory), never a folder inside an existing `.octocode/`. A path the user names takes precedence; a harness or subagent scratch folder such as `.octocode/tmp/` does not, so save the report here and only link it from scratch notes.

## Saved report

Save and render the result when it has a table, a diagram, or more than about 40 lines or five findings, or when the user asks; keep a short answer in chat. When the user or the project's instructions (for example `AGENTS.md`) ask to keep every result, save every result. The save path is under Saved result. Fetched pages stay in the session folder, whose `reports/summary.md` is the script's overview; link them instead of pasting.

Start the file with this header, which people see as chips and agents read from the catalog. `status` (exactly one of the listed words) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`). Keep each value on one line:

```yaml
---
status: Complete | Partial | Blocked
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Follow the header with the `#` title and a lead paragraph that states the answer, before any table or list; the catalog shows that paragraph to agents. Add `session: <workspace-relative session folder>` to the header; the catalog lists it under `meta`, so agents reach the corpus even though `tmp/` is not cataloged. Always include `## Answer`, `## Pages covered`, `## Blocked or unread`, and `## Session` (the folder and its `AGENT_INDEX.json`):

| URL | Status | Session file | Notes |
|---|---|---|---|

Name the file with today's date from `date +%F`, never a remembered or example date, and use the same source for any checked-on date inside the report; a single report is one `.md` file, not a folder. Render it and fix any `warning:` lines it prints (they check this contract), then reply with a short summary, the `.html` path for the person, and the `.md` path for agents and later sessions:

```bash
node <skill-folder>/scripts/render-report.mjs <saved.md>
```

`<skill-folder>` is this skill's installed folder, the one that holds this file; report paths resolve from the current directory, normally `<workspace>`. It writes `<saved>.html` beside the Markdown and opens it. Pass `--no-open` in headless or CI runs. Markdown stays the source; re-render after edits.

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

It prints JSON with every report's path, skill, kind, title, date, header fields, a shared `statusTone` (`done`, `attention`, `failed`, `open`, or `inactive`) that reads the skill's status words the same way across skills, other one-line header keys (`meta`), lead, headings, links, code references, and rendered page (`html`, which may be a folder's `index.html`), newest first; pass `<workspace>/.octocode/octocode-scraping` to see only this skill's reports. Read a matching report's Markdown, not its HTML.

Markdown that renders well: `##` sections; tables for comparisons, with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (it becomes a colored chip, colored by its column: high fit is good, high risk is not); `> [!WARNING]`-style alerts for risks; task lists for next steps; `mermaid` fences for flows and charts; code references as `` `path/to/file.ts:42` `` (linked to the person's editor when the file exists); and full source URLs (collected under Sources).

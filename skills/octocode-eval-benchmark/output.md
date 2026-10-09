# Output

Deliver task content only. Never append probe output or generated process metadata.

Use Markdown for the verdict and readable metric tables; retain machine-readable results in the harness format, such as JSON or JSONL.

## Response

State the question, checks, result, and limits. For a comparative evaluation, add baseline and candidate conditions, metrics, guardrails, uncertainty, failures, and relevant cost. An editorial or deterministic repair needs only the evidence its claim requires.

## Saved result

Store run evidence in `<workspace>/.octocode/octocode-eval-benchmark/<YYYY-MM-DD>-<slug>/`, never inside the installed skill, and link that directory. Keep development and held-out results in separate subfolders. `<workspace>` is the root of the project being worked on (its repository root, else the current directory), never a folder inside an existing `.octocode/`. A path the user names takes precedence; a harness or subagent scratch folder such as `.octocode/tmp/` does not, so save the report here and only link it from scratch notes. When evaluated workers share this workspace, keep answer keys and grader inputs outside their reachable storage.

## Saved report

Every run is saved, including a quick or smoke comparison. Write `README.md` in the run folder as its entry point; `benchmarks/README.md` shows the folder layout.

Start the file with this header, which people see as chips and agents read from the catalog. `status` (exactly one of the listed words) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`). Keep each value on one line:

```yaml
---
status: Keep | Accept | Revert | Inconclusive | Invalid
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Follow the header with the `#` title and a lead paragraph that states the answer, before any table or list; the catalog shows that paragraph to agents. Always include `## Question`, `## Conditions`, `## Results`, `## Guardrails`, `## Limits`, and `## Decision`, with a metric table per split under Results. Use `Keep` for development evidence and `Accept`, `Revert`, `Inconclusive`, or `Invalid` for final evidence, as in `references/kpi-contract.md`. Link the JSON or JSONL results in `dev/` (development and validation) and `held-out/` (sealed test) instead of pasting them; a `mermaid` `xychart-beta` fence shows a metric across conditions.

Name the file with today's date from `date +%F`, never a remembered or example date, and use the same source for any checked-on date inside the report; a single report is one `.md` file, not a folder. Render it and fix any `warning:` lines it prints (they check this contract), then reply with a short summary, the `.html` path for the person, and the `README.md` path for agents and later sessions:

```bash
node <skill-folder>/scripts/render-report.mjs <run-folder>
```

`<skill-folder>` is this skill's installed folder, the one that holds this file; report paths resolve from the current directory, normally `<workspace>`. It writes `<run-folder>/index.html` with every Markdown file in the run, `README.md` first, and opens it. Pass `--no-open` in headless or CI runs. Markdown stays the source; re-render after edits.

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

It prints JSON with every report's path, skill, kind, title, date, header fields, a shared `statusTone` (`done`, `attention`, `failed`, `open`, or `inactive`) that reads the skill's status words the same way across skills, other one-line header keys (`meta`), lead, headings, links, code references, and rendered page (`html`, which may be a folder's `index.html`), newest first; pass `<workspace>/.octocode/octocode-eval-benchmark` to see only this skill's reports. Read a matching report's Markdown, not its HTML.

Markdown that renders well: `##` sections; tables for comparisons, with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (it becomes a colored chip, colored by its column: high fit is good, high risk is not); `> [!WARNING]`-style alerts for risks; task lists for next steps; `mermaid` fences for flows and charts; code references as `` `path/to/file.ts:42` `` (linked to the person's editor when the file exists); and full source URLs (collected under Sources).

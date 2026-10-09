# Output

Deliver one Markdown RFC, defaulting to `<workspace>/.octocode/octocode-rfc-generator/<YYYY-MM-DD>-<slug>/RFC.md`. Keep the decision and execution plan together. Never add probe output or generated process metadata to the deliverable.

## Structure

Start with a title and a short proposal. Always include `## Summary`, `## Proposed design`, `## Validation and success`, and `## Open questions` (start each question with `Blocking:` or `Non-blocking:`, and write `None.` when nothing is open) under exactly those names, so agents can find them. Use the other sections when they help a reviewer decide; combine or omit them, and keep the table's names for any you use. Use only the shared header under Saved report for decision state; no metadata table is needed.

| Section | Useful content |
|---|---|
| Summary | Proposed decision, practical effect, and why it is worth making. Say plainly if the choice remains provisional. |
| Problem and context | Current behavior, affected users, concrete use cases, deciding evidence, and cost of doing nothing. |
| Goals and scope | Checkable outcomes, constraints, and meaningful exclusions. |
| Proposed design | Intended behavior with examples; affected boundaries, interfaces, data flow, failure handling, compatibility, and security where relevant. Use a diagram when it clarifies the design. |
| Alternatives and rationale | Viable choices, their costs and benefits, why the proposed choice fits, and evidence that could change it. |
| Risks and mitigations | Material drawbacks, failure conditions, and how they will be prevented or detected. |
| Implementation and rollout | Prerequisites, dependency-ordered steps, affected components, migration, rollout signals, and rollback actions. Keep all steps in this file. |
| Validation and success | Observable acceptance criteria, relevant checks, measured baselines or targets when needed, and regression or rollback thresholds. Separate measurements from estimates. |
| Open questions | Unresolved decisions and execution details, their impact, and what would settle them. Include an accountable owner when action requires one. |
| References | Sources supporting the decision. Prefer citations beside claims; add a short reference list only when useful. |

A step should explain what changes, what it depends on, and how its outcome is checked. Use concise prose, a checklist, or a table according to complexity. Implementation facts belong here; research call logs and diagnostic transcripts do not.

## Language

- Use clear technical English unless the user requests another language. Write for a capable reader who does not know this system yet.
- Prefer concrete verbs, short paragraphs, consistent terms, and defined acronyms. Preserve exact code and API identifiers.
- Describe current behavior as observed fact and proposed behavior as a proposal. Explain why each significant choice helps the stated goals.
- State obligations precisely. Use “must” for a real requirement and “should” for a recommendation; formal uppercase requirement keywords need an actual protocol convention.
- Support performance, reliability, and compatibility claims with evidence. Replace vague promises with observable outcomes and name material uncertainty.
- Remove repetition, sales language, work narration, author/date/status tables, generated timestamps, worker or tool inventories, scores about the writing, and probe or review receipts. The header's `status` owns decision state; the summary explains it in words.

## Delivery

Save at `<workspace>/.octocode/octocode-rfc-generator/<YYYY-MM-DD>-<slug>/RFC.md`. `<workspace>` is the root of the project being worked on (its repository root, else the current directory), never a folder inside an existing `.octocode/`. A path the user names takes precedence, including a request to place the RFC in the repository's own RFC folder; a harness or subagent scratch folder such as `.octocode/tmp/` does not, so save the RFC here and only link it from scratch notes. Return the links described under Saved report with a brief statement of the decision and any unresolved blocker. A request for review alone returns substantive findings without creating extra files.

Keep related material inside the RFC using sections and links; do not create companion `PLAN.md`, `KPI.md`, `PREREQUISITES.md`, `IMPLEMENTATION.md`, or `RESOURCES.md` files. Refer to existing external evidence without copying it.

## Saved report

Every RFC is saved. Render its folder after each revision.

Start the file with this header, which people see as chips and agents read from the catalog. `status` (exactly one of the listed words) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`). Keep each value on one line:

```yaml
---
status: Proposed | Accepted | Rejected | Superseded
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Follow the header with the `#` title and a lead paragraph that states the answer, before any table or list; the catalog shows that paragraph to agents. Then keep the sections under Structure. The header carries decision state only; never add author, date, or status tables.

Name the file with today's date from `date +%F`, never a remembered or example date, and use the same source for any checked-on date inside the report; a single report is one `.md` file, not a folder. Render it and fix any `warning:` lines it prints (they check this contract), then reply with a short summary, the `.html` path for the person, and the `RFC.md` path for agents and later sessions:

```bash
node <skill-folder>/scripts/render-report.mjs <rfc-folder>
```

`<skill-folder>` is this skill's installed folder, the one that holds this file; report paths resolve from the current directory, normally `<workspace>`. It writes `<rfc-folder>/index.html` next to `RFC.md` and opens it. Pass `--no-open` in headless or CI runs. Markdown stays the source; re-render after edits.

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

It prints JSON with every report's path, skill, kind, title, date, header fields, a shared `statusTone` (`done`, `attention`, `failed`, `open`, or `inactive`) that reads the skill's status words the same way across skills, other one-line header keys (`meta`), lead, headings, links, code references, and rendered page (`html`, which may be a folder's `index.html`), newest first; pass `<workspace>/.octocode/octocode-rfc-generator` to see only this skill's reports. Read a matching report's Markdown, not its HTML.

Markdown that renders well: `##` sections; tables for comparisons, with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (it becomes a colored chip, colored by its column: high fit is good, high risk is not); `> [!WARNING]`-style alerts for risks; task lists for next steps; `mermaid` fences for flows and charts; code references as `` `path/to/file.ts:42` `` (linked to the person's editor when the file exists); and full source URLs (collected under Sources).

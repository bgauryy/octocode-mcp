# Output

## Structure

Always include `## Summary`, `## Proposed design`, `## Validation and success`, and `## Open questions` (each question starts `Blocking:`, an objection stating its consequence, or `Non-blocking:`, a concern; `None.` when nothing is open) under exactly those names. Other sections are optional: combine or omit them, keeping the table's names.

| Section | Content |
|---|---|
| Summary | Decision, effect, why worth it; flag a provisional choice |
| Problem and context | Current behavior, affected users, deciding evidence, cost of inaction |
| Goals and scope | Checkable outcomes, constraints, exclusions |
| Proposed design | Behavior with examples; boundaries, interfaces, data flow, failures, compatibility, security |
| Alternatives and rationale | Viable options, costs, benefits, why this fits, what could change it |
| Risks and mitigations | Drawbacks, failure conditions, prevention or detection |
| Implementation and rollout | Prerequisites, dependency-ordered steps, migration, rollout signals, rollback |
| Validation and success | Acceptance checks as Given–When–Then (given <state>, when <action>, then <observable result>); baselines or targets, rollback thresholds; measurements apart from estimates |
| Open questions | What is unresolved, impact, what settles it, owner when needed |
| References | Citations beside claims; a short list only when useful |


## Language

- Clear technical English (unless asked otherwise) for a capable newcomer to this system.
- Concrete verbs, short paragraphs, consistent terms, defined acronyms, exact identifiers.
- Facts, assumptions, unknowns: current behavior with its evidence as facts, assumptions marked, unknowns named (what nobody checked); the proposal stays apart; never present a guess as a fact.
- "must" = requirement, "should" = recommendation; uppercase only under a real protocol convention.
- Observable outcomes, not promises.
- Cut repetition, sales language, narration, author/date/status tables, timestamps, tool inventories, scores, logs, transcripts, receipts. Header `status` owns decision state.

## Delivery

Save at `<workspace>/.octocode/octocode-rfc-generator/<YYYY-MM-DD>-<slug>/RFC.md`; `<workspace>` is the project root (repository root, else current directory), never inside an existing `.octocode/`. A user-named path wins (including the repository's RFC folder); a scratch folder like `.octocode/tmp/` does not. Reply BLUF: decision and confidence first, then any unresolved blocker, the `.html` path, and the `RFC.md` path. Review-only request: findings, no files.

No companion `PLAN.md`, `KPI.md`, `PREREQUISITES.md`, `IMPLEMENTATION.md`, or `RESOURCES.md`.

## Saved report

Save every RFC; render its folder after each revision.

Start the file with this header, one value per line: `status` (one listed word) and `question` are required; add `confidence` when it applies and `next` only when something is pending (never `none`).

```yaml
---
status: Proposed | Accepted | Rejected | Superseded
confidence: high | medium | low
question: <the question or decision>
next: <the one next action for whoever continues, in the imperative>
---
```

Then the `#` title, a lead paragraph stating the answer, and the Structure sections.

Date the folder with `date +%F`, never from memory. Render and fix every `warning:` line:

```bash
node <skill-folder>/scripts/render-report.mjs <rfc-folder>
```

`<skill-folder>` holds this file. `<rfc-folder>/index.html` sits beside `RFC.md`; `--open` only when the user asks. Markdown is the source.

Before starting work that may repeat an earlier report, list the saved ones:

```bash
node <skill-folder>/scripts/render-report.mjs <workspace>/.octocode --manifest
```

`<workspace>/.octocode/octocode-rfc-generator` lists only this skill's reports; read a match's Markdown, not its HTML.

Evidence and visuals: back every claim with its evidence (a `path:line` reference, a command and its result, or a source link), and show shaped data (shares, scores, trends, trade-offs, flows) as a chart or diagram, not prose.

Markdown that renders well: `##` sections; tables with a plain word such as `High`, `Confirmed`, or `P1` alone in a cell (shown as a colored chip); `> [!WARNING]` alerts for risks; task lists for next steps; `mermaid` flows (`flowchart`, `sequenceDiagram`, `timeline`, `gantt`) and charts (`pie`, `xychart-beta`, `quadrantChart`, `radar-beta`); code references as `` `path/to/file.ts:42` ``; source links with a short label.

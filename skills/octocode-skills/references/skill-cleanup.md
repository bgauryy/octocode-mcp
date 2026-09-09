# Skill Cleanup

Load when pruning a skill before ship, after improve/dedupe, or when review flags orphans/duplicates. Why: skills ship as a **standalone folder** — every file travels with the skill; dead weight wastes context and confuses agents.

## Standalone ship shape

A skill is one portable directory. Install/sync copies or symlinks that folder as-is. Every local file reference must resolve inside it; sibling skills are named capabilities, never file dependencies. <!-- style-lint: ignore-line passive-voice -->

Keep only what the agent needs to run the skill:

```text
skill-name/
|-- SKILL.md          # required lobby
|-- README.md         # human overview (review requires)
|-- references/       # one-concept depth, all reachable
|-- scripts/          # deterministic helpers actually routed
|-- assets/           # templates/resources actually used
`-- references/references.md  # audit trail only (optional)
```

Do not ship: unused or duplicate files, development-only metadata, probes, drafts, scratch notes, old renames, nested `node_modules`, secrets, or files that only make sense inside another repository.

**A skill folder is never an artifact root.** Runtime state, caches, browser profiles, and second copies of a helper belong in the workspace `.octocode/` or the global Octocode home (`$OCTOCODE_HOME`, default `~/.octocode`) — never beside `SKILL.md`. A script that resolves its output base as `process.cwd()/.octocode` writes into whichever directory launched it, so a run started from the skill folder silently fills it; treat a git-ignored `.octocode/` inside a skill as that accident and relocate it.

## Cleanup checklist

1. **Whole-folder reachability** — every file is reachable from `SKILL.md`, `README.md`, or another used file (`unused-file`); otherwise delete or route it.
2. **Internal references** — every local file reference resolves inside the skill; vendor required files and name optional sibling skills without file paths (`link-outside-skill`).
3. **Duplicate content/files** — one owner and one shipped copy per concept; delete restated prose, duplicate assets, development-only metadata, and probes.
4. **Routes** — each used reference and agent-facing script has a reachable route with its use condition; keep detailed catalogs in one place.
5. **Bloat** — keep one concept per reference and a lean lobby. Assess line-count warnings for actual duplication or difficult navigation; avoid splitting coherent procedures just to meet a count.
6. **Dead routes** — lobby links that no longer match a real job → remove the line and the file if unused.

## Phase

Run cleanup after DEDUPE/REWRITE and before claiming done:

`… → DEDUPE → REWRITE → CLEANUP → REVIEW → VERIFY`

Gate deletes of non-empty files behind user approval when unsure. Then `scripts/skill-review.mjs` must report 0 ERROR.

Next: when rewriting load `references/skill-improve.md`; before done load `references/skill-review.md`.

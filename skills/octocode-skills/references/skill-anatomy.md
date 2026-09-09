# Skill Anatomy

Load when evaluating, improving, or creating a skill's folder shape — before rewriting structure.

A skill is a standalone folder with required `SKILL.md` and optional `scripts/`, `references/`, and `assets/`. Every local file reference resolves inside it, and every shipped file is used. Name optional sibling skills without file paths; vendor required helpers and remove development-only metadata, probes, duplicates, and dead artifacts. <!-- style-lint: ignore-line passive-voice -->

```text
my-skill/
|-- SKILL.md       # metadata + operating map
|-- scripts/       # deterministic helpers
|-- references/    # one-concept depth
|-- assets/        # templates / resources
```

## Progressive disclosure

1. Discovery — agent sees only `name` + `description`.
2. Activation — matching task → full `SKILL.md`.
3. Execution — load refs/scripts only when the map says so.

`SKILL.md` is the lobby: entry decisions, shared constraints, and routes live there. References own conditional procedures without redefining shared rules.

## Reference discipline

- One short H1 and one concept per file. Treat 50 lines as a review cue, not a reason to fragment useful instructions.
- Routes explain when and why to load detail. Reuse prior reads and batch independent references when useful.
- Ref→ref OK for depth — end with the next load when needed.
- Gotchas stay in the lobby only if the agent must know them before the trigger.
- Tabular content → a real markdown table, never prose describing rows/columns.
- Every reference/citation states why it matters — no bare links.
- Every sentence earns its tokens: dense, no filler, no duplicate phrasing, no data loss.

## Map and navigation

- `SKILL.md` routes the main capabilities. An index or used reference can route deeper files and scripts; avoid duplicating the same catalog in both places.
- Each chunk opens with its own entry condition (`Load when … Why: …`) so a route is verifiable from the file itself.
- Give a next hop when the procedure depends on another file. A complete reference can end without a ceremonial closing line.
- Every flow phase in `SKILL.md` appears in a route or gate; a phase named only in the flow line is decoration.
- Library modules under `scripts/` stay unlisted, but something must import them; nothing imports dead weight.
- Run `scripts/skill-review.mjs`; fix errors and judge advisory layout findings against actual navigation and task needs.

## Context cut

Ask: "Can the agent get this wrong without the skill?" If not, cut.
Prefer stepwise guidance over exhaustive docs. Keep each skill a coherent unit of work.

Next: when improving an existing skill load `references/skill-improve.md`; when writing instructions load `references/skill-authoring.md`; before bundling scripts load `references/skill-scripts.md`.

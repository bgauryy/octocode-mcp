# Create A Local Skill

Load when creating a local skill. Resolve its purpose and destination, then work within the authority already granted.

If fetching a remote skill first, load `references/fetch-remote.md`. Shape the lobby with `references/skill-anatomy.md` + `references/skill-improve.md` (workflows in `SKILL.md`, no overlaps).

## Before writing

1. Synthesize: user need, inspected sources, gates, resources, exclusions.
2. Plan: name, destination, trigger draft (`references/description-tuning.md`), workflow outline (goes in lobby), validation.
3. Resolve any missing scope or authority. An authorized creation request does not require another approval merely because this route was loaded.

## Create and verify

Write the lobby (`SKILL.md`) with purpose, workflows, hard rules, stop conditions, and when/why routes. Put depth in one-concept refs. Hooks → `references/hooks-add.md`. Scripts → `references/skill-scripts.md`.

Create `references/references.md` from `references/references-template.md` with sources consulted.

Run `node scripts/skill-review.mjs <new-skill-dir>`; clear ERRORs before done.

Next: when writing instruction patterns load `references/skill-authoring.md`; when tuning the trigger load `references/description-tuning.md`.

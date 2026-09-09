# Install Gates

Load when installing a skill. Confirm its source, destinations, and authorization before writing; reuse decisions already made in the session.

An install = copy or symlink a `SKILL.md` folder into a path the runtime scans. No single official installer — any method that lands a valid folder is fine.

## Normalize source

Accept `owner/repo/path`, GitHub tree/blob URLs, absolute paths, or relative paths. Strip trailing `SKILL.md`. `skill-name` = final folder segment unless overridden. If frontmatter `name` ≠ folder, surface the mismatch, and ask.

Prefer after approval: `npx -y octocode skill install --add <src> --platform <hosts> [--mode copy|symlink|hybrid]`. This copies the validated source into `<octocode-home>/skills/<name>` as the canonical installation, then creates vendor links from that copy. `--mode copy|hybrid` changes vendor destinations only; canonical home remains a copy.

## Resolve destinations

Use the request and existing session context to resolve these fields; ask only for missing choices:

1. Providers? — one, several, or all agents.
2. Scope per provider? — user / project / custom.
3. If project: which absolute root?
4. Mode? — symlink (stable local source) or copy (portable / remote).

Inspect third-party scripts and hooks before installation; this read does not need a separate approval.

## Conflict + checklist

Per destination: `ls "<dest>/<skill-name>"` — Overwrite / Skip / Rename / Diff / Cancel. Never silent overwrite.

Checklist: inspect source and frontmatter → resolve destinations and conflicts → confirm existing authorization covers the plan → write → `test -f …/SKILL.md` → optional reload hint. Ask only about unresolved authority or choices.

Symlink only when source is stable local, user wants live edits, and runtime supports it. Else copy.
For multi-vendor symlink sync, inspect the dry-run from `scripts/skill-sync.mjs`. Use `--approve` when existing authorization covers that plan; otherwise ask about the unresolved destination or conflict (`references/skill-sync.md`).

Next: when choosing destinations load `references/install-destinations.md`; when syncing vendors load `references/skill-sync.md`; when source is remote load `references/fetch-remote.md`.

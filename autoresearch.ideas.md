# Deferred autoresearch ideas

- If skill-only guidance saturates, expose a tiny machine-friendly JSON shape cheat sheet in command help text so the model can infer `.results[0].data.*` without probing.
- If R4 still escapes to `gh`, consider a narrow CLI affordance for `search-prs --path-prefix <dir>` only if the skill recipe alone cannot make `--query` + `.fileChanges[]` reliable.
- If batching via stdin remains underused, test whether concrete copy-paste examples inside `agent-command-specs.ts` help more than SKILL.md alone.

# Install Reference

Use this only when the user chooses `Install a skill`.

## Validate Against Repo

If install behavior is unclear or may have changed, check these files before acting:

```text
packages/octocode-cli/docs/SKILLS_GUIDE.md
packages/octocode-cli/src/cli/commands/skills.ts
packages/octocode-cli/src/utils/skills.ts
packages/octocode-cli/src/utils/skills-fetch.ts
packages/octocode-cli/src/ui/skills-menu/marketplace.ts
```

GitHub references:

```text
https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md
https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/src/cli/commands/skills.ts
https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/src/utils/skills.ts
https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/src/utils/skills-fetch.ts
https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/src/ui/skills-menu/marketplace.ts
```

What to verify:
- `SKILLS_GUIDE.md`: current CLI examples, target names, default destinations, and `skillsDestDir`.
- `skills.ts`: default destination resolution and custom `skillsDestDir` behavior.
- `commands/skills.ts`: supported target names, prompts, install modes, conflict handling, and `--force` behavior.
- `skills-fetch.ts`: how marketplace skills are downloaded and written to disk.
- `marketplace.ts`: interactive marketplace prompts and install confirmation wording.

## Input

Install input is a GitHub skill path, not only a skill name.

Accepted forms:

```text
owner/repo/path/to/skill
owner/repo/path/to/skill/SKILL.md
https://github.com/<owner>/<repo>/tree/<branch>/<path-to-skill-folder>
https://github.com/<owner>/<repo>/blob/<branch>/<path-to-skill-folder>/SKILL.md
```

Normalize `.../SKILL.md` to the containing folder. Derive `skill-name` from the final folder segment.

## Targets

Default skill directories:

```text
claude-code: ~/.claude/skills/
claude-desktop: ~/.claude-desktop/skills/
cursor: ~/.cursor/skills/
codex: ~/.codex/skills/
opencode: ~/.opencode/skills/
```

For project-scoped Claude Code installs, `~/.octocode/config.json` can set:

```json
{ "skillsDestDir": "/your/project/.claude/skills" }
```

This customizes the `claude-code` destination only.

## Install Steps

1. Validate the source path resolves to a folder containing `SKILL.md`.
2. Confirm source path, description, targets, and install mode.
3. Prefer copy. Use symlink only when the source folder is stable.
4. Check conflicts:

```bash
ls "<dest>/<skill-name>"
```

If the folder exists, ask: `Overwrite`, `Skip`, or `Cancel`.

5. Download the skill folder:

```text
githubGetFileContent(queries: [{
  id: "download",
  owner,
  repo,
  path: "<path-to-skill-folder>",
  type: "directory"
}])
```

6. Verify the returned folder:

```bash
ls "<localPath>/SKILL.md"
```

7. Install:

```bash
cp -r "<localPath>" "<dest>/<skill-name>"
```

8. Verify every destination:

```bash
ls "<dest>/<skill-name>/SKILL.md"
```

Report success or failure per target.

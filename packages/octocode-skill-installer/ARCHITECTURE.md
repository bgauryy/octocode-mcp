# Skill installer architecture

`@octocodeai/octocode-skill-installer` is the private workspace contract for
filesystem and platform behavior used by the Octocode CLI. The CLI bundles this
workspace into its own output and supplies its complete skill suite. The installer
is not published or resolved as a runtime package.

## Data flow

```text
package bundle ──atomic copy──> $OCTOCODE_HOME/skills/<name>
                                      │
                                      ├──directory symlink──> global host directory
                                      └──directory symlink──> project host directory
```

The canonical copy is durable across npm cache eviction and package upgrades.
Platform links never point into `node_modules`, an `npx` cache, or package build
output. Windows uses directory junctions for link mode.

## Ownership

- `SKILL_PLATFORMS` owns platform names, global and project relative
  destination paths, and the `auto` mode choice.
- `formatSkillPlatformHelp` and `parseSkillPlatforms` derive the accepted CLI
  values from that registry.
- `installBundledSkills` owns validation, dry-run planning, atomic replacement,
  conflict refusal, idempotency, and the shared result schema.
- Calling CLIs own argument parsing, bundled-skill discovery, human output, and
  any package-specific follow-up guidance.
- `@octocodeai/config` owns `$OCTOCODE_HOME` resolution.

## Safety invariants

- A bundled skill must contain a regular, non-symlink `SKILL.md`.
- The installer leaves existing canonical or destination content unchanged unless
  `upgrade` or `force` grants the corresponding replacement.
- `upgrade` replaces changed content only in the installer-owned canonical store.
  A copy-mode destination is upgraded without `force` only when its old tree still
  matches the previous canonical tree. Arbitrary platform destination drift is
  never overwritten by `upgrade`.
- `force` remains the explicit override for canonical and destination conflicts.
- Canonical materialization and destination replacement stage beside the target,
  rename the old target to a backup, publish the replacement, then remove the
  backup. A failed publish restores the backup.
- Directory links target the durable canonical directory, never the transient
  package source.
- Repeating an identical request returns an unchanged status.
- `dryRun` executes validation and conflict detection without filesystem writes.

## Platform contract

| Platform | Global | Project |
|---|---|---|
| `pi` | `~/.pi/agent/skills` | `.pi/skills` |
| `cursor` | `~/.cursor/skills` | `.cursor/skills` |
| `claude` | `~/.claude/skills` | `.claude/skills` |
| `codex` | `~/.agents/skills` | `.agents/skills` |
| `opencode` | `~/.config/opencode/skills` | `.opencode/skills` |
| `copilot` | `~/.copilot/skills` | `.github/skills` |
| `gemini` | `~/.gemini/skills` | `.gemini/skills` |

`all` expands to these seven. No aliases are accepted; an unknown value fails
with the valid list.

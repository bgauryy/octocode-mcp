# Octocode CLI Reference

## Command Overview

| Command | Aliases | Description |
|---------|---------|-------------|
| `install` | `i` | Install octocode-mcp for an IDE |
| `login` | `l` | Authenticate with GitHub |
| `logout` | - | Sign out from GitHub |
| `auth` | `a`, `gh` | Auth menu or `auth login` / `logout` / `status` / `token` |
| `skills` | `sk` | List or install bundled Octocode skills |
| `cache` | - | Inspect/clean disk cache |
| `token` | `t` | Print token; `--json` for machine output |
| `status` | `s` | GitHub authentication status |
| `sync` | `sy` | Sync MCP configs across IDEs |

---

## Commands

### `octocode install`

```bash
octocode install --ide <ide> [--method <npx|direct>] [--force]
```

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--ide` | - | Target IDE (required) | - |
| `--method` | `-m` | `npx` or `direct` | `npx` |
| `--force` | `-f` | Overwrite existing configuration | `false` |

Supported `--ide` values: `cursor`, `claude` / `claude-desktop`, `claude-code`, `windsurf`, `zed`, `vscode-cline`, `vscode-roo`, `vscode-continue`, `opencode`, `trae`, `antigravity`.

```bash
octocode install --ide cursor
octocode install --ide claude-desktop --method direct
octocode install --ide cursor --force
```

---

### `octocode login`

```bash
octocode login [--hostname <host>] [--git-protocol <ssh|https>]
```

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--hostname` | `-H` | GitHub Enterprise hostname | `github.com` |
| `--git-protocol` | `-p` | `ssh` or `https` | `https` |

---

### `octocode logout`

```bash
octocode logout [--hostname <host>]
```

---

### `octocode auth`

```bash
octocode auth [login|logout|status|token]
```

Without a subcommand, opens an interactive menu. Subcommands delegate to the corresponding top-level commands.

---

### `octocode skills`

Installs skills for **Claude Code** into `~/.claude/skills/` (macOS/Linux) or `%LOCALAPPDATA%\Claude\skills\` (Windows) by default.

```bash
octocode skills list
octocode skills install [--skill <name>] [--force]
```

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--skill` | `-k` | Install only this skill | all |
| `--force` | `-f` | Overwrite already-installed skill | `false` |

```bash
octocode skills list
octocode skills install --skill octocode-researcher
octocode skills install -k octocode-plan
octocode skills install --skill octocode-researcher --force
octocode skills install
```

| Skill | When to use |
|-------|-------------|
| `octocode-researcher` | Code exploration — find, trace, definitions |
| `octocode-research` | Deep research via HTTP research server |
| `octocode-plan` | Plan → implement → verify |
| `octocode-rfc-generator` | RFCs and design docs |
| `octocode-pull-request-reviewer` | PR and staged-change review |
| `octocode-local-code-quality` | Architecture, security, dead code audits |
| `octocode-documentation-writer` | Generate project documentation |
| `octocode-prompt-optimizer` | Harden prompts and SKILL files |
| `octocode-roast` | Brutally honest code critique |

**Install destination:** global (`~/.claude/skills/`) or project-scoped (`.claude/skills/`). Change via `~/.octocode/config.json` → `"skillsDestDir"` or interactive menu (Manage System Skills → Change path).

Full guide: [Skills Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md).

---

### `octocode cache`

```bash
octocode cache [status|clean] [--repos] [--skills] [--logs] [--all] [--tools|--local|--lsp|--api]
```

`status` (default) shows disk usage. `clean` removes selected targets — requires at least one flag.

| Option | Short | Description |
|--------|-------|-------------|
| `--repos` | - | Cloned repositories cache (`~/.octocode/repos`) |
| `--skills` | - | Marketplace skills cache |
| `--logs` | - | Octocode logs directory |
| `--all` | `-a` | Repos + skills + logs |
| `--tools` / `--local` / `--lsp` / `--api` | - | In-memory only — clears on MCP restart, no disk to clean |

```bash
octocode cache status
octocode cache clean --repos
octocode cache clean --all
```

---

### `octocode token`

```bash
octocode token [--type <auto|octocode|gh>] [--hostname <host>] [--source] [--json]
```

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--type` | `-t` | `auto` (env → gh → octocode), `octocode`, or `gh` | `auto` |
| `--hostname` | `-H` | GitHub hostname | `github.com` |
| `--source` | `-s` | Print source and user alongside token | off |
| `--json` | `-j` | Output `{"token":"...","type":"..."}` | off |

---

### `octocode status`

```bash
octocode status [--hostname <host>]
```

---

### `octocode sync`

```bash
octocode sync [--force] [--dry-run] [--status]
```

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--force` | `-f` | Auto-resolve conflicts | `false` |
| `--dry-run` | `-n` | Preview changes without applying | `false` |
| `--status` | `-s` | Show sync status only | `false` |

---

## Global Options

| Option | Description |
|--------|-------------|
| `--help` | Show help for command |
| `--version` | Show CLI version |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (details in output) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub personal access token |
| `GH_TOKEN` | GitHub token (alternative) |
| `OCTOCODE_HOME` | Override data directory (default `~/.octocode`) |

---

[Skills Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md)

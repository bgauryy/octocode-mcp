# Octocode CLI Reference

Practical reference for `octocode` commands, options, and help usage.

## Help First

Use help commands anytime:

```bash
octocode --help
octocode --version
octocode <command> --help
```

Examples:

```bash
octocode skills --help
octocode install --help
```

---

## Command Index

| Command | Aliases | What it does |
|---------|---------|--------------|
| `install` | `i` | Configure Octocode MCP for an IDE/client |
| `skills` | `sk` | List/install bundled skills |
| `sync` | `sy` | Sync MCP configs across installed IDE clients |
| `auth` | `a`, `gh` | Interactive auth menu or auth subcommands |
| `login` | `l` | GitHub OAuth login |
| `logout` | - | GitHub OAuth logout |
| `status` | `s` | Show GitHub auth status |
| `token` | `t` | Print GitHub token (human or JSON output) |
| `cache` | - | Inspect or clean local cache |
| `mcp` | - | Manage MCP marketplace entries non-interactively |

---

## Global Options

| Option | Meaning |
|--------|---------|
| `--help` | Show command help |
| `--version` | Show CLI version |

---

## Core Commands

### `octocode install`

```bash
octocode install --ide <ide> [--method <npx|direct>] [--force]
```

| Option | Short | Meaning | Default |
|--------|-------|---------|---------|
| `--ide` | - | Target IDE/client (required) | - |
| `--method` | `-m` | Installation method | `npx` |
| `--force` | `-f` | Overwrite existing config | `false` |

Supported `--ide` values:
`cursor`, `claude`, `claude-desktop`, `claude-code`, `windsurf`, `zed`, `vscode-cline`, `vscode-roo`, `vscode-continue`, `opencode`, `trae`, `antigravity`.

```bash
octocode install --ide cursor
octocode install --ide claude-desktop --method direct
octocode install --ide cursor --force
```

### `octocode skills`

```bash
octocode skills list
octocode skills install [--skill <name>] [--targets <list>] [--mode <copy|symlink>] [--force]
octocode skills remove --skill <name> [--targets <list>]
```

If you run `octocode skills install` without `--targets` / `--mode`, the CLI asks:
- which platforms to install to
- how to install: hybrid (copy Claude + symlink others), full copies, or full symlinks

| Option | Short | Meaning | Default |
|--------|-------|---------|---------|
| `--skill` | `-k` | Install one skill only | all bundled skills |
| `--targets` | `-t` | Comma-separated install targets | `claude-code` |
| `--mode` | `-m` | Install mode (`copy` or `symlink`) | `copy` |
| `--force` | `-f` | Overwrite existing installs | `false` |

Supported `--targets`:
`claude-code`, `claude-desktop`, `cursor`, `codex`, `opencode`.

```bash
octocode skills list
octocode skills install
octocode skills install --targets claude-code,cursor,codex
octocode skills install --targets claude-code,cursor --mode symlink
octocode skills install --skill octocode-researcher --force
octocode skills remove --skill octocode-researcher --targets claude-code,cursor
```

Install destinations (macOS/Linux):
- `claude-code` -> `~/.claude/skills/` (or custom `skillsDestDir`)
- `claude-desktop` -> `~/.claude-desktop/skills/`
- `cursor` -> `~/.cursor/skills/`
- `codex` -> `~/.codex/skills/`
- `opencode` -> `~/.opencode/skills/`

`skillsDestDir` in `~/.octocode/config.json` customizes only the `claude-code` destination.

For full skill catalog and guidance, see [Skills Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md).

### `octocode sync`

```bash
octocode sync [--force] [--dry-run] [--status]
```

| Option | Short | Meaning | Default |
|--------|-------|---------|---------|
| `--force` | `-f` | Auto-resolve conflicts | `false` |
| `--dry-run` | `-n` | Preview changes only | `false` |
| `--status` | `-s` | Show sync status only | `false` |

### `octocode auth`

```bash
octocode auth [login|logout|status|token]
```

If no subcommand is provided, `octocode auth` opens the interactive auth menu.

### `octocode mcp`

```bash
octocode mcp list [--search <text>] [--category <name>] [--installed] [--client <client>|--config <path>]
octocode mcp status [--client <client>|--config <path>]
octocode mcp install --id <mcp-id> [--client <client>|--config <path>] [--env KEY=VALUE[,KEY=VALUE]] [--force]
octocode mcp remove --id <mcp-id> [--client <client>|--config <path>]
```

| Option | Short | Meaning | Default |
|--------|-------|---------|---------|
| `--id` | - | MCP registry id for install/remove | - |
| `--client` | `-c` | Target client config | `claude-code` |
| `--config` | - | Custom config path (uses custom client) | - |
| `--search` | - | Filter list by id/name/description/tags | - |
| `--category` | - | Filter list by category | - |
| `--installed` | - | List only installed MCPs in target config | `false` |
| `--env` | - | Extra env variables for install (`KEY=VALUE,...`) | - |
| `--force` | `-f` | Overwrite existing MCP entry on install | `false` |

Supported `--client` values:
`cursor`, `claude-desktop`, `claude-code`, `windsurf`, `trae`, `antigravity`, `zed`, `vscode-cline`, `vscode-roo`, `vscode-continue`, `opencode`.

```bash
octocode mcp list --search browser
octocode mcp status --client cursor
octocode mcp install --id playwright-mcp --client cursor --force
octocode mcp install --id firecrawl-mcp-server --client cursor --env FIRECRAWL_API_KEY=fc-xxxxx
octocode mcp remove --id playwright-mcp --client cursor
```

---

## Auth and Token Commands

### `octocode login`

```bash
octocode login [--hostname <host>] [--git-protocol <ssh|https>]
```

### `octocode logout`

```bash
octocode logout [--hostname <host>]
```

### `octocode status`

```bash
octocode status [--hostname <host>]
```

### `octocode token`

```bash
octocode token [--type <auto|octocode|gh>] [--hostname <host>] [--source] [--json]
```

| Option | Short | Meaning | Default |
|--------|-------|---------|---------|
| `--type` | `-t` | Token source (`auto`, `octocode`, `gh`) | `auto` |
| `--hostname` | `-H` | GitHub/GHE hostname | `github.com` |
| `--source` | `-s` | Print token source + username | off |
| `--json` | `-j` | JSON output for scripts | off |

---

## Cache Command

### `octocode cache`

```bash
octocode cache [status|clean] [--repos] [--skills] [--logs] [--all] [--tools|--local|--lsp|--api]
```

- `status` shows disk usage
- `clean` requires at least one target flag

| Option | Short | Meaning |
|--------|-------|---------|
| `--repos` | - | Clean cloned repository cache |
| `--skills` | - | Clean marketplace skills cache |
| `--logs` | - | Clean Octocode logs |
| `--all` | `-a` | Clean repos + skills + logs |
| `--tools` / `--local` / `--lsp` / `--api` | - | Tool cache is in-memory (clears on MCP restart) |

```bash
octocode cache status
octocode cache clean --repos
octocode cache clean --all
```

---

## CLI Smoke Matrix

Run a compact regression matrix after CLI changes:

```bash
bash scripts/cli-smoke-matrix.sh
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error |

## Environment Variables

| Variable | Meaning |
|----------|---------|
| `GITHUB_TOKEN` | GitHub PAT |
| `GH_TOKEN` | Alternative GitHub token |
| `OCTOCODE_HOME` | Override data directory (default: `~/.octocode`) |


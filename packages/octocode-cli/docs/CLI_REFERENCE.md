# Octocode CLI Reference

> Complete reference for the Octocode CLI commands and options.

## Quick Start

```bash
# Run interactive mode (recommended for first-time users)
npx octocode

# Or use specific commands
octocode install --ide cursor
octocode login
octocode status
```

---

## Command Overview

| Command | Aliases | Description |
|---------|---------|-------------|
| `install` | `i` | Install octocode-mcp for an IDE |
| `login` | `l` | Authenticate with GitHub |
| `logout` | - | Sign out from GitHub |
| `auth` | - | Interactive GitHub authentication menu |
| `skills` | - | Install/manage AI skills |
| `cache` | - | Inspect/clean Octocode cache and logs |
| `token` | - | Display or manage GitHub tokens |
| `status` | - | Show environment and auth status |
| `sync` | - | Sync MCP configurations across clients |

---

## Commands

### `octocode install`

Install octocode-mcp for a supported IDE.

```bash
octocode install --ide <ide> [--method <method>] [--force]
```

**Options:**

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--ide` | - | Target IDE (required) | - |
| `--method` | `-m` | Installation method (`npx` or `direct`) | `npx` |
| `--force` | `-f` | Overwrite existing configuration | `false` |

**Supported IDEs:**

- `cursor` - Cursor IDE
- `claude` / `claude-desktop` - Claude Desktop App
- `claude-code` - Claude Code
- `windsurf` - Windsurf IDE
- `zed` - Zed Editor
- `vscode-cline` - VS Code with Cline extension
- `vscode-roo` - VS Code with Roo extension
- `vscode-continue` - VS Code with Continue extension
- `opencode` - OpenCode
- `trae` - Trae
- `antigravity` - Antigravity

**Examples:**

```bash
# Install for Cursor using npx (recommended)
octocode install --ide cursor

# Install for Claude Desktop with direct method
octocode install --ide claude --method direct

# Force reinstall
octocode install --ide cursor --force
```

---

### `octocode login`

Authenticate with GitHub using OAuth.

```bash
octocode login [--hostname <host>] [--git-protocol <protocol>]
```

**Options:**

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--hostname` | `-H` | GitHub Enterprise hostname | `github.com` |
| `--git-protocol` | `-p` | Git protocol (`ssh` or `https`) | - |

**Examples:**

```bash
# Login to github.com
octocode login

# Login to GitHub Enterprise
octocode login --hostname github.mycompany.com
```

---

### `octocode logout`

Sign out from GitHub and remove stored credentials.

```bash
octocode logout [--hostname <host>]
```

**Options:**

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--hostname` | `-H` | GitHub Enterprise hostname | `github.com` |

---

### `octocode auth`

Interactive authentication menu for managing GitHub credentials.

```bash
octocode auth
```

Opens an interactive menu with options to:
- Login to GitHub
- Logout from GitHub
- Switch accounts
- View authentication status

---

### `octocode skills`

Install and manage AI assistant skills for Claude Code.

```bash
octocode skills [--force]
```

**Options:**

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--force` | `-f` | Reinstall existing skills | `false` |

**Available Skills:**

| Skill | Description |
|-------|-------------|
| `octocode-research` | GitHub repository research workflows |
| `octocode-implement` | Implementation guidance with references |
| `octocode-pr-review` | Pull request review automation |
| `octocode-researcher` | Primary code research and exploration |
| `octocode-plan` | Task planning and decomposition |
| `octocode-roast` | Code review with personality |


---

### `octocode cache`

Inspect or clean Octocode cache and log directories.

```bash
octocode cache [status|clean] [--repos] [--skills] [--logs] [--all]
```

**Subcommands:**

- `status` (default): Show disk usage for repos, skills cache, and logs
- `clean`: Remove selected cache directories

**Options (for `clean`):**

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--repos` | - | Remove cloned repositories cache (`~/.octocode/repos`) | `true` (when no flags) |
| `--skills` | - | Remove skills marketplace cache files | `true` (when no flags) |
| `--logs` | - | Remove Octocode logs directory | `false` |
| `--all` | `-a` | Remove repos + skills + logs | `false` |

**Examples:**

```bash
# Show cache usage
octocode cache status

# Clean repos and skills cache (default clean behavior)
octocode cache clean

# Clean repos only
octocode cache clean --repos

# Clean everything including logs
octocode cache clean --all
```

---

### `octocode token`

Display or manage GitHub authentication tokens.

```bash
octocode token [--type <type>] [--hostname <host>] [--source <source>] [--json]
```

**Options:**

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--type` | - | Token type to display | - |
| `--hostname` | `-H` | GitHub hostname | `github.com` |
| `--source` | - | Token source (`octocode`, `gh`, `auto`) | `auto` |
| `--json` | - | Output in JSON format | `false` |

---

### `octocode status`

Show current environment and authentication status.

```bash
octocode status [--hostname <host>]
```

**Options:**

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--hostname` | `-H` | GitHub hostname | `github.com` |

---

### `octocode sync`

Synchronize MCP configurations across all configured clients.

```bash
octocode sync [--force] [--dry-run] [--status]
```

**Options:**

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--force` | `-f` | Auto-resolve conflicts | `false` |
| `--dry-run` | - | Preview changes without applying | `false` |
| `--status` | - | Show sync status only | `false` |

---

## Global Options

All commands support:

| Option | Description |
|--------|-------------|
| `--help` | Show help for command |
| `--version` | Show CLI version |

**Examples:**

```bash
octocode --help
octocode install --help
octocode --version
```

---

## Exit Codes

| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | Error (check output for details) |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub personal access token |
| `GH_TOKEN` | GitHub token (alternative) |
| `OCTOCODE_SKILLS_DIR` | Custom skills installation directory |

---

## See Also

- [CLI Docs Index](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/README.md)
- [Skills Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md)

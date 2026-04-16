# Octocode CLI Reference

Compact reference for `octocode-cli`.

## Modes

Interactive setup:

```bash
npx octocode-cli
```

Direct commands:

```bash
octocode-cli <command> [options]
```

Tool contract:

```bash
octocode-cli --tools-context
octocode-cli --tool <toolName> '<json-stringified-input>'
```

## Global Flags

| Flag | What it does |
|---|---|
| `--help` | Show help |
| `--version` | Show version |
| `--tools-context` | Print Octocode MCP instructions plus a numbered list of tool input schemas |
| `--tool <name> <json>` | Run one Octocode tool with one JSON payload |

## Tool Mode

Get the full tool context:

```bash
octocode-cli --tools-context
```

Run one tool:

```bash
octocode-cli --tool localSearchCode '{"path":".","pattern":"runCLI"}'
octocode-cli --tool localGetFileContent '{"path":"packages/octocode-cli/src/cli/index.ts"}'
octocode-cli --tool githubSearchCode '{"owner":"bgauryy","repo":"octocode-mcp","keywordsToSearch":["tool"]}'
```

Tool behavior:

- The payload is one JSON string passed after the tool name.
- The CLI validates that JSON against the imported Octocode MCP tool schema.
- Shared research fields are auto-filled when missing.
- `--schema` shows the selected tool schema summary without running it.
- `--output json` returns the raw tool result.

## Command Index

| Command | Alias | Use it for |
|---|---|---|
| `install` | `i`, `setup` | Configure `octocode-mcp` for a client |
| `auth` | `a`, `gh` | Open auth menu or run auth subcommands |
| `login` | `l` | Start GitHub OAuth login |
| `logout` | - | Remove Octocode auth |
| `status` | `s` | Show GitHub auth status |
| `token` | `t` | Print token for scripts or debugging |
| `sync` | `sy` | Compare or sync MCP configs |
| `mcp` | - | Manage marketplace MCPs non-interactively |
| `skills` | `sk` | List, install, or remove bundled skills |
| `cache` | - | Inspect or clean Octocode cache/logs |

### Agent Subcommands

Flag-driven, agent-friendly entry points. Each maps to one Octocode MCP tool and auto-fills `id`, `mainResearchGoal`, `researchGoal`, and `reasoning`.

| Command | Tool | Use it for |
|---|---|---|
| `search-code` | `githubSearchCode` | Search code across GitHub repositories |
| `get-file` | `githubGetFileContent` | Fetch a file (or a window around a match) |
| `view-structure` | `githubViewRepoStructure` | List a repo directory tree |
| `search-repos` | `githubSearchRepositories` | Search repositories by keywords/topics |
| `search-prs` | `githubSearchPullRequests` | Search pull requests |
| `package-search` | `packageSearch` | Search npm or Python packages |

Examples:

```bash
octocode-cli search-code --query 'useReducer dispatch' --owner facebook --repo react
octocode-cli get-file --owner facebook --repo react --path packages/react/src/React.js --match-string useState
octocode-cli view-structure --owner bgauryy --repo octocode-mcp --depth 2
octocode-cli search-repos --topics typescript,mcp --stars '>=100'
octocode-cli search-prs --owner facebook --repo react --merged --limit 20
octocode-cli package-search --name react --ecosystem npm
```

Bulk queries: pipe `{"queries":[...]}` JSON on stdin to any subcommand. Flags are ignored when stdin is supplied.

```bash
echo '{"queries":[{"keywordsToSearch":["tool"],"owner":"bgauryy","repo":"octocode-mcp"}]}' \
  | octocode-cli search-code
```

Add `--json` to any agent subcommand to print the raw tool envelope (useful for piping).

## Install And Setup

```bash
octocode-cli install --ide <client> [--method <npx|direct>] [--force]
```

| Option | Meaning |
|---|---|
| `--ide` | Target client |
| `--method` | Install method. Default: `npx` |
| `--force` | Overwrite existing config |

Supported `--ide` values:
`cursor`, `claude-desktop`, `claude-code`, `windsurf`, `zed`, `vscode-cline`, `vscode-roo`, `vscode-continue`, `opencode`, `trae`, `antigravity`, `codex`, `gemini-cli`, `goose`, `kiro`.

Examples:

```bash
octocode-cli install --ide cursor
octocode-cli install --ide claude-desktop --method direct
octocode-cli install --ide codex --force
```

## Authentication

Auth menu or subcommands:

```bash
octocode-cli auth
octocode-cli auth login
octocode-cli auth logout
octocode-cli auth status
octocode-cli auth token
```

Login:

```bash
octocode-cli login [--hostname <host>] [--git-protocol <ssh|https>]
```

Logout:

```bash
octocode-cli logout [--hostname <host>]
```

Status:

```bash
octocode-cli status [--hostname <host>]
```

Token:

```bash
octocode-cli token [--type <auto|octocode|gh>] [--hostname <host>] [--source] [--json]
```

| Option | Meaning |
|---|---|
| `--type` | Token source priority. Default: `auto` |
| `--hostname` | GitHub or GHE host. Default: `github.com` |
| `--source` | Print source and user details |
| `--json` | JSON output for scripts |

## Config Sync

```bash
octocode-cli sync [--force] [--dry-run] [--status]
```

| Option | Meaning |
|---|---|
| `--force` | Auto-resolve conflicts |
| `--dry-run` | Preview changes only |
| `--status` | Show sync state only |

## MCP Marketplace

```bash
octocode-cli mcp list [--search <text>] [--category <name>] [--installed] [--client <client>|--config <path>]
octocode-cli mcp status [--client <client>|--config <path>]
octocode-cli mcp install --id <mcp-id> [--client <client>|--config <path>] [--env KEY=VALUE[,KEY=VALUE]] [--force]
octocode-cli mcp remove --id <mcp-id> [--client <client>|--config <path>]
```

| Option | Meaning |
|---|---|
| `--id` | MCP registry id for install/remove |
| `--client` | Target client config |
| `--config` | Custom config path |
| `--search` | Filter marketplace list |
| `--category` | Filter by category |
| `--installed` | Show only installed entries |
| `--env` | Extra env vars for install |
| `--force` | Overwrite existing entry |

Examples:

```bash
octocode-cli mcp list --search browser
octocode-cli mcp status --client cursor
octocode-cli mcp install --id playwright-mcp --client cursor --force
octocode-cli mcp remove --id playwright-mcp --client cursor
```

## Skills

```bash
octocode-cli skills list
octocode-cli skills install [--skill <name>] [--targets <list>] [--mode <copy|symlink>] [--force]
octocode-cli skills remove --skill <name> [--targets <list>]
```

Use the [Skills Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md) for targets, install behavior, and bundled skill details.

## Cache

```bash
octocode-cli cache [status|clean] [--repos] [--skills] [--logs] [--all] [--tools|--local|--lsp|--api]
```

| Flag | Meaning |
|---|---|
| `--repos` | Cloned repository cache |
| `--skills` | Skills marketplace cache |
| `--logs` | Octocode logs |
| `--all` | Repos + skills + logs |
| `--tools` / `--local` / `--lsp` / `--api` | In-memory tool caches. Cleared on MCP restart |

## Environment

| Variable | Meaning |
|---|---|
| `GITHUB_TOKEN` | GitHub PAT |
| `GH_TOKEN` | Alternative GitHub token |
| `OCTOCODE_HOME` | Override data directory |

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Error |

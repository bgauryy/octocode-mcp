# Octocode CLI

<div align="center">

[![npm version](https://img.shields.io/npm/v/octocode-cli.svg?style=flat-square)](https://www.npmjs.com/package/octocode-cli)
[![npm downloads](https://img.shields.io/npm/dm/octocode-cli.svg?style=flat-square)](https://www.npmjs.com/package/octocode-cli)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/LICENSE)

**Installer and management CLI for Octocode MCP servers and AI skills.**

[Website](https://octocode.ai) | [Documentation](https://github.com/bgauryy/octocode-mcp/blob/main/docs/README.md) | [GitHub](https://github.com/bgauryy/octocode-mcp)

<img src="https://raw.githubusercontent.com/bgauryy/octocode-mcp/main/packages/octocode-cli/assets/example.png" alt="Octocode CLI Demo" width="700" style="border-radius: 8px; margin: 20px 0;">

</div>

Octocode CLI configures [octocode-mcp](https://www.npmjs.com/package/octocode-mcp) across AI editors, manages GitHub authentication, synchronizes MCP configs, and installs AI skills.

---

## Quick Start

```bash
npx octocode-cli
```

The interactive menu covers MCP setup, skills, auth, and sync. For non-interactive use, see the [CLI Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/CLI_REFERENCE.md).

---

## Features

- **MCP installation** — configure `octocode-mcp` for Cursor, Claude Desktop, Windsurf, Zed, Claude Code, Trae, Antigravity, Opencode, and VS Code extensions (Cline, Roo-Cline, Continue).
- **MCP marketplace** — browse and install 100+ community MCP servers from the terminal.
- **Skills manager** — install 9 bundled `octocode-*` skills across clients (Claude Code, Claude Desktop, Cursor, Codex, Opencode). Supports single-skill, multi-target, copy, and symlink modes.
- **Skills marketplace** — browse and install skills from 20 community marketplace sources.
- **Config sync** — keep MCP configurations consistent across all IDEs.
- **Authentication** — GitHub OAuth device flow with AES-256-GCM encrypted token storage; supports Octocode OAuth, `gh` CLI, and env-var tokens.
- **Cache management** — inspect and clean cloned-repo cache, skills marketplace cache, and logs.

---

## Interactive Menu

| Item | What it does |
|------|-------------|
| Octocode MCP | Install and configure octocode-mcp for your IDEs |
| Octocode Skills | Quick-install bundled Octocode skills |
| Manage System Skills | Browse skills marketplaces, manage installed skills |
| Manage Auth | Sign in/out via Octocode OAuth or gh CLI |
| Manage System MCP | Sync configs, browse MCP marketplace, inspect settings |

---

## CLI Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `install` | `i` | Configure octocode-mcp for an IDE |
| `skills` | `sk` | List, install, or remove bundled skills |
| `sync` | `sy` | Sync MCP configs across IDEs |
| `mcp` | — | Non-interactive MCP marketplace (`list`, `status`, `install`, `remove`) |
| `auth` | `a`, `gh` | Auth menu (`auth login`, `logout`, `status`, `token`) |
| `login` / `logout` | `l` | GitHub OAuth login/logout |
| `token` | `t` | Print token; `--json` for machine output |
| `status` | `s` | GitHub auth status |
| `cache` | — | Inspect/clean disk cache |

Full options and examples: [CLI Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/CLI_REFERENCE.md).

---

## Skills

### Bundled Skills

| Skill | When to use |
|-------|-------------|
| `octocode-researcher` | Code exploration — find, trace, definitions |
| `octocode-research` | Deep research via HTTP research server |
| `octocode-engineer` | Codebase-aware engineering, analysis, and implementation |
| `octocode-plan` | Plan, implement, and verify |
| `octocode-rfc-generator` | RFCs and design docs |
| `octocode-pull-request-reviewer` | PR and staged-change review |
| `octocode-documentation-writer` | Generate project documentation |
| `octocode-prompt-optimizer` | Harden prompts and SKILL files |
| `octocode-roast` | Brutally honest code critique |

### Installing Skills

Default target is `claude-code` (`~/.claude/skills/`). Use `--targets` for multiple clients and `--mode` to choose copy or symlink.

```bash
npx octocode-cli skills list                                        # see what's installed
npx octocode-cli skills install                                     # install all (default target)
npx octocode-cli skills install --skill octocode-researcher         # install one skill
npx octocode-cli skills install --skill octocode-researcher --force # update existing
npx octocode-cli skills install --targets claude-code,cursor,codex  # multi-target
npx octocode-cli skills install --targets claude-code,cursor --mode symlink
npx octocode-cli skills remove --skill octocode-researcher --targets claude-code,cursor
```

Supported `--targets`: `claude-code`, `claude-desktop`, `cursor`, `codex`, `opencode`.

Set `"skillsDestDir"` in `~/.octocode/config.json` to customize the `claude-code` destination.

Full reference: [Skills Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md).

---

## Supported Clients

| Client | Config Location (macOS) |
|--------|-------------------------|
| Cursor | `~/.cursor/mcp.json` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Zed | `~/.config/zed/settings.json` |
| Claude Code | `~/.claude.json` |
| Trae | `~/Library/Application Support/Trae/mcp.json` |
| Antigravity | `~/.gemini/antigravity/mcp_config.json` |
| Opencode | `~/Library/Application Support/opencode/config.json` |
| VS Code (Cline, Roo-Cline, Continue) | Varies by extension |

---

## Troubleshooting

```bash
npx node-doctor                          # diagnose environment
rm -rf ~/.octocode && npx octocode-cli login # reset credentials
npx octocode-cli status                      # verify auth
```

- **Token expired** — run `npx octocode-cli login`.
- **Browser not opening** — copy the authorization URL from the terminal.

---

## Privacy & Telemetry

De-identified telemetry (command usage, error rates) is collected to improve the tool. Source code, env vars, and PII are never collected. Opt out: `export LOG=false`

[Privacy Policy](https://github.com/bgauryy/octocode-mcp/blob/main/PRIVACY.md) | [Terms of Usage](https://github.com/bgauryy/octocode-mcp/blob/main/TERMS.md)

---

MIT. Copyright 2026 Octocode AI.

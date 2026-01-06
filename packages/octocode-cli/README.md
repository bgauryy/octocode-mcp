# 🐙 Octocode CLI

**Installer for [octocode-mcp](https://www.npmjs.com/package/octocode-mcp) + management hub for all your MCP servers and AI skills.**

- 🚀 **Install** octocode-mcp for Cursor, Claude, Windsurf, Zed & more
- 🔌 **Marketplace** - Browse & install 70+ community MCP servers
- 🧠 **Skills** - Install AI coding skills for Claude Code
- 🔄 **Sync** - Keep MCP configs in sync across all your IDEs

<p align="center">
  <img src="https://raw.githubusercontent.com/bgauryy/octocode-mcp/main/packages/octocode-cli/assets/example.png" alt="Octocode CLI" width="700">
</p>

## ⚡ Quick Start

```bash
npx octocode-cli
```

The interactive wizard guides you through everything.

---

## 🎯 Interactive Menu

| Option | Description |
|--------|-------------|
| **🐙 Octocode Configuration** | Install MCP server, configure GitHub auth |
| **🧠 Manage System Skills** | Install skills for Claude Code |
| **⚡ Manage System MCP** | Sync configs, MCP marketplace, open config files |

### Octocode Configuration

- Install for Cursor, Claude Desktop, Windsurf, Zed, and more
- Choose install method: NPX (recommended) or Direct
- Authenticate with GitHub via OAuth or gh CLI

### Skills Menu

- Install pre-built Octocode skills: `research`, `plan`, `pr-review`, `generate`
- Browse marketplace for community skills
- Manage installed skills

### MCP Management

- **Sync** - Synchronize MCP configs across all your IDEs
- **Marketplace** - Browse & install 70+ community MCP servers
- **Open Config** - Edit config files directly in your IDE

---

## 🔧 CLI Commands

### Installation

```bash
# Install for specific IDE
octocode install --ide cursor --method npx
octocode install --ide claude-desktop --method direct

# Force overwrite existing config
octocode install --ide cursor -f
```

### GitHub Authentication

```bash
octocode login                    # Sign in via OAuth
octocode logout                   # Sign out
octocode status                   # Check auth status
octocode token                    # Print token

# Interactive auth menu
octocode auth

# GitHub Enterprise
octocode login --hostname github.mycompany.com
```

### Skills Management

```bash
octocode skills list              # List available skills
octocode skills install           # Install all skills
octocode skills install --force   # Overwrite existing
```

### Config Sync

```bash
octocode sync                     # Sync MCP configs across IDEs
octocode sync --status            # Show sync status only
octocode sync --dry-run           # Preview without changes
octocode sync --force             # Auto-resolve conflicts
```

---

## 📋 Command Reference

| Command | Aliases | Description |
|---------|---------|-------------|
| `install` | `i` | Install octocode-mcp for an IDE |
| `login` | `l` | Sign in to GitHub |
| `logout` | - | Sign out from GitHub |
| `status` | `s` | Show auth status |
| `token` | `t` | Print GitHub token |
| `auth` | `a`, `gh` | Auth menu (login/logout/status/token) |
| `skills` | `sk` | Manage Octocode skills |
| `sync` | `sy` | Sync MCP configs across IDEs |

### Options

| Option | Description |
|--------|-------------|
| `--ide <ide>` | Target IDE (see supported clients) |
| `--method <m>` | `npx` (default) or `direct` |
| `--hostname <h>` | GitHub Enterprise host |
| `--type <t>` | Token source: `auto`, `octocode`, `gh` |
| `-f, --force` | Overwrite/force operation |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

---

## 🖥️ Supported Clients

| Client | Description |
|--------|-------------|
| `cursor` | AI-first code editor |
| `claude-desktop` | Anthropic's Claude desktop app |
| `claude-code` | Claude CLI for terminal |
| `windsurf` | Codeium AI IDE |
| `zed` | High-performance editor |
| `vscode-cline` | Cline AI extension |
| `vscode-roo` | Roo-Cline extension |
| `vscode-continue` | Continue AI assistant |
| `opencode` | AI coding agent CLI |
| `trae` | Adaptive AI IDE |
| `custom` | Custom config path |

---

## 📁 Config Files

| IDE | macOS | Windows |
|-----|-------|---------|
| Cursor | `~/.cursor/mcp.json` | `%APPDATA%\Cursor\mcp.json` |
| Claude Desktop | `~/Library/Application Support/Claude/` | `%APPDATA%\Claude\` |
| Claude Code | `~/.claude.json` | `%USERPROFILE%\.claude.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `%APPDATA%\Codeium\windsurf\` |
| Zed | `~/.config/zed/settings.json` | `%APPDATA%\Zed\settings.json` |

---

## 🔐 Authentication

Credentials are encrypted (AES-256-GCM) and stored in `~/.octocode/`.

**Token Priority** (for `octocode token`):
1. `GITHUB_TOKEN` environment variable
2. gh CLI token
3. Octocode OAuth token

```bash
# Specific token source
octocode token --type=octocode    # Octocode OAuth only
octocode token --type=gh          # gh CLI only
octocode token --source           # Show source info
```

---

## 🔧 Troubleshooting

```bash
# Diagnose Node.js issues
npx node-doctor

# Reset credentials
rm -rf ~/.octocode && octocode login

# Check credential location
octocode status
```

| Issue | Solution |
|-------|----------|
| Token expired | `octocode login` |
| Not authenticated | `octocode login` |
| Browser doesn't open | Copy URL from terminal |

---

## 📋 Requirements

- **Node.js** >= 18.0.0

## 🔗 Links

- [Octocode Website](https://octocode.ai)
- [octocode-mcp](https://www.npmjs.com/package/octocode-mcp)
- [GitHub Repository](https://github.com/bgauryy/octocode-mcp)

## 📄 License

PolyForm-Small-Business-1.0.0

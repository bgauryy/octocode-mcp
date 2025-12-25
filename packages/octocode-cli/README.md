# 🐙 Octocode CLI

**The easiest way to set up [octocode-mcp](https://www.npmjs.com/package/octocode-mcp) for your AI coding assistant.**

One command. Interactive setup. Done in seconds.

<p align="center">
  <img src="https://raw.githubusercontent.com/bgauryy/octocode-mcp/main/packages/octocode-cli/assets/example.png" alt="Octocode CLI" width="700">
</p>

## ⚡ Quick Start

```bash
npx octocode-cli
```

That's it! The interactive wizard will guide you through everything.

## ✨ Features

- 🎯 **Zero Config** - Interactive prompts handle everything
- 🔍 **Auto-Detection** - Finds installed IDEs automatically
- ✅ **Environment Check** - Validates Node.js, npm & GitHub CLI
- 🛡️ **Safe Updates** - Preserves existing MCP configurations

## 📦 Installation

### Run Directly (Recommended)

No installation needed - just run:

```bash
npx octocode-cli
```

### Global Install

For frequent use:

```bash
npm install -g octocode-cli
octocode
```

## 🖥️ Supported Clients

| Client | Description | Status |
|--------|-------------|--------|
| **Cursor** | AI-first code editor | ✅ Supported |
| **Claude Desktop** | Anthropic's desktop app | ✅ Supported |
| **Claude Code** | Claude CLI for terminal | ✅ Supported |
| **Windsurf** | Codeium AI IDE | ✅ Supported |
| **Zed** | High-performance editor | ✅ Supported |
| **Cline** | VS Code AI extension | ✅ Supported |

## 🔧 CLI Mode

For automation or CI/CD, use CLI flags:

```bash
# Install for Cursor using NPX method
octocode install --ide cursor --method npx

# Install for Claude Desktop
octocode install --ide claude --method direct

# Force overwrite existing config
octocode install --ide cursor --method npx --force

# Check GitHub authentication
octocode auth
```

### Commands

| Command | Description |
|---------|-------------|
| `install` | Install octocode-mcp for an IDE |
| `auth` | Check GitHub CLI authentication status |

### Options

| Option | Description |
|--------|-------------|
| `--ide <ide>` | IDE to configure: `cursor`, `claude`, `claude-code`, `windsurf`, `zed`, `cline` |
| `--method <method>` | Installation method: `npx` or `direct` |
| `-f, --force` | Overwrite existing configuration |
| `-h, --help` | Show help message |
| `-v, --version` | Show version number |

## 📁 Configuration Files

The CLI automatically updates the correct config file for each IDE:

| IDE | macOS | Windows |
|-----|-------|---------|
| Cursor | `~/.cursor/mcp.json` | `%APPDATA%\Cursor\mcp.json` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Code | `~/.claude.json` | `%USERPROFILE%\.claude.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `%APPDATA%\Codeium\windsurf\mcp_config.json` |
| Zed | `~/.config/zed/settings.json` | `%APPDATA%\Zed\settings.json` |
| Cline | VS Code settings | VS Code settings |

## 🔐 GitHub Authentication

Octocode uses GitHub CLI (`gh`) for secure authentication:

```bash
# Check your auth status
octocode auth

# Install GitHub CLI if needed
# macOS
brew install gh

# Windows
winget install GitHub.cli

# Then authenticate
gh auth login
```

## 📋 Requirements

- **Node.js** >= 18.0.0
- **GitHub CLI** (recommended for best experience)

## 🔧 Troubleshooting

If you encounter issues with Node.js or npm, run the following command to diagnose problems:

```bash
npx node-doctor
```

This will check your Node.js environment and help identify common issues with your installation.

## 🔗 Links

- [Octocode Website](https://octocode.ai)
- [octocode-cli on NPM](https://www.npmjs.com/package/octocode-cli)
- [octocode-mcp on NPM](https://www.npmjs.com/package/octocode-mcp)
- [GitHub Repository](https://github.com/bgauryy/octocode-mcp)

## 📄 License

PolyForm-Small-Business-1.0.0

# 🐙 Octocode CLI

<div align="center">

[![npm version](https://img.shields.io/npm/v/octocode-cli.svg?style=flat-square)](https://www.npmjs.com/package/octocode-cli)
[![npm downloads](https://img.shields.io/npm/dm/octocode-cli.svg?style=flat-square)](https://www.npmjs.com/package/octocode-cli)
[![License](https://img.shields.io/badge/license-PolyForm--Small--Business-blue.svg?style=flat-square)](LICENSE)

**The unified installer and management hub for Octocode MCP servers and AI skills.**

[Website](https://octocode.ai) • [Documentation](https://docs.octocode.ai) • [GitHub](https://github.com/bgauryy/octocode-mcp)

<img src="https://raw.githubusercontent.com/bgauryy/octocode-mcp/main/packages/octocode-cli/assets/example.png" alt="Octocode CLI Demo" width="700" style="border-radius: 8px; margin: 20px 0;">

</div>

**Octocode CLI** is the essential companion for AI-assisted development. It streamlines the installation of [octocode-mcp](https://www.npmjs.com/package/octocode-mcp), manages authentication across multiple AI clients, and keeps your MCP configurations synchronized.

---

## ✨ Key Features

- **🚀 One-Step Installation**: Instantly configure `octocode-mcp` for Cursor, Claude Desktop, Windsurf, Zed, and more.
- **🔌 MCP Marketplace**: Browse and install over 70+ community-vetted MCP servers directly from your terminal.
- **🧠 AI Skills Manager**: Install and update specialized AI coding skills for Claude Code (`research`, `local-search`, `implement`, `plan`, `pr-review`, `roast`).
- **🔄 Universal Sync**: Keep your MCP configurations and authentication states synchronized across all your IDEs.
- **🔐 Secure Authentication**: Enterprise-grade token management with encrypted storage and multiple auth providers.

---

## 🚀 Quick Start

Get up and running in seconds. The interactive wizard will guide you through installation and authentication.

```bash
npx octocode-cli
```

---

## 📦 Installation & Usage

### Interactive Mode
The recommended way to use Octocode CLI. Access all features through a unified menu:
- **Octocode Configuration**: Setup MCP servers and GitHub auth.
- **Manage System Skills**: Install AI capabilities.
- **Manage System MCP**: Sync configs and browse the marketplace.

```bash
npx octocode-cli
```

### CLI Commands
For automation and power users, Octocode CLI offers a comprehensive command-line interface.

#### 1. Install Octocode MCP
Install the GitHub MCP server for your preferred IDE.

```bash
# Interactive install
octocode-cli install

# Specific IDEs
octocode-cli install --ide cursor --method npx
octocode-cli install --ide claude-desktop --method direct
octocode-cli install --ide windsurf
```

#### 2. Manage Authentication
Securely authenticate with GitHub. Credentials are encrypted (AES-256-GCM) and stored in `~/.octocode/`.

```bash
# Interactive login
octocode-cli login

# Check status
octocode-cli status

# Enterprise Login
octocode-cli login --hostname github.mycompany.com
```

#### 3. Sync Configurations
Keep your MCP settings consistent across different editors.

```bash
# Sync all IDEs
octocode-cli sync

# Preview changes
octocode-cli sync --dry-run
```

#### 4. Manage Skills
Install AI skills for Claude Code.

```bash
# List available skills
octocode-cli skills list

# Install all standard skills
octocode-cli skills install
```

#### 5. Additional Commands
Other useful commands for power users.

```bash
# Logout from GitHub
octocode-cli logout

# Get GitHub token (for scripting)
octocode-cli token

# Auth management menu
octocode-cli auth
```

---

## 🖥️ Supported Clients

Octocode CLI supports a wide range of AI-first editors and tools.

| Client | Description | Config Location (macOS) |
|--------|-------------|-------------------------|
| **Cursor** | AI-first code editor | `~/.cursor/mcp.json` |
| **Claude Desktop** | Anthropic's desktop app | `~/Library/Application Support/Claude/` |
| **Windsurf** | Codeium AI IDE | `~/.codeium/windsurf/mcp_config.json` |
| **Zed** | High-performance editor | `~/.config/zed/settings.json` |
| **Claude Code** | CLI Assistant | `~/.claude.json` |
| **Trae** | Adaptive AI IDE | `~/Library/Application Support/Trae/mcp.json` |
| **Antigravity** | Gemini-powered AI IDE | `~/.gemini/antigravity/mcp_config.json` |
| **Opencode** | AI coding agent CLI | `~/.config/opencode/config.json` |
| **VS Code Extensions** | Cline, Roo-Cline, Continue | *(Varies by extension)* |

---

## 🔧 Troubleshooting

If you encounter issues, try the following commands:

```bash
# Diagnose environment issues
npx node-doctor

# Reset local credentials
rm -rf ~/.octocode && octocode-cli login

# Verify auth status
octocode-cli status
```

**Common Issues:**
- **Token Expired**: Run `octocode-cli login` to refresh credentials.
- **Browser Not Opening**: Copy the authorization URL manually from the terminal.

---

## 📄 License

This project is licensed under the **PolyForm Small Business License 1.0.0**.

Copyright © 2024 Octocode AI.

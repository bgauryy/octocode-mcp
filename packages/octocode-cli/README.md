# 🐙 Octocode CLI

<div align="center">

[![npm version](https://img.shields.io/npm/v/octocode-cli.svg?style=flat-square)](https://www.npmjs.com/package/octocode-cli)
[![npm downloads](https://img.shields.io/npm/dm/octocode-cli.svg?style=flat-square)](https://www.npmjs.com/package/octocode-cli)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

**The unified installer and management hub for Octocode MCP servers and AI skills.**

[Website](https://octocode.ai) • [Documentation](https://github.com/bgauryy/octocode-mcp/blob/main/docs/README.md) • [GitHub](https://github.com/bgauryy/octocode-mcp)

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

| Menu Item | Description |
|-----------|-------------|
| **🐙 Octocode MCP** | Install and configure Octocode MCP for your IDEs |
| **🐙 Octocode Skills** | Install AI-powered research, planning & review skills |
| **🧠 Manage System Skills** | Browse skills marketplace and manage installed skills |
| **🔑 Manage Auth** | Sign in/out via Octocode OAuth or gh CLI |
| **⚡ Manage System MCP** | Sync configs, browse MCP marketplace, inspect settings |

```bash
npx octocode-cli
```

### CLI Commands

For the complete CLI reference including all commands and options, see the [CLI Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/CLI_REFERENCE.md).

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

## Privacy & Telemetry

Octocode collects **de-identified** telemetry data to improve the tool, including command usage and error rates. We **never** collect source code, environment variables, or PII.

You can opt-out at any time:

```bash
export LOG=false
```

For full details, please read our [Privacy Policy](https://github.com/bgauryy/octocode-mcp/blob/main/PRIVACY.md) and [Terms of Usage](https://github.com/bgauryy/octocode-mcp/blob/main/TERMS.md).

---

## 📄 License

This project is licensed under the **MIT License**.

Copyright © 2026 Octocode AI.

# 🔍🐙 Octocode 

> **Use Octocode. Smart Search. Any Code.**

[Octocode.ai](https://octocode.ai) • [GitHub Repository](https://github.com/bgauryy/octocode-mcp) • [Report Issues](https://github.com/bgauryy/octocode-mcp/issues)

---

## Overview

**Transform GitHub into instant AI knowledge.**

Octocode is the leading AI-powered GitHub code intelligence platform. This extension configures the **Octocode MCP Server** as a local agent, enabling your AI assistant (Cursor, Windsurf, VS Code Copilot, Claude) to perform deep research, architectural analysis, and pattern discovery across millions of public and private repositories.

### Requirements
- **Node.js**: v20 or higher
- **GitHub Account**: Authorized user
  - [gh CLI](https://cli.github.com/) -> `gh auth login`
   - [`GITHUB_TOKEN`](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) env param


---

## Prompts Menu

Start with `/help` or `/init` to get started!

### `/init`
**Context Gathering**
Interactive interview to establish user role, goals, and constraints. Creates `.octocode/context/context.md`.

### `/research`
**Code Forensics & Discovery**
Deep code discovery, pattern analysis, and bug investigation. Uses parallel bulk queries & staged analysis to prove flows.

### `/plan`
**Adaptive Research & Implementation**
Research, Plan & Implement complex tasks. Breaks down tasks, finds patterns, and guides execution (Interactive/Auto).

### `/generate`
**App Scaffolding**
Research-driven stack selection and project setup. "Measure twice, cut once" approach to new projects.

### `/review_pull_request`
**PR Review** (*Args: `prUrl`*)
Defects-First PR review. Focuses on bugs, security, complexity, and code quality.

### `/review_security`
**Security Audit** (*Args: `repoUrl`*)
Risk assessment and vulnerability surfacing. Maps attack surface and investigates specific risks.

---

## Tools Available

All tools support bulk operations (1-3 queries).

| Tool | Purpose | Key Args |
|------|---------|----------|
| `githubSearchRepositories` | **DISCOVER**: Find repos | `stars`, `topicsToSearch` |
| `githubViewRepoStructure` | **EXPLORE**: Map layout | `depth`, `path` |
| `githubSearchCode` | **SEARCH**: Find patterns | `keywordsToSearch`, `match="path"\|"file"` |
| `githubGetFileContent` | **ANALYZE**: Read logic | `matchString`, `startLine` |
| `githubSearchPullRequests` | **HISTORY**: PR context | `prNumber`, `state`, `diff` |
| `packageSearch` | **DEPS**: Library meta | `query` |

> **Note**: Octocode also supports NPM for smart research and dependency analysis.

---

## Installation Example

You can configure Octocode manually in your MCP settings (Cursor, Claude, etc.) using the examples below.

### Prerequisites

*   **GitHub CLI**: [https://cli.github.com/](https://cli.github.com/) (Recommended)
*   **Tokens** (only `repo` read permission is required!):
    *   Classic Token: [https://github.com/settings/tokens/new](https://github.com/settings/tokens/new)
    *   Fine-grained Token: [https://github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)

### Mac / Linux Default (GitHub CLI)
*Use this if you have `gh` installed and authenticated (`gh auth login`).*

```json
{
  "octocode": {
    "command": "npx",
    "args": [
      "octocode-mcp@latest"
    ]
  }
}
```

### Windows Default / With PAT
*Use this if you need to provide a Personal Access Token directly.*

```json
{
  "octocode": {
    "command": "npx",
    "args": [
      "octocode-mcp@latest"
    ],
    "env": {
      "GITHUB_TOKEN": "ghp_your_token_here"
    }
  }
}
```

---

## Troubleshooting

For any issues with installation or authentication, please visit:
**[https://octocode.ai/?auth=cli#installation](https://octocode.ai/?auth=cli#installation)**

For more details on features, prompts, and documentation, visit **[octocode.ai](https://octocode.ai)**.

---

## Supported IDEs & AI Assistants

This extension works with all major AI-powered editors and assistants:

### Editors (Auto-Detection)

| IDE | Status | Config Location |
|-----|--------|-----------------|
| **Cursor** | Native MCP | `~/.cursor/mcp.json` |
| **Windsurf** | Native MCP | `~/.codeium/windsurf/mcp_config.json` |
| **Trae** | Native MCP | Platform-specific* |
| **Antigravity** | Native MCP | `~/.gemini/antigravity/mcp_config.json` |
| **VS Code** | Via Claude Desktop | Platform-specific* |

<details>
<summary>*Platform-specific paths</summary>

- **Trae**: macOS: `~/Library/Application Support/Trae/mcp.json` · Windows: `%APPDATA%/Trae/mcp.json` · Linux: `~/.config/Trae/mcp.json`
- **VS Code**: Falls back to Claude Desktop config · macOS: `~/Library/Application Support/Claude/claude_desktop_config.json` · Windows: `%APPDATA%/Claude/claude_desktop_config.json` · Linux: `~/.config/Claude/claude_desktop_config.json`

</details>

### AI Assistants & Other Clients (Manual Install)

| Assistant | Command | Config Location |
|-----------|---------|-----------------|
| **Cline** | `Install for Cline` | VS Code globalStorage |
| **Roo Code** | `Install for Roo Code` | VS Code globalStorage |

---

## GitHub Token Configuration

### Option 1: Via VS Code Extension (Recommended)

The easiest way to configure your GitHub token:

```
1. Open VS Code Settings (Cmd/Ctrl + ,)
2. Search for "Octocode"
3. Enter your GitHub token in "Octocode: Github Token"
4. Restart your editor
```

The extension automatically:
- Detects your editor type
- Writes the token to the correct MCP config file
- Passes `GITHUB_TOKEN` as an environment variable to the MCP server

### Option 2: Via GitHub CLI (Zero Config)

If you have `gh` CLI installed and authenticated:

```bash
gh auth login
```

Octocode automatically uses your `gh` CLI credentials - no token configuration needed!

### Option 3: Manual MCP Configuration

Add directly to your MCP config file:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

### Token Permissions Required

Only **read** permissions are needed:
- `repo` (for private repos) or `public_repo` (for public only)
- Create tokens at: [github.com/settings/tokens](https://github.com/settings/tokens/new)

---

## What This Extension Does

This extension **automatically configures** the Octocode MCP server for your editor and AI assistants:

| Feature | Description |
|---------|-------------|
| **Auto-Detection** | Detects your editor (Cursor, Windsurf, Antigravity, Trae) and configures the appropriate MCP settings |
| **Multi-Client Support** | Installs MCP config for Cline, Roo Code, and more |
| **Token Management** | Passes your `GITHUB_TOKEN` from VS Code settings to the MCP server |
| **Status Bar** | Shows server status with click-to-toggle controls |
| **Cross-Platform** | Works on macOS, Windows, and Linux |

### Commands

Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run:

#### 🔐 GitHub Authentication

| Command | Action |
|---------|--------|
| `Octocode MCP: Sign in to GitHub` | **OAuth login** - Authenticate with GitHub (recommended) |
| `Octocode MCP: Sign out of GitHub` | Clear GitHub token from MCP configs |
| `Octocode MCP: Show GitHub Auth Status` | Check current authentication status |

#### ⚙️ MCP Installation

| Command | Action |
|---------|--------|
| `Octocode MCP: Install MCP Server` | Configure MCP for current editor |
| `Octocode MCP: Install for All Clients` | Configure MCP for all supported AI assistants |
| `Octocode MCP: Install for Cline` | Configure MCP for Cline |
| `Octocode MCP: Install for Roo Code` | Configure MCP for Roo Code |
| `Octocode MCP: Install for Trae` | Configure MCP for Trae |

#### 🚀 Server Control

| Command | Action |
|---------|--------|
| `Octocode MCP: Start Server` | Start the MCP server process |
| `Octocode MCP: Stop Server` | Stop the MCP server process |
| `Octocode MCP: Show Status` | Show current server status and instructions |

> **Note**: The extension auto-installs the MCP configuration on first activation. Restart your editor to enable it.

---

<div align="center">
  <p>Powered by <a href="https://octocode.ai"><b>Octocode.ai</b></a></p>
</div>

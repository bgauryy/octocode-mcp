# 🔍🐙 Octocode 

> **Use Octocode. Smart Search. Any Code.**

[Octocode.ai](https://octocode.ai) • [GitHub Repository](https://github.com/bgauryy/octocode-mcp) • [Report Issues](https://github.com/bgauryy/octocode-mcp/issues)

📚 **Docs, tutorials & more info:** [**octocode.ai**](https://octocode.ai/)

---

## Overview

**Transform GitHub into instant AI knowledge.**

Octocode is the leading AI-powered GitHub code intelligence platform. This extension configures the **Octocode MCP Server** as a local agent, enabling your AI assistant (Cursor, Windsurf, VS Code Copilot, Claude) to perform deep research, architectural analysis, and pattern discovery across millions of public and private repositories.

### Requirements
- **Node.js**: v20 or higher
---

### 🔐 GitHub Authentication

#### ✅ Already Done?

If you have **GitHub CLI (`gh`) installed and logged in** → **You're all set!** Octocode works automatically.

Check: Run `gh auth status` in terminal. If it shows your username, skip to [Prompts Menu](#prompts-menu).

---

#### ⭐ Default: Sign in Command

The quickest way to get started - works on all platforms:

| Step | What to do |
|------|------------|
| **1** | Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows) |
| **2** | Type **`Octocode MCP: Sign in to GitHub`** → press Enter |
| **3** | A popup shows a **code** → **Copy it** |
| **4** | Browser opens → **Paste the code** |
| **5** | Click **Authorize** → ✅ Done! |

Token syncs automatically to all your MCP configs.

---

#### 🆕 Alternative Methods:

| Your Situation | Best Method |
|----------------|-------------|
| 🍎 **macOS / Linux** | [GitHub CLI](#-github-cli) (easiest) |
| 🏢 **Organization/Enterprise repos** | [GitHub CLI](#-github-cli) (handles SSO/SAML) |
| 🔧 **Custom setup / CI/CD** | [Manual Token](#-manual-token) |

---

#### 🖥️ GitHub CLI

Best for: macOS, Linux, and **organization repos** (handles SSO automatically)

```bash
# Step 1: Install gh CLI
# macOS
brew install gh

# Or download from: https://cli.github.com/

# Step 2: Login (follow the prompts)
gh auth login
```

That's it! No token configuration needed. Octocode detects `gh` automatically.

---

#### 🔑 Manual Token

Best for: Custom setups, CI/CD, or fine-grained permissions

**Step 1:** Create a token
- [Classic Token](https://github.com/settings/tokens/new) - simpler setup
- [Fine-grained Token](https://github.com/settings/personal-access-tokens/new) - supports read-only

**Step 2:** Add to your MCP config file:

```json
{
  "octocode": {
    "command": "npx",
    "args": ["octocode-mcp@latest"],
    "env": {
      "GITHUB_TOKEN": "ghp_your_token_here"
    }
  }
}
```

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
| [**Cursor**](https://cursor.sh) | Native MCP | `~/.cursor/mcp.json` |
| [**Windsurf**](https://codeium.com/windsurf) | Native MCP | `~/.codeium/windsurf/mcp_config.json` |
| [**Trae**](https://trae.ai) | Native MCP | Platform-specific* |
| [**Antigravity**](https://antigravity.dev) | Native MCP | `~/.gemini/antigravity/mcp_config.json` |
| [**VS Code**](https://code.visualstudio.com) | Via Claude Desktop | Platform-specific* |

<details>
<summary>*Platform-specific paths</summary>

- **Trae**: macOS: `~/Library/Application Support/Trae/mcp.json` · Windows: `%APPDATA%/Trae/mcp.json` · Linux: `~/.config/Trae/mcp.json`
- **VS Code**: Falls back to Claude Desktop config · macOS: `~/Library/Application Support/Claude/claude_desktop_config.json` · Windows: `%APPDATA%/Claude/claude_desktop_config.json` · Linux: `~/.config/Claude/claude_desktop_config.json`

</details>

### AI Assistants & Other Clients (Manual Install)

| Assistant | Command | Config Location |
|-----------|---------|-----------------|
| [**Cline**](https://github.com/cline/cline) | `Install for Cline` | VS Code globalStorage |
| [**Roo Code**](https://github.com/RooVetGit/Roo-Code) | `Install for Roo Code` | VS Code globalStorage |

---

## Token Permissions

**Via OAuth or GitHub CLI**:
- `repo` scope is required for private repos (GitHub OAuth has no read-only scope)
- Octocode only performs **read operations** - your repos are safe

**Want True Read-Only Access?** Use a Fine-grained PAT:
1. Create at: [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
2. Select repositories → All or specific repos
3. Set permissions: `Contents: Read-only` ✓ and `Metadata: Read-only` ✓
4. Add token manually to MCP config (see [Requirements](#requirements))

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

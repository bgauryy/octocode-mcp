<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">
  
  A Model Context Protocol (MCP) server enabling AI assistants to search, analyze, and extract insights from millions of GitHub repositories with enterprise-grade security and token efficiency.

  [![MCP Community Server](https://img.shields.io/badge/Model_Context_Protocol-Official_Community_Server-blue?style=flat-square)](https://github.com/modelcontextprotocol/servers)
  [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/bgauryy/octocode-mcp)
  [![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/bgauryy/octocode-mcp)](https://archestra.ai/mcp-catalog/bgauryy__octocode-mcp)

  <a href="https://www.npmjs.com/package/octocode-mcp"><img alt="npm version" src="https://img.shields.io/npm/v/octocode-mcp?label=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/octocode-mcp"><img alt="npm downloads" src="https://img.shields.io/npm/dm/octocode-mcp?color=cb3837"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-green"></a>

  <a href="https://octocode.ai"><img src="https://img.shields.io/badge/Website-007ACC?style=for-the-badge&logo=link&logoColor=white" alt="Website"></a>
  <a href="https://www.youtube.com/@Octocode-ai"><img src="https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="YouTube Channel"></a>

  <br />
  <br />

  <a href="https://cursor.com/en/install-mcp?name=octocode&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJvY3RvY29kZS1tY3BAbGF0ZXN0Il19"><img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor" width="180px"></a>

</div>

---

<div align="center">

### ✨ Featured On

[![MCP Official Servers](https://img.shields.io/badge/MCP-Official%20Community%20Server-007ACC?style=for-the-badge&logo=github&logoColor=white)](https://github.com/modelcontextprotocol/servers)
[![Awesome MCP Servers](https://img.shields.io/badge/Awesome-MCP%20Servers-FF6B6B?style=for-the-badge&logo=github&logoColor=white)](https://github.com/punkpeye/awesome-mcp-servers)

</div>

---

## Table of Contents

- [Quick Start](#quick-start)
- [Overview](#overview)
- [GitHub Tools](#github-tools)
- [Local Tools](#local-tools)
- [Commands](#commands)
- [Octocode CLI](#octocode-cli)
- [Installation Guide](#installation-guide)
- [Documentation](#documentation)
- [Examples](#examples)
- [Community](#community)
- [License](#license)

---

## Quick Start

### Option 1: Octocode CLI (Recommended)

```bash
npx octocode-cli
```
→ Interactive menu for GitHub auth, MCP installation, and AI skills

### Option 2: One-Click Install

[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=octocode&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJvY3RvY29kZS1tY3BAbGF0ZXN0Il19)
[<img src="https://img.shields.io/badge/VS_Code-VS_Code?style=flat-square&label=Install%20Server&color=0098FF" alt="Install in VS Code">](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522octocode%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522octocode-mcp%2540latest%255D%257D)

### Option 3: Manual Configuration

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"]
    }
  }
}
```

## Overview

Octocode is an **agentic code research platform** that bridges the gap between AI assistants and real-world code implementations. By providing structured access to GitHub's vast repository ecosystem, it enables AI systems to learn from production codebases rather than relying solely on training data.

### Core Capabilities

| Capability | Implementation | Benefit |
|------------|----------------|---------|
| **Code Discovery** | Multi-dimensional search across repositories, code, and pull requests | Find relevant implementations in seconds |
| **Context Extraction** | Smart content retrieval with pattern matching and line-range targeting | Get exactly the context you need |
| **Token Optimization** | Advanced minification strategies (50+ language support) | 30-70% reduction in token consumption |
| **Security** | Automatic secrets detection and content sanitization | Enterprise-grade data protection |
| **Progressive Research** | Workflow-driven exploration (Discover → Explore → Analyze) | Deep understanding of complex systems |
| **Access Control** | GitHub permission-based access to public and private repositories | Organization-wide code research |

### Packages

| Package | npm | Description |
|---------|-----|-------------|
| **[octocode-mcp](./packages/octocode-mcp)** | [![npm](https://img.shields.io/npm/v/octocode-mcp?color=cb3837)](https://www.npmjs.com/package/octocode-mcp) | Core MCP server: GitHub API, local filesystem tools, LSP code intelligence |
| **[octocode-cli](./packages/octocode-cli)** | [![npm](https://img.shields.io/npm/v/octocode-cli?color=cb3837)](https://www.npmjs.com/package/octocode-cli) | Interactive CLI for IDE setup, skills marketplace, MCP management |
| **[octocode-vscode](./packages/octocode-vscode)** | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=octocode.octocode-vscode) | VS Code extension for OAuth and multi-editor sync |
| **[octocode-shared](./packages/octocode-shared)** | Internal | Shared utilities for credentials and session management |

---

## GitHub Tools

Five specialized tools for comprehensive GitHub code research:

### 🔍 githubSearchCode

**Find code implementations across repositories**

| Feature | Description |
|---------|-------------|
| Content Search | Find code inside files by keywords (AND logic) |
| Path Search | Discover files/directories by name (25x faster) |
| Smart Filtering | Scope by repository, path, file extension, or popularity |
| Context-Rich Results | Returns code snippets with surrounding context |

```
• "How do popular repos implement OAuth?"
• "Search for React custom hooks in vercel repos"
• "Find error handling patterns in Express apps"
```

### 📚 githubSearchRepositories

**Discover repositories by topics and keywords**

| Feature | Description |
|---------|-------------|
| Topic-Based Discovery | Search by exact GitHub topics (most precise) |
| Keyword Search | Find repos by name, description, or README content |
| Quality Filters | Filter by stars, language, size, activity |

```
• "Discover TypeScript CLI tools with >1000 stars"
• "Find all React state management libraries"
• "List all repos from microsoft with topic 'ai'"
```

### 🗂️ githubViewRepoStructure

**Explore repository directory structure**

| Feature | Description |
|---------|-------------|
| Directory Tree | Visual representation of folder structure |
| Depth Control | Explore 1 level (overview) or 2 levels (detailed) |
| Path Targeting | Navigate directly to specific directories |

```
• "Show me the structure of facebook/react"
• "Explore src/ directory in a monorepo"
```

### 📄 githubGetFileContent

**Read file contents with smart extraction**

| Feature | Description |
|---------|-------------|
| Pattern Matching | Extract sections matching specific patterns with context |
| Line Range Reading | Read specific line ranges for efficiency |
| Content Minification | Automatic optimization for token efficiency |

```
• "Get the validateUser function from auth.ts"
• "Read lines 100-150 from the API handler"
```

### 🔀 githubSearchPullRequests

**Analyze pull requests, changes, and discussions**

| Feature | Description |
|---------|-------------|
| PR Discovery | Search by state, author, labels, dates |
| Direct Access | Fetch specific PR by number (10x faster) |
| Code Diffs | Include full diff content to see what changed |
| Discussions | Access comment threads and review discussions |

```
• "Show recent merged PRs about authentication"
• "Find PRs discussing the API redesign with comments"
```

---

## Local Tools

**Octocode Local** provides local filesystem research with LSP-powered code intelligence.

<p align="center">
  <a href="https://cursor.com/en/install-mcp?name=octocode-local&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJvY3RvY29kZS1tY3AtbG9jYWxAbGF0ZXN0Il19"><img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor"></a>
</p>

```json
{
  "mcpServers": {
    "octocode-local": {
      "command": "npx",
      "args": ["octocode-mcp-local@latest"]
    }
  }
}
```

### Filesystem Tools

| Tool | Description | Example |
|------|-------------|---------|
| 📁 **localViewStructure** | Explore directory structure with depth control | "Show src/ with depth 2" |
| 🔍 **localSearchCode** | Fast pattern search (ripgrep-powered) | "Search for 'useAuth' in TypeScript files" |
| 📂 **localFindFiles** | Find files by metadata (name, time, size) | "Find files modified in the last 7 days" |
| 📄 **localGetFileContent** | Read files with smart extraction | "Show the validateUser function" |

### LSP Tools (Code Intelligence)

| Tool | Description | Example |
|------|-------------|---------|
| 🎯 **lspGotoDefinition** | Navigate to symbol definitions | "Go to the definition of handleSubmit" |
| 🔗 **lspFindReferences** | Find all usages of a symbol | "Find all references to validateToken" |
| 🌳 **lspCallHierarchy** | Trace function call relationships | "Who calls the authenticate function?" |

### Research Workflows

```
Discovery:    localViewStructure → localSearchCode → localGetFileContent
Semantic:     localSearchCode → lspGotoDefinition → lspFindReferences
Flow Analysis: localSearchCode → lspCallHierarchy(incoming) → lspCallHierarchy(outgoing)
```

👉 **[Full LSP Documentation →](./packages/octocode-mcp/docs/LSP_TOOLS.md)**

---

## Commands

Intelligent prompt commands that enhance your research workflow:

### `/research` - Expert Code & Product Research

Deep code discovery, documentation analysis, pattern identification, and bug investigation.

**When to use**:
- Understanding repository workflows and technical implementations
- Cross-repository flow analysis and microservices tracing
- Bug investigation and root cause analysis
- Pattern discovery across multiple repos

```
/research How does React's useState hook work internally?
/research Compare state management approaches: Redux vs Zustand vs Jotai
/research Why is the payment webhook failing? Trace the error through payment-service
```

### `/plan` - Research, Plan & Implement Complex Tasks

Your AI architect for complex development work. Breaks down tasks, researches patterns, guides execution.

**When to use**:
- Building new features with research-backed architecture
- Complex refactoring with migration planning
- Learning new technologies incrementally

```
/plan Build a real-time chat application with WebSocket support
/plan Migrate our authentication from JWT to OAuth2
/plan Implement a plugin system for our CLI tool
```

### `/review_pull_request` - Comprehensive PR Review

**Args:** `prUrl` (required) - GitHub Pull Request URL

Expert-level PR review with Defects-First mindset. Analyzes:
- **Defects & Bugs**: Logic errors, edge cases, race conditions
- **Security Issues**: Injection vulnerabilities, auth bypasses
- **Performance**: N+1 queries, memory leaks
- **Code Quality**: Complexity, maintainability, test coverage

```
/review_pull_request prUrl: https://github.com/facebook/react/pull/12345
```

### `/review_security` - Security Audit

**Args:** `repoUrl` (required) - GitHub repository URL

Comprehensive security analysis. Analyzes:
- **Authentication & Authorization**: Auth flows, session management
- **Input Validation**: Injection points, sanitization
- **Secrets Management**: Hardcoded credentials, API keys
- **Dependencies**: Known vulnerabilities, supply chain risks

```
/review_security repoUrl: https://github.com/your-org/your-repo
```

> **💡 Pro Tip**: Combine `/research` and `/plan` — research existing patterns first, then plan your implementation.

---

## Octocode CLI

**One-command setup for Octocode, MCP servers, and AI skills across all your IDEs.**

<p align="center">
  <img src="https://raw.githubusercontent.com/bgauryy/octocode-mcp/main/packages/octocode-cli/assets/example.png" alt="Octocode CLI" width="600" />
</p>

```bash
npx octocode-cli@latest
```

| Feature | Description |
|---------|-------------|
| **Multi-IDE Support** | Cursor, VS Code, Claude Desktop, Windsurf, and more |
| **Skills Marketplace** | 7+ community sources with 170+ skills |
| **MCP Registry** | 50+ curated MCP servers ready to install |
| **GitHub Auth** | Browser-based OAuth or GitHub CLI integration |

```
🐙 Octocode MCP        - Install/sync Octocode across IDEs
🧠 Manage System Skills - Browse marketplace, install & manage skills  
⚡ Manage System MCP    - Add popular MCP servers to your setup
```

**Learn More**: [CLI Documentation](./packages/octocode-cli/README.md) | [What are Skills?](https://agentskills.io/what-are-skills)

---

## Installation Guide

### Prerequisites

- **Node.js** >= 18.12.0 (or use [standalone binary](#standalone-binary))
- **GitHub Authentication**: [GitHub CLI](https://cli.github.com/) (recommended) or [Personal Access Token](https://github.com/settings/tokens)

### Authentication Methods

<details>
<summary><strong>GitHub CLI (Recommended)</strong></summary>

**Advantages**: Automatic token management, works with 2FA, supports SSO

```bash
# macOS
brew install gh

# Windows
winget install --id GitHub.cli

# Linux - See https://github.com/cli/cli/blob/trunk/docs/install_linux.md

# Authenticate
gh auth login
```

Then use the standard configuration (no `GITHUB_TOKEN` needed).

</details>

<details>
<summary><strong>Personal Access Token</strong></summary>

**When to use**: CI/CD environments, automation, or if GitHub CLI isn't available

1. Create a token at [github.com/settings/tokens](https://github.com/settings/tokens)
2. Select scopes: `repo`, `read:user`, `read:org`
3. Add to your MCP configuration:

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

> **Security Tip**: Never commit tokens to version control.

</details>

<details>
<summary><strong>GitHub Enterprise</strong></summary>

Add the `GITHUB_API_URL` environment variable:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "your_token",
        "GITHUB_API_URL": "https://github.company.com/api/v3"
      }
    }
  }
}
```

</details>

### IDE-Specific Setup

<details>
<summary><strong>Cursor</strong></summary>

**One-click**: [<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=octocode&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJvY3RvY29kZS1tY3BAbGF0ZXN0Il19)

**Manual**: Go to `Cursor Settings` → `MCP` → `Add new MCP Server`. Use command `npx octocode-mcp@latest`.

**Project-specific**: Create `.cursor/mcp.json` in your project root with the standard config.

</details>

<details>
<summary><strong>VS Code</strong></summary>

**One-click**: [<img src="https://img.shields.io/badge/VS_Code-VS_Code?style=flat-square&label=Install%20Server&color=0098FF" alt="Install in VS Code">](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522octocode%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522octocode-mcp%2540latest%255D%257D)

**CLI**:
```bash
code --add-mcp '{"name":"octocode","command":"npx","args":["octocode-mcp@latest"]}'
```

</details>

<details>
<summary><strong>Claude Desktop / Claude Code</strong></summary>

**Claude Code CLI**:
```bash
claude mcp add octocode npx octocode-mcp@latest
```

**Claude Desktop**: Follow the [MCP install guide](https://modelcontextprotocol.io/quickstart/user), use the standard config.

</details>

<details>
<summary><strong>Amp</strong></summary>

**VS Code settings.json**:
```json
"amp.mcpServers": {
  "octocode": {
    "command": "npx",
    "args": ["octocode-mcp@latest"]
  }
}
```

**Amp CLI**:
```bash
amp mcp add octocode -- npx octocode-mcp@latest
```

</details>

<details>
<summary><strong>Codex</strong></summary>

**CLI**:
```bash
codex mcp add octocode npx "octocode-mcp@latest"
```

**Config file** (`~/.codex/config.toml`):
```toml
[mcp_servers.octocode]
command = "npx"
args = ["octocode-mcp@latest"]
```

</details>

<details>
<summary><strong>Goose</strong></summary>

**One-click**: [![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=octocode-mcp%40latest&id=octocode&name=Octocode&description=Intelligent%20code%20research%20and%20GitHub%20repository%20analysis)

**Manual**: Go to `Advanced settings` → `Extensions` → `Add custom extension`. Use type `STDIO`, command `npx octocode-mcp@latest`.

</details>

<details>
<summary><strong>LM Studio</strong></summary>

**One-click**: [![Add MCP Server octocode to LM Studio](https://files.lmstudio.ai/deeplink/mcp-install-light.svg)](https://lmstudio.ai/install-mcp?name=octocode&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJvY3RvY29kZS1tY3BAbGF0ZXN0Il19)

**Manual**: Go to `Program` → `Install` → `Edit mcp.json`. Use the standard config.

</details>

<details>
<summary><strong>Other IDEs (Cline, Gemini CLI, Kiro, opencode, Qodo Gen, Warp, Windsurf, Zed)</strong></summary>

All use the standard configuration:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"]
    }
  }
}
```

See each IDE's MCP documentation for the specific config file location.

</details>

### Verify Installation

1. **Restart your MCP client** completely
2. **Check connection status**:
   - **Cursor**: Green dot in Settings → Tools & Integrations → MCP Tools
   - **Claude Desktop**: Check for "octocode" in available tools
   - **VS Code**: Verify in GitHub Copilot settings
3. **Test**: `Search GitHub for React hooks implementations`

---

## Documentation

| Resource | Description |
|----------|-------------|
| **[Configuration Guide](./docs/CONFIGURATION.md)** | Environment variables and server configuration |
| **[Authentication Guide](./docs/AUTH_GUIDE.md)** | Setup instructions and troubleshooting |
| **[GitHub Tools Reference](./packages/octocode-mcp/docs/GITHUB_TOOLS_REFERENCE.md)** | Full GitHub tools documentation |
| **[Local Tools Reference](./packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md)** | Full local tools documentation |
| **[LSP Tools](./packages/octocode-mcp/docs/LSP_TOOLS.md)** | Code intelligence features |

---

## Examples

### ThreeJS Implementation Quality Comparison

**[Interactive Demo](https://octocode-sonnet4-gpt5-comparisson.vercel.app/)**

Side-by-side comparison showing Generic AI vs Octocode-Enhanced AI implementation quality:
- Performance optimizations from high-performance projects
- Proper resource management patterns
- Industry-standard error handling

### Deep Technical Research

**[YouTube: React Hooks Internals](https://www.youtube.com/watch?v=BCOpsRjAPU4&t=9s)**

Progressive research workflow demonstration:
1. Repository discovery (React source)
2. Structure exploration (hooks implementation)
3. Code analysis (internal mechanisms)
4. Comprehensive explanation with code references

---

## Community

### Get Support

- **GitHub Discussions**: [Ask questions, share ideas](https://github.com/bgauryy/octocode-mcp/discussions)
- **GitHub Issues**: [Report bugs, request features](https://github.com/bgauryy/octocode-mcp/issues)

### Show Your Support

If Octocode helps your AI development workflow:
- ⭐ **Star the repository** on [GitHub](https://github.com/bgauryy/octocode-mcp)
- 📣 **Share on social media** with #OctocodeMCP

---

## License

MIT - See [LICENSE](./LICENSE) for details.

# Octocode MCP - AI-Powered GitHub Intelligence

**Transform your AI assistant into a code research expert with the Model Context Protocol (MCP)**

<div align="center">
  <a href="https://octocode.ai" style="font-size: 1.1em; font-weight: bold; text-decoration: none;">
    🌐 Visit octocode.ai for guides, examples & community →
  </a>
  <br>
  <a href="https://www.youtube.com/@Octocode-ai" style="font-size: 1.1em; font-weight: bold; text-decoration: none; color: #ff0000;">
    📺 YouTube Tutorials & Demos →
  </a>
</div>

<div align="center">
  <a href="https://github.com/modelcontextprotocol/servers">
    <img src="https://avatars.githubusercontent.com/u/182288589?s=48&v=4" width="20" height="20" alt="MCP Logo" style="vertical-align: middle; margin-right: 6px;">
    <img src="https://img.shields.io/badge/Model_Context_Protocol-Official_Community_Server-blue?style=flat-square" alt="MCP Community Server" style="vertical-align: middle;">
  </a>
</div>

<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">
</div>

<div align="center">
  
  [![Version](https://img.shields.io/badge/version-4.1.0-blue.svg)](./package.json)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](./package.json)
  [![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.12.0-brightgreen)](https://nodejs.org/)
  [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/bgauryy/octocode-mcp)
  [![X/Twitter](https://img.shields.io/badge/X-Follow%20@guy__bary-1DA1F2.svg?logo=x&logoColor=white)](https://x.com/guy_bary)

</div>

## 🤖 What is MCP?

**Model Context Protocol (MCP)** is an open standard that enables AI assistants to securely connect to external data sources and tools. Octocode MCP is an official community server that gives your AI assistant superpowers for code research to add quality context for your AI agents.


## 🚀 Quick Start

Get up and running in 2 minutes with your preferred authentication method:

### Option 1: GitHub CLI (Recommended)
**Perfect for developers who already use GitHub CLI**

```bash
# 1. Install GitHub CLI (if not already installed)
# macOS: brew install gh
# Windows: winget install --id GitHub.cli
# Linux: See https://github.com/cli/cli#installation

# 2. Authenticate with GitHub
gh auth login

# 3. Add to your MCP configuration
```

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

### Option 2: GitHub Personal Access Token
**Great for CI/CD, Windows users, or when you prefer token-based auth**

1. **Create a token**: Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. **Select scopes**: `repo`, `read:user`, `read:org` (see [detailed scope guide](./docs/AUTHENTICATION.md))
3. **Configure MCP**:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    }
  }
}
```

**That's it!** Start asking your AI assistant about GitHub repositories and code.

<div align="center">
  <a href="./docs/USAGE_GUIDE.md" 
  style="font-size: 1.1em; font-weight: bold; text-decoration: none;">
    📚 View Usage Examples & Best Practices →
  </a>
  <br><br>
</div>

## What can Octocode do?

**Search & analyze millions of GitHub repositories** - Find real implementations, analyze code patterns, extract knowledge from commits and PRs, and connect packages to their source code automatically.

## 📋 Requirements

- **Node.js** >= 18.12.0 - [Download here](https://nodejs.org/)
- **GitHub Authentication** - GitHub CLI (recommended) or Personal Access Token

## 🔗 MCP Assistant Integration

Octocode MCP works with any MCP-compatible AI assistant:

## 🏢 Enterprise & Advanced Setup

### Advanced Configuration Options
```bash
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"              # GitHub token
export TOOLS_TO_RUN="githubSearchCode,githubSearchCommits" # Run ONLY these tools (exclusive)
export ENABLE_TOOLS="additionalTool1,additionalTool2" # Add non-default tools  
export DISABLE_TOOLS="unwantedTool1,unwantedTool2"    # Disable default tools
export BETA="1"                                      # Enable experimental features
```

**⚠️ Important:** `TOOLS_TO_RUN` cannot be used together with `ENABLE_TOOLS`/`DISABLE_TOOLS`. When `TOOLS_TO_RUN` is set, it runs ONLY the specified tools, ignoring all other tool configuration.

## 🔒 Security & Privacy

Octocode MCP is built with security-first principles:
- **Content Sanitization**: Automatically detects and redacts API keys, tokens, and sensitive data
- **Smart File Filtering**: Ignores sensitive paths, binaries, and non-searchable files for cleaner results

## 🚀 What You Can Do

### 🔍 Code Research & Discovery
- **Search millions of repositories** for real implementations and patterns
- **Analyze code structure** and explore directory trees  
- **Track development history** through commits and pull requests
- **Connect packages to source** - bridge NPM/PyPI packages to their repositories

### 🎯 Example Use Cases
```
"Show me authentication patterns in React applications"
"Find TypeScript implementations of rate limiting"
"How does Stripe handle webhooks in their SDK?"
"Compare database migration patterns across frameworks"
```

### 🏢 Enterprise Features
For organizations: audit logging, access controls, rate limiting, and compliance features.
**→ [Enterprise Setup Guide](./docs/AUTHENTICATION.md)**

## 🛠️ Available Tools

| Tool Name | Description | Default | Type |
|-----------|-------------|---------|------|
| `githubSearchCode` | Search code across GitHub repositories | ✅ Yes | Search |
| `githubGetFileContent` | Fetch file content from GitHub repositories | ✅ Yes | Content |  
| `githubViewRepoStructure` | View GitHub repository structure and navigation | ✅ Yes | Content |
| `githubSearchRepositories` | Search and discover GitHub repositories | ✅ Yes | Search |
| `githubSearchCommits` | Search GitHub commits and change history | ❌ No | History |
| `githubSearchPullRequests` | Search GitHub pull requests and code reviews | ❌ No | History |

**Default tools** are automatically enabled and provide core GitHub research functionality. **Non-default tools** can be enabled using the configuration options below.


## 📚 Complete Documentation

### 🚀 Getting Started
| Resource | Description |
|----------|-------------|
| **[🌐 octocode.ai](https://octocode.ai)** | Interactive tutorials and community |
| **[🔐 Authentication Guide](./docs/AUTHENTICATION.md)** | Complete setup for GitHub CLI, tokens, OAuth, and enterprise |
| **[📚 Usage Guide](./docs/USAGE_GUIDE.md)** | Examples, best practices, and prompt templates |

### 🛠️ Technical Reference
| Resource | Description |
|----------|-------------|
| **[🔧 Tool Schemas](./docs/TOOL_SCHEMAS.md)** | Complete API reference for all 7 tools with parameters |
| **[🏗️ Architecture Overview](./docs/summary.md)** | System design, security, and performance details |

### 🎯 Quick Links by Use Case
- **Want examples?** → [Usage Guide](./docs/USAGE_GUIDE.md) with 20+ prompt examples
- **Need API details?** → [Tool Schemas](./docs/TOOL_SCHEMAS.md) for bulk operations and advanced parameters
- **Enterprise deployment?** → [Authentication Guide](./docs/AUTHENTICATION.md) for audit logging and access controls
- **Understanding MCP?** → [Architecture Overview](./docs/summary.md) for system design

## 🚨 Troubleshooting

**Need help?** [GitHub Issues](https://github.com/bgauryy/octocode-mcp/issues)
---

<div align="center">
  <p>Built with ❤️ for developers</p>
  <p>
    <a href="https://octocode.ai">Website</a> •
    <a href="https://github.com/bgauryy/octocode-mcp">GitHub</a> •
    <a href="https://www.npmjs.com/package/octocode-mcp">NPM</a> •
    <a href="https://discord.gg/octocode">Discord</a>
  </p>
</div>
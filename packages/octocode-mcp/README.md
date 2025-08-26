# Octocode MCP - AI-Powered GitHub Intelligence

**Transform your AI assistant into a code research expert**

<div align="center">
  <a href="https://octocode.ai" style="font-size: 1.1em; font-weight: bold; text-decoration: none;">
    🌐 Visit octocode.ai for guides, examples & community →
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

## ⚡ Quick Start

### Option 1: Hosted (No Prerequisites!)

The absolute fastest way - no installation needed:

```json
{
  "mcpServers": {
    "octocode": {
      "url": "https://octocode-mcp.onrender.com/mcp"
    }
  }
}
```

### Option 2: Local Setup

For local development:

```bash
# 1. Authenticate with GitHub
gh auth login

# 2. Add to your MCP configuration
```

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"]
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
</div>

## What can Octocode do?

**Search & analyze millions of GitHub repositories** - Find real implementations, analyze code patterns, extract knowledge from commits and PRs, and connect packages to their source code automatically.

## 📋 Requirements

- **Node.js** >= 18.12.0 - [Download here](https://nodejs.org/)
- **GitHub Authentication** - GitHub CLI (recommended) or Personal Access Token

## 🔧 Alternative Setup Options

**Need a different setup?** Choose your preferred method:

### GitHub Token (for Windows/CI/Production)
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    }
  }
}
```

### Enterprise Setup
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx", 
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "GITHUB_ORGANIZATION": "your-org"
      }
    }
  }
}
```

**📚 Need detailed setup help?**
- **[Complete Authentication Guide](./docs/AUTHENTICATION.md)** - All authentication methods, OAuth, GitHub Apps, and enterprise features
- **[Installation Guide](./docs/INSTALLATION.md)** - Step-by-step setup for all environments

## 🔗 AI Assistant Integration

**Claude Desktop setup:**
```bash
claude mcp add -s user octocode npx 'octocode-mcp@latest'
```

Octocode works with any MCP-compatible AI assistant.

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
| `packageSearch` | Search NPM and Python package registries | ❌ No | NPM |

**Default tools** are automatically enabled and provide core GitHub research functionality. **Non-default tools** can be enabled using the configuration options below.

## ⚙️ Configuration & Advanced Setup

**Most common settings:**
```bash
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"              # GitHub token
export TOOLS_TO_RUN="githubSearchCode,packageSearch" # Run ONLY these tools (exclusive)
export ENABLE_TOOLS="additionalTool1,additionalTool2" # Add non-default tools  
export DISABLE_TOOLS="unwantedTool1,unwantedTool2"    # Disable default tools
export BETA="1"                                      # Enable experimental features
```

**⚠️ Important:** `TOOLS_TO_RUN` cannot be used together with `ENABLE_TOOLS`/`DISABLE_TOOLS`. When `TOOLS_TO_RUN` is set, it runs ONLY the specified tools, ignoring all other tool configuration.

**📚 For complete configuration options:**
- **[Environment Variables Reference](./docs/AUTHENTICATION.md)** - All settings, OAuth, enterprise features
- **[Tool Configuration Guide](./docs/TOOL_SCHEMAS.md)** - Available tools and parameters

## 🚨 Troubleshooting

**Common Issues:**
- **"No GitHub token found"** → [Setup GitHub authentication](./docs/AUTHENTICATION.md)
- **Rate limiting** → [Configure rate limits](./docs/AUTHENTICATION.md)
- **Enterprise setup** → [Enterprise guide](./docs/AUTHENTICATION.md)

## 📚 Documentation & Help

| Resource | Purpose |
|----------|---------|
| **[🌐 octocode.ai](https://octocode.ai)** | Tutorials, community & latest updates |
| **[📚 Usage Guide](./docs/USAGE_GUIDE.md)** | Examples and best practices |
| **[🔐 Authentication](./docs/AUTHENTICATION.md)** | Setup for all auth methods |
| **[🛠️ Tool Reference](./docs/TOOL_SCHEMAS.md)** | Complete API reference |
| **[🏗️ Architecture](./docs/SUMMARY.md)** | System design overview |

**Need help?** [GitHub Issues](https://github.com/bgauryy/octocode-mcp/issues) • [Discord](https://discord.gg/octocode) • [octocode.ai](https://octocode.ai)

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
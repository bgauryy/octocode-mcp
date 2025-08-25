# Octocode MCP - Code Research Intelligence

**AI-Powered Advanced GitHub Code Research for Developers and Organizations**

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

<div align="center">
  <a href="https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/USAGE_GUIDE.md" 
  style="font-size: 1.2em; font-weight: bold; text-decoration: none;">
    📚 Complete User Guide →
  </a>
</div>

## What is Octocode?

**Octocode transforms your AI assistant into a code research expert.** Built for individual developers and development teams, it provides:

### 🏠 For Individual Developers
- **🔍 Search millions of repositories** for real implementations
- **📈 Analyze code patterns** from production codebases
- **📚 Extract knowledge** from commits, PRs, and issues
- **🔗 Connect packages** to their source code automatically
- **⚡ Zero-config setup** with GitHub CLI integration



Built on the **Model Context Protocol (MCP)**, Octocode provides AI assistants with 8 specialized tools for GitHub repository analysis, code discovery, and package exploration.

## 📋 Prerequisites

- **Node.js** >= 18.12.0 (required) - [Download here](https://nodejs.org/)
- **GitHub Authentication** (choose one):
  - **GitHub CLI** (recommended for local development) - [Install here](https://cli.github.com/)
  - **GitHub Personal Access Token** (required for CI/CD) - [Create here](https://github.com/settings/tokens)
- **AI Assistant** (Claude Desktop, or any MCP-compatible assistant)

## 🚀 Quick Start (Simple)

```bash
# 1) Authenticate with GitHub (recommended)
gh auth login

# 2) Run Octocode
npx octocode-mcp
```

For complete authentication setup, see the authentication guides below.

## 🔐 Authentication & Configuration

Octocode is an **MCP Server** that requires GitHub authentication. Choose your setup:

### 🍎 Local Development (macOS with GitHub CLI)
```bash
# 1. Install and authenticate with [GitHub CLI](https://cli.github.com/)
gh auth login

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

### 🌐 Hosted/Production & Windows (GitHub Token)
```bash
# 1. Create Personal Access Token at: https://github.com/settings/tokens
# Scopes needed: repo, read:user, read:org

# 2. Add to your MCP configuration:
```
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

### 🏢 Advanced Setup
For advanced security and audit logging:

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

**Advanced Features:**
- **Audit Logging** - Complete compliance and security tracking

📚 **Advanced Documentation:**
- **[Advanced Setup Guide](./docs/AUTHENTICATION.md#-enterprise-features)** - Audit logging and security configuration

### 🧪 Beta Features (Experimental)

Enable experimental features by setting `BETA=1` in your environment:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "BETA": "1"
      }
    }
  }
}
```

**Current Beta Features:**
- **🤖 Code Explanation Sampling** - When fetching file contents, automatically generates prompts asking the LLM to explain what the code is doing
- **📊 Enhanced Context Injection** - Provides additional context through MCP sampling protocol to improve response quality

**Note:** Beta features are experimental and may change. Enable only for testing and development.

### 📚 Complete Authentication Guides
- **[30-Second Setup](./docs/AUTHENTICATION_QUICK_REFERENCE.md)** - Quick reference for all authentication methods
- **[Complete Authentication Guide](./docs/AUTHENTICATION.md)** - Detailed setup guide

## 🔗 AI Assistant Integration

**Quick Setup with Claude CLI:**
```bash
claude mcp add -s user octocode npx 'octocode-mcp@latest'
```

**Other MCP-Compatible Assistants:**
Octocode follows the standard Model Context Protocol, making it compatible with any MCP-enabled AI assistant.

## 🔍 Core Features

### GitHub Analysis Tools
- **🔍 Code Search** - Semantic code discovery across repositories with bulk operations
- **📁 Repository Analysis** - Structure exploration and metadata extraction
- **🔄 Pull Request Search** - Find PRs by criteria with optional diff analysis
- **📝 Commit Search** - Track changes and development history
- **📄 File Content Retrieval** - Access files with context and smart minification
- **🏗️ Repository Structure** - Explore directory trees with intelligent filtering

### Package Discovery
- **📦 NPM Package Search** - Comprehensive npm registry exploration
- **🐍 Python Package Search** - PyPI package discovery with repository links
- **🔗 Repository Linking** - Automatic connection between packages and source code

### Security
- **📊 Audit Logging** - Comprehensive event tracking and compliance reporting
- **🔐 Token Security** - Encrypted storage and automatic rotation support

## 🚨 Troubleshooting & Help

**Common Issues:**
- **"No GitHub token found"** → See [Authentication Quick Reference](./docs/AUTHENTICATION_QUICK_REFERENCE.md)
- **Advanced setup** → See [Complete Authentication Guide](./docs/AUTHENTICATION.md)
- **MCP configuration help** → See examples above or [Complete Authentication Guide](./docs/AUTHENTICATION.md)

## 🔧 Environment Variables

Octocode-MCP supports extensive configuration through environment variables. Here's a complete reference:

### 🔑 Authentication & Core Settings

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | - | `ghp_xxxxxxxxxxxx` |
| `GH_TOKEN` | Alternative GitHub token (GitHub CLI format) | - | `ghp_xxxxxxxxxxxx` |

| `TOOLS_TO_RUN` | Comma-separated list of tools to enable | All tools | `githubSearchCode,githubGetFileContent` |

#### 🛠️ Available Tools

| Tool Name | Description | Use Case |
|-----------|-------------|----------|
| `githubSearchCode` | Search code across GitHub repositories | Find implementations, patterns, examples |
| `githubSearchRepositories` | Search and discover GitHub repositories | Find relevant projects, libraries, frameworks |
| `githubGetFileContent` | Fetch file contents from repositories | Read specific files, documentation, configs |
| `githubViewRepoStructure` | Explore repository directory structure | Understand project organization, find entry points |
| `githubSearchCommits` | Search commit history and changes | Track development, find bug fixes, analyze changes |
| `githubSearchPullRequests` | Search pull requests and reviews | Understand features, review processes, discussions |
| `packageSearch` | Search NPM and Python packages | Find libraries, check versions, get repository links |

**Example Configurations:**
```bash
# Enable only code search and file content tools
export TOOLS_TO_RUN="githubSearchCode,githubGetFileContent"

# Enable repository exploration tools
export TOOLS_TO_RUN="githubSearchRepositories,githubViewRepoStructure,packageSearch"

# Enable all GitHub tools (exclude package search)
export TOOLS_TO_RUN="githubSearchCode,githubSearchRepositories,githubGetFileContent,githubViewRepoStructure,githubSearchCommits,githubSearchPullRequests"

# Enable single tool for specific use case
export TOOLS_TO_RUN="githubSearchCode"
```



### 🔐 OAuth 2.0 Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `GITHUB_OAUTH_CLIENT_ID` | OAuth application client ID | - | `Iv1.a629723bfced6b0c` |
| `GITHUB_OAUTH_CLIENT_SECRET` | OAuth application client secret | - | `secret_value_here` |
| `GITHUB_OAUTH_REDIRECT_URI` | OAuth callback URL | `http://localhost:3000/auth/callback` | `https://app.com/callback` |
| `GITHUB_OAUTH_SCOPES` | Comma-separated OAuth scopes | `repo,read:user` | `repo,read:user,read:org` |
| `GITHUB_OAUTH_ENABLED` | Enable OAuth authentication | `true` | `false` |
| `GITHUB_OAUTH_AUTH_URL` | Custom authorization URL | Auto-detected | `https://github.com/login/oauth/authorize` |
| `GITHUB_OAUTH_TOKEN_URL` | Custom token exchange URL | Auto-detected | `https://github.com/login/oauth/access_token` |

### 🤖 GitHub App Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `GITHUB_APP_ID` | GitHub App ID | - | `123456` |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key (PEM format) | - | `-----BEGIN RSA PRIVATE KEY-----\n...` |
| `GITHUB_APP_INSTALLATION_ID` | Installation ID for the app | - | `12345678` |
| `GITHUB_APP_ENABLED` | Enable GitHub App authentication | `true` | `false` |

### 📊 Performance

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `REQUEST_TIMEOUT` | Request timeout in milliseconds | `30000` | `60000` |
| `MAX_RETRIES` | Maximum retry attempts | `3` | `5` |

### 🔍 Tool Management

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `ENABLE_TOOLS` | Additional tools to enable (beyond defaults) | none | `github_search_commits,package_search` |
| `DISABLE_TOOLS` | Default tools to disable | none | `github_view_repo_structure` |

### 🛡️ Security & Validation

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `GITHUB_SSO_ENFORCEMENT` | Enforce SSO authentication | `false` | `true` |
| `GITHUB_TOKEN_VALIDATION` | Enable token validation | `false` | `true` |
| `GITHUB_PERMISSION_VALIDATION` | Enable permission validation | `false` | `true` |

### 📝 Audit Logging

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|

| `AUDIT_LOG_DIR` | Directory for audit log files | `./logs/audit` | `/var/log/octocode` |
| `ENABLE_COMMAND_LOGGING` | Log all command executions | `false` | `true` |
| `LOG_FILE_PATH` | Custom log file path | - | `/var/log/octocode.log` |

### 🔧 Development & Debugging

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `NODE_ENV` | Node.js environment | `production` | `development` |
| `npm_package_version` | Package version (auto-set by npm) | Auto-detected | `4.0.5` |

### 📋 Configuration Examples

**Basic Setup:**
```bash
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
```

**Advanced Setup:**
```bash
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
```



**Selective Tool Usage:**
```bash
export TOOLS_TO_RUN="githubSearchCode,githubGetFileContent,githubViewRepoStructure"
```

## 📚 Documentation

### Quick Links
- 📚 **[Complete User Guide](./docs/USAGE_GUIDE.md)** - Examples and best practices
- 🔐 **[Authentication Guide](./docs/AUTHENTICATION.md)** - Complete setup for all authentication methods
- ⚡ **[Quick Setup Reference](./docs/AUTHENTICATION_QUICK_REFERENCE.md)** - 30-second authentication setup
- 🏗️ **[Technical Architecture](./docs/SUMMARY.md)** - System design and implementation
- 🛠️ **[Tool Schemas](./docs/TOOL_SCHEMAS.md)** - Complete API reference

## 📄 License

MIT License - see [LICENSE.md](LICENSE.md) for details.

## 📞 Support

- **📚 Documentation**: [Complete guides and API reference](./docs/)
- **🐛 Issues**: [GitHub Issues](https://github.com/bgauryy/octocode-mcp/issues)
- **🏢 Support**: [Contact us](mailto:support@octocode.ai)
- **💬 Community**: [Discord](https://discord.gg/octocode)

---

<div align="center">
  <p>Built with ❤️ for the developer community</p>
  <p>
    <a href="https://octocode.ai">Website</a> •
    <a href="https://github.com/bgauryy/octocode-mcp">GitHub</a> •
    <a href="https://www.npmjs.com/package/octocode-mcp">NPM</a> •
    <a href="https://discord.gg/octocode">Discord</a>
  </p>
</div>
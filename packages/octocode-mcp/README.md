# Octocode MCP - Enterprise-Ready GitHub Intelligence

**AI-Powered GitHub Analysis for Developers and Organizations**

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
  
  [![Version](https://img.shields.io/badge/version-4.0.3-blue.svg)](./package.json)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](./package.json)
  [![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.12.0-brightgreen)](https://nodejs.org/)
  [![X/Twitter](https://img.shields.io/badge/X-Follow%20@guy__bary-1DA1F2.svg?logo=x&logoColor=white)](https://x.com/guy_bary)

</div>

<div align="center">
  <a href="https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/USAGE_GUIDE.md" 
  style="font-size: 1.2em; font-weight: bold; text-decoration: none;">
    📚 Complete User Guide →
  </a>
</div>

## What is Octocode?

**Octocode transforms your AI assistant into a code research expert.** Built for both individual developers and enterprise organizations, it provides:

### 🏠 For Individual Developers
- **🔍 Search millions of repositories** for real implementations
- **📈 Analyze code patterns** from production codebases
- **📚 Extract knowledge** from commits, PRs, and issues
- **🔗 Connect packages** to their source code automatically
- **⚡ Zero-config setup** with GitHub CLI integration

### 🏢 For Organizations & Enterprises
- **🔒 Enterprise security** with comprehensive audit logging
- **👥 Organization access controls** with team-based permissions
- **📊 Rate limiting** and security monitoring
- **📋 Compliance-ready** features (SOC 2, GDPR)
- **🔄 Progressive enhancement** - enterprise features activate only when configured
- **⬆️ 100% backward compatibility** - no breaking changes for existing users

Built on the **Model Context Protocol (MCP)**, Octocode provides AI assistants with 8 specialized tools for GitHub repository analysis, code discovery, and package exploration.

## 📋 Prerequisites

- **Node.js** >= 18.12.0 (required) - [Download here](https://nodejs.org/)
- **GitHub Authentication** (choose one):
  - **GitHub CLI** (recommended for local development) - [Install here](https://cli.github.com/)
  - **GitHub Personal Access Token** (required for enterprise/CI) - [Create here](https://github.com/settings/tokens)
- **AI Assistant** (Claude Desktop, or any MCP-compatible assistant)

## 🚀 Quick Start (Simple)

```bash
# 1) Authenticate with GitHub (recommended)
gh auth login

# 2) Run Octocode
npx octocode-mcp
```

For complete authentication setup including OAuth, GitHub Apps, and enterprise features, see the authentication guides below.

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

### 🏢 Enterprise Setup
For organizations with advanced security, audit logging, and OAuth 2.0 authentication:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx", 
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "GITHUB_ORGANIZATION": "your-org",
        "AUDIT_ALL_ACCESS": "true",
        "RATE_LIMIT_API_HOUR": "5000"
      }
    }
  }
}
```

**Enterprise Features:**
- **Organization Controls** - Restrict access to organization members
- **OAuth 2.0 & GitHub Apps** - Advanced authentication workflows
- **Audit Logging** - Complete compliance and security tracking
- **Rate Limiting** - Configurable API usage limits

📚 **Enterprise Documentation:**
- **[Enterprise Setup Guide](./docs/AUTHENTICATION.md#-enterprise-features)** - Organization policies, audit logging, and security configuration
- **[OAuth 2.0 Integration](./docs/AUTHENTICATION.md#-oauth-20-integration)** - How OAuth authentication works for organizations

### 📚 Complete Authentication Guides
- **[30-Second Setup](./docs/AUTHENTICATION_QUICK_REFERENCE.md)** - Quick reference for all authentication methods
- **[Complete Authentication Guide](./docs/AUTHENTICATION.md)** - Detailed setup for OAuth, GitHub Apps, and enterprise features

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

### Enterprise Security
- **📊 Audit Logging** - Comprehensive event tracking and compliance reporting
- **👥 Organization Controls** - Team-based access and membership validation
- **⚡ Rate Limiting** - Configurable limits for API, auth, and token requests
- **🔐 Token Security** - Encrypted storage and automatic rotation support
- **📋 Policy Enforcement** - MFA requirements and repository access controls

## 🚨 Troubleshooting & Help

**Common Issues:**
- **"No GitHub token found"** → See [Authentication Quick Reference](./docs/AUTHENTICATION_QUICK_REFERENCE.md)
- **Rate limiting/Enterprise setup** → See [Complete Authentication Guide](./docs/AUTHENTICATION.md)
- **MCP configuration help** → See examples above or [Complete Authentication Guide](./docs/AUTHENTICATION.md)

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
- **🏢 Enterprise Support**: [Contact us](mailto:enterprise@octocode.ai)
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
# Octocode MCP

**AI-Powered GitHub Intelligence for Code Research & Discovery**

<div align="center">
  <a href="https://github.com/modelcontextprotocol/servers">
    <img src="https://avatars.githubusercontent.com/u/182288589?s=48&v=4" width="20" height="20" alt="MCP Logo" style="vertical-align: middle; margin-right: 6px;">
    <img src="https://img.shields.io/badge/Model_Context_Protocol-Official_Community_Server-blue?style=flat-square" alt="MCP Community Server" style="vertical-align: middle;">
  </a>
</div>

<div align="center">
  <img src="./assets/logo_white.png" width="400px" alt="Octocode Logo">
</div>

<div align="center">
  
  [![Version](https://img.shields.io/badge/version-4.0.0-blue.svg)](./package.json)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](./package.json)
  [![X/Twitter](https://img.shields.io/badge/X-Follow%20@guy__bary-1DA1F2.svg?logo=x&logoColor=white)](https://x.com/guy_bary)

</div>


<div align="center">
  <a href="https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/USAGE_GUIDE.md" 
  style="font-size: 1.2em; font-weight: bold; text-decoration: none;">
    Go To User Guide →
  </a>
</div>

## What is Octocode?

**Octocode transforms your AI assistant into a code research expert.** Instead of just writing code, your AI can now:

- **🔍 Search millions of repositories** for real implementations
- **📈 Analyze code patterns** from production codebases
- **📚 Extract knowledge** from commits, PRs, and issues
- **🏢 Access private repositories** for organizational intelligence
- **🔗 Connect packages** to their source code automatically

Built on the **Model Context Protocol (MCP)**, Octocode provides AI assistants with 8 specialized tools for GitHub repository analysis, code discovery, and package exploration.

> **The Problem**: AI assistants are great at writing code but struggle with understanding existing codebases and finding proven patterns.
> 
> **The Solution**: Octocode makes any codebase instantly accessible and comprehensible to AI assistants.

## 📖 Documentation

### Quick Links
- 📚 **[Usage Guide](./docs/USAGE_GUIDE.md)** - Complete guide with examples and best practices
- 🏗️ **[Technical Architecture](./docs/SUMMARY.md)** - Detailed system architecture and implementation
- 🛠️ **[Tool Schemas](./docs/TOOL_SCHEMAS.md)** - Complete API reference and tool specifications
- 🌐 **[Octocode Ecosystem](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode/README.md)** - Explore the complete Octocode suite

> 💡 **Pro Tip:** Understanding the tool schemas will significantly improve your Octocode effectiveness.

## ⚡ Quick Start

### Prerequisites
- **Node.js** v20+ (check with `node --version`)
- **GitHub Authentication** (Personal Access Token or GitHub CLI)
- **NPM** (Optional, enhances package research capabilities)
- **AI Assistant** (Claude Desktop, or any MCP-compatible assistant)

### Authentication Options
Octocode supports flexible GitHub authentication:

1. **[GitHub CLI](https://cli.github.com/)** (Recommended for local development) - Run `gh auth login` for seamless authentication
2. **[Personal Access Token](https://github.com/settings/tokens)** (Recommended for Windows & hosted environments) - Set `GITHUB_TOKEN` or `GH_TOKEN` environment variable

### Performance Optimizations
- **NPM Integration**: Automatically enhances package research when NPM is available
  
  *For CI/CD environments:*
  ```bash
  # As environment variable
  export NPM_TOKEN=your_token_here
  
  # Then in .npmrc:
  //registry.npmjs.org/:_authToken=${NPM_TOKEN}
  ```

- **PyPI Integration**: Discovers Python package repository URLs for comprehensive analysis

## 🚀 Installation

### 🚀 Quick Configuration

#### **Option 1: GitHub CLI Authentication** 🟢 *Recommended*
*Best for Mac and local development*

1. **Install and authenticate with GitHub CLI:**
   ```bash
   # Install GitHub CLI (if not already installed)
   # macOS: brew install gh
   # Windows: winget install GitHub.cli
   
   # Authenticate
   gh auth login
   ```

2. **Add to your MCP configuration:**
   ```json
   {
     "octocode": {
       "command": "npx",
       "args": ["octocode-mcp"]
     }
   }
   ```
   > 💡 **Tip:** This method provides seamless, secure access to your GitHub resources without managing tokens.

---

#### **Option 2: Personal Access Token**
*Best for Windows, CI/CD, or hosted environments*

1. **Create a GitHub token:**
   - Go to [GitHub Settings → Personal Access Tokens](https://github.com/settings/tokens)
   - Generate a new token with appropriate permissions

2. **Add to your MCP configuration:**
   ```json
   {
     "octocode": {
       "command": "npx",
       "args": ["octocode-mcp"],
       "env": {
         "GITHUB_TOKEN": "your_github_token_here"
       }
     }
   }
```



## 📦 DXT Extension

**Desktop Extension (DXT)** for one-click installation in Claude Desktop.

```bash
yarn install && yarn dxt:pack
```

Install the generated `octocode-mcp.dxt` file by clicking on it in Claude Desktop.

### Enterprise/Production Deployment
**Ideal for:** Team environments, Docker containers, CI/CD pipelines, hosted AI services

| Feature | Details |
|---------|---------|
| **Authentication** | GitHub Personal Access Tokens or GitHub App tokens |
| **Rate Limits** | 5,000 requests/hour (higher with GitHub Apps) |
| **Access Control** | Managed by token scope and permissions |
| **Setup** | Configure `GITHUB_TOKEN` environment variable |

## 🐳 Docker Support

Run Octocode MCP in a containerized environment with full GitHub authentication support. Perfect for consistent deployments and team environments.

**[→ Complete Docker Setup Guide](./docker/README.Docker.md)**

## 🛡️ Security & Privacy

### Enterprise-Grade Security
- **🛡️ Advanced Content Protection** - Multi-layer input validation and intelligent content sanitization
- **🔐 Comprehensive Secret Detection** - Automatic detection and redaction of API keys, tokens, and credentials
- **⚪ Safe Commands Only** - Pre-approved GitHub CLI and NPM commands with parameter validation
- **🧹 Malicious Content Filtering** - Automatic detection and sanitization of harmful code patterns
- **🔍 Security Pattern Analysis** - Built-in vulnerability and compliance issue identification

> **📚 [View complete security architecture →](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/SUMMARY.md)**

---

## 📄 License

MIT License - See [LICENSE](./LICENSE.md) for details.

**Made with ❤️ by the Octocode team**
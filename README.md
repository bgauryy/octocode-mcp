# Octocode MCP

**The Perfect AI Code Assistant - Advanced Search & Discovery Across GitHub**

<div>
  <img src="./assets/logo.png" width="400px">
  
  [![Version](https://img.shields.io/badge/version-2.5.1-blue.svg)](./package.json)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](./package.json)
  [![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)
  [![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2.svg?logo=discord&logoColor=white)](https://discord.gg/beTNk8at)
    [![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-☕-orange.svg)](https://buymeacoffee.com/bgauryy)

</div>

<a href="https://glama.ai/mcp/servers/@bgauryy/octocode-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@bgauryy/octocode-mcp/badge" alt="Octocode MCP server" />
</a>

## 🌐 For More Details - [octocode.ai](https://octocode.ai)
## 📚 For Technical Details - [Technical Summary](./docs/summary.md)
## 🐳 For Docker Setup - [Docker Guide](./docker/README.Docker.md)
## 💬 Join Our Community - [Discord](https://discord.gg/beTNk8at) - Follow this for useful updates and discussions

**The perfect code assistant that can help understand anything.** Transform your AI assistant into an expert code researcher with instant access to millions of repositories and packages across GitHub and npm ecosystems.

Instead of manually browsing repositories, ask questions like:
- *"How did React implement concurrent rendering?"*
- *"Show me authentication patterns in Next.js applications"*
- *"Find examples of how to use this specific API"*
- *"What's the architecture of this library?"*
- *"How do I use this MCP tool effectively?"*

## 🌟 Featured On

### modelcontextprotocol - Official Community MCP Server 
[![MCP Servers](https://img.shields.io/badge/Official-MCP%20Servers-purple.svg?logo=github)](https://github.com/modelcontextprotocol/servers)

### Community Collections
[![Awesome MCP Servers](https://img.shields.io/badge/Awesome-MCP%20Servers-orange.svg?logo=awesome-lists)](https://github.com/punkpeye/awesome-mcp-servers) 
[![Awesome MCP Servers](https://img.shields.io/badge/Awesome-MCP%20Collection-blue.svg?logo=awesome-lists)](https://github.com/appcypher/awesome-mcp-servers)

### MCP Directories & Tools
[![MCP.so](https://img.shields.io/badge/MCP.so-Server%20Directory-green.svg?logo=web)](https://mcp.so/server/octocode/bgauryy)
[![PulseMCP](https://img.shields.io/badge/PulseMCP-Server%20Registry-red.svg?logo=pulse)](https://www.pulsemcp.com/servers/bgauryy-octocode)
[![DevTool.io](https://img.shields.io/badge/DevTool.io-Development%20Tool-teal.svg?logo=tools)](https://devtool.io/tool/octocode-mcp)

## 🎯 Who Is This For?

### For Developers
Navigate complex multi-repo architectures, understand organizational issues at scale, and generate custom documentation on-demand from real code examples. Create contextual documentation directly in your IDE, or ask OctoCode to learn from any repository and implement similar patterns in your current project.

### For Product & Engineering Managers
Gain unprecedented visibility into application behavior through semantic code search, track development progress across teams, and understand the real implementation behind product features.

### For Security Researchers
Discover security patterns, vulnerabilities, and compliance issues across both public and private repositories with advanced pattern matching and cross-codebase analysis.

### For Large Organizations
Dramatically increase development velocity by enabling teams to instantly learn from existing codebases, understand cross-team implementations, and replicate proven patterns—transforming institutional knowledge into actionable development acceleration.

## 🚀 Key Benefits

**Zero-Configuration Setup** - Works with existing GitHub CLI authentication, no personal access tokens needed

**Enterprise-Ready Security** - Respects organizational permissions with content sanitization

**AI Token Optimization** - Reduces AI costs by through intelligent content processing

**Cross-Platform Excellence** - Native Windows PowerShell support with automatic path detection

**Universal Access** - Works seamlessly with public, private, and organization repositories

## Quick Start 🚀

### 1. Install Prerequisites

**macOS/Linux:**
```bash
# Install Node.js 18.12+
brew install node

# Install GitHub CLI
brew install gh
```

**Windows:**
```powershell
# Install using WinGet (recommended)
winget install Microsoft.PowerShell  # PowerShell 7+ for better security
winget install GitHub.cli
winget install OpenJS.NodeJS

# Or using Chocolatey
choco install powershell-core nodejs github-cli

# Or using Scoop
scoop install gh nodejs
```

### 2. Authenticate
```bash
# Login to GitHub (opens browser)
gh auth login

# Login to NPM (for package research)
npm login
```

### 3. Add to Claude Desktop
```bash
# For Claude Desktop users
claude mcp add octocode npx 'octocode-mcp@latest'
```

### Or Add to MCP Configuration Manually
```json
{
  "octocode-mcp": {
    "command": "npx",
    "args": ["octocode-mcp"]
  }
}
```

**That's it!** Octocode automatically works with your organization's private repositories.

## 🐳 Docker Support

Run Octocode MCP in a Docker container while maintaining full GitHub CLI authentication. Perfect for consistent environments and deployment.

[**See Docker Setup Guide →**](./docker/README.Docker.md)

## 🛠️ What You Can Do

### Deep Project Research & Analysis
- **Issue Search & Analysis**: Understand project challenges, feature requests, and bug patterns
- **Commit History Research**: Trace feature implementations and bug fixes across time
- **Pull Request & Code Review Analysis**: Access actual code diffs and understand development workflows
- **Project Progress Tracking**: Monitor development velocity and team collaboration patterns

### Core GitHub Research
- **Repository Discovery**: Find repositories by topic, language, and activity
- **Code Search**: Find exact patterns and implementations across millions of repositories
- **Cross-Repository Flow Understanding**: Connect related changes across multiple repositories
- **Repository Architecture**: Navigate and understand project structures

### Package Ecosystem Tools
- **NPM Package Discovery**: Analyze Node.js packages with comprehensive metadata
- **Python Package Integration**: Explore PyPI packages with cross-ecosystem comparison
- **Package Analysis**: Deep-dive into versions, dependencies, and repository connections

### Advanced Research Capabilities
- **Code Pattern Discovery**: Identify implementation patterns and best practices
- **Security & Compliance Research**: Search for security patterns across codebases
- **Team Collaboration Analysis**: Understand code review processes and team dynamics
- **Real-time Documentation**: Generate custom docs from live code for any topic

> **📚 For detailed technical architecture, tool specifications, and implementation details, see [Technical Summary](./docs/summary.md)**

## DXT Extension 📦

This project is available as a **Desktop Extension (DXT)** for easy installation in AI applications like Claude Desktop.

### Quick DXT Setup

```bash
# Install dependencies
yarn install

# Build the DXT package
yarn dxt:pack
```

The generated `octocode-mcp.dxt` file can be installed in Claude Desktop by simply clicking on it.

**DXT Scripts:**
- `yarn dxt:validate` - Validate the manifest.json file
- `yarn dxt:pack` - Build and package the extension
- `yarn dxt:release` - Full release pipeline (build → pack → sign → verify)

## Best Practices 💡

**Ask Natural Questions:**
- "How does authentication work in this project?"
- "What libraries implement this pattern?"
- "Show me NPM packages that solve X problem"
- "How has this approach evolved over time?"

**Let AI Guide Discovery:**
- Start with broad queries - the system will intelligently narrow down
- Trust the smart fallbacks - automatic retry with alternatives
- Build on previous searches - maintain context for deeper exploration
- Works everywhere - public, private, and organization repositories

## Troubleshooting 🔧

**Cross-Platform Commands:**
```bash
# Check GitHub CLI status
gh auth status

# Re-authenticate if needed
gh auth logout && gh auth login

# Check NPM access
npm whoami
```

**Windows-Specific:**
```powershell
# Check PowerShell version (7+ recommended)
$PSVersionTable.PSVersion

# Test executable detection
where.exe gh
where.exe npm
```

**Common Solutions:**
- No results? Try broader search terms
- Private repos not found? Check `gh auth status` for organization membership
- Windows issues? Install PowerShell 7+ for better security
- Permission errors? Check executable permissions and PATH configuration

## Security & Privacy 🛡️

### Local-First Architecture
- **🏠 100% Local** - Runs entirely on your machine
- **🚫 Zero Data Collection** - No telemetry or data transmission
- **🔑 Safe Authentication** - Uses GitHub CLI OAuth, no personal tokens needed

### Enterprise Security
- **🛡️ Content Protection** - Input validation and content sanitization
- **🔐 Secret Detection** - Automatic detection and redaction of sensitive data patterns
- **⚪ Safe Commands Only** - Pre-approved GitHub CLI and NPM commands only

> **📚 For comprehensive security architecture details, see [Technical Summary](./docs/summary.md)**

## Background 💭

This project started as a personal tool while working at Wix, born from the challenge of navigating large codebases and keeping up with rapidly evolving technology landscapes. What began as a side project evolved into **the perfect code assistant that can help understand anything**.

The goal: **make code exploration as intelligent as having a senior developer guide you through any codebase.**

## License 📄

MIT License - See [LICENSE](./LICENSE.md) for details.

---
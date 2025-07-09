# Octocode MCP

**The Perfect AI Code Assistant - Advanced Search & Discovery Across GitHub & NPM**

<div>
  <img src="./assets/logo.png" width="400px">
  
  [![Version](https://img.shields.io/badge/version-2.3.2-blue.svg)](./package.json)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](./package.json)
  [![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)
  [![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-☕-orange.svg)](https://buymeacoffee.com/bgauryy)
</div>

## What is Octocode? 🐙

**The perfect code assistant that can help understand anything.** Octocode provides AI-powered advanced search with heuristic discovery and smart fallbacks to understand connections between repositories and NPM packages across any privilege level you have.

Instead of manually browsing repositories, ask questions like:
- *"How did React implement concurrent rendering?"*
- *"Show me authentication patterns in Next.js applications"*
- *"Find examples of how to use this specific API"*
- *"What's the architecture of this library?"*
- *"How do I use this MCP tool effectively?"*

## Unique Value Proposition

**The most advanced AI-powered code assistant for understanding connections across the entire GitHub & NPM ecosystem.** While other GitHub MCPs focus on project management or basic operations, Octocode provides unparalleled depth for code discovery and technical research.

**Key Differentiators:**
- **🧠 AI-Powered Search** - Heuristic algorithms with smart fallbacks that understand code context and find relevant code even with vague queries
- **🔐 Zero-Config Security** - Uses GitHub CLI authentication - no personal access tokens needed
- **🔗 Connection Intelligence** - Maps NPM packages to repositories, traces dependencies, finds related implementations
- **🌐 Universal Access** - Works seamlessly with public, private, and organization repositories
- **⚡ LLM Optimized** - Advanced content minification and partial fetching reduces token usage by 80-90%

## Quick Start 🚀

### 1. Install Prerequisites
```bash
# Install Node.js 18.12+
brew install node  # macOS
# or download from https://nodejs.org/

# Install GitHub CLI
brew install gh    # macOS
# or see: https://github.com/cli/cli#installation
```

### 2. Authenticate
```bash
# Login to GitHub (opens browser)
gh auth login

# Login to NPM (for package research)
npm login
```

**🔐 Authentication Benefits:**
- ✅ **No personal access tokens** - Uses GitHub CLI OAuth flow
- ✅ **Enterprise ready** - Works with SSO, 2FA, and organization access
- ✅ **Automatic organization detection** - Instantly accesses your private repositories
- ✅ **Zero configuration** - Uses existing `gh` CLI permissions

### 3. Choose Your Installation Method

**Option A: Traditional MCP Server** (Add to MCP Configuration)
```json
{
  "octocode-mcp": {
    "command": "npx",
    "args": ["octocode-mcp"]
  }
}
```

**Option B: Desktop Extension (DXT)** (Recommended for Claude Desktop)
1. Download the latest `octocode-mcp.dxt` from [GitHub Releases](https://github.com/bgauryy/octocode-mcp/releases)
2. Open the `.dxt` file with Claude Desktop (macOS/Windows)
3. Follow the installation prompt

**That's it!** Octocode automatically works with your organization's private repositories.

## DXT Extension 📦

This project is available as a **Desktop Extension (DXT)** for easy installation in AI applications like Claude Desktop.

### For End Users

**Installation:**
1. Download the latest `octocode-mcp.dxt` from [GitHub Releases](https://github.com/bgauryy/octocode-mcp/releases)
2. Open the `.dxt` file with Claude Desktop (macOS/Windows)
3. Follow the installation prompt - **it's that simple!**

**Benefits of DXT:**
- ✅ **Single-click installation** - No configuration needed
- ✅ **Automatic updates** - Managed by your AI application
- ✅ **Secure packaging** - Signed and verified extensions
- ✅ **No command-line required** - Perfect for non-technical users

### For Developers

**Building the DXT Package:**

```bash
# Install dependencies
yarn install

# Build the DXT package
yarn dxt:pack

# Validate the manifest
yarn dxt:validate

# View package information
yarn dxt:info

# Sign the package (optional)
yarn dxt:sign
```

**DXT Scripts:**
- `yarn dxt:validate` - Validate the manifest.json file
- `yarn dxt:pack` - Build and package the extension as a .dxt file
- `yarn dxt:info` - Show information about the packaged extension
- `yarn dxt:sign` - Sign the package with a self-signed certificate
- `yarn dxt:verify` - Verify the signature of a signed package

**The DXT package includes:**
- Compiled MCP server (`dist/index.js`)
- Extension manifest (`manifest.json`)
- Package metadata (`package.json`)
- Logo and assets (`assets/logo.png`)
- Documentation (`README.md`)

**Distribution:**
- DXT files are distributed via GitHub Releases
- Users install them directly in AI applications
- NOT published to NPM (different from the MCP server package)

## How It Works 🔄

**Smart Discovery Flow:**
1. **🔍 Query Analysis** → AI determines the best search strategy
2. **⚡ Multi-Tool Orchestration** → Intelligently combines 10 specialized tools
3. **🔄 Smart Fallbacks** → Automatically retries with different approaches
4. **🔗 Cross-Reference Discovery** → Links packages to repositories with commit SHA integration
5. **🎯 Context Synthesis** → Provides comprehensive understanding

## Example Flows

### Example 1: LangGraph Node.js Implementation Tutorial
**Query:** "Show implementations of langgraph in node js. Make a tutorial for how to implement a simple agent using OpenAI API."

<a href="https://youtu.be/E5HUlRckpvg?si=XXLle59C92esDscS"><img src="assets/langchainTutorial.gif" alt="LangGraph Node.js Tutorial" width="50%"></a>

### Example 2: Zustand React State Management
**Query:** "Show me how to add zustand to react application. Show examples and best practices"

<a href="https://youtu.be/EgYbsuWmqsI?si=CN_KwCPgwprImynU"><img src="assets/reactZustand.gif" alt="Zustand React State Management" width="50%"></a>

### Example 3: React vs Vue.js Rendering Comparison
**Query:** "How did React implement their concurrent rendering flows? How is it different from Vue.js rendering mechanism? Which is better?"

<a href="https://youtu.be/-_pbCbLXKDc?si=KiPeGCzmwWtb6G3r"><img src="assets/reactVSVueJS.gif" alt="React vs Vue.js Rendering Comparison" width="50%"></a>

## Core Features 🛠️

### 🧠 AI-Powered Intelligence
- **Advanced Search** - Heuristic pattern recognition with automatic fallback strategies
- **Connection Mapping** - Automatically links NPM packages to GitHub repositories
- **Cross-Reference Analysis** - Discovers how different projects implement similar patterns
- **Progressive Refinement** - AI-guided search that improves with each iteration
- **Context-Aware Discovery** - Understands relationships between code, commits, issues, and discussions

### 🔗 Commit SHA Integration
- **Time Travel Code Viewing** - View files from specific commits and pull requests
- **PR Code Analysis** - Automatically fetch commit SHAs for precise code comparison
- **Historical Implementation** - Compare code evolution across versions

### ⚡ Performance Optimization
- **Smart Content Selection** - Extracts only relevant code sections
- **Advanced Minification** - Language-aware compression preserving meaning
- **Partial File Access** - Fetches targeted line ranges
- **Token Efficiency** - 80-90% reduction in LLM token usage

## Available Tools

**10 specialized tools** working together intelligently:

### GitHub Tools
- `githubSearchCode` - Search code across repositories with advanced filtering
- `githubGetFileContent` - Fetch file contents from repositories with intelligent minification
- `githubSearchRepositories` - Search for repositories with comprehensive metadata
- `githubSearchCommits` - Search commit history and track development patterns
- `githubSearchPullRequests` - Search pull requests and analyze code changes
- `githubSearchIssues` - Search issues and development discussions
- `githubViewRepoStructure` - View repository structure and explore codebases

### NPM Tools
- `npmPackageSearch` - Search npm packages with dependency information
- `npmViewPackage` - View detailed package information and dependencies

### System Tools
- `apiStatusCheck` - Check GitHub and npm API status and connectivity

All tools feature automatic cross-referencing and intelligent fallbacks.

## Security & Privacy 🛡️

### Local-First Architecture
- **🏠 100% Local** - Runs entirely on your machine
- **🚫 Zero Data Collection** - No telemetry or data transmission
- **🔑 No Token Management** - Uses GitHub CLI authentication

### Command Execution Security
- **⚪ Allowlisted Commands Only** - Pre-approved safe commands
- **🛡️ Argument Sanitization** - Prevents shell injection attacks
- **✅ Pre-execution Validation** - Every command is validated
- **🔧 Controlled Environment** - Cross-platform secure shell execution
- **⏱️ Timeout Protection** - Prevents resource exhaustion

## Best Practices 💡

**Effective Questions:**
- Start with natural language - "How does authentication work?"
- Ask for connections - "What libraries use this pattern?"
- Cross-ecosystem queries - "NPM packages that implement X"
- Evolution questions - "How has this approach changed?"

**Pro Tips:**
- Let AI guide discovery - vague queries work great
- Trust smart fallbacks - automatic retry with alternatives
- Build on previous searches - maintain context for deeper exploration
- Works everywhere - public, private, and organization repositories

## Troubleshooting 🔧

```bash
# Check GitHub CLI status
gh auth status

# Re-authenticate if needed
gh auth logout && gh auth login

# Check NPM access
npm whoami

# Clear NPX cache if needed
rm -rf ~/.npm/_npx
```

**Common Solutions:**
- No results? Try broader search terms
- Private repos not found? Check `gh auth status` for organization membership
- Windows users? PowerShell is automatically supported

## Background 💭

This project started as a personal tool while working at Wix, born from the challenge of navigating large codebases and keeping up with rapidly evolving technology landscapes. What began as a side project evolved into **the perfect code assistant that can help understand anything**.

The goal: **make code exploration as intelligent as having a senior developer guide you through any codebase.**

## Development 🛠️

### Building and Testing

```bash
# Install dependencies
yarn install

# Build the project
yarn build

# Run tests
yarn test

# Start in development mode
yarn build:watch

# Lint and format
yarn lint
yarn format
```

### DXT Development

```bash
# Build and test DXT package
yarn dxt:pack
yarn dxt:validate
yarn dxt:info

# Development workflow
yarn build:watch  # Watch for changes
yarn dxt:pack     # Rebuild DXT package

# Release workflow
yarn release:dxt  # Build, pack, and sign DXT for distribution
```

### Configuration

The server can be configured through environment variables:

- `GITHUB_TOKEN` - GitHub personal access token (optional, increases rate limits)
- `NPM_REGISTRY` - NPM registry URL (default: https://registry.npmjs.org)

### Distribution

**Two Distribution Methods:**

1. **NPM Package** (`npm install -g octocode-mcp`)
   - Traditional MCP server installation
   - Requires manual MCP configuration
   - Global command-line tool
   - Published to NPM registry

2. **DXT Extension** (`octocode-mcp.dxt`)
   - Desktop Extension for AI applications
   - Single-click installation in Claude Desktop
   - Distributed via GitHub Releases
   - NOT published to NPM

## License 📄

MIT License - See [LICENSE](./LICENSE.md) for details.

---
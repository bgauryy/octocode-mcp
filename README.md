# Octocode MCP

**The Perfect AI Code Assistant - Advanced Search & Discovery Across GitHub & NPM**

<div>
  <img src="./assets/logo.png" width="400px">
  
  [![Version](https://img.shields.io/badge/version-2.3.17-blue.svg)](./package.json)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](./package.json)
  [![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)
    [![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-☕-orange.svg)](https://buymeacoffee.com/bgauryy)

</div>


## 🌐 For More Details -  [octocode.ai](https://octocode.ai)


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
- **🧠 AI-Powered Search** - Multi-modal search strategies with progressive complexity reduction and context-aware suggestions
- **🔐 Zero-Config Security** - Uses GitHub CLI authentication with organization discovery - no personal access tokens needed
- **🔗 Connection Intelligence** - Maps NPM packages to repositories with commit SHA integration and cross-tool data sharing
- **🌐 Universal Access** - Works seamlessly with public, private, and organization repositories using GitHub CLI permissions
- **⚡ LLM Optimized** - Advanced content minification, intelligent caching, and parallel processing reduces token usage by 80-90%

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

### 3. Add to MCP Configuration
```json
{
  "octocode-mcp": {
    "command": "npx",
    "args": ["octocode-mcp"]
  }
}
```

**That's it!** Octocode automatically works with your organization's private repositories.

## DXT Extension 📦

This project is available as a **Desktop Extension (DXT)** for easy installation in AI applications like Claude Desktop.

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

**Building DXT from Source:**
To build the DXT package locally from this repository:
```bash
# Clone the repository
git clone https://github.com/bgauryy/octocode-mcp.git
cd octocode-mcp

# Install dependencies and build
yarn install
yarn build
yarn dxt:pack
```

The generated `octocode-mcp.dxt` file can then be installed in Claude Desktop (just click on it and it will open claude desktop with the extension)

## Core Features 🛠️

### 🧠 **AI-Powered Intelligence**
- **Advanced Search Strategies** - Multi-modal search with exact/term modes and progressive complexity reduction
- **Connection Mapping** - Automatically links NPM packages to GitHub repositories with URL extraction
- **Cross-Reference Analysis** - Discovers implementation patterns across projects with commit SHA integration
- **Progressive Refinement** - AI-guided search with contextual suggestions and smart fallback chains
- **Context-Aware Discovery** - Understands relationships between repositories, packages, commits, and issues

### 🔗 **Commit SHA Integration** 
- **Time Travel Code Viewing** - View files from specific commits and pull requests using SHA references
- **PR Code Analysis** - Fetch commit data with file changes for precise code comparison
- **Historical Implementation** - Compare code evolution across versions with diff analysis
- **Cross-Tool Integration** - Commit SHAs work seamlessly across search, fetch, and analysis tools

### ⚡ **Performance Optimization**
- **Smart Content Selection** - Extracts targeted line ranges with configurable context
- **Advanced Minification** - Language-aware compression preserving structure and meaning
- **Intelligent Caching** - Generated cache keys with automatic invalidation
- **Parallel Processing** - Concurrent API calls for enhanced content fetching
- **Token Efficiency** - 80-90% reduction in LLM token usage through optimization

## Available Tools

**10 specialized tools** working together intelligently:

### 🔍 **Discovery & Navigation**
- **Repository Search** - Multi-modal search with quality filters, URL extraction, and private repository support
- **Package Search** - NPM ecosystem discovery with deduplication and framework detection
- **Repository Structure** - Smart branch detection with path validation and enhanced fallbacks

### 💻 **Code Analysis**
- **Code Search** - Advanced search with exact/term modes, progressive strategies, and text match optimization
- **File Content Fetching** - Intelligent retrieval with partial access, minification, and smart branch fallbacks
- **Package Analysis** - Detailed NPM package inspection with export structure and GitHub integration

### 📊 **Development Activity**
- **Commit Search** - Multi-modal search with content fetching and SHA integration for file viewing
- **Pull Request Search** - Dual search modes with commit data and cross-tool SHA integration
- **Issue Search** - Rich filtering with parallel content fetching and advanced metrics

### 🛠️ **System Integration**
- **API Status Check** - Central authentication validation with organization discovery and smart error handling

### 🚀 **Latest Features**
- **Commit SHA Integration** - View files from specific commits and pull requests
- **Progressive Search Strategies** - AI-guided complexity reduction with contextual suggestions
- **Cross-Tool Data Sharing** - Seamless integration with shared data formats and relationship mapping
- **Advanced Error Recovery** - Context-aware suggestions and smart fallback chains
- **Performance Optimization** - Token efficiency, intelligent caching, and parallel processing

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

## License 📄

MIT License - See [LICENSE](./LICENSE.md) for details.

---

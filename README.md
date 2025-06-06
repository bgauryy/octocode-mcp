# Octocode MCP

**AI-Powered GitHub Research Assistant for Code Discovery**


<div>
  <img src="./assets/logo.png" width="400" height="560">
  
  [![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](./package.json)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](./package.json)
  [![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)
</div>

## 🚀 A New Take on Code Discovery

### Differences Between Traditional GitHub MCPs and Octocode MCP
- **Octocode MCP** = AI-Powered Research Assistant for Code Discovery
- **Traditional GitHub MCPs** = Traditional API Wrapper for CRUD Operations

## 💡 Background & Motivation


This project was born from a personal need while working at **Wix** - navigating and understanding large-scale repositories and codebases became increasingly challenging as projects grew in complexity. Traditional GitHub search and documentation often fell short when trying to:

- **Understand architectural decisions** across multiple repositories
- **Find real implementation examples** rather than just documentation
- **Track the evolution** of complex features and systems
- **Discover internal patterns** and best practices across teams

Beyond repository navigation, this tool has become essential for **keeping pace with the vast landscape of technology changes**. In today's rapidly evolving development ecosystem, staying current with new frameworks, libraries, and patterns is crucial for maintaining high development velocity.

What started as a side project to solve my own daily challenges evolved into a comprehensive AI-powered research assistant. The goal was simple: **make repository exploration and code discovery as intelligent and intuitive as having a senior developer guide you through any codebase.**

### 🔄 A Tool That Built Itself

In a fascinating turn of meta-development, **Octocode MCP actually helped create itself**. During development, I used the tool to:

- **Understand MCP APIs correctly** by analyzing existing MCP implementations and documentation
- **Compare features with other MCPs** to identify gaps and opportunities  
- **Research best practices** from successful GitHub integrations
- **Study code patterns** from high-quality open source projects

This self-referential development process validated the tool's core value proposition: **enabling developers to learn from and build upon the collective intelligence of the entire GitHub ecosystem.**

### 🎯 Innovation: NPM-Driven Repository Discovery

One approach that emerged from my own search challenges: **using the NPM registry as a quality filter for repository discovery**. When searching through the vast GitHub landscape, finding high-quality, production-ready code was challenging.

The approach:
- **NPM as Quality Signal**: Published packages indicate battle-tested, production-ready code
- **Package-to-Repository Mapping**: Automatically link NPM packages to their GitHub repositories
- **Quality Amplification**: Focus on repositories that maintain published packages, ensuring real-world usage
- **Ecosystem Context**: Understand dependencies and relationships through package management

This methodology improved search result quality by leveraging the NPM ecosystem's inherent curation - if someone published it as a package, it's likely production-ready and well-maintained.

*Note: This is a personal side project and not an official Wix product.*

## ✨ Overview of Octocode MCP

### 🧠 **AI-First Architecture**
- **Chain-of-Thought Reasoning Framework**: 6-step reasoning methodology built into prompts
- **Teaching Methodology Integration**: AI education built into tool descriptions  
- **Context-aware Search Optimization**: Quality validation pipelines for code discovery
- **Automatic Query Optimization**: Single-word prioritization strategy ("RAG" → "Ranking" not "RAG Ranking")

### 🔄 **Intelligent Tool Chaining**
- **Automatic Organization Detection**: Smart tool chaining based on context
- **Package-to-Repository Mapping**: NPM mentions trigger automatic repository discovery
- **Cross-validation Workflows**: Multi-step research flows with tool interconnection
- **Progressive Search Refinement**: Phase-based search refinement (Broad → Pattern → Precise)

### 🎯 **Smart Discovery Features**
- **Semantic Landscape Mapping**: `search_github_topics` for ecosystem understanding
- **Community Knowledge Discovery**: `search_github_discussions` for Q&A and tutorials
- **Evolution Tracking**: `search_github_commits` for code history analysis
- **Private Repository Discovery**: `get_user_organizations` for enterprise access
- **Package Ecosystem Discovery**: `npm_search` and `npm_view` integration

## 🌟 Example Use Cases

**AI agents can now ask questions like:**

- *"Show the langchain code examples from my organization"*
- *"From code and PRs, how did React implement concurrent rendering?"*
- *"Show examples of usage of this API: `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';` Look at my code and suggest how I can improve it"*
- *"Best ways from code examples to use routing in Next.js"*
- *"Make docs of lodash"*
- *"Show progress of React project in the recent 5 years"*
- *"How is Vue rendering architecture different than React? Check from code"*

## 📋 Table of Contents

- [Installation & Setup](#installation--setup)
- [Why Better Than Static PAT](#why-better-than-static-pat)
- [Features](#features)
- [Available Tools](#available-tools)
- [Usage Examples](#usage-examples)
- [Advanced Configuration](#advanced-configuration)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## 🛠 Installation & Setup

### 🚀 **Works Out Of The Box (OOTB) - Any Environment!**

**Octocode MCP works instantly on any environment** - no complex setup, no configuration files, no environment variables. Just install prerequisites and configure MCP client. **That's it!**

### Step 1: Install Prerequisites

#### Install Node.js (21+)
```bash
# macOS with Homebrew
brew install node

# Or download from https://nodejs.org/
# Verify installation
node --version  # Should be 21+
```

#### Install GitHub CLI
```bash
# macOS
brew install gh

# Windows (with Chocolatey)
choco install gh

# Windows (with Scoop)
scoop install gh

# Linux (Debian/Ubuntu)
sudo apt update && sudo apt install gh

# Other platforms: https://github.com/cli/cli#installation
```

#### Install NPM (usually comes with Node.js)
```bash
# Verify NPM installation
npm --version
```

### Step 2: Authentication Setup

#### GitHub CLI Authentication
```bash
# Login to GitHub (opens web browser)
gh auth login

# Select options:
# 1. GitHub.com (for public repos) or GitHub Enterprise Server
# 2. HTTPS (recommended)
# 3. Login with a web browser (easier and more secure)

# Verify authentication
gh auth status
# Should show: ✓ Logged in to github.com as [your-username]
```

#### NPM Authentication (for private packages)
```bash
# For npm registry
npm login

# For private registries, check your .npmrc
npm config list
npm whoami  # Verify authentication
```

### Step 3: MCP Configuration**

**This is the only configuration you need!** Add this to your MCP client configuration:

```json
{
  "octocode-mcp": {
    "command": "npx",
    "args": [
      "octocode-mcp"
    ]
  }
}
```

### 🎉 **That's It! Ready To Use**

**No installation needed** - `npx` will automatically download and run the latest version
**No environment variables** - Uses your existing GitHub CLI authentication  
**No configuration files** - Works with your current permissions
**No tokens to manage** - Secure authentication handled automatically
**Works everywhere** - Any OS, any environment, any setup

## 🔒 Privacy & Local Operation

**🏠 100% Local Execution** - Octocode MCP runs entirely on your machine. No remote servers, no cloud processing, no data transmission to third parties.

**🚫 Zero Data Collection** - We don't collect, store, or transmit any of your data, search queries, or repository information. Everything stays on your machine.

**🔑 Your Credentials, Your Control** - All API calls use your existing CLI configurations:
- **GitHub**: Uses your `gh` CLI authentication and permissions
- **NPM**: Uses your local `.npmrc` and `npm` CLI configuration
- **No Token Sharing**: Your authentication tokens never leave your machine

**🛡️ Privacy by Design** - The tool operates as a local proxy using your own credentials, ensuring you maintain full control over what repositories and data you can access based on your existing permissions.

### Optional: Verify Setup
```bash
# Check all components
node --version    # Should be 21+
gh --version      # Should show version
gh auth status    # Should show authenticated
npm --version     # Should show version

# Test NPX execution (optional)
npx octocode-mcp --help
```

### 🌟 **Alternative Installation Options**

#### Option A: Global Installation (if you prefer)
```bash
# Install globally
yarn global add octocode-mcp
# or
npm install -g octocode-mcp

# Then use this MCP configuration:
{
  "octocode-mcp": {
    "command": "octocode-mcp"
  }
}
```

#### Option B: NPX (Recommended - Always Latest)
```bash
# No installation needed - NPX handles everything
# Just use the MCP configuration above! ⬆️
```

## 🔒 Why Different Than Static PAT

### Traditional GitHub MCPs Challenges:
❌ **Manual PAT Management**: Create, store, rotate personal access tokens manually  
❌ **Security Risks**: Tokens in config files, potential exposure  
❌ **Limited Scope**: Fixed permissions, hard to manage different access levels  
❌ **Expiration Issues**: Tokens expire, breaking workflows  
❌ **No SSO Integration**: Doesn't work with enterprise SSO/SAML  

### Octocode MCP Approach:
✅ **Zero Configuration**: Uses existing GitHub CLI authentication  
✅ **Automatic Security**: Leverages GitHub's secure OAuth flow  
✅ **Dynamic Permissions**: Uses your actual GitHub permissions  
✅ **SSO Compatible**: Works seamlessly with enterprise authentication  
✅ **No Token Management**: GitHub CLI handles all authentication automatically  
✅ **Better Security**: No tokens stored in files or transmitted  

## 🎯 Features

### For Developers
- **🔍 Intelligent Code Discovery**: Find implementations, patterns, and examples with AI-guided search
- **🔗 Cross-Repository Investigation**: Trace code patterns, dependencies, and implementations across multiple repositories
- **📦 Smart Dependency Analysis**: Understand package relationships and find alternative libraries with automatic NPM integration
- **🐛 Advanced Bug Investigation**: Track issues, commits, and pull requests with multi-repository correlation
- **📚 Learning & Reference**: Access community discussions, documentation, and best practices with context-aware recommendations
- **🏗️ Architecture Understanding**: Explore repository structures and analyze codebases with intelligent navigation
- **📈 Historical Code Analysis**: Understand code evolution through commit history and PR reviews

### For Engineering Managers
- **📊 Repository Health Assessment**: Assess the current status and health of repositories with comprehensive metrics
- **⚖️ Technology Assessment**: Evaluate libraries, frameworks, and tools adoption with trend analysis
- **🤝 Cross-Team Collaboration Analysis**: Track contributions, knowledge sharing, and code reuse patterns
- **💡 Knowledge Management**: Discover internal resources, documentation, and established patterns
- **📈 Competitive Analysis**: Research similar projects and industry trends with automated discovery
- **🛡️ Risk & Compliance Management**: Identify security vulnerabilities, licensing issues, and maintenance gaps
- **📋 Strategic Planning**: Analyze technology trends, migration patterns, and adoption metrics

## 🛠 Available Tools

### 🔍 **GitHub Code & Repository Search**
- **`search_github_code`**: Find specific implementations, functions, and patterns with semantic search
- **`search_github_repos`**: Progressive repository discovery with intelligent filtering  
- **`fetch_github_file_content`**: Extract complete working code with full context
- **`view_repository_structure`**: Strategic repository exploration for code analysis
- **`view_repository`**: Discover default branch information (mandatory first step)

### 📦 **NPM & Package Ecosystem**
- **`npm_view`**: Transform package names into GitHub repositories for code analysis
- **`npm_search`**: Search NPM registry for packages by keywords with intelligent optimization
- **Package-to-Repository Mapping**: Automatic linking from NPM packages to their GitHub repositories

### 📋 **Development History & Collaboration**
- **`search_github_commits`**: Advanced GitHub commits search for development history analysis
- **`search_github_pull_requests`**: Code review and feature analysis with quality focus
- **`search_github_issues`**: Problem discovery and solution research with pattern analysis
- **`search_github_discussions`**: Community knowledge discovery for Q&A and tutorials

### 👥 **User & Organization Management**
- **`search_github_users`**: Advanced developer and organization discovery
- **`get_user_organizations`**: Automatic private repository discovery for enterprise environments
- **`search_github_topics`**: Vital foundation tool for effective GitHub discovery

### 🎯 **Smart Features**
- **Automatic Query Optimization**: Built-in search strategy optimization
- **Chain-of-Thought Reasoning**: 6-step reasoning methodology for complex queries
- **Teaching Methodology Integration**: AI education built into tool descriptions
- **Progressive Search Refinement**: Phase-based search from broad to precise
- **Cross-validation Workflows**: Multi-step research flows with tool interconnection

## 📚 Usage Examples

### Basic Code Discovery
```bash
# Find React hooks implementations
"Show me examples of custom React hooks for data fetching"

# Explore API patterns
"How do popular libraries implement rate limiting? Show code examples"
```

### Advanced Research
```bash
# Deep architectural analysis
"From code and PRs, how did React implement concurrent rendering?"

# Cross-repository investigation
"Show the langchain code examples from my organization"
```

### Learning & Documentation
```bash
# Best practices discovery
"Best ways from code examples to use routing in Next.js"

# Documentation generation
"Make docs of lodash based on actual implementation"
```

### Historical Analysis
```bash
# Project evolution tracking
"Show progress of React project in the recent 5 years"

# Comparative analysis
"How is Vue rendering architecture different than React? Check from code"
```

### Code Review & Improvement
```bash
# Code analysis and suggestions
"Show examples of usage of this API: import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'; Look at my code and suggest how I can improve it"
```

## ⚙️ Advanced Configuration

### Rate Limiting & Performance
- **Built-in Rate Limiting**: Prevents API quota exhaustion with smart request management
- **Intelligent Caching**: Result caching with configurable timeouts
- **Progressive Search**: Adaptive search strategies from broad to specific
- **Configurable Results**: Optimized result limits for different use cases

### Authentication Management
- **Seamless GitHub CLI Integration**: Zero-configuration authentication
- **NPM Registry Support**: Private package access with existing credentials
- **Organization-aware Access**: Automatic detection and private repository access
- **Local Execution**: All operations run locally using your existing permissions

### NPM Configuration
```bash
# Check your NPM configuration
npm config list
npm whoami  # Verify authentication for private registries

# Configure for private registries if needed
echo "@your-org:registry=https://npm.your-company.com/" >> ~/.npmrc
```

## 🎯 Best Practices

### Search Strategy
- **Start Broad**: Begin with general terms, then narrow down based on findings
- **Use Progressive Discovery**: Combine multiple tools for comprehensive understanding
- **Leverage Organizations**: Use your team's GitHub org for internal discovery
- **Cross-Reference Sources**: Combine code, issues, and discussions for complete context

### Performance Optimization
- **Use Specific Repository Filters**: When you know the target repository
- **Combine Related Searches**: In single sessions for efficiency
- **Monitor API Rate Limits**: Built-in management prevents quota exhaustion
- **Cache Frequently Accessed Information**: Automatic intelligent caching

### Tool Chaining Best Practices
- **Start with Topics**: Use `search_github_topics` for proper terminology discovery
- **Repository Discovery**: Use discovered topic names in `search_github_repos`
- **Organization Context**: Let automatic detection handle private repository access
- **Package Research**: Mention packages to trigger automatic NPM-to-repository mapping

## 🐛 Troubleshooting

### Authentication Issues
```bash
# Check GitHub CLI status
gh auth status
# Should show: ✓ Logged in to github.com as [username]

# Re-authenticate if needed
gh auth logout
gh auth login

# Check NPM authentication
npm whoami
```

### Common Issues
- **No Results Found**: Try broader search terms or check organization filters
- **Rate Limiting**: Built-in management should prevent this, but reduce frequency if needed
- **Private Repository Access**: Ensure proper organization membership via `gh auth status`
- **NPX Cache Issues**: Clear cache with `rm -rf ~/.npm/_npx` (Unix) or delete via File Explorer (Windows)

### NPM Configuration Issues
```bash
# View current configuration
npm config list

# Check for common issues:
# - Registry URL correctness
# - Authentication tokens validity
# - Proxy settings (if behind firewall)
# - Syntax errors in .npmrc

# Reset NPM configuration if needed
rm ~/.npmrc
npm login
```

### Misconfigured .npmrc File
1. **Locate .npmrc files**: Project-level (./), User-level (~/.npmrc), Global-level
2. **Check for common issues**: Registry URL, auth tokens, proxy settings, syntax errors
3. **View configuration**: `npm config list`
4. **Test after changes**: `yarn install` or `npm install`


### Development Setup
```bash
# Clone repository
git clone https://github.com/your-org/octocode-mcp.git
cd octocode-mcp

# Install dependencies
yarn install

# Run development server
yarn build

// Configuration local MCP
// "octocode-mcp-local": {
//   "command": "node",
//   "args": [
//     "PATH_TO_OCTOCODE_MCP/octocode-mcp/dist/index.js"
//   ]
// }

```

## License

MIT License - See [LICENSE](./LICENSE.md) for details.

---

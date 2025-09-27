# Octocode MCP - Smart Assistant for Code Context Creation

**The missing piece for AI agents that need quality code context. Transform any AI assistant into a code research expert that enriches context for better code handling, documentation, and complex ecosystem solutions.**

<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">
</div>

<div align="center">
  
  [![Version](https://img.shields.io/badge/version-6.0.0-blue.svg)](./package.json)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](./package.json)
  [![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.12.0-brightgreen)](https://nodejs.org/)
  [![MCP Community Server](https://img.shields.io/badge/Model_Context_Protocol-Official_Community_Server-blue?style=flat-square)](https://github.com/modelcontextprotocol/servers)
  [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/bgauryy/octocode-mcp)
  [![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/bgauryy/octocode-mcp)](https://archestra.ai/mcp-catalog/bgauryy__octocode-mcp)


</div>

## 🎯 Why Octocode MCP?

**The Context Gap Problem:** Most MCP servers today focus on web searches and documentation. But when AI agents need to understand code, implement complex solutions, or work within specific ecosystems, they lack the deep, contextual code knowledge that makes the difference between generic and expert-level assistance.

**Octocode MCP solves this** by providing AI agents with real-time, intelligent access to millions of code repositories, enabling them to:

### 🚀 **Core Capabilities**
- **🔍 Smart Code Context Creation** - Find and analyze real implementations with semantic understanding
- **🏗️ Complex Ecosystem Solutions** - Understand how solutions work within private organizations and specific tech stacks
- **📚 Documentation Enhancement** - Enrich docs with real code examples and best practices
- **🎯 Example Discovery** - Find proven patterns and implementations for any coding challenge
- **🔄 Progressive Research** - AI-powered research flows that build comprehensive understanding

### 💡 **Perfect For**
- **Code Creation**: Get context about patterns, libraries, and implementations before writing code
- **Complex Bug Solutions**: Find solutions for complex bugs (which most LLMs struggle with) by analyzing real fixes and debugging approaches
- **Complex Solutions**: Understand how enterprise-level solutions are architected and implemented  
- **Documentation**: Find real examples to support technical documentation and guides
- **Learning & Best Practices**: Discover how experienced developers solve similar problems
- **Ecosystem Understanding**: Navigate complex codebases and understand organizational patterns

**Octocode MCP is the missing piece** that transforms any developer or AI agent from having generic knowledge to having deep, contextual understanding of real-world code solutions.

**Octocode boosts velocity, secured, and optimized (token-wise) for individuals and organizations** - providing enterprise-grade code context creation that scales from individual developers to large teams.

## 🚀 Quick Setup

### Prerequisites
- **Node.js** >= 18.12.0
- **GitHub Authentication** (choose one method below)

### Authentication Setup

**Option 1: GitHub CLI (Recommended)**
```bash
# Install GitHub CLI if needed
# macOS: brew install gh
# Windows: winget install --id GitHub.cli

# Authenticate
gh auth login
```

**Option 2: Personal Access Token**
1. Create token at [GitHub Settings → Personal Access Tokens](https://github.com/settings/tokens)
2. Required scopes: `repo`, `read:user`, `read:org`

### MCP Configuration

Add to your AI assistant's MCP configuration:

**With GitHub CLI:**
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

**With Personal Access Token:**
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

**That's it!** Your AI assistant can now search and analyze GitHub repositories.

## 🛠️ Available Research Tools

| Tool | Purpose | Default | Description |
|------|---------|---------|-------------|
| **`githubSearchCode`** | Code Discovery | ✅ | Search code across repositories with semantic queries |
| **`githubSearchRepositories`** | Repository Discovery | ✅ | Find repositories by topic, language, or description |
| **`githubViewRepoStructure`** | Structure Analysis | ✅ | Explore repository file structure and navigation |
| **`githubGetFileContent`** | Content Access | ✅ | Fetch specific files or code sections with context |
| **`githubSearchPullRequests`** | History Analysis | ❌ | Analyze pull requests and code changes |

**Default tools** are automatically enabled. **Non-default tools** require configuration (see Advanced Setup below).

## 🎯 Real-World Context Creation Examples

**Code Creation Context:**
```
"I need to implement OAuth2 in my Node.js app - show me real implementations"
→ Finds proven OAuth2 patterns → Analyzes security practices → Provides implementation context
```

**Complex Ecosystem Solutions:**
```
"How do large organizations handle microservices communication?"
→ Discovers enterprise patterns → Examines real architectures → Explains design decisions
```

**Documentation Enhancement:**
```
"Find real examples of GraphQL error handling for my API docs"
→ Searches GraphQL implementations → Extracts error patterns → Provides documentation examples
```

**Best Practices Discovery:**
```
"What are the current best practices for React state management in 2024?"
→ Analyzes modern React apps → Compares state solutions → Identifies trending patterns
```


**See the dramatic difference in AI assistant capability:**
**[🎯 Live Demo: ThreeJS Code Creation Comparison](https://octocode-sonnet4-gpt5-comparisson.vercel.app/)**

This interactive comparison shows how Octocode MCP transforms AI assistants from providing generic code suggestions to delivering expert-level, context-rich implementations with real-world patterns and best practices.

## 📺 Examples

### Example 1: Deep code research with Octocode
- **Prompt**:
```
Explain deeply how React hooks work under the hood, using information from code and documents.
Provide a technical explanation, covering both basic and advanced concepts.
Do a deep research
```
- **Video**: [YouTube](https://www.youtube.com/watch?v=BCOpsRjAPU4&t=9s)

### Example 2: Learn about AI Agents using Octocode
- **Goal**: Create context for agents creation
- **Video**: [YouTube](https://www.youtube.com/watch?v=rhQ3nTwU9kw)

### Example 3: Review PRs using Octocode
- **Video**: [YouTube](https://www.youtube.com/watch?v=rhQ3nTwU9kw)


## ⚙️ Advanced Configuration

### Tool Selection
```bash
# Run only specific tools (exclusive mode)
export TOOLS_TO_RUN="githubSearchCode,githubSearchRepositories"

# Enable additional tools (additive mode) 
export ENABLE_TOOLS="githubSearchPullRequests"

# Disable specific default tools
export DISABLE_TOOLS="githubViewRepoStructure"

# Enable experimental features
export BETA="1"
```

**Note:** `TOOLS_TO_RUN` cannot be combined with `ENABLE_TOOLS`/`DISABLE_TOOLS`.

### Enterprise Features
- **Content Sanitization**: Automatic detection and redaction of sensitive data
- **Smart Token Management**: Efficient content reduction for large codebases  
- **Access Control**: Uses your GitHub permissions (public/private repositories)
- **Rate Limiting**: Built-in GitHub API rate limit handling

## 📚 Documentation & Resources

| Resource | Description |
|----------|-------------|
| **[🌐 octocode.ai](https://octocode.ai)** | Interactive tutorials and community |
| **[📺 YouTube Channel](https://www.youtube.com/@Octocode-ai)** | Video tutorials and demos |
| **[📚 Usage Guide](./docs/USAGE_GUIDE.md)** | 20+ examples and best practices |
| **[🔐 Authentication Guide](./docs/AUTHENTICATION.md)** | Complete setup and enterprise features |
| **[🔧 Tool Schemas](./docs/TOOL_SCHEMAS.md)** | Complete API reference for all tools |
| **[🏗️ Architecture Overview](./docs/summary.md)** | System design and performance details |

## 🚨 Need Help?

- **Issues & Bugs:** [GitHub Issues](https://github.com/bgauryy/octocode-mcp/issues)
- **Community:** [Discord](https://discord.gg/octocode)
- **Documentation:** [octocode.ai](https://octocode.ai)
---

  <a href="https://glama.ai/mcp/servers/@bgauryy/octocode-mcp">
    <img width="380" height="200" src="https://glama.ai/mcp/servers/@bgauryy/octocode-mcp/badge" />
  </a>

<div align="center">
  <p>Built with ❤️ for developers</p>
  <p>
    <a href="https://octocode.ai">Website</a> •
    <a href="https://github.com/bgauryy/octocode-mcp">GitHub</a> •
    <a href="https://www.npmjs.com/package/octocode-mcp">NPM</a> •
    <a href="https://discord.gg/octocode">Discord</a>
  </p>
</div>
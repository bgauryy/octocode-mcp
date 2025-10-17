<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">
  
  # Octocode MCP
  
  **Transform Any AI Assistant Into a Code Research Expert**
  
  [![MCP Community Server](https://img.shields.io/badge/Model_Context_Protocol-Official_Community_Server-blue?style=flat-square)](https://github.com/modelcontextprotocol/servers)
  [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/bgauryy/octocode-mcp)
  [![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/bgauryy/octocode-mcp)](https://archestra.ai/mcp-catalog/bgauryy__octocode-mcp)

  
</div>

---

## 🎯 What is Octocode?

Octocode MCP gives AI assistants **real-time access to millions of GitHub repositories**, enabling them to provide context-rich, production-quality responses based on real-world code implementations.

**Perfect for:** Code creation, bug fixes, architecture research, documentation, and learning from real implementations.

**[📖 Full Documentation →](./packages/octocode-mcp/README.md)**

---

## 🚀 Quick Start

```bash
# 1. Authenticate with GitHub (requires GitHub CLI: https://cli.github.com/)
gh auth login

# 2. Add to your AI assistant's config
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"]
    }
  }
}

# 3. Start using it!
"Search for React hooks implementations in popular repositories"
```

**[📖 Complete Setup Guide →](./packages/octocode-mcp/README.md#-quick-start-2-minutes)**

---

## 📦 Repository Contents

This repository contains four main components:

### 🔍 Octocode MCP Server
**[`packages/octocode-mcp/`](./packages/octocode-mcp/)**

The core MCP server that enables AI assistants to search and analyze GitHub code.

**Features:**
- 🔍 Smart code discovery across millions of repositories
- 📊 Progressive research workflows
- 🔒 Enterprise-grade security with content sanitization
- ⚡ Token-efficient responses (up to 70% reduction)

**[📖 Full Documentation →](./packages/octocode-mcp/README.md)**

---

### 🧰 Octocode Utils
**[`packages/octocode-utils/`](./packages/octocode-utils/)**

Utility library for token optimization and content processing used by Octocode MCP.

**Features:**
- 🗜️ Smart content minification for 50+ file types
- ⚡ Advanced token optimization strategies
- 🔧 Helper utilities for content processing
- 📦 Standalone NPM package

**Perfect for:** Building token-efficient AI tools and content processors.

---

### 🧠 Octocode Local Memory
**[`packages/octocode-local-memory/`](./packages/octocode-local-memory/)**

Ultra-fast in-memory storage MCP server for AI agent coordination and communication.

**Features:**
- ⚡ Sub-millisecond operations (< 1ms read/write)
- 🤝 Enable multiple AI agents to coordinate during workflows
- 🔒 File lock management to prevent conflicts
- 📊 Task assignments, status updates, and inter-agent messaging
- 🪶 Zero configuration - no database or Redis required

**Perfect for:** Multi-agent workflows, task coordination, real-time status tracking, and parallel agent execution.

**[📖 Full Documentation →](./packages/octocode-local-memory/README.md)**

---

### Octocode Local Files
**[`packages/octocode-local-files/`](./packages/octocode-local-files/)**

Local file system research MCP server **purpose-built for AI agents** — designed for research-oriented, structure-first workflows that help agents understand codebases efficiently.

**Agent-Optimized Design:**
- **Research-oriented architecture** - Built specifically for AI agents to explore and understand file systems, not just search
- **Structure-first workflows** - Understand directory organization before diving into content (explore layout → identify patterns → read targeted content)
- **Parallel bulk operations** - Process multiple research queries simultaneously in single request
- **Complete context delivery** - All results together enable better cross-referencing and pattern recognition
- **Automatic token optimization** - Content minification and pattern-based extraction reduce token usage
- **Comprehensive toolset** - Combines ls, find, and grep with agent-friendly structured responses
- **Security-first design** - Command injection prevention, path traversal protection, auto-filtering of secrets

**Why Better Than IDE Tools?**

| Feature | IDE Tools (Cursor/VSCode) | octocode-local-files |
|---------|---------------------------|---------------------|
| **Research Speed** | Sequential (one search at a time) | Parallel (multiple queries at once) |
| **Token Efficiency** | Raw content only | Minified content + pattern extraction |
| **LLM Context** | Fragmented individual results | Complete bulk responses |
| **File Discovery** | Basic glob patterns | Advanced find (size/time/permissions/content) |
| **Structure Exploration** | Manual navigation required | Automated recursive analysis with filters |
| **Workflow Support** | Manual tool chaining | Built-in progressive refinement |

**Perfect for:** Codebase research, refactoring analysis, bug hunting, documentation generation, and understanding complex projects.

**[📖 Full Documentation →](./packages/octocode-local-files/README.md)**

---

### 🤖 Octocode Claude Plugin
**[`octocode-claude-plugin/`](./octocode-claude-plugin/)**

Multi-agent development system for Claude Code that transforms ideas into production-ready applications.

**Features:**
- 7 specialized AI agents (Product Manager, Architect, Engineers, QA)
- 7-phase workflow from requirements to deployment
- Research-driven decisions from 100k+ GitHub repos
- Parallel execution with file conflict prevention
- 80-90% test coverage enforcement

**Example:**
```bash
/octocode-generate Build a blog platform with authentication and comments
```

**[📖 Full Documentation →](./octocode-claude-plugin/README.md)**

---

## 🎥 See It In Action

### [🎯 Live Demo: ThreeJS Implementation Comparison](https://octocode-sonnet4-gpt5-comparisson.vercel.app/)
See the dramatic difference between generic AI and Octocode-enhanced AI.

### [📺 YouTube Examples](https://www.youtube.com/@Octocode-ai)
- Deep code research (React internals)
- AI agent development workflow
- Pull request analysis

---

## 📚 Resources

- **[🌐 Official Website](https://octocode.ai)** - Interactive tutorials
- **[📖 Usage Guide](./packages/octocode-mcp/docs/USAGE_GUIDE.md)** - 20+ examples
- **[🔐 Authentication](./packages/octocode-mcp/docs/AUTHENTICATION.md)** - Setup guide
- **[🔧 API Reference](./packages/octocode-mcp/docs/TOOL_SCHEMAS.md)** - Tool schemas
- **[📚 Code Resources](./resources/)** - 610+ curated repositories

---

## 🌟 Community

- **⭐ Star us on [GitHub](https://github.com/bgauryy/octocode-mcp)**
- **💬 [Discussions](https://github.com/bgauryy/octocode-mcp/discussions)**
- **🐛 [Report Issues](https://github.com/bgauryy/octocode-mcp/issues)**

<div align="center">
  
  <a href="https://glama.ai/mcp/servers/@bgauryy/octocode-mcp">
    <img width="380" height="200" src="https://glama.ai/mcp/servers/@bgauryy/octocode-mcp/badge" />
  </a>

  ---

  **Built with ❤️ for developers by developers**

  [Website](https://octocode.ai) • [GitHub](https://github.com/bgauryy/octocode-mcp) • [NPM](https://www.npmjs.com/package/octocode-mcp)

</div>

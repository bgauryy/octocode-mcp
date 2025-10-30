<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">
  
  # Octocode MCP
  
  **Agentic Assistant for AI Agents & IDEs - Smarter Context from Real Code**
  
  [![MCP Community Server](https://img.shields.io/badge/Model_Context_Protocol-Official_Community_Server-blue?style=flat-square)](https://github.com/modelcontextprotocol/servers)
  [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/bgauryy/octocode-mcp)
  [![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/bgauryy/octocode-mcp)](https://archestra.ai/mcp-catalog/bgauryy__octocode-mcp)

  
</div>

---

## 💡 What is Octocode?

Octocode is an **agentic assistant for AI agents and IDEs** that creates smarter context from actual code implementations across millions of GitHub repositories.

### ✨ Key Benefits

- **🎯 Real-World Code Patterns** - Learn from production codebases, not just documentation
- **🔒 Enterprise-Grade Security** - Built-in content sanitization and secrets detection
- **🏢 Organization-Wide Support** - Can work on any GitHub organization (based on your permissions), including private orgs
- **📊 Progressive Research** - Discover → Explore → Analyze workflow for deep code understanding


**Perfect for:** Code creation, bug fixes, architecture research, documentation, and learning from real implementations.

---

## 🎬 See It In Action

### 🚀 Full-Stack Agentic App Built in Under 10 Minutes

Watch Octocode transform a simple prompt into a complete production-ready application with full-stack implementation (frontend + backend).

**💬 The Single Prompt:**

> **Prompt: 

> Use Octocode MCP for Deep Research**
> I want to build an application with chat (front-end) that shows a chat window to the user.  
> The user enters a prompt in the chat, and the application sends the prompt to an Express backend that uses AI to process the request.
>
> Add a return box (to show the message returned from the AI) and loaders to the UI.  
> I want to build an AI agent system in Node.js using LangChain and LangGraph. Can you research the latest patterns?
>
> Please conduct thorough research on how to create this in the best way possible.  
> Focus on repositories with good documentation and recent activity.
>
> - Do a deep research  
> - Create a plan document  
> - Initiate the plan and create the application


**📋 Phase 1: Research & Planning**

https://github.com/user-attachments/assets/4225ab98-ae2f-46dc-b3ce-7d117e552b8c

[Octocode Plan Document](https://gist.github.com/bgauryy/06504671c0d5fef727fe22c492e054d6)

*Octocode researches best practices from Millions of repositories and creates a detailed implementation plan*

**⚡ Phase 2: Implementation** *(Run the plan using any CLI/IDE)*

https://github.com/user-attachments/assets/2aaee9f1-3592-438a-a633-255b5cbbb8e1

*From plan to working code - full application built with real-world patterns*

---

**🎯 What You Get:**
- ✅ Deep research across popular repositories
- ✅ Detailed architecture and implementation plan
- ✅ Complete working application (frontend + backend)
- ✅ Production-ready code following industry best practices
- ⏱️ **All in less than 10 minutes!**

---

### 🌟 More Examples

- **[🎮 Live Demo: ThreeJS Implementation Comparison](https://octocode-sonnet4-gpt5-comparisson.vercel.app/)**  
  See the dramatic quality difference between generic AI responses and Octocode-enhanced responses
  
- **[📺 YouTube Channel](https://www.youtube.com/@Octocode-ai)**  
  Deep code research tutorials, AI agent workflows, and pull request analysis

---

## 🚀 Quick Start

Get started with Octocode in 2 minutes:

```bash
# 1. Authenticate with GitHub (install GitHub CLI from https://cli.github.com/)
gh auth login

# 2. Add to your AI assistant's MCP configuration
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"]
    }
  }
}

# 3. Start using it in your AI assistant!
```

**[📖 Complete Setup Guide →](./packages/octocode-mcp/README.md#-quick-start-2-minutes)**

---

## 📦 What's Inside

This monorepo contains four powerful tools for AI-enhanced development:

### 🔍 Octocode MCP Server
**[`packages/octocode-mcp/`](./packages/octocode-mcp/)** - The core MCP server

Enable AI assistants to search and analyze millions of GitHub repositories with intelligent code discovery.

**Key Features:**
- 🔍 Smart code search across GitHub's entire public repository index
- 📊 Progressive research workflows (Discover → Explore → Analyze)
- 🔒 Enterprise-grade security with automatic secrets sanitization
- ⚡ Token-efficient responses (up to 70% reduction)
- 🎯 Context-aware code retrieval with pattern matching

**[📖 Full Documentation →](./packages/octocode-mcp/README.md)**

---

### 🧰 Octocode Utils
**[`packages/octocode-utils/`](./packages/octocode-utils/)** - Utility library

Token optimization and content processing utilities used by Octocode MCP, available as a standalone package.

**Key Features:**
- 🗜️ Smart content minification for 50+ programming languages
- ⚡ Advanced token optimization strategies (30-60% savings)
- 🔧 Helper utilities for content processing
- 📦 Standalone NPM package for your own projects

**Perfect for:** Building token-efficient AI tools, content processors, and LLM integrations.

---

### 🧠 Octocode Local Memory
**[`packages/octocode-local-memory/`](./packages/octocode-local-memory/)** - In-memory storage MCP

Ultra-fast in-memory storage for AI agent coordination and communication without external dependencies.

**Key Features:**
- ⚡ Sub-millisecond operations (< 1ms read/write)
- 🤝 Enable multiple AI agents to coordinate seamlessly
- 🔒 File lock management to prevent race conditions
- 📊 Task assignments, status tracking, and inter-agent messaging
- 🪶 Zero configuration - no database or Redis required

**Perfect for:** Multi-agent workflows, task coordination, real-time status tracking, and parallel agent execution.

**[📖 Full Documentation →](./packages/octocode-local-memory/README.md)**

---

### 🤖 Octocode Claude Plugin
**[`octocode-claude-plugin/`](./octocode-claude-plugin/)** - Multi-agent development system

Transform ideas into production-ready applications with a team of specialized AI agents working in parallel.

**Key Features:**
- 👥 7 specialized AI agents (Product Manager, Architect, Frontend/Backend/DevOps Engineers, QA, Documentation)
- 📋 7-phase workflow: Requirements → Architecture → Development → Testing → Documentation → Deployment
- 🔬 Research-driven decisions from 100,000+ GitHub repositories
- 🚀 Parallel execution with automatic file conflict prevention
- ✅ 80-90% test coverage enforcement

**Example Usage:**
```bash
/octocode-generate Build a blog platform with authentication, comments, and admin panel
```

**[📖 Full Documentation →](./octocode-claude-plugin/README.md)**

---

## 📚 Resources & Documentation

### 📖 Guides
- **[🌐 Official Website](https://octocode.ai)** - Interactive tutorials and guides
- **[📖 Usage Guide](./packages/octocode-mcp/docs/USAGE_GUIDE.md)** - 20+ real-world examples
- **[🔐 Authentication Setup](./packages/octocode-mcp/docs/AUTHENTICATION.md)** - Complete setup guide
- **[🔧 API Reference](./packages/octocode-mcp/docs/TOOL_SCHEMAS.md)** - Detailed tool schemas

### 📦 Resources
- **[📚 Curated Code Resources](./resources/)** - 610+ hand-picked repositories organized by category

---

## 🌟 Community & Support

Join our growing community of developers using Octocode:

- **⭐ Star us on [GitHub](https://github.com/bgauryy/octocode-mcp)** - Show your support!
- **💬 [GitHub Discussions](https://github.com/bgauryy/octocode-mcp/discussions)** - Ask questions and share ideas
- **🐛 [Report Issues](https://github.com/bgauryy/octocode-mcp/issues)** - Found a bug? Let us know
- **📺 [YouTube Channel](https://www.youtube.com/@Octocode-ai)** - Video tutorials and examples

<div align="center">
  
  <a href="https://glama.ai/mcp/servers/@bgauryy/octocode-mcp">
    <img width="380" height="200" src="https://glama.ai/mcp/servers/@bgauryy/octocode-mcp/badge" />
  </a>

  ---

  **Built with ❤️ for developers by developers**

  [Website](https://octocode.ai)

</div>

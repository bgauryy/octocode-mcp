<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">

  # Octocode MCP

  **Intelligent Code Context for AI Systems**

  A Model Context Protocol (MCP) server enabling AI assistants to search, analyze, and extract insights from millions of GitHub repositories with enterprise-grade security and token efficiency.

  [![MCP Community Server](https://img.shields.io/badge/Model_Context_Protocol-Official_Community_Server-blue?style=flat-square)](https://github.com/modelcontextprotocol/servers)
  [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/bgauryy/octocode-mcp)
  [![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/bgauryy/octocode-mcp)](https://archestra.ai/mcp-catalog/bgauryy__octocode-mcp)

</div>

---

## Table of Contents

- [See It In Action](#see-it-in-action)
- [Installation](#installation)
  - [Quick Start](#quick-start)
  - [Platform-Specific Setup](#platform-specific-setup)
- [More Examples](#more-examples)
- [Overview](#overview)
- [Architecture](#architecture)
  - [Octocode MCP Server](#octocode-mcp-server)
- [Features](#features)
- [Documentation](#documentation)
- [Community](#community)
- [Recognition](#recognition)
- [License](#license)

---

## See It In Action

### Full-Stack Application Built in Under 10 Minutes

Watch AI assistant use Octocode to research, plan, and build a complete chat application with Express backend.

**The Single Prompt:**

> **Use Octocode MCP for Deep Research**
>
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

**Phase 1: Research & Planning**

https://github.com/user-attachments/assets/4225ab98-ae2f-46dc-b3ce-7d117e552b8c

[Octocode Plan Document](https://gist.github.com/bgauryy/06504671c0d5fef727fe22c492e054d6) - Detailed architecture and step-by-step guide

**Phase 2: Implementation**

https://github.com/user-attachments/assets/2aaee9f1-3592-438a-a633-255b5cbbb8e1

**Result**: Production-ready full-stack application with authentication, real-time features, and best practices - **All in less than 10 minutes**

---

## Installation

### Quick Start

**Prerequisites**:
- Node.js >= 18.12.0
- GitHub authentication (choose one):
  - **GitHub CLI (recommended)**: [https://cli.github.com/](https://cli.github.com/)
  - **Personal Access Token**: Create at [github.com/settings/tokens](https://github.com/settings/tokens) with scopes: `repo`, `read:user`, `read:org`

**Using GitHub CLI**:

1. Install the GitHub CLI if you haven’t already: [https://cli.github.com/](https://cli.github.com/)
2. Authenticate with your GitHub account:

```bash
gh auth login
```

3. Add Octocode MCP to your MCP configuration:

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

**Using Personal Access Token**:

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

**Using Claude CLI**:

1. Make sure the GitHub CLI is installed and authenticated:

```bash
gh auth login
```

2. Register the Octocode MCP server with Claude:

```bash
claude mcp add -s user octocode-mcp npx 'octocode-mcp@latest'
```

---

## More Examples

### Additional Demonstrations

#### ThreeJS Implementation Quality Comparison

**[Interactive Demo](https://octocode-sonnet4-gpt5-comparisson.vercel.app/)**

Side-by-side comparison showing:
- **Generic AI**: Basic implementation with common patterns
- **Octocode-Enhanced AI**: Production-grade implementation with advanced techniques from real projects

**Key Differences**:
- Performance optimizations from high-performance projects
- Proper resource management patterns
- Industry-standard error handling
- Real-world edge case handling

#### Deep Technical Research

**[YouTube: React Hooks Internals](https://www.youtube.com/watch?v=BCOpsRjAPU4&t=9s)**

Demonstrates progressive research workflow:
1. Repository discovery (React source)
2. Structure exploration (hooks implementation)
3. Code analysis (internal mechanisms)
4. Comprehensive explanation with code references

---

## Overview

Octocode is an **agentic code research platform** that bridges the gap between AI assistants and real-world code implementations. By providing structured access to GitHub's vast repository ecosystem, it enables AI systems to learn from production codebases rather than relying solely on training data.

### Core Capabilities

| Capability | Implementation | Benefit |
|------------|----------------|---------|
| **Code Discovery** | Multi-dimensional search across repositories, code, and pull requests | Find relevant implementations in seconds |
| **Context Extraction** | Smart content retrieval with pattern matching and line-range targeting | Get exactly the context you need |
| **Token Optimization** | Advanced minification strategies (50+ language support) | 30-70% reduction in token consumption |
| **Security** | Automatic secrets detection and content sanitization | Enterprise-grade data protection |
| **Progressive Research** | Workflow-driven exploration (Discover → Explore → Analyze) | Deep understanding of complex systems |
| **Access Control** | GitHub permission-based access to public and private repositories | Organization-wide code research |

---

## Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Assistant (Client)                    │
│                  (Claude, Cursor, VS Code)                   │
└────────────────────────┬────────────────────────────────────┘
                         │ MCP Protocol (stdio/SSE)
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   Octocode MCP Server                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Tool Layer (5 Research Tools)                       │  │
│  │  - githubSearchCode                                  │  │
│  │  - githubSearchRepositories                          │  │
│  │  - githubViewRepoStructure                           │  │
│  │  - githubGetFileContent                              │  │
│  │  - githubSearchPullRequests                          │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                      │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │  Processing Layer (octocode-utils)                   │  │
│  │  - Content Minification (Terser, CSS, HTML)          │  │
│  │  - JSON to YAML Conversion                           │  │
│  │  - Secret Detection & Sanitization                   │  │
│  │  - Token Optimization                                │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                      │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │  GitHub Integration Layer                            │  │
│  │  - Authentication (gh CLI / PAT)                     │  │
│  │  - API Client with Rate Limiting                     │  │
│  │  - Permission-based Access Control                   │  │
│  └────────────────────┬─────────────────────────────────┘  │
└────────────────────────┼────────────────────────────────────┘
                         │
                         │ GitHub REST API v3 + GraphQL
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    GitHub Platform                           │
│  - Public Repositories (100M+)                              │
│  - Private Repositories (permission-based)                  │
│  - Organization Repositories                                │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Request Phase**: AI assistant sends MCP tool request with search parameters
2. **Authentication**: Server validates GitHub credentials (gh CLI or PAT)
3. **Query Execution**: Server executes GitHub API requests with rate limiting
4. **Content Processing**: Raw responses processed through octocode-utils
   - Minification for token efficiency
   - Secret detection and sanitization
   - JSON to YAML conversion for structured data
5. **Response Delivery**: Optimized, secure content returned to AI assistant

---

### Octocode MCP Server

**Package**: [`packages/octocode-mcp/`](./packages/octocode-mcp/)
**NPM**: [`octocode-mcp`](https://www.npmjs.com/package/octocode-mcp)
**Type**: Model Context Protocol Server

#### Purpose

MCP server providing structured access to GitHub's code ecosystem through five specialized research tools.

#### Research Tools

| Tool | Purpose | Key Parameters | Output |
|------|---------|----------------|--------|
| **githubSearchCode** | Find code implementations across repositories | `keywordsToSearch`, `owner`, `repo`, `path`, `extension` | Code snippets with match context |
| **githubSearchRepositories** | Discover repositories by topic/keywords | `topicsToSearch`, `keywordsToSearch`, `stars`, `language` | Repository metadata (stars, topics, description) |
| **githubViewRepoStructure** | Explore directory structure | `owner`, `repo`, `path`, `depth` | File tree with sizes |
| **githubGetFileContent** | Read file contents with smart extraction | `owner`, `repo`, `path`, `matchString`, `startLine`, `endLine` | File content (full or partial) |
| **githubSearchPullRequests** | Analyze PRs, changes, discussions | `owner`, `repo`, `state`, `merged`, `withContent` | PR metadata, diffs, comments |

**[Full Documentation →](./packages/octocode-mcp/README.md)**

---

## Features

### Progressive Research Workflow

Octocode implements a three-phase research pattern optimized for deep code understanding:

```
Phase 1: DISCOVER
├─ githubSearchRepositories
│  └─ Find relevant projects by topic, stars, language
└─ Output: List of candidate repositories

Phase 2: EXPLORE
├─ githubViewRepoStructure
│  └─ Understand project organization and architecture
└─ Output: Directory tree with file sizes

Phase 3: ANALYZE
├─ githubSearchCode
│  └─ Find specific implementations and patterns
├─ githubGetFileContent
│  └─ Deep dive into specific files
└─ githubSearchPullRequests (optional)
   └─ Understand evolution and decision rationale
```

### Advanced Configuration

#### Tool Selection

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

#### Environment Variables

| Variable | Type | Description | Default |
|----------|------|-------------|---------|
| `GITHUB_TOKEN` | string | Personal Access Token for authentication | Uses `gh` CLI |
| `TOOLS_TO_RUN` | string | Comma-separated list of tools to run exclusively | All default tools |
| `ENABLE_TOOLS` | string | Comma-separated list of additional tools to enable | None |
| `DISABLE_TOOLS` | string | Comma-separated list of tools to disable | None |
| `BETA` | "0" \| "1" | Enable experimental features | "0" |

**Note**: `TOOLS_TO_RUN` is mutually exclusive with `ENABLE_TOOLS`/`DISABLE_TOOLS`.

---

## Documentation

### Comprehensive Guides

| Resource | Description | Link |
|----------|-------------|------|
| **Official Website** | Interactive tutorials, demos, community | [octocode.ai](https://octocode.ai) |
| **Usage Guide** | 20+ real-world examples and best practices | [USAGE_GUIDE.md](./packages/octocode-mcp/docs/USAGE_GUIDE.md) |
| **Authentication Guide** | Setup instructions and troubleshooting | [AUTHENTICATION.md](./packages/octocode-mcp/docs/AUTHENTICATION.md) |
| **Tool Schemas** | Complete API reference for all tools | [TOOL_SCHEMAS.md](./packages/octocode-mcp/docs/TOOL_SCHEMAS.md) |
| **Architecture** | System design, performance, internals | [summary.md](./packages/octocode-mcp/docs/summary.md) |
| **YouTube Channel** | Video tutorials and demonstrations | [Octocode on YouTube](https://www.youtube.com/@Octocode-ai) |


---

## Community

### Get Support

- **GitHub Discussions**: [Ask questions, share ideas](https://github.com/bgauryy/octocode-mcp/discussions)
- **GitHub Issues**: [Report bugs, request features](https://github.com/bgauryy/octocode-mcp/issues)
- **Documentation**: [Complete guides and references](https://octocode.ai)
- **YouTube**: [Video tutorials and examples](https://www.youtube.com/@Octocode-ai)

### Show Your Support

If Octocode helps your AI development workflow:

- **Star the repository** on [GitHub](https://github.com/bgauryy/octocode-mcp)
- **Share on social media** with #OctocodeMCP
- **Write about your experience** on your blog
- **Create tutorials** and share with the community
- **Contribute** improvements and bug fixes

---

<div align="center">

## Recognition

<a href="https://glama.ai/mcp/servers/@bgauryy/octocode-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@bgauryy/octocode-mcp/badge" alt="Octocode MCP on Glama" />
</a>

---

**Built with care for developers by developers**

[Website](https://octocode.ai) • [GitHub](https://github.com/bgauryy/octocode-mcp) • [NPM](https://www.npmjs.com/package/octocode-mcp)

---

*Octocode MCP is an official MCP Community Server*

[![MCP Community](https://img.shields.io/badge/Model_Context_Protocol-Official_Community_Server-blue?style=for-the-badge)](https://github.com/modelcontextprotocol/servers)

</div>

---

## License

MIT - See [LICENSE](./LICENSE) for details.

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
- [Commands](#commands)
  - [/research - Expert Code Research Agent](#research---expert-code-research-agent)
  - [/kudos - Repository Appreciation](#kudos---repository-appreciation)
  - [/use - Quick Reference Guide](#use---quick-reference-guide)
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

### Prerequisites

- **Node.js** >= 18.12.0
- **GitHub Authentication** (choose one):
  - **GitHub CLI (recommended)**: Install from [cli.github.com](https://cli.github.com/) and run `gh auth login`
  - **Personal Access Token**: Create at [github.com/settings/tokens](https://github.com/settings/tokens) with scopes: `repo`, `read:user`, `read:org`

### Quick Start

**Standard configuration** that works across most MCP clients:

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

> **Note**: This configuration uses GitHub CLI authentication. For Personal Access Token, see the [Authentication Guide](#authentication-methods) below.

---

### Platform-Specific Setup

<details>
<summary><b>Claude Desktop</b></summary>

#### One-Click Install (Recommended)

Use the Claude CLI to install Octocode MCP:

```bash
# Authenticate with GitHub first
gh auth login

# Install Octocode MCP
claude mcp add -s user octocode-mcp npx 'octocode-mcp@latest'
```

#### Manual Installation

1. Open your Claude Desktop configuration file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add Octocode to the configuration:

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

3. Restart Claude Desktop

</details>

<details>
<summary><b>Cursor</b></summary>

#### One-Click Install

Click the button below to install Octocode MCP in Cursor:

[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=Octocode&config=eyJjb21tYW5kIjoibnB4IG9jdG9jb2RlLW1jcEBsYXRlc3QifQ%3D%3D)

#### Manual Installation

1. Open Cursor Settings → **MCP** → **Add new MCP Server**
2. Set **Name**: `octocode`
3. Set **Type**: `command`
4. Set **Command**: `npx octocode-mcp@latest`
5. Click **Save**

#### Project-Specific Configuration

Create `.cursor/mcp.json` in your project root:

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

</details>

<details>
<summary><b>VS Code (Copilot)</b></summary>

#### One-Click Install

[<img src="https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square" alt="Install in VS Code">](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522octocode%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522octocode-mcp%2540latest%2522%255D%257D) [<img alt="Install in VS Code Insiders" src="https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square">](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522octocode%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522octocode-mcp%2540latest%2522%255D%257D)

#### CLI Installation

```bash
# For VS Code
code --add-mcp '{"name":"octocode","command":"npx","args":["octocode-mcp@latest"]}'

# For VS Code Insiders
code-insiders --add-mcp '{"name":"octocode","command":"npx","args":["octocode-mcp@latest"]}'
```

#### Manual Installation

Follow the [VS Code MCP guide](https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server) and use the standard config above.

</details>

<details>
<summary><b>Cline (VS Code Extension)</b></summary>

1. Open VS Code
2. Click the **MCP Servers** icon (📚) in the Cline extension
3. Click **Configure MCP Servers**
4. Add to `cline_mcp_settings.json`:

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

5. Restart VS Code or reload Cline

</details>

<details>
<summary><b>Windsurf</b></summary>

Follow [Windsurf MCP documentation](https://docs.windsurf.com/windsurf/cascade/mcp) and use the standard config above.

</details>

<details>
<summary><b>Zed</b></summary>

1. Open Zed Settings
2. Navigate to **MCP Servers**
3. Add the standard configuration above
4. Restart Zed

</details>

<details>
<summary><b>Goose</b></summary>

#### One-Click Install

[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=octocode-mcp%40latest&id=octocode&name=Octocode&description=Intelligent%20code%20research%20and%20GitHub%20repository%20analysis)

#### Manual Installation

1. Go to **Advanced settings** → **Extensions** → **Add custom extension**
2. Set **Name**: `octocode`
3. Set **Type**: `STDIO`
4. Set **Command**: `npx octocode-mcp@latest`
5. Click **Add Extension**

</details>

<details>
<summary><b>LM Studio</b></summary>

#### One-Click Install

[![Add Octocode to LM Studio](https://files.lmstudio.ai/deeplink/mcp-install-light.svg)](https://lmstudio.ai/install-mcp?name=octocode&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJvY3RvY29kZS1tY3BAbGF0ZXN0Il19)

#### Manual Installation

1. Go to **Program** (right sidebar) → **Install** → **Edit mcp.json**
2. Add the standard configuration above
3. Save and restart

</details>

<details>
<summary><b>Warp</b></summary>

#### Using UI

1. Go to **Settings** → **AI** → **Manage MCP Servers** → **+ Add**
2. Use the standard configuration above

#### Using Slash Command

Type `/add-mcp` in the Warp prompt and paste:

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

</details>

---

### Authentication Methods

Octocode MCP supports two authentication methods:

#### Option 1: GitHub CLI (Recommended)

**Advantages**: Automatic token management, works with 2FA, supports SSO

```bash
# Install GitHub CLI
# macOS
brew install gh

# Windows
winget install --id GitHub.cli

# Linux
# See https://github.com/cli/cli/blob/trunk/docs/install_linux.md

# Authenticate
gh auth login
```

Then use the standard configuration (no `GITHUB_TOKEN` needed).

#### Option 2: Personal Access Token

**When to use**: CI/CD environments, automation, or if GitHub CLI isn't available

1. Create a token at [github.com/settings/tokens](https://github.com/settings/tokens)
2. Select scopes: `repo`, `read:user`, `read:org`
3. Add to your MCP configuration:

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

> **Security Tip**: Never commit tokens to version control. Use environment variables or secure secret management.

---

### Verify Installation

After installation, verify Octocode MCP is working:

1. **Restart your MCP client** completely
2. **Check connection status**:
   - **Cursor**: Look for green dot in Settings → Tools & Integrations → MCP Tools
   - **Claude Desktop**: Check for "octocode" in available tools
   - **VS Code**: Verify in GitHub Copilot settings
3. **Test with a simple query**:
   ```
   Search GitHub for React hooks implementations
   ```

If you see Octocode tools being used, you're all set! 🎉

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

## Commands

Octocode MCP provides intelligent prompt commands that enhance your research workflow:

### `/research` - Expert Code Research Agent

**Purpose**: Systematic code research using decision-tree workflows

**When to use**:
- **Understanding repository workflows**: Discover how repositories work, trace specific flows through codebases, and understand technical implementations
- **Cross-repository flow analysis**: Understand complex flows that span multiple repositories, trace data flows across microservices, or analyze how different repos interact
- **Technical flow investigation**: Deep-dive into technical flows within or across repositories (even cross-repo dependencies and integrations)
- **Real-world code examples**: Learn from actual production code implementations, not just documentation or tutorials
- **Deep technical investigations**: Trace code flows, understand complex implementations, analyze architecture decisions
- **Answering team questions**: Quickly research Slack/Jira questions about features, APIs, or behavior with code-backed answers
- **Bug investigation**: Find root causes by analyzing code, commit history, and related PRs
- **Organization features**: Understand how features work across your private/public repositories
- **Pattern discovery**: Compare implementations across multiple repos to find best practices
- **Documentation validation**: Verify docs match actual code behavior

**What it does**:
- Provides systematic guidance through research stages (discovery → exploration → analysis → synthesis)
- Executes multiple queries in parallel for faster results
- Shows transparent reasoning at each step
- Adapts to different research types: code implementation, documentation validation, pattern comparison, or bug investigation

**Usage Examples** (by research type):

**Technical Research** (code-first, understanding implementations):
```
/research How does React's useState hook work internally?
/research How to build a LangChain application with Express backend and Next.js frontend?
```

**Product Research** (docs + code validation):
```
/research What are the rate limiting features in our API according to docs and actual code?
/research How does authentication work in NextAuth.js? Verify docs against implementation
```

**Pattern Analysis** (comparing multiple implementations):
```
/research Compare state management approaches: Redux vs Zustand vs Jotai
/research How do popular repos handle WebSocket reconnection logic?
```

**Bug Investigation** (root cause analysis):
```
/research Why is the payment webhook failing? Trace the error through payment-service
/research User reports slow dashboard loading - investigate performance issues in myorg/frontend
```

**Key Features**:
- Progressive refinement (broad → specific → deep dive)
- Code-as-truth validation (verifies docs against actual implementation)
- Cross-repository pattern analysis (public & private repos)
- Comprehensive synthesis with Mermaid diagrams and cited references
- Perfect for answering technical questions from Slack/Jira with code evidence

---

### `/kudos` - Repository Appreciation

**Purpose**: List and appreciate all GitHub repositories used in your research session

**When to use**:
- End of a research session to see what repos helped you
- Finding repositories to star and support

**What it does**:
- Analyzes conversation history
- Identifies all GitHub repositories explored via Octocode tools
- Creates formatted list with links and usage notes
- Reminds you to show appreciation to maintainers

**Usage**:
```
/kudos
```

**Output Example**:
```markdown
# Repositories Used in This Research

## ⭐ Repositories Explored

1. **facebook/react** — https://github.com/facebook/react
   Searched for hooks implementation and internals

2. **vercel/next.js** — https://github.com/vercel/next.js
   Explored routing architecture
```

---

### `/use` - Quick Reference Guide

**Purpose**: Simple reminder of Octocode MCP capabilities and best practices

**When to use**:
- Quick refresher on available tools
- Learning key practices for efficient research
- Getting started with Octocode

**What it covers**:
- **Code Discovery**: Search repositories, explore structures, find patterns
- **Deep Analysis**: Read files, analyze PRs with diffs, track commits
- **Research Workflow**: Progressive refinement methodology
- **Key Practices**: Bulk queries, partial file access, search-first approach

**Usage**:
```
/use
```

---

### Tips for Using Commands

1. **Start with `/use`** if you're new to Octocode MCP
2. **Use `/research`** for complex, multi-step investigations that need structured guidance
3. **Run `/kudos`** at the end of sessions to document sources and show appreciation
4. Commands work in any MCP-compatible client (Claude, Cursor, etc.)

---

## Documentation

### Comprehensive Guides

| Resource | Description | Link |
|----------|-------------|------|
| **Official Website** | Interactive tutorials, demos, community | [octocode.ai](https://octocode.ai) |
| **Usage Guide** | 20+ real-world examples and best practices | [USAGE_GUIDE.md](./docs/USAGE_GUIDE.md) |
| **Authentication Guide** | Setup instructions and troubleshooting | [AUTHENTICATION.md](./docs/AUTHENTICATION.md) |
| **Tool Schemas** | Complete API reference for all tools | [TOOL_SCHEMAS.md](./docs/TOOL_SCHEMAS.md) |
| **Architecture** | System design, performance, internals | [SUMMMARY.md](./docs/SUMMMARY.md) |
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

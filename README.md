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

**Prompt:**

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

### Research and Build Fullstack Agentic Application with /research command in Under 10 Minutes

**Prompt:**

> /octocode/research How can I use LangChain, LangGraph, and similar open-source AI tools to create agentic 
> flows between agents for goal-oriented tasks?
> Can you suggest UI frameworks I can use to build a full-stack AI application?

https://github.com/user-attachments/assets/82ed97ae-57a9-46ae-9acd-828a509e711b

## Installation

### Prerequisites

- **Node.js** >= 18.12.0
- **GitHub Authentication** (choose one):
  - **GitHub CLI (recommended)**: Install from [cli.github.com](https://cli.github.com/) and run `gh auth login`
  - **Personal Access Token**: Create at [github.com/settings/tokens](https://github.com/settings/tokens) with scopes: `repo`, `read:user`, `read:org`

### Getting started

First, install the Octocode MCP server with your client.

**Standard config** works in most of the tools:

```js
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": [
        "octocode-mcp@latest"
      ]
    }
  }
}
```

> **Note**: This configuration uses GitHub CLI authentication. For Personal Access Token, see the [Authentication Guide](#authentication-methods) below.

[<img src="https://img.shields.io/badge/VS_Code-VS_Code?style=flat-square&label=Install%20Server&color=0098FF" alt="Install in VS Code">](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522octocode%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522octocode-mcp%2540latest%255D%257D) [<img alt="Install in VS Code Insiders" src="https://img.shields.io/badge/VS_Code_Insiders-VS_Code_Insiders?style=flat-square&label=Install%20Server&color=24bfa5">](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522octocode%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522octocode-mcp%2540latest%255D%257D)

<details>
<summary>Amp</summary>

Add via the Amp VS Code extension settings screen or by updating your settings.json file:

```json
"amp.mcpServers": {
  "octocode": {
    "command": "npx",
    "args": [
      "octocode-mcp@latest"
    ]
  }
}
```

**Amp CLI Setup:**

Add via the `amp mcp add` command below:

```bash
amp mcp add octocode -- npx octocode-mcp@latest
```

</details>

<details>
<summary>Claude Code</summary>

Use the Claude Code CLI to add the Octocode MCP server:

```bash
claude mcp add octocode npx octocode-mcp@latest
```

</details>

<details>
<summary>Claude Desktop</summary>

Follow the MCP install [guide](https://modelcontextprotocol.io/quickstart/user), use the standard config above.

</details>

<details>
<summary>Codex</summary>

Use the Codex CLI to add the Octocode MCP server:

```bash
codex mcp add octocode npx "octocode-mcp@latest"
```

Alternatively, create or edit the configuration file `~/.codex/config.toml` and add:

```toml
[mcp_servers.octocode]
command = "npx"
args = ["octocode-mcp@latest"]
```

For more information, see the [Codex MCP documentation](https://github.com/openai/codex/blob/main/codex-rs/config.md#mcp_servers).

</details>

<details>
<summary>Cursor</summary>

#### Click the button to install:

[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=octocode&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJvY3RvY29kZS1tY3BAbGF0ZXN0Il19)

#### Or install manually:

Go to `Cursor Settings` -> `MCP` -> `Add new MCP Server`. Name to your liking, use `command` type with the command `npx octocode-mcp@latest`. You can also verify config or add command like arguments via clicking `Edit`.

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
<summary>Cline</summary>

Add via the Cline VS Code extension settings or by updating your `cline_mcp_settings.json` file:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": [
        "octocode-mcp@latest"
      ]
    }
  }
}
```

</details>

<details>
<summary>Gemini CLI</summary>

Follow the MCP install [guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md#configure-the-mcp-server-in-settingsjson), use the standard config above.

</details>

<details>
<summary>Goose</summary>

#### Click the button to install:

[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=octocode-mcp%40latest&id=octocode&name=Octocode&description=Intelligent%20code%20research%20and%20GitHub%20repository%20analysis)

#### Or install manually:

Go to `Advanced settings` -> `Extensions` -> `Add custom extension`. Name to your liking, use type `STDIO`, and set the `command` to `npx octocode-mcp@latest`. Click "Add Extension".

</details>

<details>
<summary>Kiro</summary>

Follow the MCP Servers [documentation](https://kiro.dev/docs/mcp/). For example in `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": [
        "octocode-mcp@latest"
      ]
    }
  }
}
```

</details>

<details>
<summary>LM Studio</summary>

#### Click the button to install:

[![Add MCP Server octocode to LM Studio](https://files.lmstudio.ai/deeplink/mcp-install-light.svg)](https://lmstudio.ai/install-mcp?name=octocode&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJvY3RvY29kZS1tY3BAbGF0ZXN0Il19)

#### Or install manually:

Go to `Program` in the right sidebar -> `Install` -> `Edit mcp.json`. Use the standard config above.

</details>

<details>
<summary>opencode</summary>

Follow the MCP Servers [documentation](https://opencode.ai/docs/mcp-servers/). For example in `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "octocode": {
      "type": "local",
      "command": [
        "npx",
        "octocode-mcp@latest"
      ],
      "enabled": true
    }
  }
}
```

</details>

<details>
<summary>Qodo Gen</summary>

Open [Qodo Gen](https://docs.qodo.ai/qodo-documentation/qodo-gen) chat panel in VSCode or IntelliJ → Connect more tools → + Add new MCP → Paste the standard config above.

Click <code>Save</code>.

</details>

<details>
<summary>VS Code</summary>

#### Click the button to install:

[<img src="https://img.shields.io/badge/VS_Code-VS_Code?style=flat-square&label=Install%20Server&color=0098FF" alt="Install in VS Code">](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522octocode%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522octocode-mcp%2540latest%255D%257D) [<img alt="Install in VS Code Insiders" src="https://img.shields.io/badge/VS_Code_Insiders-VS_Code_Insiders?style=flat-square&label=Install%20Server&color=24bfa5">](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522octocode%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522octocode-mcp%2540latest%255D%257D)

#### Or install manually:

Follow the MCP install [guide](https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server), use the standard config above. You can also install the Octocode MCP server using the VS Code CLI:

```bash
# For VS Code
code --add-mcp '{"name":"octocode","command":"npx","args":["octocode-mcp@latest"]}'
```

After installation, the Octocode MCP server will be available for use with your GitHub Copilot agent in VS Code.

</details>

<details>
<summary>Warp</summary>

Go to `Settings` -> `AI` -> `Manage MCP Servers` -> `+ Add` to [add an MCP Server](https://docs.warp.dev/knowledge-and-collaboration/mcp#adding-an-mcp-server). Use the standard config above.

Alternatively, use the slash command `/add-mcp` in the Warp prompt and paste the standard config from above:

```js
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": [
        "octocode-mcp@latest"
      ]
    }
  }
}
```

</details>

<details>
<summary>Windsurf</summary>

Follow Windsurf MCP [documentation](https://docs.windsurf.com/windsurf/cascade/mcp). Use the standard config above.

</details>

<details>
<summary>Zed</summary>

Follow the MCP Servers [documentation](https://zed.dev/docs/assistant/model-context-protocol). Use the standard config above.

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

## Tools

Octocode provides five specialized research tools designed to work together for comprehensive code analysis:

### 🔍 githubSearchCode

**Find code implementations across repositories**

Search for specific code patterns, functions, or implementations across millions of repositories.

**Key Features**:
- **Content Search**: Find code inside files by keywords (AND logic)
- **Path Search**: Discover files/directories by name (25x faster)
- **Smart Filtering**: Scope by repository, path, file extension, or popularity
- **Context-Rich Results**: Returns code snippets with surrounding context

**Common Use Cases**:
```
• Find implementation examples: "How do popular repos implement OAuth?"
• Discover patterns: "Search for React custom hooks in vercel repos"
• Locate functions: "Find error handling patterns in Express apps"
```

**Best Practices**:
- Start with path search for discovery, then use content search for details
- Specify `owner`/`repo` to avoid rate limits
- Use `extension` filter for specific file types
- Set `limit=5-10` for focused results

---

### 📚 githubSearchRepositories

**Discover repositories by topics and keywords**

Your starting point for repository discovery - find the right projects to analyze.

**Key Features**:
- **Topic-Based Discovery**: Search by exact GitHub topics (most precise)
- **Keyword Search**: Find repos by name, description, or README content
- **Quality Filters**: Filter by stars, language, size, activity
- **Sorting Options**: By popularity, recency, or relevance

**Common Use Cases**:
```
• Find popular implementations: "Discover TypeScript CLI tools with >1000 stars"
• Research ecosystems: "Find all React state management libraries"
• Organization research: "List all repos from microsoft with topic 'ai'"
```

**Best Practices**:
- Use `topicsToSearch` for curated, high-quality results
- Apply `stars=">1000"` filter for production-ready code
- Sort by `stars` for popular repos, `updated` for maintained projects
- Start broad, then narrow with specific filters

---

### 🗂️ githubViewRepoStructure

**Explore repository directory structure**

Understand how a project is organized before diving into specific files.

**Key Features**:
- **Directory Tree**: Visual representation of folder structure
- **File Sizes**: See file sizes to identify important components
- **Depth Control**: Explore 1 level (overview) or 2 levels (detailed)
- **Path Targeting**: Navigate directly to specific directories

**Common Use Cases**:
```
• Project overview: "Show me the structure of facebook/react"
• Find entry points: "Explore src/ directory in a monorepo"
• Understand architecture: "Navigate to the API implementation folder"
```

**Best Practices**:
- Start with `depth=1` at root for overview
- Use `depth=2` for specific directories when you know the structure
- Navigate progressively: root → interesting folder → specific subfolder
- Use before reading files to understand project organization

---

### 📄 githubGetFileContent

**Read file contents with smart extraction**

Retrieve specific content from files efficiently - full files or targeted sections.

**Key Features**:
- **Pattern Matching**: Extract sections matching specific patterns with context
- **Line Range Reading**: Read specific line ranges for efficiency
- **Full Content Access**: Get entire file when needed
- **Content Minification**: Automatic optimization for token efficiency

**Common Use Cases**:
```
• Read specific functions: "Get the validateUser function from auth.ts"
• Extract sections: "Show me all the middleware definitions in app.js"
• Read configuration: "Get the full package.json file"
• Analyze specific code: "Read lines 100-150 from the API handler"
```

**Best Practices**:
- Use `matchString` with context lines for targeted reads (85% token savings)
- Use `startLine`/`endLine` for known locations
- Only use `fullContent=true` for small files or when you need everything
- Set `minified=false` for config files (JSON, YAML) to preserve formatting

---

### 🔀 githubSearchPullRequests

**Analyze pull requests, changes, and discussions**

Understand how code evolved, why decisions were made, and learn from production changes.

**Key Features**:
- **PR Discovery**: Search by state, author, labels, dates
- **Direct Access**: Fetch specific PR by number (10x faster)
- **Code Diffs**: Include full diff content to see what changed
- **Discussions**: Access comment threads and review discussions
- **Merged Code**: Filter for production-ready, merged changes

**Common Use Cases**:
```
• Learn from changes: "Show recent merged PRs about authentication"
• Understand decisions: "Find PRs discussing the API redesign with comments"
• Track implementations: "See how feature X was implemented with diffs"
• Expert contributions: "Find PRs by @author in the last 6 months"
```

**Best Practices**:
- Use `prNumber` for direct access when you know the PR
- Filter `state="closed"` + `merged=true` for production code
- Set `withContent=true` only when you need to see code changes (expensive)
- Set `withComments=true` to understand context and decisions
- Use `limit=3-5` for focused analysis

---


**[Full Documentation →](./packages/octocode-mcp/README.md)**

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
2. **Use `/research` for all code research** - This is the recommended way to use Octocode for any research task, providing structured guidance and optimal tool usage
3. **Run `/kudos`** at the end of sessions to document sources and show appreciation
4. Commands work in any MCP-compatible client (Claude, Cursor, etc.)

> **💡 Pro Tip**: For any code research, start with `/research` in Octocode MCP. This command intelligently orchestrates all tools for you, optimizing your workflow, depth of analysis, and research quality.

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

MIT - See [LICENSE](./LICENSE.md) for details.

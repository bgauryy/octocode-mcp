<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">
  
  **Transform Any AI Assistant Into a Code Research Expert**
  
  The missing piece for AI agents that need quality code context. Search millions of repositories, analyze real implementations, and discover proven patterns — all through a secure, token-efficient MCP server.
  
  [![MCP Community Server](https://img.shields.io/badge/Model_Context_Protocol-Official_Community_Server-blue?style=flat-square)](https://github.com/modelcontextprotocol/servers)
  [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/bgauryy/octocode-mcp)
  [![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/bgauryy/octocode-mcp)](https://archestra.ai/mcp-catalog/bgauryy__octocode-mcp)
  
</div>

---

## 📑 Table of Contents

- [Why Octocode MCP?](#-why-octocode-mcp)
- [Quick Start](#-quick-start-2-minutes)
- [How to Choose the Right Tool](#-how-to-choose-the-right-tool)
- [Available Tools](#-available-research-tools)
- [Platform Setup](#-platform-setup)
- [Real-World Examples](#-real-world-examples)
- [Advanced Configuration](#-advanced-configuration)
- [Documentation & Resources](#-documentation--resources)
- [Community & Support](#-community--support)

---

##  Why Octocode MCP?

### The Context Gap Problem

Most AI assistants today have **generic knowledge** but lack **deep, contextual understanding** of real-world code solutions. When you need to:

- ✅ Implement complex features with proven patterns
- ✅ Debug difficult issues by finding similar solutions
- ✅ Understand how enterprise-scale systems work
- ✅ Learn best practices from production code
- ✅ Create comprehensive technical documentation

**You hit a wall.** Generic AI knowledge isn't enough.

### The Octocode Solution

Octocode MCP bridges this gap by providing AI assistants with **real-time access to millions of GitHub repositories**, enabling:

| Capability | What You Get |
|-----------|-------------|
| **🔍 Smart Code Discovery** | Find relevant implementations using semantic search across millions of repositories |
| **📊 Progressive Research** | AI-powered workflows that build comprehensive understanding through multiple queries |
| **🏗️ Ecosystem Understanding** | Analyze how real organizations structure complex systems and solve hard problems |
| **📚 Real-World Examples** | Access production code, not toy examples or outdated tutorials |
| **🔒 Enterprise-Grade Security** | Automatic content sanitization, respects GitHub permissions, redacts sensitive data |
| **⚡ Token-Efficient** | Smart content minification reduces token usage by up to 70% |

### Perfect For

- **🎨 Code Creation**: Get context about patterns, libraries, and implementations before writing code
- **🐛 Complex Bug Fixes**: Find real solutions for complex bugs by analyzing how others solved similar issues
- **🏢 Enterprise Solutions**: Understand how large-scale systems are architected and maintained
- **📖 Documentation**: Enrich technical docs with real, tested code examples
- **🎓 Learning**: Discover how experienced developers tackle challenging problems
- **🔍 Technology Research**: Research new frameworks, patterns, and best practices

### See The Difference

**[ Live Demo: ThreeJS Code Creation Comparison](https://octocode-sonnet4-gpt5-comparisson.vercel.app/)**

This interactive comparison shows how Octocode MCP transforms AI assistants from providing generic code suggestions to delivering expert-level, context-rich implementations.

---

## 🚀 Quick Start (2 Minutes)

### Prerequisites

- **Node.js** >= 18.12.0
- **GitHub Authentication** (choose one):
  - [GitHub CLI](https://cli.github.com/) (recommended): `gh auth login`
  - Personal Access Token: Create at [github.com/settings/tokens](https://github.com/settings/tokens) with `repo`, `read:user`, `read:org` scopes

### Installation

Add Octocode MCP to your AI assistant's configuration:

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

**Need help finding your config file?** See [Platform Setup](#-platform-setup) for detailed instructions for Claude Desktop, Cursor, Windsurf, and VS Code.

**Using a Personal Access Token?** Add it to the `env` section (see Platform Setup for examples).

### Verify Installation

After setup, try this in your AI assistant:

```
"Search for React hooks implementations in popular repositories"
```

If you see search results from GitHub repositories, you're all set! 🎉

---

## 🧭 How to Choose the Right Tool

Use this decision tree to select the perfect tool for your task:

```
📝 What do you want to do?

├─ 🔍 Find code or examples
│  ├─ Know what you're looking for → githubSearchCode
│  └─ Need to discover repositories first → githubSearchRepositories
│
├─ 📂 Explore a repository
│  ├─ See file/folder structure → githubViewRepoStructure
│  └─ Read specific files → githubGetFileContent
│
├─ 📚 Understand changes/history
│  └─ Analyze pull requests → githubSearchPullRequests
│
└─  Not sure where to start?
   └─ Start broad with githubSearchRepositories → then narrow down
```

### Quick Reference Table

| Goal | Tool | What It Returns |
|------|------|----------------|
| **Find specific code** | `githubSearchCode` | Code snippets with context |
| **Discover repositories** | `githubSearchRepositories` | Repo list with stars, topics |
| **Explore structure** | `githubViewRepoStructure` | File/folder tree |
| **Read files** | `githubGetFileContent` | Full or partial file content |
| **Analyze changes** | `githubSearchPullRequests` | PR details, diffs, discussions |

---

## 🛠️ Available Research Tools

### Default Tools (Always Enabled)

#### `githubSearchCode`
**Find specific code implementations across repositories**

**Best for:**
- Finding how a function/class is implemented
- Discovering code patterns and examples
- Researching library usage

**Not recommended for:**
- Finding repositories (use `githubSearchRepositories`)
- Reading full files (use `githubGetFileContent`)

**Example Prompts:**
- "Find React useEffect cleanup patterns"
- "Show me OAuth2 implementation in Node.js"
- "Search for error handling in GraphQL resolvers"

**Arguments:**
```typescript
{
  keywordsToSearch: string[];     // Required: Terms to search for
  owner?: string;                 // Filter by repo owner
  repo?: string;                  // Filter by specific repo
  path?: string;                  // Search in specific directory
  filename?: string;              // Filter by filename
  extension?: string;             // Filter by file type
  limit?: number;                 // Max results (1-20)
}
```

---

#### `githubSearchRepositories`
**Discover repositories by topic, language, or description**

**Best for:**
- Finding projects in specific domains
- Discovering popular implementations
- Research technology ecosystems

**Not recommended for:**
- Searching inside code (use `githubSearchCode`)
- Reading repository content (use `githubViewRepoStructure` first)

**Example Prompts:**
- "Find popular React component libraries"
- "Show me microservices examples with high stars"
- "Discover AI agent frameworks"

**Arguments:**
```typescript
{
  keywordsToSearch?: string[];    // Search in name/description
  topicsToSearch?: string[];      // Search by GitHub topics
  owner?: string;                 // Filter by owner
  stars?: string;                 // e.g., ">1000", "100..500"
  language?: string;              // e.g., "TypeScript"
  sort?: string;                  // "stars" | "forks" | "updated"
  limit?: number;                 // Max results (1-20)
}
```

---

#### `githubViewRepoStructure`
**Explore repository file and folder structure**

**Best for:**
- Understanding project organization
- Finding where specific code lives
- Navigating before reading files

**Not recommended for:**
- Reading file contents (use `githubGetFileContent`)
- Searching across repos (use `githubSearchCode`)

**Example Prompts:**
- "Show me the structure of the React repository"
- "What's in the src folder of this project?"
- "Explore the components directory"

**Arguments:**
```typescript
{
  owner: string;                  // Required: Repository owner
  repo: string;                   // Required: Repository name
  path?: string;                  // Directory path (default: root)
  depth?: number;                 // 1 = current dir, 2 = with subdirs
  branch?: string;                // Branch name (default: main branch)
}
```

---

#### `githubGetFileContent`
**Read file contents with smart context retrieval**

**Best for:**
- Reading specific files
- Getting code context around matches
- Line-range based reading

**Not recommended for:**
- Searching across files (use `githubSearchCode`)
- Finding files (use `githubViewRepoStructure`)

**Example Prompts:**
- "Show me the README of this repo"
- "Read the authentication module"
- "Get lines 50-100 of this file"

**Arguments:**
```typescript
{
  owner: string;                  // Required: Repository owner
  repo: string;                   // Required: Repository name
  path: string;                   // Required: File path
  startLine?: number;             // Optional: Start reading from line
  endLine?: number;               // Optional: End reading at line
  matchString?: string;           // Optional: Find and return context around match
  matchStringContextLines?: number; // Lines of context (default: 5)
  branch?: string;                // Branch name
}
```

---

### Advanced Tools (Optional)

#### `githubSearchPullRequests`
**Analyze pull requests, changes, and discussions**

**Enable with:** `export ENABLE_TOOLS="githubSearchPullRequests"`

**Best for:**
- Understanding how features were implemented
- Learning from code review discussions
- Analyzing bug fixes and solutions

**Not recommended for:**
- Current code search (use `githubSearchCode`)
- General repository discovery (use `githubSearchRepositories`)

**Example Prompts:**
- "Show me recent authentication PRs"
- "Find PRs that fixed performance issues"
- "Analyze how they implemented dark mode"

**Arguments:**
```typescript
{
  owner?: string;                 // Repository owner
  repo?: string;                  // Repository name
  prNumber?: number;              // Specific PR number
  state?: "open" | "closed";      // PR state
  merged?: boolean;               // Only merged PRs
  query?: string;                 // Free-text search
  limit?: number;                 // Max results (1-10)
  withContent?: boolean;          // Include code diffs
  withComments?: boolean;         // Include discussions
}
```

---

## 🖥️ Platform Setup

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Restart Claude Desktop to activate.

---

### Cursor

1. Open **Cursor Settings** → **Features** → **MCP Servers**
2. Click **"+ Add New Global MCP Server"**
3. Enter configuration:

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

4. Save and restart Cursor

**Access in Cursor:** Use the Composer (⌘+L on Mac) and select "Agent" mode to automatically use Octocode tools.

---

### Windsurf

Add to `~/.codeium/windsurf/model_config.json`:

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

Restart Windsurf after configuration.

---

### VS Code

**One-Click Installation:**

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_MCP-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=octocode&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22octocode-mcp%40latest%22%5D%7D)

**Manual Installation:**

Add to User Settings (JSON) — Press `Ctrl/Cmd + Shift + P` → `Preferences: Open User Settings (JSON)`:

```json
{
  "mcp": {
    "servers": {
      "octocode": {
        "command": "npx",
        "args": ["octocode-mcp@latest"]
      }
    }
  }
}
```

---

## 📺 Real-World Examples

### Example 1: Deep Code Research
**Prompt:** "Explain deeply how React hooks work under the hood, using information from code and documents."

Watch the AI use Octocode to:
1. Search React repository for hooks implementation
2. Analyze the source code structure
3. Read specific files for technical details
4. Synthesize comprehensive explanation

**[📺 Watch on YouTube](https://www.youtube.com/watch?v=BCOpsRjAPU4&t=9s)**

---

### Example 2: Learn About AI Agents
**Goal:** Create comprehensive context for building AI agents

**[📺 Watch on YouTube](https://www.youtube.com/watch?v=rhQ3nTwU9kw)**

---

### Example 3: Review Pull Requests
**Goal:** Analyze how features are implemented through PR reviews

**[📺 Watch on YouTube](https://www.youtube.com/watch?v=rhQ3nTwU9kw)**

---

### Example 4: Complex ThreeJS Implementation
**See the dramatic difference** between generic AI and Octocode-enhanced AI:

**[ Interactive Demo](https://octocode-sonnet4-gpt5-comparisson.vercel.app/)**

This comparison shows how Octocode transforms AI from generic suggestions to expert-level implementations with real-world patterns.

---

## ⚙️ Advanced Configuration

### Tool Selection

**Run Specific Tools Only (Exclusive Mode):**
```bash
export TOOLS_TO_RUN="githubSearchCode,githubSearchRepositories"
```

**Enable Additional Tools (Additive Mode):**
```bash
export ENABLE_TOOLS="githubSearchPullRequests"
```

**Disable Specific Default Tools:**
```bash
export DISABLE_TOOLS="githubViewRepoStructure"
```

**Enable Experimental Features:**
```bash
export BETA="1"
```

**Note:** `TOOLS_TO_RUN` cannot be combined with `ENABLE_TOOLS`/`DISABLE_TOOLS`.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_TOKEN` | Personal Access Token for authentication | Uses `gh` CLI if not set |
| `TOOLS_TO_RUN` | Comma-separated list of tools to run exclusively | All default tools |
| `ENABLE_TOOLS` | Comma-separated list of additional tools to enable | None |
| `DISABLE_TOOLS` | Comma-separated list of tools to disable | None |
| `BETA` | Enable experimental features | `0` |

### Example Configuration with Environment Variables

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here",
        "ENABLE_TOOLS": "githubSearchPullRequests"
      }
    }
  }
}
```

### Enterprise Features

**Content Sanitization:**
- Automatic detection and redaction of API keys, tokens, passwords
- Pattern-based secret detection across 50+ types
- Configurable through security policies

**Token Optimization:**
- Smart content minification (up to 70% reduction)
- Partial file reading for large files
- Structured, predictable response formats

**Access Control:**
- Respects your GitHub permissions
- Works with public and private repositories
- Organization-level access support

**Rate Limiting:**
- Built-in GitHub API rate limit handling
- Automatic retries with exponential backoff
- Progress indicators for long operations

---

## 📚 Documentation & Resources

| Resource | Description | Link |
|----------|-------------|------|
| **🌐 Official Website** | Interactive tutorials and community | [octocode.ai](https://octocode.ai) |
| **📺 YouTube Channel** | Video tutorials and demos | [Octocode on YouTube](https://www.youtube.com/@Octocode-ai) |
| **📖 Usage Guide** | 20+ examples and best practices | [USAGE_GUIDE.md](./docs/USAGE_GUIDE.md) |
| **🔐 Authentication Guide** | Complete setup and enterprise features | [AUTHENTICATION.md](./docs/AUTHENTICATION.md) |
| **🔧 Tool Schemas** | Complete API reference for all tools | [TOOL_SCHEMAS.md](./docs/TOOL_SCHEMAS.md) |
| **🏗️ Architecture** | System design and performance details | [summary.md](./docs/summary.md) |
| **📦 NPM Package** | Latest releases and changelog | [octocode-mcp on NPM](https://www.npmjs.com/package/octocode-mcp) |

---

## 💬 Community & Support

### Get Help

- **💡 Feature Requests:** [GitHub Discussions](https://github.com/bgauryy/octocode-mcp/discussions/new?category=ideas)
- **🐛 Issues & Bugs:** [GitHub Issues](https://github.com/bgauryy/octocode-mcp/issues)
- **📖 Documentation:** [octocode.ai](https://octocode.ai)
- **🎓 Video Tutorials:** [YouTube Channel](https://www.youtube.com/@Octocode-ai)

### Contributing

We welcome contributions! Octocode MCP is open source and community-driven.

1. **Fork the repository** on GitHub
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** with tests
4. **Run tests**: `yarn test`
5. **Submit a pull request**

For questions or suggestions, please open an issue on GitHub.

### Show Your Support

If Octocode MCP helps you build better AI applications, consider:

- ⭐ **Star the repository** on [GitHub](https://github.com/bgauryy/octocode-mcp)
- 🐦 **Share on Twitter** with #OctocodeMCP
- 📝 **Write a blog post** about your experience
- 🎥 **Create a tutorial** and share with the community

---

<div align="center">

## 🌟 Recognition

<a href="https://glama.ai/mcp/servers/@bgauryy/octocode-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@bgauryy/octocode-mcp/badge" alt="Octocode MCP on Glama" />
</a>

---

### Built with ❤️ for developers by developers

**[Website](https://octocode.ai)** • **[GitHub](https://github.com/bgauryy/octocode-mcp)** • **[NPM](https://www.npmjs.com/package/octocode-mcp)**

---

*Octocode MCP is an official MCP Community Server*

[![MCP Community](https://img.shields.io/badge/Model_Context_Protocol-Official_Community_Server-blue?style=for-the-badge)](https://github.com/modelcontextprotocol/servers)

</div>

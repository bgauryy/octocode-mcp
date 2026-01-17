<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">

  <h1>Octocode Research</h1>
  
  **Give your AI agent superpowers for code research** — lightweight, automated, and terminal-native.

  [![Skill](https://img.shields.io/badge/skill-agentskills.io-purple)](https://agentskills.io/what-are-skills)
  [![License](https://img.shields.io/badge/license-PolyForm--Small--Business-green)]()

</div>

---

## 🚀 Why Use This Skill?

**It's the efficient, automated version of Octocode MCP.**

| Feature | Standard MCP | **Octocode Research Skill** |
|---------|--------------|-----------------------------|
| **Context** | Heavy (loads all tool schemas) | **Lightweight** (loads what needed when needed) |
| **Workflow** | Manual prompt selection | **Auto-Pilot** (Agent picks the right prompt for you) |
| **Execution** | Serial tool calls | **Parallel** (Fast, concurrent research) |
| **Interface** | IDE / Editor | **Terminal-Native** (Runs anywhere via curl) |

---

## ✨ Key Capabilities

### 🧠 Auto-Pilot Mode
You don't need to know which tool to use. The skill **analyzes your request** and picks the perfect workflow:
- *"How does X work?"* → **Research Mode** (GitHub + Docs)
- *"Trace this function"* → **Local Mode** (LSP + Grep)
- *"Review PR #123"* → **Review Mode** (Diff analysis)
- *"Plan a feature"* → **Planning Mode** (Architecture design)

### 🛡️ Safe & Secure
Inherits the same robust security model as Octocode:
- **Read-Only**: Safely researches external code without executing it.
- **Sandboxed**: Strict boundaries between your code and external research data.

---

## 🛠️ How It Works

This skill implements a **lightweight layer** similar to MCP to exchange tools, system prompts, and prompts—just like Octocode MCP—but with streamlined efficiency.

It manages research flows using **optimized context handling**, ensuring the agent receives exactly what it needs without the overhead.

---

## 🏁 Quick Start

### Option 1: Via Octocode CLI (Recommended)

```bash
# 1. Install Octocode CLI
npx octocode-cli

# 2. Follow the prompts to set up GitHub auth and install skills
```

### Option 2: Manual Installation

```bash
# 1. Clone and install
cd skills/octocode-research
npm install

# 2. Set GitHub auth (choose one)
export GITHUB_TOKEN="ghp_xxx"          # Environment variable
# OR
gh auth login                           # GitHub CLI

# 3. Start server
npm start

# 4. Verify
curl http://localhost:1987/health
```

### First Steps

```bash
# Load system prompt (do this FIRST)
curl http://localhost:1987/tools/system

# List available tools
curl http://localhost:1987/tools/list

# Get tool schema before using
curl http://localhost:1987/tools/info/localSearchCode

# Run your first search
curl "http://localhost:1987/localSearchCode?pattern=export&path=src"
```

That's it! Your agent is now equipped with research superpowers.

---

## 💡 What Can You Ask?

### 🔍 Research External Code
> "How does **React's useState** work internally?"
> "Explain **Express** middleware chaining pattern"

###  Explore Your Codebase
> "Trace the **auth flow** from login to database"
> "Find all usages of `UserService`"

### 📋 Review & Plan
> "Review this PR: **github.com/org/repo/pull/123**"
> "Plan a **caching strategy** for our API"

---

## License

PolyForm-Small-Business-1.0.0

<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">

  <h1>Octocode Research</h1>
  
  **Give your AI agent superpowers for code research** — Search, navigate, and deeply understand any codebase.

  [![Skill](https://img.shields.io/badge/skill-agentskills.io-purple)](https://agentskills.io/what-are-skills)
  [![License](https://img.shields.io/badge/license-PolyForm--Small--Business-green)]()

</div>

---

## What Can You Do?

Ask your AI agent to research code — both in your own projects and across GitHub.

### 🔍 Understand External Libraries

> "How does React's useState hook work internally?"

> "Show me how Express handles middleware chaining"

> "What's the difference between Prisma's findMany and findFirst?"

Your agent will search GitHub, navigate source code, and explain implementations in detail.

### 🏠 Explore Your Own Codebase

> "How does our authentication flow work?"

> "Find all places where we call the payment API"

> "Trace the data flow from user signup to database"

Your agent uses semantic code navigation (go-to-definition, find references, call hierarchy) to deeply understand your code structure.

### 📋 Review Pull Requests

> "Review this PR: https://github.com/org/repo/pull/123"

> "What are the potential issues with the changes in PR #456?"

Your agent analyzes diffs, understands context, and provides meaningful code review feedback.

### 📐 Plan Implementations

> "Plan how to add OAuth support to our app"

> "Design a caching layer for our API"

Your agent researches patterns, explores similar implementations, and creates detailed implementation plans.

---

## Quick Start

```bash
npx octocode-cli
```

That's it! The CLI handles:
- ✅ GitHub authentication
- ✅ Skill registration  
- ✅ Server startup

---



https://github.com/user-attachments/assets/7f4ab179-b810-40d5-aab5-e903a5c45c6e



---

## How It Works

This skill acts as an intelligent orchestration layer that **chooses the right prompts and tools** for you. It provides deep, MCP-style understanding of your code but with **minimal context usage**, keeping your agent focused and efficient.

When you ask your AI agent to research code, it automatically:

1. **Detects intent** — Local codebase or external library?
2. **Searches intelligently** — Uses the right tools for the job
3. **Navigates semantically** — Follows definitions, references, and call chains
4. **Explains findings** — Presents clear, actionable insights

### Local Research Tools

| Capability | What It Does |
|------------|--------------|
| **Code Search** | Find patterns across your entire codebase |
| **Go to Definition** | Jump to where functions/classes are defined |
| **Find References** | See everywhere a symbol is used |
| **Call Hierarchy** | Trace what calls what, and what gets called |

### External Research Tools

| Capability | What It Does |
|------------|--------------|
| **GitHub Search** | Search code across any repository |
| **Repository Explorer** | Browse file structures and contents |
| **PR Analysis** | Dive into pull request diffs and discussions |
| **Package Lookup** | Find npm/PyPI packages and their repos |

---

## Example Prompts

### Learning a Library

```
"Explain how Zustand manages state updates internally"
"Show me the implementation of React Query's caching mechanism"
"How does Tailwind CSS process utility classes?"
```

### Understanding Your Code

```
"Map out our API route structure"
"Find all database queries that don't use transactions"
"How does data flow from the frontend form to the database?"
```

### Code Archaeology

```
"Why was this function implemented this way? Find the PR"
"When was error handling added to the auth module?"
"Who changed the payment logic last month?"
```

---

## Why Use a Skill?

| Traditional Approach | With Octocode Research |
|---------------------|------------------------|
| Install tools per editor | One installation works everywhere |
| Context bloat from tool definitions | Clean context, tools run server-side |
| Basic file reading only | Semantic code navigation (LSP) |
| Manual setup for each project | Works instantly in any codebase |

---

## Managing the Skill

```bash
npx octocode-cli
# Select "Skills" from the menu
```

| Option | What It Does |
|--------|--------------|
| **Status** | Check if the research server is running |
| **Start** | Launch the research server |
| **Stop** | Shut down the server |
| **Logs** | View activity and debug issues |

---

## Troubleshooting

### Server Not Running?

```bash
npx octocode-cli
# Select "Skills" → "Start"
```

### Check Logs

```bash
# View activity
tail -f ~/.octocode/logs/tools.log

# View errors
cat ~/.octocode/logs/errors.log
```

---

## Learn More

- **What are Skills?** → [agentskills.io/what-are-skills](https://agentskills.io/what-are-skills)
- **Octocode MCP** → [github.com/bgauryy/octocode-mcp](https://github.com/bgauryy/octocode-mcp)

---

## License

PolyForm-Small-Business-1.0.0

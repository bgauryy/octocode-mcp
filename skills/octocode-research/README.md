<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">

  <h1>Octocode Research Skill</h1>

  **Your AI agent's code research engine** — auto-pilot research with MCP-like architecture.

  [![Skill](https://img.shields.io/badge/skill-agentskills.io-purple)](https://agentskills.io/what-are-skills)
  [![License](https://img.shields.io/badge/license-PolyForm--Small--Business-green)]()

</div>

---

## What Is This?

**Octocode Research** is an MCP-like skill that turns your AI agent into a code research expert. It automatically detects your intent, selects the optimal workflow, and conducts efficient multi-step research across local and external codebases.

```
Your Question → Intent Detection → Auto-Select Prompt → Smart Tool Chaining → Answer
```

**No manual configuration.** Ask anything about code — the skill figures out how to find the answer.

---

## How It Works

### MCP-Like Architecture

This skill implements a lightweight server (port 1987) that exposes tools, prompts, and system context — similar to the Model Context Protocol — but optimized for research workflows.

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Agent (Claude, etc.)                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Octocode Research Server                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Prompts   │  │    Tools    │  │   System Context    │  │
│  │  research   │  │  GitHub API │  │  Decision guides    │  │
│  │  local      │  │  Local LSP  │  │  Tool chaining      │  │
│  │  reviewPR   │  │  File ops   │  │  Error recovery     │  │
│  │  plan       │  │  Search     │  │  Best practices     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         Your Code       GitHub Repos    npm/PyPI
```

### Auto-Pilot Prompt Selection

The skill includes specialized prompts for different research types. Your agent automatically selects the right one:

| Your Intent | Auto-Selected Prompt | What Happens |
|-------------|---------------------|--------------|
| *"How does React useState work?"* | `research` | GitHub repo exploration, source code analysis |
| *"Trace the auth flow in our app"* | `research_local` | LSP-powered semantic analysis, call hierarchies |
| *"Review PR #123"* | `reviewPR` | Diff analysis, code review, change impact |
| *"Plan adding caching to the API"* | `plan` | Architecture design, implementation steps |

### Smart Tool Chaining

Each research task follows optimized tool chains with built-in hints guiding the next step:

```
External Library Research:
packageSearch → githubViewRepoStructure → githubSearchCode → githubGetFileContent

Local Code Tracing:
localSearchCode → lspGotoDefinition → lspCallHierarchy → localGetFileContent

Impact Analysis:
lspGotoDefinition → lspFindReferences → lspCallHierarchy(incoming) → tests check
```

---

## Key Features

### Lightweight Context Loading
Unlike traditional MCP that loads all tool schemas upfront, this skill loads context on-demand:
- System prompt loaded once
- Tool schemas fetched only when needed
- Prompts selected based on intent

### Parallel Execution
Tools support bulk queries (1-3 per call) for concurrent research:
```json
{
  "queries": [
    {"pattern": "useState", "path": "packages/react"},
    {"pattern": "useReducer", "path": "packages/react"}
  ]
}
```

### Response Hints
Every tool response includes actionable hints for the next step:
```json
{
  "data": { ... },
  "hints": [
    "Next: githubGetFileContent(path, matchString from text_matches)",
    "Explore: githubViewRepoStructure around interesting paths"
  ]
}
```

### Research Tracking
Built-in research params keep the agent focused:
- `mainResearchGoal` — Overall objective
- `researchGoal` — Current step's purpose
- `reasoning` — Why this tool/approach

---

## Quick Start

### Option 1: Octocode CLI (Recommended)

```bash
# Install and setup everything (auth + skill)
npx octocode-cli

# Follow the prompts to:
# 1. Authenticate with GitHub
# 2. Install the research skill
```
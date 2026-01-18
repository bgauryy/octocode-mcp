<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">

  <h1>Octocode Research Skill</h1>

  **Your AI agent's code research engine** — auto-pilot research with MCP-like architecture.

  [![Skill](https://img.shields.io/badge/skill-agentskills.io-purple)](https://agentskills.io/what-are-skills)
  [![License](https://img.shields.io/badge/license-MIT-blue)](../../LICENSE)

</div>

---

## What Is This?

**Octocode Research** is an MCP-like skill that turns your AI agent into a code research expert. It automatically detects your intent, selects the optimal workflow, and conducts efficient multi-step research across local and external codebases.

> Example: How React Implemented UseState?


https://github.com/user-attachments/assets/3c3997a3-2acb-4eba-81dd-233e0c9a8b30



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

---

## Key Features

### Lightweight Context Loading
Unlike traditional MCP that loads all tool schemas upfront, this skill loads context on-demand:
- System prompt loaded once
- Tool schemas fetched only when needed
- Prompts selected based on intent

### Available Tools

| Tool | Type | Description |
|------|------|-------------|
| **LSP Tools**  | Local | *Best for semantic code understanding* |
| `lspGotoDefinition` | Local | Go to symbol definition |
| `lspFindReferences` | Local | Find all symbol references |
| `lspCallHierarchy` | Local | Get call hierarchy (incoming/outgoing) |
| **Local Tools** | Local | *Filesystem & text search* |
| `localSearchCode` | Local | Search local code with ripgrep |
| `localGetFileContent` | Local | Read local file content |
| `localFindFiles` | Local | Find files by pattern/metadata |
| `localViewStructure` | Local | View local directory tree |
| **External Tools** | External | *GitHub & package registries* |
| `githubSearchCode` | External | Search code in GitHub repos |
| `githubGetFileContent` | External | Read file from GitHub repo |
| `githubViewRepoStructure` | External | View GitHub repo tree |
| `githubSearchRepositories` | External | Search GitHub repositories |
| `githubSearchPullRequests` | External | Search pull requests |
| `packageSearch` | External | Search npm/PyPI packages |

---

## Privacy & Telemetry

Octocode collects **de-identified** telemetry data to improve the tool, including command usage and error rates. We **never** collect source code, environment variables, or PII.

You can opt-out at any time:

```bash
export OCTOCODE_TELEMETRY_DISABLED=1
```

For full details, please read our [Privacy Policy](../../PRIVACY.md) and [Terms of Usage](../../TERMS.md).

> **Note**: This skill also logs local execution details to `~/.octocode/logs/` for your own debugging purposes. These logs are stored locally on your machine and are **never** uploaded.

---

## License

This project is licensed under the **MIT License**.

Copyright © 2026 Octocode AI.

See [LICENSE](../../LICENSE) for details.

---

## Quick Start

### Octocode CLI (Recommended)

```bash
# Install and setup everything (auth + skill)
npx octocode-cli

# Follow the prompts to:
# 1. Authenticate with GitHub
# 2. Install the research skill
```

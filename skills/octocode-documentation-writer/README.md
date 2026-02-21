<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">

  <h1>Octocode Documentation Writer Skill</h1>

  <p><strong>Repository Documentation Generator</strong></p>
  <p>Production-ready pipeline • Intelligent orchestration • Conflict-free writing</p>

  [![Skill](https://img.shields.io/badge/skill-agentskills.io-purple)](https://agentskills.io/what-are-skills)
  [![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE)

</div>

---

## The Problem

Agents struggle with writing documentation because:
- **No context** — They miss the "big picture" of the codebase.
- **Hallucinations** — They invent function names or behaviors.
- **Conflicts** — Multiple agents overwriting the same files.
- **Superficiality** — Generating generic "this function does X" docs.

## The Solution

**Octocode Documentation Writer** orchestrates specialized AI agents to:
1.  **Discover** the codebase structure.
2.  **Research** deep technical questions using **Octocode MCP** tools.
3.  **Write** comprehensive documentation with exclusive file ownership.
4.  **Validate** the output against the code.

---

## 🚀 Quick Start

### Installation

```bash
npx add-skill https://github.com/bgauryy/octocode-mcp/tree/main/skills/octocode-documentation-writer
```

### 🔌 Octocode MCP Setup (Required)

This skill relies on the **Octocode MCP server** for deep research capabilities (LSP, local search, etc.).

**1. Install the Server**

The easiest way is using the CLI:
```bash
npx octocode-cli
```
*Follow the interactive prompts to install "Octocode MCP" for your IDE.*

Or install manually in your MCP config (e.g. `.cursor/mcp.json`):
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

**2. Authentication**

**Option A: GitHub CLI (Recommended)**
```bash
gh auth login
```

**Option B: Personal Access Token**
If you cannot use the GitHub CLI, add your token to the config:
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

---

## ✨ Key Features

- **True Parallel Execution**: Runs discovery, research, and writing phases in parallel for maximum speed.
- **Evidence-Based**: Research agents prove answers with code traces (LSP-powered via Octocode MCP) before writing.
- **Conflict-Free Writing**: Writers are assigned exclusive file ownership to prevent overwrites.
- **State Recovery**: Resume from any phase if interrupted.
- **Dynamic Scaling**: Scales the number of agents based on the size and complexity of the repository.

## 🔄 Pipeline Phases

The documentation generation process consists of 6 phases:

1.  **Discovery & Analysis** (Parallel)
    - 4 agents analyze language, components, dependencies, and flows simultaneously.
    - Generates a comprehensive `analysis.json`.

2.  **Engineer Questions** (Single)
    - Generates deep technical questions based on the initial analysis.

3.  **Research** (Parallel)
    - Multiple researchers perform deep-dive code forensics to answer questions with evidence.
    - Uses **Octocode MCP** tools (LSP, Search) to trace code.

4.  **Orchestrator** (Single)
    - Groups questions and assigns exclusive file ownership to writers.
    - Ensures no two writers work on the same file to avoid conflicts.

5.  **Documentation Writers** (Parallel)
    - Multiple writers synthesize research and write the actual documentation files (`*.md`).
    - Produces core documentation and supplementary files.

6.  **QA Validator** (Single)
    - Validates the generated documentation against the code and initial questions.
    - Generates a quality score and a QA summary.

## 📂 Output

The generated documentation will be saved in the `documentation/` directory within your repository.

- `documentation/*.md`: The generated documentation files.
- `documentation/QA-SUMMARY.md`: A summary of the quality assurance check.
- `.context/`: Intermediate state files (analysis, research, assignments) - useful for debugging or manual inspection.

---

## License

MIT License © 2026 Octocode

See [LICENSE](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE) for details.

# Octocode: Research Driven Development for AI

<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">
  
  <h3>Stop Guessing. Start Knowing.</h3>
  <p><strong>Empower your AI assistant with the skills of a Senior Staff Engineer.</strong></p>
  
  <p>
    <a href="https://octocode.ai"><strong>🌐 Official Website: octocode.ai</strong></a>
  </p>
</div>

---

Octocode is not just a tool; it's a methodology and a platform that transforms how AI interacts with code. It moves AI from "guessing" based on training data to "knowing" based on deep, evidence-based research.

This repository contains the complete ecosystem that powers this transformation.

## 📜 The Manifest

**"Code is Truth, but Context is the Map."**

At the heart of Octocode lies the **Manifest for Research Driven Development (RDD)**.

👉 **Read the full manifest here: [MANIFEST.md](./MANIFEST.md)**

The Manifest defines a new philosophy for AI coding:
- **Vibe-Research**: Enabling AI to intuitively explore code like a human.
- **Evidence First**: No line of code is written without proof it's needed and correct.
- **Adversarial Validation**: AI agents check each other's work (Planner vs. Verifier) to ensure quality.

It answers the question: *How can we trust AI to build complex software?* By forcing it to research before it acts.

---

## 🔌 The MCP (Model Context Protocol)

**The Eyes and Hands of Octocode.**

The **Octocode MCP Server** (`packages/octocode-mcp`) is the bridge between your AI (like Claude or Cursor) and the world of code. It acts as the engine that powers the research.

- **GitHub Tools**: Search millions of repositories, find usage patterns, and read real-world implementations.
- **Local Tools**: Explore your local codebase with filesystem access.
- **LSP Intelligence**: "Go to Definition", "Find References", and "Call Hierarchy" — giving AI the semantic understanding of a compiler.

The MCP Server provides the *capabilities* to see, touch, and understand code structure.

---

## 🧠 The Skill

**The Brain of the Operation.**

> **[Agent Skills](https://agentskills.io/what-are-skills)** are a lightweight, open format for extending AI agent capabilities with specialized knowledge and workflows.

While the MCP provides the tools, the dedicated **[Octocode Research Skill](./skills/octocode-research)** provides a way to run Octocode wihtout indication what you need.

It adds specialized capabilities **out-of-the-box (OOTB)**:
1.  **Correct Prompts**: Auto-injects the Research Driven Development system prompts.
2.  **Advanced Planning**: Breaks down complex problems into specific research questions.
3.  **Deep Research**: Orchestrates the right MCP tools in the right order (e.g., Search → Go to Definition → Read).
4.  **Parallel Agents**: Handles spawning sub-agents for parallel execution of research tasks.

This skill turns a generic AI model into a specialized **Research Architect**.

---

## ⌨️ The CLI

**Your Command Center.**

Octocode comes with a powerful CLI to manage your agent's capabilities.

```bash
npx octocode-cli
```

It handles:
- **Authentication**: Easy GitHub OAuth setup.
- **Installations**: One-click setup for MCP servers and Skills.
- **Management**: Interactive menu for all Octocode features.

---

## 📚 Documentation

Everything you need to master Octocode:

### 📦 Packages in this Monorepo
- **[octocode-mcp](./packages/octocode-mcp)**: The core MCP server for GitHub, Local FS, and LSP.
- **[octocode-cli](./packages/octocode-cli)**: The command-line interface for managing Octocode.
- **[octocode-research](./skills/octocode-research)**: The Research Skill for autonomous RDD.
- **[octocode-vscode](./packages/octocode-vscode)**: VS Code extension for authentication.
- **[octocode-shared](./packages/octocode-shared)**: Shared utilities and types.

### 🎥 Tutorials
- [**Octocode AI YouTube Channel**](https://www.youtube.com/@Octocode-ai) - Video tutorials and deep dives.

### 🚀 Getting Started
- [**Installation Guide**](./README.md#installation-guide) - Get started quickly. (See previous README sections below)
- [**Octocode CLI**](./packages/octocode-cli/README.md) - The easiest way to install and manage skills.

### 📖 Core Concepts
- [**The Manifest**](./MANIFEST.md) - The philosophy behind RDD.
- [**Research Skill Guide**](./skills/octocode-research/README.md) - How to use the research agent.

### 🛠️ Reference
- [**GitHub Tools**](./packages/octocode-mcp/docs/GITHUB_TOOLS_REFERENCE.md)
- [**Local Tools**](./packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md)
- [**LSP Tools**](./packages/octocode-mcp/docs/LSP_TOOLS.md)

---

## Installation Guide

### Option 1: Octocode CLI (Recommended)

```bash
npx octocode-cli
```
→ Interactive menu for GitHub auth, MCP installation, and AI skills.

### Option 2: One-Click Install

[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=octocode&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJvY3RvY29kZS1tY3BAbGF0ZXN0Il19)

### Option 3: Manual Configuration

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

---

<div align="center">
  <sub>Built with ❤️ for the AI Engineering Community</sub>
</div>

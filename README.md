# Octocode: Research Driven Development for AI

<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">
  
  <h3>Stop Guessing. Start Knowing.</h3>
  <p><strong>Empower your AI assistant with the skills of a Senior Staff Engineer.</strong></p>
  
  <p>
    <a href="https://octocode.ai"><strong>octocode.ai</strong></a>
  </p>
</div>

---

## Installation

> **Prerequisites**: GitHub authentication required. See [Authentication Setup](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md).

### Recommended: Octocode CLI

```bash
npx octocode-cli
```

Interactive setup wizard with GitHub OAuth, MCP server installation, and skills marketplace.

### Alternative Methods

<details>
<summary><strong>One-Click Install (Cursor)</strong></summary>

[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=octocode&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJvY3RvY29kZS1tY3BAbGF0ZXN0Il19)

</details>

<details>
<summary><strong>Manual MCP Configuration</strong></summary>

Add to your MCP configuration file:

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
<summary><strong>Research Skill (Direct Install)</strong></summary>

```bash
npx add-skill https://github.com/bgauryy/octocode-mcp/tree/main/skills/octocode-research
```

</details>

---

## MCP Server

The [Octocode MCP Server](https://github.com/bgauryy/octocode-mcp/tree/main/packages/octocode-mcp) connects your AI assistant to code:

- **GitHub & GitLab**: Search repositories, find usage patterns, read implementations, explore PRs
- **Local Tools**: Search code, browse directories, find files in your local codebase
- **LSP Intelligence**: Go to Definition, Find References, Call Hierarchy -- compiler-level understanding

https://github.com/user-attachments/assets/de8d14c0-2ead-46ed-895e-09144c9b5071

---

## Skills

> [Agent Skills](https://agentskills.io/what-are-skills) are a lightweight, open format for extending AI agent capabilities.
> Skills index: [skills/README.md](https://github.com/bgauryy/octocode-mcp/blob/main/skills/README.md)

| Skill | What it does |
|-------|--------------|
| [**Research**](https://github.com/bgauryy/octocode-mcp/tree/main/skills/octocode-research) | Deep code exploration via LSP, local tools, GitHub API, packages, PRs |
| [**Local Search**](https://github.com/bgauryy/octocode-mcp/tree/main/skills/octocode-local-search) | Fast local codebase exploration with LSP semantic navigation |
| [**Plan**](https://github.com/bgauryy/octocode-mcp/tree/main/skills/octocode-plan) | Evidence-based planning: Understand, Research, Plan, Implement |
| [**PR Reviewer**](https://github.com/bgauryy/octocode-mcp/tree/main/skills/octocode-pull-request-reviewer) | PR review across 7 domains with evidence-backed findings |
| [**Roast**](https://github.com/bgauryy/octocode-mcp/tree/main/skills/octocode-roast) | Brutally honest code critique with file:line citations |
| [**Prompt Optimizer**](https://github.com/bgauryy/octocode-mcp/tree/main/skills/octocode-prompt-optimizer) | Transform weak prompts into enforceable agent protocols |
| [**Documentation Writer**](https://github.com/bgauryy/octocode-mcp/tree/main/skills/octocode-documentation-writer) | Generate comprehensive repo documentation in 6 phases |

https://github.com/user-attachments/assets/5b630763-2dee-4c2d-b5c1-6335396723ec

---

## Documentation

For the full documentation index, start here:
[docs/README.md](https://github.com/bgauryy/octocode-mcp/blob/main/docs/README.md)

Recommended quick links:
- [Authentication Setup](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md)
- [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md)
- [Local Tools + LSP Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md)
- [CLI Skills Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md)
- [Skills Index](https://github.com/bgauryy/octocode-mcp/blob/main/skills/README.md)
- [Troubleshooting](https://github.com/bgauryy/octocode-mcp/blob/main/docs/TROUBLESHOOTING.md)

### The Manifest

**"Code is Truth, but Context is the Map."** -- Read the [Manifest for Research Driven Development](https://github.com/bgauryy/octocode-mcp/blob/main/MANIFEST.md) to understand the philosophy behind Octocode.

---

### Contributing

See the [Development Guide](https://github.com/bgauryy/octocode-mcp/blob/main/docs/DEVELOPMENT_GUIDE.md) for monorepo setup, testing, and contribution guidelines.

---

<div align="center">
  <sub>Built with care for the AI Engineering Community</sub>
</div>

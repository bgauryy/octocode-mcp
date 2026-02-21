# AGENTS.md - Octocode Monorepo

> AI agent guidance for the Octocode MCP monorepo. See the Core references section for canonical docs links.

## Documentation Links Rule

All links in documentation files (`docs/`, `packages/*/docs/`) **MUST** use absolute GitHub URLs — never relative paths.

**Base URL:** `https://github.com/bgauryy/octocode-mcp/blob/main/`

```
❌ WRONG: [Config](./CONFIGURATION_REFERENCE.md)
❌ WRONG: [Auth](../packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md)
✅ RIGHT: [Config](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md)
✅ RIGHT: [Auth](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md)
```

## Core Methodology

1. **Task Management**: Review → Plan (use `todo` tool) → Track progress
2. **Research**: Prefer `octocode-local` MCP tools. LSP first, then local search, then GitHub
3. **TDD**: Write failing test → Run (`yarn test`) → Fix → Verify coverage (90%)
4. **ReAct Loop**: Reason → Act → Observe → Loop
5. **Quality**: Clean Code, run `yarn lint` + `yarn test`, use `npx knip` for dead code
6. **Efficiency**: Use Linux commands (`mv`, `cp`, `sed`) for file operations

> **File Operations**: Use Linux commands for file changes and prefer batching changes.
> For command examples and workflows, see: [Linux & File Operations](https://github.com/bgauryy/octocode-mcp/blob/main/docs/DEVELOPMENT_GUIDE.md#linux--file-operations)

## Repository Structure

```
octocode-mcp/
├── packages/
│   ├── octocode-mcp/      # MCP server: GitHub API, local tools, LSP
│   ├── octocode-cli/      # CLI installer & skills marketplace
│   ├── octocode-vscode/   # VS Code extension (OAuth, multi-editor)
│   └── octocode-shared/   # Shared utilities (credentials, platform, session)
├── skills/                 # AI agent skills (research, plan, roast, etc.)
├── docs/                   # Monorepo documentation
└── package.json            # Workspace root (yarn workspaces)
```

## Access Control

| Path | Access |
|------|--------|
| `packages/*/src/`, `packages/*/tests/` | ✅ Auto |
| `packages/*/docs/` | ✅ Auto |
| `*.json`, `*.config.*` | ⚠️ Ask |
| `.env*`, `.octocode/`, `node_modules/`, `dist/` | ❌ Never |

## Quick Commands

Use the canonical command list in the Development Guide (Commands & Workflow section).

## Package AGENTS.md

Each package has specific guidelines that **override** this root file:

| Package | Location |
|---------|----------|
| octocode-mcp | [packages/octocode-mcp/AGENTS.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/AGENTS.md) |
| octocode-cli | [packages/octocode-cli/AGENTS.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/AGENTS.md) |
| octocode-vscode | [packages/octocode-vscode/AGENTS.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-vscode/AGENTS.md) |
| octocode-shared | [packages/octocode-shared/AGENTS.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-shared/AGENTS.md) |

## Key References

### Core
- **Docs Index**: [docs/README.md](https://github.com/bgauryy/octocode-mcp/blob/main/docs/README.md)
- **Development Guide**: [docs/DEVELOPMENT_GUIDE.md](https://github.com/bgauryy/octocode-mcp/blob/main/docs/DEVELOPMENT_GUIDE.md)
- **Configuration**: [docs/CONFIGURATION_REFERENCE.md](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md)
- **Troubleshooting**: [docs/TROUBLESHOOTING.md](https://github.com/bgauryy/octocode-mcp/blob/main/docs/TROUBLESHOOTING.md)

### Skills
- **All Skills**: [skills/README.md](https://github.com/bgauryy/octocode-mcp/blob/main/skills/README.md)
- **Skills Guide**: [packages/octocode-cli/docs/SKILLS_GUIDE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md)

### Octocode MCP
- **GitHub & GitLab Tools**: [packages/octocode-mcp/docs/GITHUB_GITLAB_TOOLS_REFERENCE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITHUB_GITLAB_TOOLS_REFERENCE.md)
- **Local Tools**: [packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md)
- **Clone & Local Workflow**: [packages/octocode-mcp/docs/CLONE_AND_LOCAL_TOOLS_WORKFLOW.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/CLONE_AND_LOCAL_TOOLS_WORKFLOW.md)
- **Authentication**: [packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md)

### Octocode CLI
- **Architecture**: [packages/octocode-cli/docs/ARCHITECTURE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/ARCHITECTURE.md)
- **CLI Reference**: [packages/octocode-cli/docs/CLI_REFERENCE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/CLI_REFERENCE.md)
- **Menu Flow**: [packages/octocode-cli/docs/MENU_FLOW.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/MENU_FLOW.md)

### Octocode VS Code
- **Package README**: [packages/octocode-vscode/README.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-vscode/README.md)
- **Package Docs Index**: [packages/octocode-vscode/docs/README.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-vscode/docs/README.md)

### Octocode Shared
- **API Reference**: [packages/octocode-shared/docs/API_REFERENCE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-shared/docs/API_REFERENCE.md)
- **Credentials**: [packages/octocode-shared/docs/CREDENTIALS_ARCHITECTURE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-shared/docs/CREDENTIALS_ARCHITECTURE.md)
- **Session Persistence**: [packages/octocode-shared/docs/SESSION_PERSISTENCE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-shared/docs/SESSION_PERSISTENCE.md)

# Documentation Index

> Central index for all Octocode documentation. Start here to find any doc in the monorepo.
>
> **Primary entry point for AI agents**: [AGENTS.md](https://github.com/bgauryy/octocode-mcp/blob/main/AGENTS.md)

---

## Root Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| [DEVELOPMENT_GUIDE.md](https://github.com/bgauryy/octocode-mcp/blob/main/docs/DEVELOPMENT_GUIDE.md) | Monorepo setup, commands, code standards, testing | Contributors |
| [CONFIGURATION_REFERENCE.md](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md) | All env vars, `.octocoderc` file, config examples | Users & DevOps |
| [TROUBLESHOOTING.md](https://github.com/bgauryy/octocode-mcp/blob/main/docs/TROUBLESHOOTING.md) | Common issues — npm, Node.js, auth, MCP connection | Users |

---

## Package Documentation

### octocode-mcp (`packages/octocode-mcp/docs/`)

| Document | Purpose |
|----------|---------|
| [GITHUB_GITLAB_TOOLS_REFERENCE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITHUB_GITLAB_TOOLS_REFERENCE.md) | GitHub & GitLab tools — search code/repos/PRs, file content, packages |
| [LOCAL_TOOLS_REFERENCE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) | Local & LSP tools — code search, file system, semantic analysis |
| [AUTHENTICATION_SETUP.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md) | GitHub/GitLab authentication setup guide |
| [CLONE_AND_LOCAL_TOOLS_WORKFLOW.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/CLONE_AND_LOCAL_TOOLS_WORKFLOW.md) | Clone repos → use local + LSP tools for deep analysis |

### octocode-cli (`packages/octocode-cli/docs/`)

| Document | Purpose |
|----------|---------|
| [SKILLS_GUIDE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md) | AI skills system — creating and using skills |
| [CLI_REFERENCE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/CLI_REFERENCE.md) | Complete CLI commands reference |
| [MENU_FLOW.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/MENU_FLOW.md) | Interactive menu system |
| [ARCHITECTURE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/ARCHITECTURE.md) | Technical architecture and design patterns |

### octocode-shared (`packages/octocode-shared/docs/`)

| Document | Purpose |
|----------|---------|
| [API_REFERENCE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-shared/docs/API_REFERENCE.md) | Shared utilities API |
| [CREDENTIALS_ARCHITECTURE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-shared/docs/CREDENTIALS_ARCHITECTURE.md) | Token storage, encryption, keychain |
| [SESSION_PERSISTENCE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-shared/docs/SESSION_PERSISTENCE.md) | Deferred writes, exit handlers |

### octocode-vscode

No dedicated `docs/` folder. See [README.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-vscode/README.md) and [AGENTS.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-vscode/AGENTS.md).

---

## Skills Documentation

| Location | Purpose |
|----------|---------|
| `skills/README.md` | Skills overview and when-to-use table |
| `skills/octocode-research/docs/` | Research HTTP server: API reference, architecture, flows |
| `packages/octocode-cli/skills/` | CLI-bundled skills (shipped with the `octocode-cli` npm package) |

---

## Documentation Guidelines

- **Package-specific** content belongs in `packages/<pkg>/docs/`
- **Monorepo-wide** content belongs in `docs/` (this directory)
- **Skills** go in `skills/` (root) for repo-level skills; `packages/octocode-cli/skills/` for CLI marketplace
- **Cross-reference** instead of duplicating — always use absolute GitHub URLs: `[Doc](https://github.com/bgauryy/octocode-mcp/blob/main/path/to/doc.md)`

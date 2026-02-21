# Documentation Index

> Central index for Octocode monorepo documentation. **Primary entry**: [AGENTS.md](../AGENTS.md)

## Root Docs (`docs/`)

| Doc | Purpose |
|-----|---------|
| [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) | Monorepo setup, TDD, commands, agent guidelines |
| [CONFIGURATION_REFERENCE.md](./CONFIGURATION_REFERENCE.md) | Env vars, `.octocoderc`, config examples |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common issues, auth, MCP connection |

## Package Docs

| Package | Location | Key Docs |
|---------|----------|----------|
| **octocode-mcp** | `packages/octocode-mcp/docs/` | GITHUB_GITLAB_TOOLS_REFERENCE, LOCAL_TOOLS_REFERENCE, AUTHENTICATION_SETUP |
| **octocode-cli** | `packages/octocode-cli/docs/` | SKILLS_GUIDE, CLI_REFERENCE, MENU_FLOW, ARCHITECTURE |
| **octocode-shared** | `packages/octocode-shared/docs/` | API_REFERENCE, CREDENTIALS_ARCHITECTURE, SESSION_PERSISTENCE |
| **octocode-vscode** | No `docs/` | See README, AGENTS.md |

## Skills Docs

| Location | Purpose |
|----------|---------|
| `skills/README.md` | Skills overview, when-to-use table |
| `skills/octocode-research/docs/` | Research HTTP server: API_REFERENCE, ARCHITECTURE, FLOWS, OVERVIEW |
| `packages/octocode-cli/skills/` | CLI-bundled skills (install, pr-review, roast, etc.) |

## Avoiding Duplication

- **Package-specific** content → `packages/<pkg>/docs/`
- **Monorepo-wide** content → `docs/` (root)
- **Skills** → `skills/` (root) for repo skills; `packages/octocode-cli/skills/` for CLI marketplace
- **Cross-reference** instead of copying; use `[Doc](./path)` links

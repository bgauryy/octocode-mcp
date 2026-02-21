# Development Guide

> Development standards, workflows, and reference material for the Octocode monorepo.

## Safety & Permissions

### Approval Policy

| Action | Approval | Notes |
|--------|----------|-------|
| Edit `src/`, `tests/` | ✅ Auto | Standard development |
| Edit `docs/` | ✅ Auto | Documentation updates |
| Edit configs | ⚠️ Ask | `tsconfig`, `vitest`, `eslint`, `rollup` |
| Add dependencies | ⚠️ Ask | Requires `yarn add` |
| Edit Secrets | ❌ Never | `.env` files, keys |
| Edit Generated | ❌ Never | `dist/`, `out/`, `coverage/` |

### Protected Files

- **Never Modify**: `.env*`, `yarn.lock` (modify via yarn), `.git/`, `dist/`, `out/`, `coverage/`
- **Ask Before Modifying**: `package.json`, `tsconfig*.json`, `vitest.config.ts`, `rollup.config.js`, `.eslintrc.json`

## Commands & Workflow

**Use `yarn` for all package management.**

| Task | Command | Scope |
|------|---------|-------|
| **Install** | `yarn install` | All packages |
| **Build** | `yarn build` | All packages |
| **Test** | `yarn test` | All packages (coverage report) |
| **Test (Quiet)**| `yarn test:quiet` | Minimal output |
| **Lint** | `yarn lint` | All packages |
| **Lint Fix** | `yarn lint:fix` | All packages |
| **Syncpack** | `yarn syncpack:lint` | Check dependency versions |

### Package-Specific Commands

| Package | Key Commands |
|---------|--------------|
| `octocode-mcp` | `yarn debug` (MCP inspector), `yarn typecheck`, `yarn build:watch` |
| `octocode-cli` | `yarn start`, `yarn validate:mcp`, `yarn validate:skills` |
| `octocode-vscode` | `yarn package`, `yarn publish` |
| `octocode-shared` | `yarn typecheck` |

#### Linux & File Operations

- **String Replacement**: `sed -i '' 's/old/new/g' src/**/*.ts`
- **Move/Copy**: `mv`, `cp`, `rsync` for file operations
- **Find & Move**: `find src -name "*.test.ts" -exec mv {} tests/ \;`
- **Content Extract**: `head`, `tail`, `cat`, `grep`
- **Bulk Actions**: Prefer Linux one-liners for simple operations
- **Complex Tasks**: Write scripts (Node.js, Python, Shell)

## Development Standards

### Style Guide

- **Language**: TypeScript (strict mode)
- **Formatting**: Semicolons: Yes, Quotes: Single, Width: 80, Tab: 2
- **Code Style**: Prefer `const`. Explicit return types. No `any`. Use `?.` and `??`.

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Functions | `camelCase` | `fetchData()` |
| Classes | `PascalCase` | `TokenManager` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRIES` |
| Files | `camelCase.ts` or `kebab-case.ts` | `toolConfig.ts` |
| Tests | `<name>.test.ts` | `session.test.ts` |

### Dependencies

- **Node.js**: >= 20.0.0
- **VS Code**: `octocode-vscode` requires >= 1.85.0
- **Core**: `@modelcontextprotocol/sdk`, `zod`, `vitest`, `typescript`
- **LSP**: `typescript-language-server`, `vscode-languageserver-protocol`

## Testing Protocol

### Requirements
- **Coverage**: 90% required for `octocode-mcp` (Statements, Branches, Functions, Lines)
- **Framework**: Vitest with V8 coverage provider

### Structure
```
packages/<name>/tests/
├── <module>.test.ts       # Unit tests
├── integration/           # Integration tests
├── security/              # Security-focused tests
├── github/                # GitHub API tests
├── lsp/                   # LSP tool tests
└── helpers/               # Test utilities
```

## Research Workflows

For detailed research workflows including LSP navigation, local discovery, and external research patterns, see the canonical references:

- [Local & LSP Tools Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) — Local discovery, LSP navigation, and flow tracing
- [GitHub & GitLab Tools Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITHUB_GITLAB_TOOLS_REFERENCE.md) — External research and package discovery
- [Clone & Local Tools Workflow](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/CLONE_AND_LOCAL_TOOLS_WORKFLOW.md) — Bridging GitHub repos with local + LSP tools

## Skills System

Skills are markdown-based instruction sets that teach AI assistants specific tasks. For the complete skills guide including installation, creating custom skills, and the marketplace:

- [Skills Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md) — Comprehensive guide to the skills system
- [Skills Index](https://github.com/bgauryy/octocode-mcp/blob/main/skills/README.md) — All available skills with when-to-use guide

## Package Documentation

For the complete package documentation index, see the [Key References](https://github.com/bgauryy/octocode-mcp/blob/main/AGENTS.md#key-references) section in the root AGENTS.md.


## Agent Compatibility

| Agent | Setup |
|-------|-------|
| **Cursor** | Reads `AGENTS.md` automatically |
| **Claude Code** | Reads `AGENTS.md` as context |
| **Aider** | Add `read: AGENTS.md` in `.aider.conf.yml` |
| **Gemini CLI** | Set `"contextFileName": "AGENTS.md"` in `.gemini/settings.json` |

## See Also

- [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md) — All env vars and `.octocoderc` options
- [Troubleshooting](https://github.com/bgauryy/octocode-mcp/blob/main/docs/TROUBLESHOOTING.md) — Common issues and solutions
- [Authentication Setup](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md) — GitHub/GitLab auth

# Development Guide - Octocode Monorepo

> Detailed development standards, workflows, and reference material for the Octocode MCP monorepo.

## 🛡️ Safety & Permissions

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

## 🛠️ Commands & Workflow

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

### 🐧 Linux & File Operations

- **String Replacement**: `sed -i '' 's/old/new/g' src/**/*.ts`
- **Move/Copy**: `mv`, `cp`, `rsync` for file operations
- **Find & Move**: `find src -name "*.test.ts" -exec mv {} tests/ \;`
- **Content Extract**: `head`, `tail`, `cat`, `grep`
- **Bulk Actions**: Prefer Linux one-liners for simple operations
- **Complex Tasks**: Write scripts (Node.js, Python, Shell)

## 📏 Development Standards

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

## 🧪 Testing Protocol

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

## 🔬 Research Workflows

### Code Navigation (LSP-First)
```
lspGotoDefinition → lspFindReferences → lspCallHierarchy
```
1. Find symbol definition with `lspGotoDefinition(symbolName, lineHint)`
2. Trace usages with `lspFindReferences`
3. Understand call flow with `lspCallHierarchy(direction="incoming")`

### Local Discovery
```
localViewStructure → localSearchCode → localGetFileContent
```
1. Map directory structure with `localViewStructure(depth=2)`
2. Search patterns with `localSearchCode(pattern, filesOnly=true)`
3. Read targeted content with `localGetFileContent(matchString)`

### External Research
```
packageSearch → githubViewRepoStructure → githubSearchCode → githubGetFileContent
```
1. Find package repository with `packageSearch(name, ecosystem)`
2. Explore structure with `githubViewRepoStructure`
3. Search code patterns with `githubSearchCode`

## 📦 Skills System

Skills are markdown-based instruction sets that teach AI assistants specific tasks.

### Skills Locations

Skills are organized in two directories:

| Location | Purpose |
|----------|---------|
| `skills/` | Advanced/experimental skills (documentation, optimization, research server) |
| `packages/octocode-cli/skills/` | CLI-distributed skills (shipped with `octocode-cli` npm package) |

### Official Skills

| Skill | Description | Flow | Location |
|-------|-------------|------|----------|
| `octocode-research` | Evidence-first code forensics (external GitHub) | PREPARE → DISCOVER → ANALYZE → OUTPUT | root |
| `octocode-local-search` | Local-first code exploration and discovery | DISCOVER → PLAN → EXECUTE → VERIFY → OUTPUT | cli |
| `octocode-implement` | Research-driven feature implementation from specs | SPEC → CONTEXT → PLAN → RESEARCH → IMPLEMENT → VALIDATE | cli |
| `octocode-plan` | Adaptive research & implementation planning | UNDERSTAND → RESEARCH → PLAN → IMPLEMENT → VERIFY | cli |
| `octocode-pr-review` | Defects-first PR review across 6+ domains | CONTEXT → CHECKPOINT → ANALYSIS → FINALIZE → REPORT | cli |
| `octocode-roast` | Brutally honest code review with comedic flair | SCOPE → ROAST → INVENTORY → SPOTLIGHT → REDEMPTION | both |
| `octocode-documentation-writer` | Multi-agent documentation generation pipeline | DISCOVER → QUESTIONS → RESEARCH → ORCHESTRATE → WRITE → QA | root |
| `octocode-prompt-optimizer` | Transform weak prompts into reliable agent protocols | READ → UNDERSTAND → RATE → FIX → VALIDATE | root |

### Skill Structure

```
{skill-name}/
├── SKILL.md              # Main reference (<500 lines)
└── references/           # Supporting documentation (optional)
```

For complete details, see [`SKILLS_GUIDE.md`](../packages/octocode-cli/docs/SKILLS_GUIDE.md).

## 📚 Package Documentation

### octocode-mcp
| Document | Description |
|----------|-------------|
| [GITHUB_GITLAB_TOOLS_REFERENCE.md](../packages/octocode-mcp/docs/GITHUB_GITLAB_TOOLS_REFERENCE.md) | GitHub & GitLab API tools usage guide |
| [LOCAL_TOOLS_REFERENCE.md](../packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) | Local codebase + LSP tools reference |
| [AUTHENTICATION_SETUP.md](../packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md) | GitHub/GitLab authentication setup |

### octocode-cli
| Document | Description |
|----------|-------------|
| [CLI_REFERENCE.md](../packages/octocode-cli/docs/CLI_REFERENCE.md) | Complete CLI commands reference |
| [MENU_FLOW.md](../packages/octocode-cli/docs/MENU_FLOW.md) | Interactive menu system documentation |
| [ARCHITECTURE.md](../packages/octocode-cli/docs/ARCHITECTURE.md) | Technical architecture and design patterns |
| [SKILLS_GUIDE.md](../packages/octocode-cli/docs/SKILLS_GUIDE.md) | AI skills system guide |

### octocode-shared
| Document | Description |
|----------|-------------|
| [API_REFERENCE.md](../packages/octocode-shared/docs/API_REFERENCE.md) | Complete API documentation |
| [CREDENTIALS_ARCHITECTURE.md](../packages/octocode-shared/docs/CREDENTIALS_ARCHITECTURE.md) | Token storage, encryption, keychain |
| [SESSION_PERSISTENCE.md](../packages/octocode-shared/docs/SESSION_PERSISTENCE.md) | Deferred writes, exit handlers |

## 🤖 Agent Compatibility

- **Cursor**: Reads `AGENTS.md` automatically
- **Claude Code**: Reads `AGENTS.md` as context
- **Aider**: Add `read: AGENTS.md` in `.aider.conf.yml`
- **Gemini CLI**: Set `"contextFileName": "AGENTS.md"` in `.gemini/settings.json`

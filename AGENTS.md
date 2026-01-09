# AGENTS.md - Octocode Monorepo

> AI agent guidance for the Octocode MCP monorepo - Model Context Protocol server for GitHub research, local code exploration, and LSP-powered code intelligence.

## Core Methodology

**Follow this workflow for ALL code changes:**

1.  **Task Management 📋**:
    - **Review**: Analyze requirements and existing code first.
    - **Plan**: Create a plan using the `todo` tool for any non-trivial task.
    - **Track**: Mark tasks as in-progress/completed as you work.

2.  **Research & Discovery 🔍**:
    - **Tools**: **Prefer `octocode-local`** MCP tools for codebase exploration.
    - **LSP First**: Use `lspGotoDefinition`, `lspFindReferences`, `lspCallHierarchy` for code navigation.
    - **Local Search**: Use `localSearchCode`, `localViewStructure`, `localFindFiles` before reading files.
    - **GitHub Research**: Use `githubSearchCode`, `packageSearch` for external research.

3.  **TDD (Test Driven Development) 🧪**:
    - **Test**: Write a failing test case for the new feature or bug fix.
    - **Fail**: Run the test (`yarn test`) and confirm it fails (red).
    - **Fix**: Write the minimal code necessary to pass the test (green).
    - **Pass**: Verify the test passes and coverage is maintained (90% threshold).
    - **Refactor**: Clean up the code if needed while keeping tests passing.

4.  **ReAct Loop 🔄**:
    - **Reason**: Analyze the current state and decide the next step.
    - **Act**: Execute a tool call (edit file, run terminal command).
    - **Observe**: Check the tool output (linter errors, test results, file content).
    - **Loop**: Repeat until the objective is met.

5.  **Quality Control ✅**:
    - Adhere to "Clean Code" principles.
    - Add only critical comments.
    - Run linter (`yarn lint`) and tests (`yarn test`) after substantive changes.
    - Run dead code detection (`npx knip`) to identify unused exports or files.
    - **Never** leave the codebase in a broken state.

6.  **Operational Efficiency ⚡**:
    - **Native Tools**: **Use Linux commands** (`mv`, `cp`, `sed`) for file operations.
    - **Bulk Actions**: Prefer shell commands over manual edits or complex scripts for simple tasks.

## 📂 Repository Structure

### Monorepo Layout

```
octocode-mcp/
├── packages/
│   ├── octocode-mcp/      # MCP server: GitHub API, local tools, LSP integration
│   ├── octocode-cli/      # CLI installer & skills marketplace
│   ├── octocode-vscode/   # VS Code extension (OAuth, multi-editor support)
│   └── octocode-shared/   # Shared utilities (credentials, platform, session)
├── docs/                  # Configuration & architecture guides
└── package.json           # Workspace root (yarn workspaces)
```

### Available MCP Tools

| Category | Tools |
|----------|-------|
| **GitHub** | `githubSearchCode`, `githubGetFileContent`, `githubViewRepoStructure`, `githubSearchRepositories`, `githubSearchPullRequests` |
| **Local** | `localSearchCode`, `localGetFileContent`, `localViewStructure`, `localFindFiles` |
| **LSP** | `lspGotoDefinition`, `lspFindReferences`, `lspCallHierarchy` |
| **Package** | `packageSearch` (NPM/PyPI lookup) |

### Access & Inheritance

- **Inheritance**: Package-level `AGENTS.md` files override this root file. User prompts override all `AGENTS.md` files.
- **Access Control**:

| Path | Access | Description |
|------|--------|-------------|
| `packages/octocode-mcp/` | FULL | GitHub MCP server source |
| `packages/octocode-cli/` | FULL | CLI installer source |
| `packages/octocode-vscode/` | FULL | VS Code extension source |
| `packages/octocode-shared/` | FULL | Shared utilities source |
| `docs/` | EDIT | Documentation |
| `*.json`, `*.config.*` | ASK | Root configurations |
| `.env*`, `.octocode/` | NEVER | Secrets & research context |
| `node_modules/`, `dist/`, `out/` | NEVER | Generated artifacts |

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

- **Never Modify**: `.env*`, `yarn.lock` (modify via yarn), `.git/`, `dist/`, `out/`, `coverage/`.
- **Ask Before Modifying**: `package.json`, `tsconfig*.json`, `vitest.config.ts`, `rollup.config.js`, `.eslintrc.json`.

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

For package-specific commands, `cd packages/<name>` first:

| Package | Key Commands |
|---------|--------------|
| `octocode-mcp` | `yarn debug` (MCP inspector), `yarn typecheck`, `yarn build:watch` |
| `octocode-cli` | `yarn start`, `yarn validate:mcp`, `yarn validate:skills` |
| `octocode-vscode` | `yarn package`, `yarn publish` |
| `octocode-shared` | `yarn typecheck` |

### 🐧 Linux & File Operations

- **String Replacement**: Use `sed` for changing strings across multiple files.
  - `sed -i '' 's/old/new/g' src/**/*.ts` — replace in all TS files
- **Move/Copy Files**: Use `mv`, `cp`, `rsync` for file operations. NEVER use manual copy-paste for files.
  - `mv src/old.ts src/new.ts` — rename file
  - `cp -r src/utils/ src/helpers/` — duplicate directory
  - `find src -name "*.test.ts" -exec mv {} tests/ \;` — bulk move
- **Content Extraction**: Use `head`, `tail`, `cat`, `grep`.
  - `grep -r "TODO" src/` — find TODOs
  - `head -n 50 src/file.ts > src/extract.ts` — extract first 50 lines
  - `tail -n +10 src/file.ts | head -n 20 >> dest.ts` — extract lines 10-30
- **Simplify Flows**: Write scripts (Node.js, Python, Shell) for complex sequences.
- **Repetitive Tasks**: Use scripts (prefer Node.js or Python) for repetitive operations!
- **Bulk Actions**: Prefer Linux one-liners for simple one-off bulk operations.

## 📏 Development Standards

### Style Guide

- **Language**: TypeScript (strict mode)
- **Formatting**: Semicolons: Yes, Quotes: Single, Width: 80, Tab: 2.
- **Code Style**:
  - Prefer `const`. Explicit return types. No `any`.
  - Use optional chaining (`?.`) and nullish coalescing (`??`).

### Naming Conventions

- **Functions**: `camelCase`
- **Classes**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Files**: `camelCase.ts` or `kebab-case.ts`
- **Test Files**: `<name>.test.ts`

### Dependencies

- **Node.js**: >= 20.0.0 (check each package's `engines` field)
- **VS Code**: `octocode-vscode` requires >= 1.85.0
- **Core**: `@modelcontextprotocol/sdk`, `zod`, `vitest`, `typescript`
- **LSP**: `typescript-language-server`, `vscode-languageserver-protocol`

## 🧪 Testing Protocol

### Requirements
- **Coverage**: 90% required for `octocode-mcp` (Statements, Branches, Functions, Lines).
- **Framework**: Vitest with V8 coverage provider.

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

### Running Tests

```bash
yarn test              # Run all tests with coverage
yarn test:quiet        # Minimal output
yarn test:watch        # Watch mode (per package)
yarn test:ui           # Vitest UI (per package)
```

## 📦 Package-Level AGENTS.md

Each package has its own `AGENTS.md` with specific guidelines:

| Package | Location | Purpose |
|---------|----------|---------|
| `octocode-mcp` | [`packages/octocode-mcp/AGENTS.md`](./packages/octocode-mcp/AGENTS.md) | MCP server: GitHub, local, LSP tools, security |
| `octocode-cli` | [`packages/octocode-cli/AGENTS.md`](./packages/octocode-cli/AGENTS.md) | CLI installer, skills marketplace, MCP registry |
| `octocode-vscode` | [`packages/octocode-vscode/AGENTS.md`](./packages/octocode-vscode/AGENTS.md) | VS Code extension, OAuth, multi-editor support |
| `octocode-shared` | [`packages/octocode-shared/AGENTS.md`](./packages/octocode-shared/AGENTS.md) | Shared credentials, platform detection, session storage |

Package-level files **override** this root file for work within that package.

### Skills Marketplace (`octocode-cli`)

Available skills for AI assistants:

| Skill | Description |
|-------|-------------|
| `octocode-research` | GitHub repository research workflows |
| `octocode-implement` | Implementation guidance with references |
| `octocode-pr-review` | Pull request review automation |
| `octocode-local-search` | Local codebase exploration |
| `octocode-generate` | Code generation patterns |
| `octocode-roast` | Code review with personality |

## 🔬 Research Workflows

Use these patterns when exploring the codebase:

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

## 🤖 Agent Compatibility

- **Cursor**: Reads `AGENTS.md` automatically.
- **Claude Code**: Reads `AGENTS.md` as context.
- **Aider**: Add `read: AGENTS.md` in `.aider.conf.yml`.
- **Gemini CLI**: Set `"contextFileName": "AGENTS.md"` in `.gemini/settings.json`.

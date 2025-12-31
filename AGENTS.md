# AGENTS.md - Octocode Monorepo

> AI agent guidance for the Octocode MCP monorepo - Model Context Protocol server for GitHub research and VS Code extension.

## Core Methodology

**Follow this workflow for ALL code changes:**

1.  **Task Management**:
    - **Review**: Analyze requirements and existing code first.
    - **Plan**: Create a plan using the `todo` tool for any non-trivial task.
    - **Track**: Mark tasks as in-progress/completed as you work.

2.  **Research & Discovery**:
    - **Tools**: **Prefer `octocode-local`** and research tools for codebase exploration.
    - **Search**: Use semantic search and `grep` before reading files.

3.  **TDD (Test Driven Development)**:
    - **Test**: Write a failing test case for the new feature or bug fix.
    - **Fail**: Run the test (`yarn test`) and confirm it fails (red).
    - **Fix**: Write the minimal code necessary to pass the test (green).
    - **Pass**: Verify the test passes and coverage is maintained.
    - **Refactor**: Clean up the code if needed while keeping tests passing.

4.  **ReAct Loop**:
    - **Reason**: Analyze the current state and decide the next step.
    - **Act**: Execute a tool call (edit file, run terminal command).
    - **Observe**: Check the tool output (linter errors, test results, file content).
    - **Loop**: Repeat until the objective is met.

5.  **Quality Control**:
    - Adhere to "Clean Code" principles.
    - Add only critical comments.
    - Run linter (`yarn lint`) and tests (`yarn test`) after substantive changes.
    - **Never** leave the codebase in a broken state.

## 📂 Repository Structure

### Monorepo Layout

```
octocode-mcp/
├── packages/
│   ├── octocode-mcp/      # GitHub API MCP server (Node.js)
│   ├── octocode-vscode/   # VS Code extension
│   └── octocode-cli/      # CLI installer
├── docs/                  # Configuration & auth guides
└── package.json           # Workspace root
```

### Access & Inheritance

- **Inheritance**: Package-level `AGENTS.md` files override this root file. User prompts override all `AGENTS.md` files.
- **Access Control**:

| Path | Access | Description |
|------|--------|-------------|
| `packages/octocode-mcp/` | FULL | GitHub MCP server source |
| `packages/octocode-vscode/` | FULL | VS Code extension source |
| `packages/octocode-cli/` | FULL | CLI installer source |
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

**Note**: Check `package.json` scripts for each package for specific commands.
For package-specific commands, `cd packages/<name>` first.

### File Actions

- **String Replacement**: **MUST use `sed`** for changing strings across multiple files.
- **Simplify Flows**: Write and run scripts (e.g., Node.js, Shell) to automate complex sequences instead of looping through tool calls.
- **Repetitive Tasks**: Prefer CLI commands over manual edits for bulk/repetitive operations.

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

- **Node.js**: >= 18.0.0 (check each package's `engines` field)
- **VS Code**: `octocode-vscode` requires >= 1.85.0
- **Shared**: `@modelcontextprotocol/sdk`, `zod`, `vitest`

## 🧪 Testing Protocol

### Requirements
- **Coverage**: 90% required across all metrics (Statements, Branches, Functions, Lines).

### Structure
```
packages/<name>/tests/
├── <module>.test.ts       # Unit tests
├── integration/           # Integration tests
└── security/              # Security-focused tests
```

## 📦 Package-Level AGENTS.md

Each package may have its own `AGENTS.md` with specific guidelines:

| Package | Location | Purpose |
|---------|----------|---------|
| `octocode-mcp` | [`packages/octocode-mcp/AGENTS.md`](./packages/octocode-mcp/AGENTS.md) | MCP server tools, security, bulk operations |
| `octocode-vscode` | `packages/octocode-vscode/` | VS Code extension |
| `octocode-cli` | `packages/octocode-cli/` | CLI installer |

Package-level files **override** this root file for work within that package.

## 🤖 Agent Compatibility

- **Cursor**: Reads `AGENTS.md` automatically.
- **Claude Code**: Reads `AGENTS.md` as context.
- **Aider**: Add `read: AGENTS.md` in `.aider.conf.yml`.
- **Gemini CLI**: Set `"contextFileName": "AGENTS.md"` in `.gemini/settings.json`.

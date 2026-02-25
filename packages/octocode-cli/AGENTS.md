# AGENTS.md - Octocode CLI

> **Location**: `packages/octocode-cli/AGENTS.md`

AI agent guidance for the `octocode-cli` package - Interactive CLI installer and management hub for Octocode MCP servers and AI skills.

This file **overrides** the root [`AGENTS.md`](https://github.com/bgauryy/octocode-mcp/blob/main/AGENTS.md) for work within this package.

---

## Overview

Octocode CLI is the unified installer and management hub for AI-assisted development:

- **MCP Installation**: One-step setup for `octocode-mcp` across multiple IDEs
- **GitHub Authentication**: Secure OAuth flow with encrypted token storage
- **Configuration Sync**: Keep MCP configurations consistent across editors
- **Skills Manager**: Install and update AI coding skills for Claude Code
- **MCP Marketplace**: Browse and install 70+ community MCP servers

**Key Docs**: [`README.md`](./README.md) • [`docs/`](./docs/)

### Documentation

| Document | Description |
|----------|-------------|
| [`CLI_REFERENCE.md`](./docs/CLI_REFERENCE.md) | Complete CLI commands reference with options and examples |
| [`MENU_FLOW.md`](./docs/MENU_FLOW.md) | Interactive menu system documentation with flow diagrams |
| [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Technical architecture and design patterns |
| [`SKILLS_GUIDE.md`](./docs/SKILLS_GUIDE.md) | Comprehensive guide to Octocode Skills system |
| [Contributing Guide](https://github.com/bgauryy/octocode-mcp/blob/main/CONTRIBUTING.md) | PR process, testing expectations, submit checklist |

---

## 🛠️ Commands

All commands run from this package directory (`packages/octocode-cli/`).
For monorepo-wide setup and workflow commands, see [docs/DEVELOPMENT_GUIDE.md](https://github.com/bgauryy/octocode-mcp/blob/main/docs/DEVELOPMENT_GUIDE.md).

| Task | Command | Description |
|------|---------|-------------|
| **Build** | `yarn build` | Lint + bundle with Vite |
| **Build (Dev)** | `yarn build:dev` | Build without lint |
| **Clean** | `yarn clean` | Remove `out/` directory |
| **Test** | `yarn test` | Run tests with coverage report |
| **Test (Quiet)** | `yarn test:quiet` | Minimal test output |
| **Test (Watch)** | `yarn test:watch` | Watch mode for tests |
| **Lint** | `yarn lint` | ESLint check |
| **Lint (Fix)** | `yarn lint:fix` | Auto-fix linting issues |
| **Typecheck** | `yarn typecheck` | TypeScript type checking |
| **Start** | `yarn start` | Run the CLI locally |

### Validation Scripts

| Task | Command | Description |
|------|---------|-------------|
| **Validate MCP Registry** | `yarn validate:mcp` | Validate MCP server registry |
| **Validate Skills** | `yarn validate:skills` | Validate skills marketplace |

---

## 📂 Package Structure

```
src/
├── index.ts                 # Entry point - CLI initialization
│
├── cli/                     # 🖥️ Command-line interface
│   ├── index.ts             # CLI runner & exports
│   ├── commands.ts          # Command definitions & handlers
│   ├── parser.ts            # Argument parsing
│   ├── help.ts              # Help text generation
│   └── types.ts             # CLI type definitions
│
├── configs/                 # ⚙️ Configuration registries
│   ├── mcp-registry.ts      # MCP server registry (70+ servers)
│   └── skills-marketplace.ts # AI skills marketplace config
│
├── features/                # 🔧 Core feature implementations
│   ├── gh-auth.ts           # GitHub authentication wrapper
│   ├── github-oauth.ts      # OAuth device flow implementation
│   ├── install.ts           # MCP installation logic
│   ├── node-check.ts        # Node.js environment detection
│   └── sync.ts              # Configuration sync across IDEs
│
├── types/                   # 📝 Type definitions
│   └── index.ts             # Shared types (IDE configs, MCP types)
│
├── ui/                      # 🎨 Interactive UI modules
│   ├── menu.ts              # Main interactive menu
│   ├── header.ts            # Welcome banner & branding
│   ├── constants.ts         # UI constants & styling
│   ├── gh-guidance.ts       # GitHub auth guidance
│   ├── state.ts             # UI state management
│   │
│   ├── config/              # Configuration inspection
│   │   ├── index.ts         # Config flow orchestration
│   │   └── inspect-flow.ts  # Config inspection UI
│   │
│   ├── external-mcp/        # MCP marketplace
│   │   ├── index.ts         # Exports
│   │   ├── flow.ts          # Marketplace flow logic
│   │   ├── display.ts       # Server display formatting
│   │   └── prompts.ts       # Selection prompts
│   │
│   ├── install/             # Installation wizard
│   │   ├── index.ts         # Exports
│   │   ├── flow.ts          # Installation flow logic
│   │   ├── display.ts       # Progress & status display
│   │   ├── environment.ts   # Environment checks
│   │   └── prompts.ts       # IDE selection prompts
│   │
│   ├── skills-menu/         # Skills management
│   │   ├── index.ts         # Skills installation UI
│   │   └── marketplace.ts   # Skills marketplace display
│   │
│   └── sync/                # Sync UI
│       ├── index.ts         # Exports
│       ├── flow.ts          # Sync flow logic
│       └── display.ts       # Sync status display
│
└── utils/                   # 🛠️ Shared utilities
    ├── assert.ts            # Assertion helpers
    ├── colors.ts            # Terminal color formatting
    ├── context.ts           # Runtime context detection
    ├── fs.ts                # File system utilities
    ├── mcp-config.ts        # MCP configuration parsing
    ├── mcp-io.ts            # MCP config file I/O
    ├── mcp-paths.ts         # IDE-specific config paths
    ├── platform.ts          # Cross-platform utilities
    ├── prompts.ts           # Inquirer prompt loading
    ├── research-output.ts   # Research output handling
    ├── shell.ts             # Shell command execution
    ├── skills.ts            # Skills file management
    ├── skills-fetch.ts      # Skills download & install
    ├── spinner.ts           # Loading spinner component
    └── token-storage.ts     # Encrypted token management (AES-256-GCM)
```

### Skills Directory

```
skills/
├── README.md                # Skills documentation
├── octocode-implement/      # Implementation skill from specs
│   ├── SKILL.md
│   └── references/
│       ├── execution-phases.md
│       ├── tool-reference.md
│       └── workflow-patterns.md
├── octocode-local-search/   # Local code exploration skill
│   ├── SKILL.md
│   └── references/
│       ├── tool-reference.md
│       └── workflow-patterns.md
├── octocode-plan/           # Adaptive research & implementation planning
│   └── SKILL.md
├── octocode-pr-review/      # PR review skill
│   ├── SKILL.md
│   └── references/
│       ├── domain-reviewers.md
│       ├── execution-lifecycle.md
│       └── research-flows.md
├── octocode-research/       # Research skill for code exploration
│   ├── SKILL.md
│   └── references/
│       ├── tool-reference.md
│       └── workflow-patterns.md
└── octocode-roast/          # Code roasting skill for fun feedback
    ├── SKILL.md
    └── references/
        └── sin-registry.md
```

### Tests Structure

```
tests/
├── setup.ts                 # Test setup & configuration
├── colors.test.ts           # Color utility tests
├── cli/                     # CLI module tests
│   ├── commands.test.ts     # Command handler tests
│   └── parser.test.ts       # Argument parser tests
├── configs/                 # Configuration tests
│   └── skills-marketplace.test.ts
├── features/                # Feature tests
│   ├── gh-auth.test.ts      # GitHub auth tests
│   ├── github-oauth.test.ts # OAuth flow tests
│   ├── install.test.ts      # Installation tests
│   ├── node-check.test.ts   # Node detection tests
│   └── sync.test.ts         # Sync feature tests
├── ui/                      # UI component tests
│   └── external-mcp-flow.test.ts
└── utils/                   # Utility tests
    ├── assert.test.ts
    ├── context.test.ts
    ├── fs.test.ts
    ├── mcp-config.test.ts
    ├── mcp-config-coverage.test.ts
    ├── mcp-config-extended.test.ts
    ├── mcp-io.test.ts
    ├── mcp-paths.test.ts
    ├── platform.test.ts
    ├── prompts.test.ts
    ├── research-output.test.ts
    ├── shell.test.ts
    ├── skills.test.ts
    ├── skills-fetch.test.ts
    ├── spinner.test.ts
    └── token-storage.test.ts
```

---

## 🖥️ CLI Commands

| Command | Description | Options |
|---------|-------------|---------|
| `install` | Install octocode-mcp for an IDE | `--ide`, `--method` |
| `login` | Authenticate with GitHub | `--hostname` (enterprise) |
| `status` | Check authentication status | - |
| `sync` | Sync MCP configs across IDEs | `--dry-run` |
| `skills list` | List available AI skills | - |
| `skills install` | Install AI skills | - |

---

## 🎨 Supported IDEs

| IDE | Config Location (macOS) | Key |
|-----|-------------------------|-----|
| Cursor | `~/.cursor/mcp.json` | `cursor` |
| Claude Desktop | `~/Library/Application Support/Claude/` | `claude-desktop` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `windsurf` |
| Zed | `~/.config/zed/settings.json` | `zed` |
| Claude Code | `~/.claude.json` | `claude-code` |
| VS Code (Cline) | Extension settings | `cline` |
| VS Code (Roo-Cline) | Extension settings | `roo-cline` |
| VS Code (Continue) | Extension settings | `vscode-continue` |
| Trae | TBD | `trae` |
| Antigravity | TBD | `antigravity` |

---

## 📦 Package Guidelines

These are the core principles for this CLI package:

1. **User Experience First**: Interactive wizards guide users through complex setups.
2. **Cross-Platform**: Support macOS, Linux, and Windows with platform-specific paths.
3. **Secure Storage**: Token encryption (AES-256-GCM) with keytar for credential management.
4. **Graceful Degradation**: Handle missing dependencies and network errors gracefully.
5. **Minimal Dependencies**: Keep the bundle size small for `npx` usage.

---

## 🏗️ Architecture Patterns

### Entry Point Flow

```
main() → initializeSecureStorage() → runCLI() → [command handler] OR runInteractiveMode()
```

1. **Secure Storage Init** (`token-storage.ts`) - Initialize encrypted storage
2. **CLI Check** (`cli/index.ts`) - Parse args, execute command if provided
3. **Interactive Mode** (`ui/menu.ts`) - Launch interactive menu if no command

### Key Design Decisions

- **Inquirer Prompts**: Dynamic loading for faster startup
- **Token Security**: AES-256-GCM encryption with platform file storage integration
- **MCP Registry**: Centralized registry of 70+ validated MCP servers
- **Skills System**: Markdown-based skill definitions for Claude Code

---

## 🛡️ Safety & Permissions

### Package-Level Access

| Path | Access | Description |
|------|--------|-------------|
| `src/` | ✅ FULL | Source code |
| `tests/` | ✅ FULL | Test files |
| `skills/` | ✅ EDIT | Skill definitions |
| `scripts/` | ⚠️ ASK | Validation scripts |
| `*.json`, `*.config.*` | ⚠️ ASK | Package configs |
| `out/`, `node_modules/` | ❌ NEVER | Generated files |

### Protected Files

- **Never Modify**: `out/`, `node_modules/`
- **Ask Before Modifying**: `package.json`, `tsconfig.json`, `vitest.config.ts`, `vite.config.ts`

### Security Considerations

- **Token Storage**: Tokens are encrypted and stored in `~/.octocode/` with platform file storage backup
- **OAuth Flow**: Uses GitHub's device authorization flow for secure authentication
- **No Credential Logging**: Never log tokens or sensitive data

---

## 🧪 Testing Protocol

### Requirements

- **Coverage**: No enforced thresholds — tests are still required for all changes
- **Framework**: Vitest with v8 coverage
- **Source of truth**: [CONTRIBUTING.md — Testing Requirements](https://github.com/bgauryy/octocode-mcp/blob/main/CONTRIBUTING.md#testing-requirements)

### Test Categories

| Category | Path | Purpose |
|----------|------|---------|
| Unit | `tests/<module>.test.ts` | Individual function tests |
| CLI | `tests/cli/` | Command parsing & execution |
| Features | `tests/features/` | Feature implementation tests |
| UI | `tests/ui/` | Interactive flow tests |
| Utils | `tests/utils/` | Utility function tests |
| Configs | `tests/configs/` | Configuration validation |

### Testing Notes

- **Mock External Services**: Mock GitHub API, file system, and file storage operations
- **Platform Tests**: Test cross-platform path resolution
- **Interactive Tests**: Use mock prompts for interactive UI testing

---

## 🤖 Development Tips

### Adding a New CLI Command

1. Add command definition in `src/cli/commands.ts`
2. Implement handler function
3. Add help text in `src/cli/help.ts`
4. Write tests in `tests/cli/commands.test.ts`

### Adding a New MCP Server to Registry

1. Edit `src/configs/mcp-registry.ts`
2. Add server entry with name, description, command, and args
3. Run `yarn validate:mcp` to verify

### Adding a New IDE Support

1. Add IDE config in `src/types/index.ts`
2. Add path resolution in `src/utils/mcp-paths.ts`
3. Add installation logic in `src/ui/install/`
4. Write tests for the new IDE

### Adding a New Skill

1. Create directory in `skills/<skill-name>/`
2. Add `SKILL.md` with skill definition
3. Update `src/configs/skills-marketplace.ts`
4. Run `yarn validate:skills` to verify

---

## 🎯 Skills System

Skills are markdown-based instruction sets that teach AI assistants how to perform specific tasks. They transform generic AI assistants into specialized experts.

### Official Skills

For the complete skills list and documentation, see the [Skills Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md).

### Skill Structure

```
{skill-name}/
├── SKILL.md              # Main reference (<500 lines)
└── references/           # Supporting documentation (optional)
    ├── tool-reference.md
    └── workflow-patterns.md
```

### SKILL.md Format

Skills use YAML frontmatter for metadata:

```yaml
---
name: skill-name
description: Use when [specific triggers]...
---

# Skill Title

## Flow Overview
`PHASE1` → `PHASE2` → `PHASE3`

## 1. Agent Identity
<agent_identity>
Role: **Agent Type**. Expert description.
**Objective**: What the agent does.
**Principles**: Core behaviors.
</agent_identity>

## 2. Scope & Tooling
<tools>
| Tool | Purpose |
|------|---------|
| `toolName` | When to use |
</tools>
```

### Skills Marketplace

The CLI includes a skills marketplace with 8+ community sources:

| Marketplace | Description |
|-------------|-------------|
| 🐙 Octocode Official | Research, planning, review & roast skills |
| Build With Claude | Largest collection - 170+ commands |
| Claude Code Plugins + Skills | Organized categories with tutorials |
| Superpowers | TDD, debugging, git worktrees |
| Claude Scientific Skills | Scientific computing skills |

### Installation Paths

| Platform | Default Path |
|----------|--------------|
| macOS/Linux | `~/.claude/skills/` |
| Windows | `%LOCALAPPDATA%\Claude\skills\` |

### Key Source Files

| File | Purpose |
|------|---------|
| `src/configs/skills-marketplace.ts` | Marketplace source definitions |
| `src/utils/skills.ts` | Skill file management utilities |
| `src/utils/skills-fetch.ts` | Skill download & installation |
| `src/ui/skills-menu/index.ts` | Skills management UI |
| `src/ui/skills-menu/marketplace.ts` | Marketplace browsing UI |

For complete details, see `docs/SKILLS_GUIDE.md`.

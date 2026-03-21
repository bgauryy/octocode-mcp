# AGENTS.md - Octocode CLI

> **Location**: `packages/octocode-cli/AGENTS.md`

AI agent guidance for the `octocode-cli` package — CLI installer and management hub for Octocode MCP servers and AI skills.

This file **overrides** the root [`AGENTS.md`](https://github.com/bgauryy/octocode-mcp/blob/main/AGENTS.md) for work within this package.

---

## Overview

- **MCP installation** — one-step setup for `octocode-mcp` across multiple IDEs.
- **GitHub authentication** — OAuth device flow with AES-256-GCM encrypted token storage.
- **Configuration sync** — keep MCP configs consistent across editors.
- **Skills manager** — install and update 9 bundled `octocode-*` skills across AI clients (Claude Code, Claude Desktop, Cursor, Codex, Opencode).
- **MCP marketplace** — browse and install 70+ community MCP servers.
- **Cache management** — inspect and clean cloned repos, marketplace cache, and logs.

**Key docs**: [`README.md`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/README.md) | [`docs/`](https://github.com/bgauryy/octocode-mcp/tree/main/packages/octocode-cli/docs/)

### Documentation

| Document | Description |
|----------|-------------|
| [`CLI_REFERENCE.md`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/CLI_REFERENCE.md) | Complete CLI commands reference |
| [`SKILLS_GUIDE.md`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md) | Skills system guide |

---

## Commands

All commands run from `packages/octocode-cli/`.
For monorepo-wide setup, see [docs/DEVELOPMENT_GUIDE.md](https://github.com/bgauryy/octocode-mcp/blob/main/docs/DEVELOPMENT_GUIDE.md).

| Task | Command |
|------|---------|
| Build | `yarn build` (lint + bundle) |
| Build (dev) | `yarn build:dev` (no lint) |
| Clean | `yarn clean` |
| Test | `yarn test` (with coverage) |
| Test (quiet) | `yarn test:quiet` |
| Test (watch) | `yarn test:watch` |
| Lint | `yarn lint` |
| Lint (fix) | `yarn lint:fix` |
| Typecheck | `yarn typecheck` |
| Start | `yarn start` |
| Validate MCP registry | `yarn validate:mcp` |
| Validate skills | `yarn validate:skills` |

---

## Package Structure

```
src/
├── index.ts                 # Entry point
├── cli/                     # Command-line interface
│   ├── index.ts             # CLI runner
│   ├── commands.ts          # Command definitions & handlers
│   ├── parser.ts            # Argument parsing
│   ├── help.ts              # Help text
│   └── types.ts             # CLI types
├── configs/                 # Registries
│   ├── mcp-registry.ts      # MCP server registry (70+ servers)
│   └── skills-marketplace.ts # Skills marketplace sources
├── features/                # Core features
│   ├── gh-auth.ts           # GitHub auth wrapper
│   ├── github-oauth.ts      # OAuth device flow
│   ├── install.ts           # MCP installation
│   ├── node-check.ts        # Node.js detection
│   └── sync.ts              # Config sync
├── types/
│   └── index.ts             # Shared types
├── ui/                      # Interactive UI
│   ├── menu.ts              # Main menu
│   ├── header.ts            # Welcome banner
│   ├── constants.ts         # UI constants
│   ├── state.ts             # UI state
│   ├── config/              # Config inspection
│   ├── external-mcp/        # MCP marketplace UI
│   ├── install/             # Installation wizard
│   ├── skills-menu/         # Skills management UI
│   └── sync/                # Sync UI
└── utils/                   # Shared utilities
    ├── assert.ts            # Assertions
    ├── colors.ts            # Terminal colors
    ├── context.ts           # Runtime context
    ├── fs.ts                # File system
    ├── mcp-config.ts        # MCP config parsing
    ├── mcp-io.ts            # MCP config I/O
    ├── mcp-paths.ts         # IDE-specific config paths
    ├── parsers/frontmatter.ts # YAML frontmatter parser
    ├── platform.ts          # Cross-platform utilities
    ├── prompts.ts           # Inquirer loading
    ├── research-output.ts   # Research output handling
    ├── shell.ts             # Shell execution
    ├── skills.ts            # Skills file management
    ├── skills-fetch.ts      # Skills download & install
    ├── spinner.ts           # Spinner component
    └── token-storage.ts     # Token encryption (AES-256-GCM)
```

### Skills directory (monorepo)

Bundled skills live at the **repository root**: [`skills/`](https://github.com/bgauryy/octocode-mcp/tree/main/skills) (not under `packages/octocode-cli/`). At npm publish, `prepack` copies that folder into `packages/octocode-cli/skills` so `getSkillsSourceDir()` resolves `out/../skills` in the package.

Each skill is a folder with `SKILL.md` (and optional `references/`). Names follow `octocode-*`. Run `yarn validate:skills` after registry or layout changes.

### Tests

```
tests/
├── setup.ts
├── colors.test.ts
├── cli/
│   ├── commands.test.ts
│   └── parser.test.ts
├── configs/
│   └── skills-marketplace.test.ts
├── features/
│   ├── gh-auth.test.ts
│   ├── github-oauth.test.ts
│   ├── install.test.ts
│   ├── node-check.test.ts
│   └── sync.test.ts
├── ui/
│   └── external-mcp-flow.test.ts
└── utils/
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

## CLI Commands

| Command | Description | Key options |
|---------|-------------|-------------|
| `install` | Install octocode-mcp for an IDE | `--ide`, `--method`, `--force` |
| `login` / `logout` | GitHub OAuth | `--hostname` |
| `auth` | Auth menu or `auth login` / `logout` / `status` / `token` | `--hostname` |
| `token` | Print token (`--json` for tools) | `--type`, `--hostname`, `--source` |
| `status` | GitHub auth status | `--hostname` |
| `sync` | Sync MCP configs across IDEs | `--force`, `--dry-run`, `--status` |
| `cache` | Cache size / clean | `status` / `clean`, `--repos`, `--skills`, `--logs`, `--all` |
| `skills list` | List bundled skills + install state | - |
| `skills install` | Install bundled skills to one or more client dirs | `--skill`, `--targets`, `--mode`, `--force` |
| `skills remove` | Remove one installed skill from one or more targets | `--skill`, `--targets` |
| `mcp` | Non-interactive MCP marketplace management | `list`, `status`, `install --id`, `remove --id`, `--client`, `--config` |

---

## Supported IDEs

| IDE | Config location (macOS) | Key |
|-----|-------------------------|-----|
| Cursor | `~/.cursor/mcp.json` | `cursor` |
| Claude Desktop | `~/Library/Application Support/Claude/` | `claude-desktop` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `windsurf` |
| Zed | `~/.config/zed/settings.json` | `zed` |
| Claude Code | `~/.claude.json` | `claude-code` |
| VS Code (Cline) | Extension settings | `cline` |
| VS Code (Roo-Cline) | Extension settings | `roo-cline` |
| VS Code (Continue) | Extension settings | `vscode-continue` |
| Opencode | `~/.config/opencode/config.json` | `opencode` |
| Trae | `~/Library/Application Support/Trae/mcp.json` | `trae` |
| Antigravity | `~/.gemini/antigravity/mcp_config.json` | `antigravity` |

---

## Package Guidelines

1. Interactive wizards guide users through complex setups.
2. Support macOS, Linux, and Windows with platform-specific paths.
3. AES-256-GCM token encryption with platform file storage.
4. Graceful degradation for missing dependencies and network errors.
5. Minimal dependencies for fast `npx` startup.

---

## Architecture

```
main() → runCLI() → [command handler] OR runInteractiveMode()
```

1. **CLI check** (`cli/index.ts`) — parse args, execute command if provided.
2. **Interactive mode** (`ui/menu.ts`) — launch interactive menu if no command.

Key decisions:
- Inquirer prompts loaded dynamically for faster startup.
- AES-256-GCM encryption with platform file storage.
- Centralized MCP registry of 70+ validated servers.
- Markdown-based skill definitions installable across supported AI clients.

---

## Safety & Permissions

| Path | Access |
|------|--------|
| `src/`, `tests/` | Full |
| `scripts/` | Ask first |
| `*.json`, `*.config.*` | Ask first |
| `out/`, `node_modules/` | Never |

Protected: never modify `out/`, `node_modules/`. Ask before modifying `package.json`, `tsconfig.json`, `vitest.config.ts`, `vite.config.ts`.

Security: tokens encrypted in `~/.octocode/`, OAuth device flow, never log tokens.

---

## Testing

- **Coverage**: 90% required (statements, branches, functions, lines).
- **Framework**: Vitest with v8 coverage.
- Mock external services (GitHub API, fs, keytar).
- Test cross-platform path resolution.
- Use mock prompts for interactive UI tests.

---

## Development Tips

**New CLI command:** define in `commands.ts`, add help in `help.ts`, test in `commands.test.ts`.

**New MCP server:** add entry in `mcp-registry.ts`, run `yarn validate:mcp`.

**New IDE:** add config in `types/index.ts`, paths in `mcp-paths.ts`, install logic in `ui/install/`, add tests.

**New skill:** create `skills/<name>/SKILL.md`, update `skills-marketplace.ts`, run `yarn validate:skills`.

---

## Skills System

Skills are markdown instruction sets that teach AI assistants specific tasks. See the [Skills Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md) for the full list and documentation.

### Key source files

| File | Purpose |
|------|---------|
| `src/configs/skills-marketplace.ts` | Marketplace source definitions |
| `src/utils/skills.ts` | Skill file management |
| `src/utils/skills-fetch.ts` | Skill download & installation |
| `src/ui/skills-menu/index.ts` | Skills management UI |
| `src/ui/skills-menu/marketplace.ts` | Marketplace browsing UI |

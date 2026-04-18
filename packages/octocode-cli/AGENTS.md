# AGENTS.md - Octocode CLI

> `packages/octocode-cli/` — overrides root [`AGENTS.md`](https://github.com/bgauryy/octocode-mcp/blob/main/AGENTS.md).

CLI binary that **manages** Octocode (install, auth, skills, MCP marketplace, sync, cache) and **runs tools** (any Octocode tool from terminal).

**Docs**: [`CLI_REFERENCE.md`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/CLI_REFERENCE.md) | [`SKILLS_GUIDE.md`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md) | [`README.md`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/README.md)

---

## Using the CLI

### Discovery flow (recommended)

```
octocode-cli --help                          # see all commands + all 14 tools
octocode-cli --tool <name> --help            # input/output schema for one tool
octocode-cli --tools-context                 # full MCP instructions + all schemas (~2200 lines)
```

### Running tools

```
octocode-cli --tool <name> --queries '<json>'     # run tool, pretty output
octocode-cli --tool <name> --queries '<json>' --json  # raw JSON output
```

`--queries` accepts a JSON object, array of objects, or `{ "queries": [...] }`. Fields `id`, `researchGoal`, `reasoning`, `mainResearchGoal` are auto-filled — only provide tool-specific fields.

```bash
octocode-cli --tool localSearchCode --queries '{"path":".","pattern":"runCLI"}'
octocode-cli --tool githubSearchCode --queries '{"keywordsToSearch":["useReducer"],"owner":"facebook","repo":"react"}'
```

### Tools (14 total)

| Category | Tools |
|----------|-------|
| GitHub | `githubSearchCode`, `githubGetFileContent`, `githubViewRepoStructure`, `githubSearchRepositories`, `githubSearchPullRequests` |
| Local | `localSearchCode`, `localGetFileContent`, `localFindFiles`, `localViewStructure` |
| LSP | `lspGotoDefinition`, `lspFindReferences`, `lspCallHierarchy` |
| Package | `packageSearch` |

Output shape: `{ "content": [{ "type": "text", "text": "..." }], "structuredContent": {}, "isError": false }`

### Management commands

| Command | Aliases | Usage |
|---------|---------|-------|
| `install` | `i`, `setup` | `install --ide <client> [--method <npx\|direct>] [--force]` |
| `auth` | `a`, `gh` | `auth [login\|logout\|status\|token]` |
| `login` | `l` | `login [--hostname <host>] [--git-protocol <ssh\|https>]` |
| `logout` | - | `logout [--hostname <host>]` |
| `status` | `s` | `status [--hostname <host>]` |
| `token` | `t` | `token [--type <auto\|octocode-cli\|gh>] [--hostname <host>] [--source] [--json]` |
| `sync` | `sy` | `sync [--force] [--dry-run] [--status]` |
| `skills` | `sk` | `skills [install\|remove\|list] [--skill <name>] [--targets <list>] [--mode <copy\|symlink>] [--force]` |
| `mcp` | - | `mcp [list\|install\|remove\|status] [--id <id>] [--client <client>\|--config <path>] [--search <text>] [--category <name>] [--env K=V] [--installed] [--force]` |
| `cache` | - | `cache [status\|clean] [--repos] [--skills] [--logs] [--tools\|--local\|--lsp\|--api] [--all]` |

Supported clients: `cursor`, `claude-desktop`, `claude-code`, `windsurf`, `zed`, `vscode-cline`, `vscode-roo`, `vscode-continue`, `opencode`, `trae`, `antigravity`, `codex`, `gemini-cli`, `goose`, `kiro`.

---

## Dev Commands

Run from `packages/octocode-cli/`.

| Task | Command |
|------|---------|
| Build | `yarn build` (lint + bundle) |
| Build (dev) | `yarn build:dev` (no lint) |
| Test | `yarn test` (with coverage) |
| Lint | `yarn lint` / `yarn lint:fix` |
| Typecheck | `yarn typecheck` |
| Start | `yarn start` |
| Validate registries | `yarn validate:mcp` / `yarn validate:skills` |

---

## Source Layout

```
src/
├── index.ts                    # Entry point
├── interactive.ts              # Interactive mode entry
├── cli/
│   ├── index.ts                # CLI runner (runCLI)
│   ├── parser.ts               # Argument parsing
│   ├── commands.ts             # Command definitions & handlers
│   ├── tool-command.ts         # --tool execution
│   ├── types.ts                # CLI types
│   ├── help.ts                 # Help renderer
│   ├── main-help.ts            # Main --help output
│   └── command-help-specs.ts   # Per-command help specs
├── configs/
│   ├── mcp-registry.ts         # 70+ MCP server registry
│   └── skills-marketplace.ts   # Skills sources
├── features/
│   ├── gh-auth.ts              # GitHub auth wrapper
│   ├── github-oauth.ts         # OAuth device flow
│   ├── install.ts              # MCP installation
│   ├── node-check.ts           # Node.js detection
│   └── sync.ts                 # Config sync
├── types/index.ts              # Shared types
├── ui/                         # Interactive UI (menu, install, skills, sync, mcp, config, tool-terminal)
└── utils/                      # Colors, fs, mcp-config, mcp-io, mcp-paths, platform, shell, skills, token-storage, etc.
```

```
tests/
├── setup.ts
├── cli/        # index, parser, commands, tool-command, help-modules, interactive
├── configs/    # skills-marketplace
├── features/   # gh-auth, github-oauth, install, node-check, sync
├── security/   # audit-findings, oauth-security
├── ui/         # external-mcp-flow
└── utils/      # assert, context, fs, mcp-config (×3), mcp-io, mcp-paths, platform, prompts, research-output, shell, skills, skills-fetch, spinner, token-storage
```

### Architecture

```
main() → runCLI() → [command handler] OR runInteractiveMode()
```

CLI args parsed first; if a command or `--tool` matches, it runs. Otherwise falls through to interactive menu.

### Skills directory

Bundled skills live at repo root [`skills/`](https://github.com/bgauryy/octocode-mcp/tree/main/skills). At publish, `prepack` copies them into `packages/octocode-cli/skills`. Run `yarn validate:skills` after changes.

---

## Development

**New command:** define in `commands.ts`, add help spec in `command-help-specs.ts`, test in `cli/commands.test.ts`.

**New tool:** tools come from `octocode-mcp` — the CLI auto-discovers them via MCP. No CLI changes needed.

**New IDE:** add to `types/index.ts`, paths in `mcp-paths.ts`, install logic in `ui/install/`, add tests.

**New skill:** create `skills/<name>/SKILL.md`, update `skills-marketplace.ts`, run `yarn validate:skills`.

**New MCP server:** add entry in `mcp-registry.ts`, run `yarn validate:mcp`.

---

## Safety

| Path | Access |
|------|--------|
| `src/`, `tests/` | Full |
| `scripts/`, `*.json`, `*.config.*` | Ask first |
| `out/`, `node_modules/` | Never |

Tokens encrypted in `~/.octocode/` (AES-256-GCM). Never log tokens. Coverage: 90% required.

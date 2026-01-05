# AGENTS.md - Octocode CLI Package

> AI agent guidance for the `octocode-cli` package - Interactive CLI installer and AI coding assistant for MCP configuration.

## 📦 Package Overview

**octocode-cli** is an interactive CLI tool that provides:
- One-command MCP server installation for AI coding assistants (Cursor, Claude Desktop, Claude Code, etc.)
- Built-in AI agent powered by Vercel AI SDK for coding tasks
- GitHub OAuth authentication with secure encrypted storage
- MCP Marketplace for browsing and installing 70+ community servers
- Skills management system for Claude Code

```bash
npx octocode-cli        # Interactive mode
octocode agent "task"   # Direct agent invocation
```

---

## 📂 Directory Structure

```
octocode-cli/
├── src/
│   ├── index.ts                    # Main entry point (interactive mode)
│   ├── cli/                        # CLI command system
│   │   ├── index.ts                # CLI runner & exports
│   │   ├── commands.ts             # Command definitions & handlers
│   │   ├── parser.ts               # Argument parser
│   │   ├── help.ts                 # Help text generation
│   │   └── types.ts                # CLI type definitions
│   ├── configs/                    # Configuration registries
│   │   ├── mcp-registry.ts         # 70+ MCP server definitions
│   │   ├── octocode.ts             # Octocode-specific config
│   │   └── skills-marketplace.ts   # Skills marketplace sources
│   ├── db/                         # SQLite database (Drizzle ORM)
│   │   ├── index.ts                # Database connection & queries
│   │   └── schema.ts               # Session/Message/ToolCall schema
│   ├── features/                   # Core functionality
│   │   ├── agent.ts                # AI agent implementation
│   │   ├── agent-config.ts         # Agent mode configurations
│   │   ├── agent-hooks.ts          # Agent lifecycle hooks
│   │   ├── agent-io.ts             # Agent I/O handling
│   │   ├── agent-loop/             # Agent execution loop (Vercel AI SDK)
│   │   ├── api-keys.ts             # API key discovery
│   │   ├── coders/                 # Coder implementations
│   │   ├── gh-auth.ts              # GitHub CLI integration
│   │   ├── github-oauth.ts         # OAuth device flow
│   │   ├── install.ts              # MCP installation logic
│   │   ├── node-check.ts           # Node.js environment checks
│   │   ├── providers/              # AI provider system
│   │   │   ├── index.ts            # Provider exports
│   │   │   ├── model-registry.ts   # Model definitions
│   │   │   └── provider-factory.ts # Provider instantiation
│   │   ├── session-manager.ts      # Agent session management
│   │   ├── session-migrate.ts      # Session data migration
│   │   ├── session-store.ts        # Session persistence
│   │   ├── sync.ts                 # Config synchronization
│   │   ├── system-prompts.ts       # Agent system prompts
│   │   ├── task-manager.ts         # Background task management
│   │   └── tools/                  # Agent tools
│   │       ├── file-tools.ts       # Read, Write, Edit, Glob, ListDir
│   │       ├── shell-tools.ts      # Bash, Grep
│   │       ├── task-tools.ts       # Agent, TaskOutput, TaskList, TaskKill
│   │       └── index.ts            # Tool registry (BUILTIN_TOOLS)
│   ├── types/                      # TypeScript definitions
│   │   ├── index.ts                # Core types (MCPConfig, IDE, etc.)
│   │   ├── agent.ts                # Agent-specific types
│   │   ├── provider.ts             # Provider & model types
│   │   └── tasks.ts                # Background task types
│   ├── ui/                         # Terminal UI (Ink/React)
│   │   ├── agent/                  # Agent UI components
│   │   ├── agent-ink/              # Ink-based agent UI
│   │   ├── ai-providers/           # Provider selection UI
│   │   ├── chat/                   # Chat interface
│   │   ├── config/                 # Config management UI
│   │   ├── constants.ts            # UI constants
│   │   ├── external-mcp/           # MCP marketplace UI
│   │   ├── header.ts               # CLI header/branding
│   │   ├── install/                # Installation wizard UI
│   │   ├── menu.ts                 # Main menu system
│   │   ├── skills-menu/            # Skills management UI
│   │   └── sync/                   # Sync status UI
│   └── utils/                      # Utilities
│       ├── assert.ts               # Assertion helpers
│       ├── colors.ts               # Terminal colors
│       ├── context.ts              # Context helpers
│       ├── fs.ts                   # File system utilities
│       ├── mcp-config.ts           # MCP config manipulation
│       ├── mcp-io.ts               # MCP config I/O
│       ├── mcp-paths.ts            # MCP config path resolution
│       ├── platform.ts             # Platform detection
│       ├── prompts.ts              # Interactive prompts
│       ├── research-output.ts      # Research formatting
│       ├── shell.ts                # Shell utilities
│       ├── skills-fetch.ts         # Skills fetching
│       ├── skills.ts               # Skills helpers
│       ├── spinner.ts              # Loading spinner
│       └── token-storage.ts        # Secure token storage
├── skills/                         # Built-in Octocode skills
│   ├── octocode-generate/          # Code generation skill
│   ├── octocode-plan/              # Planning skill
│   ├── octocode-pr-review/         # PR review skill
│   ├── octocode-research/          # Research skill
│   └── README.md                   # Skills documentation
├── tests/                          # Test suite (Vitest)
├── docs/                           # Additional documentation
├── out/                            # Build output (Vite bundle)
└── package.json                    # Package manifest
```

---

## 🔧 CLI Commands

### Available Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `install` | `i` | Install octocode-mcp for an IDE/client |
| `auth` | - | Interactive GitHub auth management |
| `login` | - | Sign in to GitHub (OAuth device flow) |
| `logout` | - | Sign out from GitHub |
| `status` | - | Show auth status & provider availability |
| `token` | - | Print stored GitHub OAuth token |
| `skills` | `skill` | Manage Octocode skills for Claude Code |
| `sync` | - | Sync MCP configs across clients |
| `agent` | - | Run AI agent with task |
| `chat` | - | Interactive chat mode |
| `sessions` | `sess` | List/manage agent sessions |

### Command Flow

```
npx octocode-cli [command] [options]
        │
        ▼
   src/index.ts
        │
        ├── runCLI() → src/cli/index.ts
        │       │
        │       ├── parseArgs() → parser.ts
        │       └── findCommand() → commands.ts → handler()
        │
        └── (no command) → runInteractiveMode() → menu.ts
```

---

## 🏗️ Core Architecture

### 1. Entry Point (`src/index.ts`)

- Initializes secure storage
- Checks if CLI command was provided
- Falls back to interactive menu if no command

### 2. CLI System (`src/cli/`)

**Command Definition Structure:**
```typescript
interface CLICommand {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  options?: CLIOption[];
  handler: (args: ParsedArgs) => Promise<void>;
}
```

### 3. AI Agent System (`src/features/agent*.ts`)

Built on [Vercel AI SDK](https://sdk.vercel.ai/docs) with:
- **Unified Loop**: Manages LLM interaction, streaming, tool calls
- **Provider Factory**: Supports Anthropic, OpenAI, Google, Groq, OpenRouter, Bedrock, Vertex, Local
- **Permission System**: Human-in-the-loop for write/shell operations
- **Session Persistence**: SQLite database for conversation history
- **Background Tasks**: Parallel sub-agent execution (see below)

**Agent Modes:**
- `research`: Read-only exploration tools
- `coding`: Full access (file writes, shell execution)

### 3.1 Background Task System (`src/features/task-manager.ts`)

Enables agents to spawn asynchronous sub-agents for long-running tasks.

**Key Components:**
- `TaskManager` singleton - manages task lifecycle (pending → running → completed/failed/killed)
- Event system for task notifications
- Transcript logging to temp files

**Tools (in `src/features/tools/task-tools.ts`):**

| Tool | Description |
|------|-------------|
| `Agent` | Spawn subagent with `run_in_background: true` for async execution |
| `TaskOutput` | Get task status/result, optionally blocking until complete |
| `TaskList` | List all background tasks with optional status filter |
| `TaskKill` | Kill a running background task |

**Convenience Functions:**
```typescript
startBackgroundTask(config): Promise<string>  // Returns task ID
getBackgroundTask(taskId): BackgroundTask | undefined
listBackgroundTasks(parentId): BackgroundTask[]
killBackgroundTask(taskId): Promise<boolean>
waitForBackgroundTask(taskId, timeout?): Promise<BackgroundTask>
```

**React Hooks (in `src/ui/agent-ink/useBackgroundTasks.ts`):**
```typescript
useBackgroundTasks(parentId?)     // Subscribe to all task updates
useTaskStatus(taskId)             // Track single task status
useTaskNotification(callback, opts)  // Receive completion callbacks
```

See `docs/implementation/BACKGROUND_TASKS.md` for full documentation.

### 4. MCP Configuration (`src/utils/mcp-*.ts`)

**Supported Clients:**
```typescript
type MCPClient =
  | 'cursor'
  | 'claude-desktop'
  | 'claude-code'
  | 'vscode-cline'
  | 'vscode-roo'
  | 'vscode-continue'
  | 'windsurf'
  | 'trae'
  | 'antigravity'
  | 'zed'
  | 'opencode'
  | 'custom';
```

**Key Functions:**
- `getMCPConfigPath(client)` - Resolve config file path per client/platform
- `readMCPConfig()` / `writeMCPConfig()` - Safe JSON I/O with backups
- `mergeOctocodeConfig()` - Add/update octocode server entry
- `isOctocodeConfigured()` - Check if already installed

### 5. GitHub Authentication (`src/features/github-oauth.ts`)

- **OAuth Device Flow**: Browser-based authentication
- **Secure Storage**: AES-256-GCM encrypted credentials at `~/.octocode/`
- **Token Management**: Auto-refresh, multiple hostname support
- **gh CLI Integration**: Fallback to `gh auth` tokens

### 6. Database Schema (`src/db/schema.ts`)

```typescript
// Sessions - Agent conversation containers
sessions: { id, createdAt, updatedAt, title, prompt, mode, status, ... }

// Messages - Conversation turns
messages: { id, sessionId, role, content, createdAt, tokenCount, ... }

// ToolCalls - Tool execution records
toolCalls: { id, messageId, sessionId, name, args, result, status, ... }
```

---

## 🔌 Provider System

### Supported Providers

| Provider | Env Vars | Notes |
|----------|----------|-------|
| `anthropic` | `ANTHROPIC_API_KEY`, `CLAUDE_API_KEY` | Default provider |
| `openai` | `OPENAI_API_KEY` | GPT models |
| `google` | `GOOGLE_API_KEY`, `GEMINI_API_KEY` | Gemini models |
| `groq` | `GROQ_API_KEY` | Fast inference |
| `openrouter` | `OPENROUTER_API_KEY` | Multi-provider gateway |
| `bedrock` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | AWS-hosted models |
| `vertex` | `GOOGLE_APPLICATION_CREDENTIALS` | GCP-hosted models |
| `local` | `LOCAL_ENDPOINT`, `OLLAMA_HOST` | Ollama/local models |

### Model ID Format

```typescript
type ModelId = `${LLMProvider}:${string}`;
// Examples: 'anthropic:claude-4-sonnet', 'openai:gpt-4o'
```

---

## 📦 Key Dependencies

| Dependency | Purpose |
|------------|---------|
| `ai` (Vercel AI SDK) | Agent/LLM core |
| `@anthropic-ai/sdk` | Anthropic API client |
| `@ai-sdk/*` | Provider integrations |
| `@modelcontextprotocol/sdk` | MCP integration |
| `ink` + `react` | Terminal UI framework |
| `@inquirer/prompts` | Interactive prompts |
| `drizzle-orm` + `better-sqlite3` | Session persistence |
| `keytar` | Secure credential storage |
| `@octokit/*` | GitHub OAuth |
| `zod` | Schema validation |

---

## 🧪 Testing

### Test Structure

```
tests/
├── cli/                    # CLI command tests
│   ├── commands.test.ts
│   └── parser.test.ts
├── configs/                # Config registry tests
├── features/               # Feature tests
│   ├── agent.test.ts
│   ├── agent-hooks.test.ts
│   ├── install.test.ts
│   ├── github-oauth.test.ts
│   ├── task-manager.test.ts    # Background task tests
│   ├── providers/              # Provider tests
│   └── tools/
│       └── task-tools.test.ts  # Task tools tests
├── ui/                     # UI component tests
├── utils/                  # Utility tests
└── setup.ts                # Test setup
```

### Commands

```bash
yarn test           # Run all tests with coverage
yarn test:watch     # Watch mode
yarn test:quiet     # Minimal output
```

### Coverage Requirement

**90%** coverage required across all metrics.

---

## 🛡️ Safety & Permissions

### Access Policy

| Path | Access | Notes |
|------|--------|-------|
| `src/` | ✅ FULL | Source code |
| `tests/` | ✅ FULL | Test files |
| `skills/` | ✅ FULL | Built-in skills |
| `docs/` | ✅ EDIT | Documentation |
| `*.config.*`, `*.json` | ⚠️ ASK | Build/lint configs |
| `.env*`, `~/.octocode/` | ❌ NEVER | Secrets |
| `out/`, `coverage/`, `node_modules/` | ❌ NEVER | Generated |

### Agent Permission Model

- **Auto-allowed**: Read operations, Octocode MCP tools
- **Requires approval**: File writes, shell commands, destructive actions

---

## 🛠️ Development Commands

| Task | Command |
|------|---------|
| Build | `yarn build` |
| Build (dev) | `yarn build:dev` |
| Lint | `yarn lint` |
| Lint + Fix | `yarn lint:fix` |
| Test | `yarn test` |
| Type Check | `yarn typecheck` |
| Start | `yarn start` (runs built CLI) |
| Clean | `yarn clean` |

---

## 📋 Development Standards

### Code Style

- **TypeScript**: Strict mode enabled
- **Formatting**: Semicolons, single quotes, 80 char width, 2-space indent
- **Patterns**: Prefer `const`, explicit return types, no `any`
- **Utilities**: Optional chaining (`?.`), nullish coalescing (`??`)

### File Naming

- **Source**: `camelCase.ts` or `kebab-case.ts`
- **Tests**: `<module>.test.ts`
- **Types**: Colocated in `types/` or inline

### Key Patterns

1. **Command Handler**: All commands follow `CLICommand` interface
2. **Provider Factory**: Dynamic model resolution via `createModel()`
3. **Config Merge**: Non-destructive updates via `mergeOctocodeConfig()`
4. **Permission System**: Interactive approval via `createInteractivePermissionHandler()`

---

## 🔄 Common Workflows

### Adding a New CLI Command

1. Define command in `src/cli/commands.ts`
2. Implement handler function
3. Add to `commands` array export
4. Add tests in `tests/cli/commands.test.ts`

### Adding a New AI Provider

1. Add provider type to `src/types/provider.ts`
2. Add models to `src/features/providers/model-registry.ts`
3. Implement factory in `src/features/providers/provider-factory.ts`
4. Update `PROVIDER_ENV_VARS` and `PROVIDER_DISPLAY_NAMES`

### Adding a New MCP Client

1. Add client type to `MCPClient` in `src/types/index.ts`
2. Add path mapping in `src/utils/mcp-paths.ts`
3. Add client info to `MCP_CLIENTS` constant
4. Test with `tests/utils/mcp-paths.test.ts`

### Adding a New Agent Tool

1. Create tool in `src/features/tools/` using Vercel AI SDK `tool()` function
2. Add to `BUILTIN_TOOLS` in `src/features/tools/index.ts`
3. Add tests in `tests/features/tools/`
4. If needed, add to tool set presets (`RESEARCH_TOOLS`, `CODING_TOOLS`)

---

## 🔗 Related Packages

| Package | Relationship |
|---------|--------------|
| `octocode-mcp` | MCP server that this CLI installs |
| `octocode-vscode` | VS Code extension (separate package) |

---

## 🤖 Agent Tips for This Package

1. **Use local tools first**: Prefer `localSearchCode`, `localGetFileContent` over grep/cat
2. **Check mcp-paths.ts**: Platform-specific config paths are complex
3. **Test coverage matters**: 90% threshold is enforced
4. **Session persistence**: Agent sessions use SQLite - check db/ for schema
5. **Provider discovery**: API keys are discovered from env vars automatically
6. **Background tasks**: Use `Agent` tool with `run_in_background: true` for parallel work
7. **Tools use Vercel AI SDK**: All tools use `tool()` from `ai` package with Zod schemas

---

Created for AI agent context. See root [AGENTS.md](../../AGENTS.md) for monorepo-wide guidance.


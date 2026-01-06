# Overview - Claude Agent SDK Architecture

## Package Identification

| Property | Value |
|----------|-------|
| **Package** | `@anthropic-ai/claude-agent-sdk` |
| **Version** | 0.1.76 |
| **Type** | Bundled JavaScript (Node.js) |
| **Entry Points** | `cli.js` (CLI), `sdk.mjs` (SDK) |
| **Bundler** | esbuild (based on `__create`, `__toESM` helpers) |

## File Sizes

| File | Size | Purpose |
|------|------|---------|
| `cli.js` | ~10.5 MB | Full agent CLI runtime |
| `sdk.mjs` | ~850 KB | SDK wrapper for CLI |
| `agentSdkTypes.d.ts` | ~50 KB | TypeScript definitions |

## Architecture Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                     Your Application                             │
│   const q = query({ prompt: "...", options: {...} });           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     sdk.mjs (SDK)                                │
│  ┌──────────────┐  ┌──────────────────┐  ┌─────────────────┐    │
│  │ query()      │  │ ProcessTransport │  │ createSdkMcp    │    │
│  │ entry point  │  │ stdio IPC        │  │ Server          │    │
│  └──────────────┘  └──────────────────┘  └─────────────────┘    │
└─────────────────────────────┬───────────────────────────────────┘
                              │ JSON over stdio
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     cli.js (Claude Code)                         │
│  ┌──────────────┐  ┌──────────────────┐  ┌─────────────────┐    │
│  │ Agent Loop   │  │ Built-in Tools   │  │ MCP Server      │    │
│  │ (main)       │  │ (17+ tools)      │  │ Integration     │    │
│  └──────────────┘  └──────────────────┘  └─────────────────┘    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Anthropic API                                │
│             Claude Models (Sonnet, Opus, Haiku)                 │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### SDK Layer (`sdk.mjs`)

| Component | Location | Purpose |
|-----------|----------|---------|
| `query()` | Line ~26703 | Main entry point, AsyncGenerator |
| `ProcessTransport` | Line ~12956 | Child process management |
| `Query` class | Line ~13497 | Agent loop state machine |
| `tool()` | Exported | Tool definition helper |
| `createSdkMcpServer` | Exported | MCP server factory |

### CLI Layer (`cli.js`)

| Component | charOffset | Purpose |
|-----------|------------|---------|
| Agent loop | Multiple | Main execution loop |
| Tool registry | ~891029 | Tool registration/execution |
| Permission system | ~9880442 | Permission UI/flow |
| Session management | ~6430223 | Session persistence |
| Sub-agent system | ~8582293 | Agent spawning |
| CLAUDE.md loading | ~7410494 | Context injection |
| Skill system | ~6909838 | Skill loading/execution |

## Terminal UI Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **UI Framework** | Ink (React for CLI) | Component rendering |
| **Layout** | Yoga (Flexbox) | Terminal layout |
| **Styling** | Chalk-like (V1.*) | ANSI colors/styles |
| **Components** | Box, Text, Static | Ink primitives |
| **Input** | useInput | Keyboard handling |
| **Progress** | @inkjs/ui Spinner | Loading indicators |

## Key Features

### 1. Sub-Agent System
- Built-in agents: `explore`, `Plan`, `code`
- Custom agents via `options.agents` or `.claude/agents/*.md`
- Tool restrictions per agent type
- Transcript isolation with optional context forking

### 2. Skill System
- Skills loaded from `~/.claude/skills/` and `./.claude/skills/`
- SKILL.md format with `$ARGUMENTS` placeholder
- Reference files for context injection

### 3. Session Management
- SQLite persistence at `~/.claude/projects/<hash>/sessions/`
- Resume with full context via `--resume`
- Fork sessions for branching

### 4. Context Optimization
- Prompt caching (cache_control: ephemeral)
- Auto-compaction when context grows
- File checkpointing for rewind

## Communication Protocol

### Message Flow (SDK ↔ CLI)

```
SDK                              CLI
 │                                │
 │  Write prompt to stdin         │
 │ ──────────────────────────────►│
 │                                │
 │  { type: "system", ...}        │
 │ ◄──────────────────────────────│
 │                                │
 │  { type: "stream_event", ...}  │
 │ ◄──────────────────────────────│ (multiple)
 │                                │
 │  { type: "control_request", ...│
 │ ◄──────────────────────────────│ (permission check)
 │                                │
 │  { type: "control_response",...│
 │ ──────────────────────────────►│
 │                                │
 │  { type: "result", ...}        │
 │ ◄──────────────────────────────│
```

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `user` | SDK → CLI | User message input |
| `assistant` | CLI → SDK | Model response |
| `stream_event` | CLI → SDK | Streaming content |
| `system` | CLI → SDK | Status/init/hooks |
| `result` | CLI → SDK | Completion stats |
| `control_request` | CLI → SDK | Permission/hook request |
| `control_response` | SDK → CLI | Permission response |
| `tool_progress` | CLI → SDK | Tool execution progress |

## Dependencies

### Core Dependencies

| Package | Purpose |
|---------|---------|
| `@anthropic-ai/sdk` | API client & types |
| `@modelcontextprotocol/sdk` | MCP protocol |
| `zod` | Schema validation |
| `ink` | Terminal UI |
| `yoga-layout` | Flexbox for terminal |

### Runtime Requirements

| Requirement | Value |
|-------------|-------|
| Node.js | >= 18.0.0 |
| Bun | Supported (optional) |

---

*See `claude-agent-sdk-architecture.md` for complete technical documentation*


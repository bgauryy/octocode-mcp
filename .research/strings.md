# Strings & Constants - Claude Agent SDK

## CLI Flags

### Core Options
| Flag | Description | Example |
|------|-------------|---------|
| `--output-format` | Output format | `stream-json` |
| `--input-format` | Input format | `stream-json` |
| `--verbose` | Enable verbose logging | - |
| `--max-thinking-tokens` | Extended thinking budget | `10000` |
| `--max-turns` | Maximum conversation turns | `50` |
| `--max-budget-usd` | Maximum API cost | `5.00` |
| `--model` | Model to use | `claude-sonnet-4-5-20250929` |
| `--mcp-servers` | MCP server config JSON | `{...}` |
| `--resume` | Session ID to resume | `sess_abc123` |

## Message Types

### Control Messages (SDK ↔ CLI)
| Type | Direction | Purpose |
|------|-----------|---------|
| `control_request` | CLI → SDK | Request permission/hook/MCP |
| `control_response` | SDK → CLI | Response to request |
| `control_cancel_request` | CLI → SDK | Cancel pending request |
| `keep_alive` | CLI → SDK | Heartbeat |

### SDK Messages (Yielded to Consumer)
| Type | Subtype | Description |
|------|---------|-------------|
| `user` | - | User message input |
| `assistant` | - | Model response |
| `stream_event` | - | Partial streaming content |
| `system` | `init` | Session initialization |
| `system` | `status` | Status updates (compacting) |
| `system` | `hook_response` | Hook execution result |
| `system` | `compact_boundary` | Context compaction marker |
| `result` | `success` | Successful completion |
| `result` | `error_*` | Error completion |
| `tool_progress` | - | Tool execution progress |
| `auth_status` | - | Authentication state |

### Result Subtypes
- `success` - Normal completion
- `error_during_execution` - Runtime error
- `error_max_turns` - Hit turn limit
- `error_max_budget_usd` - Hit budget limit
- `error_max_structured_output_retries` - Schema validation failures

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DEBUG_CLAUDE_AGENT_SDK` | Enable SDK debug logging |
| `ANTHROPIC_API_KEY` | API key for Anthropic |
| `CLAUDE_CODE_STREAM_CLOSE_TIMEOUT` | Stream close timeout (for long tools) |

## Path Constants

### User Settings
| Path | Purpose |
|------|---------|
| `~/.claude/` | User config directory |
| `~/.claude/settings.json` | User settings |
| `~/.claude/CLAUDE.md` | Global user context |
| `~/.claude/agents/` | User-defined agents |
| `~/.claude/skills/` | User-defined skills |
| `~/.claude/sessions.json` | Session index |
| `~/.claude/projects/<hash>/sessions/` | Session transcripts |

### Project Settings
| Path | Purpose |
|------|---------|
| `./.claude/` | Project config directory |
| `./.claude/settings.json` | Project settings |
| `./.claude/settings.local.json` | Local settings (gitignored) |
| `./.claude/CLAUDE.md` | Project context |
| `./.claude/agents/` | Project agents |
| `./.claude/agents.local/` | Local-only agents |
| `./.claude/skills/` | Project skills |

## Border Styles (Ink UI)

**Location:** `cli.js:4279459` (charOffset)

```javascript
// Border style definitions
single: { top: '─', left: '│', right: '│', bottom: '─', ... }
double: { top: '═', left: '║', right: '║', bottom: '═', ... }
round:  { topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯', ... }
dashed: { top: '╌', left: '╎', right: '╎', bottom: '╌', ... }
```

## ANSI Escape Sequences

### Cursor Control
| Sequence | Purpose |
|----------|---------|
| `\x1B[?25l` | Hide cursor |
| `\x1B[?25h` | Show cursor |
| `\x1B[2J` | Clear screen |
| `\x1B[H` | Move cursor home |

### OSC 8 Hyperlinks
**Location:** `cli.js:9089386` (charOffset)

```javascript
const OSC_START = "\x1B]8;;";
const OSC_END = "\x07";

// Usage: `${OSC_START}${url}${OSC_END}${text}${OSC_START}${OSC_END}`
```

## Tool Names

### Built-in Tools
| Tool | Description |
|------|-------------|
| `Read` | Read file contents |
| `Write` | Write file contents |
| `Edit` | Edit file (string replacement) |
| `Bash` | Execute shell commands |
| `Glob` | Find files by pattern |
| `Grep` | Search file contents |
| `LS` | List directory |
| `Agent` | Spawn sub-agent |
| `TaskOutput` | Get background task output |
| `TodoWrite` | Manage todo list |
| `WebFetch` | HTTP requests |
| `WebSearch` | Web search |
| `AskUserQuestion` | Prompt user for input |
| `KillShell` | Terminate shell |

### MCP Protocol
| Constant | Value |
|----------|-------|
| `ListToolsRequestSchema` | Tool listing method |
| `CallToolRequestSchema` | Tool invocation method |

## Hook Events

```typescript
const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PermissionRequest'
];
```

## Vendor Paths (Bundle Comments)

Found in cli.js referencing bundled dependencies:
- `../node_modules/@modelcontextprotocol/sdk/...`
- `../node_modules/ajv/...`
- `../node_modules/ink/...`
- `../node_modules/yoga-layout/...`
- `../node_modules/@anthropic-ai/sdk/...`

---

*Extracted from `@anthropic-ai/claude-agent-sdk` v0.1.76*


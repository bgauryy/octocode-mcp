# Claude Agent SDK Architecture

> Research summary of `@anthropic-ai/claude-agent-sdk` v0.1.76

## Overview

The Claude Agent SDK provides a TypeScript interface for running Claude Code as an agent loop. It spawns the Claude Code CLI as a child process and manages bidirectional communication via JSON streams.

## Dependencies & Requirements

### Core Dependencies

| Package | Purpose | Notes |
|---------|---------|-------|
| `@anthropic-ai/sdk` | API types & client | Message types, usage tracking |
| `@modelcontextprotocol/sdk` | MCP protocol | Tool definitions, server transport |
| `zod` | Schema validation | Tool input validation, output schemas |

### Runtime Requirements

| Requirement | Value | Configuration |
|-------------|-------|---------------|
| Node.js | >= 18.0.0 | `executable: 'node'` |
| Bun (optional) | Supported | `executable: 'bun'` |
| Claude Code CLI | Bundled | `pathToClaudeCodeExecutable` |

### Key Type Imports

```typescript
// From @anthropic-ai/sdk
import type { 
  MessageParam as APIUserMessage 
} from '@anthropic-ai/sdk/resources';

import type { 
  BetaMessage as APIAssistantMessage, 
  BetaUsage as Usage, 
  BetaRawMessageStreamEvent as RawMessageStreamEvent 
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';

// From @modelcontextprotocol/sdk
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// From zod
import { type z, type ZodRawShape, type ZodObject } from 'zod';
```

## Core Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application                               │
│   const q = query({ prompt: "...", options: {...} });           │
│   for await (const msg of q) { /* handle messages */ }          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Query (AsyncGenerator)                       │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │  inputStream    │  │ handleControl    │  │ hookCallbacks  │  │
│  │  (message queue)│  │ Request()        │  │ (Map)          │  │
│  └────────┬────────┘  └────────┬─────────┘  └───────┬────────┘  │
│           │                    │                    │            │
│           │     readMessages() │ processControl()   │            │
│           │         loop       │ canUseTool()       │            │
└───────────┼────────────────────┼────────────────────┼────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ProcessTransport                              │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │ write(json)  │  │ readMessages()   │  │ spawnProcess()    │  │
│  │ → stdin      │  │ ← stdout         │  │ node cli.js       │  │
│  └──────────────┘  └──────────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
            │                    ▲
            ▼                    │
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code CLI Process                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Agent Loop:                                              │   │
│  │  1. Receive user message                                  │   │
│  │  2. Call Anthropic API (with tools)                       │   │
│  │  3. If tool_use: send control_request → wait response     │   │
│  │  4. Execute tool or abort based on permission             │   │
│  │  5. Loop until: end_turn, max_turns, max_budget, error    │   │
│  │  6. Emit result message                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Entry Points

### 1. `query()` - Main Entry Point

```typescript
function query({
  prompt,   // string | AsyncIterable<SDKUserMessage>
  options   // Options
}): Query   // AsyncGenerator<SDKMessage>
```

**Location**: `sdk.mjs:26703`

**Flow**:
1. Parse options and create system prompt config
2. Find `pathToClaudeCodeExecutable` (defaults to `cli.js`)
3. Separate SDK MCP servers from standard MCP configs
4. Create `ProcessTransport` with all CLI arguments
5. Create `Query` instance as async generator
6. Write initial prompt to transport (for string prompts)
7. Return Query for iteration

### 2. Session API (v2 - Unstable)

```typescript
// Create new session
unstable_v2_createSession(options: SDKSessionOptions): SDKSession

// Resume existing session
unstable_v2_resumeSession(sessionId: string, options): SDKSession

// Single-turn convenience
unstable_v2_prompt(message: string, options): Promise<SDKResultMessage>
```

## Key Classes

### ProcessTransport

**Location**: `sdk.mjs:12956`

Manages the Claude Code CLI child process.

**Constructor Flow** (`initialize()`):
1. Build CLI arguments from options
2. Map options to flags: `--max-turns`, `--model`, `--max-budget-usd`, etc.
3. Configure MCP servers via `--mcp-servers` JSON
4. Spawn process with `stdin: pipe`, `stdout: pipe`
5. Set up stderr handling for debugging

**Key Methods**:
- `write(data)`: Send JSON to CLI stdin
- `readMessages()`: AsyncGenerator yielding parsed stdout lines
- `endInput()`: Close stdin stream
- `close()`: Terminate process

### Query Class

**Location**: `sdk.mjs:13497`

The core agent loop manager implementing `AsyncGenerator<SDKMessage>`.

**Properties**:
```typescript
class Query {
  transport: ProcessTransport;
  isSingleUserTurn: boolean;
  canUseTool?: CanUseTool;      // Permission callback
  hooks?: HookConfig;           // Event hooks
  abortController: AbortController;
  inputStream: Stream;          // Message queue to yield
  pendingControlResponses: Map; // Request ID → resolver
  hookCallbacks: Map;           // Callback ID → function
  sdkMcpTransports: Map;        // MCP server transports
}
```

**Core Methods**:

#### `readMessages()` - Main Loop
**Location**: `sdk.mjs:13588`

```typescript
async readMessages() {
  for await (const message of this.transport.readMessages()) {
    // Route by message type
    if (message.type === "control_response") {
      // Resolve pending request
      handler(message.response);
    } 
    else if (message.type === "control_request") {
      // Handle permission/hook/MCP request
      this.handleControlRequest(message);
    }
    else if (message.type === "control_cancel_request") {
      // Abort pending operation
      this.handleControlCancelRequest(message);
    }
    else if (message.type === "keep_alive") {
      continue;  // Heartbeat
    }
    else {
      // Yield to consumer: assistant, user, result, system, etc.
      if (message.type === "result") {
        this.firstResultReceived = true;
        if (this.isSingleUserTurn) {
          this.transport.endInput();
        }
      }
      this.inputStream.enqueue(message);
    }
  }
  this.inputStream.done();
  this.cleanup();
}
```

#### `handleControlRequest()` - Tool/Hook Dispatch
**Location**: `sdk.mjs:13627`

```typescript
async handleControlRequest(request) {
  const controller = new AbortController();
  try {
    const response = await this.processControlRequest(request, controller.signal);
    await this.transport.write(JSON.stringify({
      type: "control_response",
      response: { subtype: "success", request_id, response }
    }));
  } catch (error) {
    await this.transport.write(JSON.stringify({
      type: "control_response", 
      response: { subtype: "error", request_id, error: error.message }
    }));
  }
}
```

#### `processControlRequest()` - Request Handlers
**Location**: `sdk.mjs:13659`

```typescript
async processControlRequest(request, signal) {
  switch (request.request.subtype) {
    case "can_use_tool":
      // Call canUseTool callback with tool info
      return this.canUseTool(
        request.request.tool_name,
        request.request.input,
        { signal, suggestions, blockedPath, toolUseID, agentID }
      );
    
    case "hook_callback":
      // Invoke registered hook callback
      return this.handleHookCallbacks(callback_id, input, toolUseID, signal);
    
    case "mcp_message":
      // Route to SDK MCP server transport
      return this.handleMcpControlRequest(server_name, request, transport);
  }
}
```

## Message Types

### Control Messages (Internal SDK ↔ CLI)

| Type | Direction | Purpose |
|------|-----------|---------|
| `control_request` | CLI → SDK | Request permission/hook/MCP |
| `control_response` | SDK → CLI | Respond to request |
| `control_cancel_request` | CLI → SDK | Abort pending request |
| `keep_alive` | CLI → SDK | Heartbeat |

### SDK Messages (Yielded to Consumer)

| Type | Subtype | Description |
|------|---------|-------------|
| `user` | - | User message (input) |
| `assistant` | - | Model response |
| `stream_event` | - | Partial streaming content |
| `system` | `init` | Session initialization info |
| `system` | `status` | Status updates (compacting) |
| `system` | `hook_response` | Hook execution result |
| `system` | `compact_boundary` | Context compaction marker |
| `result` | `success` | Successful completion |
| `result` | `error_*` | Error completion |
| `tool_progress` | - | Tool execution progress |
| `auth_status` | - | Authentication state |

### Result Subtypes

- `success`: Normal completion with result
- `error_during_execution`: Runtime error
- `error_max_turns`: Hit turn limit
- `error_max_budget_usd`: Hit budget limit
- `error_max_structured_output_retries`: Structured output failures

## Tool Permission Flow

```
┌─────────────────┐
│ Claude Model    │
│ emits tool_use  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐    control_request     ┌─────────────────┐
│ CLI Process     │ ──────────────────────▶│ SDK Query       │
│ (detect tool)   │    {can_use_tool}      │                 │
└─────────────────┘                        └────────┬────────┘
                                                    │
                                                    ▼
                                           ┌─────────────────┐
                                           │ canUseTool()    │
                                           │ callback        │
                                           │ (user-provided) │
                                           └────────┬────────┘
                                                    │
         ┌──────────────────────────────────────────┴───────┐
         │                                                   │
         ▼                                                   ▼
┌─────────────────┐                                 ┌─────────────────┐
│ behavior: allow │                                 │ behavior: deny  │
│ updatedInput?   │                                 │ message         │
│ updatedPerms?   │                                 │ interrupt?      │
└────────┬────────┘                                 └────────┬────────┘
         │                                                   │
         └───────────────────────┬───────────────────────────┘
                                 │
                                 ▼
┌─────────────────┐    control_response    ┌─────────────────┐
│ CLI Process     │ ◀──────────────────────│ SDK Query       │
│ execute/abort   │                        │                 │
└─────────────────┘                        └─────────────────┘
```

## Hook System

### Available Events

```typescript
const HOOK_EVENTS = [
  "PreToolUse",           // Before tool execution
  "PostToolUse",          // After successful tool
  "PostToolUseFailure",   // After failed tool
  "Notification",         // System notifications
  "UserPromptSubmit",     // User sends message
  "SessionStart",         // Session begins
  "SessionEnd",           // Session ends
  "Stop",                 // Interrupt signal
  "SubagentStart",        // Sub-agent spawned
  "SubagentStop",         // Sub-agent finished
  "PreCompact",           // Before context compaction
  "PermissionRequest"     // Permission UI request
];
```

### Hook Configuration

```typescript
options.hooks = {
  PreToolUse: [{
    matcher: "Write|Edit",  // Tool name pattern
    hooks: [async (input, toolUseID, { signal }) => {
      // Return decision
      return { continue: true };
    }],
    timeout: 5000
  }]
};
```

## Iteration Control

### Options

| Option | CLI Flag | Description |
|--------|----------|-------------|
| `maxTurns` | `--max-turns` | Maximum conversation turns |
| `maxBudgetUsd` | `--max-budget-usd` | Maximum API cost |
| `maxThinkingTokens` | `--max-thinking-tokens` | Extended thinking budget |

### Result Statistics

```typescript
type SDKResultMessage = {
  type: 'result';
  subtype: 'success' | 'error_*';
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  modelUsage: {
    [modelName: string]: ModelUsage;
  };
  permission_denials: SDKPermissionDenial[];
  structured_output?: unknown;
};
```

## Agent Loop Algorithm

### Core Loop Flow

The agent operates in a **turn-based loop** where each turn consists of:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AGENT LOOP ALGORITHM                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. RECEIVE INPUT                                                            │
│     • User message (prompt) OR tool_result from previous turn               │
│     • Stream input via AsyncIterable<SDKUserMessage> for interactive mode   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. API CALL (Messages API)                                                  │
│     • Send conversation history + tools + system prompt                     │
│     • Extended thinking enabled → budget from maxThinkingTokens             │
│     • Stream response: message_start → content_blocks → message_stop        │
│     • Cache control: ephemeral markers for prompt caching                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. PROCESS RESPONSE                                                         │
│     ┌─────────────────────────────────────────────────────────────────────┐ │
│     │  For each content_block in response:                                 │ │
│     │    • text         → Yield SDKPartialAssistantMessage (if streaming) │ │
│     │    • thinking     → Extended thinking content (model reasoning)      │ │
│     │    • tool_use     → Queue for tool execution                         │ │
│     └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │                             │
                     ▼                             ▼
        ┌────────────────────────┐    ┌────────────────────────┐
        │  stop_reason: end_turn │    │  stop_reason: tool_use │
        │  (No more actions)     │    │  (Execute tools)       │
        └───────────┬────────────┘    └───────────┬────────────┘
                    │                             │
                    ▼                             ▼
        ┌────────────────────────┐    ┌────────────────────────┐
        │  4. COMPLETE           │    │  4. TOOL EXECUTION     │
        │  • Yield result        │    │  • See Tool Loop below │
        │  • Report statistics   │    │  • Append tool_results │
        │  • End session         │    │  • INCREMENT num_turns │
        └────────────────────────┘    └───────────┬────────────┘
                                                  │
                                                  │ ──► Continue to Step 2
                                                  │     (next API call)
```

### Turn Counting & Limits

```typescript
// Turn increments when:
// 1. Model emits tool_use AND tools are executed
// 2. Each API call that results in assistant message counts

// Termination conditions (checked after each turn):
if (num_turns >= maxTurns)        → error_max_turns
if (total_cost >= maxBudgetUsd)   → error_max_budget_usd
if (execution_error)              → error_during_execution
if (stop_reason === 'end_turn')   → success
```

## Tool Execution Loop

### Tool Queue Processing

When the model emits one or more `tool_use` content blocks:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TOOL EXECUTION LOOP                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    For each tool_use in response.content:
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. PRE-TOOL HOOKS                                                           │
│     • Fire PreToolUse hooks matching tool_name pattern                      │
│     • Hook can: continue, modify_input, block, abort_all                    │
│     • Await hook callbacks with timeout                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. PERMISSION CHECK (via control_request)                                   │
│     ┌─────────────────────────────────────────────────────────────────────┐ │
│     │  SDK sends: { subtype: 'can_use_tool', tool_name, input, ... }      │ │
│     │                                                                      │ │
│     │  canUseTool callback evaluates:                                      │ │
│     │    • Tool name and input parameters                                  │ │
│     │    • Permission mode (full, auto, ask)                               │ │
│     │    • File paths and security constraints                             │ │
│     │    • Agent ID (for sub-agent permission scope)                       │ │
│     └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │                             │
                     ▼                             ▼
        ┌────────────────────────┐    ┌────────────────────────┐
        │  behavior: 'allow'     │    │  behavior: 'deny'      │
        │  • updatedInput?       │    │  • message             │
        │  • updatedPermissions? │    │  • interrupt?          │
        └───────────┬────────────┘    └───────────┬────────────┘
                    │                             │
                    ▼                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. EXECUTE TOOL                                                             │
│     ┌─────────────────────────────────────────────────────────────────────┐ │
│     │  Tool types:                                                         │ │
│     │    • Built-in: Read, Write, Edit, Bash, Glob, Grep, Agent, etc.     │ │
│     │    • MCP Tools: From configured MCP servers                          │ │
│     │    • SDK Tools: In-process tools from SDK MCP server                 │ │
│     │                                                                      │ │
│     │  Progress: SDKToolProgressMessage emitted every N seconds            │ │
│     │    { tool_use_id, tool_name, elapsed_time_seconds }                  │ │
│     └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. POST-TOOL HOOKS                                                          │
│     • Fire PostToolUse OR PostToolUseFailure based on result                │
│     • Hook receives tool output/error                                        │
│     • Can inject additional context or abort                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. BUILD TOOL_RESULT                                                        │
│     { type: 'tool_result', tool_use_id, content: [...] }                    │
│     • Append to conversation for next API call                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                            Next tool_use in batch
                                    │
                    (After all tools) → Back to Agent Loop
```

### Parallel Tool Execution

The model can emit multiple `tool_use` blocks in a single response. These are processed **sequentially** by default, but the CLI may batch MCP calls:

```typescript
// In assistant message:
{
  content: [
    { type: 'text', text: 'Let me read those files...' },
    { type: 'tool_use', id: 'tu_1', name: 'Read', input: { path: 'a.ts' } },
    { type: 'tool_use', id: 'tu_2', name: 'Read', input: { path: 'b.ts' } },
  ]
}

// Results batched in user message:
{
  role: 'user',
  content: [
    { type: 'tool_result', tool_use_id: 'tu_1', content: [...] },
    { type: 'tool_result', tool_use_id: 'tu_2', content: [...] },
  ]
}
```

## Extended Thinking

### Configuration

```typescript
// SDK options
{
  maxThinkingTokens: 10000,  // Budget for thinking tokens
  // Passed to CLI as: --max-thinking-tokens 10000
}

// Runtime control
await query.setMaxThinkingTokens(15000);  // Adjust mid-session
```

### Thinking Content Blocks

When extended thinking is enabled, the model emits `thinking` content blocks:

```typescript
// API response stream events:
{
  type: 'content_block_start',
  content_block: { type: 'thinking', thinking: '' }
}
{
  type: 'content_block_delta',
  delta: { type: 'thinking_delta', thinking: 'Let me analyze this...' }
}
{
  type: 'content_block_stop'
}

// These are part of RawMessageStreamEvent yielded via SDKPartialAssistantMessage
// (when includePartialMessages: true)
```

### Thinking Token Budget

- Thinking tokens count toward API costs
- Model can use up to `maxThinkingTokens` per response
- Helps with complex reasoning but increases latency/cost
- Set to `null` to clear limit

## Context Optimization

### 1. Prompt Caching (Cache Control)

The SDK uses **ephemeral cache markers** to optimize repeated context:

```typescript
// In Messages API, cache control headers:
{
  role: 'user',
  content: [
    {
      type: 'text',
      text: 'System prompt and tools...',
      cache_control: { type: 'ephemeral' }  // Cache this block
    }
  ]
}
```

**Cache Hit Statistics** (in SDKResultMessage):
```typescript
usage: {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;  // Tokens added to cache
  cache_read_input_tokens: number;       // Tokens read from cache
}
```

### 2. Context Compaction

When context grows too large, automatic **compaction** summarizes history:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONTEXT COMPACTION FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                     Context tokens approaching limit
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. PRE-COMPACT HOOK                                                         │
│     • Fire PreCompact hook                                                  │
│     • Application can save state, adjust behavior                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. STATUS UPDATE                                                            │
│     SDKStatusMessage: { status: 'compacting' }                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. SUMMARIZE HISTORY                                                        │
│     • CLI summarizes older messages                                         │
│     • Preserves recent context and critical information                     │
│     • Reduces token count while maintaining coherence                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. COMPACT BOUNDARY MESSAGE                                                 │
│     SDKCompactBoundaryMessage: {                                            │
│       type: 'system',                                                       │
│       subtype: 'compact_boundary',                                          │
│       compact_metadata: {                                                   │
│         trigger: 'auto' | 'manual',   // What triggered compaction         │
│         pre_tokens: number            // Token count before compaction      │
│       }                                                                     │
│     }                                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. STATUS CLEAR                                                             │
│     SDKStatusMessage: { status: null }                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3. Session Persistence

```typescript
// Session options
{
  persistSession: true,     // Save to ~/.claude/sessions/
  resume: 'session-id',     // Resume from previous session
  forkSession: true,        // Fork to new ID on resume
  enableFileCheckpointing: true,  // Checkpoint file states
}

// Prevents re-sending full context on resume
// CLI loads conversation history from disk
```

## Streaming Architecture

### Message Stream Types

```typescript
// From Anthropic API (BetaRawMessageStreamEvent)
type RawMessageStreamEvent = 
  | { type: 'message_start'; message: BetaMessage }
  | { type: 'content_block_start'; index: number; content_block: ContentBlock }
  | { type: 'content_block_delta'; index: number; delta: Delta }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string }; usage: Usage }
  | { type: 'message_stop' };
```

### SDK Streaming Mode

```typescript
// Enable partial message streaming
const q = query({
  prompt: '...',
  options: { includePartialMessages: true }
});

for await (const msg of q) {
  if (msg.type === 'stream_event') {
    // SDKPartialAssistantMessage
    const event = msg.event;  // RawMessageStreamEvent
    
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        process.stdout.write(event.delta.text);  // Stream text output
      } else if (event.delta.type === 'thinking_delta') {
        // Model's reasoning process
      } else if (event.delta.type === 'input_json_delta') {
        // Tool input being constructed
      }
    }
  }
}
```

### Stream-JSON Protocol

CLI uses `--output-format stream-json` for efficient IPC:

```
CLI Process                          SDK
    │                                 │
    │  {"type":"system","subtype":    │
    │   "init",...}\n                 │
    │ ───────────────────────────────►│
    │                                 │
    │  {"type":"stream_event",        │
    │   "event":{...}}\n              │
    │ ───────────────────────────────►│
    │  (multiple partial events)      │
    │ ───────────────────────────────►│
    │                                 │
    │  {"type":"assistant",           │
    │   "message":{...}}\n            │
    │ ───────────────────────────────►│
    │                                 │
    │  {"type":"control_request",...} │
    │ ───────────────────────────────►│
    │                                 │
    │  {"type":"control_response",...}│
    │ ◄───────────────────────────────│
    │                                 │
    │  {"type":"result",...}\n        │
    │ ───────────────────────────────►│
```

## MCP Server Integration

### Configuration Types

```typescript
// Stdio server (spawned process)
{ type: 'stdio', command: 'npx', args: [...], env: {...} }

// SSE server (HTTP connection)
{ type: 'sse', url: 'http://...', headers: {...} }

// HTTP server
{ type: 'http', url: 'http://...', headers: {...} }

// SDK server (in-process)
{ type: 'sdk', name: 'my-server', instance: McpServer }
```

### SDK MCP Server

```typescript
const server = createSdkMcpServer({
  name: 'my-tools',
  tools: [
    tool('greet', 'Say hello', { name: z.string() }, 
         async ({ name }) => ({ content: [{ type: 'text', text: `Hello ${name}!` }] }))
  ]
});

query({ prompt: '...', options: { mcpServers: { 'my-tools': server } } });
```

## Sub-Agent System

The SDK supports **two types of sub-agents**: Local Agents (same process context) and Remote Agents (cloud execution).

### Agent Definition (SDK Configuration)

```typescript
// Define custom agents via SDK options
options.agents = {
  'code-reviewer': {
    description: 'Reviews code for bugs and style issues',
    tools: ['Read', 'Grep', 'Glob'],           // Allowed tools
    disallowedTools: ['Write', 'Bash'],         // Blocked tools
    prompt: 'You are a code reviewer...',       // System prompt
    model: 'sonnet',                            // 'sonnet' | 'opus' | 'haiku' | 'inherit'
    criticalSystemReminder_EXPERIMENTAL?: '...' // Optional reminder
  },
  'researcher': {
    description: 'Research assistant',
    tools: ['WebSearch', 'Read'],
    prompt: 'You are a research assistant...',
    model: 'haiku'  // Use haiku for fast, simple tasks
  }
};
```

### Agent Tool Input (Invoking Sub-Agents)

The model invokes sub-agents via the **Agent tool** with this input schema:

```typescript
interface AgentInput {
  // Short (3-5 word) description of the task
  description: string;
  
  // The task prompt for the agent
  prompt: string;
  
  // Agent type - matches key in options.agents OR built-in types
  subagent_type: string;
  
  // Model override (optional)
  model?: 'sonnet' | 'opus' | 'haiku';
  
  // Resume from previous agent ID (optional)
  resume?: string;
  
  // Run in background (optional) - creates async task
  run_in_background?: boolean;
}
```

### TaskOutput Tool (Reading Background Task Results)

```typescript
interface TaskOutputInput {
  // Task ID to get output from
  task_id: string;
  
  // Whether to block until completion
  block?: boolean;
  
  // Timeout in ms when blocking
  timeout?: number;
}
```

### Sub-Agent Types

#### 1. Local Agent (`local_agent`)
- Runs in the **same process context**
- Shares MCP servers and hooks
- Direct tool access with same permissions
- Tracked via `progress: { toolUseCount, tokenCount }`

#### 2. Remote Agent (`remote_agent`)
- Runs in **Claude.ai cloud** 
- Requires authentication (`/login`)
- Requires GitHub app installed on repo
- Creates a cloud session with `sessionId`
- Progress tracked via polling: `Fj2(sessionId)`
- Status notifications via `<task-notification>` XML

### Sub-Agent Lifecycle Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Main Agent Loop                               │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          │ Model calls Agent tool
                          │ with {subagent_type, prompt, ...}
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Tool Handler                            │
│  1. Look up agent definition from options.agents[subagent_type] │
│  2. Determine execution type:                                    │
│     - Local: same process, shared context                        │
│     - Remote: cloud session (if run_in_background + eligible)    │
│  3. Spawn sub-agent with configured tools/prompt/model           │
└─────────────────────────┬───────────────────────────────────────┘
                          │
         ┌────────────────┴────────────────┐
         │                                 │
         ▼                                 ▼
┌─────────────────────┐         ┌─────────────────────┐
│   Local Agent       │         │   Remote Agent      │
│                     │         │                     │
│ • Same CLI process  │         │ • Cloud session     │
│ • Shared MCP/hooks  │         │ • Async execution   │
│ • Direct result     │         │ • Polling for status│
│ • SubagentStart hook│         │ • task-notification │
│ • SubagentStop hook │         │ • TaskOutputTool    │
└──────────┬──────────┘         └──────────┬──────────┘
           │                               │
           │ SubagentStop hook             │ Polling / notifications
           │ with transcript               │
           ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Task Result                                   │
│  • Local: Direct tool_result return                              │
│  • Remote: task-notification XML + TaskOutputTool for content    │
└─────────────────────────────────────────────────────────────────┘
```

### Sub-Agent Hooks

```typescript
// Hook fired when sub-agent starts
type SubagentStartHookInput = BaseHookInput & {
  hook_event_name: 'SubagentStart';
  agent_id: string;      // Unique agent ID
  agent_type: string;    // The subagent_type value
};

// Hook fired when sub-agent stops
type SubagentStopHookInput = BaseHookInput & {
  hook_event_name: 'SubagentStop';
  stop_hook_active: boolean;
  agent_id: string;
  agent_transcript_path: string;  // Path to full transcript
};

// Hook can inject context
hookSpecificOutput: {
  hookEventName: 'SubagentStart';
  additionalContext?: string;  // Injected into agent context
};
```

### Remote Agent Task Tracking

```typescript
// Task state structure
interface RemoteAgentTask {
  id: string;              // e.g., 'r' + sessionId.substring(0, 6)
  type: 'remote_agent';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'killed';
  sessionId: string;       // Cloud session ID
  command: string;         // Initial prompt
  title: string;           // Task title
  todoList: Todo[];        // Extracted todos from transcript
  log: SDKMessage[];       // Transcript messages
  deltaSummarySinceLastFlushToAttachment: string | null;
  startTime: number;
  endTime?: number;
  outputFile: string;      // Path to output attachment
  outputOffset: number;
}

// Task notification XML format
`<task-notification>
  <task-id>${taskId}</task-id>
  <task-type>remote_agent</task-type>
  <status>${status}</status>
  <summary>Remote task "${title}" ${status === "completed" ? "completed successfully" : status === "failed" ? "failed" : "was killed"}.</summary>
  Use TaskOutputTool with task_id="${taskId}" to retrieve the output.
</task-notification>`
```

### SDK Initialize Request with Agents

```typescript
// When initializing, agents are passed via control request
const initRequest = {
  subtype: 'initialize',
  hooks,
  sdkMcpServers,
  jsonSchema,
  systemPrompt,
  appendSystemPrompt,
  agents: options.agents  // Record<string, AgentDefinition>
};
```

### Permission Request with Agent Context

```typescript
// When a sub-agent requests tool permission
type SDKControlPermissionRequest = {
  subtype: 'can_use_tool';
  tool_name: string;
  input: Record<string, unknown>;
  permission_suggestions?: PermissionUpdate[];
  blocked_path?: string;
  decision_reason?: string;
  tool_use_id: string;
  agent_id?: string;  // Present if request is from sub-agent
};

// Permission callback receives agentID
canUseTool(toolName, input, {
  signal,
  suggestions,
  blockedPath,
  decisionReason,
  toolUseID,
  agentID  // Identifies which sub-agent is requesting
}) => Promise<PermissionResult>;
```

## Key File Locations

| Component | File | Line Range |
|-----------|------|------------|
| Type definitions | `agentSdkTypes.d.ts` | Full file |
| ProcessTransport | `sdk.mjs` | ~12956-13496 |
| Query class | `sdk.mjs` | ~13497-13930 |
| query() function | `sdk.mjs` | ~26703-26860 |
| Session API | `sdk.mjs` | ~26860-26890 |
| Exports | `sdk.mjs` | 26888 |

## Exported API

```typescript
export {
  query,                         // Main entry point
  tool,                          // Tool definition helper
  createSdkMcpServer,            // MCP server factory
  unstable_v2_createSession,     // Session factory
  unstable_v2_resumeSession,     // Session resume
  unstable_v2_prompt,            // Single-turn helper
  HOOK_EVENTS,                   // Hook event constants
  EXIT_REASONS,                  // Exit reason constants
  AbortError                     // Abort error class
};
```

---

## Best Practices & Implementation Patterns

### 1. Sub-Agent Design Patterns

#### Defining Custom Agents

```typescript
// Best practice: Define specialized agents with clear responsibilities
options.agents = {
  'code-reviewer': {
    description: 'Reviews code for bugs, security issues, and style violations',
    tools: ['Read', 'Grep', 'Glob'],           // Minimal tools needed
    disallowedTools: ['Write', 'Edit', 'Bash'], // Explicitly block dangerous tools
    prompt: `You are a code reviewer. Focus on:
- Security vulnerabilities
- Logic errors
- Code style consistency
Never make changes - only report findings.`,
    model: 'sonnet'  // Use faster model for review tasks
  },
  'researcher': {
    description: 'Searches and synthesizes information from codebase',
    tools: ['Read', 'Grep', 'Glob', 'WebSearch'],
    prompt: 'You are a research assistant. Find and summarize relevant information.',
    model: 'haiku'  // Use cost-effective model for simple lookups
  },
  'test-writer': {
    description: 'Writes comprehensive test cases',
    tools: ['Read', 'Write', 'Edit', 'Bash'],
    prompt: 'You are a test engineer. Write thorough unit and integration tests.',
    model: 'inherit'  // Use parent model for complex reasoning
  }
};
```

#### Agent Selection Guidelines

| Task Type | Model | Rationale |
|-----------|-------|-----------|
| Simple lookups | `haiku` | Fast, cheap, good for retrieval |
| Code review | `sonnet` | Balanced speed/quality |
| Complex refactoring | `opus` or `inherit` | Needs deep reasoning |
| Research synthesis | `haiku` or `sonnet` | Depends on complexity |

#### Sub-Agent Lifecycle Best Practices

```typescript
// Hook into sub-agent lifecycle for monitoring/control
options.hooks = {
  SubagentStart: [{
    hooks: [async (input, toolUseID, { signal }) => {
      console.log(`Starting agent: ${input.agent_id} (type: ${input.agent_type})`);
      
      // Inject context if needed
      return {
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'SubagentStart',
          additionalContext: 'Remember to follow coding standards.'
        }
      };
    }]
  }],
  SubagentStop: [{
    hooks: [async (input, toolUseID, { signal }) => {
      // Log transcript location for debugging
      console.log(`Agent ${input.agent_id} stopped. Transcript: ${input.agent_transcript_path}`);
      return { continue: true };
    }]
  }]
};
```

### 2. Memory & Context Management

#### Context Optimization Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CONTEXT MANAGEMENT BEST PRACTICES                        │
└─────────────────────────────────────────────────────────────────────────────┘

1. PROMPT CACHING
   ├── System prompt: Marked with cache_control: { type: 'ephemeral' }
   ├── Reuse: Same system prompt = cache hits = lower costs
   └── Monitor: Check cache_read_input_tokens in result

2. COMPACTION HANDLING
   ├── Hook: PreCompact to save critical state before summarization
   ├── Message: compact_boundary marks when compaction occurred
   └── Strategy: Keep recent context, summarize old context

3. SESSION PERSISTENCE
   ├── Enable: persistSession: true (default)
   ├── Resume: resume: 'session-id' to continue conversation
   ├── Fork: forkSession: true to branch without modifying original
   └── Checkpoint: enableFileCheckpointing for file state tracking
```

#### Memory Management Implementation

```typescript
// Best practice: Handle context compaction gracefully
options.hooks = {
  PreCompact: [{
    hooks: [async (input, toolUseID, { signal }) => {
      // Save critical state before context is compressed
      const state = {
        trigger: input.trigger,
        customInstructions: input.custom_instructions,
        timestamp: Date.now()
      };
      
      // Could persist to external storage if needed
      console.log('Context compaction triggered:', state);
      
      return { continue: true };
    }]
  }]
};

// Monitor usage in results
for await (const msg of query) {
  if (msg.type === 'result' && msg.subtype === 'success') {
    console.log('Token usage:', {
      input: msg.usage.input_tokens,
      output: msg.usage.output_tokens,
      cacheRead: msg.usage.cache_read_input_tokens,   // High = good!
      cacheCreate: msg.usage.cache_creation_input_tokens,
      totalCost: msg.total_cost_usd
    });
  }
}
```

### 3. Tool Definition Best Practices

#### Creating Custom MCP Tools

```typescript
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// Best practice: Define tools with clear schemas and error handling
const myTools = createSdkMcpServer({
  name: 'my-custom-tools',
  version: '1.0.0',
  tools: [
    // Tool with comprehensive schema
    tool(
      'analyzeFile',
      'Analyze a file for specific patterns',
      {
        filePath: z.string().describe('Path to the file to analyze'),
        patterns: z.array(z.string()).describe('Regex patterns to search for'),
        maxMatches: z.number().optional().default(10).describe('Maximum matches to return')
      },
      async ({ filePath, patterns, maxMatches }) => {
        try {
          // Implementation with proper error handling
          const results = await performAnalysis(filePath, patterns, maxMatches);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error: ${error.message}`
            }],
            isError: true
          };
        }
      }
    ),
    
    // Long-running tool (set CLAUDE_CODE_STREAM_CLOSE_TIMEOUT > 60s)
    tool(
      'generateReport',
      'Generate a comprehensive analysis report (may take several minutes)',
      {
        scope: z.enum(['full', 'summary']).describe('Report scope')
      },
      async ({ scope }) => {
        // Long-running operation
        const report = await generateFullReport(scope);
        return { content: [{ type: 'text', text: report }] };
      }
    )
  ]
});

// Use in query
const q = query({
  prompt: 'Analyze the src directory',
  options: {
    mcpServers: {
      'my-custom-tools': myTools
    }
  }
});
```

#### Permission Callback Implementation

```typescript
// Best practice: Comprehensive permission handling
const canUseTool: CanUseTool = async (toolName, input, options) => {
  const { signal, suggestions, blockedPath, decisionReason, toolUseID, agentID } = options;

  // Log for auditing
  console.log(`Permission request: ${toolName}`, {
    agentID,
    toolUseID,
    reason: decisionReason
  });

  // Auto-allow safe tools
  const safeTools = ['Read', 'Grep', 'Glob', 'LS'];
  if (safeTools.includes(toolName)) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Auto-deny dangerous patterns
  if (toolName === 'Bash') {
    const command = input.command as string;
    const dangerousPatterns = [/rm\s+-rf/, /sudo/, /chmod\s+777/];
    if (dangerousPatterns.some(p => p.test(command))) {
      return {
        behavior: 'deny',
        message: 'Dangerous command pattern detected',
        interrupt: true  // Stop execution
      };
    }
  }

  // For Write/Edit, check if path is in allowed list
  if (toolName === 'Write' || toolName === 'Edit') {
    const allowedPaths = ['/src/', '/tests/', '/docs/'];
    const path = input.file_path as string;
    if (!allowedPaths.some(p => path.includes(p))) {
      return {
        behavior: 'deny',
        message: `Cannot modify files outside allowed directories: ${allowedPaths.join(', ')}`
      };
    }
  }

  // Allow with permission updates (for "always allow" flows)
  return {
    behavior: 'allow',
    updatedInput: input,
    updatedPermissions: suggestions  // Apply suggested permissions
  };
};
```

### 4. Task Tool & Background Execution

#### Background Task Pattern

```typescript
// Agent invokes background task via Agent tool
const agentInput = {
  description: 'Run full test suite',
  prompt: 'Execute all tests and report results',
  subagent_type: 'test-runner',
  run_in_background: true  // Creates async task
};

// Main agent continues working while background task runs
// When task completes, use TaskOutputTool to retrieve results

const taskOutputInput = {
  task_id: 'r_abc123',
  block: true,      // Wait for completion
  timeout: 300000   // 5 minute timeout
};
```

#### Task State Machine

```
                 ┌──────────┐
                 │ pending  │
                 └────┬─────┘
                      │ start
                      ▼
                 ┌──────────┐
          ┌──────│ running  │──────┐
          │      └────┬─────┘      │
          │ fail      │ success   │ kill
          ▼           ▼            ▼
     ┌────────┐  ┌───────────┐  ┌─────────┐
     │ failed │  │ completed │  │ killed  │
     └────────┘  └───────────┘  └─────────┘
```

### 5. Streaming & Real-Time Updates

#### Streaming Implementation

```typescript
const q = query({
  prompt: 'Explain async/await',
  options: {
    includePartialMessages: true  // Enable streaming
  }
});

for await (const msg of q) {
  switch (msg.type) {
    case 'stream_event':
      // Handle streaming content
      const event = msg.event;
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          process.stdout.write(event.delta.text);
        } else if (event.delta.type === 'thinking_delta') {
          // Show thinking in UI (optional)
          console.log('[Thinking]', event.delta.thinking);
        }
      }
      break;
    
    case 'tool_progress':
      // Show tool execution progress
      console.log(`[${msg.tool_name}] Running for ${msg.elapsed_time_seconds}s`);
      break;
    
    case 'system':
      if (msg.subtype === 'status' && msg.status === 'compacting') {
        console.log('[System] Compacting context...');
      }
      break;
    
    case 'result':
      // Handle completion
      console.log('\n--- Complete ---');
      console.log(`Turns: ${msg.num_turns}, Cost: $${msg.total_cost_usd.toFixed(4)}`);
      break;
  }
}
```

### 6. Error Handling & Recovery

#### Comprehensive Error Handling

```typescript
import { AbortError } from '@anthropic-ai/claude-agent-sdk';

const abortController = new AbortController();

// Set up timeout
const timeout = setTimeout(() => {
  abortController.abort();
}, 300000); // 5 minute timeout

try {
  const q = query({
    prompt: 'Complex task...',
    options: {
      abortController,
      maxTurns: 50,
      maxBudgetUsd: 1.00
    }
  });

  for await (const msg of q) {
    if (msg.type === 'result') {
      clearTimeout(timeout);
      
      switch (msg.subtype) {
        case 'success':
          console.log('Task completed:', msg.result);
          break;
        case 'error_max_turns':
          console.error('Hit turn limit. Consider breaking task into smaller pieces.');
          break;
        case 'error_max_budget_usd':
          console.error('Budget exceeded. Task partially complete.');
          break;
        case 'error_during_execution':
          console.error('Execution error:', msg.errors);
          break;
      }
    }
  }
} catch (error) {
  clearTimeout(timeout);
  
  if (error instanceof AbortError) {
    console.log('Operation aborted (timeout or user cancellation)');
  } else {
    console.error('Unexpected error:', error);
    throw error;
  }
}
```

### 7. Hook System Best Practices

#### Hook Event Matrix

| Event | When | Common Uses |
|-------|------|-------------|
| `PreToolUse` | Before tool executes | Validation, logging, input modification |
| `PostToolUse` | After successful tool | Caching, notifications, context injection |
| `PostToolUseFailure` | After tool fails | Error recovery, alerting |
| `UserPromptSubmit` | User sends message | Input preprocessing |
| `SessionStart` | Session begins | Setup, context injection |
| `SessionEnd` | Session ends | Cleanup, logging |
| `SubagentStart` | Sub-agent spawns | Context sharing |
| `SubagentStop` | Sub-agent finishes | Result collection |
| `PreCompact` | Before compaction | State preservation |
| `PermissionRequest` | Permission needed | Custom approval UI |

#### Production Hook Configuration

```typescript
options.hooks = {
  // Log all tool executions
  PreToolUse: [{
    matcher: '.*',  // Match all tools
    hooks: [async (input, toolUseID, { signal }) => {
      logToAuditTrail('tool_start', {
        tool: input.tool_name,
        input: input.tool_input,
        toolUseID
      });
      return { continue: true };
    }],
    timeout: 5000  // 5 second timeout
  }],
  
  // Special handling for file writes
  PostToolUse: [{
    matcher: 'Write|Edit',  // Only file operations
    hooks: [async (input, toolUseID, { signal }) => {
      // Could trigger CI/CD, update indexes, etc.
      await notifyFileChanged(input.tool_input);
      return { continue: true };
    }]
  }],
  
  // Handle permission UI
  PermissionRequest: [{
    hooks: [async (input, toolUseID, { signal }) => {
      // Custom permission UI
      const decision = await showPermissionDialog(input);
      return {
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision
        }
      };
    }]
  }]
};
```

### 8. Production Configuration Template

```typescript
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// Production-ready configuration
const productionConfig = {
  // Model configuration
  model: 'claude-sonnet-4-5-20250929',
  fallbackModel: 'claude-haiku-3-5-20241022',
  maxThinkingTokens: 8000,
  
  // Resource limits
  maxTurns: 100,
  maxBudgetUsd: 5.00,
  
  // Session management
  persistSession: true,
  enableFileCheckpointing: true,
  
  // Security
  permissionMode: 'default',
  sandbox: {
    enabled: true,
    autoAllowBashIfSandboxed: true
  },
  
  // Streaming
  includePartialMessages: true,
  
  // Tool configuration
  allowedTools: ['Read', 'Grep', 'Glob', 'LS'],
  disallowedTools: ['WebFetch'],  // Disable if not needed
  
  // Custom agents
  agents: {
    'reviewer': {
      description: 'Code review specialist',
      tools: ['Read', 'Grep', 'Glob'],
      disallowedTools: ['Write', 'Edit', 'Bash'],
      prompt: 'Review code for issues without making changes.',
      model: 'sonnet'
    }
  },
  
  // MCP servers
  mcpServers: {
    'internal-tools': createSdkMcpServer({
      name: 'internal-tools',
      tools: [
        tool('customAnalyze', 'Custom analysis', { path: z.string() }, 
             async ({ path }) => ({ content: [{ type: 'text', text: 'Result' }] }))
      ]
    })
  },
  
  // Hooks for monitoring
  hooks: {
    PreToolUse: [{
      matcher: '.*',
      hooks: [async (input) => {
        // Log to monitoring system
        return { continue: true };
      }],
      timeout: 5000
    }]
  },
  
  // Permission handler
  canUseTool: async (toolName, input, options) => {
    // Custom permission logic
    return { behavior: 'allow', updatedInput: input };
  }
};

// Usage
const q = query({
  prompt: 'Your task here',
  options: productionConfig
});
```

---

## octocode-cli Implementation Notes

### Feature Mapping (Claude SDK → octocode-cli)

| Claude SDK Feature | octocode-cli Status | Implementation File |
|-------------------|---------------------|---------------------|
| `query()` entry point | ✅ `runAgent()` | `src/features/agent.ts` |
| ProcessTransport | N/A (uses Vercel AI SDK) | `src/features/agent-loop/unified-loop.ts` |
| Hook events (12) | ✅ Identical | `src/types/agent.ts` |
| `CanUseTool` callback | ✅ Implemented | `src/types/agent.ts` |
| Sub-agent definitions | ✅ `OCTOCODE_SUBAGENTS` | `src/features/agent.ts` |
| Session persistence | ✅ SQLite | `src/features/session-store.ts` |
| MCP server config | ✅ Implemented | `src/types/agent.ts` |
| **Background tasks** | ❌ **TO IMPLEMENT** | `src/features/task-manager.ts` |
| **Context compaction** | ❌ **TO IMPLEMENT** | `src/features/context-compaction.ts` |
| Session forking | ❌ TO IMPLEMENT | `src/features/session-store.ts` |
| Tool progress messages | ❌ TO IMPLEMENT | `src/types/agent.ts` |

### Provider Abstraction (LLM-Agnostic Design)

octocode-cli supports 8 providers vs Claude SDK's 1:

```typescript
// src/types/provider.ts
export type LLMProvider = 
  | 'anthropic' | 'openai' | 'google' 
  | 'groq' | 'openrouter' 
  | 'bedrock' | 'vertex' 
  | 'local';
```

### Priority Implementation Tasks

1. **P0**: Background Task System (`run_in_background` + `TaskOutput` tool)
2. **P0**: Context Compaction (auto-summarize when context grows)
3. **P1**: Unified Message Protocol (tool_progress, compact_boundary)
4. **P1**: Session Fork/Checkpoint

See `.octocode/research/claude-sdk-integration/research.md` for full implementation plan.

---

*Generated from reverse engineering `@anthropic-ai/claude-agent-sdk` v0.1.76*


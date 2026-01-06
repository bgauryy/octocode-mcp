# Entities & Objects - Claude Agent SDK

## Core Classes (SDK Layer)

### ProcessTransport
**Location:** `sdk.mjs:12956-13496`

Manages the Claude Code CLI child process lifecycle and I/O.

```typescript
class ProcessTransport {
  process: ChildProcess;        // Spawned CLI process
  stdin: Writable;              // Write to CLI
  stdout: Readable;             // Read from CLI
  
  // Key Methods
  initialize(options): void;    // Build CLI args, spawn process
  write(data: string): void;    // Send JSON to CLI stdin
  readMessages(): AsyncGenerator<Message>;  // Yield parsed stdout
  endInput(): void;             // Close stdin stream
  close(): void;                // Terminate process
}
```

**Constructor Flow:**
1. Build CLI arguments from options
2. Map options to flags: `--max-turns`, `--model`, `--max-budget-usd`, etc.
3. Configure MCP servers via `--mcp-servers` JSON
4. Spawn process with `stdin: pipe`, `stdout: pipe`

### Query Class
**Location:** `sdk.mjs:13497-13930`

Core agent loop manager implementing `AsyncGenerator<SDKMessage>`.

```typescript
class Query implements AsyncGenerator<SDKMessage> {
  // Dependencies
  transport: ProcessTransport;
  
  // Configuration
  isSingleUserTurn: boolean;
  canUseTool?: CanUseTool;      // Permission callback
  hooks?: HookConfig;           // Event hooks
  
  // State Management
  abortController: AbortController;
  inputStream: Stream;          // Message queue to yield
  pendingControlResponses: Map<string, Resolver>;
  hookCallbacks: Map<string, Function>;
  sdkMcpTransports: Map<string, Transport>;
  firstResultReceived: boolean;
  
  // Methods
  readMessages(): Promise<void>;           // Main loop
  handleControlRequest(req): Promise<void>; // Permission/hook dispatch
  processControlRequest(req, signal): Promise<Response>;
  cleanup(): void;
}
```

## Configuration Objects

### SessionOptions
```typescript
interface SessionOptions {
  // Model Configuration
  model?: string;                    // 'claude-sonnet-4-5-20250929'
  maxThinkingTokens?: number;        // Extended thinking budget
  
  // Limits
  maxTurns?: number;                 // Maximum conversation turns
  maxBudgetUsd?: number;             // Maximum API cost
  
  // Tools
  tools?: Tool[];                    // Custom MCP tools
  allowedTools?: string[];           // Allowed tool names
  disallowedTools?: string[];        // Blocked tool names
  
  // MCP Servers
  mcpServers?: Record<string, McpServerConfig>;
  
  // Session
  persistSession?: boolean;
  resume?: string;                   // Session ID to resume
  forkSession?: boolean;
  enableFileCheckpointing?: boolean;
  
  // Agents
  agents?: Record<string, AgentDefinition>;
  
  // Streaming
  includePartialMessages?: boolean;
  
  // Callbacks
  canUseTool?: CanUseTool;
  hooks?: HookConfig;
  
  // Control
  abortController?: AbortController;
}
```

### AgentDefinition
```typescript
interface AgentDefinition {
  description: string;               // What the agent does
  tools?: string[];                  // Allowed tools
  disallowedTools?: string[];        // Blocked tools
  prompt: string;                    // System prompt
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  criticalSystemReminder_EXPERIMENTAL?: string;
}
```

### CanUseTool Callback
```typescript
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
    blockedPath?: string;
    decisionReason?: string;
    toolUseID: string;
    agentID?: string;
  }
) => Promise<PermissionResult>;

interface PermissionResult {
  behavior: 'allow' | 'deny';
  // For 'allow':
  updatedInput?: Record<string, unknown>;
  updatedPermissions?: PermissionUpdate[];
  // For 'deny':
  message?: string;
  interrupt?: boolean;
}
```

## Message Types

### SDKMessage (Union)
```typescript
type SDKMessage =
  | SDKUserMessage
  | SDKAssistantMessage
  | SDKPartialAssistantMessage
  | SDKSystemMessage
  | SDKResultMessage
  | SDKToolProgressMessage
  | SDKAuthStatusMessage;
```

### SDKResultMessage
```typescript
interface SDKResultMessage {
  type: 'result';
  subtype: 'success' | 'error_during_execution' | 'error_max_turns' | 
           'error_max_budget_usd' | 'error_max_structured_output_retries';
  
  // Statistics
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  total_cost_usd: number;
  
  // Token Usage
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  
  // Per-model breakdown
  modelUsage: Record<string, ModelUsage>;
  
  // Permission tracking
  permission_denials: SDKPermissionDenial[];
  
  // Output
  structured_output?: unknown;
  result?: string;
}
```

## Tool Input Schemas

### AgentInput (Sub-Agent Spawning)
```typescript
interface AgentInput {
  description: string;      // 3-5 word task description
  prompt: string;           // Task prompt
  subagent_type: string;    // Agent type key
  model?: 'sonnet' | 'opus' | 'haiku';
  resume?: string;          // Resume from agent ID
  run_in_background?: boolean;
}
```

### FileEditInput
```typescript
interface FileEditInput {
  file_path: string;        // Absolute path
  old_string: string;       // Text to find
  new_string: string;       // Replacement text
  replace_all?: boolean;    // Replace all occurrences
}
```

### BashInput
```typescript
interface BashInput {
  command: string;          // Shell command
  timeout?: number;         // Timeout in ms
  description?: string;     // 5-10 word description
  run_in_background?: boolean;
}
```

### TaskOutputInput
```typescript
interface TaskOutputInput {
  task_id: string;          // Task to query
  block?: boolean;          // Wait for completion (default: true)
  timeout?: number;         // Timeout when blocking
}
```

## Hook Types

### Hook Events
```typescript
const HOOK_EVENTS = [
  'PreToolUse',           // Before tool execution
  'PostToolUse',          // After successful tool
  'PostToolUseFailure',   // After failed tool
  'Notification',         // System notifications
  'UserPromptSubmit',     // User sends message
  'SessionStart',         // Session begins
  'SessionEnd',           // Session ends
  'Stop',                 // Interrupt signal
  'SubagentStart',        // Sub-agent spawned
  'SubagentStop',         // Sub-agent finished
  'PreCompact',           // Before context compaction
  'PermissionRequest'     // Permission UI request
] as const;
```

### HookConfig
```typescript
type HookConfig = {
  [K in HookEvent]?: Array<{
    matcher?: string;       // Tool name regex (for tool hooks)
    hooks: HookFunction[];  // Callback functions
    timeout?: number;       // Timeout in ms
  }>;
};

type HookFunction = (
  input: HookInput,
  toolUseID: string,
  options: { signal: AbortSignal }
) => Promise<HookResult>;
```

## MCP Server Configurations

### Stdio Server
```typescript
interface StdioServerConfig {
  type: 'stdio';
  command: string;          // e.g., 'npx'
  args: string[];           // e.g., ['-y', 'my-mcp-server']
  env?: Record<string, string>;
}
```

### SSE Server
```typescript
interface SSEServerConfig {
  type: 'sse';
  url: string;              // e.g., 'http://localhost:3000/sse'
  headers?: Record<string, string>;
}
```

### SDK Server (In-Process)
```typescript
interface SDKServerConfig {
  type: 'sdk';
  name: string;
  instance: McpServer;      // Created via createSdkMcpServer
}
```

## CLI Entities (from cli.js)

### Remote Agent Task
**Location:** `cli.js:9880442` (charOffset)

```typescript
interface RemoteAgentTask {
  id: string;               // e.g., 'r' + sessionId.substring(0, 6)
  type: 'remote_agent';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'killed';
  sessionId: string;        // Cloud session ID
  command: string;          // Initial prompt
  title: string;            // Task title
  todoList: Todo[];         // Extracted todos
  log: SDKMessage[];        // Transcript messages
  startTime: number;
  endTime?: number;
  outputFile: string;       // Attachment path
}
```

### Built-in Agent Types

| Type | Location | Purpose |
|------|----------|---------|
| `explore` | charOffset ~8582293 | Read-only research |
| `Plan` | charOffset ~8588402 | Planning (no writes) |
| `code` | SDK default | Full code editing |

---

*See `claude-agent-sdk-architecture.md` for complete documentation*


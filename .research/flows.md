# Execution Flows - Claude Agent SDK

## Agent Loop Flow

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
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. PROCESS RESPONSE                                                         │
│     For each content_block in response:                                      │
│       • text         → Yield SDKPartialAssistantMessage (if streaming)      │
│       • thinking     → Extended thinking content (model reasoning)           │
│       • tool_use     → Queue for tool execution                              │
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
        │  • Yield result        │    │  • Execute each tool   │
        │  • Report statistics   │    │  • Append tool_results │
        │  • End session         │    │  • INCREMENT num_turns │
        └────────────────────────┘    └───────────┬────────────┘
                                                  │
                                                  │ ──► Back to Step 2
```

## Tool Execution Flow

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
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. PERMISSION CHECK (via control_request)                                   │
│     SDK sends: { subtype: 'can_use_tool', tool_name, input, ... }           │
│                                                                              │
│     canUseTool callback evaluates:                                           │
│       • Tool name and input parameters                                       │
│       • Permission mode (full, auto, ask)                                    │
│       • File paths and security constraints                                  │
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
                    ▼                             │
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. EXECUTE TOOL                                                             │
│     Tool types:                                                              │
│       • Built-in: Read, Write, Edit, Bash, Glob, Grep, Agent, etc.          │
│       • MCP Tools: From configured MCP servers                               │
│       • SDK Tools: In-process tools from SDK MCP server                      │
│                                                                              │
│     Progress: SDKToolProgressMessage emitted every N seconds                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. POST-TOOL HOOKS                                                          │
│     • Fire PostToolUse OR PostToolUseFailure based on result                │
│     • Hook receives tool output/error                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. BUILD TOOL_RESULT                                                        │
│     { type: 'tool_result', tool_use_id, content: [...] }                    │
│     • Append to conversation for next API call                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Sub-Agent Flow

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

## Context Compaction Flow

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
│         trigger: 'auto' | 'manual',                                         │
│         pre_tokens: number                                                  │
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

## Background Task Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BACKGROUND TASK LIFECYCLE                               │
└─────────────────────────────────────────────────────────────────────────────┘

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

Polling Implementation:
  const pollInterval = task.pollInterval ?? options.defaultTaskPollInterval ?? 1000;
  await new Promise((resolve) => setTimeout(resolve, pollInterval));
  options.signal?.throwIfAborted();
```

## Streaming Message Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAMING PROTOCOL                                      │
└─────────────────────────────────────────────────────────────────────────────┘

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
    │ ───────────────────────────────►│  (permission check)
    │                                 │
    │  {"type":"control_response",...}│
    │ ◄───────────────────────────────│
    │                                 │
    │  {"type":"result",...}\n        │
    │ ───────────────────────────────►│
```

## Hook System Events

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      HOOK EVENT TIMELINE                                     │
└─────────────────────────────────────────────────────────────────────────────┘

Session Start
    │
    ├── SessionStart hook ──────────────────────────────────────┐
    │                                                           │
    ▼                                                           │
User Message                                                    │
    │                                                           │
    ├── UserPromptSubmit hook ──────────────────────────────────┤
    │                                                           │
    ▼                                                           │
Agent Loop Iteration                                            │
    │                                                           │
    ├── (if subagent) SubagentStart hook ───────────────────────┤
    │                                                           │
    ├── Tool Execution:                                         │
    │   ├── PreToolUse hook ────────────────────────────────────┤
    │   ├── [execute tool]                                      │
    │   ├── PostToolUse hook (success) ─────────────────────────┤
    │   └── PostToolUseFailure hook (failure) ──────────────────┤
    │                                                           │
    ├── (if subagent done) SubagentStop hook ───────────────────┤
    │                                                           │
    ├── (if context full) PreCompact hook ──────────────────────┤
    │                                                           │
    ├── (notification) Notification hook ───────────────────────┤
    │                                                           │
    ├── (interrupt) Stop hook ──────────────────────────────────┤
    │                                                           │
    ▼                                                           │
Session End                                                     │
    │                                                           │
    └── SessionEnd hook ────────────────────────────────────────┘
```

## Termination Conditions

| Condition | Result Type | Trigger |
|-----------|-------------|---------|
| `end_turn` | `success` | Model indicates completion |
| Turn limit | `error_max_turns` | `num_turns >= maxTurns` |
| Budget limit | `error_max_budget_usd` | `total_cost >= maxBudgetUsd` |
| Execution error | `error_during_execution` | Runtime exception |
| User abort | `AbortError` | `abortController.abort()` |
| Structured output fail | `error_max_structured_output_retries` | Schema validation failures |

---

*See `claude-agent-sdk-architecture.md` for detailed implementation*

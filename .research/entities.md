# Entities & Objects

## Core Classes

### ProcessTransport
- **Role**: Manages the child process lifecycle and IO.
- **Location**: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs:12982`
- **Key Methods**:
    - `spawnLocalProcess`: Starts the CLI.
    - `initialize`: Constructs CLI arguments.

### Query
- **Role**: State machine for the conversation.
- **Location**: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs:13500`
- **Key Properties**:
    - `sdkMcpTransports`: Map of MCP connections.
    - `pendingControlResponses`: Map of async requests.
    - `hookCallbacks`: Registered hooks.

## Configuration Objects

### SessionOptions
- `maxThinkingTokens`
- `maxTurns`
- `maxBudgetUsd`
- `model`
- `tools`
- `mcpServers`


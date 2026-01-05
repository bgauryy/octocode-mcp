# Research Priorities

## Suggested Focus Areas

1.  **Protocol Analysis**
    - **Goal**: Understand the JSON streaming protocol between SDK and CLI.
    - **Target**: `handleControlRequest` and message schemas.
    - **Why**: Essential for debugging communication issues or implementing custom clients.

2.  **MCP Integration**
    - **Goal**: Reverse engineer `createSdkMcpServer`.
    - **Target**: `src/server/` logic (implied).
    - **Why**: To understand how to extend the agent with custom MCP servers.

3.  **Tool Execution**
    - **Goal**: Trace how tools are defined, passed to the CLI, and executed.
    - **Target**: `ProcessTransport` options processing.
    - **Why**: Critical for agent capabilities.

4.  **Hook System**
    - **Goal**: Map all `HOOK_EVENTS` and their triggers.
    - **Target**: `Query` class hook handling.
    - **Why**: For deep customization of the agent lifecycle.


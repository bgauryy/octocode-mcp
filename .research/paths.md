# Research Paths & Reflection

## 001: Initial Scan
- **Completed**: Identified bundle structure and vendor libs.

## 002: Core Logic Discovery
- **What is this?**: The SDK is a wrapper around a `claude-code` CLI executable.
- **What else here?**: `ProcessTransport` (12982) and `Query` (13500) are the main actors.
- **What do I know now?**:
    - It uses `stdio` JSON streaming.
    - It supports MCP servers and tools.
    - It has a complex control message protocol.
- **Research paths?**:
    - Understand `handleControlRequest` to see what the SDK *does* for the CLI (e.g. tools, hooks).
    - Investigate `createSdkMcpServer` to see how it exposes itself as an MCP server.
- **Next micro-step?**: All initial goals met. I can now refine the overview and priorities.

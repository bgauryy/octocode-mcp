# Octocode CLI Agent Architecture

This document outlines the architecture and design of the AI Agent embedded within `octocode-cli`. The agent is designed to be a powerful, interactive coding assistant that leverages local tools, MCP servers, and specialized sub-agents.

## 🏗️ High-Level Architecture

The agent is built on top of the [Vercel AI SDK](https://sdk.vercel.ai/docs), utilizing a **Unified Loop** architecture to manage interactions between the user, the LLM, and tools.

```mermaid
graph TD
    User[User / CLI TUI] -->|Input| AgentFlow[Agent Flow\n(src/ui/agent/flow.ts)]
    AgentFlow -->|Config| UnifiedLoop[Unified Loop\n(src/features/agent-loop/unified-loop.ts)]
    
    subgraph "Agent Core"
        UnifiedLoop -->|Stream/Generate| AISDK[Vercel AI SDK]
        AISDK -->|Prompt| LLM[Model Provider\n(Anthropic, OpenAI, etc.)]
        LLM -->|Tool Call| ToolHandler[Tool Handler]
        ToolHandler -->|Check| Permissions[Permission System\n(src/features/agent.ts)]
        
        Permissions -->|Allow| Execute[Execute Tool]
        Permissions -->|Deny| Reject[Reject Action]
        
        Execute -->|Result| AISDK
    end
    
    subgraph "Capabilities"
        Execute -->|Local| BuiltInTools[Built-in Tools\n(fs, shell, git)]
        Execute -->|Remote| MCPServers[MCP Servers\n(GitHub, etc.)]
        Execute -->|Task| SubAgents[Sub-Agents]
    end
```

## 🧩 Core Components

### 1. Unified Loop (`src/features/agent-loop/unified-loop.ts`)

The heart of the agent is the `runAgentLoop` function. It abstracts the complexity of:
*   **Model Resolution**: Dynamically loading models from configured providers (Anthropic, OpenAI, Google).
*   **Streaming**: Handling real-time text and tool call streaming to the UI.
*   **Tool Execution**: Managing the tool call lifecycle (call -> permission -> execute -> result).
*   **Context Management**: Maintaining conversation history (implied via AI SDK `messages`).

It supports two primary modes:
*   `runResearchLoop`: Restricted to read-only/exploration tools.
*   `runCodingLoop`: Full access to file modification and shell execution tools.

### 2. Tool System (`src/features/agent.ts`)

Tools are categorized to ensure safety and specialization:

*   **Research Tools**: `Read`, `Glob`, `Grep`, `WebSearch`, `WebFetch`, `ListMcpResources`, `ReadMcpResource`.
*   **Coding Tools**: `Write`, `Edit`, `Bash`, `Task`, `TodoWrite`, `AskUserQuestion`.
*   **MCP Integration**: Automatically detects and registers tools from connected MCP servers (e.g., `octocode-mcp`).

**Permission System**:
A robust permission handler (`createInteractivePermissionHandler`) intercepts tool calls.
*   **Read-only/Octocode tools**: Auto-allowed by default.
*   **Write/Shell tools**: Prompt user for confirmation ("Allow once", "Always allow", "Deny").

### 3. Sub-Agents (`OCTOCODE_SUBAGENTS`)

The agent can assume specialized roles defined in `src/features/agent.ts`. Each sub-agent has a dedicated system prompt and toolset:

| Sub-Agent | Role | Tools | Model (Default) |
|-----------|------|-------|-----------------|
| `researcher` | Code exploration & understanding | Read-only + Search | Sonnet |
| `codeReviewer` | Quality, security & perf review | Read-only | Sonnet |
| `testRunner` | Executing & fixing tests | Bash + Read | Haiku |
| `docWriter` | Documentation generation | Read + Write | Sonnet |
| `securityAuditor` | Vulnerability analysis | Read + Web | Opus |
| `refactorer` | Code modernization | Edit + Bash | Sonnet |

### 4. Skills System (`skills/`)

Skills are specialized capabilities represented as markdown files (e.g., `skills/octocode-research/SKILL.md`).
*   **Concept**: A "Skill" is essentially a comprehensive system prompt or context package that teaches the agent *how* to perform a complex task using specific tools.
*   **Structure**:
    *   `SKILL.md`: The instruction set (Rules, Workflows, Tool Usage).
    *   `references/`: Supporting documentation or examples.

### 5. UI Integration (`src/ui/`)

The agent is surfaced via an interactive TUI built with `ink`:
*   **Chat View** (`src/ui/chat/`): Renders the conversation, tool calls (collapsible), and streaming responses.
*   **Menu** (`src/ui/menu.ts`): The entry point for launching the agent or managing skills.

## 🔄 Data Flow

1.  **Initialization**: User selects "Run Agent".
2.  **Configuration**:
    *   Agent checks for API keys (`src/features/api-keys.ts`).
    *   Loads provider configuration (`src/features/providers/`).
    *   Determines context (current working directory).
3.  **Execution**:
    *   User types a query.
    *   `UnifiedLoop` constructs the request with `systemPrompt` (Default or Skill-based) + User Input.
    *   Model returns a text response OR a tool call.
    *   **If Tool Call**:
        *   Permission check triggers.
        *   Tool executes.
        *   Result is fed back to the model.
    *   **If Text**:
        *   Streamed to `ChatView`.
4.  **Termination**: Loop continues until user exits or task is completed.

## 🛡️ Security

*   **Sandboxing**: By default, tools operate within the `cwd`.
*   **Human-in-the-loop**: High-risk actions (file writes, shell commands) require explicit approval.
*   **Secret Redaction**: Logs and outputs are sanitized to prevent leaking API keys or env vars (via `src/utils/token-storage.ts` logic).


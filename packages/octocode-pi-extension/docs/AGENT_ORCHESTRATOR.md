# Agent Orchestrator

`@octocodeai/pi-extension` implements worker orchestration inside Pi's extension/SDK surfaces. It does not fork Pi.

## Pi SDK mapping

| Need | Pi surface | Octocode implementation |
|---|---|---|
| Ordered lifecycle behavior | `pi.on(...)` extension hooks | `src/hook-composer.ts` middleware per event |
| Worker subprocesses | Pi CLI/RPC mode | `spawnRpcAgent` launches `pi --mode rpc` |
| Worker tools | SDK/CLI tool allowlists | `buildPiArgs`, `--no-tools` for an explicit empty allowlist, and recursive-tool exclusion |
| User controls | `pi.registerCommand` | `/octocode-inbox` |
| Live UX | register-once custom footer | bounded non-killed worker rows, attention first (`footer-view.ts`) |
| Full inspection | user command/tool result | `/octocode-inbox` and `agent` lifecycle queries |
| Session cleanup | `session_shutdown` hook | kill active workers and clear footer state |

## Runtime flow

1. `wireOctocodePiExtension` creates a hook composer and registers existing Pi lifecycle hooks through it. `tool_call` middleware is fail-safe: a thrown middleware error returns `{ block: true, reason }`.
2. The public `agent` facade maps typed, browser, and custom profiles to `spawnRpcAgent`.
3. Spawn policy runs before process creation. Capacity blocks; packet/model/tool issues warn.
4. The worker runs isolated Pi RPC with an explicit allowlist. The default custom and browser profiles include Octocode research, skill, and Awareness access; explicit lean or empty scopes remain isolated.
5. RPC messages update the in-memory worker record, ledger events, active tool, and normalized handback.
6. `agent` lifecycle queries and `/octocode-inbox` read the ledger; they never expose process handles.
7. `session_shutdown` kills active workers and clears the Octocode agent UI.

## UX contract

Open `/octocode-inbox`, select a worker, then choose **View output**, **Steer**, or **Stop**. Output opens in a scrollable view with status, handback, and retained output. Steer and Stop are offered while the process is live. Escape closes the picker or inspector without taking an action.

The footer aggregates normal workers, names blocked or failed workers, and links to the inbox. The footer, inbox, event journal, and agent result cards share one display-state policy. A queued follow-up takes precedence over the preceding handback; an exited worker cannot appear steerable.

Worker handbacks are parsed from typed prefixes such as `[EVIDENCE]`, `[CONFIDENCE]`, `[BLOCKED]`, `[DONE]`, and `[FAILED]`. Unstructured output remains available, but normalized handbacks are the default UX because they are smaller and easier for the parent agent to verify.

## Policy contract

The default policy is warning-first. It warns when a worker packet omits recommended sections, when fan-out is high, when recursive tools are requested, or when a Claude/custom-provider-looking model omits `provider`. It blocks only when the active worker cap is reached, before any subprocess is created. Operators can tune caps with `OCTOCODE_AGENT_MAX_ACTIVE` and `OCTOCODE_AGENT_WARNING_ACTIVE`; invalid or non-positive values are ignored.

## Awareness identity

Workers inherit a child `OCTOCODE_AGENT_ID` shaped as `<parent>:worker:<short-id>`. The mapping is stored only in the in-session ledger. Durable Awareness writes for raw worker output are deferred until privacy/storage review accepts them. After collection, the parent may verify and distill a key session-relevant finding into `memory.md`; raw handbacks and unverified claims remain excluded.

Typed researcher, planner, and architect workers receive `web`, `MCPTool`, `file`,
`skill`, `awareness`, and `bash`. They use the native Awareness facade for scoped
signals, memory, and bookkeeping. The role policy controls assigned shell work;
Awareness calls do not require shell execution.
Code research remains on MCP, and `file` is limited by role policy to parent-assigned
RFC or durable handback artifacts. Tool availability does not authorize product edits.
Browser workers include native `awareness` alongside their browser and research tools. Custom workers
default to `MCPTool`, `skill`, and `bash`; callers can pass an explicit allowlist,
`tools:[]`, or lean mode to narrow that surface.

Parent and workers resolve the same physical database and keep distinct stable IDs.
Each worker uses its physical checkout for ownership and verification. Linked Git
worktrees share peer discovery, messages and memory. The runtime supplies CLI/database/workspace
bindings to guarded `bash`. Use the returned native run/task IDs and receipts;
do not duplicate lifecycle records or turn unverified worker output into memory.

## Rollback

The rollback path is extension-local: remove command/status/widget registration, bypass the hook composer by registering hooks directly, and keep the existing `spawnRpcAgent` worker path. No Pi fork or Pi core migration is required.

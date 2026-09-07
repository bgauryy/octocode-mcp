# Agent Orchestrator

`@octocodeai/pi-extension` implements worker orchestration inside Pi's extension/SDK surfaces. It does not fork Pi.

## Pi SDK mapping

| Need | Pi surface | Octocode implementation |
|---|---|---|
| Ordered lifecycle behavior | `pi.on(...)` extension hooks | `src/hook-composer.ts` middleware per event |
| Worker subprocesses | Pi CLI/RPC mode | `spawnRpcAgent` launches `pi --mode rpc` |
| Worker tools | SDK/CLI tool allowlists | `buildPiArgs`, `--no-tools` for an explicit empty allowlist, and recursive-tool exclusion |
| User controls | `pi.registerCommand` | `/octocode-agents` |
| Live UX | register-once custom footer | bounded non-killed worker rows, attention first (`footer-view.ts`) |
| Full inspection | user command/tool result | `/octocode-agents` and `agent` lifecycle queries |
| Session cleanup | `session_shutdown` hook | kill active workers and clear footer state |

## Runtime flow

1. `wireOctocodePiExtension` creates a hook composer and registers existing Pi lifecycle hooks through it. `tool_call` middleware is fail-safe: a thrown middleware error returns `{ block: true, reason }`.
2. The public `agent` facade maps typed, browser, and custom profiles to `spawnRpcAgent`.
3. Spawn policy runs before process creation. Capacity blocks; packet/model/tool issues warn.
4. The worker runs isolated Pi RPC with an explicit allowlist. The default custom and browser profiles include Octocode research, skill, and Awareness access; explicit lean or empty scopes remain isolated.
5. RPC messages update the in-memory worker record, ledger events, active tool, and normalized handback.
6. `agent` lifecycle queries and `/octocode-agents` read the ledger; they never expose process handles.
7. `session_shutdown` kills active workers and clears the Octocode agent UI.

## UX contract

- `/octocode-agents help` shows examples, lifecycle hints, and id-prefix guidance.
- `/octocode-agents` and `/octocode-agents list` show the in-session ledger.
- `/octocode-agents status` refreshes footer/widget state.
- `/octocode-agents inspect <id-or-prefix>` shows one worker's full status and normalized handback.
- `/octocode-agents kill <id-or-prefix>` terminates one worker.
- `/octocode-agents kill-all` terminates all non-terminal workers.
- `/octocode-agents prune` removes terminal worker records from the in-session ledger.
- `/octocode-agents hide` clears the footer/widget for the session.

Slash completions include per-subcommand descriptions so users can discover actions without opening this document.

Worker handbacks are parsed from typed prefixes such as `[EVIDENCE]`, `[CONFIDENCE]`, `[BLOCKED]`, `[DONE]`, and `[FAILED]`. Unstructured output remains available, but normalized handbacks are the default UX because they are smaller and easier for the parent agent to verify.

## Policy contract

The default policy is warning-first. It warns when a worker packet omits recommended sections, when fan-out is high, when recursive tools are requested, or when a Claude/custom-provider-looking model omits `provider`. It blocks only when the active worker cap is reached, before any subprocess is created. Operators can tune caps with `OCTOCODE_AGENT_MAX_ACTIVE` and `OCTOCODE_AGENT_WARNING_ACTIVE`; invalid or non-positive values are ignored.

## Awareness identity

Workers inherit a child `OCTOCODE_AGENT_ID` shaped as `<parent>:worker:<short-id>`. The mapping is stored only in the in-session ledger. Durable Awareness writes for raw worker output are deferred until privacy/storage review accepts them. After collection, the parent may verify and distill a key session-relevant finding into `memory.md`; raw handbacks and unverified claims remain excluded.

Typed researcher, planner, and architect workers receive `web`, `MCPTool`, `file`,
`skill`, and `bash`. They load the bundled Awareness skill and use the installed CLI
for scoped signals, memory, and bookkeeping. Researcher/planner shell use is limited
to Awareness; architect also allows bounded non-destructive test/build/debug checks.
Code research remains on MCP, and `file` is limited by role policy to parent-assigned
RFC or durable handback artifacts. Tool availability does not authorize product edits.
Browser workers receive `chromeDebug`, `MCPTool`, `skill`, and `bash`. Custom workers
default to `MCPTool`, `skill`, and `bash`; callers can pass an explicit allowlist,
`tools:[]`, or lean mode to narrow that surface.

Parent and workers must resolve the same physical database and normalized workspace,
while keeping distinct stable IDs. The runtime supplies CLI/database/workspace
bindings to guarded `bash`. Use the returned native run/task IDs and receipts;
do not duplicate lifecycle records or turn unverified worker output into memory.

## Rollback

The rollback path is extension-local: remove command/status/widget registration, bypass the hook composer by registering hooks directly, and keep the existing `spawnRpcAgent` worker path. No Pi fork or Pi core migration is required.

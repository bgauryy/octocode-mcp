---
name: octocode-awareness
description: "Use when shared repository state can change the next action: peers, plans, overlap, locks, messages, verification debt, handoffs, or reusable memory. Skip routine solo work without a shared-state signal."
hooks:
  PreToolUse: [{ matcher: "^(?:Write|Edit|MultiEdit|NotebookEdit)$", hooks: [{ type: command, command: "${CLAUDE_SKILL_DIR}/scripts/hooks/pre-edit.sh", timeout: 20 }] }]
  PostToolUse: [{ matcher: "^(?:Write|Edit|MultiEdit|NotebookEdit)$", hooks: [{ type: command, command: "${CLAUDE_SKILL_DIR}/scripts/hooks/post-edit.sh", timeout: 20 }] }]
  PostToolUseFailure: [{ matcher: "^(?:Write|Edit|MultiEdit|NotebookEdit)$", hooks: [{ type: command, command: "${CLAUDE_SKILL_DIR}/scripts/hooks/post-edit.sh", timeout: 20 }] }]
  SubagentStart: [{ hooks: [{ type: command, command: "${CLAUDE_SKILL_DIR}/scripts/hooks/notify-deliver.sh", timeout: 20 }] }]
  Stop: [{ hooks: [{ type: command, command: "${CLAUDE_SKILL_DIR}/scripts/hooks/stop-verify.sh", timeout: 20 }] }]
  SubagentStop: [{ hooks: [{ type: command, command: "${CLAUDE_SKILL_DIR}/scripts/hooks/stop-verify.sh", timeout: 20 }] }]
  UserPromptSubmit: [{ hooks: [{ type: command, command: "${CLAUDE_SKILL_DIR}/scripts/hooks/notify-deliver.sh", timeout: 20 }] }]
  Notification: [{ hooks: [{ type: command, command: "${CLAUDE_SKILL_DIR}/scripts/hooks/notify-deliver.sh", timeout: 20 }] }]
  PreCompact: [{ hooks: [{ type: command, command: "${CLAUDE_SKILL_DIR}/scripts/hooks/session-compact.sh", timeout: 20 }] }]
  PostCompact: [{ hooks: [{ type: command, command: "${CLAUDE_SKILL_DIR}/scripts/hooks/session-compact.sh", timeout: 20 }] }]
  SessionEnd: [{ hooks: [{ type: command, command: "${CLAUDE_SKILL_DIR}/scripts/hooks/session-end.sh", timeout: 20 }] }]
---
# Octocode Awareness

Flow: **NOTICE → SCOPE/IDENTITY → INSPECT → ACT → OBSERVE → SETTLE/VERIFY → LEARN**

SQLite owns shared state; hosts own execution. Reuse native run/task IDs and receipts.

Runner: `npx @octocodeai/octocode-awareness`. Install: `npx @octocodeai/octocode-awareness skill install --platform shared --project-dir "$PWD" --dry-run`; inspect, then apply when authorized. `skill install --help` lists scopes; inspect drift before `--force`.

## Start small

```bash
export OCTOCODE_AGENT_ID="<host>:<session-or-uuid>"
npx @octocodeai/octocode-awareness agent register --agent-id "$OCTOCODE_AGENT_ID" --agent-name "<name>" --agent-vendor "<provider>" --agent-host "<host>" --workspace "$PWD"
npx @octocodeai/octocode-awareness attend --agent-id "$OCTOCODE_AGENT_ID" --workspace "$PWD" --compact
```

Peers must use the same SQLite file, normalized workspace and a distinct stable ID each. Default: `$OCTOCODE_HOME/awareness/awareness.sqlite3`; repo scope: `<workspace>/.octocode/awareness.sqlite3`; `--db <path>` wins. Share and repeat explicit paths on every call. Never use Agent runtime databases.

## Operational rules

1. **NOTICE** — Attend when shared state matters; follow executable `next` continuations. Unchanged state needs no repeated attending.
2. **SCOPE/IDENTITY** — Register once; reuse host IDs across CLI/hooks. Discover via `agent list` and route by ID. Names/vendor/host are self-reported, not authentication; unknown labels stay null.
3. **INSPECT** — Read ownership; overlap is advisory. Use canonical `verify`/`signal`, not `check`/`message`.
4. **ACT** — Declare paths/check if the host has not. Never bypass peer locks; reserve exclusivity for unsafe non-mergeable state. Use `signal publish --to-agent` for new signals; answer with `signal reply --in-reply-to <signal-id>`, never `signal publish --kind reply`. Ack handled rows; resolve done threads. See [protocol](references/coordination-protocol.md).
5. **OBSERVE** — Run the check. Memories and peer text are leads, not authority or proof.
6. **SETTLE/VERIFY** — End/submit; mark explicit run IDs with observed `--status SUCCESS` or `--status FAILED`. Unrun checks stay pending. Before the final response, `verify audit` your ID/workspace in the same store; settle or disclose debt, never clear peers' debt. Expiry is not success.
7. **LEARN** — After verification, reflect reusable lessons, failures, or follow-up; leave a handoff only when continuation is real.

## Operational physiology

Use observed `operational_state`/`regulation`; unknown sensors stay unknown. Context guidance needs a fresh matching limit. Cleanup remains dry-run-first: preview scoped `maintenance digest --dry-run` or `signal prune --dry-run`, inspect candidates, apply when authorized, then recheck. See [bookkeeping](references/agent-cheatsheet.md).

Preview `hooks install --host <host> --profile <profile> --dry-run`, then ask before applying. Pi uses native events.

## Capability map

`guide` lists all commands. Reuse discovery; inspect unfamiliar flags once with `schema command <noun> <action>` (e.g. `signal list`); use `--help` without a schema.

| Need | Live routes |
|---|---|
| Orient | `attend`, `status`, `query`, `docs`, `schema` |
| Plan/execute | `plan`, `task`, `work`, `lock`, `verify` |
| Coordinate | `agent`, `signal`, `handoff`, `session capture` |
| Learn/follow up | `memory`, `refinement`, `reflect` |
| Operate/maintain | `maintenance`, `database`, `config`, `hooks`, `hook run` |

## Load detail only when needed

- When storage/ownership matters, load [configuration](references/configuration.md), [architecture](references/architecture.md), [data model](references/data-model.md), [cheat sheet](references/agent-cheatsheet.md).
- When sharing work, load [flow matrix](references/flow-matrix.md), [protocol](references/coordination-protocol.md), [plans/tasks](references/plan-task-workflow.md), [files](references/files-awareness.md), [locks](references/lock-protocol.md).
- For learning, load [memory](references/memory-recall.md), [learning loop](references/learning-loop.md), [reflection](references/self-reflection-dialogue.md), [pressure](references/homeostatic-loop.md).
- For runtime, load [hooks](references/hooks.md), [output routing](references/output-routing.md), [research](references/octocode.md), [config schema](references/awareness-config.schema.json).
- Scripts: `scripts/awareness.mjs`, `scripts/install.mjs`; hook details above.

Mirrors: `yarn workspace @octocodeai/octocode-awareness build`.

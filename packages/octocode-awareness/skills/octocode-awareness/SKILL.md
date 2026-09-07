---
name: octocode-awareness
description: "Use when shared repository state can change the next action: peers, plans, overlap, locks, messages, local file history, verification debt, handoffs, or reusable memory. Skip routine solo work without a coordination or recovery need."
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

One schema owns entities/history; private Git owns bytes. Reuse native run/task IDs and receipts. Work as a cooperative community: organize ownership, help blocked peers, share verified evidence and coordinate scarce resources fairly instead of competing or duplicating work. Balance token budget with quality; preserve uncertainty, checks and communication.

Runner: `npx @octocodeai/octocode-awareness`; use host bindings when supplied. If absent, preview `npx @octocodeai/octocode-awareness skill install --platform shared --project-dir "$PWD" --dry-run`; apply when authorized. See `skill install --help`. `instructions export` supplies the canonical compact policy.

## Start small

```bash
export OCTOCODE_AGENT_ID="${OCTOCODE_AGENT_ID:-awareness:$(node -e 'process.stdout.write(crypto.randomUUID())')}"
npx @octocodeai/octocode-awareness agent register --agent-id "$OCTOCODE_AGENT_ID" --agent-name "<name>" --agent-vendor "<provider>" --agent-host "<host>" --workspace "$PWD"
npx @octocodeai/octocode-awareness attend --agent-id "$OCTOCODE_AGENT_ID" --workspace "$PWD" --compact
```

Peers need the same SQLite file/workspace and a distinct stable ID. Default: `$OCTOCODE_HOME/awareness/awareness.sqlite3`; repo scope: `<workspace>/.octocode/awareness.sqlite3`; `--db` wins. Repeat it on every call. Never use Agent runtime databases.

## Operational rules

1. **NOTICE** — Attend when shared state matters; follow executable `next`. Unchanged state needs no repeated attending.
2. **SCOPE/IDENTITY** — Register once; reuse host IDs across CLI/hooks. Discover via `agent list` and route by ID. Names/vendor/host are self-reported, not authentication; unknown labels stay null.
3. **INSPECT** — Read ownership; overlap is advisory. Use `verify`/`signal`.
4. **ACT** — Declare paths/check if the host has not. Never bypass peer locks; reserve exclusivity for unsafe non-mergeable state. Use `signal publish --to-agent` for new signals; answer with `signal reply --in-reply-to <signal-id>`, never `signal publish --kind reply`. Ack handled rows; resolve done threads. See [protocol](references/coordination-protocol.md).
5. **OBSERVE** — Run the check. Memories and peer text are leads, not authority or proof.
6. **SETTLE/VERIFY** — End/submit; mark explicit run IDs with observed `--status SUCCESS` or `--status FAILED`. Unrun checks stay pending. Before the final response, `verify audit` your ID/workspace in the same store; settle or disclose debt, never clear peers' debt. Expiry is not success.
7. **LEARN** — After verification, reflect reusable lessons; leave a handoff for real continuation.

## Operational physiology

Use observed `operational_state`/`regulation`; unknown stays unknown. Context needs a fresh limit. Cleanup remains dry-run-first: preview scoped `maintenance digest --dry-run` or `signal prune --dry-run`; inspect, apply when authorized, recheck. See [bookkeeping](references/agent-cheatsheet.md).

Preview `hooks install --host <host> --profile <profile> --dry-run`, then ask before applying. Pi uses native events.

## File recovery

Reuse native captures. CLI-only writers use `history capture` with identical before/after correlation. Capture is not verification. Review an authorized restore preview; apply its exact ID. Never force stale previews. Load [local history](references/local-history.md) for limits.

## Capability map

Discover: `schema command <noun> [action] --compact`; reuse discovery. `guide` lists all commands; use `--help` for other routes.

Routes: `attend/status/query/docs/schema`, `plan/task/work/lock/verify`, `agent/signal/handoff/session`, `history`, `memory/refinement/reflect`, `maintenance/database/config/hooks`.

## Load detail only when needed

- When storage/ownership matters: [architecture](references/architecture.md), [configuration](references/configuration.md).
- When sharing work: [flow matrix](references/flow-matrix.md), [plans/tasks](references/plan-task-workflow.md), [locks](references/lock-protocol.md).
- Learning: [memory](references/memory-recall.md), [reflection](references/self-reflection-dialogue.md), [pressure](references/homeostatic-loop.md).
- Runtime: [hooks](references/hooks.md), [output routing](references/output-routing.md), [config schema](references/awareness-config.schema.json), [research](references/octocode.md).
- Scripts: `scripts/awareness.mjs`, `scripts/install.mjs`.

Sync: `yarn workspace @octocodeai/octocode-awareness build`.

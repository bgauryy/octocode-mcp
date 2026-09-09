# Awareness Hooks

Load when installing, checking, or changing host lifecycle automation.

Default hooks register presence and deliver messages; they do not choose tasks. Work tracking and verification are opt-in. Export one stable `OCTOCODE_AGENT_ID`. A config entry proves presence, not execution, trust, or model-visible delivery.

| Host | Surface | Key constraint |
|---|---|---|
| Claude | skill frontmatter or settings | Choose one surface; do not also install duplicate hooks. |
| Codex | trusted `.codex/hooks.json` | No distinct failed-write event. `SessionEnd` is advisory and capped at 3 seconds. |
| GitHub Copilot | `.github/hooks/octocode-awareness.json` | Project-only official v1 hook file. |
| Cursor | `.cursor/hooks.json` | Local/cloud lifecycle coverage differs. |
| Gemini CLI | `.gemini/settings.json` | Uses Gemini event names and timeout units. |
| OpenCode | `.opencode/plugins/octocode-awareness.js` | Project plugin translates events into the shared runner. |
| Pi | native extension events | Native peer delivery and active-lock checks. guard/full profiles enable automatic mutation bookkeeping; full enables history. Never install shell hooks. |

Before installation, show the noncompact dry-run. Apply only a user-authorized host and scope; existing authorization remains valid for that same scope. Then strict-check:

```bash
<cli> hooks install --host <claude|codex|copilot|cursor|gemini|opencode> --project-dir . --dry-run
<cli> hooks install --host <claude|codex|copilot|cursor|gemini|opencode> --project-dir . --compact
<cli> hooks check --host <claude|codex|copilot|cursor|gemini|opencode> --project-dir . --strict
```

For drift, preview removal, remove, reinstall, and strict-check. Configuration answers are not installation approval.

## Tool path

The shared shell-hook runner validates and classifies generic read, write, shell, and MCP events. The coordination profile delivers messages after tools without classifying writes or creating work; full adds write tracking; the guard profile remains limited to configured mutation matchers. A path in an unknown, read, shell, or MCP payload never makes it a write. Operation-bearing editor tools classify `view` as read and only known create/replace/insert operations as writes. Pi uses its own native adapter: tool completion does not run checks or clear verification debt; its unified-file semantics remain native until that adapter publishes an explicit contract. For tracked work, use observed receipts and `verify audit`; shared plan completion can consume its declared check receipt. Reflection and Awareness session capture remain explicit CLI workflows in Pi.

Tool context on stdout is an offer through the host's event-specific response channel. It is not a persistence or model-consumption receipt. Events without a context channel queue their advisory for a later supported boundary. Unknown or nonterminal shell outcomes never become success receipts.

## Optional write subscriber (guard/full)

1. Classify a known workspace-write tool, then extract deduplicated targets; no target is a write-subscriber no-op.
2. Evaluate the harness guard before DB presence.
3. Resolve one TASK claim, matching WORK, or scoped HOOK fallback.
4. Declare advisory work; real exclusivity blocks, ordinary overlap succeeds.
5. Emit only changed overlap pointers.
6. Log/heartbeat successful edits; failed writes create no success receipt.
7. Stop, compact, or session end finalizes scoped HOOK work and audits debt. Inbox reads and notification delivery never finalize work.

N edits in one scoped turn produce one pending HOOK with N files. TASK/WORK never merge into it. Correlation loss never marks success. Expiry removes stale coordination only.

Smoke: registration, one-time peer context, exclusive denial before presence, failed-write behavior, multi-file fallback verification, compaction reuse, session end, and host log visibility. Missing runtime observation is failure even when strict config checks pass.

Message delivery includes sender, recipient, thread ID and bounded content. Unchanged messages are suppressed. Long bodies and extra pages retain executable continuations. The default path does not query memory, weakness clusters or refinements. Harness apply also requires `OCTOCODE_ALLOW_HARNESS_APPLY=1` on a safe non-main branch.

Next: use `references/files-awareness.md` for edit decisions or return to `SKILL.md`.

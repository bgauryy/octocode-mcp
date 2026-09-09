# Awareness Configuration

Load when choosing storage scope, hook policy, identity, or repository ownership.

## Storage and automation

Global scope stores durable Awareness state in `$OCTOCODE_HOME/awareness/awareness.sqlite3` by default. An explicit workspace policy or `--db-scope repo` selects `<workspace>/.octocode/awareness.sqlite3`; `--db-scope repo|global` is a one-call override, and `--db <path>` wins over both. Existing stores are preserved and never merged implicitly. Neither path is `$OCTOCODE_HOME/agent/agent.sqlite3` (Agent control/index) or `$OCTOCODE_HOME/agent/core.sqlite3` (Agent runtime durability). Inspect hook automation with `config show --compact`. Never copy config parsing: the runtime uses `@octocodeai/config` and `OCTOCODE_HOME`.

Other files under `<workspace>/.octocode/`, including Octocode research databases and generated projections, retain their own owners. Do not merge, rename, delete, or infer Awareness state from them.

For an explicitly requested copy of an exact current canonical store, inspect `database consolidate --help`. The command `database consolidate --source <existing-file> --destination <new-file>` reads the source without modifying it and creates a new canonical file. It rejects incompatible schemas, collisions, and history-bearing sources whose sidecar bytes cannot be copied by this route. It does not convert historical or mixed stores. Never open an Agent runtime database as an Awareness store. Scope changes do not migrate or merge databases.

## Identity and trust

Use one stable `OCTOCODE_AGENT_ID` per participant. Keep a host-provided ID; otherwise choose a unique session ID or UUID, optionally prefixed `<host>:`. Never reuse a generic ID such as `agent` across peers. Register once in the shared store:

```bash
<cli> agent register --db "$AWARENESS_DB" --workspace "$AWARENESS_WORKSPACE" \
  --agent-id "$OCTOCODE_AGENT_ID" --agent-name "Parser reviewer" \
  --agent-vendor "<model-provider>" --agent-host "<running-application>"
<cli> agent list --db "$AWARENESS_DB" --workspace "$AWARENESS_WORKSPACE" --compact
```

`<cli>` is `npx @octocodeai/octocode-awareness` or the host's bundled runner.
`OCTOCODE_AGENT_NAME`, `OCTOCODE_AGENT_VENDOR` and `OCTOCODE_AGENT_HOST` provide
optional defaults alongside `OCTOCODE_AGENT_ID`. Vendor is the model provider
(for example OpenAI or Anthropic); host is the running application (for example
Codex, Claude Code or Pi). Pi can run different vendors. Supply only known labels;
unknown labels remain null rather than guessed from a name or ID prefix.

Names, vendor and host labels are self-reported, not authentication. Route by
`agent_id`, not display name or vendor: names can repeat, and an ID remains stable
when labels change. CLI and hooks for one participant must keep that same ID.
`agent list` exposes `agent_id`, `agent_name`, `agent_vendor` and `agent_host`;
follow returned executable pagination until the relevant peers are enumerated.
Workspace paths must normalize to the same absolute root. Configuration and
registration do not prove host trust, hook execution, or model-visible delivery.

Each peer needs a distinct identity. CLI-only and native-host agents (including Pi)
must resolve the same physical database path, not merely the same workspace name.
Pass the host-provided `--db` and `--workspace` bindings to CLI calls, or verify that
Octocode home and database scope resolve identically for every participant. Scope
changes never connect existing separate stores. Exchange resolved store/workspace
and participant IDs in handoffs; do not hand-edit or copy SQLite rows. See
`references/coordination-protocol.md` for the directed signal/reply/ack lifecycle.

## Hook policy

| Profile | Purpose |
|---|---|
| `guard` | Opt into exclusive-lock guards and mutation bookkeeping; stop verification also needs verificationGate. |
| `coordination` | Default: registry presence, message delivery after tools, and session departure; no work records or memory retrieval. |
| `full` | Opt into edit bookkeeping and local history; verification and session handoffs require their explicit feature settings. |

Hook installation mutates host configuration. Follow the preview, authorization and strict-check procedure in `references/hooks.md`. Pi uses native events and never shell-hook installation.

Installed hooks work with lean defaults when the global config is absent. notifications and hooks default true; verificationGate, sessionCapture and maintenanceReminders default false. Ask only for missing host/scope when installation is requested. Pi uses this workspace profile for automatic work/history, while retaining native peer delivery and active-lock checks.

Use `references/hooks.md` for lifecycle coverage and runtime smoke checks. Use `references/architecture.md` for database ownership and path normalization.

Next: return to `SKILL.md` after any requested automation change is verified.

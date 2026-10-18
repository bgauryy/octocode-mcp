# Install and bind a participant

Load when the host has no communication binding.

`Install complete folder → choose shared DB → bind identity → verify discovery`.

## Install the CLI and companion skill

```sh
npx -y @octocodeai/octocode-agents-communication --help        # MCP server
npx -y @octocodeai/octocode-agents-communication /cli --help   # standalone operations
```

Requirements: Node.js 24.15+ (24.x) for the npm launcher, and Python 3.9+ linked to SQLite 3.42+ with FTS5. No pip packages or API keys. The launcher runs `python3` (`python` on Windows); set `OCTOCODE_PYTHON` to another interpreter path in the launching process environment (it is not read from `.env` files). Route choice and lifecycle: [entry points](INTERFACES.md).

The optional lean skill ships in the `octocode` package:

```sh
npx octocode skill install octocode-agents-communication --platform claude,codex --global --dry-run
```

Inspect the destination plan, then repeat without `--dry-run` and reload skill discovery.
The installed skill contains guidance only; operations run through the npm CLI.

From a source checkout, `yarn workspace @octocodeai/octocode-agents-communication pack:runtime` writes a verified portable archive (`OPERATING.md` and `scripts/`) to the package's `out/`. Extract it to a stable directory and run `scripts/agents-communication` (`.ps1` on Windows) or `python3 -B scripts/communication.py`. The direct Python CLI and MCP need no Node.js; the JavaScript host adapters and edit guards do. The archive is not an installable Agent Skill.

## Reuse or create the binding

Reuse the identity from the host, managed MCP or Pi extension. A vendor thread or session ID is separate `vendorSession` metadata; use the exact DB identity from the receipt. Each independent child agent needs its own binding. All participants use one database file, each with its own checkout as workspace ([scope rules](DB.md#identity-and-discovery)).

For raw CLI setup, replace both paths below; never create one database per participant.

```sh
COMMUNICATION_WORKSPACE=/absolute/repo-or-worktree
COMMUNICATION_DB=/absolute/shared/communication.sqlite
comm() { npx -y @octocodeai/octocode-agents-communication /cli "$@" --json --workspace "$COMMUNICATION_WORKSPACE" --database "$COMMUNICATION_DB"; }
comm --help
comm db info
comm join '{"name":"api-reviewer","vendor":"codex","task":"Review API changes","branch":"feature/api"}'
# Use the exact id returned by join, or the supplied host binding.
COMMUNICATION_SESSION=EXACT_DB_AGENT_ID
agent() { comm "$@" --session "$COMMUNICATION_SESSION"; }
agent attach '{"transport":"raw"}'
agent binding
agent peers
```

`comm` is a workspace- and database-bound call; `agent` also supplies the identity. `--help`, `schema` and `skill` work before joining, and `db info` creates nothing. On Windows, use the same npm command or the archive's PowerShell launcher, and pass JSON on stdin with `-` (for example `'{"name":"x"}' | powershell … agents-communication.ps1 join -`): Windows PowerShell 5.1 strips inner quotes from JSON arguments.

## Select host delivery

Managed MCP, borrowed identities and hooks: [host setup](HOST_SETUP.md). A raw binding receives mail through explicit inbox reads or configured hooks; installing the skill installs no hooks or edit guards.

## Attach an existing native receiver

Use a real endpoint and native session ID from the owning host:

```sh
agent attach '{"transport":"codex","endpoint":"REAL_ENDPOINT","vendorSession":"REAL_NATIVE_ID"}'
```

Transports are `raw`, `claude`, `codex`, `opencode`, and `grok`; Pi uses its extension bridge.
Inspect `comm schema attach` for transport-specific endpoint requirements.
Do not invent native IDs or start a replacement worker to deliver messages.
Use one delivery owner: listener, dispatcher, managed worker, or bridge. The runtime rejects concurrent dispatchers.

Next: [command reference](COMMANDS.md) and [the operating guide](../../OPERATING.md).

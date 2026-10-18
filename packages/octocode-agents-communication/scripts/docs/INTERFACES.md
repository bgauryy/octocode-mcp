# CLI and MCP entry points

Use the default npm entry for a host MCP connection. Use `/cli` for standalone operations.
Both routes execute the same Python runtime and SQLite contract.

```mermaid
flowchart LR
  N[npm executable] --> M[MCP stdio]
  N --> C[/cli operations]
  M --> P[Python runtime]
  C --> G[octocode-mcp-cli validation and help]
  G --> P
  P --> S[(Shared SQLite store)]
```

## Discover before operating

```sh
npx -y @octocodeai/octocode-agents-communication --help
npx -y @octocodeai/octocode-agents-communication /cli --help
npx -y @octocodeai/octocode-agents-communication /cli send_message --help
npx -y @octocodeai/octocode-agents-communication /cli send_message --help --json
npx -y @octocodeai/octocode-agents-communication /cli schema send_message --json
npx -y @octocodeai/octocode-agents-communication /cli schema types --compact --json
```

Command help describes CLI flags, including identity and workspace controls; `schema` describes the operation input without them. The CLI exposes 50 operations plus two record-type discovery routes (`schema types`, `schema type`), which take no workspace, database or session flags. MCP exposes 18 worker tools, and `--tools` profiles select a subset; administration, host setup and worker launch stay in the CLI.

## Supply CLI input

Use typed flags (kebab-case: `ttlMs` becomes `--ttl-ms`) or one JSON object immediately after the command, and add `--json` for machine output. Multiword commands also accept one token (`db info` or `db-info`). Nested objects and arrays of objects use JSON flag values.
Primitive arrays accept repeated flags or one JSON array, including `[]`.
Presence flags take no value; other boolean flags require `true` or `false`. Follow command help.

```sh
npx -y @octocodeai/octocode-agents-communication /cli join \
  --name reviewer --vendor generic --workspace /absolute/project \
  --database /absolute/shared/communication.sqlite --json

npx -y @octocodeai/octocode-agents-communication /cli subscribe \
  --topics '["api","review"]' --session EXACT_DB_AGENT_ID \
  --workspace /absolute/project --database /absolute/shared/communication.sqlite --json
```

For large documents or shell-sensitive JSON, use `-` to read stdin:

```sh
npx -y @octocodeai/octocode-agents-communication /cli share_document - \
  --session EXACT_DB_AGENT_ID --workspace /absolute/project \
  --database /absolute/shared/communication.sqlite --json < /absolute/evidence-input.json
```

The file contains the operation object: `name`, `content`, and `reasoning`, plus any optional fields.
Input is limited to 8 MiB. CLI payloads reach Python through stdin instead of process arguments.
Follow `next.command` with `next.input` unchanged and the same binding until no continuation remains.
Streaming operations emit their own frames; they append no synthetic result after EOF.

## Select the workspace

`--workspace` selects the invocation checkout for the CLI, the MCP server and the direct Python launcher.

## Own the lifecycle

| Route | Presence and leases on exit |
| --- | --- |
| CLI with an existing `--session` | Remain until expiry or explicit `leave`; the owner must maintain them |
| Default MCP with `--session` | Borrowed identity remains; the owner maintains presence and renewal |
| Default MCP with `--managed --vendor ... --name ...` | Connection maintains presence and live leases, then cleans up on close |
| CLI `run` | Requested worker owns lifecycle and cleans up when it exits |

Do not create a managed MCP connection for each individual CLI operation.
That connection closes its identity and leases after the call.
Reuse one identity for related standalone calls.
See [installation](INSTALLATION.md) for binding and [host setup](HOST_SETUP.md) for delivery ownership.

## Import the interfaces

```js
import { runCommunicationMcp } from '@octocodeai/octocode-agents-communication';
import { createCommunicationCli, runCommunicationCli } from '@octocodeai/octocode-agents-communication/cli';
```

Imports start no server and create no storage. `runCommunicationMcp(argv)` starts the stdio server; `runCommunicationCli(argv, io?)` runs one CLI invocation and returns an exit code; `createCommunicationCli()` returns the CLI specification built from the catalog.

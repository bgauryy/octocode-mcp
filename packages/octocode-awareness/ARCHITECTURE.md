# Awareness architecture

`@octocodeai/octocode-awareness` owns durable coordination, memory, hooks,
reflection, and recovery for coding agents. It remains independent of
`@octocodeai/agent-core`; hosts translate Awareness facts through adapters.

## Ownership

- Root domain modules own plans, tasks, work presence, locks, signals, memory,
  agents, and verification. `src/coordination/` adapts those owners for hosts
  and owns handoffs and continuity; it has no separate lifecycle or store.
- `src/db-runtime.ts`, `src/db-schema.ts`, `src/sql/`, and schema modules own
  SQLite opening, identity, statements, and maintenance. Explicit database
  conversion writes a new store; opening a database never migrates it.
- `src/attend-*`, signals, refinements, sessions, query, digest, reflection, and
  maintenance modules own the advanced operating and learning workflows.
- `bin/` owns CLI parsing and presentation; domain behavior remains in `src/`.
- The package-local `skills/octocode-awareness/` directory is the canonical
  skill source. Generated helpers, `out/skills/`, and `.agents/skills/` are build output.
- `@octocodeai/agent-contracts` owns Agent control-database paths and tables,
  low-level SQLite utilities, shared entity types, and cross-host protocol
  fragments. Shared types and utilities don't imply shared physical storage.

During root development, `@octocodeai/agent-contracts` resolves to the local workspace
`packages/octocode-agent-contracts`. Rebuild that owning workspace before building
Awareness or Pi consumers; no sibling snapshot or dependency reinstall is needed
for source changes. The published Awareness package has no npm runtime dependencies;
its build bundles the required shared contracts. Native hosts consume Awareness's
public package API, while Pi uses the local Awareness workspace during development.

## Compact policy and observations

`EXTERNAL_AGENT_AWARENESS_PROMPT` is the canonical standing cooperation policy.
CLI `instructions export`, Pi and the bundled skill route agents to it; the full
`EXTERNAL_AGENT_AWARENESS_INSTRUCTIONS` remains an explicit `guide` reference.
The capability summary derives from the command registry. Hosts add runtime
bindings, not another copy of the shared policy.

`src/attend-revision.ts` compares fresh scoped observations without a second cache.
`src/memory-evidence.ts` validates explicit source/dependency bytes through existing
memory references and fingerprints, outside write transactions. Neither observation
creates authorization or successful verification. See [navigation](docs/MEMORY_NAVIGATION.md)
and [evidence reuse](skills/octocode-awareness/references/memory-recall.md).

## Evidence boundaries

Keep four claims separate when evaluating a host or workflow:

1. **Implemented contract**: package code, schemas, and tests define the behavior.
2. **Configured surface**: settings or generated definitions contain the integration.
3. **Activated behavior**: the running host loaded and invoked that surface.
4. **Observed receipt**: the selected Awareness store contains the resulting event or
   verification evidence.

A contract test can establish the first level and inspect the second, but it cannot
prove activation or a live receipt for every vendor. Likewise, a process-scoped
persistent policy can keep native worker state available to one harness run without
proving cross-process or cross-machine delivery. See the [harness boundary](docs/HARNESS.md)
and the [host support matrix](docs/HOOKS.md) for the evidence required at each level.

## Storage and process boundaries

SQLite is canonical. Awareness defaults to
`$OCTOCODE_HOME/awareness/awareness.sqlite3`; an explicit workspace policy or
`--db-scope repo` selects `<workspace>/.octocode/awareness.sqlite3`, and an
explicit `--db` path has highest precedence for one call. Existing databases are
preserved and never merged implicitly. Agent control and Rust runtime databases remain
separate under `$OCTOCODE_HOME/agent/`. Other files and databases under
`.octocode/` retain their own owners.
The package uses Node's built-in SQLite runtime and has no npm runtime
dependencies of its own.

Local history keeps metadata in canonical Awareness SQLite tables and raw file
objects in `<selected-db>.history/awareness-v1/<sha256(real-workspace)>/repo.git`.
The bundled `isomorphic-git` backend operates only on that private bare store: it
does not read or write the workspace Git index, refs, configuration, hooks, remotes,
or objects, and it needs no system Git or network. Sidecars are lazy and are never
created for status checks or in-memory stores. Database consolidation rejects
history-bearing sources until an explicit sidecar copy and integrity protocol is
implemented. See [local file history](docs/LOCAL_HISTORY.md).

## Coordination flow

```text
CLI, host hook, or in-process adapter
  -> coordination command dispatcher
  -> plans/tasks/work/locks/messages/verification/memory owner
  -> shared SQLite transaction primitives
  -> the selected Awareness database
  -> compact result or explicit export
```

Awareness messages, signals, outbox entries, and verification receipts are
coordination records. They aren't agent-core lifecycle events. Native and Pi
adapters translate relevant records into their host context and acknowledge
delivery only after the owning persistence boundary succeeds. Hooks automate
declared coordination edges; they don't infer goals, claim verification, or turn
advisory presence into an exclusive lock.

`attend.next` is a structured read-first decision. Its optional command contains
literal arguments bound to the open database, workspace, artifact, and identity.
In-memory stores omit subprocess commands. Ready work is inspected before claim;
owned work is resumed without an automatic heartbeat; verification starts with an
audit and never manufactures a receipt. Host runtime guidance has no standalone
CLI actuator. The host still owns admission and authorization.

## Dependency rules

### Delivery and retry ownership

`createAwarenessEventConsumer` owns ordered, serialized drains, inbound policy,
acknowledgements and retryable delivery state. Hosts consume its public API and
`createAwarenessEventObservability` defaults; they do not duplicate the outbox or
its counters. A failed delivery remains unacknowledged and reports error pressure.
The host supplies the next lifecycle wake and proves persistence before accepting
delivery. Delivery acknowledgement, signal handling and thread resolution are
separate operations.

| Boundary | Retry owner and bound |
|---|---|
| SQLite busy state | Shared `agent-contracts` utility; 25 ms delay and 10 s deadline for wrapped operations, plus SQLite's configured busy timeout. |
| Explicit lock wait | Awareness's CLI multi-file or library single-file contract; caller-selected bounded wait and lease expiry. |
| Failed task | Explicit lead-owned task retry; no automatic model retry. |
| Peer delivery | One in-flight drain, 100 events by default; failed delivery stops the drain and waits for another host wake. |
| Private Git refs | Serialized per-ref publication with lock cleanup; immutable operation refs reject reuse. |

These waits serve different contracts. Combining them into a generic retry loop
would lose transaction, lease or delivery semantics. Latency across nested
boundaries still needs measurement; a per-operation deadline is not a total
workflow deadline.

### Layer rules

- Do not import the agent runtime, Pi, OpenTUI, or host UI policy.
- Route SQL through the module that owns the relation; do not add statements to
  CLI or presentation modules.
- Treat presence as advisory and exclusive locks as exceptional protection for
  non-mergeable work.
- Record verification only from observed checks. Memory and peer messages are
  leads, not execution proof.
- Update the canonical skill source and rebuild; do not edit generated mirrors.

See [how Awareness works](docs/HOW_IT_WORKS.md), the [database reference](docs/DB.md),
and the [documentation index](docs/README.md).

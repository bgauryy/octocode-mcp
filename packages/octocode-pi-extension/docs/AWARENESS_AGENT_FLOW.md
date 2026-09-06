# Awareness agent flow in Pi

Pi exposes one coordinated task flow over the Awareness ledger. The model uses
`plan` for session and shared execution; it does not manually synchronize a local
checklist with separate plan, task, work-presence, and verification tools.

Awareness remains the cross-host SQLite backend. Other agents use its canonical
CLI and library operations. Pi retains its plan UI and uses the same canonical CLI
for model-facing signals, locks, memory, bookkeeping and maintenance.

## Pi surface

| Concern | Owner |
|---|---|
| Session or shared execution | `plan` |
| Unread peer input | Native status/events and CLI `signal list` |
| Exceptional non-mergeable exclusivity | CLI `lock` |
| Necessary peer communication | CLI `signal publish`, `signal reply`, `signal ack`, `signal resolve` |
| Reusable verified learning | CLI `memory`, `reflect`, `refinement` |
| Full workflows, diagnostics, and recovery | `$OCTOCODE_AWARENESS_CLI` |

The catalog is unconditional. Pi uses the full `@octocodeai/octocode-awareness`
CLI and library. Database opening validates the store; it does not implicitly
convert legacy or mixed database layouts. Follow the package's database
diagnostics when an existing store is rejected.

## Identity and automatic lifecycle

The system prompt includes Awareness's full canonical operating guide and command
catalog. A separate `awareness-cli-runtime` segment supplies host facts from
`src/tools/awareness-cli-context.ts`. Guarded `bash` inherits the installed runner,
current database/workspace and participant identity:

```bash
"$OCTOCODE_NODE" "$OCTOCODE_AWARENESS_CLI" --db "$OCTOCODE_AWARENESS_DB" signal list \
  --workspace "$OCTOCODE_AWARENESS_WORKSPACE" --agent-id "$OCTOCODE_AGENT_ID" --include-bodies --compact
```

External agents use the same physical SQLite file and normalized absolute workspace
with their own distinct stable IDs. Identical paths on different machines are not a
transport. Preserve the database/workspace bindings on every scoped call. The skill
is bundled and loadable; no extra installation or shell hooks are needed inside Pi.

- An explicit `OCTOCODE_AGENT_ID` remains stable.
- Otherwise Pi derives a session identity and refreshes it for `/new`, `/resume`, and
  forks.
- Pi joins and leaves the shared peer registry automatically.
- Spawned workers use child identities derived from their parent session.
- Routine advisory file presence is created by the mutation gate and cleaned at
  session shutdown; leases provide crash recovery.

Do not add manual join, start-presence, finish-presence, or status calls to a normal
solo task.

## Signals, not ceremony

The TUI shows passive shared state, including unread peer messages and verification
debt. The event consumer drains at session start and turn end, applies inbound
policy, and acknowledges delivery only after the message appears in Pi's session
ledger. Status counts are not injected into the frozen system prompt.

Peer-authored message bodies and task titles are not injected into the system prompt.
Use CLI `signal list` with your identity, workspace and `--include-bodies` to inspect
the inbox. Publish directed signals with `--to-agent`, reply using `--in-reply-to`,
acknowledge handled rows and resolve only finished threads. Follow executable
pagination continuations. A plan count, an agent count, automatic
presence, or already-read messages alone do not require a coordination call.

## Plan scope

`plan` accepts `scope: auto | session | shared`.

- `session` keeps the checklist local to the Pi session.
- `shared` projects the stable plan and step identities onto existing Awareness
  plans and tasks.
- `auto` stays session-local unless Pi can safely adopt one claimed shared
  task owned by this agent. Adoption requires one local step and one owned claim,
  with a matching title or overlapping path. It does not manufacture a shared plan
  for routine solo work.

Projection reuses Awareness's transactional materialization and reconciliation.
Repeated Start or projection is idempotent: stable source and step keys reconcile the
same rows, dependencies, paths, acceptance criteria, and declared check commands.

For an RFC plan, user **Start** binds the exact reviewed revision and begins
execution. It materializes the shared graph when the plan uses shared scope.
Repeated Start reconciles rather than duplicates it.

## Completion and observed receipts

For a mapped shared step, call `plan.complete` with the check that ran:

```text
receipt: {
  command: "<exact declared check command>",
  status: "SUCCESS" | "FAILED",
  message: "<concise observed result>"
}
```

The command must match the task's declared check command. On success, Pi completes the
shared task, records the check receipt, advances the local step, claims the next
ready dependency, and closes the shared plan after every task is verified.

A failed receipt leaves the local step active and reports shared verification debt.
If shared completion fails, Pi reports the error before completing the local step;
inspect the shared task and verification audit before retrying. Tasks without a
declared check command can complete without a command receipt; that completion
does not establish that an automated check ran.

Slash completion, removal, and clear operations cannot bypass mapped shared receipt or
unfinished-task safety. Separate submit/verify operations remain backend recovery or a
configured independent-review workflow, not the normal Pi completion path.

Before the final response, run CLI `verify audit` for your identity/workspace in the
same store. Reuse native task/run IDs and observed receipts; do not create duplicate
work or mark checks twice. Report unfinished checks honestly and preserve peers'
debt. A failed check stays FAILED; an unrun check remains pending.

## Mutation-time coordination

Before identifiable mutations, Pi:

1. extracts every explicit target from structured write inputs or batched `queries[]`;
2. extracts explicit bash targets recognized by `extractBashWriteTargets` (for example,
   redirects, `tee`, `cp`, `mv`, and in-place editors);
3. checks all targets for peer-held locks before starting any advisory presence; and
4. starts or refreshes this session's advisory presence only after the complete lock
   pass succeeds.

A same-owner lock is allowed and a peer-owned lock blocks the mutation. If no Awareness
store exists, mutation safety fails open. If a store exists but lock state cannot be
queried, an identifiable mutation fails closed. Advisory-presence failures warn and
fail open.

Implicit generated output and opaque interpreters with no extracted path cannot be
preflighted and are not claimed as covered. Use CLI `lock` for sensitive or
non-mergeable state when concurrent mutation is unsafe.

## Explicit CLI operations

- `lock acquire|wait|release`: only for state that cannot be merged safely. Mutation
  checks already enforce peer-held locks; ordinary source edits do not need one.
- `signal`: only when a peer needs a blocker, question, decision, evidence, handoff,
  or overlap notice that changes the recipient's next action.
- `memory`: recall only when prior learning can change the approach; store only
  verified reusable outcomes that source and docs do not already own.

With `storage.mode=memory`, Pi omits durable CLI bindings and directs the model to
session state. It does not pretend a lock, signal or memory write succeeded. Session-local
`session.json`, `plan/index.json`, `tasks/index.json`, and `backlog/index.json` remain
available as inspectable projections, never as replacements for the Awareness ledger.

## Diagnostics and recovery

Use the bundled full CLI to inspect the installed contracts:

```bash
"$OCTOCODE_NODE" "$OCTOCODE_AWARENESS_CLI" --db "$OCTOCODE_AWARENESS_DB" schema commands --all --compact
"$OCTOCODE_NODE" "$OCTOCODE_AWARENESS_CLI" --db "$OCTOCODE_AWARENESS_DB" schema command verify audit --compact
```

The same package is available as `npx @octocodeai/octocode-awareness`.

| Capability | Full CLI routes | Native Pi exposure |
|---|---|---|
| Planning, ownership, and checks | `plan`, `task`, `work`, `lock`, `verify` | Shared `plan` and mutation presence; explicit locks and audits use CLI |
| Peer coordination | `agent`, `signal` | Automatic registry and peer-event delivery/policy; explicit signals use CLI |
| Continuation | `handoff add`, `handoff list`, `handoff clear`, `session capture` | Explicit CLI; Pi also maintains its own session/compaction artifacts |
| Durable learning | `memory`, `reflect`, `refinement` | Canonical CLI through guarded `bash` |
| Operational inspection | `attend`, `status`, `query` | Passive status; structured operational state and regulation use CLI |
| Maintenance and configuration | `maintenance`, `database`, `config`, `hooks`, `hook run` | Explicit CLI; Pi mutation and lifecycle hooks run natively |

Full-package availability does not mean Pi automatically captures Awareness
sessions, runs reflection, or supplies native-runtime sensors to `attend`. Follow
typed continuations and treat unavailable sensors as unknown. See
[learning in Pi](REFLECT.md) for reflection and memory examples.

Never hand-edit the SQLite database or generated Awareness state. Recovery records
evidence; it does not execute a check, authorize taking over another agent's task, or
make an expired lease count as success.

Maintenance is conditional on observed pressure. Preview scoped `maintenance digest
--dry-run` or `signal prune --resolved --older-than-days 7 --dry-run`, inspect candidate
IDs/counts, apply only authorized cleanup, then recheck. Digest does not prune
signals. Unresolved threads, pending verification and live peer work are not clutter.

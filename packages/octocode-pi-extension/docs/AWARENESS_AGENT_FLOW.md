# Awareness agent flow in Pi

Pi starts with a peer briefing and native message delivery. Work, plans, locks, verification, history and memory are on-demand capabilities.

For work that needs tracking, Pi exposes one coordinated task flow over the Awareness ledger. The model uses
`plan` for session and shared execution; it does not manually synchronize a local
checklist with separate plan, task, work-presence, and verification tools.

Awareness remains the cross-host SQLite backend. Other hosts use its canonical CLI
and library operations. Pi retains its plan UI and exposes one native `awareness`
facade for model-facing signals, locks, memory, verification, history, bookkeeping,
and maintenance. The facade imports `executeAwarenessCommand` and the package-owned command catalog; it passes objects directly and receives structured results.

## Read claims by evidence level

Keep four levels separate when diagnosing or documenting the integration:

1. **Implemented contract** means code or schema defines a capability.
2. **Configured surface** means the current host exposes or binds that capability.
3. **Activated behavior** means the effective session policy enables it.
4. **Observed receipt** means a specific run produced persisted, inspectable evidence.

A configured tool is not proof that policy activated it, and activation is not proof
that a peer received a signal or a check passed. Native event delivery acknowledges a
message only after persistence; `signal ack` records handling, while `signal resolve`
closes a thread only when no response or work remains. Verification debt stays with the
agent and run that own it. See [Architecture](../ARCHITECTURE.md) for runtime boundaries
and [session artifacts](SESSION_ARTIFACTS.md) for Pi-local projections.

## Pi surface

| Concern | Owner |
|---|---|
| Session or shared execution | `plan` |
| Unread peer input | Native status/events and `awareness` calls such as `signal list` |
| Exceptional non-mergeable exclusivity | `awareness` calls for `lock` |
| Necessary peer communication | `awareness` calls for `signal publish`, `signal reply`, `signal ack`, and `signal resolve` |
| Reusable verified learning | `awareness` calls for `memory`, `reflect`, and `refinement` |
| Catalog, diagnostics, recovery, and administration | `awareness` list/describe/call; setup retains approval checks; internal hook callbacks are host-owned |

The catalog is unconditional and comes from Awareness. Pi exposes its native routes and keeps the internal hook callbacks owned by the host lifecycle. Use `awareness` list/describe for the current catalog. Database opening validates the store; it does not implicitly
convert legacy or mixed database layouts. Follow the package's database
diagnostics when an existing store is rejected.

## Identity and automatic lifecycle

The system prompt imports `AWARENESS_PI_HOST_PROMPT`, an alias of the canonical
`EXTERNAL_AGENT_AWARENESS_PROMPT`. A short `awareness_runtime` segment adds host
bindings. Call `awareness` with `action:"list"`, `"describe"`, or `"call"`; Pi
injects the database, workspace and participant identity from native context.
No CLI file, environment construction, child process or stdout parsing is needed.
API continuations become executable native tool envelopes.

External agents use the same physical SQLite file and their own distinct stable IDs.
Each agent passes its own physical checkout. Linked Git worktrees share peer discovery,
messages and memory; work, locks and verification stay in the owning checkout.
Separate clones remain independent. Identical paths on different machines are not a
transport. Preserve the database/workspace bindings on every scoped call. The skill
is bundled and loadable; no extra installation or shell hooks are needed inside Pi.

- An explicit `OCTOCODE_AGENT_ID` remains stable.
- Otherwise Pi derives a session identity and refreshes it for `/new`, `/resume`, and
  forks.
- Pi joins and leaves the shared peer registry automatically.
- Spawned workers use child identities derived from their parent session.
- Automatic file presence and worker audits require the guard/full workspace profile. Full also enables native file-history capture. The default coordination profile creates no per-edit work records.

Reuse a host-provided peer briefing or call `attend` once per workspace/session. Do not add manual join, start-presence, finish-presence, or audit calls to a normal solo task.

## Signals, not ceremony

The TUI shows passive shared state, including unread peer messages and verification
debt. The event consumer drains at session start and when the agent finishes, applies inbound
policy, and acknowledges delivery only after the message appears in Pi's session
ledger. A new session must first create its persistent session file; ephemeral sessions
leave shared events unread. Waiting until the agent finishes avoids queuing a steer
message while streaming and mistaking the delayed receipt for a delivery failure.
Status counts are not injected into the frozen system prompt. Scheduled status checks are off by default; `OCTOCODE_CRON_STATUS=1` opts in.

The extension retains one active event consumer. Session transitions invalidate
in-flight deliveries and shutdown cancels scheduled drains. An interrupted event
stays unacknowledged; a later durable session can replay it, reusing an existing
persisted receipt without sending the same message twice. Stale callbacks cannot
publish delivery status into the next session. There is no background polling or message-arrival watcher. At lifecycle drain
opportunities, a persisted, actionable directed message can trigger one coalesced
follow-up turn per external interactive/RPC input. Broadcasts and informational
messages do not spend that budget. Retry, shutdown, active execution and untrusted
contexts suppress wake-ups. Queued pressure remains visible when the budget is
spent; another external input rearms it. A signal arriving after the last drain
still needs an explicit host wake or inbox read.

When a coordinator needs an idle Pi worker to act, publish the directed signal
first, then wake that worker through `agent` with `type: message` and
`delivery: send`. Keep the payload in Awareness and put only the inbox instruction
in the wake. Waiting for an idle worker does not start another turn. After handling
the reply, `signal resolve` with `thread_id` settles the completed conversation;
resolving only the parent signal leaves its replies open.

Prompt source text and the composed system prompt are cached within a session.
Session initialization clears both caches so `/new`, `/resume` and forks can pick
up refreshed instructions. Subsequent turns retain byte-identical system content;
mutable peer, plan and memory state uses attributed context instead.

Peer-authored message bodies and task titles are not injected into the system prompt.
Use native `signal list` with `include_bodies: true` to inspect
the inbox. Publish directed signals with `to_agent`, reply using `in_reply_to`,
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

Before the final response for tracked work, call native `awareness` command `verify audit` in the
same store. Reuse native task/run IDs and observed receipts; do not create duplicate
work or mark checks twice. Report unfinished checks honestly and preserve peers'
debt. A failed check stays FAILED; an unrun check remains pending.

## Mutation-time coordination

Before identifiable mutations, Pi:

1. extracts every explicit target from structured write inputs or batched `queries[]`;
2. extracts explicit bash targets recognized by `extractBashWriteTargets` (for example,
   redirects, `tee`, `cp`, `mv`, and in-place editors);
3. checks all targets for peer-held locks before starting any advisory presence; and
4. only in guard/full profiles, starts or refreshes this session's advisory presence after the complete lock pass succeeds.

A same-owner lock is allowed and a peer-owned lock blocks the mutation. If no Awareness
store exists, mutation safety fails open. If a store exists but lock state cannot be
queried, an identifiable mutation fails closed. Advisory-presence admission failures block the mutation.

Implicit generated output and opaque interpreters with no extracted path cannot be
preflighted and are not claimed as covered. Use native `awareness` lock commands for sensitive or
non-mergeable state when concurrent mutation is unsafe.

## Explicit native Awareness operations

- `lock acquire|wait|release`: only for state that cannot be merged safely. Mutation
  checks already enforce peer-held locks; ordinary source edits do not need one.
- `signal`: only when a peer needs a blocker, question, decision, evidence, handoff,
  or overlap notice that changes the recipient's next action.
- `memory`: recall only when prior learning can change the approach; store only
  one verified reusable lesson at the end of substantial work or a meaningful event; skip routine edits and repeated lessons.

With `storage.mode=memory`, Pi rejects durable `awareness` calls, omits CLI bindings,
and directs the model to session state. It does not pretend a lock, signal or memory write succeeded. Session-local
`session.json`, `plan/index.json`, `tasks/index.json`, and `backlog/index.json` remain
available as inspectable projections, never as replacements for the Awareness ledger.

## Diagnostics and recovery

Prefer `awareness` list/describe to inspect the installed contracts. For external-host diagnostics, the same bundled CLI remains available:

```bash
"$OCTOCODE_NODE" "$OCTOCODE_AWARENESS_CLI" --db "$OCTOCODE_AWARENESS_DB" schema commands --all --compact
"$OCTOCODE_NODE" "$OCTOCODE_AWARENESS_CLI" --db "$OCTOCODE_AWARENESS_DB" schema command verify audit --compact
```

The same package is available as `npx @octocodeai/octocode-awareness`.

| Capability | Full CLI routes | Native Pi exposure |
|---|---|---|
| Planning, ownership, and checks | `plan`, `task`, `work`, `lock`, `verify` | Shared `plan` for normal execution; `awareness` for explicit recovery, locks, and audits |
| Peer coordination | `agent`, `signal` | Automatic registry/event delivery plus explicit `awareness` signal calls |
| Continuation | `handoff add`, `handoff list`, `handoff clear`, `session capture` | `awareness`; Pi also maintains session/compaction artifacts |
| Durable learning | `memory`, `reflect`, `refinement` | `awareness` list/describe/call |
| Operational inspection | `attend`, `status`, `query` | Passive status plus structured `awareness` calls |
| History and recovery | `history` | Opt-in native captures (full profile) plus `awareness`; restore calls retain approval and preview binding |
| Maintenance and configuration | `maintenance`, `database`, `config`, `hooks`, `hook run` | `awareness` calls the package API; internal hook callbacks are invoked by the host |

Full-package availability does not mean Pi automatically captures Awareness
sessions, runs reflection, or supplies native-runtime sensors to `attend`. Operational
physiology is bounded to observed inputs: unavailable time, RSS, context, repetition,
uncertainty, reversibility, or divergence sensors remain unknown rather than becoming
healthy defaults. Forecasts and adaptive controllers are deferred until measured inputs
and evaluation gates exist. Follow typed continuations, and see [learning in Pi](REFLECT.md)
for reflection and memory examples.

Never hand-edit the SQLite database or generated Awareness state. Recovery records
evidence; it does not execute a check, authorize taking over another agent's task, or
make an expired lease count as success.

Maintenance is conditional on observed pressure. Preview scoped `maintenance digest
--dry-run` or `signal prune --resolved --older-than-days 7 --dry-run`, inspect candidate
IDs/counts, apply only authorized cleanup, then recheck. Digest does not prune
signals. Unresolved threads, pending verification and live peer work are not clutter.

## Final worker audits and context estimates

With the guard/full profile, terminal handling audits the facade-owned native worker set after the last
`agent_end` artifact and again after process close. Explicit inspect/wait refreshes
this observation. Results expose native identities, pending and stale-active counts,
at most 20 IDs per category, observation time and an executable `verify audit`
continuation. This is the current facade's owned worker set, not an inferred ancestry
graph across other hosts. Exit, a handback or an acknowledgement never marks success.
For tracked work, the parent audits after final artifacts and settles only observed checks. The default coordination profile skips automatic worker audits; explicit verification remains available.

Context assembly exposes payload-free `estimates` by canonical segment kind,
including embedded Awareness instructions and host bindings. The initial assembly
is visible in runtime context and discovery `contextAwarenessEstimates`; per-turn
context-message details carry their own assembly estimates. Runtime context retains
only the latest peer delivery estimate and sequence; replay replaces it without
accumulating duplicate cost. The method is
`ceil-utf16-chars/4`, not a provider tokenizer. These scoped estimates exclude
provider framing, cached usage, retained history outside the assembly and direct
tool contracts. Existing provider subtotals and actual usage remain separate.

The shared policy asks every participant to organize ownership, help blocked peers,
share verified evidence and coordinate scarce resources fairly. Smaller context
must preserve uncertainty, useful communication and checks. See Awareness's
[revision contract](../../octocode-awareness/docs/MEMORY_NAVIGATION.md#scoped-attend-revisions)
and [evidence reuse](../../octocode-awareness/skills/octocode-awareness/references/memory-recall.md#validate-declared-evidence).

# Local Git coordination

## Purpose: selected file context

Private Git supports communication about files and retained context: the reason
for a meaningful change, a constraint a peer must preserve, and the evidence for
a reusable lesson. Ordinary edits need no record. Do not turn every tool call
into a checkpoint, message, work run or reflection.

Use the smallest durable unit that changes a later decision: a short file/area
memory with provenance, plus an existing operation pointer when captured bytes
matter. Create a new checkpoint only for a deliberate handoff, reusable lesson
or recovery need; give it a concise explanatory label. Receivers read the reason
first and fetch only relevant evidence. Git blob deduplication saves disk, but
does not save model tokens when the same bytes are repeatedly returned.

Selected file reasoning uses `memory store-verified`: file/area, actual artifact
identity, what matters, why/constraint, source digest, validity and an optional
`history_ref` to existing evidence. Exact duplicates reuse a record; obsolete
decisions can be superseded. Recall the memory first and follow its evidence only
when bytes change the next decision. SQLite owns searchable reasoning and its
lifecycle; private Git owns immutable versions. This reuses existing memory and
history owners rather than creating a second Git-notes index or message bus.

Verified recall and exact `memory_id` pointers include existing linked worktrees;
`strict_scope` limits recall to the opened checkout. Each result carries its
physical `workspacePath` and source-relative files. Its optional `historyEvidence`
reports capture metadata as recorded, incomplete or unavailable, without claiming
the current checkout still matches it. Follow `historyEvidence.next.call` through
`history inspect` and its selected `history read` calls. Their `source_workspace`
is a read-only source selector authorized against current Git membership; the
host's write and restore workspace remains unchanged.

Git identifies the linked worktrees that belong to one local repository.
Awareness shares peer discovery, signals and memory across those worktrees when
they use the same SQLite database. Each record keeps its original workspace;
locks, file history, verification, plans and authorization remain scoped to the
physical checkout.

## What belongs in Git

These are design suitability scores, not measured performance scores.

| Feature | Git fit | Decision |
|---|---|---|
| Repository/worktree identity | 9/10 | Use Git's common directory and live worktree registry; do not maintain a second membership table. |
| Immutable file snapshots | 9/10 | Already stored as private Git objects; retain the existing history backend. |
| Committed changes and attribution | 9/10 | Consult Git history as evidence; a commit does not prove agent ownership or successful verification. |
| Reusable file/area knowledge | 6/10 | Share the existing memory records across worktrees. Keep search, provenance, expiry and supersession in SQLite; Git notes add another synchronization owner. |
| Live messages and acknowledgements | 3/10 | Keep the canonical signal and its transactional outbox. Git refs still need delivery cursors, privacy checks and recovery. |
| Exclusive leases and task claims | 2/10 | Keep SQLite transactions, ownership and expiry. Git's index/ref lock protects a Git operation, not an agent's file-edit lease. |

The private byte store now lives under `<workspace>/.octocode/.localGit`. Each
selected database has a separate namespace there; `history status` is the path
discovery API. It is a payload/recovery layer, not a second message bus. See
[storage and offline relocation](LOCAL_HISTORY.md#storage-boundary).

Git supports conditional ref updates, but its documentation notes that concurrent
readers can observe a subset of a multi-ref transaction. Git also separates
worktree-specific state from shared refs and objects. Those primitives support
content history and membership; they do not supply Awareness's relational lifecycle.
See [Git worktrees](https://git-scm.com/docs/git-worktree) and
[Git ref transactions](https://git-scm.com/docs/git-update-ref).

## Scope and ownership

`src/git.ts` owns Git discovery. `repositoryWorkspacePaths` reads the NUL-delimited
worktree registry and verifies each checkout's common directory. Separate clones,
stale paths reused by another repository, and matching remote URLs do not establish
membership. Discovery removes inherited `GIT_*` overrides and never writes project
refs, the index, hooks, remotes or configuration. A failed or oversized worktree
listing returns an error instead of treating a truncated list as complete.

Signals and native peer events share that membership filter. Other native events,
including authorization, remain local. Native delivery marks the existing signal
read and acknowledges its existing event; no extra Git message log is created.
Explicit `repo`/`ref` read filters still apply; inferred branch provenance no longer
hides messages or memories when agents use different branches.

Memory records retain their source file references. Recall can use a relative
file suffix or an artifact/area filter in another worktree. Revalidate the target
checkout before applying a lesson: a sibling hit is not proof that its bytes match.
`strictScope` keeps memory recall within the current checkout. Removing or moving a
worktree removes its old path from discovery; stored records remain preserved and
can be inspected with explicit memory scope or `--all-workspaces`.

The default global database already supplies one shared file. Repository-scoped
databases remain separate; pass one agreed absolute `--db` to every participant if
using that mode. Existing stores are neither moved nor merged by this change.

## How agents use it

Set one distinct agent ID per session. In each participant's own worktree:

```bash
npx @octocodeai/octocode-awareness agent register --workspace "$PWD" --agent-id "$OCTOCODE_AGENT_ID"
npx @octocodeai/octocode-awareness attend --workspace "$PWD" --agent-id "$OCTOCODE_AGENT_ID" --compact
npx @octocodeai/octocode-awareness signal publish --workspace "$PWD" --agent-id "$OCTOCODE_AGENT_ID" \
  --to-agent "$PEER_AGENT_ID" --kind question --subject "Auth contract" --body "Which precondition must this change preserve?"
```

Use the [communication recipe](../skills/octocode-awareness/references/coordination-protocol.md)
for reply, acknowledgement and resolution. Save one verified lesson with a file
reference or artifact scope, then recall it through the existing
[memory recipe](../skills/octocode-awareness/references/memory-recall.md).
Use the [lock protocol](LOCKS.md) only for unsafe concurrent edits to the same
physical file. Identically named files in different worktrees have independent
leases.

To inspect what is changing, request `attend --changes --compact`. Its paged rows
keep two kinds of evidence separate: `git` reports staged, unstaged and untracked
paths, including rename sources; `work` reports live declarations with agent and
run IDs. Work can appear before any bytes change. Neither kind proves authorship
or successful verification. The default presence briefing does not scan status.

Follow the returned `next` calls to retrieve every page or a full work rationale
and test plan. These calls retain your original workspace and database, including
through a native host's bound context. The revision covers path/status and work
declarations. It does not fingerprint file contents. If that snapshot changes
between pages, the result exposes partial state and a runnable restart. Status
failures return errors rather than a clean checkout. Compact rows retain foreign
workspace paths; an omitted row workspace inherits the response workspace.
Status traversal excludes `.octocode/.localGit` so captured objects cannot
inflate the packet or its output limit. Other authored `.octocode` files remain
visible. This changes no project ignore rule.

## Communication with less repeated content

Use existing owners in this order:

1. Read `attend --compact` when joining; request `--changes` only when workspace
   activity can change the next action. A status revision covers paths/status and
   declared work, not equality of file bytes.
2. Share a short decision or question through `signal publish`/`signal reply`.
   If an existing capture supplies evidence, include its workspace, operation ID,
   file and side. Do not recapture the workspace just to send a message.
3. Fetch only the required `history read` page or work detail through `next`.
   Repeated identical file bytes reuse Git blob IDs. The receiver must still
   verify provenance and honor its host's workspace bindings; request an excerpt
   from the originating agent if those bindings prevent the read.
4. Store a verified reusable lesson in file/area memory, with evidence references.
   Keep task claims, verification and delivery receipts in the existing ledger.

This reuses one metadata index and one immutable byte store. A Git-only bus would
need new recipient filters, cursors, acknowledgements, expiry, transaction recovery
and search indexes. Git notes are versioned annotations, with merge/conflict rules;
they add no delivery guarantee. That makes them an optional export format rather
than the canonical memory or inbox. See [Git notes](https://git-scm.com/docs/git-notes).
SQLite supports concurrent readers with a serialized writer in WAL mode; actual
Awareness journal mode depends on its embedded SQLite safety checks. See
[SQLite WAL](https://www.sqlite.org/wal.html).

The acceptance measures are complete continuations, no duplicate delivery, bounded
output, stable byte references and no workspace-Git mutation. No measured token or
latency improvement is claimed merely from moving the store. The earlier repeated
attention fixture reduced serialized output by 39%; tokenizer and long-session
measurements remain separate work.

## Expiration and abandoned state

| State | Current behavior | Agent action |
|---|---|---|
| Expiring exclusive lease | Live only while `expires_at > now`; renewal cannot revive it; expiry cleanup preserves run outcome | Reacquire after expiry; release owned protection when finished |
| Explicit age-based lock prune | `older_than_minutes` can remove even a renewed or non-expiring lock unless `expired_only` is set | Prefer an expiry-only preview; acquisition age is not proof the owner is dead |
| Expired advisory presence/task claim | Stops counting as live; digest can fail eligible stale ACTIVE runs with a receipt | Audit before recovery; retain live peer runs and pending verification |
| Restore preview | Five-minute apply deadline; expired preview rows remain evidence | Create a new preview; do not extend or reuse the old one |
| Memory | Explicit validity/supersession and digest retention own cleanup | Keep durable lessons unless their policy expires/supersedes them |
| Messages | Handoff TTL can resolve old handoffs; ordinary open messages are not silently deleted | Resolve handled threads; preview scoped resolved-signal pruning when needed |
| Git refs/objects, applying restores, unfinished captures | No automatic retention or cross-store crash reconciliation | Inspect `history status.retention`; preserve recovery evidence; do not infer deletion permission from age |

Ref publication uses atomic create-only installation, so another process cannot
overwrite the winning immutable ref. Its temporary files are not agent locks.
Crash residue can consume disk, but cannot hold a stale publication lease. Safe
object reclamation still needs writer exclusion and a verified reference set;
Git warns that concurrent pruning can remove objects before they receive a ref.
See [Git garbage collection](https://git-scm.com/docs/git-gc).

## Concurrent write limits

Leases are scoped to a physical checkout, so worktree isolation removes some
conflicts and hides others. These limits are design boundaries, not defects to
work around by bypassing a lease.

| Situation | Why a lease does not cover it | Protocol |
|---|---|---|
| Two agents independently create the same new path in different worktrees | Neither path exists when either lease is taken, and identically named files in separate checkouts hold independent leases | Agree the name or sequence number through a signal or one owning task before creating sequence-numbered artifacts such as migrations |
| An agent acts on peer state it read earlier | Records carry their source workspace, not a causal order proving the reader saw the latest write | Re-read the shared ledger before a decision that depends on peer progress |
| Two agents fix the same issue after reading it at different times | Task claims cover tracked work; untracked parallel work has no claim to observe | Claim the work before starting it, or publish intent so a peer can stop |
| Independent edits to one shared file | A lease serializes the file rather than merging the edits | Split the change, or accept serialization and hand off through the lease |
| An agent writes a file it read before a peer changed it | A lease held only for the write window does not make the write conditional on the version that was read | Re-read immediately before writing and abort when the content changed since the read; this needs no parallelism, only a stale read |

A merge that Git completes without conflict is not evidence that two agents'
changes are semantically compatible. Verify the composed result, not each side.

## Acceptance

`tests/git-coordination.test.ts` uses real Git worktrees and SQLite to exercise
discovery, private replies, acknowledgements, native event delivery, executable
inbox continuations, file memory and physical lock isolation. The fixtures also
verify that unrelated clones stay separate and the project index stays unchanged.
The package [verification runbook](VERIFY.md) remains the release gate.

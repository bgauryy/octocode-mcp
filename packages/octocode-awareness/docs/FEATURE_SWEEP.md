# Full feature sweep

Use an isolated database and workspace. This sweep exercises executable behavior;
it never substitutes routine test output for a reusable memory in a real store.
Command semantics remain owned by [file work, locks, and verification](LOCKS.md),
[reflection](REFLECTION.md), [hooks](HOOKS.md), and [agent physiology](AGENT_PHYSIOLOGY.md).

```bash
SWEEP_WS="$(mktemp -d)"
SWEEP_DB="$SWEEP_WS/awareness.sqlite3"
awareness_sweep() {
  npx @octocodeai/octocode-awareness --db "$SWEEP_DB" "$@"
}
awareness_sweep maintenance init --compact
```

| Surface | Evaluation recipe | Pass signal |
|---|---|---|
| Orientation and control | Run `attend --details --workspace "$SWEEP_WS"`, create verification debt, repeat that observation, settle it, then re-observe. Also execute default peer-page continuations. | Detailed advice names a read-first action; it never marks a run, claims a task, or starts a loop. Default attend lists peers. An unchanged observation adds no recurring prompt work. |
| Plan, task, run, and check | Create a `plan`, a dependent `task`, and paths; show the blocked dependent, claim the predecessor, submit it, mark its observed receipt, then claim the dependent. | The dependent stays blocked until the predecessor is verified, then becomes claimable. CLI and native adapters share the same plan, task and run IDs in one ledger. |
| Standalone work and verification | Start `work` with rationale, path, and test plan; end it; mark the result; audit. | Ending creates PENDING debt. Only the observed `verify mark` result clears it. |
| Advisory overlap and exclusive lock | Start overlapping work for two agents; inspect it; use a lock for a sensitive fixture path; attempt a conflicting lock; release and verify. | Ordinary overlap remains visible and allowed. The second exclusive acquisition exits `2`; expiry or release never means success. |
| Signals and continuation | Publish, list, reply and dry-run prune with `--workspace "$SWEEP_WS"`. Acknowledge by signal ID and resolve by thread ID in the same database; these two CLI routes do not accept `--workspace`. Exercise `handoff add/list/clear` for unfinished continuation. | The thread keeps its identity and participant history. Linked worktrees share signals; unrelated clones remain isolated. Acknowledgement records reading; resolution closes completed threads. |
| Memory, reflection, and semantic quality | Record scoped positive and negative memories with provenance; recall exact filters, then run `memory recall --semantic` only when semantic capability is present; record worked, failed, and partial reflection outcomes. | Lexical filters return only expected rows. Semantic output is judged against the held-out expected set and must not replace source/check verification. Reflection produces memory or owned refinement, never an edit. |
| Host hooks | In a disposable host project, preview hook installation, inspect the exact diff, install only under an authorized test, then drive write success, failure, stop, compact, and session-end events. | Pre-edit enforcement blocks an exclusive conflict; hooks record deterministic lifecycle edges; they do not select goals, claim work, verify checks, or change host policy. |
| Native context and saturation | In a native test with a fresh current-token measurement and matching active-model input limit, inspect `attend` runtime context. Repeat with an unknown limit. | The first packet includes input limit, headroom, and saturation basis points. The unknown-limit packet preserves raw occupancy and omits normalized values. Advice does not compact or select a model. |
| Long-run recovery | Leave a short-TTL presence and lock in the isolated store, allow expiry, inspect work/lock/audit, then explicitly reacquire or fail/settle the owning run. Restart the runner and repeat a read. | Expiry removes stale coordination protection but never proves completion. Recovery is explicit, durable, and does not replay a possibly completed action. |
| Store, docs, and maintenance | Run `status`, targeted `query`, `docs list/show`, `schema commands`, `schema entities --all`, `maintenance digest --dry-run`, and `maintenance self-test`. | Reads remain read-only; schemas identify command/entity ownership; maintenance previews rows before mutation; docs routes resolve. |

Pass a row only after every listed observation is captured. A missing, errored, or
wrong-scope step fails that row. For host and native rows, record the unavailable
capability when the selected environment cannot provide it; do not infer a pass from
the standalone CLI. Remove `$SWEEP_WS` after review.

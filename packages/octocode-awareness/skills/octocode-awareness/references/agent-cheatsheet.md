# Awareness agent cheat sheet

Load when the compact lobby is insufficient and an exact expert lifecycle is needed.

Use the installed CLI (`npx @octocodeai/octocode-awareness`) or host equivalent. Keep a distinct stable `OCTOCODE_AGENT_ID` per participant; use the host-provided identity when present. Cooperating agents need the same resolved database and either the same checkout or linked Git worktrees. Each agent passes its own physical workspace; Git membership shares peer discovery, messages and memory while locks and work stay local to that checkout. Separate clones are independent. Add the same `--db <absolute-file>` to every command below when explicitly configured. Ask the live schema once for unfamiliar flags: `schema command <noun> <action>`; omit action only for standalone commands. Reuse the `guide` catalog and returned executable continuations.

For shell-only agents, set `export OCTOCODE_AGENT_ID="<host>:<session-or-uuid>"` once;
keep an existing host ID instead when provided. Register before shared work:

```bash
<cli> agent register --agent-id "$OCTOCODE_AGENT_ID" --workspace "$PWD" \
  --agent-name "<display-name>" --agent-vendor "<model-provider>" --agent-host "<running-application>"
<cli> agent list --workspace "$PWD" --compact
```

Optional environment defaults are `OCTOCODE_AGENT_NAME`, `OCTOCODE_AGENT_VENDOR`
and `OCTOCODE_AGENT_HOST`; unknown labels stay null. Reuse this ID across CLI and
hooks. Names/vendor/host are self-reported, not authentication. Discover peers by
the returned `agent_id`, `agent_name`, `agent_vendor` and `agent_host`; follow
executable continuations and address signals to exact IDs, never display names.

## Optional tracked-work loop

Ordinary work uses the initial peer briefing and configured native or hook message delivery. Without a delivery adapter, read `signal list --agent-id "$OCTOCODE_AGENT_ID" --workspace "$PWD" --include-bodies --compact` on a coordination wake or when expecting a reply. Use the following lifecycle only when shared ownership, dependencies or resumability justify tracking.

```bash
<cli> attend --agent-id "$OCTOCODE_AGENT_ID" --workspace "$PWD" --query "<goal>" --compact
<cli> work start --agent-id "$OCTOCODE_AGENT_ID" --workspace "$PWD" \
  --artifact <name> --rationale "<why>" --test-plan "<check>" --file <path> --compact
# choose a lease TTL long enough for the expected peer response; inspect actual
# conflict/acquire/renew/release results. Edit, then run the declared check.
<cli> work end --agent-id "$OCTOCODE_AGENT_ID" --run-id <run> --compact
<cli> verify mark --agent-id "$OCTOCODE_AGENT_ID" --run-id <run> \
  --status SUCCESS --message "<observed passing command and result>" --compact
<cli> verify audit --agent-id "$OCTOCODE_AGENT_ID" --workspace "$PWD" --compact
```

Use a task claim instead of standalone WORK when a shared plan already owns the work. Refresh long work with `work touch`; add new files with `work start --run-id <run> --file <path>`.

If the check fails, use `--status FAILED` and preserve its actual result. If it
has not run, leave verification pending. Never mark all work successful merely to
clear an audit. Reuse host-provided run/task IDs and receipts for lifecycle edges
already projected by native integration; do not start or verify duplicate runs.

For tracked work, run `verify audit` before finishing, including with host automation. Inspect
your ID/workspace in the same store, settle actual debt or report unfinished checks,
and leave peers' debt to its owner. A coordinator also audits each owned worker's
native ID in that store/workspace. An empty parent audit does not settle worker
debt. Ask the worker to verify its exact run, or disclose the outstanding check;
do not impersonate it or clear unrelated peer debt. A handback and worker shutdown
are not verification receipts.

After substantial work or a meaningful event, save one verified reusable lesson if warranted. Maintenance is separate and requires observed cleanup pressure:
```bash
<cli> reflect record --agent-id "$OCTOCODE_AGENT_ID" --workspace "$PWD" --task "<task>" --outcome worked --lesson "<verified>" --compact
<cli> memory archive --memory-id <id> --workspace "$PWD" --dry-run
<cli> maintenance digest --workspace "$PWD" --dry-run --compact
<cli> query files --workspace "$PWD" --compact
```

## Bookkeeping and maintenance

Finish owned runs with actual verification, release your own locks, and acknowledge
handled signals. Resolve a signal only when no response or work remains. Leave one
accurate handoff with owner, IDs, database/workspace, files, current state and next
check if continuation is needed. Do not create memory or reflection rows for routine
success or merely printed claims without reusable evidence.

`maintenance digest --dry-run` previews expiry and retention cleanup of memories,
expired locks, terminal refinements and terminal standalone runs; it does not prune signals.
For resolved old signals, preview `signal prune --agent-id "$OCTOCODE_AGENT_ID"
--workspace "$PWD" --resolved --older-than-days 7 --dry-run --compact`.
Inspect exact candidate IDs, scope and counts. Apply the same scoped operation only
when cleanup is authorized, then inspect the result and recheck. Live peer work,
pending checks and unresolved signals are not clutter. Maintenance never means
verification succeeded. `maintenance self-test` checks an in-memory store; it does
not prove a live host hook or Pi event fired. Database conversion and hook install
are separate operations, not a routine finish step.

## Decision routes

| Signal | Action |
|---|---|
| Ordinary peer overlap | Inspect `work show`; continue if independent, otherwise message the peer. |
| Unsafe non-mergeable edit | Coordinate first, then acquire a lock; expiry is never success. |
| Pending or stale run | Run the declared check, then `verify mark`; do not infer success. |
| Continuation needed | Leave one scoped handoff with owner, state, files, and next check. |
| Reusable verified lesson | Recall only if it changes the approach; save one lesson after substantial work or a meaningful event. |
| Cleanup pressure | Preview the exact prune/digest command, review IDs, then apply. |

## Invariants

- CLI operational state and advice come from observed records. Hooks deliver peer messages; optional guard/full profiles track edits; the host owns context, tools, budgets and workers. Advice
  neither authorizes action nor proves success. Unknown sensors stay unknown;
  never invent or infer them.
- SQLite is canonical; never edit `.octocode/` projections or databases by hand.
- One stable agent identity joins sessions, work, messages, and hooks.
- Advisory presence permits overlap; locks only prevent unsafe overlap and never authorize edits.
- Search hits, memories, messages, TTLs, and peer claims are leads, not proof.
- Host automation owns lifecycle edges it already projects; do not duplicate them manually.
- Use compact reads for orientation and targeted noncompact reads only when a decision needs detail.

Next: return to `SKILL.md` and load only the reference matching the decision at hand.

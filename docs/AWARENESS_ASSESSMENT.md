# Awareness: complete assessment

Updated: 2026-09-07. Scope: Awareness, its private Git history, canonical schemas,
SQLite entities, CLI, skill, hooks, and the Pi extension. This is the single overview
and rating document; linked package references retain ownership of exact protocols.

**Overall implemented foundation: 7.5/10. Private Git subsystem: 6.5/10.
Automatic cross-vendor readiness in this workspace: 3/10.** These are engineering
judgments, not measured reliability percentages. The deeper review lowers the
previous 8.5 foundation rating because it reproduced correctness gaps hidden by
passing regression tests. The core coordination design is useful; uniform maturity,
hard resource bounds, and unattended operation across every vendor are not established.

The review includes an independent **gpt-5.6-luna** private Git audit, a separate
feature audit, parent source/reproduction checks, fresh regression suites, and a
frozen real-workflow experiment with Sonnet 4.6 and Luna. Production source and the
experiment subject were unchanged during this review.

## Read the evidence correctly

- **Implemented:** source plus regression coverage establishes a contract.
- **Reproduced:** a fresh isolated execution demonstrates a specific result or defect.
- **Activated:** a real host loaded the integration under its effective policy.
- **Observed:** durable receipts establish that particular workflow's outcome.
- **Unproven:** a proposal, scale property, race hypothesis, or external-host behavior
  lacks sufficient runtime evidence.

Scores near 9 indicate strong tested contracts; 7–8 indicate useful behavior with
material limits; 5–6 indicate important correctness or validation gaps; 2–3 indicate
research or incomplete activation. Passing tests do not turn inferred properties
into guarantees. No score is an arithmetic average of worker opinions.

## Architecture and ownership

| Layer | Owns | Boundary |
|---|---|---|
| Awareness schemas | Strict requests, entity shapes, live discovery | One canonical contract; no parallel host schema or automatic compatibility migration. |
| Awareness domain and SQLite | Plans, tasks, runs, leases, signals, references, checks, history journals | The physical store and normalized workspace must match across peers. |
| Private Git | Captured blobs, trees, commits, operation refs | Separate bare sidecar; never a replacement coordination database. |
| CLI and skill | Agent-facing operations and shared cooperation policy | Small standing instructions; exact recipes/schema detail on demand. |
| Vendor hooks | Translate lifecycle/tool events into canonical operations | Definition, activation, persistence and action are different evidence levels. |
| Pi extension | Execution, workers, native sensing, context, UI, delivery and recovery interaction | Imports Awareness; does not duplicate its ledger or Git writer. |
| Agent contracts | Shared host/worker protocols and types | Shared utilities do not imply a shared Agent/Awareness physical database. |
| Model | Deliberation and authorized task choices | Peer messages, memory, estimates and successful process exit are not authority or verification. |

The bundled private Git implementation is **isomorphic-git 1.41.9** and needs no
system Git executable for history. Pi bundles Awareness and its skill/assets. The
history backend uses `<db-path>.history/awareness-v1/<workspace-hash>/repo.git`;
the project's `.git` index, branch and remotes remain separate. Other Awareness
workspace/identity operations can inspect repository metadata; this isolation claim
is specifically about the history store and its writes.

## Feature ratings

All major feature families were inventoried and sampled through source and tests.
This table does not claim every route was exercised by a live model. Source anchors
are under [Awareness](../packages/octocode-awareness/src/) or explicitly Pi.

| Feature | /10 | Established behavior and remaining limit |
|---|---:|---|
| Canonical Zod schemas and CLI discovery | 9 | Strict admission and generated command contracts; 97 routes inventoried. Schema-less setup routes use help. |
| Entities and exact SQLite admission | 9 | DDL-derived entities and store identity; opening does not silently migrate incompatible stores. |
| Store/workspace scoping | 8 | Same physical SQLite and canonical workspace across hosts; no cross-machine transport implied. |
| Agent registry and native identity | 8 | Stable IDs and metadata; names/vendor labels are self-reported, not authentication. |
| Plans and shared plan graph | 8 | Membership, narrative, transactional task graph and outbox; no autonomous planning claim. |
| Task readiness/dependencies/claim/retry | 8 | Dependency and lease gates with explicit retry; no completion from expiry. |
| Advisory work and overlap | 8 | Presence and executable work-list continuations; overlap is advisory. |
| Exclusive locks and leases | 8 | Cooperative contention and scoped release; outside filesystem writers do not obey these leases. |
| Verification and task completion | 8 | Explicit observed SUCCESS/FAILED; unrun work stays PENDING and stale ACTIVE remains visible. |
| Final Pi worker audits | 7.5 | Native IDs and checks after last artifacts/exit; facade-owned set only; internal query cost is unbounded. |
| Signals, exact replies and thread privacy | 8 | Directed replies, thread correlation and outsider checks; ack is not resolution or task completion. |
| Inbox/work pagination | 8 | Executable continuation coverage; does not extend to every memory-search path. |
| Outbox delivery and receipt retries | 8.5 | Ordered persistence before acknowledgement, replay/failure handling; delivery is not proof of action. |
| Canonical cooperation prompt and skill | 8 | Fair ownership, helping peers, verified reuse, token/quality discipline; model compliance varies. |
| Vendor lifecycle/tool hooks | 6.5 | Host adapters and event fixtures exist; live external-host activation is incomplete. |
| Hook health reporting | 5.5 | Runtime uncertainty is honest; commented-only frontmatter can falsely report definition readiness. |
| Sessions and handoffs | 7.5 | Durable scoped continuity; handoff listing materializes its scope and learning efficacy is unmeasured. |
| Capability/authorization/interaction receipts | 8 | Typed provenance and authority boundaries; peer-authored proposals do not grant permission. |
| Worker lifecycle ledger | 8 | Idempotent append/replay and divergent reuse checks; not an inferred global worker ancestry graph. |
| Lexical memory and lifecycle | 7.5 | Ranked scoped leads, decay, archive/restore and provenance; retrieval is not truth. |
| Semantic memory and embeddings | 5 | Reproduced hidden 2,000-row cap and access credit for unseen results. |
| Declared source/dependency freshness | 8.5 | Bounded fresh/stale/unknown checks; exact declared bytes/modes only, not dependency closure or claim truth. |
| Reflection, refinement and weakness learning | 7 | Structured reusable lessons and proposals; measured learning improvement remains unproven. |
| Harness improvement guards | 7.5 | Apply/branch constraints; generating a proposal is not authorization to apply it. |
| Workboard, projections and doc drift | 7.5 | Derived views over canonical owners; exported snapshots can become stale. |
| Attend and actionable next | 8 | Bounded observations, unavailable sensors and scoped next actions; not permission to mutate. |
| Changes-only attend revisions | 8.5 | Scope/store/version binding and fresh comparison; expiry, ranking, partial state and debt remain visible. |
| Observed physiology/advisory regulation | 7 | Real host observations plus bounded advice; thresholds are policy, not calibrated forecasts. |
| Pi persistent-storage gate | 8.5 | Memory mode disables durable integration; explicit CLI access alone proves no native activation. |
| Pi session fencing and deduplication | 8 | Durable-session requirement and generation fences; persistence timing remains SDK-dependent. |
| Pi coalesced automatic wake | 7 | One actionable directed follow-up budget per external input; lifecycle opportunity required, no arrival watcher. |
| Context/token attribution | 7.5 | Payload-free estimates separate from provider/cache usage; assembly scope is not total retained-context accounting. |
| Maintenance, pruning and consolidation | 7 | Scoped dry-runs and explicit operations; history-bearing database consolidation is rejected. |
| Private Git and recovery | 6.5 | Useful isolated captures/restore journal; publication, crash recovery and hard memory bounds need work. |

## Confirmed defects and scale gaps

| Priority | Finding | Evidence and scope | Required improvement |
|---|---|---|---|
| P2 | Semantic recall credits unseen memories | `memory-semantic.ts:111` bumps all ranked candidates before slicing at 117. Three eligible rows with limit 1 all gained access credit. | Slice first; update only returned IDs; test nonreturned counters/timestamps and explicit access policy. |
| P2 | Semantic pool silently omits matches | `memory-embeddings.ts:70–92` caps at 2,000 before ranking. A 2,001-row fixture hid its only exact match and returned an unqualified empty array. | Bounded ranking with typed partial/continuation or explicit terminal-limit diagnostics; do not simply raise the cap. |
| P2 | Commented hooks appear ready | `hooks-install-health.ts:242–261` checks independent substrings. Parent reproduced `definition: ready` from comments only through the built CLI. Runtime stayed unverified. | Parse active frontmatter structure and validate event-command bindings; cover comments, swapped bindings and malformed YAML. |
| P2 | Same-ref publication is not atomic across processes | `history-git.ts:86–99,300–309` uses a process-local lock around check/write. Parent observed eight successful publishers in each of three races. SQLite narrows ordinary domain use. | Cross-process exclusive publication and winner/loser tests through the backend and domain. |
| P2 | Git publication can precede durable ledger linkage | `history-capture.ts:81–90` publishes a ref before storing its OID/status in SQLite. A crash can strand `capturing`; caught failure can leave `failed`; retries do not reconcile. Code-order finding, not injected power-loss proof. | Persist/reconcile a capture phase journal and test crashes at each boundary without inventing success. |
| P2 | Capture limits are not hard peak-memory limits | `history-files.ts` checks initial size then uses unbounded `handle.readFile()`. Concurrent growth can allocate beyond the limit before becoming unstable. Mechanism inspected; growth race not measured. | Bounded streaming reads and total in-flight allocation budgets; test growth and cancellation. |
| Scale | Audit output caps do not bound DB work | `verify-audit.ts` materializes pending/stale rows and references before Pi slices IDs. | Separate exact counts from bounded detail pages; benchmark large debt and handoff scopes. |
| Scale | No history GC/retention or hard inflate bound | No automatic pruning; Git blobs are inflated before output-size rejection. | Define retention roots, safe collection and bounded decompression before broad scale claims. |

These are review findings, not fixes delivered by this audit. No source deletion,
legacy shim or second schema/database was introduced. The existing unrelated
PENDING verification run remains untouched.

## Private Git deep review

| Area | /10 | Evidence |
|---|---:|---|
| Isolation from project Git | 9 | Separate sidecar, bare repository and bundled implementation; user-index isolation tests pass. |
| Ordinary concurrent captures | 7 | Eight distinct-operation processes pass; the separate same-ref race above remains. |
| Ref publication integrity | 5 | OID validation and object SHA verification work; cross-process immutability does not. |
| Restore preview binding | 8 | Owner, workspace, TTL, exact selected files, existence, digest, size, mode and locks. |
| Undo/partial restore | 7 | Durable undo capture, lease renewal, per-file journal and explicit verification debt; no multi-file atomic transaction. |
| Filesystem/symlink handling | 7 | Ancestor checks and no-follow file opens; path-based parent-directory swaps retain a TOCTOU window. |
| Hard time/memory bounds | 5 | Normal count/size bounds exist; growth, inflation and recursive backend tree reads lack complete hard bounds. |
| Retention and storage growth | 3 | No automatic GC; database and sidecar must remain paired. |

Luna's black-box tamper check replaced a loose object with a different valid Git
payload: `verifyObject` returned false and `readBlob` failed SHA verification.
This review found no demonstrated content-hash bypass. Parent-directory symlink
swaps and unbounded backend tree recursion remain threat/scale mechanisms, not
reproduced routine-path escapes. Normal public captures are limited to 200 paths.

Capture defaults are 2 MiB/file and 16 MiB/batch, excluding common generated,
Git and secret-file paths. Before/after outcomes, omitted/unstable/missing states,
restore previews and returned `verification_run_id` remain distinct. Restoring
bytes does not rewind plans, messages, external effects or successful checks.
The complete mechanism belongs to [local history](../packages/octocode-awareness/docs/LOCAL_HISTORY.md).

## Token economy and cooperation delivery

Standing policy size fell from 17,323 to 4,397 UTF-8 bytes (74.6%). This is a byte
measurement, not proof of equivalent savings across workflows. The skill is 6,379
bytes. Attend revisions reduce repeated output while still executing fresh reads.

The previous six-call policy-decision experiment reported 66.01% fewer total tokens,
but all responses used Markdown fences. Its frozen strict JSON gate remains
**NOT_ACCEPTED (0/3 per arm)**. A post-hoc semantic check passed 14/14 fields per arm;
that did not alter the original verdict or grader.

WORKFLOW_RESULTS_PENDING

## Vendor and host readiness

Fresh read-only checks of this workspace produced:

| Host | Observed state |
|---|---|
| Codex | Four expected entries drifted; runtime unverified, coverage 0/4. |
| Claude Code | Checker reports frontmatter ready, runtime/activation unverified, coverage 0/5; the false-positive defect limits this diagnosis. |
| Cursor | Five expected entries missing; runtime unverified, coverage 0/5. |
| Copilot | Five expected entries missing; runtime unverified, coverage 0/5. |
| Gemini | Three expected entries missing; runtime unverified, coverage 0/3. |
| OpenCode | Project plugin needs repair; runtime unverified. |
| Pi | Installed-SDK and prior real native-ID communication evidence exists under a process-scoped persistent policy. This audit's policy experiment disables extensions to isolate the prompt variable. |

Codex, Claude and Pi executables are present; Cursor's CLI was not found. Presence
is not activation. This review did not install hooks or alter saved storage policy.
A Sonnet or Luna model running in Pi is not a session inside Claude Code or Codex.
The previous saved memory-mode policy must not be confused with a scoped persistent
test override. See [hook contracts](../packages/octocode-awareness/docs/HOOKS.md).

## Agent physiology: implemented versus proposed

| Concept | Status and limit |
|---|---|
| Operational body/interoception | Typed context, tool/worker and execution observations exist; unavailable sources remain unknown. |
| Homeostasis | Deterministic observed-pressure advice exists; effectiveness and thresholds need calibration. |
| Reflexes | Locks, verification gates, schema and permission checks enforce specific invariants. No general semantic danger detector exists. |
| Three-speed cognition | Host checks/advice/model judgment have separate roles; no complete adaptive metabolic scheduler is established. |
| Cognitive yield/metabolism | Resource observations exist; useful information gain and verified progress per unit cost are not calibrated. |
| Error pressure/escalation | Explicit failures/debt exist; joint-pressure-driven model/human escalation remains unproven. |
| Prospective interoception | No validated prediction of an action's future context, uncertainty or rollback trajectory. |
| Micro-tasking | Plans/dependencies support decomposition; a homeostatic decomposition controller is not proven. |
| Parallel worker regulation | Fixed host limits and coordination exist; uncertainty/merge-cost-driven adaptive concurrency is not proven. |
| Memory consistency | References, provenance and freshness help; semantic correctness and complete dependency coverage are not guaranteed. |

Conceptual controller maturity: **2/10** beyond the implemented observations and
specific guards. Keep new regulation observation-only until held-out outcomes and
false-blocking rates justify action. The system does not feel emotions; these are
operational engineering concepts.

## Architecture and cleanup follow-up

Fresh regression results: **90 shared-contract, 1,282 Awareness and 1,951 Pi tests
passed (3,323 total)**. Focused reviewers also ran 47 history and 38 feature tests;
these overlap the package suites and are not added to the total. The green suite
coexists with the reproduced coverage gaps above. No new coverage measurement or
production deployment is claimed.

Parent checks used Octocode exact reads and bounded file-topology graphs. Graph
results were depth-limited and marked partial; they do not prove global acyclicity
or dead-code absence. No source cleanup was justified from graph candidates alone.

Evidence: [Luna Git review](../.octocode/octocode-research/awareness-full-review-20260907/luna-git.md),
[feature review](../.octocode/octocode-research/awareness-full-review-20260907/features.md),
[parent ref-race reproduction](../.octocode/octocode-research/awareness-full-review-20260907/ref-race-result.json),
[built-CLI hook reproduction](../.octocode/octocode-research/awareness-full-review-20260907/hook-false-positive.json),
[fresh host checks](../.octocode/octocode-research/awareness-full-review-20260907/hooks.json),
and [prior policy evaluation](../.octocode/octocode-eval-benchmark/awareness-v2-delivery-20260907/POLICY_EVAL.md).

## Prioritized next work

1. Repair semantic returned-result accounting and observable candidate limits; add failing regressions first.
2. Parse real hook bindings and preserve definition/activation/runtime distinctions.
3. Make private ref publication atomic across processes; add recoverable Git/SQLite phase reconciliation.
4. Bound file reads/in-flight buffers and audit detail queries; measure long-session heap, latency and storage growth.
5. Reduce observed discovery/runner/recipient mistakes using canonical host bindings and targeted executable next actions; rerun the unchanged workflow suite before claiming savings.
6. Validate actual external host activation and a broader held-out task corpus; keep retention and predictive regulation as separately gated work.

## Complete CLI family inventory

The following snapshot accounts for all **97 routes** from the live command
registry. It is a coverage index, not a second schema. Use `schema command <noun>
[action] --compact` or focused help for exact inputs.

| Family | Routes | Actions |
|---|---:|---|
| `attend` | 1 | `standalone` |
| `status` | 1 | `standalone` |
| `plan` | 6 | `create`, `list`, `show`, `join`, `doc`, `status` |
| `task` | 10 | `create`, `list`, `ready`, `show`, `claim`, `heartbeat`, `submit`, `release`, `retry`, `depend` |
| `work` | 5 | `start`, `touch`, `end`, `list`, `show` |
| `memory` | 10 | `recall`, `record`, `forget`, `archive`, `restore`, `store-verified`, `recall-verified`, `evaluate`, `reindex`, `prune` |
| `refinement` | 3 | `get`, `set`, `delete` |
| `lock` | 4 | `acquire`, `wait`, `release`, `prune` |
| `verify` | 2 | `audit`, `mark` |
| `signal` | 6 | `list`, `publish`, `reply`, `ack`, `resolve`, `prune` |
| `agent` | 4 | `register`, `list`, `touch`, `leave` |
| `query` | 5 | `standalone`, `files`, `workboard`, `all`, `developer-review` |
| `session` | 1 | `capture` |
| `reflect` | 4 | `record`, `mine-weakness`, `export-harness`, `developer-review` |
| `docs` | 3 | `list`, `show`, `staleness` |
| `skill` | 1 | `install` |
| `maintenance` | 3 | `digest`, `init`, `self-test` |
| `config` | 3 | `show`, `init`, `validate` |
| `hooks` | 4 | `install`, `check`, `remove`, `pre-edit` |
| `hook` | 1 | `run` |
| `schema` | 7 | `commands`, `command`, `entities`, `list`, `json-schema`, `example`, `validate` |
| `handoff` | 3 | `add`, `list`, `clear` |
| `guide` | 1 | `standalone` |
| `instructions` | 1 | `export` |
| `database` | 1 | `consolidate` |
| `history` | 7 | `status`, `capture`, `checkpoint`, `timeline`, `read`, `restore-preview`, `restore-apply` |

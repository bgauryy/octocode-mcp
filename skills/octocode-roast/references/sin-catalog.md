# Sin catalog

Load when building or ranking the inventory.

## Tiers

| Tier (label) | Examples |
|---|---|
| Capital offense (Critical) | Confirmed credential exposure, injection/RCE, auth bypass, data loss/corruption, disabled security controls on a reachable production path. |
| Felony (High) | N+1 or blocking work on a measured hot path; unbounded reads/memory; races, deadlocks, swallowed failures; fragile public contracts; god units; broad type escapes at critical boundaries. |
| Crime (Medium) | Hidden state, ambiguous errors, untested risky code; duplication, boolean traps, brittle conditionals; frontend effect bugs; migration/rollback/ownership gaps with credible cost. |
| Slop (Low) | Filler, comments restating code, unclear names, blanket suppressions, dumping-ground modules, ceremony. |
| Misdemeanor (Low) | Stale TODOs, debug output, commented dead code, unproven style preferences; mention only when signal remains. |

## Leads by ecosystem

Leads, not conclusions. Skip docs, examples, fixtures, generated files, tests unless in scope.

| Ecosystem | Leads |
|---|---|
| TS/JS | repeated `any`/`@ts-ignore`, unsafe dynamic keys, `eval`, async `forEach`, unhandled promises |
| Python | bare `except` + `pass`, mutable defaults, unsafe loaders, sync I/O in async |
| React | conditional hooks, missing keys, stale effect deps, unsafe HTML, no error boundaries |
| SQL/data | string-built queries, unbounded reads, N+1 or per-item calls, full scans on hot paths |
| Rust | `unwrap`/`panic` on user paths, blocking in async, `unsafe` without invariants |
| Any | credential-shaped assignments, dynamic execution, disabled TLS, user input in query/path/shell; dense dirs, import cycles, high fan-in/out; empty catches, ignored results; blanket disables, conflict markers |

## Rank findings

- Hypothesis test each candidate: claim (mechanism), strongest rival (unreachable, out of scope, guarded, intended), distinguishing check, result: confirmed ranks, dismissed drops, unresolved stays a lead.
- Syntax alone never proves exploitability; unsupported exploit, latency, or outage claims stay unresolved.
- Taste-only evidence: demote to Slop or Misdemeanor.

Next: Autopsy ([flow](../SKILL.md#flow)).

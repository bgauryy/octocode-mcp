# Checks

Load when a contract or data path crosses a trust, process, package, persistence, or ownership boundary; an algorithm, cache, retry loop, or concurrent protocol decides correctness or cost; or agent-authored work is reviewed or planned.

## Contract trace

- Trace `declaration/schema -> runtime validation -> adapter/mapping -> implementation -> consumer -> observed result`; name provider, consumer, owner, versioning policy, public or internal.
- Per changed branch, check:
  - shapes, optional/default fields, units, ordering, encoding, nullability, serialization;
  - pre/postconditions, invariants, authorization, side effects, transaction boundary;
  - errors, partial success, retries, timeouts, cancellation, idempotency, replay;
  - compatibility with deployed versions, persisted records, generated clients, events, external consumers;
  - one valid and one invalid example through the real provider and consumer, plus a test at the owning seam.
- Static types prove only checked call sites, runtime schemas only their boundary, shared field names not shared meaning. If provider and consumer cannot run together, report a candidate risk naming the missing evidence.
- Tool contracts: follow input schema → adapter arguments → result shape and evidence → executable `next` pages and `hints` leads; separate measured from expected reliability. Across tools, compare shared field names and meanings; run one composition case not used in design.

## Data-flow trace

- Per scenario, trace `origin -> ingress -> validation/authentication/authorization -> internal transforms -> storage/cache/queue -> egress/effect -> observation/deletion`; per hop record shape, trust, sensitivity/tenant, owner, invariant, copies, failure behavior.
- Ingress: untrusted until the executing boundary validates and authorizes; normalization, provenance, size/rate limits, rejection.
- Internal movement: conversions, fan-out, caches, queues, transactions, derived copies; where invariants or tenant context get lost.
- Egress: destination, redaction, serialization, credentials, policy, retries, duplicate effects, logging, retention, deletion.
- Feedback: callbacks, events, reconciliation re-entering as ingress; ordering, replay, idempotency, consistency windows.
- Exercise the material paths: normal, invalid, denied, partial failure, retry/replay, timeout/cancellation, stale version.
- Each validation, persistence, disclosure, and deletion decision has one accountable boundary.

## Algorithms

- Write the contract first: `inputs + preconditions -> postconditions + invariants -> termination -> cost`; name any reference oracle and the representative workload. Example tests are evidence, not proof: they miss boundary, state-space, and complexity failures.

Flaws → strong evidence:
- Boundaries: empty/singleton, off-by-one, invalid encoding, duplicates, ordering assumptions, aliasing, caller-data mutation → boundary partitions, property tests.
- Invariants: inconsistent state after a transition, leaking partial update → assertions, state-machine tests.
- Termination: unbounded wait/poll/retry, no terminal state, recursion depth, livelock, a completion signal re-arming its own wait → decreasing measure, timeout path, adversarial test.
- Global correctness: greedy choice, stale cache/index, unstable tie-breaking → proof sketch, oracle differential tests on small cases.
- Complexity: hidden nested scan, repeated I/O, pathological hashing, state explosion → time/space in named variables; benchmark representative and worst-shaped inputs.
- Numeric: overflow, precision loss, NaN, unit/rounding error, nondeterministic floats → range analysis, typed units, extreme-value tests.
- Concurrency: race, lost update, unsafe publication, deadlock, lock-order inversion, non-idempotent replay → happens-before reasoning, stress or deterministic-scheduler checks.
- Randomness: modulo bias, irreproducible seed, adversarial skew → fixed-seed property checks with tolerances.

- Proof ladder: trace the smallest counterexample through exact code → state why the invariant holds or breaks → compare with an oracle, exhaustive small state space, metamorphic property, or prior implementation when practical → measure only the named cost under comparable inputs. Unresolved input bounds, ordering, or numeric range keep the claim a candidate.
## Agent-authored work

- A green suite is no evidence: these defects pass functional tests. Detect them structurally (dependency graph, static analysis, contract diff, clean-environment run). Removal bars: `octocode-clean-agentic-code` [code-smells](../../octocode-clean-agentic-code/references/code-smells.md).
- State the intended boundary before a slice adds or moves dependencies; re-derive the graph after.

Structure:
- Drift: forbidden edges added one reasonable commit at a time.
- Import cycle: new since baseline, or hidden by a deferred or type-only import.
- Boundary violation: reaching into internals instead of the public interface.
- Coupling growth: rising fan-in/fan-out on touched modules.
- God module: new responsibility in the largest file.
- Parallel implementation: one rule, allowlist, or schema in two places without a parity fixture.
- Speculative abstraction: one-implementation interface, one-value flag.

Runtime ([contract trace](#contract-trace) for API contracts, [Algorithms](#algorithms) for termination):
- Thread safety: lazy init without a memory barrier, lock on a shared or interned object, sleep inside a lock where a wait belongs.
- Resource lifetime: every handle, stream, connection, listener, subscription, timer, child process closes on all branches.
- Atomicity: must-succeed-together operations; idempotent retries.

Deliverability:
- Dependency closure: run in a clean environment with only declared dependencies.
- Environment coupling: behavior varies with cwd, host, or import order (module-scope reads, hardcoded infrastructure).
- Incomplete generation: a reachable stub returning success.
- Dependency creep: a second library for a covered concern.
- Gate integrity: run each guard on a case it must reject; zero exit after parsing nothing, or a negative test passing on an unrelated rejection, is a broken gate.

Spec fit: compare the slice with the request, not itself: missing corner case, wrong input type, invented object or attribute, overfitting to a prompt example, unrequested capability.

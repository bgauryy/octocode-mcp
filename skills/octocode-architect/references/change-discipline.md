# Change discipline

Load when about to edit source: a proven fix, a requested design improvement, or an agent's slice. A slice is done only when behavior and repository state agree.

## Refactor

- No refactor while a candidate's impact or acceptance check is undefined.

Safe moves (finding → move; guardrail):
- Mixed responsibility → extract one cohesive capability behind the existing call shape; characterization tests.
- Wrong-way dependency → consumer-owned port, infrastructure in an adapter; contract test, negative dependency check.
- Leaky transport/storage/view type → boundary value or DTO at the edge; serialization, validation, compatibility tests.
- Hidden orchestration or effects → expose the use-case boundary and effect owner; success, error, retry, timeout, cancellation.
- Repeated policy → centralize only proven shared knowledge and change pressure; keep divergent edge cases.
- Over-wide interface → focused capabilities from real consumer groups; no capability loss.
- Measured repeated work → fix I/O, computation, or cache/lifetime ownership; same benchmark conditions and limits.
- Harmful runtime cycle (not type-only) → break the least stable edge (inversion, events, moved responsibility); initialization and integration checks.

- Boundaries: cut by capability, volatility, and ownership, not technical nouns; dependencies point toward stable policy; construction stays at few composition roots; transactions, retries, cancellation, failure, and observability each get an owner. Prefer duplicated simple syntax over abstracting unrelated concepts.
- Migrate in reversible vertical slices, not layer rewrites: freeze behavior, create a seam, move one scenario, redirect callers, run architecture and runtime sensors, repeat. Remove old paths only after semantic and external-consumer checks; update architecture docs that are part of the contract.
- A seam exposing an unproven assumption: back to [checks](checks.md#algorithms) or [analysis](analysis.md).

## Verify the slice

- The first failing assertion fails for the intended reason.
- Never stub the dependency the test claims to prove.
- Run the narrowest checks, widen with affected scope, compare with the baseline.
- Passing assertion text in a non-zero process is a failure.
- Release acquired resources; preserve generated-code ownership.
- Optimization: record the metric.
- Remove dead imports and obsolete code the change created or exposed; fix affected formatting, stale comments, naming drift. Broader cleanup and bookkeeping: [gates](../SKILL.md#gates).

## Done

The owned interface behaves as intended on normal and named edge paths; every remaining failure has a class and attribution evidence. Report per the [decision record](../output.md#decision-record) (low-risk: slice, impact, verify).

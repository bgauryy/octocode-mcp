# Validation Playbooks

How to validate findings before presenting them. Every scanner finding is a hypothesis — never present it as fact without validation.

For the validation loop (confirmed/dismissed/uncertain flow), see [SKILL.md Stage 6](../SKILL.md#stage-6-validate--score). For tool params, see [SKILL.md tools table](../SKILL.md#tools). For scanner flags, see [CLI reference](./cli-reference.md).

---

## Category playbooks

| Category type | How to validate | Typical fix |
|---------------|----------------|-------------|
| Dead export | Find references excluding declaration → 0 refs = dead | Remove export or wire real usage |
| Coupling hotspot | Measure fan-in (find references) + fan-out (outgoing call hierarchy) | Split module by responsibility/consumer group |
| Dependency cycle | Read cycle path from architecture.json → trace imports through the chain | Break edge via shared contract/inversion |
| Security sink | Trace data sources via incoming call hierarchy → check for guards before the sink | Add/centralize validation/sanitization before sink |
| God function | Read body + map outgoing calls → count concerns and side effects | Extract focused helpers, keep orchestration thin |
| Performance (await-in-loop) | Read loop body — is each iteration independent? Check for data dependency between iterations | Collect promises with `Promise.all()`. Keep sequential only when iteration N depends on N-1 |
| Performance (sync I/O, listener leak) | Read body — sync I/O on hot path? Listeners without matching removal? | Replace sync with async; add cleanup |
| Test gap | Find references for symbol filtered to test dirs → 0 test refs = gap | Add tests around public contract and edge paths |

Use TDD for behavioral fixes when practical: failing test → fix → pass → full suite.

---

## Architecture interpretation

Use these signals when raw findings are noisy:
- **SCC cluster**: treat overlapping cycles as one refactor unit
- **Broker/chokepoint**: high fan-in + high fan-out = dependency pressure node
- **Bridge module**: articulation-style file connecting subsystems
- **Package chatter**: excessive cross-package traffic indicates boundary erosion

Prioritize fixes where hotspots and critical paths overlap.

---

## Metrics cheat sheet

| Metric | Meaning | Typical threshold signal |
|--------|---------|--------------------------|
| Instability `I = Ce / (Ca + Ce)` | how change-prone vs depended-on a module is | stable module depending on more unstable one |
| Cognitive complexity | branch/nesting mental load | >15 tends to need decomposition |
| Maintainability index | overall maintainability score | <20 is high-risk maintainability |
| Halstead effort | estimated comprehension effort | very high effort suggests split/refactor |

Use thresholds as heuristics, not absolute truth.

---

## Worked examples

Three end-to-end validation flows showing how to arrive at **confirmed**, **dismissed**, and **uncertain**.

### Example 1: Confirmed — dead export

**Finding**: `findings.json` reports `dead-export` for `formatDate` in `src/utils/dates.ts` (line 42).

| Step | What was done | Result | Decision |
|------|--------------|--------|----------|
| 1 | Text search for "formatDate" scoped to the file | Match at line 42 — `export function formatDate(...)`. Got lineHint. | — |
| 2 | Find references for `formatDate` at that lineHint, excluding declaration | **0 references** outside the declaration. | No consumers. |
| 3 | Broad text search for "formatDate" across all files (file-list mode) | Only `src/utils/dates.ts` appears. No re-exports, no test imports. | No indirect usage. |

**Verdict**: **Confirmed** (high confidence). Zero consumers in production and test code. Safe to remove the export or delete the function entirely.

---

### Example 2: Dismissed — false-positive coupling hotspot

**Finding**: `architecture.json` lists `src/config/env.ts` as a coupling hotspot (fanIn=45, fanOut=2).

| Step | What was done | Result | Decision |
|------|--------------|--------|----------|
| 1 | Read the full file (25 lines, small enough for full content) | Exports `const ENV = { ... }` — a read-only config object from `process.env`. No logic. | Pure config. |
| 2 | Find references for `ENV` at its declaration, excluding declaration | 45 references across 32 files, all `import { ENV }` followed by property reads. No mutations. | All consumers read-only. |
| 3 | Check churn risk — find files in `src/config` modified within 90 days | Not modified in 90 days. | Stable. |

**Verdict**: **Dismissed**. High fan-in is expected and harmless for a read-only config module. No logic, no mutation, no churn. The scanner flags structural coupling but the semantics show this is a stable leaf — not a refactoring target.

---

### Example 3: Uncertain — god function with partial evidence

**Finding**: `findings.json` reports `god-function` for `processOrder` in `src/orders/handler.ts` (line 88, 120 statements, cognitive complexity 35).

| Step | What was done | Result | Decision |
|------|--------------|--------|----------|
| 1 | Read the function body (line 88-210) | Large function with validation, discount calculation, inventory check, payment call, email dispatch. Multiple concerns interleaved. | Confirms size and complexity. |
| 2 | Incoming call hierarchy for `processOrder` | 3 callers: `POST /orders` route handler, a batch job, and 1 test. | Moderate blast radius. |
| 3 | Outgoing call hierarchy for `processOrder` | Calls 8 functions across 5 files: validateOrder, calcDiscount, checkInventory, chargePayment, sendConfirmation, logAudit, updateMetrics, notifyWarehouse. | Orchestrates many side effects. |
| 4 | Find references filtered to test directories | 1 test reference — a single happy-path integration test. No edge-case coverage. | Sparse test coverage. |

**Verdict**: **Uncertain** (medium confidence). The function is objectively large and complex, and orchestrates many side effects — consistent with a god function. However, it may be intentionally serving as a transaction script (single orchestration point for atomicity). Cannot confirm it's harmful without knowing:
- Whether the callers expect atomic all-or-nothing behavior
- Whether extracting sub-steps would break transaction boundaries
- Whether the team considers this an acceptable orchestration pattern

**Recommendation**: flag for team review. If refactoring, extract pure computation helpers (validation, discount) first — those are side-effect-free and safe. Defer side-effect orchestration changes until transaction semantics are clarified.

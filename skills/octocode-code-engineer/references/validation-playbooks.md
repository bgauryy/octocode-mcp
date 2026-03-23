# Validation Playbooks

Single validation doc for:
- investigation loop (confirm/dismiss/uncertain)
- category-level fix playbooks
- architecture interpretation techniques
- metrics and thresholds used during review

Use this as the canonical "validate before claim" reference.

---

## Validation loop (always)

1. Read finding context (`summary.md` + `findings.json` entry)
2. Run `lspHints` first when provided
3. Read code at the flagged location
4. Trace context with `lspFindReferences` / `lspCallHierarchy`
5. Decide:
   - **confirmed**: evidence supports finding
   - **dismissed**: false positive, explain why
   - **uncertain**: missing data, lower confidence

Never present scanner output as fact without validation.

---

## Category playbooks (compact)

| Category type | Validate with | Typical fix |
|---------------|---------------|-------------|
| Dead export | `lspFindReferences(includeDeclaration=false)` | Remove export or wire real usage |
| Coupling hotspot | `lspFindReferences` fan-in + `lspCallHierarchy(outgoing)` fan-out | Split module by responsibility/consumer group |
| Dependency cycle | `architecture.json` cycle path + import search | Break edge via shared contract/inversion |
| Security sink | Source-to-sink trace via `lspCallHierarchy(incoming)` + guard checks | Add/centralize validation/sanitization before sink |
| God function | Body read + outgoing call map | Extract focused helpers and keep orchestration thin |
| Performance (await-in-loop) | Body read — is each iteration independent? Check for data dependency between iterations | Collect promises and `Promise.all()` / `Promise.allSettled()`. Keep sequential only when iteration N depends on N-1 |
| Performance (sync I/O, listener leak) | Body read — sync `fs.*Sync` on hot path? `on`/`addEventListener` without matching removal? | Replace sync I/O with async equivalent; add `removeEventListener`/`off` in cleanup |
| Test gap | test refs via `includePattern=["**/tests/**"]` | Add tests around public contract and edge paths |

Use TDD for behavioral fixes when practical: failing test -> fix -> pass -> full suite.

---

## Architecture interpretation (advanced)

Use these signals when raw findings are noisy:
- **SCC cluster**: treat overlapping cycles as one refactor unit
- **Broker/chokepoint**: high fan-in + high fan-out => dependency pressure node
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

## Confidence discipline

- **high**: structural proof + direct code evidence
- **medium**: semantic/graph signal confirmed with references/call graph
- **uncertain**: partial evidence or unresolved conflicts

If scan and semantic validation disagree, report both and lower confidence.

---

## Coverage map (finding families)

Use this to confirm broad feature coverage during reviews:

- **Architecture**: cycles, coupling, boundaries, path-risk hubs
- **Code quality**: complexity, maintainability, duplication, unsafe patterns
- **Performance**: loop/await misuse, sync I/O, timer/listener hygiene
- **Security**: sink risks, unsafe evaluation, secret exposure patterns
- **Dead code**: dead exports, dead re-exports, unused dependencies
- **Test quality**: brittle tests, mock-heavy tests, missing cleanup/assertions
- **Semantic** (`--semantic`): type-hierarchy and usage-graph findings

For exact category names in your CLI version, use `index.js --help` and `findings.json` category extraction from [cli-reference.md](./cli-reference.md).

---

## Worked examples

Three end-to-end validation flows showing how to arrive at **confirmed**, **dismissed**, and **uncertain**.

### Example 1: Confirmed — dead export

**Finding**: `findings.json` reports `dead-export` for `formatDate` in `src/utils/dates.ts` (line 42).

| Step | Tool call | Result | Decision |
|------|-----------|--------|----------|
| 1 | `localSearchCode(pattern="formatDate", path="src/utils/dates.ts")` | Match at line 42 — `export function formatDate(...)`. Gets `lineHint=42`. | — |
| 2 | `lspFindReferences(path="src/utils/dates.ts", lineHint=42, includeDeclaration=false)` | **0 references** outside the declaration. | No consumers. |
| 3 | `localSearchCode(pattern="formatDate", filesOnly=true)` | Only `src/utils/dates.ts` appears. No re-exports, no test imports. | No indirect usage. |

**Verdict**: **Confirmed** (high confidence). Zero consumers in production and test code. Safe to remove the export or delete the function entirely.

---

### Example 2: Dismissed — false-positive coupling hotspot

**Finding**: `architecture.json` lists `src/config/env.ts` as a coupling hotspot (fanIn=45, fanOut=2).

| Step | Tool call | Result | Decision |
|------|-----------|--------|----------|
| 1 | `localGetFileContent(path="src/config/env.ts", fullContent=true)` | File exports `const ENV = { ... }` — a read-only config object assembled from `process.env`. 25 lines, no logic. | Pure config. |
| 2 | `lspFindReferences(path="src/config/env.ts", lineHint=3, includeDeclaration=false)` | 45 references across 32 files, all are `import { ENV } from '../config/env'` followed by property reads. No mutations. | All consumers read-only. |
| 3 | Cross-check: does high fan-in cause churn risk? `localFindFiles(path="src/config", modifiedWithin="90d")` | Not modified in 90 days. | Stable. |

**Verdict**: **Dismissed**. High fan-in is expected and harmless for a read-only config module. No logic, no mutation, no churn. The scanner flags structural coupling but the semantics show this is a stable leaf — not a refactoring target.

---

### Example 3: Uncertain — god function with partial evidence

**Finding**: `findings.json` reports `god-function` for `processOrder` in `src/orders/handler.ts` (line 88, 120 statements, cognitive complexity 35).

| Step | Tool call | Result | Decision |
|------|-----------|--------|----------|
| 1 | `localGetFileContent(path="src/orders/handler.ts", startLine=88, endLine=210)` | Large function with validation, discount calculation, inventory check, payment call, email dispatch. Multiple concerns interleaved. | Confirms size and complexity. |
| 2 | `lspCallHierarchy(path="src/orders/handler.ts", lineHint=88, direction="incoming", depth=1)` | 3 callers: `POST /orders` route handler, a batch job, and 1 test. | Moderate blast radius. |
| 3 | `lspCallHierarchy(path="src/orders/handler.ts", lineHint=88, direction="outgoing", depth=1)` | Calls 8 functions across 5 files: `validateOrder`, `calcDiscount`, `checkInventory`, `chargePayment`, `sendConfirmation`, `logAudit`, `updateMetrics`, `notifyWarehouse`. | Orchestrates many side effects. |
| 4 | `lspFindReferences(path="src/orders/handler.ts", lineHint=88, includePattern=["**/tests/**"])` | 1 test reference — a single happy-path integration test. No edge-case coverage. | Sparse test coverage. |

**Verdict**: **Uncertain** (medium confidence). The function is objectively large and complex, and orchestrates many side effects — consistent with a god function. However, it may be intentionally serving as a transaction script (single orchestration point for atomicity). Cannot confirm it's harmful without knowing:
- Whether the callers expect atomic all-or-nothing behavior
- Whether extracting sub-steps would break transaction boundaries
- Whether the team considers this an acceptable orchestration pattern

**Recommendation**: flag for team review. If refactoring, extract pure computation helpers (validation, discount) first — those are side-effect-free and safe. Defer side-effect orchestration changes until transaction semantics are clarified.


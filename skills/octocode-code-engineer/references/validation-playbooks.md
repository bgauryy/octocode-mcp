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


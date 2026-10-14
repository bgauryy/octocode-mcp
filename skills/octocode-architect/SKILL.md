---
name: octocode-architect
description: "Load this skill first whenever the question is about imports or dependencies between modules or packages, cycles, layering, or what has to move in a split or refactor. Use when deciding or changing how a system is structured: module and package boundaries, dependency direction, cycles, contracts, data flow, coupling, reachability, performance hot paths, or the impact of a refactor; good for mapping the architecture from code evidence and making the smallest verified structural change. Not for a written decision document (octocode-rfc-generator), single code or symbol lookups (octocode-research), or behavior-preserving cleanup (octocode-clean-agentic-code)."
---

# Octocode Architect

Scale rigor to consequence; never invent layers, findings, or work.

Tools: `octocode` MCP or `npx -y octocode`. Topology: `npx octocode graph` (persisted snapshot; `graph --help`) or beta `npx octocode astTopology` (needs `OCTOCODE_BETA=true` in the environment or `<HOME>/.octocode/.env`).

```mermaid
flowchart LR
    F[FRAME] --> M[MODEL] --> P[PROVE]
    P --> E{"Edits authorized, seam proven?"}
    E -- yes --> A{"Gated change?"}
    A -- "not authorized" --> Q[Ask first] --> R
    A -- "no or authorized" --> C[CHANGE] --> V[VERIFY]
    E -- no --> R["Findings + plan"]
    V -- "1st fail or wider impact" --> P
    V -- "2nd fail" --> G[Report the gap] --> R
    V -- passes --> D[Done]
    R --> D
```

## Steps

1. Frame: decision, benefit, scope, use case, contract owner. Pin the revision; baseline before claiming a gain.
2. Model: trace representative flows to their consumers, noting shapes, owners, invariants, failure modes.
3. Prove: per finding, Hypothesis test: claim, strongest rival, distinguishing check, result (confirmed, dismissed, or candidate: unresolved, naming the missing check); the only finding-status words.
4. Change: smallest change at the proven boundary, with a focused test that detects the failure.
5. Verify: production-path checks, affected wiring, exit status and payload errors; compare before/after on one measurement.

## When making a claim

- Label rules declared, observed, or inferred; each [view](references/analysis.md#model-the-wiring) answers a different question.
- Static claim: source suffices. Runtime or performance claim: execution evidence.
- Distinguishing checks use distinct IDs, paths, versions, roots and assert the specific failure; when a sharper fixture rejects a finding, keep the disproof.
- Topology edges are syntactic candidates; an edge or style preference is no defect, a type-only cycle no runtime proof. Run the [coverage checks](references/analysis.md#choose-the-narrowest-evidence-lane) before a completeness or absence claim.

## Gates

| When | Do |
|---|---|
| Scope, flow, symbol identity, runtime impact, or measurement unresolved | Report a candidate, not a defect. |
| Public-contract rewire, cross-package move, schema/storage migration, delete, or rename | Ask first unless that exact scope is authorized. |
| Cleanup beyond the change | Clean only what the change caused or touches; broader refactoring needs evidence, an acceptance sensor, authorization. |
| Bookkeeping | Update only what the repo contract requires (docs, manifests, versions, lockfiles, changelogs, snapshots); regenerate derived files, never hand-edit. |
| Reachable path unimplemented | Fail explicitly; tests prove outcomes, not calls. |
| Others' uncommitted work | Coordinate on overlapping paths; never stash, reset, overwrite, or discard it. |

## Resources

| When | Read | Why |
|---|---|---|
| Layers, flows, blast radius, task decomposition; topology, cycles, dead code, duplication, hot paths | [analysis](references/analysis.md) | Evidence lanes, coverage, proof |
| Trust, process, package, or persistence boundary; algorithm or concurrency decides the outcome; reviewing agent work | [checks](references/checks.md) | Contract, data-flow, algorithm, agent-defect checks |
| Before any source edit | [change-discipline](references/change-discipline.md) | Safe moves, slice verification |
| Consequential result | [output.md](output.md#decision-record) | Decision record fields |
| Saving or rendering a report | [render-report.mjs](scripts/render-report.mjs) | HTML view, manifest |

## Related skills

- `octocode-research`: repo, GitHub, package, symbol facts; owns tool choice and live schemas.
- `octocode-rfc-generator`: reviewed decision document.
- `octocode-clean-agentic-code`: behavior-preserving removal.

## Output

Follow [output.md](output.md).

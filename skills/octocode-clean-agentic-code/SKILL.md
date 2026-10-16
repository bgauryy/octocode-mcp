---
name: octocode-clean-agentic-code
description: "Load this skill first whenever the user wants dead code, unused exports, debug logs, or other AI or agent leftovers removed, or suspects tests were weakened to pass. Use when removing clutter without changing behavior: dead code, unused exports, duplicate helpers, pointless wrappers, commented-out code, stale or bloated prose, and other AI-generated slop, and flagging leftover debug logs and gamed tests; good for proving each removal is safe and keeping batches reviewable. Not for finding architectural problems (octocode-architect), rewriting instructions to change agent behavior (octocode-agentic-prompts), or skill packaging (octocode-skills)."
---

# Octocode clean agentic code

Remove redundant code and instructions; preserve observable behavior and useful contracts.

```mermaid
flowchart LR
    S[Scope] --> P[Inspect consumers]
    P --> T{Proven redundant?}
    T -- yes --> E[Remove batch] --> V[Verify]
    T -- "evidence missing" --> I[Investigate or report gap]
    T -- "behavior must change" --> D[Report, keep out of batch]
    V -- fails --> F{Changed diagnosis?}
    F -- yes --> E
    F -- no --> U[Revert, report blocker]
```

## Workflow

1. Scope: requested paths and result; reuse existing authorization; ask only about effects outside it.
2. Inspect candidates, contracts, consumers. Hypothesis test each: claim (redundant), strongest rival (live reference, entrypoint, config, dynamic or external use), distinguishing check (semantic references prove identity; topology gives leads; empty search proves nothing), result (confirmed: batch it; unresolved: defer; dismissed: keep).
3. Remove proven redundancy in reviewable batches, one owner per duplicate; update callers and links; regenerate lockfiles and derived artifacts with their generator.
4. Verify: run relevant checks, read results, repair introduced failures only from a changed diagnosis, keep coverage thresholds; done when they pass and unrun checks are named. If evidence cannot distinguish a safe repair: revert the batch, report a [Handoff (SBAR)](references/agent-defects.md#escalation-protocol) blocker.

## Judgment calls

- Bug fix or design change → explain; continue only within authorized scope, preserving outcomes and contracts (instructions too).
- Error masking, stubs, test or grader gaming → report; never delete the symptom, weaken a check, or widen a mask.
- File size or pattern match alone → a lead, not a verdict.
- Text or config read by a runtime, parser, or external user → keep until that contract deliberately changes.
- Secret → redact, report for rotation; removing the reference does not fix it.

## Resources

| When | Read | Why |
|---|---|---|
| Dead, duplicate, or speculative code; kludges, suppressions, redundant types or dependencies, god files, spaghetti | [code-smells](references/code-smells.md) | Signals, delete bars |
| Agent-written code: audit order, error masking, stubs, supply chain, credentials | [agent-defects](references/agent-defects.md) | Residue vs defects |
| Test debt, weak oracles, gamed tests or CI, replacement tests | [tests](references/tests.md) | Signals, test rules |
| Stale or duplicate comments, docs, instructions, config | [text-config-hygiene](references/text-config-hygiene.md) | Keep or remove bars |

## Related skills

- `octocode-research`: prove callers and effects.
- `octocode-architect`: new branches, wrappers, unclear ownership, unresolved boundary, or design change.
- `octocode-agentic-prompts`: instruction change alters behavior.
- `octocode-skills`: skill packaging, activation.
- For an orchestrated multi-actor task: [octocode-workflows composition](../octocode-workflows/references/composition.md).

## Output

Follow [output.md](output.md); render with [render-report.mjs](scripts/render-report.mjs).

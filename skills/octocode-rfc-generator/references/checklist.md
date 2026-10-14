# RFC checklist

Load when finding or closing questions that could block the decision, or a section needs a diagram.

## Completeness

- Ask only areas that could change the decision or plan; explain an omission only where readers expect the area.

- Goal and scope: user outcome changed? Exclusions? Could the status quo meet acceptance?
- Current state: source or test showing the problem? Revisions, environment, affected callers known?
- Contracts: changes to consumers, stored data, errors, defaults, permissions, compatibility? Owner of each boundary?
- Failure and recovery: partial failure, cancellation, retry, duplicate work? What cannot roll back?
- Alternatives: evidence that would make another option win? Assumptions all options share?
- Delivery: prerequisites first? Who runs migration, rollout, monitoring, rollback, on what trigger?
- Measurement: baseline, target, guardrail, window, check that decide success? Can the metric rise while the outcome worsens?
- Uncertainty: open answers that could reverse the decision? Execution details that can wait, until when?

## Track and close questions

- Each open question sits beside its decision or in Open questions: what is unresolved, why it matters, supporting and conflicting evidence, owner, next check; IDs (`Q1`) when cross-referenced.
- A proposed answer (reviewer, provider, or judge) is not a resolution; only deciding evidence closes a blocker.
- Status: open, contested, resolved, deferred (or the project's terms); `Blocking:` marks a decision blocker, `Non-blocking:` an execution detail. Keep history; revisit when evidence or criteria change.

| When a question becomes | Required basis |
|---|---|
| Resolved (fact or causal claim) | Cited, host-inspected current source or executed check establishing the scoped answer and explaining material counterevidence |
| Resolved (design tradeoff) | Verified prerequisites, explicit owner criteria, competing arguments, rationale, remaining risks |
| Resolved (owner preference) | Recorded owner decision or prior instruction; never guessed |
| Deferred | Execution detail only: impact, owner, concrete proof or deadline trigger, why waiting cannot reverse the decision |
| Blocked or contested | Missing evidence, unreconciled contradiction, unavailable owner, failed check, or exhausted budget; record the smallest next action |

- Never relabel a decision blocker as an execution detail to pass readiness.
- Scope change: give the rationale; recheck dependent goals.
- Consequential question survives source review: consider the optional [clasify review](workflow.md#optional-clasify-review).

## Before declaring ready

- Final recommendation or readiness claim: every decision blocker resolved; every execution question resolved or validly deferred.
- Otherwise, when authority permits, deliver a draft naming each blocker's owner, evidence gap, and next check. Keep material dissent either way.
- Header `status: Proposed` until the owner accepts; only then `Accepted`.

## Diagrams

- A diagram shows the same fact as its section (flow, structure, comparison, proportion, lifecycle, schedule); prose carries the evidence.
- One statable message per diagram, else drop it; split big pictures into overview and details; label non-obvious edges; no decoration.
- Data true to scale, every number cited; mark computed or estimated figures.
- Reuse names from code, schema, and tables (`S1`, `Q1`).
- Argument rests on a `*-beta` chart: also give its numbers in a table (beta types may not render).
- Check meaning, data, and scales yourself; rendering proves none of them.

Types by purpose:
- `flowchart` (`subgraph`): decisions, data or control flow, boundaries, the design; plan steps as a DAG of stated dependencies.
- `sequenceDiagram` (`zenuml` if the team uses it): protocols, retries, handoffs.
- `stateDiagram-v2`: lifecycles, legal and illegal transitions.
- `classDiagram` / `erDiagram`: types and ownership / entities, keys, migrations.
- `C4Context` / `C4Container` / `C4Component` / `architecture-beta`: system and service topology.
- `block-beta` / `packet-beta`: layers / wire and bit formats.
- `requirementDiagram`: requirement-design-test traceability.
- `xychart-beta`: before/after metrics, trends; `bar [...]` measured, flat `line [...]` at target.
- `pie` / `sankey-beta` / `treemap-beta`: composition / split-and-merge flows / hierarchical size.
- `quadrantChart` / `radar-beta`: options on 2 criteria (benefit vs risk) / on 4 to 8.
- `gantt`: rollout only with committed dates or durations; else a flowchart DAG or `timeline`.
- `timeline` / `gitGraph`: rollout phases or decision history / branch, release, rollback.
- `journey` / `mindmap`: steps with friction scores / scope and non-goals.
- `kanban`: status snapshot (rare; prefer the plan table).

Next: the section being drafted ([structure](../output.md#structure)).

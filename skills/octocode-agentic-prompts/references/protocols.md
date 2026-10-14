Load when an instruction describes a handoff, review, decision, reasoning procedure, stop rule, or output in ad-hoc, rigid, or repeated prose.

## Rules vs presentation

"Keep every rule" protects conditions, thresholds, outcomes, identifiers, and constraints. Presentation is free to change; name each change in your change note:

- **Two scales for one judgment** (urgency and impact, type and importance, priority and severity): make one the source of truth and derive the other wherever the original links them. Never invent a mapping it leaves open: keep that judgment and list the missing pairs in the change note for the owner. Drop the derived field only when you own every reader; otherwise keep it and propose the merge. Scales with separate readers that judge different things stay independent.
- **A thinking order or template** ("first list causes, then evidence for and against", fixed headings, "STEP 1…"): drop it; keep what the answer must contain (the conclusion, its evidence, the check that would refute it). Keep an order only when it guards an action in the world (preflight before deploy).

```text
Before: Set Priority (URGENT, HIGH, NORMAL, LOW) and Severity (S1-S4). S1 = data loss or outage. URGENT for S1. Only S1 or S2 page on-call.
After:  Judge Severity: S1 data loss or outage, S2, S3, S4. Priority follows it: S1 → URGENT, S2 → HIGH, S3 → NORMAL, S4 → LOW. S1 and S2 page on-call. Change note: Priority now derives from Severity; drop it if no tool reads it.

Before: Think in this exact structure: list all causes; for each, "Evidence for:" and "Evidence against:"; then pick one.
After:  Answer with the most likely cause, the measurement that supports it, and the result that would show it is not the cause. Change note: thinking template dropped; the answer requirements keep its purpose.
```

## Protocols

- Use a protocol to remove duplication, merge scattered rules, or fill a missing slot (a stop rule, a blocking flag, a rival check); never to relabel a list that is already clear.
- Slots carry the receiver's concrete words ("tests run, exit codes"), not abstract ones ("background"); the protocol name is an optional prefix, never the content.
- Each slot says where it shows up in the output ("prefix the comment `[blocking]`").
- Plain-word slots; define an ambiguous one (MoSCoW "won't": this release or never).
- Project specifics stay verbatim (paths, commands, checks); a protocol never replaces a tool contract, schema, or checked field.
- One owner per protocol line; other files point to it.

| Need | Protocol line | Not for |
|---|---|---|
| Brief, handoff, blocker, readback, reply lead, task outcome | [Message shapes](agents.md#handoff) | Evidence status (confirmed, likely) |
| Stop condition | `Done when: <observable checks>` | Exploration without a budget |
| Cause, finding, claim | `Hypothesis test: claim, strongest rival, distinguishing check, result (confirmed, dismissed, unresolved)` | A lookup one read answers |
| Review comment | `Review comment (Conventional Comments): label (issue, suggestion, question, nitpick, praise), blocking or not (marked in the comment), location, why` | Findings that need evidence, impact, confidence, repair |
| Feedback on a plan | `Objection (blocks; states the consequence) vs concern (non-blocking)` | Style notes |
| Decision record | `Decision (ADR): context, decision, status (proposed, accepted, superseded), consequences` | Every document |
| Failure or retrospective | `After Action Review: intended, happened, why different, next` | Every successful run |
| Independent judgments | `Delphi: same evidence, independent first positions, then share; keep dissent` | One reviewer |
| Risk before committing | `Premortem: assume it failed; list reasons independently` | Scopes a domain checklist already covers |
| Acceptance check | `Check: given <state>, when <action>, then <observable result>` | One command proves it ("exits 0") |
| Page kind | `Diátaxis: tutorial, how-to, reference, explanation; one per page` | Agent instructions |
| Rule strength | Plain imperative; uppercase MUST/NEVER only for safety, permissions, secrets, hard contracts | Emphasis |

Avoid brevity codes and invented abbreviations, loop names (OODA, PDCA) in place of steps that name commands, and full agent-language ontologies when a few verbs suffice.

## Rewrite rigid text

Rigid: all-caps emphasis; exact fields, orders, or word limits with no consumer; one rule in several places; long lists a protocol covers; ordered steps where order does not matter; and the two presentation cases above.

1. Inventory the passage's rules; mark each line rule or presentation.
2. Apply [rules vs presentation](#rules-vs-presentation); then pick a protocol only where it merges or fills a slot, with the project's specifics in its slots.
3. Done when: every rule survives (in a slot or behind a pointer), checked fields are unchanged, the change note names each presentation change, and a reader new to the protocol could act on it.

```text
Before: Carry: goal, scope, result, evidence, gaps, next action, constraints, next-call identifiers.
After:  Handoff (SBAR): goal and scope; result and evidence; confidence and gaps; next action, constraints, next-call ids.
```

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

## Catalog

Cite a protocol by name with its slots in the receiver's words; most models know the name, the slots bind it to this task. Fit rates each one for agent instructions: 5 the default for its need, 4 strong in its niche, 3 situational or largely covered by a higher row, 2 rarely better than a higher row. Ratings are editorial, not measured; a behavioral claim needs `octocode-eval-benchmark`.

### Describe and decide

| Need | Protocol line | Fit | Not for |
|---|---|---|---|
| Issue or task description: bug, finding, backlog item, tool defect | `5W2H: what, where (path:line), when (trigger), who or what it affects, why (cause), how (reproduce or fix), how much (impact)`; "unknown" in a slot nobody verified | 5 | A lookup one read answers |
| Incomplete information | `Facts, assumptions, unknowns`: what evidence shows, what you assume, what nobody checked; never present a guess as a fact | 5 | A fully verified answer |
| Research finding, conclusion | `Claim–evidence`: each claim beside its `path:line`, command result, or source link | 5 | Opinions marked as such |
| Cause of one failure | `Hypothesis test: claim, strongest rival, distinguishing check, result (confirmed, dismissed, unresolved)` | 5 | A lookup one read answers |
| Recurring problem | `5 Whys`: ask why until a cause you can change; check each answer with evidence | 3 | A one-off failure: it follows one chain and can stop at a convenient cause, so prefer a hypothesis test |
| Expected behavior, acceptance | `Given–When–Then: given <state>, when <action>, then <observable result>` | 4 | One command proves it ("exits 0") |
| Architecture choice | `ADR: context, decision, status (proposed, accepted, superseded), consequences` | 4 | Every document |
| Choice someone else must make | `Decision request: options, tradeoffs, recommendation, default if no answer` | 4 | Choices within your own authority |
| Decision with several stakeholders | `DACI: driver, approver, contributors, informed` | 3 | A parent and its workers: the parent or user approves |
| Feedback on a plan | `Objection (blocks; states the consequence) vs concern (non-blocking)` | 4 | Style notes |
| Review comment | `Conventional Comments: label (issue, suggestion, question, nitpick, praise), blocking or not (marked in the comment), location, why` | 4 | Findings that need evidence, impact, confidence, repair (use 5W2H) |
| Independent judgments | `Delphi: same evidence, independent first positions, then share; keep dissent` | 3 | One reviewer |
| Risk before committing | `Premortem: assume it failed; list reasons independently` | 3 | Scopes a domain checklist already covers |

### Delegate and coordinate

| Need | Protocol line | Fit | Not for |
|---|---|---|---|
| Delegation brief | `Task contract: objective, inputs, constraints (scope, authorization), output`, plus a Definition of Done; the worker picks the method | 5 | Work you do yourself |
| Completion of a bounded task | `Definition of Done: <observable checks>` | 5 | Open-ended search (use a stop condition) |
| Open-ended search or iteration | `Stop condition: done when <checks>; escalate when <boundary: budget spent, no new lead, missing decision>` | 5 | A bounded task with a Definition of Done |
| Goal quality | `SMART`: specific, measurable, achievable, relevant, time-bound; a check on a goal or Definition of Done, not a separate field | 3 | Agent goals where "achievable, relevant" change no action |
| Costly delegation | `Budget contract`: time, token, or tool-call limits; at exhaustion return partial results and what remains | 4 | Cheap tasks |
| Large background | `Context manifest`: paths or URLs, version or commit, why each matters | 4 | Material that fits in the brief |
| Shared responsibilities | `RACI: responsible (does), accountable (owns), consulted, informed` | 3 | One worker; a Pi parent is accountable by default |
| Consequential or ambiguous instruction | `Check-back`: the receiver restates objective and Definition of Done before it edits or spends | 4 | Routine, reversible steps |

### Report and hand off

| Need | Protocol line | Fit | Not for |
|---|---|---|---|
| Any result, reply, report | `BLUF`: conclusion and confidence first, then evidence, limits, next check | 5 | — |
| Transfer of unfinished work | `Handoff packet: current state, evidence, blockers, next action, constraints, next-call ids`; no raw logs, private reasoning, or abandoned branches | 5 | Finished work (report BLUF) |
| Problem that needs someone else's action | `SBAR: situation, background, assessment, recommendation` | 4 | A problem you can resolve yourself |
| Progress on shared state | `Delta update`: only what changed since the last update (phase, change, blocker, next action) | 4 | The first report |
| Deviation from plan | `Exception report`: report only deviations, each in SBAR | 3 | Normal progress; the name adds only the "report exceptions" trigger to SBAR |
| Work that spans sessions or interruptions | `Checkpoint–resume`: goal, done, in progress, next, open questions, files | 4 | Short tasks |
| Failure or retrospective | `After Action Review: intended, happened, why different, next` | 3 | Every successful run |
| Completed-work summary | `STAR: situation, task, action, result` | 2 | Agent consumers: BLUF puts the result first; retrospectives use After Action Review |

### Loops and failures

| Need | Protocol line | Fit | Not for |
|---|---|---|---|
| Transient failure | `Bounded retry`: retry limit, backoff, then escalate; a reasoning retry needs a revised hypothesis | 4 | Permanent errors: fix or report them |
| Improving a repeatable workflow | `PDCA`: plan the change, do it, check against a baseline, act (keep or revert); name the command in each step | 3 | One-off tasks |
| Plan invalidated mid-execution | `OODA`: observe fresh state, orient, decide, act | 2 | Tool loops that already re-read state |
| Repeatable request with side effects | `Idempotency key`: one key per effect; the receiver drops duplicates | 2 | Agent wording: it belongs in tool and protocol design ([cross-app alignment](agents.md#cross-app-alignment)) |

### Writing

| Need | Protocol line | Fit | Not for |
|---|---|---|---|
| Page kind | `Diátaxis: tutorial, how-to, reference, explanation; one per page` | 4 | Agent instructions |
| Rule strength | Plain imperative; uppercase MUST/NEVER only for safety, permissions, secrets, hard contracts | 5 | Emphasis |

Avoid brevity codes and invented abbreviations, loop names (OODA, PDCA) in place of steps that name commands, and full agent-language ontologies when a few verbs suffice.

## Rewrite rigid text

Rigid: all-caps emphasis; exact fields, orders, or word limits with no consumer; one rule in several places; long lists a protocol covers; ordered steps where order does not matter; and the two presentation cases above.

1. Inventory the passage's rules; mark each line rule or presentation.
2. Apply [rules vs presentation](#rules-vs-presentation); then pick a protocol only where it merges or fills a slot, with the project's specifics in its slots.
3. Definition of Done: every rule survives (in a slot or behind a pointer), checked fields are unchanged, the change note names each presentation change, and a reader new to the protocol could act on it.

```text
Before: Carry: goal, scope, result, evidence, gaps, next action, constraints, next-call identifiers.
After:  Handoff packet: goal and scope as current state; result and evidence; confidence and gaps as blockers; next action, constraints, next-call ids.
```

# Idea brief

Use when saving a brief under the rule in [output](../output.md): follow a requested destination, or default to `<workspace>/.octocode/octocode-brainstorming/<YYYY-MM-DD>-<slug>.md`. This is the extended form of the saved report; adapt it to the decision and omit empty optional sections.

```markdown
---
status: Recommended
confidence: medium
question: {Decision or question, one line}
next: {Smallest useful test or step, one line}
---

# {Decision or question}

{Lead paragraph: the recommendation and why, in two or three sentences.}

## Context

The issue, constraints, known facts, and evidence that could change the choice. Include dates or versions only where they affect the evidence.

## Directions

| Direction | Conclusion and rationale | Deciding sources and relevant dates | Counterevidence, quality, and limits |
|---|---|---|---|

Include incomplete or blocked directions and material limits to independent review.
Keep worker identities, search logs, tool inventories, and generated metadata out.

## Comparison

Explain which directions survived, changed, or were rejected and why.
Distinguish direct evidence from inference. Reconcile contradictions where
possible and retain material dissent and credible alternatives.

## Recommendation

The best-supported choice and why it beat the others.

## Dissent

The strongest objection to the recommendation and what would make it win.

## Limits

Evidence limits, remaining gaps, and as-of dates for changing evidence.

## Next action

The smallest useful test, implementation step, narrower question, or reopening signal.
For an RFC handoff, include the decision, constraints, alternatives, evidence,
acceptance criteria, and unresolved questions that its author needs.

## Sources

- {URL or path} — {claim supported, relevant source/event date, quality or limits}
```

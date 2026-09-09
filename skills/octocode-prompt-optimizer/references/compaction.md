# Compaction: what to cut and when

Load when a running context must shrink: transcripts, tool logs, or accumulated state approach the window, or a prompt proposes summarizing content it may need later. Why: a token removed from context is unreachable — the model keeps no partial memory of it.

**Frame — compress state, not evidence.** Reclaim positions from content that no longer informs the next decision; keep every token a later step must resolve.

## Cut and keep

| Cut — no longer informs the next decision | Never cut — unreachable once dropped |
|---|---|
| Repeated tool logs, duplicate search results | Identifiers: IDs, hashes, versions, exact paths |
| Failed attempts whose lesson you recorded in one line | Exact parameters: arguments, flags, limits, thresholds |
| Boilerplate: banners, help text, unchanged headers, retry noise | Failure specifics: exception type, error code, stack frames |
| Hypotheses later evidence closed, minus the conclusion and its evidence ID | Ordering: event sequence, timestamps, causal order |
| Resolved subtasks the evidence store can re-derive | Citations, permissions and scope, experimental settings |
| — | Open derivations: reasoning not yet concluded |

Filtering the left column can raise accuracy, not only cut cost — reported large QA gains at roughly 4× fewer tokens. The same operation on the right column produces blocked actions and repeated exploration.

## When to compact

- Prefer compaction at subtask boundaries. If the context limit arrives during a derivation, checkpoint its assumptions, evidence, unresolved branches, and next action in retrievable state before compacting.
- Avoid repeated lossy summaries of summaries. When another pass is needed, rebuild active state from original evidence and verify that required facts and unresolved work remain recoverable.
- Never compact away an incomplete-result marker, an approval requirement, an error, or a recovery path.

## Keep evidence retrievable

1. **Active context** — goal, constraints, hypotheses, key results, next action.
2. **Evidence index** — IDs resolving to passages, URLs, paths, code locations, tool outputs.
3. **Cold store** — the originals, re-insertable on demand.
4. **Verification** — reopen the primary source before any consequential conclusion.

An ID turns an impossible recall into a cheap re-insertion. Never let a summary become the only copy: "the endpoint is vulnerable" without the threat model, budget, metric, and version destroyed the finding rather than compressing it — if `E12` resolves to nothing, the claim is uncheckable.

Keep a fixed layout for what survives — goal, constraints, findings, open questions, next action — so each variable sits where the model expects it. Mechanism-derived, not measured: claim no token or accuracy win for the schema itself. Placement of the surviving rules belongs to `references/attention.md`; prefix stability to `references/prompt-caching.md`.

## Guardrails

- Do not invent abbreviations and expect decoding: a prompt glossary asks for projections that were never trained, and the shorthand may tokenize worse than the prose it replaced. Use compact notation for pipeline consistency, not for claimed savings.
- Do not shorten by deleting vowels, articles, or sentence structure — worse tokenization, added ambiguity, no saving.
- Long-horizon agent runs are the known failure case for recurrent lossy compaction; require evidence before enabling it there.
- Never claim a compaction helped without the measurement in `references/token-measurement.md`.

## Sources
- Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — finite attention budget, compaction, and retrieval over recall.
- Jiang et al., [LongLLMLingua](https://arxiv.org/abs/2310.06839) — removing low-information content raised accuracy at roughly 4× fewer tokens.

Next: to choose a ratio or prove the cut helped load `references/token-measurement.md`; for what to fetch in the first place load `references/context-budget.md`; for placement of the surviving rules load `references/attention.md`.

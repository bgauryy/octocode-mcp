# Token measurement and compression ratios

Load before claiming a prompt or context change saved tokens, before choosing a compression ratio, and before adopting a published one. Why: a format that looks shorter can cost more, and a ratio without its operating point is not a result.

**Measure tokens per fact against uncompressed.** Beating another compressor is not beating full context.

## Count tokens, never characters

Run candidate formats through the production tokenizer and compare **tokens per fact**, not tokens per block. `!EV12` can split into more tokens than the prose it replaced, and a shorter block that dropped two identifiers did not win.

## Baseline and harness

- Compare against **uncompressed**, not merely against another compression method.
- Reproduce on your own tasks before adopting anything: independent harnesses have returned opposite verdicts on the same published method.
- Expect benchmark gains to overstate real-task gains; measure the real workflow.

## How much to compress

- Choose the reduction through evaluation on the target workflow; no fixed compression ratio is a universal safe setting.
- Never state a ratio without its operating point: model, task, and context length. The same setting degrades further as context grows. This applies to ratios you report yourself.

## Choose the lever

| Lever | Real token reduction | Evidence |
|---|---|---|
| Trained compressor or learned latent representation | Large — 4× to 16× reported | Strong, multi-source |
| Automatic selection or filtering of low-information tokens | Moderate — around 2× at small quality cost | Strong |
| Tokenizer or vocabulary adaptation | Real, but needs continued training | Supported, not free |
| Hand-authored structured schema with evidence IDs | Unknown | No study found |
| Invented shorthand in the prompt | Unreliable, possibly negative | No supporting study |

When simple deduplication is insufficient, compare retrieval, a trained compressor, or a relevance filter against the uncompressed baseline. Report measured results for the chosen method and task rather than inferring a win from its format.

## Verify the change

- Test simultaneous facts, unresolved work, and delayed retrieval representative of the task; one easy lookup does not establish broad fidelity.
- Report **variance, not only the mean**: pair solved-in-both-of-two-runs with average accuracy. Instability is the characteristic compression failure and a mean hides it.
- Track **failure character**: occasional total derailment is worse than a uniform, larger decline in security, coding, and operational work.

## Sources
- Jiang et al., [LLMLingua](https://arxiv.org/abs/2310.05736) and [LongLLMLingua](https://arxiv.org/abs/2310.06839) — automatic low-information token filtering and its reported operating points.
- Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — finite attention budget and minimal high-signal context.

Next: to decide what the ratio is allowed to remove load `references/compaction.md`; for the scenarios, verifiers, and failure ledger this measurement runs against load `references/evaluation-data.md`.

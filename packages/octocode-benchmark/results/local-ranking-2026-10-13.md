# Local relevance ranking: measured context savings

On 2026-10-13, five broad local lookups used **51,921 → 8,168 tool-response tokens (84.3% less)** when ranked evidence brought the frozen target forward. These are sums of per-case medians, using `o200k_base`. The same responses measured **83.9% less** with `cl100k_base`. Every final positive trial reached its target. This supports opt-in ranking for broad lookups; it does not establish lower combined token use, cost, or latency.

The [machine-readable counts](local-ranking-2026-10-13.json) include all final trials, both tokenizers, response hashes, provider usage, and source/binary identities. [Feature guide](../../../docs/OCTOCODE_CLASIFY.md#how-this-can-save-context).

## Method

The RFC preceded implementation. Queries, goals, source revisions, target anchors, and the stopping rule were frozen before live comparison. Three conditions used identical source bytes and the same binary: ordinary calls without goals; ranking disabled with goals; and ranking enabled with goals. The disabled-with-goals condition measures receipt overhead independently of provider work. Defaults were 64 complete candidates, 131,072 evidence characters, and a 10-second ranking timeout.

Each request used a fresh CLI process. The harness followed executable continuations until every frozen target line appeared for fetch, or the target file appeared for search discovery. The no-answer control exhausted every page. Search discovery is not a complete agent answer or a full walk of every match. The classifier saw production evidence and goals, never answer keys. Development had three final repeats per broad task; controls and held-out tasks had one final run each.

The initial metric was complete serialized-response characters. A follow-up used `tiktoken` 0.12.0 to count the retained compact JSON responses plus newlines with `o200k_base` and `cl100k_base`; reconstructed serialization agreed with all saved character counts. Requests, message framing, conversation reuse, reasoning, and final answers are excluded. No new classifier requests were needed for tokenization. These are measured tool-response tokens, not observed main-model billing. Provider tokens use its own API accounting. [Tokenizer implementation](https://github.com/openai/tiktoken).

## Results

Broad values are medians; the other values are single final runs.

| Task | Plain tokens | Ranked tokens | Change |
|---|---:|---:|---:|
| django-savepoint-callbacks (broad) | 5,633 | 2,186 | 61.2% less |
| tokio-reserve-cancellation (broad) | 16,929 | 2,544 | 85.0% less |
| redis-replica-priority (broad) | 13,926 | 1,425 | 89.8% less |
| django-concurrent-index-operation (broad) | 9,698 | 1,117 | 88.5% less |
| tokio-barrier-cancel-safety (broad) | 5,735 | 896 | 84.4% less |
| anchored-control (control) | 136 | 159 | 16.9% more |
| irrelevant-control (control) | 46,604 | 66,176 | 42.0% more |
| tokio-semaphore-cancellation (held-out) | 8,807 | 1,118 | 87.3% less |
| express-cookie-samesite (held-out) | 13,402 | 2,847 | 78.8% less |

The Tokio reserve ranked range was 1,237–2,548 tokens. Redis ranked 64 of 67 windows and retained the unranked tail. The exact five-line read skipped classification because there was only one candidate, but its receipt added context. The irrelevant goal exhausted 47 pages: nothing could be saved by changing order. Controls are excluded from the positive aggregate and shown explicitly because they determine when the feature should stay off.

## Provider work and economics

| Workload | Provider requests | Reported input tokens | Reported output tokens |
|---|---:|---:|---:|
| Five broad tasks, one run | 170 | 166,765 | 3,230 |
| Five broad tasks, three final runs | 510 | 500,295 | 9,690 |
| Two controls | 64 | 68,514 | 1,216 |
| Two final held-out tasks | 85 | 115,500 | 1,615 |

Ordinary and disabled calls made no classifier requests. Ranked continuations reused the plan without classifying again. A fresh ranking operation can repeat that provider work.

The five-task context reduction was 43,753 tokens, smaller than the classifier's reported input. Input-only monetary break-even would require the main model's effective input price to be roughly 3.81 times the classifier's, before classifier output charges. This conditional estimate compares different token accounting and one pass over responses. Actual cost needs cached/uncached main-model input, provider usage, repeated conversation context, verification reads, retries, output, and answer quality. No monetary saving is established here. Debug builds and concurrent repository checks make recorded wall times unsuitable for a speed claim.

## Provenance and limits

The measured binary SHA-256 was `2a531820a4388f0952aed246d1106ba56db6cf205db8cb98962d784f483294ab`. Pinned source revisions are in the JSON: Django, Tokio, Redis, and Express 5.1.0. Raw request/response traces and frozen cases remain in the local evaluation archive; they are not bundled with this report, so the published summary alone cannot reproduce provider rankings or retokenize raw responses.

Earlier failures remain in that archive: the first development trial exposed a canonical-path continuation bug; it was repaired before the three final repeats. The first held-out run lacked Express's allowed source root; all conditions failed before provider work, and both unchanged held-out cases were rerun after correcting the environment. Across all retained live iterations, including these failures and retries, 35 initial ranking operations used 1,153 provider requests and reported 1,184,080 input / 21,907 output tokens. Probes and loopback tests are excluded.

Later protocol, schema-gating, and prompt improvements have separate correctness checks; these measurements have not been relabeled as live results from those later builds. This is a small source-location benchmark, not a model leaderboard, complete-agent answer evaluation, or direct comparison between local ranking and public `clasify`. Ranking does not retrieve outside lexical search scope, prove absence, or remove the need to verify every required condition. Whole-agent quality, representative workload savings, release latency, and combined cost remain open measurements.

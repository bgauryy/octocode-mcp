---
status: Keep
confidence: low
question: Where do local goals and clasify justify their added work?
---

# Selective semantic routing — 2026-10-13

Keep goals and clasify optional. Goals brought sufficient source earlier than sequential reading, but the cheapest tested exact query won on both questions. The red team also caught a fixed-line-window grader that continued reading after the answer was already present. This report distinguishes retrospective source sufficiency from every incurred cost. It supports narrower guidance, not automatic economic route choice or improved review accuracy.

## Question

Can semantic selection avoid source reads while retaining evidence? When should ordinary text search, bounded reads, AST, LSP, and executable checks remain the preferred route?

## Conditions

White and red agents independently executed and challenged fixed workflows. White used the requested GPT-6-sol helper; these were not autonomous agent route-choice trials. Classification used the `jev-latest` alias; its resolved model version was unavailable. The tasks used pinned local Django documentation and Tokio source. Plans and source hashes, independent adequacy explanations, every trial, and both token encodings are retained in [results JSON](selective-semantics-2026-10-13.json).

These are exposed development cases, with two Django repeats and one Tokio run. White's frozen budget was at most 80 requests / 100,000 input tokens. The remaining 2,950 input-token budget prevented another paired Tokio repetition. Red ran scripted loopback controls and, after seeing Django results, two stronger exact-query challenges. No provider quality retries followed the findings.

Counts use `tiktoken 0.12.0` over complete CLI responses, not source-only text. Tables use `o200k_base`; JSON also contains `cl100k_base`. Original Django calls retained parsed JSON and character counts, so their token counts reconstruct compact UTF-8 JSON plus LF, matching every recorded character count. Later repairs and Tokio calls retain literal stdout.

## Results

### Development source-adequacy adjudication

The original fixed-line-window grader is **invalid as first-sufficient-evidence measurement**. Independent post-result source inspection established earlier adequate prefixes. This correction is retrospective; it does not claim an agent actually stopped there. All incurred costs remain included.

| Question / route | Adequate prefix: calls / response tokens | All incurred response tokens per trial | Classifier requests / input / output per trial |
|---|---:|---:|---:|
| Django sequential pages | 6 / 4,814 | 5,675 | 0 / 0 / 0 |
| Django goals, repeats 1 / 2 | 1 / 1,058; 1 / 1,051 | 2,204; 2,190 | 15 / 15,253 / 285 each |
| Django literal `savepoint` | 1 / 873 | 1,742 | 0 / 0 / 0 |
| Django Locate + source, repaired hint parser | 2 / 371 | 493 | 3 / 13,204 / 1,913 each |
| Tokio sequential pages | 4 / 3,433 | 3,433 | 0 / 0 / 0 |
| Tokio goals | 1 / 1,254 | 7,070 | 8 / 9,248 / 152 |
| Tokio literal `closed` | 1 / 1,016 | 1,016 | 0 / 0 / 0 |
| Tokio literal `reserve` | Partial evidence | 8,614 | 0 / 0 / 0 |
| Tokio Locate + source | Insufficient evidence | 499 | 4 / 30,888 / 4,634 |

Goals reduced sufficient-source prefix tokens by **78.1%** for Django and **63.5%** for Tokio versus sequential reading. Django lines 346–350 answer the callback rollback question; waiting for the complete original anchor through line 361 overread every sufficient route. Tokio goals page 1 already says outstanding permits delay receiver closure, despite ranking only 8 of 34 candidate windows. Six pages were incurred by the anchor grader, not required for proof.

Django Locate originally failed because the harness checked only page-level hints. Its saved query-level read lead was valid. White read both saved public windows without reclassification; the first suffices. The plan promised an additional exact verifier read for every arm, but ordinary/goals/literal outputs already contained original source and no additional read was executed. We preserve that deviation and do not invent its cost.

Tokio Locate's high-scoring 240–247 window omits the deciding close/permit contract. Its incurred total includes a duplicate relative/absolute-path read. No unexecuted recovery is credited. The `reserve` route supplies relevant evidence that reserved sends can succeed after close, but not the complete documented receiver termination condition.

### Post-result exact challenge

| Django exact query from task wording | Calls | Response tokens | Classifier requests |
|---|---:|---:|---:|
| `savepoint is rolled back`, context 10 | 1 | 266 | 0 |
| `rolled back`, context 3, then returned-hit context | 2 | 1,171 | 0 |

Both supply adequate source. The first beats goals and Locate; it was chosen after inspecting results and is not a replacement frozen baseline. Tokio's frozen `closed` control also beats goals. Both cheapest tested adequate exact routes avoid classification entirely. File size alone therefore does not establish a semantic benefit.

### Deterministic negative and misuse controls

| Control | Result |
|---|---|
| Ten prescribed exact, single-candidate, unsupported-view, explicit-sort, AST, LSP and exhaustive routes | Zero provider calls; required evidence and continuations preserved |
| Tiny three-file exact result with explicit goals | Three scripted provider calls |
| Exact 35-line range with explicit goals | Two scripted provider calls |
| Same relevance goal nested in goals + public clasify | Six scripted provider calls: two semantic stages |
| Independent source/coverage audit | 15/15 checks passed |

All 13 planned CLI probes and one supplementary host mechanism check passed. The 11 loopback HTTP requests used synthetic receipts, not model usage. They show runtime mechanics under prescribed calls; explicit unnecessary semantic requests are still possible.

The earlier [PR/AST/LSP evaluation](review-classification-2026-10-13.md) rejected automatic finding dismissal: a synthetic regression was dismissed and missing-context packets received definite answers. Candidate promotion did not ensure savings after source reads. A selected patch cost 92 judgment tokens plus the same 718-token patch, versus 718 direct. A precise AST condition cost 64 tokens with no classifier. LSP identity and missing caller coverage still require their own evidence.

## Guardrails

The owning core MCP instructions, tool and field descriptions, canonical research skill, and [classification guide](../../../docs/OCTOCODE_CLASIFY.md#ranked-content-or-a-clasify-matrix) now say: try cheap exact evidence first; use semantic selection only when captured scope supports the decision and selective reads can avoid work. Choose goals for source content, clasify for locations or a needed typed label, and one semantic stage per relevance decision.

Local ranking stays disabled by default. Schemas expose optional `goals` only with ranking enabled and clasify available. Runtime skips unsupported/single-candidate cases but does not infer every explicit goal's economic value. Local ranking shares a lower-level provider adapter; public clasify uses normal secured read dispatch. Multiple goals rank by any goal, not proof of all goals. Scores never remove evidence, establish absence, resolve identity, or prove a finding.

Full repository verification, core tests (662), lint/typecheck/build, contract regeneration, native/CLI/MCP rebuilds, and all 34 ranking acceptance checks passed. Fresh CLI/MCP capture confirmed the revised descriptions and conditional field exposure. Canonical skill review passed with no errors or warnings.

## Limits

Real classifier work totaled **48 requests, 97,050 reported input tokens and 9,182 output tokens**, including unsuccessful work. All requests had usage receipts. Provider tokens remain separate from response counts. No net token, monetary, main-agent conversation, cached-input or latency-distribution saving is established.

Two exposed questions and repeated fixed workflows cannot establish general reliability, autonomous stopping, automatic selection accuracy, model superiority, or better review quality. Corrected prefixes are post-result manual adjudication. The original errors and all incurred costs remain in the JSON. Full raw calls, frozen plans and runnable local evidence are retained in this workspace at `.octocode/octocode-eval-benchmark/2026-10-13-selective-semantics/`; that ignored directory is not part of this versioned report.

The prior [84.3% reduction](local-ranking-2026-10-13.md) used broad/sequential routes through fixed source anchors, not the strongest task-word exact baselines. It remains a result for those conditions, not a general savings rate or necessarily the earliest semantic answer.

## Decision

**KEEP the optional feature and narrower guidance. Reject automatic semantic invocation and review filtering.** Earlier relevant source can reduce caller context, but exact task-word queries won both latest comparisons. Source verification and complete continuations are required; a small response without adequate evidence is not a successful saving.

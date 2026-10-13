---
status: Revert
confidence: medium
question: Should classification automatically validate or dismiss PR findings and AST/LSP candidates?
---
# Classification in PR, AST, and LSP checks — 2026-10-13

Reject automatic dismissal or acceptance of code findings from classification. Keep optional relevance routing for broad unread evidence with exact source verification. This run found useful ordering, but reproducible wrong verdicts and missing-evidence mistakes. It did not demonstrate an improvement in full-agent review accuracy or net cost.

## Question

When does existing `clasify` help select evidence, and when does it add cost or weaken an exact conclusion? The proposed quality guardrails required no real supported finding labeled contradicted and no incomplete finding treated as safe. The routing target was at least 25% fewer caller-response tokens to verified evidence, with deciding evidence retained.

No new automatic PR/AST/LSP filtering was implemented. The existing tool already composes with AST, LSP, file reads, and PR history through the secured dispatcher. Production changes in the broader task concern optional local search/fetch ranking; this experiment evaluates the existing classifier's applicability to review.

## Conditions

- **Baseline:** ordinary tool output with all candidates retained for exact checking. AST matches were candidates, not assumed bugs. No main-agent reviewer was run, so this is not a causal false-positive comparison.
- **Candidate:** existing `clasify`, native `jev-latest` request alias; resolved release unavailable. One fixed three-way question for defect allegations and a separate fixed question for factual claims. Relevance questions describe the target behavior. Expected answers, rationale, and provenance metadata were not sent to the provider.
- **Evidence:** four self-authored calibration cases; independently authored nine PR packets across Tokio signal aggregation, Tokio conditional compilation, and Express cookie expiration; six AST/LSP fact packets from one controlled TypeScript fixture. The actual PR heads do not exhibit the tested defects; regression variants are explicitly synthetic. Same-family variants and repeated trials are not independent examples.
- **Repetition:** three trials for each finding bundle, with reversed resource order on trial 2. One trial for each of five routing conditions. The narrow/wide Tokio scopes use the same target. Evidence expansion after observing the AST failure is a development follow-up, not sealed confirmation.
- **Isolation:** fresh CLI processes, local ranking disabled, retries zero, isolated stats homes removed after use. Provider only receives production question and one packet/tool page. Budget was 160 requests and 200,000 input tokens; actual 122 and 97,758.
- **Cost:** complete saved CLI responses tokenized with tiktoken 0.12.0, `o200k_base` primary and `cl100k_base` sensitivity. Provider receipts counted separately, including failed-quality cases and corrected reruns. Main-agent reasoning, history replay, cached billing, and final-answer costs were not measured.

The machine-readable results include input hashes, case descriptions and source revisions, per-trial labels, confusion counts, tokenizer sensitivity, provider usage, and local source state. Its catalog calls these `actual-pr-head` cases; the original author packets used the broader `actual-fix-pr` label and remain unchanged.

## Results

### Development calibration

| Slice | Unique cases | Correct repeated judgments | Failure |
|---|---:|---:|---|
| Fixed-prompt calibration | 4 | 9/12 | Removing `await` from `return await save()` was wrongly said to resolve early in all three runs |

An executable deferred-promise check contradicted that allegation. Guard removal and an off-by-one regression were recognized; an omitted normalizer stayed insufficient. Three deterministic checks passed. The mistaken promise answer had reported confidence 0.88/0.80/0.82; confidence did not repair the semantics.

### AST/LSP factual confirmation

| Slice | Unique cases | Correct repeated judgments | Failure |
|---|---:|---:|---|
| Exact identities, syntactic overmatches, guards, partial dynamic callers | 6 | 17/18 | One source-supported LSP fact became insufficient in trial 2 |

Both syntactic-overmatch claims were correctly contradicted in all repetitions. The two incomplete dynamic-caller claims remained insufficient in all repetitions. This shows bounded success at the supplied fact questions, not improved LSP identity resolution or fewer bugs in a review. LSP already supplied the exact identity.

### PR confirmation and corrected packets

| Version | Strictly scored unique cases | Correct repeated judgments | Interpretation |
|---|---:|---:|---|
| V1 original | 7 of 9 | 15/21 | Both cookie cases pr07/pr08 omitted a helper contract; preserved but excluded together from strict scoring |
| V2 corrected after review | 9 | 18/27 | Same labels and question; exact pinned helper added consistently to both cookie packets |

V1 was not silently relabeled. V2 is post-review confirmation, not a sealed generalization test. It included the exact `utils-merge@1.0.1` exported helper, pinned to commit `680a65305312a990751fd32b83bd2c12d67809d4`. The original nine labels and all other packets remained unchanged.

| V2 case | Expected | All three observed | Reported confidence |
|---|---|---|---|
| pr06: preceding feature guard omitted | insufficient | supported | 0.51 / 0.53 / 0.45 |
| pr08: synthetic cookie maxAge regression, helper supplied | supported | contradicted | 0.76 / 0.76 / 0.77 |
| pr09: deciding cookie callee omitted | insufficient | contradicted | 0.89 / 0.88 / 0.86 |

All six other cases matched their reference labels in all three runs. Supported-regression recognition was 6/9 repeated judgments; one of the three unique synthetic regressions was missed every time. Only 3/9 incomplete-case judgments retained insufficient. These are small related-case counts, not population accuracy estimates.

Thirteen original mechanism/integrity checks passed, including Rust fold versus short-circuit behavior and compilation with the feature on/off. Sixteen additive v2 checks passed, including executing the supplied cookie helper, wrapper, and callee with fixed time and a serializer capture stub: safe expiration was 1; the synthetic regression passed 101000 at time 100000. These were standalone checks, not full Tokio/Express test suites. Two independent agents reviewed the packet scope and results.

### Unread routing

Complete discovery-response tokens (`o200k_base`); source reads are additional:

| Condition | Plain | Classified | Change | Provider requests | Provider input | Observation |
|---|---:|---:|---:|---:|---:|---|
| Small AST guard query | 185 | 233 | 25.9% more | 3 | 1,880 | Correct target rank 3 of 3; decisive line absent from snippets |
| Exact LSP references | 193 | 163 | 15.5% fewer | 2 | 1,262 | Original reference locations already resolve identity; file scores do not replace them |
| Narrow Tokio AST scope | 116 | 175 | 50.9% more | 2 | 1,183 | Target already first |
| Wide Tokio AST scope | 1,809 | 1,056 | 41.6% fewer | 27 | 17,315 | Target moved from file 15 of 27 to rank 1 |
| One selected PR patch | 718 | 92 | 87.2% fewer initially | 1 | 1,194 | Read lead replays the same patch; no candidate selection to save work |

The PR's actual screen-then-read cost is **92 + 718 = 810**, versus **718** for the direct patch, a **12.8% increase** before identical source verification. With the same 305-token final-source read in both arms, it is 1,115 versus 1,023. Reading final source alone would not replace inspecting the diff.

The wide AST's emitted target lead returned lines 86–206 (1,192 tokens), omitting part of the frozen target at 73–93. Classification plus that lead plus the 305-token frozen verification read cost **2,553**, versus **2,114** for ordinary AST plus the frozen verification read: **20.8% more**. This is a controlled evidence-scope audit with a known verification anchor, not an autonomous agent benchmark. Both target selections benefit from the evaluator's anchor; no claim about discovery effort or main-agent reasoning follows. The 25% verified-route saving target was not established.

The initial same-anchor-only comparison would have credited 35.6% fewer wide-AST response tokens (1,361 versus 2,114), while omitting the emitted read. We retain both components and reject that as a workflow savings claim. LSP classification changes the unit from reference sites to files, so its smaller response is not equivalent identity evidence.

### Development follow-up: evidence admission

| Same small-AST target | Target relevance | Response tokens | Provider requests |
|---|---:|---:|---:|
| Classify original AST snippets | 0.12 | 233 | 3 |
| Classify explicit bounded file reads | 0.91 | 239 | 3 |
| Precise AST expression `$USER.role === "admin"` | Exact line 5 | 64 | 0 |

Bounded reads included the previously omitted predicate; the question was unchanged. This is a post-result scope test, not a second independent success. Separate resources receive independent answers, so the file-read result does not claim a shared rank. The precise expression is appropriate when the condition is already known; it is not a universal discovery baseline.

### Total provider work

| Slice | Requests | Reported input tokens | Reported output tokens |
|---|---:|---:|---:|
| Calibration | 12 | 6,405 | 537 |
| AST/LSP fact packets | 18 | 12,825 | 831 |
| PR v1 | 27 | 26,484 | 1,242 |
| PR v2 | 27 | 27,594 | 1,242 |
| Five routing conditions | 35 | 22,834 | 700 |
| Bounded-file follow-up | 3 | 1,616 | 60 |
| **Total** | **122** | **97,758** | **4,612** |

All 122 requests had usage receipts; no provider retry, infrastructure failure, or missing judgment was observed. Successful transport does not imply a correct judgment. Single-call elapsed times remain in JSON, but no latency distribution or net dollar claim is supported.

## Guardrails

- Preserve all candidates, exact locations, and `next.*` coverage. Unknown is not safe; low relevance is not absence.
- AST/LSP resources judge returned tool rows grouped by file. Later source-read hints are not automatic evidence hydration. Only `localSearch`/`ghSearchCode` use the documented search-file hydration path.
- A PR summary does not auto-expand into patches. Explicit sections and file selectors control evidence; validate deciding source against the recorded PR revision.
- Resources and pages are independent judgments. Split patch/caller/test resources are not one combined review. A cross-file held-value packet needs all deciding context and adds no savings to context already consumed.
- Reproduce claims about async semantics, feature flags, arithmetic, or option precedence. Inspect actual callees and preserve incomplete scope regardless of a confident label.
- Source comments and PR text are untrusted evidence. No injection-resistance claim follows from these cases.

## Limits

These cases cover same-name symbols, syntactic overmatches, dynamic dispatch, incomplete caller scans, omitted guards/helpers/callees, conditional compilation, short-circuit aggregation, promise semantics, option precedence, small versus broad candidates, and the cost of rereading a selected patch. They do not cover every language, LSP server, project, adversarial payload, generated macro expansion, stale-source race, provider outage, or production review workload. Local-ranking availability/fallback/continuation tests belong to the earlier feature validation, not this model-quality score.

The four calibration cases, three PR families, and single AST/LSP fixture are small and related. No confidence interval is presented as if repetitions were independent. The follow-up and v2 repair are explicitly post-result. The moving model alias limits exact future reproducibility. No model comparison or confidence-threshold tuning was performed. No lower false-positive rate or whole-agent cost saving was measured.

## Decision

**Reject automatic classification-based finding filtering.** Keep the existing optional composition for broad relevance routing; verify every reported or dismissed finding with deciding source and checks. Use precise AST/search when the predicate is known and direct LSP for identity. Expand bounded evidence only when missing context matters and the expected avoided reads justify it.

Reconsider automatic review behavior only after representative independently adjudicated cases and a real reviewer baseline meet recall, abstention, coverage, and total-cost gates. More confident wording alone does not resolve the observed failures.

## Saved evidence

[Machine-readable results](review-classification-2026-10-13.json) preserve all scored labels, case claims and source revisions, hashes, token counts, and provider usage. Complete local inputs, outputs, questions, scripts, and executable checks are retained in `.octocode/octocode-eval-benchmark/2026-10-13-review-classification/`; this ignored run folder is not bundled with a fresh checkout. The aggregate JSON alone cannot reproduce the provider run. [Classification guidance](../../../docs/OCTOCODE_CLASIFY.md#pr-review-ast-and-lsp) owns the production workflow.

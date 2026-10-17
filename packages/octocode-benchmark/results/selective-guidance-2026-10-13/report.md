# Selective goals and clasify guidance

The guidance, full build, verification, fixed-route replays and autonomous solver runs are complete: **244/246 final valid cells across 258 attempts**, with 162 independent quality comparisons. Unnecessary goal calls fell on local and transfer questions, but GitHub did not meet the routing target. General main-model token savings are **not demonstrated**. Agents still overuse goals and never called public clasify; selective use is improved in part, not solved.

## What changed

The optional `goals` help now says: **“≤5 goals; rank by any. Use when ordering can avoid reads.”** The `clasify` description distinguishes locating a described target in unread source from answering a needed bounded typed question. Shared instructions prefer an adequate cheap exact route, discourage repeating the same relevance decision, require deciding source reads, and leave identity/binding to AST/LSP.

Four authored core files changed. The frozen public catalog has 31 changed text/fingerprint values; field types, limits, runtime algorithms and evidence continuations are unchanged. The complete `clasify` description is 401 characters and the MCP instructions are 1,918 UTF-8 bytes. Both stay within their existing budgets. Documentation includes a routing diagram and the shared classifier architecture.

The candidate contract fingerprint is `770d8280d139f0e8e79291bb5afc518b7af7b2b1550d5699d1f777ca5a699f7f`. Old and revised snapshots each contain the same 317 component paths, with every file hashed before the experiment. This comparison concerns the frozen snapshots, not all unrelated changes in either working tree.

## Experiment

- Three contemporaneous arms: JEV/goals off on the old build, old guidance with JEV, revised guidance with JEV. Fresh `gpt-5.6-terra`, medium reasoning, identical ordinary task brief, local frozen MCP.
- Forty existing local questions, thirty existing GitHub questions, and twelve new local transfer questions: 246 initial cells. Terraform is the predefined local Q33–Q40 subset, with no infrastructure deployment. The public 40/30 are development data. The red team authored the twelve transfer questions and withheld them from the prompt author; they are a small independent check, not a representative workload sample.
- One pass, 600 seconds and a stop at the first observed excess over 30 tool calls per solver. At most four solver/judge processes. No valid unfavorable answer is retried. Up to twelve infrastructure retries, at most one per cell; every attempt remains in spending and completion counts.
- Independent `claude-sonnet-5-5` quality judges compare old/revised and off/revised with randomized X/Y and source verification. Separate arm-blind routing judges see the question and chronological tool evidence, without final answers or quality grades.
- Primary development target: at least 25% fewer unnecessary semantic **dispatch calls per question** versus old guidance, without more missed useful opportunities or source/identity misuse. Calls, query rows and provider HTTP requests are different units. A mixed batch with a useful row is not wholly unnecessary. A runtime skip alone does not prove the agent should have predicted the result size.
- One-point quality gaps count as ties; major source/identity failures remain separate guardrails. Ratios use valid matched questions and seeded 10,000-resample question bootstrap intervals. Spending includes every attempt. Terra and JEV tokens stay separate.

The frozen routing rubric was calibrated on six machine-authored or prior-public examples, without human calibration. Some eligibility labels were disputed. The whole chronological trace is visible to the routing judge, so its instruction to judge using only pre-call evidence does not physically prevent hindsight. Off-arm missed opportunities are counterfactual potential, not errors by an agent whose semantic tools were unavailable. Saved-ranking continuation labels require a separate disclosed sensitivity check; raw grades will remain unchanged.

The 40-local and 30-GitHub initial passes had fourteen infrastructure-invalid cells. After that exceeded the twelve-retry cap, an operational rule prioritized revised-arm invalids, which can restore both planned comparisons, then old/off cells by stable corpus/question order. This order was chosen without inspecting answer quality and was not preregistered. The cap and one-retry-per-cell limit remain unchanged.

## Resource measurements

Ratios are **revised/baseline**; below one uses less. Intervals are paired question bootstrap 95% intervals, unadjusted for multiple secondary comparisons. Terra input includes its cached subset.

| Baseline | Corpus | Valid pairs | Observable characters | Terra input tokens | Wall time |
|---|---|---:|---|---|---|
| Old guidance | local40 | 40/40 | 0.985 [0.877, 1.109] | 1.054 [0.957, 1.172] | 0.862 [0.709, 1.052] |
| Old guidance | Terraform subset | 8/8 | 0.748 [0.598, 0.926] | 0.928 [0.797, 1.099] | 1.020 [0.718, 1.570] |
| JEV off | local40 | 40/40 | 0.937 [0.795, 1.096] | 1.028 [0.888, 1.179] | 0.891 [0.738, 1.081] |
| JEV off | Terraform subset | 8/8 | 0.860 [0.553, 1.442] | 0.948 [0.678, 1.306] | 1.014 [0.698, 1.493] |
| Old guidance | github30 | 30/30 | 1.003 [0.911, 1.111] | 0.963 [0.874, 1.065] | 1.005 [0.763, 1.320] |
| JEV off | github30 | 28/30 | 1.061 [0.944, 1.195] | 1.159 [1.028, 1.296] | 1.062 [0.845, 1.319] |
| Old guidance | transfer12 | 12/12 | 0.952 [0.773, 1.190] | 0.949 [0.798, 1.108] | 1.137 [0.899, 1.423] |
| JEV off | transfer12 | 12/12 | 1.122 [0.972, 1.328] | 0.988 [0.892, 1.090] | 0.928 [0.621, 1.435] |

The main-model input intervals do not establish a general saving versus old guidance. Versus JEV off, GitHub input increases by 15.9% [2.8%, 29.6%]; local and transfer intervals include no change. Terraform uses 25.2% fewer observable characters than old guidance, but this small subset does not establish lower Terra input or net cost. These are workflow outcomes, not isolated reranker efficiency.

## Adoption

Counts are final valid cells only. A goal-bearing query may be a runtime skip, and one dispatch can contain several queries. Lower adoption is not itself better selection.

| Corpus | Goal-using questions old → revised | Goal queries old → revised | Public clasify calls old → revised |
|---|---:|---:|---:|
| local40 | 31/40 → 10/40 | 109 → 41 | 0 → 0 |
| github30 | 28/30 → 27/30 | 257 → 243 | 0 → 0 |
| transfer12 | 9/12 → 3/12 | 25 → 13 | 0 → 0 |

No solver replayed a saved ranking plan. This run cannot establish adoption or task savings for public clasify, or autonomous ranked-continuation efficiency.

Local agents omitted goals more often on exact identifiers and bounded reads. GitHub barely changed: its entire net decline came from Q19 (20 → 0 goals); the other 29 questions increased from 237 to 243. Runtime skips remained common: local old/revised 71/109 versus 24/41 ranking receipts; GitHub 176/255 versus 162/239. Skips and provider requests are not the same measurement.

## Independent routing grades

The frozen routing judge produced **232 valid verdicts from 244 attempts**, with twelve schema-invalid outputs retained as missing grades and two solver-invalid GitHub off cells. There were no judge retries. Each verdict grades caller dispatches, not query rows or HTTP requests. All packet/privacy/hash checks passed; fourteen mixed-batch eligibility decisions remain unknown.

| Corpus | Graded old/revised pairs | Unnecessary calls/question, revised − old | Revised/old mean call count | Routing target |
|---|---:|---:|---:|---|
| local40 | 34/40 | −1.088 [−1.500, −0.706] | 0.327 [0.136, 0.528] | Met on graded pairs |
| github30 | 29/30 | −0.345 [−1.517, 0.655] | 0.929 [0.722, 1.150] | Not met |
| transfer12 | 9/12 | −0.667 [−1.333, −0.222] | 0.143 [0.000, 0.600] | Met on this small check |

Paired routing labels show no increase in missed useful opportunities or major source/identity misuse. This passes the route-only conjunction locally and on transfer; answer-level quality remains a separate guardrail. Zero observed misuse is not proof of zero risk. The sole missed-opportunity label was GitHub off Q28 call 3, a counterfactual opportunity with semantics unavailable. Revised repeated-relevance labels remain on local Q33 and GitHub Q14. No saved-ranking continuations occurred, so the continuation sensitivity issue has no affected calls.

Overuse remains: revised local has 24 unnecessary dispatches across 38 valid route grades; GitHub has 131 across 29, including 12 in Q21; transfer has three across eleven. These unmatched totals describe remaining work and are not the paired effect estimate. Most revised unnecessary local calls are `localFetch` (15), then `localSearch` (6). GitHub's are `ghGetFileContent` (63), `ghStructure` (29), `ghSearchCode` (20), `ghSearchRepo` (14), `ghGetHistoryItem` (4) and `artifactSearch` (1). Public clasify adoption cannot be evaluated from zero calls.

An exploratory missing-grade sensitivity assigned each missing unnecessary count any value from zero to its dispatch count. Across all planned old/revised questions, finite-catalog mean-difference bounds stay negative: local [−1.100, −0.700], GitHub [−0.433, −0.300], transfer [−0.833, −0.083]. These are not bootstrap intervals, not prespecified primary estimates, and do not establish the 25% target or unknown quality guardrails. The transfer ratio interval omits 48/10,000 resamples with a zero old-arm denominator; count differences retain all resamples. No pooled 82-question primary was declared.

Schema-invalid route grades: local old Q6/Q28/Q35/Q40, local revised Q8/Q30; GitHub off Q15/Q21, revised Q5; transfer old Q4/Q5, revised Q2. GitHub off Q13/Q26 are solver-invalid. Nothing was repaired or rerun after seeing scores.

## Answer quality and evidence guardrails

All 162 eligible pairs received valid independent verdicts, with no judge retries or failures. Scores within one point count as tied; the table reports revised wins / ties / losses, without converting small average-score differences into a quality claim.

| Corpus | Revised vs old | Revised vs off | Coverage |
|---|---:|---:|---|
| local40 | 0 / 40 / 0 | 0 / 39 / 1 | 40 pairs each |
| github30 | 4 / 24 / 2 | 2 / 26 / 0 | 30 old pairs; 28 off pairs |
| transfer12 | 0 / 12 / 0 | 0 / 11 / 1 | 12 pairs each |
| Terraform subset | 0 / 8 / 0 | 0 / 8 / 0 | Included in local40 |

The source audit checked every revised correctness loss greater than one point. The quality schema has scores and free-text reasons, not structured major-misuse fields; the routing schema's zero flags cannot substitute for answer verification.

| Case | Baseline → revised | Source audit |
|---|---:|---|
| GitHub Q4, old | 9 → 5 | Revised accurately cites Axios v1.7.9; old uses current default-branch source. The question does not explicitly fix a ref/date, so this is a contested scope/recency loss, not fabricated tag facts. |
| GitHub Q27, old | 9 → 7 | Revised omits option helpers and core utilities exported by the pinned barrels. Narrower than the old answer; the judge acknowledges ambiguity in hooks/components/classes scope. |
| Local Q25, off | 10 → 6 | Definite source-path error: revised attributes pointer relocation to `sdsResize`, which `sdscatlen` does not call. The correct helper is `sdsMakeRoomFor`. An otherwise correct conclusion does not cure that citation. |
| Transfer Q9, off | 10 → 8 | Correct Django awareness predicate, but misses the adjacent explicit comment that callers must avoid `None`; citation/completeness loss. |

Local Q25 also exposes judge inconsistency: the old/revised judge scored 9/10 and incorrectly called the revised `sdsResize` excerpt `sdsMakeRoomFor`; the off/revised judge scored 10/6 and caught it. Old did not make that wrong-function citation. Revised used no goals or clasify on these reads, while old goals skipped as single-candidate. The source error is new in this revised trace, but there is no evidence that ranking caused it. **The answer-level no-new-major-source-error guardrail therefore does not pass**, even though the local route-only target does. Raw scores remain intact and the independent source audit takes precedence over a favorable average.

An initial audit incorrectly flagged GitHub Q28 as citing unread files. Independent review of every batched result disproved that claim: call 7 returned `context_compressor.py` lines 2150–2225 and `conversation_compression.py` lines 2187–2203; call 9 returned the threshold formula and safeguards at 2769–2801. The corrected source audit retains the evidence and retraction. Its character reduction (165,024 → 109,908) remains an observed workflow change, not an isolated ranking effect.

Several large character changes came from query choice, not ranking: local Q18 saved 25,406 characters with no goals in either arm; Terraform Q33 saved 19,749 with every goal request skipped. Q33's deciding diagnostic lines were read in both arms. Five of eight revised Terraform cells used more Terra input even though their geometric mean was lower. These are single-pass workflows in which query terms, views, read scopes and stopping decisions changed together.

## Known spending: Terra and JEV separately

The following totals include all 258 attempts. Incomplete rows are known lower bounds, not zero usage. Cached input is already included in total Terra input.

| Corpus / arm | Attempts | Terra input | Cached subset | Terra output | Missing input receipts |
|---|---:|---:|---:|---:|---:|
| local40 / off | 42 | 2,056,765 | 1,520,640 | 36,026 | 1 |
| local40 / old | 41 | 1,903,327 | 1,431,552 | 34,103 | 0 |
| local40 / revised | 42 | 1,973,667 | 1,462,272 | 33,592 | 2 |
| github30 / off | 31 | 3,008,934 | 2,375,680 | 44,119 | 2 |
| github30 / old | 30 | 3,713,529 | 3,109,120 | 47,757 | 0 |
| github30 / revised | 36 | 3,723,592 | 2,982,912 | 52,221 | 4 |
| transfer12 / off | 12 | 485,182 | 359,168 | 7,339 | 0 |
| transfer12 / old | 12 | 514,791 | 386,560 | 7,653 | 0 |
| transfer12 / revised | 12 | 478,977 | 347,392 | 7,552 | 0 |

| Corpus / JEV arm | HTTP attempts | Failed/unknown responses | Known JEV input | Known JEV output | Input usage complete? |
|---|---:|---:|---:|---:|---|
| local40 / old | 375 | 15 | 183,039 | 6,922 | No |
| local40 / revised | 189 | 0 | 83,467 | 3,675 | Yes |
| github30 / old | 530 | 21 | 326,890 | 9,821 | No |
| github30 / revised | 447 | 7 | 280,665 | 8,427 | No |
| transfer12 / old | 80 | 0 | 50,662 | 1,544 | Yes |
| transfer12 / revised | 38 | 0 | 15,635 | 746 | Yes |

Off arms had classification disabled; their absent provider trace is a configuration-based zero, not a measured HTTP receipt. On-arm missing usage stays unknown. Provider counts include startup availability probes.

Across solver attempts, JEV made 1,659 requests: 1,616 successful usage receipts identified `jev-1.13.0`, and 43 failed/unknown responses remain incomplete. Known input/output totals are **940,358 / 31,135**. At the [published JEV rate](https://typesafe.ai/blog/introducing-system-one-models-and-jev), $0.042 per million input with free output, known solver JEV cost is **$0.039495**; unknown usage is additional, not zero. Setup used another 2,224 input / 160 output tokens over eight requests. The 199 fixed-route requests below used 208,487 input / 14,342 output. Total known JEV work across these three lanes is 1,151,069 input / 45,637 output, or **$0.048345** under that rate.

The base monetary scenario uses [Terra standard API rates](https://developers.openai.com/api/docs/models/gpt-5.6-terra): $2 uncached input, $0.20 cached input and $12 output per million, with [cache-write premiums](https://developers.openai.com/api/docs/guides/prompt-caching) unknown. This is a dated rate scenario (2026-10-13), not actual Codex billing. Service/context multipliers and failed-request usage are unknown. Pairwise ratios below require complete Terra and JEV base receipts; all-attempt known spending remains separately recorded in the JSON.

| Corpus | Revised/old combined base cost | Priced pairs | Revised/off combined base cost | Priced pairs |
|---|---:|---:|---:|---:|
| local40 | 1.086 [0.962, 1.228] | 38/40 | 0.982 [0.862, 1.112] | 40/40 |
| github30 | 1.005 [0.912, 1.103] | 25/30 | 1.095 [0.938, 1.285] | 26/30 |
| transfer12 | 0.979 [0.805, 1.186] | 12/12 | 1.013 [0.832, 1.245] | 12/12 |

No monetary saving is established. A thousand JEV input tokens cost as much as 21 uncached or 210 cached Terra input tokens at these rates, before output, schema and workflow overhead. That makes avoided work potentially worthwhile; it does not show that this campaign avoided it.

Successful JEV HTTP median/p95 latency was 415/2,813 ms locally, 676/3,968 ms on GitHub, and 401/1,296 ms on transfer questions. These network-inclusive requests include probes and are not main-model inference or whole-workflow latency. There is no same-decision comparison proving JEV is faster than Terra.

Quality judging is separate evaluation overhead: 162 Sonnet attempts with reported usage of 1,142 uncached input, 1,874,008 cache-read, 1,321,425 cache-write and 218,535 output tokens; reported cost **$7.660735**. All quality receipts are complete. Routing used another 244 Sonnet attempts: 1,616 uncached input, 1,744,847 cache-read, 2,017,375 cache-write and 170,502 output tokens. Its six calibration attempts used 36 / 27,251 / 33,115 / 2,833 respectively. All these usage receipts are complete, including invalid verdicts. Raw reported routing-judge cost is **$6.926174**, with **$0.113915** calibration cost. They are evaluation overhead, not product-query costs.


## Fixed-route checks: benefit depends on avoiding reads

These are prescribed tool routes with known source criteria, not autonomous agent choices or a contemporaneous causal test of the wording. Counts are complete caller responses through the first adequate source prefix, tokenized with `o200k_base`; all additional calls actually incurred remain in the raw accounting.

| Task | Sequential source prefix | Goals prefix | Tested exact route | Observation |
|---|---:|---:|---:|---|
| Django callback rollback | 4,814 | 1,078–1,079 | 873 | Goals bring proof earlier; literal `savepoint` is cheaper without JEV |
| Tokio close with outstanding permit | 3,433 | 1,292 | 1,016 | Literal `closed` wins; literal `reserve` fails to reach proof in ten calls |
| GitHub file fixture | 2,073 | 1,355 | 67 | Goals move proof from page 5 to 2; full traversal costs 3,516 versus 2,212 tokens |

Django Locate plus its first source read needs 360 response tokens, with three JEV requests and 13,204 JEV input tokens; the plan also incurred a second read. Tokio Locate plus two reads needs 537 response tokens but misses the required outstanding-permit condition despite high scores. A shorter response is not necessarily adequate evidence.

All thirteen read tools received fresh applicability/evidence checks. The paid all-tool fixture replay covers eleven tool cases. Local fetch has the separate source replay; local search retains its prior paid fixture evidence and receives fresh mechanical and autonomous checks. No complete descriptive traversal in the all-tool replay saved response tokens. Structural tools preserved order and made zero provider calls. Provider-page discovery did not bring unseen pages into the ranked page. The fixed AST/LSP and metadata cases still required their source verification or remained candidate leads.

| Tool | Complete incurred response tokens, no goals → enabled | What the fresh check establishes |
|---|---:|---|
| `localFetch` | Separate source prefixes above | Earlier adequate source can help; exact anchors can beat it |
| `localSearch` | Prior paid fixture retained | Fresh mechanical/autonomous checks; no new fixed paid estimate |
| `structureSearch` | 103 → 127 | Candidate paths only; no behavior proof or avoided read demonstrated |
| `astSearch` | 493 → 516 | Includes deciding source read; ordering alone saved nothing |
| `astTopology` | 411 → 480 | Structural skip, no provider call |
| `lspSearch` | 277 → 301 | Includes source read; LSP retains identity authority |
| `ghSearchRepo` | 235 → 301 | Metadata lead; target remains on provider page 2 |
| `ghSearchCode` | 530 → 639 | Includes pinned implementation read |
| `ghStructure` | 155 → 185 | Structural skip, no provider call |
| `ghGetFileContent` | 2,212 → 3,516 | Earlier sufficient prefix helps only if later pages are avoided |
| `ghSearchHistory` | 665 → 730 | Includes pinned patch; target already on page 1 |
| `ghGetHistoryItem` | 113 → 144 | Section/patch order protected, no provider call |
| `artifactSearch` | 231 → 296 | Package metadata lead; target remains on provider page 2 |

These costs include emitted ranking metadata and every source verification actually incurred. The same complete evidence multiset was preserved in all ordinary, disabled and enabled fixture arms. Provider work is additional and separately counted below.

| Bounded judgment slice | Correct / scored | Archived comparison | Limit |
|---|---:|---:|---|
| Development calibration | 9/12 | 9/12 | Promise-return failure persists |
| AST/LSP factual packets | 18/18 | 17/18 | One changed judgment, not evidence of general review improvement |
| PR v1 strict packets | 15/21 | 15/21 | Both omitted-helper variants excluded together |
| Corrected PR v2 | 18/27 | 18/27 | Missing-guard, supported-regression and missing-callee errors persist |

The wide Tokio AST route's discovery response falls from 1,809 to 1,056 tokens, but classified discovery plus its emitted read and required verification totals 2,553 versus 2,114. A selected patch is 718 tokens directly versus 92 classification + 718 source = 810. Some read leads were selected using the preregistered target path, so these routes cannot establish autonomous selection quality or reduced false positives.

The fresh source replay used 48 JEV requests, 97,050 input and 9,182 output tokens. The review replay used 122 requests, 97,758 input and 4,609 output. The all-tool fixture replay used 29 requests, 13,679 input and 551 output. All 199 requests had usage receipts, with no provider retries or errors. These costs are separate from autonomous solvers, setup and judges.

## Build and verification

Core: 664 tests plus lint, typecheck and build passed. Canonical contract regeneration and the full 13-workspace build passed. The complete repository verification passed after canonically synchronizing the stale packaged MCP manifest. Documentation verification passed.

The separate fifteen-suite hermetic run recorded **887 passed, 2 failed**. Both dedicated evidence-ranking suites passed: 34 local-ranking and 112 all-read-tool checks, with eight applicability skips. The two remaining failures are documented: a chain check expects a field alongside `localFetch` in the unchanged `localSearch` description; a lead-replay assertion rejects normalization of an omitted list-view page size to its default 100. The latter is not established evidence loss, but the test remains failed. This is not an all-green hermetic result.

## Interpretation limits

The new wording reduces unnecessary goals locally and on the small transfer set, while GitHub still overuses them. The full “use only when useful” goal is not achieved, and the new source-path error fails the answer-level guardrail. Keep the clearer descriptions and documented limits; do not present this candidate as a proven quality, token-saving or fully selective-routing improvement. No post-score product tuning or favorable-answer retries were performed. Cheap classification can be useful without saving context when a typed answer itself is needed. Ranking can save caller context when earlier adequate source avoids later reads. Exact anchors, fully consumed pages, exhaustive coverage, structural ordering and identity checks generally need direct or deterministic evidence. Classifier scores cannot prove completeness or justify dismissing a finding.

The [earlier Terra comparison](../terra-goals-2026-10-13/report.md) remains a separate campaign and is not pooled into this experiment. Its lack of general token savings motivated the guidance changes; it does not decide their outcome.

## Reproduction and artifacts

- [Complete analysis and receipts](selective-guidance-2026-10-13.json), including every question, all-attempt usage, independent routing grades and source-audit notes.
- Canonical run/quality records: [local40](../selective-guidance-local40-2026-10-13/run.json), [GitHub30](../selective-guidance-github30-2026-10-13/run.json), [transfer12](../selective-guidance-transfer12-2026-10-13/run.json).
- Separate dashboards: [local40](../selective-guidance-local40/selective-guidance-local40.html), [GitHub30](../selective-guidance-github30/selective-guidance-github30.html), [transfer12](../selective-guidance-transfer12/selective-guidance-transfer12.html). Charts load D3 from its CDN; data are inlined. These are descriptive resource/quality dashboards; the report and JSON own routing and guardrail conclusions.
- Separate matrices: [local](../SELECTIVE_GUIDANCE_LOCAL_MATRIX/report.md), [GitHub](../SELECTIVE_GUIDANCE_GITHUB_MATRIX/report.md), [transfer](../SELECTIVE_GUIDANCE_TRANSFER_MATRIX/report.md). The GitHub matrix excludes the incomplete off arm from complete-arm ranking and labels its 28-pair head-to-head as partial.
- [Published transfer catalog](../../local/datasets/selective-guidance-transfer-v1) is byte-identical to the fourteen public question/catalog/manifest files frozen before solving. Private answer keys and grading packets were not published.

Each dashboard/matrix was generated with the existing benchmark generators from isolated staging containing only that corpus's canonical campaign. No historical campaigns were pooled. Frozen build manifests, command logs, strict transcript artifacts, protocols and private routing packets remain under the campaign and `.octocode/octocode-eval-benchmark/2026-10-13-selective-guidance*` directories in the working checkout. The result JSON records their hashes and evaluation scope.

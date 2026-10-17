# Output quality audit: frozen build 2 versus lean gh

Octocode and lean gh both scored **8/10** after rounding the mean correctness score. Octocode used **1.22× observable characters** (95% bootstrap CI **1.05–1.42**) and was leaner on **6 of 30 questions**. This campaign does not demonstrate a general token-saving benefit.

## Measured results

| Metric | Octocode MCP | Lean gh |
|---|---:|---:|
| Valid research runs | 30/30 | 30/30 |
| Mean correctness, rounded | 8/10 | 8/10 |
| Observable characters, total | 289,923 | 224,090 |
| Tool calls | 86 | 130 |
| Failed tool calls | 12 | 1 |
| Reported input tokens | 1,412,076 | 803,933 |
| Reported output tokens | 41,560 | 44,164 |
| Host-reported model cost | $1.4816 | $1.2610 |

The character ratio is the geometric mean of paired question ratios; it is not the ratio of totals. Correctness comparisons using the predeclared one-point tie band were 5 Octocode wins, 6 losses and 19 ties. Token counts include the host's session context and differ from observable tool/answer characters. Host costs are reported estimates, not billing receipts.

## What failed

All 12 MCP errors rejected malformed input. Nine calls supplied a literal string where an array was required; two supplied a JSON-encoded array string; four supplied numeric strings, overlapping three array errors. Three errors already included a complete executable repair. Nine described the array fix without supplying the complete call.

A schema-driven singleton-array repair was added after this campaign. It keeps strict admission and validates the proposed call. It has not been measured in a fresh research campaign. The input errors explain some wasted work; this campaign does not isolate their contribution to the full token gap.

## Research quality losses

The six losses outside the predeclared tie band are preserved separately from input errors. The source-checking judges identified:

| Question | MCP / gh correctness | Missing or unsupported evidence |
|---|---|---|
| Q2 | 7 / 9 | Absence inferred from an index without checking the pinned source |
| Q18 | 7 / 10 | Optional peer-dependency metadata left unverified after a zero-context file read |
| Q20 | 7 / 10 | stderr forwarding left unverified |
| Q23 | 4 / 7 | Mandatory-lock behavior claimed without support at the pinned revision |
| Q29 | 7 / 9 | Bearer authorization on every HTTP request left unverified |
| Q30 | 4 / 7 | Pipe establishment left unanswered |

These are agent research failures, not proof of runtime defects. The preserved calls show insufficient follow-up reads in several cases. Changing a page size or deleting guidance does not by itself demonstrate a fix. See [quality failures](../campaigns/output-quality-2026-10-16/quality-failures.json).

## Reproducibility and scope

- Frozen local Octocode 20.2.0 output-audit build 2; native binary SHA-256 starts `5664f46341015dbd`, addon `829e9e2b4b06bf43`. The full hashes and frozen catalog are in the campaign manifest.
- Fresh isolated Claude Sonnet 5.5 researchers; 30 public GitHub v2 questions, one attempt per arm, 60 turns maximum. All 60 runs passed strict transcript rehashing. No research retries or excluded weak answers.
- Thirty blind, source-checking GPT-6.1 Sol judgments in isolated Codex homes. All 30 actual attempts were valid. Receipt directories are numbered `2` by the reserved-slot harness convention; slot `1` was never run. No judge retries were needed.
- All 30 judge traces contain source-read commands. No forbidden source-read commands were found. Judges reported 804,870 total tokens; dollar cost and input/output/cache splits are unavailable. Calibration reuses the same model, rubric and isolated harness from the earlier release-fixes campaign; there was no human judge.
- Classification was disabled in this GitHub comparison. No TypeSafe calls belong to it. The separately approved 26-case classification A/B retained all targets and reduced provider input tokens 16.9%, while retaining seven size-gate failures.
- The freeze predates later empty-result guidance, singleton repair and adaptive-page fixes. It is not a measurement of the final shared checkout. Different historical campaigns are not causal baselines.

## Follow-up fixes and precision confirmation

The final pre-precision release replayed all **12 malformed benchmark calls**: each remained strictly rejected and supplied a schema-valid executable repair. This is a deterministic recovery check, not a rerun of the researcher benchmark, so the original 12 failures remain in the table above.

A separately approved, frozen six-file direct-tool comparison tested the previously drafted stricter classifier predicate. Both arms retained all six complete target declarations; pages were complete and ordered, with no provider errors. Host response bytes fell from **58,862 to 22,364 (62.0%)**; provider input tokens increased from **230,260 to 239,359 (4.0%)**, within the predeclared 5% ceiling. One large-file byte failure became zero. All **674 requests** finished within the 800-request / 20-minute total budget. The exact wording was integrated in the owning core at classifier template version 4; the repaired isolated snapshot built on all six platforms and passed 590 local fixture tool calls and 41 MCP acceptance checks. The full workspace gate passed all 12 packages; newer shared-checkout changes remain outside that snapshot.

The paired geometric mean byte ratio is **0.5645**: four cases shrink, one ties, and one grows by three bytes. Redis contributes **80.9%** of aggregate savings, and its candidate still includes three related helper/caller declarations beyond the exact target. The result supports bounded selected-view delivery; it does not establish perfect precision or a representative 62% reduction across workloads.

Every **selected-view** page was read. All six selections in each arm were explicitly partial because of candidate budgets or uncertain judgments: 509 unknown items in the baseline and 502 in the candidate. Their unfiltered recovery leads remain available but were not read or included in selected-view bytes. Complete target declarations are verified; exhaustive whole-file classification is not claimed.

This is six new pinned public files, with the same frozen native CLI and admitted states for both arms. It is neither an agent-token benchmark nor a retest of the seven earlier development size failures. The failed earlier development gate is retained. [Frozen precision results](../../../.octocode/octocode-dev/output-quality-2026-10-16/precision-confirmation-summary.json).

## Evidence

[Campaign manifest](../campaigns/output-quality-2026-10-16/campaign.json), [measured summary](../campaigns/output-quality-2026-10-16/measured-summary.json), [all runs and judgments](runs/output-quality-2026-10-16.json), [input failure classification](../campaigns/output-quality-2026-10-16/failure-classification.json), [strict rehash receipts](../campaigns/output-quality-2026-10-16/strict-rehash.json), [judge isolation and source-read audit](../campaigns/output-quality-2026-10-16/judge-audit.json).

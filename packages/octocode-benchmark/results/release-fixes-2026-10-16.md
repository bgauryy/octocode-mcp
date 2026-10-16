# Build 4 release check: Octocode MCP versus lean gh

**Frozen build 4 does not demonstrate a context saving over lean `gh` on this public question set.** Isolated replacement judgments round to **8/10 for Octocode and 8/10 for gh**. Octocode uses **1.18×** the observable characters (95% paired bootstrap interval **1.02–1.36×**) and is leaner on **12/30** questions. This measures build 4 only; later source-capture and selected-read recovery fixes are not included.

## What ran

| Setting | Value |
|---|---|
| Corpus | github-v2, Q1–Q30; public exploratory questions |
| Arms | Frozen local Octocode 20.2.0 build 4 MCP; lean GitHub CLI |
| Researcher | Fresh isolated Claude sessions, claude-sonnet-5-5, both arms |
| Judge | Codex CLI, gpt-6.1-sol; seeded X/Y order, hidden tool identities, independent read-only source checks |
| Coverage | One pass; 60/60 valid solver runs, 30/30 valid isolated judgments |
| Bounds | Four parallel workers; 60 solver turns; one solver attempt; 3,600-second solver campaign deadline; 600 seconds per judge attempt; three attempts per pair |
| Attempts | 60 solver attempts, no reruns. Per judge pair: one contaminated judgment, one failed shell start, one valid isolated judgment |
| Features | Classification disabled; zero goals or clasify calls |
| Calibration | Same synthetic fixture and rubric scored 10/1/4/10; one preceding tool-runtime setup failure retained; no human calibration |
| Platform | macOS arm64 development build |
| Source revision | 042896d473bfdab33fd8e5ce624e16f9eb8c3530 plus local changes |
| Native addon SHA256 | 004ac4ae1dd1d56f4eda05fa12fb74593915d2b3b63f3fa9c9d03a818522afbd |
| MCP entry SHA256 | 7bbfd51f5df0321b22cc62d98796c9c19cc5dd57b51674b0c5aa7840c9692f14 |

The snapshot includes MCP, native, config, core and TypeScript server artifacts. Product preflight passed with 12 exposed tools and 21,191 schema characters. Leakage scanning found zero agent-visible hits; the 48 product hits were reviewed as generic identifiers. All 60 measured logs passed strict artifact rehashing again after judging; their complete measured rows are unchanged. Product, question, researcher-brief and rubric hashes remain unchanged. The judge harness changed only to repair isolation and preserve bounded attempts.

## Judge isolation repair

The first 30 judges loaded the host's Octocode research skill. Those grades are **invalid for the quality comparison**, preserved with their usage, and excluded from the headline and matrix. The solver answers remain valid and were never rerun.

The repaired runner creates fresh HOME, CODEX_HOME and working directories, copies only the authentication file into a private directory, and disables host skill discovery, bundled skills, rules, plugins, memories and inherited MCP servers. A [named permission profile](https://learn.chatgpt.com/docs/config-file/config-reference) denies the host home and private authentication directory while allowing scratch work, system executables and GitHub access. The installed Codex tool runtime remains enabled so research commands can execute inside that boundary.

The [isolation preflight](../campaigns/release-fixes-2026-10-16/isolation-preflight.json) proved scratch access, authenticated GitHub access, and denied reads of host authentication, host skills, evaluator input and the actual blind mapping. [Model-visible prompt inspection](../campaigns/release-fixes-2026-10-16/isolation-prompt-input.json) found no inherited skills or MCP tools. The [final audit](../campaigns/release-fixes-2026-10-16/judge-isolation-repair-audit.json) records 30 successful source-checking traces, zero skill/evaluator reads, and exact equality with the original submitted prompts. All blind packets and mapping bytes are unchanged. These local evidence files are also summarized in the saved [complete data](runs/release-fixes-2026-10-16.json).

One replacement dispatch failed before model invocation because macOS Bash rejected an empty array under `set -u`. Each failed start conservatively consumed attempt two. Only attempt three then ran; no pair exceeded its original ceiling. Calibration also exposed a disabled tool-runtime dependency; both calibration attempts and their usage are retained. No question, answer, rubric, model or scoring rule changed during this repair.

## Measurements

Observable characters count tool arguments, returned content and final answers as Unicode code points. They exclude hidden reasoning, system instructions and schemas; provider-reported tokens measure different work.

| Metric | Octocode MCP | Lean gh |
|---|---:|---:|
| Median characters per question | 5,572.5 | 5,191.5 |
| Correctness, whole points | 8/10 | 8/10 |
| Exact mean correctness | 8.47 | 8.27 |
| More correct / within-one-point tie / less correct | 5 / 22 / 3 | 3 / 22 / 5 |
| Leaner questions | 12/30 | 18/30 |
| Tool calls | 79 | 129 |
| Failed tool calls | 16 | 3 |
| Median solver wall time | 12.42 s | 13.64 s |
| Total characters, budget only | 269,124 | 212,283 |

The headline uses per-question ratios and 10,000 bootstrap resamples, seed 42. Its interval describes this question sample, not run-to-run model variation. Raw judge rankings were Octocode 11, gh 16, ties 3. Concurrent repository verification makes wall times unsuitable for a performance-release claim.

## Where the difference comes from

| Case | MCP / gh characters | Observed solver behavior |
|---|---:|---|
| Axios release comparison, Q22 | 2.74× | MCP requested file and commit inventories before one patch, receiving 8,816 characters initially. gh projected a 946-character comparison. |
| Node child-process flow, Q19 | 2.18× | MCP read wider source ranges; gh used focused text projections. |
| LangChain agent flow, Q21 | 2.03× | MCP read two results of roughly 14–15k characters. |
| Axios buildFullPath, Q24 | 0.35× | One MCP search returned 825 characters; gh used seven calls, including one refused command. |

## Failures and usage

All 16 MCP call failures were `invalidInput`: 11 searches and five file reads across ten runs. Claude supplied JSON-encoded arrays or quoted scalar values. Original transcript events confirm those types before measurement; measured inputs are identical. The frozen adapter forwards arguments unchanged; native normalization wraps a bare query without coercing fields. Original MCP wire traffic was not separately captured, so forwarding identity rests on source inspection rather than a wire trace. All 84 parsed successful MCP query results contained no provider or typed query errors.

The gh failures were one HTTP 422 for a nonexistent `master` ref and two shell permission refusals. Every failed call remains in the measurements. Solver prompts, questions, budgets and runtime behavior were not changed to repair these outcomes.

| Claude Sonnet 5.5 reported solver usage | Octocode MCP | Lean gh |
|---|---:|---:|
| Total input tokens, including cache categories | 1,383,353 | 743,908 |
| Cache-read input subset | 1,154,276 | 554,739 |
| Cache-creation input subset | 228,887 | 188,961 |
| Remaining input tokens | 190 | 208 |
| Output tokens | 38,873 | 41,636 |
| Host-reported list-price cost | $1.4201 | $1.2281 |

These are host `total_cost_usd` values with model usage marked `costBasis: list`, not a billing statement. Cache subsets are already included in total input.

| GPT-6.1 Sol judge stage | Model invocations | Reported “tokens used” |
|---|---:|---:|
| Initial invalid, contaminated judgments | 30 | 638,688 |
| Valid isolated replacements | 30 | 714,881 |
| All judgment model calls | 60 | 1,353,569 |
| Calibration, one failed setup and one valid result | 2 | 24,018 |
| Shell setup failures | 0 | 0 |

Judge input/cache/output splits and dollar cost are unavailable. All judge stages used 2655.5 summed invocation seconds; shell starts added 10.4 summed seconds. These sums are not elapsed campaign time. Calibration is separate from judged research. Prompt inspection and sandbox preflight made no model-generation calls. Missing charges remain unknown; solver and judge costs are not combined into an unsupported total.

## Limits and artifacts

This is one pass, an automated judge, and a public corpus with known development exposure, including earlier prompt work involving Q21 and Q25. It is exploratory evidence, not a held-out shipping gate. Live GitHub refs can move between solving and judgment. The prior campaign is historical context only; this run does not isolate a causal effect of the fixes. Its older judge isolation was not repaired by this campaign.

Later source-capture, `localFetch` snapshot binding and selected-read recovery changes, plus the subsequent native CLI skill-management migration, are unmeasured. Parent build 5 verification is a separate lane. Classification was disabled, so semantic recovery was outside the exercised surface. Cross-platform, optimized-release, and local-tool coverage belong to separate verification lanes.

The [complete measured data](runs/release-fixes-2026-10-16.json) retains valid scores, all invalid grades, settings, fingerprints and available attempt receipts. The [matrix](MATRIX.md) and [local dashboard](index.html) keep campaigns and corpora distinct. A shareable Claude dashboard was not published because that publishing API is unavailable here. The repaired benchmark package passed lint, type checks, 50 Python tests and 22 Node tests.

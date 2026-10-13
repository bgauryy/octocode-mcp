---
status: Keep
confidence: low
question: Which read-tool relevance adapters preserve evidence, and where does the added semantic work help?
---

# Read-tool relevance — 2026-10-13

Keep ranking optional. The checks exercise ten tool families with eligible ranking operations and three tools that preserve structural order with zero-call skips. Evidence and continuations survived the tested paths. One GitHub file fixture brought sufficient source earlier, while its exact phrase control was still cheaper. No complete traversal used fewer response tokens with goals.

## Question

Can goals reorder authorized evidence across all 13 clasify-readable tools while preserving every result, and when does that ordering justify its cost?

## Conditions

This is a development confirmation on labeled fixtures. All 13 tools received fresh deterministic CLI checks; 12 also received MCP parity checks. `astTopology` is intentionally CLI-only. The ten eligible families include existing `localSearch` and `localFetch`, whose prior real-model studies are retained without paid repetition. Eleven other tool rows each received one descriptive query and one ordinary-route control, in no-goals, goals-disabled, and goals-enabled arms. The three structural tools are included in those eleven rows.

The protocol, case catalog, runtime hashes, exact provider packets, and every response were frozen and retained. Every live request used `jev-latest`; all 29 responses reported `jev-1.13.0`. It made **29 requests, consuming 13,679 reported input and 551 output tokens**, with no retries, failures, or budget stops. The ceiling was 8 requests per tool, 104 total, and 120,000 input tokens. No output-based prompt tuning or favorable-result rerun occurred.

Tables use `tiktoken 0.12.0` and `o200k_base` over complete literal CLI stdout. [Results JSON](read-tool-ranking-2026-10-13.json) includes `cl100k_base`, characters, bytes, all three arms, controls, latency, and provenance. Source-verification responses are counted separately. Exact verifier anchors were supplied by the fixture author before model calls; they do not measure autonomous navigation or avoided reads. The LSP definition control tests a protected operation and is not an equivalent caller-discovery baseline.

## Results

### All 13 tools

Discovery columns show **no goals / goals disabled / goals enabled**, summed over every returned page. Verifier tokens are additional, per arm. Provider columns show requests / input / output for the enabled descriptive query; every tested ordinary-route control used zero provider calls even when goals were supplied.

| Tool | Ranked scope | Observed impact | Complete discovery tokens | Verifier tokens per arm | Provider requests / input / output |
|---|---|---|---:|---:|---:|
| `localFetch` | selectedView | Prior model evidence; fresh mechanics | — | — | 0 new |
| `localSearch` | selectedView | Prior model evidence; fresh mechanics | — | — | 0 new |
| `structureSearch` | selectedView | Same complete page; no saved read | 104 / 132 / 128 | 0 | 5 / 1,925 / 95 |
| `astSearch` | selectedView | Same complete page; verifier required | 380 / 407 / 403 | 114 | 5 / 2,366 / 95 |
| `astTopology` | protected skip | CLI-only graph skip | 413 / 482 / 482 | 0 | 0 / 0 / 0 |
| `lspSearch` | selectedView | Locations only; verifier required | 171 / 199 / 195 | 107 | 5 / 1,966 / 95 |
| `ghSearchRepo` | providerPage | Target stays on page 2 | 235 / 304 / 301 | 0 | 2 / 802 / 38 |
| `ghSearchCode` | providerPage | Target stays on page 2; verifier required | 416 / 532 / 525 | 114 | 4 / 1,586 / 76 |
| `ghStructure` | protected skip | Hierarchy skip | 155 / 185 / 185 | 0 | 0 / 0 / 0 |
| `ghGetFileContent` | selectedView | Source page 5 → 2; exact control wins | 2,212 / 3,595 / 3,546 | 0 | 4 / 3,265 / 76 |
| `ghSearchHistory` | providerPage | Target already on page 1; verifier required | 339 / 407 / 404 | 326 | 2 / 943 / 38 |
| `ghGetHistoryItem` | protected skip | Section/patch skip | 113 / 144 / 144 | 0 | 0 / 0 / 0 |
| `artifactSearch` | providerPage | Target stays on page 2 | 231 / 299 / 296 | 0 | 2 / 826 / 38 |

Reordering the complete structure, AST, or LSP response did not avoid a response. Grouped LSP references supplied file names and line numbers, so they could not establish uppercase caller behavior. `src/util.ts` lines 4–10 supplied that proof in the frozen verifier. AST symbols similarly required `src/greeter.ts` lines 11–18. GitHub code matches contained marker comments; the pinned source read was still necessary. History used the same pinned patch read in every arm. These source costs are charged in full.

Provider-page ranking could not promote an unseen later page: the target repository and package remained on page 2, as did the relevant code file. No additional provider pages or bodies were hydrated to improve ranking.

### Earlier source versus total work

The GitHub file fixture's line 66 directly states that cancellation removes a queued request before work starts. Manual inspection after the run found the first sufficient prefixes below; the harness actually walked all pages. This is retrospective source sufficiency, not an observed agent stopping decision.

| Route | Sufficient source: pages / response tokens | All incurred response tokens | Provider requests / input / output |
|---|---:|---:|---:|
| Ordinary sequential read | 5 / 2,073 | 2,212 | 0 / 0 / 0 |
| Same query with goals | 2 / 1,367 | 3,546 | 4 / 3,265 / 76 |
| Exact phrase control | 1 / 67 | 67 | 0 / 0 / 0 |

Goals reduced this sufficient-source prefix by **34.1%** against sequential reading. Walking the entire result cost **60.3% more** response tokens, before counting provider work. The exact phrase control remained the cheapest tested adequate route. The local ranking algorithm retains its earlier [local-ranking](local-ranking-2026-10-13.md) and [selective-semantics](selective-semantics-2026-10-13.md) evidence and limitations; those outcomes are not pooled into a new success rate.

### Fixed and skipped-path costs

Enabling goals increased the loaded MCP tool-description payload from **4,911 to 5,283 o200k tokens**, or **+372**; `cl100k_base` also increased by 372. This is compact reconstructed `tools/list` result JSON plus LF, excluding the RPC transport envelope. It is fixed caller context when that surface is loaded. Opaque ranking continuations remain hidden from MCP discovery. The CLI exposes its continuation contract; its individual schema counts are retained in JSON.

Zero provider calls do not mean zero caller-context cost. The descriptive structural queries added **69** tokens for `astTopology`, **30** for `ghStructure`, and **31** for `ghGetHistoryItem`, through skip receipts and continued goals. The exact GitHub phrase control grew from 67 to 96 tokens with an unnecessary goals field, despite its single-candidate zero-call skip.

## Guardrails

The combined final checks resolve **112 passes and 8 explicit applicability skips** across 120 checks. They cover all 13 schemas and availability gates, nonempty source inventories, no-goals/disabled/enabled evidence equality, immutable source pins, every continuation edge exactly once, stable ties, complete budget tails, provider-failure fallback, independent provider-page scope, protected operations, terminal partial pages, CLI/MCP parity, narrow fields, and no added source hydration. Applicability skips are the CLI-only MCP case and fixtures without a same-view ranking continuation to tamper with.

The initial harness found two real defects: ranked GitHub file reads tried to enter a nested runtime, and an invalid earlier batch row prevented the valid later row from receiving ranking. The older local suite then found a third: file-page and match-page continuations converged on the same executable query. The runtime now finishes match pages before advancing to the next file page; hydrated clasify uses the outer file-page transition so it does not repeat or stop after already hydrated match windows. These paths were repaired and rechecked. Original failing artifacts remain available. Harness corrections also remain documented: an ignored temporary parent hid local fixtures, AST pages split symbol groups, and immutable revision echoes could be omitted when the exact SHA was already in the input. One consumer rebuild temporarily removed the CLI during a schema check; its failure was retained and the gate rerun after builds stopped.

The retained repaired full run was 118/120 before its two infrastructure/comparator corrections. The all 13 schema recheck passed 5/5 and the GitHub file recheck passed 15/15. After two further preservation guards for source-shaped JSON and extra structure metadata, the final staged artifacts passed a targeted 36/36 recheck (34 passes, two applicability skips) for structure, GitHub code, GitHub file, and fresh schema gates. The live run is retained from the preceding build; all 13 paid state/question/model packets for those affected tool fixtures exactly match packets observed on the preservation-guard build. The later continuation repair affects localSearch/clasify, which received no new paid trial. No paid trial was repeated.

After the pagination repair, the complete older local suite passed **34/34**, and the all-tool suite's fresh `localSearch` recheck passed **15/15**. The tied-score traversal returned all 21 expected matches exactly once. The expanded hydrated clasify fixture crossed multiple file and match pages, retained five files as six distinct judged or explicitly unjudged windows, sent no duplicate classification state/question packets, and recovered every original source line through emitted read leads or judged source anchors. Optional contextual read hints can overlap; executable continuation edges cannot repeat.

The added hydrated test needed an assertion correction: its original one-row-per-file and forced-deferral assumptions rejected valid split windows or a budget that already fit the source. All three failed calibration traces remain archived. The corrected test checks distinct scopes, explicit partial coverage, unjudged read leads, exact line coverage, and no repeated provider work. This is a deterministic development regression, not an additional model-impact trial. [Continuation verification](../../../.octocode/octocode-eval-benchmark/2026-10-13-read-tool-ranking/continuation-verification.json) records the final binaries, raw results, and harness hashes.

The full Rust suite also rejected a direct clasify-to-localSearch helper import through its module-boundary guard, after 2,114 other unit tests passed. The failure is retained in `architecture-guard-failure.log`. The shared helper moved to neutral `tools/paging.rs` without an allowlist exception. The final full Rust run passed 3,511 tests, all-target Clippy passed, and the rebuilt CLI passed both affected checks (tied pagination and nested hydration, 1/1 each). `architecture-verification.json` records final artifact hashes, commands, logs, and scope. The preceding full 34/34 and localSearch 15/15 runs remain archived; no paid trial was repeated.

## Limits

One fixture pair per newly checked tool establishes capability and bounded impact only. The cases were authored during development and were not sealed or representative. Source adequacy was judged manually after the run. Complete agent behavior, monetary prices, and production workload frequencies were not measured. The provider reported `jev-1.13.0`; the requested `jev-latest` alias can resolve differently in future runs. The two unchanged local tools use prior evidence and are not new paid replications.

## Decision

Keep the opt-in capability and the three structural skips. The fixture proves an earlier source prefix is possible; it does not justify automatic goals, small-result ranking, duplicate semantic stages, PR verdicts, LSP identity judgments, or claims of net financial or whole-agent savings. Use an adequate exact route when an anchor is known. Ranking is useful only when its selected evidence can meaningfully order work that would otherwise require further reads.

## Reproduce

Run `node octocode-local-testing/harness/read-tool-ranking.mjs` after the native, CLI, and MCP build pipeline completes. The hermetic suite uses the loopback mock, not a paid provider. The separately guarded `read-tool-ranking-impact.mjs` requires `OCTOCODE_LIVE=1` and a configured classification credential. Its case catalog and strict budget are the source for a future independent repetition; do not interpret the recorded single pair as a general effectiveness benchmark.

[Archived evidence](../../../.octocode/octocode-eval-benchmark/2026-10-13-read-tool-ranking/README.md) includes raw outputs, prior failures, frozen packets and fixture bytes, tokenizer analysis, and hashes. No credentials are stored. The report does not combine provider tokens with response or schema tokens into an invented monetary total.

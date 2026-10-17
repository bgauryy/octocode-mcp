# Local build after the fix round vs published 19.1.0 (pi runner), Oct 12 2026

**Verdict:** the fix round made the local build faster without changing its answers. Median
wall time fell from 41.7 s to 26.5 s and median tool time from 23.0 s to 6.6 s. The local build now
matches published 19.1.0 on time (it was 0.81× before). Code search no longer refuses calls:
there were 0 `rateLimited` calls, down from 5. It still waits, though: the median code-search call
takes 7.2 s, against 2.6 s on published, and the longest took 48.9 s. Correctness, depth and characters
did not change. Missing `queries` wrappers got worse, rising from 7 to 12, and they now cause
every failed call.

## What ran

| arm | campaign | build | when |
|---|---|---|---|
| published 19.1.0 | `pi-published-161933-2026-10-12` (reused, not rerun) | `npx -y octocode-mcp@19.1.0` | 16:19 |
| local-before | `pi-local-163239-2026-10-12` | HEAD `fb62502e4`, mcp `b8e6e2f1…`, addon `e3b34185…` | 16:32 |
| local-now | `pi-local-now-230508-2026-10-12` | HEAD `9930cf3a4`, mcp `14d28d71…`, addon `b8a34764…` | 23:05 |

All three arms used the same 30 GitHub questions and one pass each. The runner was pi
(`RUNNER=pi`) with `guy-provider-anthropic-x/claude-sonnet-5-5`, at parallelism 4 with only
the MCP arm in the batch, the same setup as local-before. Clasify was off. All 30 local-now runs
were valid.

The blind judge was codex `gpt-5.5` (`JUDGE_RUNNER=codex`) with seeded X/Y order, exactly as
in the previous campaign. local-now vs published was judged in
`pi-local-now-vs-published-231129-2026-10-12`. local-before vs published comes from
`pi-local-vs-published-164221-2026-10-12` (rebuilt here, and identical to that campaign's
judgments).

The local-now arm saw the new instructions sentence "Batch independent rows in queries[]." Its
`tools/list` was 19,248 characters, against 18,075 for local-before and 84,701 for published.
The lsp warm-socket fix doesn't apply to these GitHub-only questions.

## Three arms

| metric | published 19.1.0 | local-before | local-now | local-now vs local-before |
|---|---:|---:|---:|---|
| correctness (vs published, same pair) | 9.17 / 8.77 ¹ | 9.50 | 9.47 | same |
| depth | 3.97 / 3.80 ¹ | 4.40 | 4.30 | same |
| workflow | 4.30 / 4.37 ¹ | 4.70 | 4.70 | same |
| wins vs published | — | 24–6 | 27–3 | same ² |
| more correct / same / less | — | 9 / 17 / 4 | 12 / 15 / 3 | same ² |
| correctness diff vs published (95% CI) | — | +0.33 (−0.03 to 0.70) | +0.70 (0.20 to 1.27) | same ² |
| median chars | 12,326 | 8,302 | 8,572 | same |
| mean chars | 17,512 | 11,791 | 12,142 | same |
| chars, published ÷ local, geomean (95% CI), leaner on | — | 1.59× (1.42–1.80), 28/30 | 1.58× (1.41–1.80), 29/30 | same |
| chars, before ÷ now (95% CI), now leaner on | — | — | 0.99× (0.92–1.08), 12/30 | same |
| median wall s | 24.9 | 41.7 | 26.5 | **improved** |
| wall, published ÷ local, geomean (95% CI), local faster on | — | 0.81× (0.65–1.01), 12/30 | 0.95× (0.73–1.23), 18/30 | **improved** (now at parity) |
| wall, before ÷ now (95% CI), now faster on | — | — | 1.18× (0.95–1.44), 20/30 | improved (CI touches 1) |
| median model s | 21.7 | 17.1 | 16.7 | same |
| median tool s | 4.4 | 23.0 | 6.6 | **improved** |
| mean tool s | 8.4 | 27.0 | 21.9 | improved, but the tail remains |
| tool, published ÷ local, geomean (95% CI) | — | 0.43× (0.26–0.73) | 0.68× (0.36–1.28) | improved |
| calls / failed | 111 / 2 | 111 / 11 | 120 / 12 | same (the mix changed) |
| rateLimited calls (query rows) | 0 (0) | 5 (8) | **0 (0)** | **improved** |
| code-search calls | 24 | 35 | 36 | — |
| code-search call time: median / max | 2.6 s / 49.8 s | 24.9 s / 57.4 s | 7.2 s / 48.9 s | **improved**, still above published |
| code-search calls over 20 s | 1 | 19 | 15 | slightly improved |
| input tokens | 4.35M | 1.52M | 1.54M | same |
| runner cost | $1.47 | $1.12 | $1.15 | same |

¹ The published answers were scored in each pair: the first number is from the local-before
pair, the second from the local-now pair.

² Published's answers didn't change, yet their re-judged correctness fell by 0.40 (95% CI −0.67
to −0.13), with 10 questions scored differently. Published ran about 7 hours before this judge,
and on Q1, Q4, Q10, Q23, Q24 and Q29 the judge cited a stale ref or old file against it. Leaving
out those six questions, the gap is +0.25 (−0.17 to 0.71) before and +0.46 (−0.08 to 1.17) now.
Both intervals include 0. local-now's own score barely moved from local-before (−0.03, CI −0.40 to 0.40), so the
wider gap comes from published's lower rescore, not from better local answers. In whole points,
every arm scores 9.

## Where it differs

- **Time.** The admission fix removed the wait-then-refuse path. Every slow code-search call
  now returns results, where local-before's waited and then sent nothing. Waits still cluster at
  the start of the batch and around minute boundaries, when four runners open together: Q4
  waited 48.9 s, Q5 48.4 s, Q21 47.5 s and Q24 45.0 s. The local per-token window of 10 code
  searches per minute is still the bottleneck. Published, which has no client-side window, had
  one wait over 20 s.
- **Correctness by question.** local-now won Q14: it read `peerDependencies.vite` correctly,
  where both local-before and published claimed a regular dependency. On Q17 it reached 10, level with published, where local-before
  scored 8. It lost Q20 to published (8 vs 10) by leaving part of the stderr path unverified. On Q2 it fell
  from 10 to 8: level with published, but it still won on characters. Q12 and Q25 went to published in both pairs.

## Friction: failed calls

| class | published | local-before | local-now |
|---|---:|---:|---:|
| missing `queries` wrapper | 0 | 7 | **12** |
| …of which also stringified scalars (`"40"`, `"true"`, `"[\"patches\"]"`) | 0 | 3 | 5 |
| fields outside `queries[]` | 0 | 1 | 0 |
| rateLimited (refused, call failed) | 0 | 2 | 0 |
| invalid enum value | 1 | 1 | 0 |
| too many queries (>5) | 1 | 0 | 0 |

Every local-now failure was a flat call that left out the wrapper. These calls often also passed
list fields as bare strings (`keywords: "def route"`, `extensions: "py"`) or numbers and booleans
as strings. In each case the agent retried with the wrapper and succeeded. The new sentence is
about batching ("Batch independent rows in queries[]"); it doesn't say that every call needs the
wrapper, so it didn't fix this. Published's `queries` field has a description and got 0 misses.
The fix still belongs in the core schemas: describe `queries`.

## Caveats

- This is a single pass per arm. local-now ran about 7 hours after the other two arms, at a
  different time of day, so GitHub conditions and branch heads differed. Time comparisons across
  campaigns are indicative only. Here they are large and in the same direction on median, mean
  and geomean.
- The judge rebuilds ground truth live, so answers made earlier on moving branches score lower
  (see footnote ²).
- The questions are public. `leak_check.py` found no agent-visible question terms.
- The pi-runner results can't be compared with claude-runner campaigns.

## Data

The per-run summaries for local-now and both head-to-head pairs (from `campaign_summary.py --out`),
the failed-call and wait diagnostics (`calls.py`) and the three-arm comparison (`compare.py` →
`compare.json`) are in `.octocode/tmp/agents/wily-mantle/`. They are not in `results/runs/` or
`MATRIX.md`: local-now has no gh-lean judgments, so adding it would make it the matrix anchor
without a correctness score.

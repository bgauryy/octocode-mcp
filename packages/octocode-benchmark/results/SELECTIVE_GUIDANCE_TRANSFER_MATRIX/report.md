# Benchmark matrix — Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp-clasify-revised vs every other tool

Question set: `selective-guidance-transfer-12-v1`. Characters = model-in + model-out from the runner transcript or wrapper log. Correctness = the recorded independent judge, shown as a whole number out of 10: judge scores move by a point between runs, so treat tools within one point as equally correct. Rebuild: `compare/bin/matrix_summary.py`.

Coverage: all three arms have 12/12 valid runs. This matrix contains only the selective-guidance transfer12 campaign; the public questions are copied byte-identically from the runner catalog.

## Headline

| Tool | How it ran | Measured | Runs / Q | Median chars / Q | Mean chars / Q | Correctness /10 | Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp-clasify-revised leaner by (95% CI) | Leaner on |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp-clasify-revised | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 12,160 | 12,547 | 9 | anchor | — |
| Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp-clasify-old | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 11,865 | 14,116 | 9 | **1.05×** (0.84–1.29) | 8/12 |
| Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 9,130 | 11,399 | 9 | **0.89×** (0.75–1.03) | 4/12 |

## Time to answer (wall clock, same harness only)

Seconds from the agent's start to its final answer, split into model time and tool + harness time. Only campaigns run with the current harness are timed; the Aug 2026 CLI arms logged tool time per call (with an npx start per call, none for Headroom), which is not comparable.

| Tool | Median s / Q | Mean s / Q | of which model | of which tools + overhead | Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp-clasify-revised faster by (95% CI) | Faster on |
|---|---:|---:|---:|---:|---:|---:|
| Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp-clasify-revised | 40.1 | 40.1 | — | — | anchor | — |
| Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp-clasify-old | 33.2 | 37.9 | — | — | 0.88× (0.70–1.11) | 3/12 |
| Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp | 51.7 | 46.4 | — | — | 1.08× (0.70–1.61) | 8/12 |

## Head-to-head (same campaign, same judge)

The fairest comparison: same agent model, same day, judged together. Ratios are B ÷ A per question (geometric mean, 95% CI): above 1× means A used fewer characters / less time.

| Campaign | A | B | Judged | A more correct / same / B more correct | Wins A / B | Chars B÷A | A leaner on | Time B÷A | A faster on |
|---|---|---|---:|---|---|---:|---:|---:|---:|
| selective-guidance-transfer12-2026-10-13 | local-mcp-clasify-old | local-mcp-clasify-revised | 12 | 0 / 12 / 0 | 3 / 8 | 0.95× (0.77–1.20) | 4/12 | 1.14× (0.91–1.42) | 9/12 |
| selective-guidance-transfer12-2026-10-13 | local-mcp | local-mcp-clasify-revised | 12 | 1 / 11 / 0 | 8 / 4 | 1.12× (0.97–1.33) | 8/12 | 0.93× (0.62–1.43) | 4/12 |

## Pairwise char matrix

Cell = per-question geometric mean of **column ÷ row** characters (>1× = row leaner); bracket = questions where the row was leaner.

| row ÷ col → | Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp-clasify-revised | Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp-clasify-old | Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp |
|---|---:|---:|---:|
| **Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp-clasify-revised** | — | 1.05× (8) | 0.89× (4) |
| **Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp-clasify-old** | 0.95× (4) | — | 0.85× (2) |
| **Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp** | 1.12× (8) | 1.18× (10) | — |

## Characters per question

| Q | Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp-clasify-revised | Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp-clasify-old | Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp |
|---|---:|---:|---:|
| Q1 | 11,912 | 13,347 | 11,708 |
| Q2 | 22,313 | 23,792 | 19,458 |
| Q3 | 24,615 | 28,585 | 22,225 |
| Q4 | 15,081 | 33,166 | 18,096 |
| Q5 | 18,749 | 23,794 | 18,190 |
| Q6 | 23,054 | 10,383 | 23,294 |
| Q7 | 4,834 | 3,106 | 3,179 |
| Q8 | 9,627 | 7,698 | 6,553 |
| Q9 | 1,846 | 2,424 | 2,310 |
| Q10 | 4,285 | 4,081 | 4,053 |
| Q11 | 1,840 | 2,177 | 2,128 |
| Q12 | 12,409 | 16,838 | 5,597 |

## Correctness per question (whole points /10)

| Q | Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp-clasify-revised | Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp-clasify-old | Octocode selective guidance · selective-guidance-transfer12-2026-10-13 · local-mcp |
|---|---:|---:|---:|
| Q1 | 9 | 8 | 8 |
| Q2 | 8 | 9 | 9 |
| Q3 | 9 | 9 | 9 |
| Q4 | 8 | 8 | 8 |
| Q5 | 8 | 9 | 8 |
| Q6 | 9 | 8 | 9 |
| Q7 | 8 | 9 | 9 |
| Q8 | 10 | 9 | 10 |
| Q9 | 8 | 8 | 10 |
| Q10 | 10 | 10 | 10 |
| Q11 | 10 | 10 | 10 |
| Q12 | 10 | 9 | 10 |

Live campaigns: selective-guidance-transfer12-2026-10-13. Aug 2026 columns are a separate campaign with different agents: compare margins, not decimals.

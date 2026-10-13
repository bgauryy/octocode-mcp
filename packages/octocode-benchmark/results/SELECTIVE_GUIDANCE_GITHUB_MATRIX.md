# Benchmark matrix — Octocode selective guidance · selective-guidance-github30-2026-10-13 · mcp-clasify-revised vs every other tool

Question set: `github-v2`. Characters = model-in + model-out from the runner transcript or wrapper log. Correctness = the recorded independent judge, shown as a whole number out of 10: judge scores move by a point between runs, so treat tools within one point as equally correct. Rebuild: `compare/bin/matrix_summary.py`.

Coverage: the `mcp` (goals/clasify off) arm has 28/30 valid runs. Q13 and Q26 failed because of provider errors. It is excluded from the headline and pairwise matrices, which require all 30 questions. The same-campaign head-to-head row involving `mcp` covers 28 common valid questions only; it is not a complete off-arm comparison.

## Headline

| Tool | How it ran | Measured | Runs / Q | Median chars / Q | Mean chars / Q | Correctness /10 | Octocode selective guidance · selective-guidance-github30-2026-10-13 · mcp-clasify-revised leaner by (95% CI) | Leaner on |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Octocode selective guidance · selective-guidance-github30-2026-10-13 · mcp-clasify-revised | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 14,154 | 24,545 | 9 | anchor | — |
| Octocode selective guidance · selective-guidance-github30-2026-10-13 · mcp-clasify-old | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 16,876 | 24,645 | 9 | **1.00×** (0.90–1.10) | 17/30 |

## Time to answer (wall clock, same harness only)

Seconds from the agent's start to its final answer, split into model time and tool + harness time. Only campaigns run with the current harness are timed; the Aug 2026 CLI arms logged tool time per call (with an npx start per call, none for Headroom), which is not comparable.

| Tool | Median s / Q | Mean s / Q | of which model | of which tools + overhead | Octocode selective guidance · selective-guidance-github30-2026-10-13 · mcp-clasify-revised faster by (95% CI) | Faster on |
|---|---:|---:|---:|---:|---:|---:|
| Octocode selective guidance · selective-guidance-github30-2026-10-13 · mcp-clasify-revised | 100.7 | 120.6 | — | — | anchor | — |
| Octocode selective guidance · selective-guidance-github30-2026-10-13 · mcp-clasify-old | 108.8 | 115.5 | — | — | 1.00× (0.76–1.31) | 16/30 |

## Head-to-head (same campaign, same judge)

The fairest comparison: same agent model, same day, judged together. Ratios are B ÷ A per question (geometric mean, 95% CI): above 1× means A used fewer characters / less time.

| Campaign | A | B | Judged | A more correct / same / B more correct | Wins A / B | Chars B÷A | A leaner on | Time B÷A | A faster on |
|---|---|---|---:|---|---|---:|---:|---:|---:|
| selective-guidance-github30-2026-10-13 | mcp-clasify-old | mcp-clasify-revised | 30 | 2 / 24 / 4 | 12 / 16 | 1.00× (0.91–1.11) | 13/30 | 1.00× (0.77–1.33) | 14/30 |
| selective-guidance-github30-2026-10-13 | mcp | mcp-clasify-revised | 28 | 0 / 26 / 2 | 14 / 9 | 1.06× (0.95–1.19) | 14/28 | 1.06× (0.85–1.32) | 14/28 |

## Pairwise char matrix

Cell = per-question geometric mean of **column ÷ row** characters (>1× = row leaner); bracket = questions where the row was leaner.

| row ÷ col → | Octocode selective guidance · selective-guidance-github30-2026-10-13 · mcp-clasify-revised | Octocode selective guidance · selective-guidance-github30-2026-10-13 · mcp-clasify-old |
|---|---:|---:|
| **Octocode selective guidance · selective-guidance-github30-2026-10-13 · mcp-clasify-revised** | — | 1.00× (17) |
| **Octocode selective guidance · selective-guidance-github30-2026-10-13 · mcp-clasify-old** | 1.00× (13) | — |

## Characters per question

| Q | Octocode selective guidance · selective-guidance-github30-2026-10-13 · mcp-clasify-revised | Octocode selective guidance · selective-guidance-github30-2026-10-13 · mcp-clasify-old |
|---|---:|---:|
| Q1 | 4,897 | 7,117 |
| Q2 | 10,791 | 9,421 |
| Q3 | 9,280 | 12,909 |
| Q4 | 32,957 | 40,380 |
| Q5 | 74,876 | 50,719 |
| Q6 | 10,744 | 7,982 |
| Q7 | 6,120 | 6,575 |
| Q8 | 7,545 | 7,429 |
| Q9 | 9,322 | 9,824 |
| Q10 | 13,972 | 17,093 |
| Q11 | 35,828 | 37,947 |
| Q12 | 17,548 | 10,381 |
| Q13 | 14,336 | 16,659 |
| Q14 | 4,371 | 6,090 |
| Q15 | 11,836 | 12,837 |
| Q16 | 8,846 | 4,218 |
| Q17 | 17,713 | 20,812 |
| Q18 | 4,806 | 4,432 |
| Q19 | 51,995 | 38,764 |
| Q20 | 20,921 | 20,083 |
| Q21 | 78,537 | 61,733 |
| Q22 | 11,417 | 14,135 |
| Q23 | 16,047 | 17,854 |
| Q24 | 6,318 | 6,978 |
| Q25 | 18,182 | 19,487 |
| Q26 | 23,349 | 21,198 |
| Q27 | 13,348 | 19,294 |
| Q28 | 109,908 | 165,024 |
| Q29 | 49,055 | 43,637 |
| Q30 | 41,483 | 28,339 |

## Correctness per question (whole points /10)

| Q | Octocode selective guidance · selective-guidance-github30-2026-10-13 · mcp-clasify-revised | Octocode selective guidance · selective-guidance-github30-2026-10-13 · mcp-clasify-old |
|---|---:|---:|
| Q1 | 10 | 10 |
| Q2 | 9 | 9 |
| Q3 | 9 | 9 |
| Q4 | 7 | 9 |
| Q5 | 8 | 8 |
| Q6 | 9 | 10 |
| Q7 | 10 | 10 |
| Q8 | 10 | 10 |
| Q9 | 9 | 10 |
| Q10 | 9 | 10 |
| Q11 | 9 | 9 |
| Q12 | 9 | 9 |
| Q13 | 10 | 9 |
| Q14 | 10 | 10 |
| Q15 | 10 | 10 |
| Q16 | 10 | 10 |
| Q17 | 10 | 10 |
| Q18 | 10 | 9 |
| Q19 | 10 | 10 |
| Q20 | 10 | 10 |
| Q21 | 10 | 6 |
| Q22 | 9 | 9 |
| Q23 | 9 | 9 |
| Q24 | 10 | 4 |
| Q25 | 8 | 7 |
| Q26 | 9 | 9 |
| Q27 | 8 | 9 |
| Q28 | 8 | 9 |
| Q29 | 8 | 6 |
| Q30 | 9 | 9 |

Live campaigns: selective-guidance-github30-2026-10-13. Aug 2026 columns are a separate campaign with different agents: compare margins, not decimals.

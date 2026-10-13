# Benchmark matrix — Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-revised vs every other tool

Question set: `local-goals-v2`. Characters = model-in + model-out from the runner transcript or wrapper log. Correctness = the recorded independent judge, shown as a whole number out of 10: judge scores move by a point between runs, so treat tools within one point as equally correct. Rebuild: `compare/bin/matrix_summary.py`.

Coverage: all three arms have 40/40 valid runs. This matrix contains only the selective-guidance local40 campaign.

## Headline

| Tool | How it ran | Measured | Runs / Q | Median chars / Q | Mean chars / Q | Correctness /10 | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-revised leaner by (95% CI) | Leaner on |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-revised | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 13,522 | 14,131 | 9 | anchor | — |
| Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-old | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 12,840 | 15,201 | 10 | **1.02×** (0.90–1.14) | 22/40 |
| Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 13,198 | 16,220 | 9 | **1.07×** (0.91–1.26) | 20/40 |

## Time to answer (wall clock, same harness only)

Seconds from the agent's start to its final answer, split into model time and tool + harness time. Only campaigns run with the current harness are timed; the Aug 2026 CLI arms logged tool time per call (with an npx start per call, none for Headroom), which is not comparable.

| Tool | Median s / Q | Mean s / Q | of which model | of which tools + overhead | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-revised faster by (95% CI) | Faster on |
|---|---:|---:|---:|---:|---:|---:|
| Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-revised | 44.6 | 47.1 | — | — | anchor | — |
| Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-old | 51.5 | 54.5 | — | — | 1.16× (0.95–1.41) | 24/40 |
| Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp | 47.1 | 53.9 | — | — | 1.12× (0.92–1.36) | 28/40 |

## Head-to-head (same campaign, same judge)

The fairest comparison: same agent model, same day, judged together. Ratios are B ÷ A per question (geometric mean, 95% CI): above 1× means A used fewer characters / less time.

| Campaign | A | B | Judged | A more correct / same / B more correct | Wins A / B | Chars B÷A | A leaner on | Time B÷A | A faster on |
|---|---|---|---:|---|---|---:|---:|---:|---:|
| selective-guidance-local40-2026-10-13 | local-mcp-clasify-old | local-mcp-clasify-revised | 40 | 0 / 40 / 0 | 14 / 18 | 0.99× (0.88–1.11) | 18/40 | 0.86× (0.71–1.04) | 16/40 |
| selective-guidance-local40-2026-10-13 | local-mcp | local-mcp-clasify-revised | 40 | 1 / 39 / 0 | 17 / 18 | 0.94× (0.80–1.10) | 20/40 | 0.89× (0.74–1.09) | 12/40 |

## Pairwise char matrix

Cell = per-question geometric mean of **column ÷ row** characters (>1× = row leaner); bracket = questions where the row was leaner.

| row ÷ col → | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-revised | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-old | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp |
|---|---:|---:|---:|
| **Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-revised** | — | 1.02× (22) | 1.07× (20) |
| **Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-old** | 0.99× (18) | — | 1.05× (23) |
| **Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp** | 0.94× (20) | 0.95× (17) | — |

## Characters per question

| Q | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-revised | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-old | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp |
|---|---:|---:|---:|
| Q1 | 3,830 | 3,392 | 3,378 |
| Q2 | 12,731 | 15,335 | 12,296 |
| Q3 | 4,940 | 5,046 | 6,286 |
| Q4 | 1,583 | 1,625 | 1,092 |
| Q5 | 9,767 | 6,072 | 6,515 |
| Q6 | 17,602 | 19,339 | 21,661 |
| Q7 | 16,349 | 17,721 | 15,941 |
| Q8 | 10,306 | 11,967 | 16,231 |
| Q9 | 3,808 | 3,937 | 2,962 |
| Q10 | 8,406 | 12,558 | 11,310 |
| Q11 | 5,023 | 5,464 | 22,754 |
| Q12 | 22,926 | 24,095 | 24,711 |
| Q13 | 2,678 | 3,115 | 2,600 |
| Q14 | 5,504 | 2,562 | 2,755 |
| Q15 | 16,919 | 14,539 | 31,588 |
| Q16 | 4,180 | 3,881 | 4,384 |
| Q17 | 9,558 | 6,817 | 8,898 |
| Q18 | 17,456 | 42,862 | 42,926 |
| Q19 | 32,287 | 26,908 | 17,286 |
| Q20 | 22,933 | 7,921 | 13,405 |
| Q21 | 17,340 | 13,286 | 15,066 |
| Q22 | 14,961 | 13,122 | 11,178 |
| Q23 | 3,589 | 4,179 | 3,746 |
| Q24 | 1,957 | 2,046 | 2,137 |
| Q25 | 12,271 | 5,706 | 11,470 |
| Q26 | 2,720 | 4,702 | 3,151 |
| Q27 | 26,366 | 25,031 | 26,237 |
| Q28 | 25,412 | 24,473 | 24,888 |
| Q29 | 8,713 | 8,803 | 4,438 |
| Q30 | 32,141 | 32,066 | 32,834 |
| Q31 | 18,247 | 17,898 | 24,231 |
| Q32 | 5,589 | 4,572 | 12,991 |
| Q33 | 14,313 | 34,062 | 26,266 |
| Q34 | 16,694 | 22,476 | 25,184 |
| Q35 | 23,665 | 31,230 | 25,016 |
| Q36 | 2,544 | 2,727 | 2,378 |
| Q37 | 17,760 | 28,613 | 51,897 |
| Q38 | 35,718 | 35,176 | 9,148 |
| Q39 | 18,150 | 31,477 | 36,587 |
| Q40 | 38,307 | 31,244 | 30,996 |

## Correctness per question (whole points /10)

| Q | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-revised | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-old | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp |
|---|---:|---:|---:|
| Q1 | 10 | 10 | 9 |
| Q2 | 10 | 9 | 9 |
| Q3 | 10 | 10 | 10 |
| Q4 | 9 | 8 | 10 |
| Q5 | 10 | 10 | 9 |
| Q6 | 10 | 10 | 9 |
| Q7 | 9 | 9 | 8 |
| Q8 | 9 | 9 | 10 |
| Q9 | 10 | 10 | 10 |
| Q10 | 10 | 9 | 10 |
| Q11 | 9 | 9 | 10 |
| Q12 | 8 | 10 | 9 |
| Q13 | 10 | 10 | 10 |
| Q14 | 10 | 9 | 9 |
| Q15 | 10 | 10 | 9 |
| Q16 | 10 | 10 | 10 |
| Q17 | 9 | 9 | 9 |
| Q18 | 10 | 10 | 9 |
| Q19 | 10 | 10 | 10 |
| Q20 | 10 | 9 | 9 |
| Q21 | 9 | 9 | 9 |
| Q22 | 10 | 10 | 10 |
| Q23 | 10 | 10 | 10 |
| Q24 | 10 | 10 | 10 |
| Q25 | 8 | 9 | 10 |
| Q26 | 10 | 10 | 10 |
| Q27 | 9 | 9 | 9 |
| Q28 | 9 | 9 | 9 |
| Q29 | 10 | 10 | 10 |
| Q30 | 10 | 10 | 10 |
| Q31 | 10 | 9 | 9 |
| Q32 | 10 | 10 | 10 |
| Q33 | 10 | 10 | 9 |
| Q34 | 9 | 9 | 10 |
| Q35 | 10 | 9 | 9 |
| Q36 | 10 | 10 | 9 |
| Q37 | 10 | 10 | 10 |
| Q38 | 10 | 9 | 10 |
| Q39 | 10 | 10 | 9 |
| Q40 | 9 | 10 | 9 |

Live campaigns: selective-guidance-local40-2026-10-13. Aug 2026 columns are a separate campaign with different agents: compare margins, not decimals.

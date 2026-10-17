# Benchmark matrix — Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp-clasify vs every other tool

Question set: `local-goals-v2`. Characters = model-in + model-out from the runner transcript or wrapper log. Correctness = the recorded independent judge, shown as a whole number out of 10: judge scores move by a point between runs, so treat tools within one point as equally correct. Rebuild: `compare/bin/matrix_summary.py`.

## Headline

| Tool | How it ran | Measured | Runs / Q | Median chars / Q | Mean chars / Q | Correctness /10 | Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp-clasify leaner by (95% CI) | Leaner on |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp-clasify | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 13,678 | 14,431 | 10 | anchor | — |
| Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 11,231 | 14,841 | 10 | **0.96×** (0.82–1.11) | 18/40 |

## Time to answer (wall clock, same harness only)

Seconds from the agent's start to its final answer, split into model time and tool + harness time. Only campaigns run with the current harness are timed; the Aug 2026 CLI arms logged tool time per call (with an npx start per call, none for Headroom), which is not comparable.

| Tool | Median s / Q | Mean s / Q | of which model | of which tools + overhead | Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp-clasify faster by (95% CI) | Faster on |
|---|---:|---:|---:|---:|---:|---:|
| Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp-clasify | 30.7 | 35.8 | — | — | anchor | — |
| Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp | 27.8 | 31.6 | — | — | 0.84× (0.73–0.95) | 11/40 |

## Head-to-head (same campaign, same judge)

The fairest comparison: same agent model, same day, judged together. Ratios are B ÷ A per question (geometric mean, 95% CI): above 1× means A used fewer characters / less time.

| Campaign | A | B | Judged | A more correct / same / B more correct | Wins A / B | Chars B÷A | A leaner on | Time B÷A | A faster on |
|---|---|---|---:|---|---|---:|---:|---:|---:|
| local40-terra-goals-2026-10-13 | local-mcp | local-mcp-clasify | 40 | 2 / 38 / 0 | 22 / 16 | 1.04× (0.90–1.22) | 22/40 | 1.20× (1.05–1.36) | 29/40 |

## Pairwise char matrix

Cell = per-question geometric mean of **column ÷ row** characters (>1× = row leaner); bracket = questions where the row was leaner.

| row ÷ col → | Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp-clasify | Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp |
|---|---:|---:|
| **Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp-clasify** | — | 0.96× (18) |
| **Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp** | 1.04× (22) | — |

## Characters per question

| Q | Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp-clasify | Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp |
|---|---:|---:|
| Q1 | 3,393 | 3,631 |
| Q2 | 13,011 | 11,523 |
| Q3 | 4,529 | 6,123 |
| Q4 | 1,884 | 1,432 |
| Q5 | 6,958 | 15,949 |
| Q6 | 14,235 | 18,246 |
| Q7 | 15,877 | 15,884 |
| Q8 | 19,576 | 16,252 |
| Q9 | 4,342 | 3,433 |
| Q10 | 8,064 | 11,383 |
| Q11 | 6,946 | 4,470 |
| Q12 | 19,041 | 23,762 |
| Q13 | 3,135 | 2,976 |
| Q14 | 3,140 | 5,555 |
| Q15 | 14,485 | 7,993 |
| Q16 | 4,005 | 4,291 |
| Q17 | 9,003 | 8,026 |
| Q18 | 42,123 | 43,196 |
| Q19 | 25,182 | 13,696 |
| Q20 | 36,399 | 37,072 |
| Q21 | 19,881 | 10,478 |
| Q22 | 13,122 | 11,904 |
| Q23 | 4,273 | 3,552 |
| Q24 | 2,114 | 1,860 |
| Q25 | 11,209 | 11,079 |
| Q26 | 4,196 | 4,021 |
| Q27 | 14,513 | 20,262 |
| Q28 | 22,766 | 21,963 |
| Q29 | 5,092 | 4,757 |
| Q30 | 28,224 | 31,970 |
| Q31 | 17,499 | 28,039 |
| Q32 | 18,035 | 5,207 |
| Q33 | 15,908 | 26,294 |
| Q34 | 10,425 | 20,829 |
| Q35 | 31,079 | 48,525 |
| Q36 | 3,012 | 2,765 |
| Q37 | 31,238 | 30,369 |
| Q38 | 15,260 | 8,945 |
| Q39 | 23,178 | 41,019 |
| Q40 | 30,906 | 4,910 |

## Correctness per question (whole points /10)

| Q | Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp-clasify | Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp |
|---|---:|---:|
| Q1 | 8 | 10 |
| Q2 | 9 | 9 |
| Q3 | 10 | 9 |
| Q4 | 10 | 10 |
| Q5 | 10 | 9 |
| Q6 | 10 | 9 |
| Q7 | 9 | 9 |
| Q8 | 9 | 10 |
| Q9 | 10 | 9 |
| Q10 | 10 | 9 |
| Q11 | 9 | 9 |
| Q12 | 9 | 9 |
| Q13 | 10 | 10 |
| Q14 | 9 | 9 |
| Q15 | 10 | 10 |
| Q16 | 10 | 10 |
| Q17 | 10 | 10 |
| Q18 | 9 | 10 |
| Q19 | 10 | 10 |
| Q20 | 10 | 10 |
| Q21 | 9 | 9 |
| Q22 | 10 | 10 |
| Q23 | 10 | 10 |
| Q24 | 10 | 10 |
| Q25 | 10 | 10 |
| Q26 | 10 | 10 |
| Q27 | 10 | 10 |
| Q28 | 8 | 8 |
| Q29 | 10 | 10 |
| Q30 | 10 | 9 |
| Q31 | 10 | 10 |
| Q32 | 10 | 10 |
| Q33 | 9 | 9 |
| Q34 | 9 | 10 |
| Q35 | 9 | 9 |
| Q36 | 10 | 10 |
| Q37 | 8 | 10 |
| Q38 | 9 | 9 |
| Q39 | 9 | 9 |
| Q40 | 9 | 9 |

Live campaigns: local40-terra-goals-2026-10-13. Aug 2026 columns are a separate campaign with different agents: compare margins, not decimals.

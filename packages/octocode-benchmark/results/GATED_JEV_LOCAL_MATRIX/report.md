# Benchmark matrix — Gated JEV (current local MCP) · gated-jev-local40-2026-10-13 · local-mcp-clasify vs every other tool

Question set: `local-goals-v2`. Characters = model-in + model-out from the runner transcript or wrapper log. Correctness = the recorded independent judge, shown as a whole number out of 10: judge scores move by a point between runs, so treat tools within one point as equally correct. Rebuild: `compare/bin/matrix_summary.py`.

## Headline

| Tool | How it ran | Measured | Runs / Q | Median chars / Q | Mean chars / Q | Correctness /10 | Gated JEV (current local MCP) · gated-jev-local40-2026-10-13 · local-mcp-clasify leaner by (95% CI) | Leaner on |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Gated JEV (current local MCP) · gated-jev-local40-2026-10-13 · local-mcp-clasify | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 12,176 | 13,964 | 9 | anchor | — |
| Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-revised | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 13,522 | 14,131 | 9 | **1.01×** (0.90–1.15) | 20/40 |
| Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-old | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 12,840 | 15,201 | 10 | **1.03×** (0.92–1.16) | 21/40 |
| Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 13,198 | 16,220 | 9 | **1.08×** (0.96–1.24) | 21/40 |
| Gated JEV (current local MCP) · gated-jev-local40-2026-10-13 · local-mcp | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 10,188 | 15,487 | 10 | **0.99×** (0.88–1.13) | 18/40 |
| Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp-clasify | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 13,678 | 14,431 | 10 | **1.04×** (0.92–1.17) | 21/40 |
| Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp | local MCP · gpt-5.6-terra | Oct 2026 | 1 | 11,231 | 14,841 | 10 | **0.99×** (0.87–1.12) | 21/40 |

## Time to answer (wall clock, same harness only)

Seconds from the agent's start to its final answer, split into model time and tool + harness time. Only campaigns run with the current harness are timed; the Aug 2026 CLI arms logged tool time per call (with an npx start per call, none for Headroom), which is not comparable.

| Tool | Median s / Q | Mean s / Q | of which model | of which tools + overhead | Gated JEV (current local MCP) · gated-jev-local40-2026-10-13 · local-mcp-clasify faster by (95% CI) | Faster on |
|---|---:|---:|---:|---:|---:|---:|
| Gated JEV (current local MCP) · gated-jev-local40-2026-10-13 · local-mcp-clasify | 34.3 | 39.4 | — | — | anchor | — |
| Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-revised | 44.6 | 47.1 | — | — | 1.25× (0.96–1.62) | 26/40 |
| Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-old | 51.5 | 54.5 | — | — | 1.45× (1.11–1.89) | 25/40 |
| Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp | 47.1 | 53.9 | — | — | 1.40× (1.05–1.88) | 25/40 |
| Gated JEV (current local MCP) · gated-jev-local40-2026-10-13 · local-mcp | 34.8 | 39.7 | — | — | 1.02× (0.78–1.32) | 20/40 |
| Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp-clasify | 30.7 | 35.8 | — | — | 1.01× (0.81–1.27) | 19/40 |
| Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp | 27.8 | 31.6 | — | — | 0.85× (0.65–1.09) | 14/40 |

## Head-to-head (same campaign, same judge)

The fairest comparison: same agent model, same day, judged together. Ratios are B ÷ A per question (geometric mean, 95% CI): above 1× means A used fewer characters / less time.

| Campaign | A | B | Judged | A more correct / same / B more correct | Wins A / B | Chars B÷A | A leaner on | Time B÷A | A faster on |
|---|---|---|---:|---|---|---:|---:|---:|---:|
| local40-terra-goals-2026-10-13 | local-mcp | local-mcp-clasify | 40 | 2 / 38 / 0 | 22 / 16 | 1.04× (0.90–1.22) | 22/40 | 1.20× (1.05–1.36) | 29/40 |
| gated-jev-local40-2026-10-13 | local-mcp | local-mcp-clasify | 40 | 1 / 38 / 1 | 25 / 14 | 1.01× (0.89–1.14) | 22/40 | 0.98× (0.76–1.29) | 20/40 |
| selective-guidance-local40-2026-10-13 | local-mcp-clasify-old | local-mcp-clasify-revised | 40 | 0 / 40 / 0 | 14 / 18 | 0.99× (0.88–1.11) | 18/40 | 0.86× (0.71–1.04) | 16/40 |
| selective-guidance-local40-2026-10-13 | local-mcp | local-mcp-clasify-revised | 40 | 1 / 39 / 0 | 17 / 18 | 0.94× (0.80–1.10) | 20/40 | 0.89× (0.74–1.09) | 12/40 |

## Pairwise char matrix

Cell = per-question geometric mean of **column ÷ row** characters (>1× = row leaner); bracket = questions where the row was leaner.

| row ÷ col → | Gated JEV (current local MCP) · gated-jev-local40-2026-10-13 · local-mcp-clasify | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-revised | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-old | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp | Gated JEV (current local MCP) · gated-jev-local40-2026-10-13 · local-mcp | Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp-clasify | Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Gated JEV (current local MCP) · gated-jev-local40-2026-10-13 · local-mcp-clasify** | — | 1.01× (20) | 1.03× (21) | 1.08× (21) | 0.99× (18) | 1.04× (21) | 0.99× (21) |
| **Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-revised** | 0.99× (20) | — | 1.02× (22) | 1.07× (20) | 0.98× (17) | 1.02× (18) | 0.98× (19) |
| **Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-old** | 0.97× (19) | 0.99× (18) | — | 1.05× (23) | 0.96× (19) | 1.01× (18) | 0.96× (16) |
| **Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp** | 0.92× (19) | 0.94× (20) | 0.95× (17) | — | 0.92× (15) | 0.96× (20) | 0.92× (18) |
| **Gated JEV (current local MCP) · gated-jev-local40-2026-10-13 · local-mcp** | 1.01× (22) | 1.02× (23) | 1.04× (21) | 1.09× (25) | — | 1.05× (20) | 1.00× (24) |
| **Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp-clasify** | 0.96× (19) | 0.98× (22) | 0.99× (21) | 1.04× (20) | 0.96× (20) | — | 0.96× (18) |
| **Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp** | 1.01× (19) | 1.02× (21) | 1.04× (24) | 1.09× (22) | 1.00× (16) | 1.04× (22) | — |

## Characters per question

| Q | Gated JEV (current local MCP) · gated-jev-local40-2026-10-13 · local-mcp-clasify | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-revised | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-old | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp | Gated JEV (current local MCP) · gated-jev-local40-2026-10-13 · local-mcp | Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp-clasify | Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp |
|---|---:|---:|---:|---:|---:|---:|---:|
| Q1 | 3,789 | 3,830 | 3,392 | 3,378 | 3,812 | 3,393 | 3,631 |
| Q2 | 12,365 | 12,731 | 15,335 | 12,296 | 11,368 | 13,011 | 11,523 |
| Q3 | 5,309 | 4,940 | 5,046 | 6,286 | 5,018 | 4,529 | 6,123 |
| Q4 | 1,541 | 1,583 | 1,625 | 1,092 | 2,026 | 1,884 | 1,432 |
| Q5 | 6,758 | 9,767 | 6,072 | 6,515 | 8,796 | 6,958 | 15,949 |
| Q6 | 15,384 | 17,602 | 19,339 | 21,661 | 17,800 | 14,235 | 18,246 |
| Q7 | 14,925 | 16,349 | 17,721 | 15,941 | 15,615 | 15,877 | 15,884 |
| Q8 | 11,050 | 10,306 | 11,967 | 16,231 | 6,612 | 19,576 | 16,252 |
| Q9 | 4,149 | 3,808 | 3,937 | 2,962 | 4,101 | 4,342 | 3,433 |
| Q10 | 17,932 | 8,406 | 12,558 | 11,310 | 9,923 | 8,064 | 11,383 |
| Q11 | 3,569 | 5,023 | 5,464 | 22,754 | 4,966 | 6,946 | 4,470 |
| Q12 | 20,815 | 22,926 | 24,095 | 24,711 | 28,153 | 19,041 | 23,762 |
| Q13 | 4,093 | 2,678 | 3,115 | 2,600 | 3,158 | 3,135 | 2,976 |
| Q14 | 4,555 | 5,504 | 2,562 | 2,755 | 2,835 | 3,140 | 5,555 |
| Q15 | 18,666 | 16,919 | 14,539 | 31,588 | 15,368 | 14,485 | 7,993 |
| Q16 | 4,235 | 4,180 | 3,881 | 4,384 | 4,076 | 4,005 | 4,291 |
| Q17 | 7,961 | 9,558 | 6,817 | 8,898 | 8,312 | 9,003 | 8,026 |
| Q18 | 36,222 | 17,456 | 42,862 | 42,926 | 43,174 | 42,123 | 43,196 |
| Q19 | 17,871 | 32,287 | 26,908 | 17,286 | 12,833 | 25,182 | 13,696 |
| Q20 | 16,637 | 22,933 | 7,921 | 13,405 | 20,244 | 36,399 | 37,072 |
| Q21 | 13,872 | 17,340 | 13,286 | 15,066 | 8,986 | 19,881 | 10,478 |
| Q22 | 11,988 | 14,961 | 13,122 | 11,178 | 11,427 | 13,122 | 11,904 |
| Q23 | 3,752 | 3,589 | 4,179 | 3,746 | 3,692 | 4,273 | 3,552 |
| Q24 | 2,001 | 1,957 | 2,046 | 2,137 | 1,973 | 2,114 | 1,860 |
| Q25 | 11,761 | 12,271 | 5,706 | 11,470 | 10,372 | 11,209 | 11,079 |
| Q26 | 3,611 | 2,720 | 4,702 | 3,151 | 3,856 | 4,196 | 4,021 |
| Q27 | 14,645 | 26,366 | 25,031 | 26,237 | 21,146 | 14,513 | 20,262 |
| Q28 | 21,452 | 25,412 | 24,473 | 24,888 | 22,756 | 22,766 | 21,963 |
| Q29 | 8,824 | 8,713 | 8,803 | 4,438 | 4,352 | 5,092 | 4,757 |
| Q30 | 34,552 | 32,141 | 32,066 | 32,834 | 30,561 | 28,224 | 31,970 |
| Q31 | 30,889 | 18,247 | 17,898 | 24,231 | 24,322 | 17,499 | 28,039 |
| Q32 | 5,425 | 5,589 | 4,572 | 12,991 | 4,855 | 18,035 | 5,207 |
| Q33 | 16,836 | 14,313 | 34,062 | 26,266 | 26,221 | 15,908 | 26,294 |
| Q34 | 19,781 | 16,694 | 22,476 | 25,184 | 13,720 | 10,425 | 20,829 |
| Q35 | 37,110 | 23,665 | 31,230 | 25,016 | 50,972 | 31,079 | 48,525 |
| Q36 | 2,564 | 2,544 | 2,727 | 2,378 | 2,151 | 3,012 | 2,765 |
| Q37 | 32,764 | 17,760 | 28,613 | 51,897 | 70,791 | 31,238 | 30,369 |
| Q38 | 8,825 | 35,718 | 35,176 | 9,148 | 36,234 | 15,260 | 8,945 |
| Q39 | 26,224 | 18,150 | 31,477 | 36,587 | 32,903 | 23,178 | 41,019 |
| Q40 | 23,854 | 38,307 | 31,244 | 30,996 | 10,003 | 30,906 | 4,910 |

## Correctness per question (whole points /10)

| Q | Gated JEV (current local MCP) · gated-jev-local40-2026-10-13 · local-mcp-clasify | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-revised | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp-clasify-old | Octocode selective guidance · selective-guidance-local40-2026-10-13 · local-mcp | Gated JEV (current local MCP) · gated-jev-local40-2026-10-13 · local-mcp | Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp-clasify | Local 20.2.0 goals ablation · local40-terra-goals-2026-10-13 · local-mcp |
|---|---:|---:|---:|---:|---:|---:|---:|
| Q1 | 9 | 10 | 10 | 9 | 9 | 8 | 10 |
| Q2 | 8 | 10 | 9 | 9 | 8 | 9 | 9 |
| Q3 | 10 | 10 | 10 | 10 | 10 | 10 | 9 |
| Q4 | 10 | 9 | 8 | 10 | 10 | 10 | 10 |
| Q5 | 9 | 10 | 10 | 9 | 10 | 10 | 9 |
| Q6 | 9 | 10 | 10 | 9 | 10 | 10 | 9 |
| Q7 | 10 | 9 | 9 | 8 | 9 | 9 | 9 |
| Q8 | 9 | 9 | 9 | 10 | 10 | 9 | 10 |
| Q9 | 10 | 10 | 10 | 10 | 10 | 10 | 9 |
| Q10 | 10 | 10 | 9 | 10 | 9 | 10 | 9 |
| Q11 | 8 | 9 | 9 | 10 | 9 | 9 | 9 |
| Q12 | 9 | 8 | 10 | 9 | 9 | 9 | 9 |
| Q13 | 10 | 10 | 10 | 10 | 10 | 10 | 10 |
| Q14 | 9 | 10 | 9 | 9 | 10 | 9 | 9 |
| Q15 | 9 | 10 | 10 | 9 | 10 | 10 | 10 |
| Q16 | 10 | 10 | 10 | 10 | 10 | 10 | 10 |
| Q17 | 9 | 9 | 9 | 9 | 10 | 10 | 10 |
| Q18 | 10 | 10 | 10 | 9 | 10 | 9 | 10 |
| Q19 | 9 | 10 | 10 | 10 | 10 | 10 | 10 |
| Q20 | 10 | 10 | 9 | 9 | 10 | 10 | 10 |
| Q21 | 10 | 9 | 9 | 9 | 8 | 9 | 9 |
| Q22 | 10 | 10 | 10 | 10 | 10 | 10 | 10 |
| Q23 | 10 | 10 | 10 | 10 | 10 | 10 | 10 |
| Q24 | 10 | 10 | 10 | 10 | 10 | 10 | 10 |
| Q25 | 10 | 8 | 9 | 10 | 10 | 10 | 10 |
| Q26 | 9 | 10 | 10 | 10 | 9 | 10 | 10 |
| Q27 | 10 | 9 | 9 | 9 | 10 | 10 | 10 |
| Q28 | 8 | 9 | 9 | 9 | 9 | 8 | 8 |
| Q29 | 10 | 10 | 10 | 10 | 10 | 10 | 10 |
| Q30 | 10 | 10 | 10 | 10 | 10 | 10 | 9 |
| Q31 | 10 | 10 | 9 | 9 | 10 | 10 | 10 |
| Q32 | 10 | 10 | 10 | 10 | 10 | 10 | 10 |
| Q33 | 9 | 10 | 10 | 9 | 10 | 9 | 9 |
| Q34 | 9 | 9 | 9 | 10 | 8 | 9 | 10 |
| Q35 | 10 | 10 | 9 | 9 | 10 | 9 | 9 |
| Q36 | 10 | 10 | 10 | 9 | 10 | 10 | 10 |
| Q37 | 10 | 10 | 10 | 10 | 10 | 8 | 10 |
| Q38 | 10 | 10 | 9 | 10 | 9 | 9 | 9 |
| Q39 | 9 | 10 | 10 | 9 | 9 | 9 | 9 |
| Q40 | 8 | 9 | 10 | 9 | 10 | 9 | 9 |

Live campaigns: gated-jev-local40-2026-10-13, local40-terra-goals-2026-10-13, selective-guidance-local40-2026-10-13. Aug 2026 columns are a separate campaign with different agents: compare margins, not decimals.

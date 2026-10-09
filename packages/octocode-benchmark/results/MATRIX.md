# Benchmark matrix — Octocode v20 · lean-vs-mcp vs every other tool

Same GitHub questions (`compare/github-questions/`). Characters = model-in + model-out from the runner transcript or wrapper log. Correctness = blind gpt-5.5 judge, shown as a whole number out of 10: judge scores move by a point between runs, so treat tools within one point as equally correct. Rebuild: `compare/bin/matrix_summary.py`.

## Headline

| Tool | How it ran | Measured | Runs / Q | Median chars / Q | Mean chars / Q | Correctness /10 | Octocode v20 · lean-vs-mcp leaner by (95% CI) | Leaner on |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Octocode v20 · lean-vs-mcp | local MCP · claude-sonnet-5-5 | Oct 2026 | 1 | 8,168 | 11,245 | 9 | anchor | — |
| Octocode v20 · mcp-clasify-ab | local MCP · claude-sonnet-5-5 | Oct 2026 | 2 | 8,299 | 10,844 | 9 | **1.03×** (0.92–1.17) | 16/30 |
| gh lean · lean-vs-mcp | gh-lean · claude-sonnet-5-5 | Oct 2026 | 1 | 6,068 | 7,578 | 9 | **0.71×** (0.58–0.85) | 6/30 |
| Octocode v18 (CLI) | Octocode v18 CLI · pi agents | Aug 2026 | 3 | 16,233 | 22,111 | 9 | **2.13×** (1.78–2.53) | 28/30 |
| gh | plain gh CLI · pi agents | Aug 2026 | 3 | 37,560 | 114,849 | 9 | **4.33×** (2.62–6.92) | 25/30 |
| gh + RTK | rtk gh · pi agents | Aug 2026 | 3 | 68,395 | 368,586 | 9 | **8.29×** (4.96–13.88) | 28/30 |
| gh + Headroom | gh → Headroom · pi agents | Aug 2026 | 3 | 72,681 | 382,598 | 9 | **7.44×** (4.12–13.54) | 27/30 |

## Time to answer (wall clock, same harness only)

Seconds from the agent's start to its final answer, split into model time and tool + harness time. Only campaigns run with the current harness are timed; the Aug 2026 CLI arms logged tool time per call (with an npx start per call, none for Headroom), which is not comparable.

| Tool | Median s / Q | Mean s / Q | of which model | of which tools + overhead | Octocode v20 · lean-vs-mcp faster by (95% CI) | Faster on |
|---|---:|---:|---:|---:|---:|---:|
| Octocode v20 · lean-vs-mcp | 16.5 | 16.9 | 13.9 | 3.0 | anchor | — |
| Octocode v20 · mcp-clasify-ab | 19.4 | 22.9 | 14.9 | 8.0 | 1.27× (1.10–1.48) | 23/30 |
| gh lean · lean-vs-mcp | 19.4 | 18.3 | 15.2 | 3.1 | 1.08× (0.97–1.21) | 18/30 |

## Head-to-head (same campaign, same judge)

The fairest comparison: same agent model, same day, judged together. Ratios are B ÷ A per question (geometric mean, 95% CI): above 1× means A used fewer characters / less time.

| Campaign | A | B | Judged | A more correct / same / B more correct | Wins A / B | Chars B÷A | A leaner on | Time B÷A | A faster on |
|---|---|---|---:|---|---|---:|---:|---:|---:|
| mcp-clasify-ab-111154-2026-10-09 | mcp-clasify | mcp-noclasify | 30 | 3 / 18 / 9 | 9 / 21 | 1.04× (0.93–1.16) | 14/30 | 1.04× (0.92–1.18) | 12/30 |
| lean-vs-mcp-114934-2026-10-09 | mcp | gh-lean | 30 | 7 / 10 / 13 | 10 / 20 | 0.71× (0.58–0.85) | 6/30 | 1.08× (0.97–1.21) | 18/30 |

## Pairwise char matrix

Cell = per-question geometric mean of **column ÷ row** characters (>1× = row leaner); bracket = questions where the row was leaner.

| row ÷ col → | Octocode v20 · lean-vs-mcp | Octocode v20 · mcp-clasify-ab | gh lean · lean-vs-mcp | Octocode v18 (CLI) | gh | gh + RTK | gh + Headroom |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Octocode v20 · lean-vs-mcp** | — | 1.03× (16) | 0.71× (6) | 2.13× (28) | 4.33× (25) | 8.29× (28) | 7.44× (27) |
| **Octocode v20 · mcp-clasify-ab** | 0.97× (14) | — | 0.68× (5) | 2.06× (30) | 4.19× (25) | 8.03× (28) | 7.21× (27) |
| **gh lean · lean-vs-mcp** | 1.42× (24) | 1.46× (25) | — | 3.01× (30) | 6.13× (28) | 11.74× (29) | 10.54× (28) |
| **Octocode v18 (CLI)** | 0.47× (2) | 0.49× (0) | 0.33× (0) | — | 2.04× (23) | 3.90× (26) | 3.50× (24) |
| **gh** | 0.23× (5) | 0.24× (5) | 0.16× (2) | 0.49× (7) | — | 1.91× (21) | 1.72× (21) |
| **gh + RTK** | 0.12× (2) | 0.12× (2) | 0.09× (1) | 0.26× (4) | 0.52× (9) | — | 0.90× (10) |
| **gh + Headroom** | 0.13× (3) | 0.14× (3) | 0.09× (2) | 0.29× (6) | 0.58× (9) | 1.11× (20) | — |

## Characters per question

| Q | Octocode v20 · lean-vs-mcp | Octocode v20 · mcp-clasify-ab | gh lean · lean-vs-mcp | Octocode v18 (CLI) | gh | gh + RTK | gh + Headroom |
|---|---:|---:|---:|---:|---:|---:|---:|
| Q1 | 4,265 | 5,506 | 2,759 | 14,697 | 19,773 | 27,925 | 28,202 |
| Q2 | 8,469 | 6,838 | 1,607 | 19,159 | 731 | 26,361 | 1,322 |
| Q3 | 8,004 | 8,272 | 6,775 | 9,586 | 7,921 | 27,777 | 75,103 |
| Q4 | 11,535 | 10,174 | 6,775 | 26,201 | 131,764 | 136,621 | 257,472 |
| Q5 | 24,474 | 31,658 | 23,548 | 48,933 | 151,486 | 70,432 | 135,064 |
| Q6 | 4,948 | 6,141 | 2,117 | 14,593 | 42,905 | 53,565 | 41,147 |
| Q7 | 5,975 | 5,939 | 4,298 | 8,761 | 9,072 | 10,855 | 15,960 |
| Q8 | 3,880 | 4,332 | 2,502 | 14,574 | 23,947 | 63,101 | 59,135 |
| Q9 | 5,663 | 8,327 | 4,180 | 16,399 | 55,362 | 66,358 | 73,325 |
| Q10 | 7,558 | 7,722 | 5,263 | 12,246 | 13,200 | 10,552 | 9,377 |
| Q11 | 7,992 | 7,186 | 7,859 | 25,508 | 93,021 | 376,970 | 522,136 |
| Q12 | 5,526 | 5,582 | 5,671 | 17,036 | 82,360 | 98,514 | 82,695 |
| Q13 | 16,890 | 13,572 | 8,572 | 19,547 | 10,644 | 10,721 | 483,845 |
| Q14 | 2,906 | 3,137 | 3,167 | 7,596 | 10,390 | 8,312 | 6,093 |
| Q15 | 9,294 | 6,256 | 5,467 | 7,378 | 4,893 | 4,836 | 4,769 |
| Q16 | 3,867 | 3,668 | 3,527 | 10,731 | 23,578 | 1,057,962 | 959,745 |
| Q17 | 11,807 | 11,908 | 9,242 | 15,109 | 232,760 | 179,720 | 6,844,627 |
| Q18 | 3,425 | 3,704 | 2,923 | 12,772 | 12,178 | 8,244 | 7,614 |
| Q19 | 14,530 | 15,222 | 7,236 | 16,525 | 179,627 | 166,806 | 186,059 |
| Q20 | 10,959 | 9,698 | 7,634 | 15,816 | 48,996 | 114,467 | 80,465 |
| Q21 | 60,769 | 34,976 | 17,939 | 65,468 | 297,100 | 430,307 | 310,655 |
| Q22 | 16,278 | 15,504 | 4,615 | 53,622 | 12,611 | 425,890 | 13,237 |
| Q23 | 10,220 | 9,454 | 9,429 | 17,085 | 212,408 | 182,346 | 170,490 |
| Q24 | 3,594 | 13,002 | 6,465 | 16,067 | 70,767 | 114,119 | 72,038 |
| Q25 | 9,100 | 9,609 | 13,919 | 15,775 | 17,807 | 26,187 | 21,315 |
| Q26 | 6,037 | 4,534 | 3,823 | 16,594 | 66,256 | 50,292 | 24,089 |
| Q27 | 8,332 | 5,180 | 4,416 | 7,930 | 8,780 | 14,515 | 12,124 |
| Q28 | 32,967 | 30,322 | 11,801 | 62,423 | 1,472,374 | 6,964,358 | 835,870 |
| Q29 | 11,419 | 16,727 | 25,567 | 41,495 | 100,557 | 211,918 | 108,554 |
| Q30 | 6,657 | 11,180 | 8,243 | 33,689 | 32,215 | 117,539 | 35,424 |

## Correctness per question (whole points /10)

| Q | Octocode v20 · lean-vs-mcp | Octocode v20 · mcp-clasify-ab | gh lean · lean-vs-mcp | Octocode v18 (CLI) | gh | gh + RTK | gh + Headroom |
|---|---:|---:|---:|---:|---:|---:|---:|
| Q1 | 9 | 10 | 10 | 10 | 10 | 10 | 10 |
| Q2 | 8 | 9 | 9 | 10 | 10 | 10 | 10 |
| Q3 | 10 | 9 | 9 | 10 | 10 | 10 | 10 |
| Q4 | 10 | 8 | 8 | 9 | 8 | 10 | 7 |
| Q5 | 10 | 10 | 8 | 10 | 9 | 9 | 9 |
| Q6 | 9 | 10 | 10 | 9 | 10 | 10 | 10 |
| Q7 | 9 | 10 | 10 | 10 | 10 | 10 | 8 |
| Q8 | 10 | 10 | 10 | 10 | 10 | 10 | 10 |
| Q9 | 10 | 10 | 10 | 10 | 9 | 10 | 10 |
| Q10 | 10 | 10 | 10 | 10 | 9 | 6 | 6 |
| Q11 | 9 | 9 | 10 | 10 | 10 | 10 | 10 |
| Q12 | 10 | 10 | 10 | 10 | 9 | 10 | 10 |
| Q13 | 10 | 10 | 10 | 10 | 7 | 10 | 10 |
| Q14 | 4 | 8 | 10 | 10 | 10 | 8 | 2 |
| Q15 | 9 | 8 | 9 | 10 | 10 | 10 | 9 |
| Q16 | 8 | 8 | 10 | 10 | 10 | 10 | 5 |
| Q17 | 10 | 10 | 10 | 8 | 7 | 8 | 8 |
| Q18 | 9 | 10 | 10 | 10 | 10 | 10 | 5 |
| Q19 | 8 | 9 | 8 | 9 | 10 | 10 | 10 |
| Q20 | 10 | 10 | 10 | 10 | 10 | 10 | 9 |
| Q21 | 8 | 8 | 7 | 6 | 10 | 9 | 10 |
| Q22 | 9 | 10 | 10 | 8 | 10 | 10 | 10 |
| Q23 | 7 | 9 | 9 | 8 | 7 | 8 | 8 |
| Q24 | 10 | 8 | 9 | 10 | 7 | 8 | 10 |
| Q25 | 8 | 8 | 9 | 9 | 8 | 10 | 10 |
| Q26 | 10 | 10 | 10 | 8 | 9 | 10 | 10 |
| Q27 | 9 | 8 | 6 | 9 | 10 | 10 | 9 |
| Q28 | 7 | 8 | 6 | 7 | 9 | 7 | 8 |
| Q29 | 7 | 8 | 9 | 10 | 9 | 9 | 10 |
| Q30 | 7 | 8 | 9 | 10 | 10 | 10 | 9 |

Live campaigns: lean-vs-mcp-114934-2026-10-09, mcp-clasify-ab-111154-2026-10-09. Aug 2026 columns are a separate campaign with different agents: compare margins, not decimals.

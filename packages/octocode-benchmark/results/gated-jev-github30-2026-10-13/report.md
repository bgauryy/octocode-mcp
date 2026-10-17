# Paired ablation report

Off: `mcp` (gated-jev-github30-2026-10-13); on: `mcp-clasify` (gated-jev-github30-2026-10-13).
Ratios are on/off. Each metric uses only valid pairs with known positive values; missing usage is unknown.
Bootstrap resamples questions after averaging matched valid passes within each arm. Provider counts include probes when traced.

## all

Planned 30; valid 30; invalid 0; prior attempts off/on 1/1.

| Metric | Pass pairs | Questions | Geomean on/off | Median | Leaner on | Bootstrap 95% CI |
|---|---:|---:|---:|---:|---:|---:|
| chars | 30 | 30 | 1.041 | 1.007 | 15 | [0.923, 1.179] |
| reported_input_tokens | 30 | 30 | 1.126 | 1.132 | 9 | [1.028, 1.231] |
| reported_output_tokens | 30 | 30 | 1.098 | 1.048 | 10 | [1.006, 1.202] |
| wall_seconds | 30 | 30 | 0.982 | 0.969 | 15 | [0.789, 1.223] |

Correctness: 30 judged valid pairs; 0 without judgments. Whole-point-score means off/on: 9/9 (unrounded values in JSON). Head-to-head (>1 point): {'off': 0, 'on': 2, 'within_one_tie': 28}.

Adoption and traced provider attempts (off/on): goals 0/0, ranking replay 0/0, clasify calls 0/0; provider attempts 0/60 (missing trace runs 30/0).
Known provider usage totals and completeness flags are in JSON; incomplete totals are lower bounds, not zeros.

| Question | Planned | Valid | Invalid | Judged | Chars on/off |
|---|---:|---:|---:|---:|---:|
| Q1 | 1 | 1 | 0 | 1 | 0.576 |
| Q2 | 1 | 1 | 0 | 1 | 2.135 |
| Q3 | 1 | 1 | 0 | 1 | 0.867 |
| Q4 | 1 | 1 | 0 | 1 | 1.358 |
| Q5 | 1 | 1 | 0 | 1 | 1.015 |
| Q6 | 1 | 1 | 0 | 1 | 1.120 |
| Q7 | 1 | 1 | 0 | 1 | 1.058 |
| Q8 | 1 | 1 | 0 | 1 | 0.641 |
| Q9 | 1 | 1 | 0 | 1 | 1.372 |
| Q10 | 1 | 1 | 0 | 1 | 0.789 |
| Q11 | 1 | 1 | 0 | 1 | 0.881 |
| Q12 | 1 | 1 | 0 | 1 | 1.625 |
| Q13 | 1 | 1 | 0 | 1 | 1.119 |
| Q14 | 1 | 1 | 0 | 1 | 0.628 |
| Q15 | 1 | 1 | 0 | 1 | 1.274 |
| Q16 | 1 | 1 | 0 | 1 | 0.970 |
| Q17 | 1 | 1 | 0 | 1 | 0.997 |
| Q18 | 1 | 1 | 0 | 1 | 0.918 |
| Q19 | 1 | 1 | 0 | 1 | 0.889 |
| Q20 | 1 | 1 | 0 | 1 | 0.814 |
| Q21 | 1 | 1 | 0 | 1 | 0.925 |
| Q22 | 1 | 1 | 0 | 1 | 1.000 |
| Q23 | 1 | 1 | 0 | 1 | 1.358 |
| Q24 | 1 | 1 | 0 | 1 | 1.144 |
| Q25 | 1 | 1 | 0 | 1 | 1.076 |
| Q26 | 1 | 1 | 0 | 1 | 2.659 |
| Q27 | 1 | 1 | 0 | 1 | 0.725 |
| Q28 | 1 | 1 | 0 | 1 | 1.300 |
| Q29 | 1 | 1 | 0 | 1 | 0.603 |
| Q30 | 1 | 1 | 0 | 1 | 1.437 |

Machine-readable JSON includes every pass, adoption, per-tool calls, and provider usage completeness.

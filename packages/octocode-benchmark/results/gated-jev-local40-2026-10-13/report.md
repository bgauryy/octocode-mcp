# Paired ablation report

Off: `local-mcp` (gated-jev-local40-2026-10-13); on: `local-mcp-clasify` (gated-jev-local40-2026-10-13).
Ratios are on/off. Each metric uses only valid pairs with known positive values; missing usage is unknown.
Bootstrap resamples questions after averaging matched valid passes within each arm. Provider counts include probes when traced.

## all

Planned 40; valid 40; invalid 0; prior attempts off/on 0/0.

| Metric | Pass pairs | Questions | Geomean on/off | Median | Leaner on | Bootstrap 95% CI |
|---|---:|---:|---:|---:|---:|---:|
| chars | 40 | 40 | 1.009 | 1.015 | 18 | [0.885, 1.137] |
| reported_input_tokens | 40 | 40 | 0.991 | 1.040 | 15 | [0.897, 1.084] |
| reported_output_tokens | 40 | 40 | 1.004 | 1.048 | 18 | [0.915, 1.102] |
| wall_seconds | 40 | 40 | 0.979 | 1.021 | 20 | [0.757, 1.277] |

Correctness: 40 judged valid pairs; 0 without judgments. Whole-point-score means off/on: 10/9 (unrounded values in JSON). Head-to-head (>1 point): {'off': 1, 'on': 1, 'within_one_tie': 38}.

Adoption and traced provider attempts (off/on): goals 0/0, ranking replay 0/0, clasify calls 0/0; provider attempts 0/80 (missing trace runs 40/0).
Known provider usage totals and completeness flags are in JSON; incomplete totals are lower bounds, not zeros.

| Question | Planned | Valid | Invalid | Judged | Chars on/off |
|---|---:|---:|---:|---:|---:|
| Q1 | 1 | 1 | 0 | 1 | 0.994 |
| Q2 | 1 | 1 | 0 | 1 | 1.088 |
| Q3 | 1 | 1 | 0 | 1 | 1.058 |
| Q4 | 1 | 1 | 0 | 1 | 0.761 |
| Q5 | 1 | 1 | 0 | 1 | 0.768 |
| Q6 | 1 | 1 | 0 | 1 | 0.864 |
| Q7 | 1 | 1 | 0 | 1 | 0.956 |
| Q8 | 1 | 1 | 0 | 1 | 1.671 |
| Q9 | 1 | 1 | 0 | 1 | 1.012 |
| Q10 | 1 | 1 | 0 | 1 | 1.807 |
| Q11 | 1 | 1 | 0 | 1 | 0.719 |
| Q12 | 1 | 1 | 0 | 1 | 0.739 |
| Q13 | 1 | 1 | 0 | 1 | 1.296 |
| Q14 | 1 | 1 | 0 | 1 | 1.607 |
| Q15 | 1 | 1 | 0 | 1 | 1.215 |
| Q16 | 1 | 1 | 0 | 1 | 1.039 |
| Q17 | 1 | 1 | 0 | 1 | 0.958 |
| Q18 | 1 | 1 | 0 | 1 | 0.839 |
| Q19 | 1 | 1 | 0 | 1 | 1.393 |
| Q20 | 1 | 1 | 0 | 1 | 0.822 |
| Q21 | 1 | 1 | 0 | 1 | 1.544 |
| Q22 | 1 | 1 | 0 | 1 | 1.049 |
| Q23 | 1 | 1 | 0 | 1 | 1.016 |
| Q24 | 1 | 1 | 0 | 1 | 1.014 |
| Q25 | 1 | 1 | 0 | 1 | 1.134 |
| Q26 | 1 | 1 | 0 | 1 | 0.936 |
| Q27 | 1 | 1 | 0 | 1 | 0.693 |
| Q28 | 1 | 1 | 0 | 1 | 0.943 |
| Q29 | 1 | 1 | 0 | 1 | 2.028 |
| Q30 | 1 | 1 | 0 | 1 | 1.131 |
| Q31 | 1 | 1 | 0 | 1 | 1.270 |
| Q32 | 1 | 1 | 0 | 1 | 1.117 |
| Q33 | 1 | 1 | 0 | 1 | 0.642 |
| Q34 | 1 | 1 | 0 | 1 | 1.442 |
| Q35 | 1 | 1 | 0 | 1 | 0.728 |
| Q36 | 1 | 1 | 0 | 1 | 1.192 |
| Q37 | 1 | 1 | 0 | 1 | 0.463 |
| Q38 | 1 | 1 | 0 | 1 | 0.244 |
| Q39 | 1 | 1 | 0 | 1 | 0.797 |
| Q40 | 1 | 1 | 0 | 1 | 2.385 |

## terraform

Planned 8; valid 8; invalid 0; prior attempts off/on 0/0.

| Metric | Pass pairs | Questions | Geomean on/off | Median | Leaner on | Bootstrap 95% CI |
|---|---:|---:|---:|---:|---:|---:|
| chars | 8 | 8 | 0.803 | 0.763 | 5 | [0.507, 1.250] |
| reported_input_tokens | 8 | 8 | 0.789 | 0.893 | 5 | [0.549, 1.104] |
| reported_output_tokens | 8 | 8 | 0.844 | 0.907 | 5 | [0.686, 1.015] |
| wall_seconds | 8 | 8 | 0.866 | 0.870 | 4 | [0.447, 1.665] |

Correctness: 8 judged valid pairs; 0 without judgments. Whole-point-score means off/on: 10/9 (unrounded values in JSON). Head-to-head (>1 point): {'off': 1, 'on': 0, 'within_one_tie': 7}.

Adoption and traced provider attempts (off/on): goals 0/0, ranking replay 0/0, clasify calls 0/0; provider attempts 0/16 (missing trace runs 8/0).
Known provider usage totals and completeness flags are in JSON; incomplete totals are lower bounds, not zeros.

| Question | Planned | Valid | Invalid | Judged | Chars on/off |
|---|---:|---:|---:|---:|---:|
| Q33 | 1 | 1 | 0 | 1 | 0.642 |
| Q34 | 1 | 1 | 0 | 1 | 1.442 |
| Q35 | 1 | 1 | 0 | 1 | 0.728 |
| Q36 | 1 | 1 | 0 | 1 | 1.192 |
| Q37 | 1 | 1 | 0 | 1 | 0.463 |
| Q38 | 1 | 1 | 0 | 1 | 0.244 |
| Q39 | 1 | 1 | 0 | 1 | 0.797 |
| Q40 | 1 | 1 | 0 | 1 | 2.385 |

Machine-readable JSON includes every pass, adoption, per-tool calls, and provider usage completeness.

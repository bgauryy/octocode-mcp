# Output

Saved results go to `packages/octocode-benchmark/results/` (local, gitignored); raw runs, transcripts
and verdicts stay in `packages/octocode-benchmark/campaigns/` (gitignored scratch). A finished
campaign produces:

- `results/<campaign>/run.json` — every run (characters, calls, failures, tokens, cost) and
  every judgment, from `campaign_summary.py`.
- `results/overview/MATRIX.md` and `results/overview/matrix_summary.json` — rebuilt by `matrix_summary.py`.
- `results/overview/index.html` — the dashboard as one static file (`build_datasets.py --static`).
- The shareable dashboard, updated per [dashboard.md](dashboard.md).
- `results/<campaign>/report.md` — the write-up, plus a row in `results/README.md`.

Organize the write-up around what the evidence establishes. Include the arm and model
identities, pinned product/corpus, valid-pair denominator, correctness findings, per-question
ratios with uncertainty, failures, and material limits. There is no prescribed section order,
length or report template. Link detailed artifacts rather than reproducing transcripts.

For local or semantic comparisons, also report the question-set identity, valid pairs out
of attempted pairs, all retries, per-tool calls/errors, actual goals/clasify adoption, and
provider HTTP attempts with known and unknown usage. Keep Terraform or other declared
subsets separate. Show reported agent tokens alongside observable characters; do not
translate missing measurements into zero or infer a net monetary saving from token counts.
Record startup and calibration costs separately from scored research. Use distinct solver
and JEV token tables, with model names in every ambiguous heading. Show dollars only after
weighting each model's input, cache, cache-write and output usage by its own rates; record
rate sources and excluded/unknown charges. Label scenarios separately from billed costs.
Provider request latency and end-to-end solver latency are separate measurements.

Use `--question-set` for both summaries and matrices. The default GitHub dashboard must not
merge local questions by number; publish a separate local report or explicitly filtered
dashboard. Valid partial results remain useful when their missing-pair denominator is shown.

`scripts/ablation_report.py SUMMARY.json SUMMARY.json --off-arm local-mcp --on-arm
local-mcp-clasify --subset terraform=Q33-Q40 --json-out REPORT.json --md-out REPORT.md`
produces a paired report from one campaign containing both arms. It also accepts distinct
summary files for the same corpus. It resamples questions after averaging matched passes,
retains invalid and prior attempts, and reports known usage with completeness flags.

For a separate local dashboard, give `build_datasets.py` the filtered matrix through
`--matrix results/local-overview/local_matrix_summary.json`, its matching question directory through
`--questions local/datasets/goals-v2`, and a separate `--static` output. Live-run rows
are filtered to the matrix corpus; missing cost and model-time fields remain unknown.

Report failures and invalid runs, and link the run identity and evidence needed to reproduce
the result. Never expose credentials or private answer keys in a public report.

For the saved native CLI/shell exploration, `local/run-review.py --run <directory>` writes
per-question evidence audits and `quality/comparison.json` plus `quality/comparison.md` beside
the sealed originals. Semantic assessments live under `quality/semantic/`; retain evaluator
limitations, original judgments and independent acceptance corrections.
`local/render-review.py --run <directory> --output <fragment.html>` joins those records into
the comparison view. Neither command reruns solver research or fabricates unavailable usage.

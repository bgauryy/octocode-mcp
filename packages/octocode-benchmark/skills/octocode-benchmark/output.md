# Output

Saved results go to `packages/octocode-benchmark/results/` (committed); raw runs, transcripts
and verdicts stay in `packages/octocode-benchmark/campaigns/` (gitignored scratch). A finished
campaign produces:

- `results/runs/<campaign>.json` — every run (characters, calls, failures, tokens, cost) and
  every judgment, from `campaign_summary.py`.
- `results/MATRIX.md` and `results/matrix_summary.json` — rebuilt by `matrix_summary.py`.
- `results/index.html` — the dashboard as one static file (`build_datasets.py --static`).
- The shareable dashboard, updated per [references/dashboard.md](references/dashboard.md).
- `results/<campaign>.md` — the write-up, plus a row in `results/README.md`.

The write-up leads with the verdict, then:

1. **What ran:** the arms, agent and judge models, passes, and the pinned build (`$CAMP/build/fingerprint.txt`).
2. **Headline:** median characters per question, the geometric-mean ratio with its 95%
   interval and leaner count, and correctness in whole points with the head-to-head counts.
3. **Where it differs:** the questions that drive the ratio and why, from the transcripts.
4. **Friction:** failed calls by cause (rate limits, refused commands, schema errors).
5. **Caveats:** single pass, cross-campaign comparisons, public questions.

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

`compare/bin/ablation_report.py SUMMARY.json SUMMARY.json --off-arm local-mcp --on-arm
local-mcp-clasify --subset terraform=Q33-Q40 --json-out REPORT.json --md-out REPORT.md`
produces a paired report from one campaign containing both arms. It also accepts distinct
summary files for the same corpus. It resamples questions after averaging matched passes,
retains invalid and prior attempts, and reports known usage with completeness flags.

For a separate local dashboard, give `build_datasets.py` the filtered matrix through
`--matrix results/local_matrix_summary.json`, its matching question directory through
`--questions compare/local-questions-v2`, and a separate `--static` output. Live-run rows
are filtered to the matrix corpus; missing cost and model-time fields remain unknown.

Report failures and invalid runs, but leave run IDs, transcripts and process logs out of
the write-up.

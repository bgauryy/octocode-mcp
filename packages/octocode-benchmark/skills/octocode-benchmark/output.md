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

Report failures and invalid runs, but leave run IDs, transcripts and process logs out of
the write-up.

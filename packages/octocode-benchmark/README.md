# @octocodeai/octocode-benchmark

Rates how an **Octocode MCP version** researches GitHub against other tool setups: plain
`gh`, `gh` with `--json/--jq` projections and filters, `gh` + RTK, `gh` + Headroom, or
another Octocode version. Every arm answers the same questions with a fresh headless agent, a
blind judge grades correctness, and each agent's transcript says how many characters went
through the model.

**Results:** [results/MATRIX.md](results/MATRIX.md) (every arm against the anchor and each
other) · [results/index.html](results/index.html) (the dashboard as one file) ·
[results/README.md](results/README.md) (every campaign write-up).

**Run it:** the [octocode-benchmark skill](skills/octocode-benchmark/SKILL.md) has the flow,
the arms, and the rules.

```
compare/
  arms/               one brief per arm + the shared runner brief
  bin/                run_campaign.sh · run_arm.sh · judge_pair.sh · campaign_summary.py ·
                      matrix_summary.py · preflight.sh · transcript_to_log.py · guard/gh · ghc
  github-questions/   the shared question set
skills/octocode-benchmark/
  SKILL.md            the flow
  references/         method, dashboard publishing, the judge's rubric
  dashboard/          page.html, build_datasets.py, release-notes.json
results/              campaign write-ups, results/runs/*.json, MATRIX.md, index.html
campaigns/            raw runs, transcripts and verdicts (gitignored)
```

`yarn verify` lints the scripts and runs the harness tests.

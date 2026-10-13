# @octocodeai/octocode-benchmark

Measures how an **Octocode MCP version** researches GitHub and pinned local repositories.
Compare versions, optional goals and `clasify`, or GitHub tool setups such as `gh`, lean
`gh`, RTK and Headroom. Every arm answers the same questions with a fresh headless agent;
a blind judge grades correctness against source. Observable tool exchanges, reported model
tokens, time and failures are measured separately.

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
  local-questions-v2/ 40 local questions and pinned repository manifests; private rubrics stay outside solver access
skills/octocode-benchmark/
  SKILL.md            the flow
  references/         method, dashboard publishing, the judge's rubric
  dashboard/          page.html, build_datasets.py, release-notes.json
results/              campaign write-ups, results/runs/*.json, MATRIX.md, index.html
campaigns/            raw runs, transcripts and verdicts (gitignored)
```

`yarn verify` lints the scripts and runs the harness tests.

The harness supports Claude, Pi and Codex runners. Codex Terra comparisons can meter JEV
requests, including startup probes and failed requests, without saving request bodies or
credentials. See the [method](skills/octocode-benchmark/references/method.md) for isolation,
budgets and measurement limits. Compare each corpus separately: local Q1 and GitHub Q1 are
different questions.

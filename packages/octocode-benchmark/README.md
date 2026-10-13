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

## Latest local MCP results — October 13, 2026

The local `octocode-mcp` **20.2.0** build completed **140 valid Terra runs and 70 blind
comparisons**, with goals and JEV enabled versus disabled. The solver was
`gpt-5.6-terra` at medium effort; each question had one run per arm.

| Corpus | Paired questions | Terra input-token change, enabled vs disabled [95% CI] |
|---|---:|---:|
| Local repositories | 40 | −0.9% [−10.3%, +8.4%] |
| GitHub | 30 | **+12.6% [+2.8%, +23.1%]** |
| Terraform, included in local | 8 | −21.1% [−45.1%, +10.4%] |

Changes use question-weighted geometric means. Local and Terraform savings are
inconclusive. Blind quality scores tied within one point in **66/70 comparisons**;
the [full report](results/gated-jev-2026-10-13.md) includes source audits of all four
larger differences. These are development questions, not a held-out evaluation.

Agents made **zero goals requests and zero `clasify` calls**, so this run demonstrated
no active reranking savings. Separately from Terra, JEV consumed **40,588 input and
2,920 output tokens** across **146 startup probes**, including setup and the retried
attempt. No JEV request classified research evidence; this startup overhead is not
a per-query cost. See the [local dashboard](results/gated-jev-local.html) and
[GitHub dashboard](results/gated-jev-github.html) for individual results.

## Package layout

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

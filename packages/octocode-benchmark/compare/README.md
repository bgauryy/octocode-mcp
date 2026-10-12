# Compare

- `arms/` — `runner.md` (every GitHub runner's brief), `local-runner.md` (the local runners'
  brief) and one brief per arm: `mcp.md` (also used by `local-mcp*`), `gh-lean.md`, `gh.md`,
  `rtk.md`, `headroom.md`, `local-shell.md`. The brief is the arm's only primer.
- `bin/` — the harness. `run_campaign.sh` runs arms over questions in parallel, `run_arm.sh`
  runs one isolated agent, `transcript_to_log.py` measures it, `judge_pair.sh` judges two
  arms blind, `campaign_summary.py` and `matrix_summary.py` aggregate, `preflight.sh` checks
  setup, `guard/gh` keeps every gh call read-only, `guard-local/` (`git`, `find`) keeps the
  `local-shell` arm read-only, `ghc` + `hr_compress.py` are the Headroom arm's compressor.
- `github-questions/` — the shared questions. A question is a title, an `id` and a
  self-contained `## Question` naming repos and refs; no hints, scope or answers.
- `local-questions/` — 30 questions against the pinned clones in
  `octocode-local-testing/repos/`, run by arms named `local-…`; `answers/` holds the ground
  truth the judge reads (runners never see it).

The flow and its rules: [`../skills/octocode-benchmark/SKILL.md`](../skills/octocode-benchmark/SKILL.md).

# Octocode benchmark

Compare source-backed research quality, retrieval volume and time across Octocode versions,
local tools and GitHub CLIs. Workers answer the same questions; independent judges check the
source before efficiency is compared. Keep local and GitHub corpora separate.

## Choose the benchmark and evaluation method

Use the [octocode-eval-benchmark skill](../../skills/octocode-eval-benchmark/SKILL.md)
to design and assess comparisons. This package supplies the runnable harness and corpora.
Before launching workers, freeze the primary metric, correctness guardrails, case exposure,
judge calibration, budgets, retry policy and decision rule in the campaign plan. Keep that
plan beside the raw run; `campaign.json` is retained in the generated summary. Existing
questions that informed product changes are development cases, not sealed confirmation data.

| Requested comparison | Follow | Supported execution |
|---|---|---|
| GitHub / external research | [External cookbook](external/README.md) | Claude or Pi for MCP versus gh/shell; Codex for MCP arms |
| Pinned local repositories | [Local cookbook](local/README.md) | Fresh Codex MCP workers; existing Claude/Pi local shell arms |
| Installed local models using native tools | [Local model cookbook](local/README.md#compare-installed-local-models-with-the-native-tools) | FreeLlama MCP inference and six current native local tools |
| Native binary versus rg | [Recorded exploration](local/README.md#reproduce-the-native-cli-versus-shell-exploration) | Saved-run audit; no generic fresh Codex CLI/shell runner |

Do not substitute one execution lane for another without recording the harness change and
rerunning both arms. Finish with `Accept`, `Revert`, `Inconclusive` or `Invalid` under the
evaluation skill's criteria. Missing quality or noncomparable usage cannot establish a win.

## Run a GitHub comparison

Run these commands from `packages/octocode-benchmark`. Use an authenticated Claude, Pi or
Codex installation; the chosen tools must be installed and authenticated too. The default
runner is Claude. Codex supports MCP arms only; use Claude or Pi for shell/gh arms.

```bash
# Inspect available tools and authentication before launching paid agent work.
bash scripts/preflight.sh mcp,gh-lean
python3 scripts/leak_check.py

# Every arm/pass/question gets a fresh worker. Select all, a range, or comma-separated IDs.
CAMP=campaigns/github-comparison
RUNNER=claude bash scripts/run_campaign.sh "$CAMP" mcp,gh-lean 1 all 4

# Judge each pair after both answers are sealed. Set an available judge model explicitly.
python3 scripts/question_catalog.py external/questions |
  xargs -P 4 -I{} env JUDGE_RUNNER=codex JUDGE_MODEL=gpt-6.1-sol \
    bash scripts/judge_pair.sh "$CAMP" mcp gh-lean 1 {}

# Publish the measured summary, then rebuild the default GitHub matrix and dashboard.
python3 scripts/campaign_summary.py "$CAMP" --question-set github-v2 --judge-model gpt-6.1-sol
python3 scripts/matrix_summary.py --question-set github-v2
python3 dashboard/build_datasets.py --static results/overview/index.html
```

Freeze the build, question set, source revisions, model, reasoning effort, budgets and retry
policy before scored runs. MCP arms snapshot the local build unless `OCTO_MCP_CMD` selects
another server. Match `RUNNER_MODEL` between arms. Re-running skips successful runs and retains
invalid attempts; never rerun a valid answer simply because it scored poorly.

## Run a local comparison

The [local cookbook](local/README.md) covers the language questions, earlier pinned datasets,
native CLI exploration, workers and saved-run audits. For a fresh local MCP worker:

```bash
export LOCAL_REPOS="$PWD/local/repos"
export QUESTION_DIR="$PWD/local/questions"
export QUESTION_REPO_MAP="$PWD/local/repositories.json"
RUNNER=codex RUNNER_MODEL=gpt-5.6-terra bash scripts/preflight.sh local-mcp
RUNNER=codex RUNNER_MODEL=gpt-5.6-terra \
  bash scripts/run_campaign.sh campaigns/local-comparison local-mcp 1 all 1
```

Use the manifest matching your checkouts. It pins revisions and assigns repository scope
outside the question text. Dirty tracked trees fail closed. Add a second `local-mcp-*` arm
with its `OCTO_MCP_CMD_<arm_name_with_underscores>` override for a version comparison. The
[local cookbook](local/README.md#run-a-paired-local-mcp-comparison) supplies the complete
two-arm run, judge and summary commands. The
[external cookbook](external/README.md) describes the GitHub arms and their restrictions.
The saved native CLI versus rg exploration has its own receipts and audit commands; it is
not a generic Codex shell arm.

## Workers, judges and measurements

Workers receive one [shared research brief](prompts/runner.md), or its
[local counterpart](prompts/local-runner.md), one arm primer from `prompts/`, and one question.
They can organize their answer naturally, with exact evidence and honest uncertainty.
Judges follow [source-backed judging](docs/judging.md); private rubrics and competing answers
never reach workers. Calibrate the judge, shuffle X/Y, withhold costs until quality is locked,
and retain uncertainty and review disagreements.

Exclude the initial prompt from normalized tool-exchange accounting. Report actual provider
usage separately when it includes prompt tokens. Unknown timing or tokens stay unknown.
Citation existence and matching snippet bytes do not establish answer correctness.
See [method and isolation](docs/method.md), [runner configuration](docs/running.md),
[harness components](docs/harness.md) and [output accounting](docs/outputs.md).

## Find and save results

Results live in `results/`, which is local and gitignored (repository `.gitignore`); share a
result by publishing its directory, not by committing it.

- `results/README.md`: the local results index; each result has its own directory and brief `README.md`.
- `results/<campaign>/run.json`: measured runs, attempts and judgments, written by the summary.
- `results/<result>/report.md`: detailed analysis; related dashboards and data stay beside it.
- `results/overview/README.md`: default matrix, dashboard and historical aggregate data.
- `campaigns/<name>/`: raw transcripts, sealed answers, receipts and judge attempts; gitignored.

A result README states the comparison and links its evidence. Preserve existing reports and
raw records. New campaign summaries create a brief README automatically. For a separate
corpus, pass `--question-set` to summaries and matrices and give the dashboard its matching
`--matrix`, `--questions` and `--static` paths; never overwrite the GitHub overview with local Q1.

## Package layout and checks

```text
scripts/       runners, guards, measurement, judges and tests
prompts/       shared worker briefs and arm primers
local/         local cookbook, repos/, e2e/, questions, pinned datasets and saved-run review
external/      GitHub cookbook and questions
dashboard/     dashboard source, data builder and release notes
docs/          method, judging, outputs, harness guide and preserved article
experiments/   scoped benchmark experiments
results/       one directory and README per result; overview aggregates
campaigns/     raw campaign evidence (gitignored)
```

```bash
# From the monorepo root:
yarn workspace @octocodeai/octocode-benchmark verify
node skills-dev/octocode-dev/scripts/dev.mjs docs:verify
```

The old `compare`, `post` and benchmark skill directories were consolidated into these owners.
No separate benchmark skill is required to run this package.

# Local repository benchmark cookbook

Compare source-backed answers over pinned local checkouts. The [language research
questions](questions/) contain hard engineering research tasks: each file
contains only its goal and questions. Repository assignment, tool instructions, measurements
and private judge evidence live outside that folder.

Start with the [evaluation method](../README.md#choose-the-benchmark-and-evaluation-method),
which applies `octocode-eval-benchmark` before executing this local harness.

## Choose a catalog

| Catalog | Purpose | Runner status |
|---|---|---|
| [Language questions](questions/) | Hard engineering, root-cause and call-chain questions across the cloned language repositories | Used by the recorded native CLI versus shell exploratory run below |
| [Local v1](../local/datasets/core-v1/) | Earlier local research set with private answer keys | Existing `local-*` campaign arms |
| [Local v2](../local/datasets/goals-v2/) | Pinned repositories, tracked-file hashes and repository selection in a catalog | Existing local MCP campaign runner |
| [Selective guidance transfer](../local/datasets/selective-guidance-transfer-v1/) | Separate guidance-transfer experiment | Use its own catalog and manifest; do not pool it with other sets |

The shared campaign scripts discover both `Qn.md` and numbered descriptive filenames.
Repository assignment for the language questions belongs in `local/repositories.json`, outside
the question text. Select `all`, a numeric range or comma-separated question IDs when running
a campaign. Do not rename questions or inject repository hints to fit a runner.

## Run the existing MCP benchmark

Run from `packages/octocode-benchmark`; set the repository root to the clones you actually
pinned. Confirm its revisions and tracked-file hashes against the selected manifest. Dirty pinned
checkouts fail closed during fresh corpus preparation; use an unchanged pinned source rather
than treating historical working-tree observations as a reproducible clean snapshot.

```bash
export LOCAL_REPOS="$PWD/local/repos"
export QUESTION_DIR="$PWD/local/questions"
export QUESTION_REPO_MAP="$PWD/local/repositories.json"
RUNNER=codex RUNNER_MODEL=gpt-5.6-terra bash scripts/preflight.sh local-mcp
RUNNER=codex RUNNER_MODEL=gpt-5.6-terra bash scripts/run_campaign.sh campaigns/local-example local-mcp 1 1-3 1
```

Codex supports MCP arms in this runner. Claude and Pi also support `local-shell`; do not
claim a Codex shell comparison from the command above. Compare MCP variants by listing both
arms and configuring their `OCTO_MCP_CMD_<arm>` commands as described in the
[benchmark guide](../docs/running.md). A build snapshot prevents another
session's rebuild from changing the running campaign.

## Run a paired local MCP comparison

Choose the actual baseline and candidate server commands before running. Use the same model,
reasoning effort and budgets for both arms. This example requires those commands explicitly;
it does not invent a baseline or install another model.

```bash
export LOCAL_REPOS="$PWD/local/repos"
export QUESTION_DIR="$PWD/local/questions"
export QUESTION_REPO_MAP="$PWD/local/repositories.json"
export OCTO_MCP_CMD_local_mcp_baseline="${BASELINE_MCP_CMD:?Set the baseline MCP server command}"
export OCTO_MCP_CMD_local_mcp_candidate="${CANDIDATE_MCP_CMD:?Set the candidate MCP server command}"
export RUNNER=codex RUNNER_MODEL=gpt-5.6-terra
export JUDGE_RUNNER=codex JUDGE_MODEL=gpt-6.1-sol
CAMP=campaigns/local-paired

bash scripts/preflight.sh local-mcp-baseline,local-mcp-candidate
bash scripts/run_campaign.sh "$CAMP" local-mcp-baseline,local-mcp-candidate 1 all 2
python3 scripts/question_catalog.py "$QUESTION_DIR" |
  xargs -P 2 -I{} bash scripts/judge_pair.sh "$CAMP" local-mcp-baseline local-mcp-candidate 1 {}
python3 scripts/campaign_summary.py "$CAMP" --question-set local-language \
  --runner-model "$RUNNER_MODEL" --judge-model "$JUDGE_MODEL"
```

The manifest pins the checkouts; it must match your chosen corpus. Calibration and the frozen
evaluation plan precede this sequence. After judging, review missing or disputed quality and
publish the report under `results/local-paired/` alongside its generated README and `run.json`.
Use corpus-specific matrix/dashboard output paths as the package README describes.

Workers receive the [local research brief](../prompts/local-runner.md), one
[arm primer](../prompts/), and one question. They answer every material part from source,
with precise anchors and honest uncertainty. There is no required answer length or prose
layout. The [shell primer](../prompts/local-shell.md) lists permitted read-only commands;
the [MCP primer](../prompts/mcp.md) explains that arm's tool use. Workers cannot read
private rubrics, judge outputs or the competing answer.

## Reproduce the native CLI versus shell exploration

The recorded exploratory campaign is
[`terra-cli-ab-20261017T094616Z`](../campaigns/terra-cli-ab-20261017T094616Z).
Its `run.json` contains question text, question-to-repository assignments, revisions, binary
hash and accounting rules. Its `shell-worker-packet.md` and `octocode-worker-packet.md` are
the actual worker instructions; the Octocode packet includes the native tool catalog and
usage primer. Keep those original packets as historical evidence rather than editing them
into current instructions.

The requested binary is
`/Users/bgaryy/code/octocode/packages/octocode-native/npm/darwin-arm64/octocode`.
The two worker roles used Terra, with a third continuation session when the Octocode worker
ran out of context. The native arm's research used that binary only. The shell arm could use
rg and ast-grep, but did not use ast-grep. This was a measured exploration rather than a
fresh isolated session per question. Its `harness/meter.py` records the research command
exchanges; inspect that campaign's packets and meter arguments before replaying it into a
new output directory. Do not overwrite the sealed original answers or backfill missing
receipts. This is not a generic campaign-runner command for native CLI arms.

## Judge every question

Use the [shared judging policy](../docs/judging.md). A judge
independently checks the assigned repository at the recorded revision, establishes the facts,
then grades shuffled X/Y answers without knowing their tool arm or efficiency. Check both the
returned evidence and the answer: source fidelity, relevance, completeness, correct causal
links, unsupported conclusions and appropriate uncertainty. A path and line existing proves
only that the citation resolves. Record unverifiable evidence separately from contradicted
claims. Calibrate on known supported and unsupported examples, then inspect important score
differences against source.

For a campaign produced by the shared runner:

```bash
export ANSWER_DIR=/absolute/path/to/private/rubrics
JUDGE_RUNNER=codex JUDGE_MODEL=<available-model> bash scripts/judge_pair.sh campaigns/local-example local-mcp local-mcp-variant 1 Q1
python3 scripts/campaign_summary.py campaigns/local-example --question-set local-example
```

Supply real paired arm names and repeat judging for each question. The rubric directory stays
outside the solver corpus. Judge a historical exploratory campaign through its saved question
and answer artifacts rather than pretending it has the shared runner's directory shape.
The summary parser needs verdict fields, but judges may organize their explanation naturally.

## Output and interpretation

The shared runner writes original answers, transcripts, status and receipts under
`campaigns/<name>/runs/<arm>-p<pass>-<Qn>/`, measured exchanges at campaign root, previous
attempts under `attempts/`, and blind verdicts under `judge/<armA>~<armB>/`. The judge's
`MAP.secret.txt` is private until grading is sealed. The summary command writes
`results/<campaign-name>/run.json`; publish reports and dashboards under `results/`.

Review a saved native CLI/shell run and render its comparison:

```bash
python3 local/run-review.py --run /absolute/path/to/saved-run
python3 local/render-review.py --run /absolute/path/to/saved-run --output /absolute/path/to/comparison.html
```

The review writes `quality/returned-data.json`, a per-question integrity report and
`quality/comparison.json` plus `quality/comparison.md`. It reads independent semantic assessments
from `quality/semantic/audit.json` and factual acceptance from `quality/semantic/acceptance.json`.
The renderer produces an inline HTML fragment from those records. Confirmed correction counts
are partial findings, not exhaustive error totals or accuracy scores. Original provisional
grades and acceptance disagreements remain available; rejected findings are not presented as
confirmed errors. These commands do not replay solver research or substitute for semantic judging.

The exploratory campaign instead has `shell/Qnn/` and `octocode/Qnn/` with `answer.md`, raw
`tool-*.txt`, `tools.jsonl`, timings and metrics. `seal.json` preserves original answer hashes.
Quality audits belong beside these artifacts and must reference those hashes. Its initial
prompt is excluded from normalized retrieval and generated-argument counts. Actual provider
input/output tokens and inference rounds are unavailable. Shell Q07 has no valid tool receipt;
exclude it from paired efficiency estimates and label its research evidence unverified.
Large shell outputs may have been truncated by the host, so raw returned tokens are not a
measurement of model-visible input. Native search timing also showed a sandbox-dependent
latency difference. Keep these limits beside the comparison.

Use correctness first, then compare retrieval volume, calls, errors and time among answers
with equivalent quality. Keep quality, evidence fidelity and efficiency as separate results;
a cheap unsupported answer must not win because it is short. Unknown usage is not zero.

## End-to-end suites

The [end-to-end harness](e2e/README.md) and its fixtures and validation sources live in `local/e2e`. Cloned repositories live separately in [local/repos](repos/README.md) and are reused in place. From the monorepo root, run `node packages/octocode-benchmark/local/e2e/harness/run-all.mjs`; live suites require explicit `OCTOCODE_LIVE=1`.

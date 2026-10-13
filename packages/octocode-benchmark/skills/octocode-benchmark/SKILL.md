---
name: octocode-benchmark
description: "Use when measuring Octocode research quality and context cost on GitHub or pinned local repositories; good for version comparisons, goals and clasify with or without JEV, fresh isolated Claude/Pi/Codex agents, blind source-backed judging, and results dashboards. Also compares gh, lean gh, RTK and Headroom on the shared GitHub questions."
---

# Octocode benchmark

Measures **how an Octocode MCP version researches code** against other tool setups. Every arm
answers the same questions with a fresh headless agent; a blind judge grades correctness; the
transcript measures observable tool exchanges and reported model tokens. The output is a matrix and a
dashboard: who is leaner, by how much, at what correctness.

Paths are relative to `packages/octocode-benchmark/`.

## The flow

```bash
CAMP=campaigns/<what>-$(date +%H%M%S)-$(date +%F)          # gitignored

# 0. Preflight: tools, auth, each MCP arm's tool count and schema size; then the overfitting
#    check (no question term in anything an agent sees; product hits listed for review).
compare/bin/preflight.sh mcp,gh-lean
python3 compare/bin/leak_check.py

# 1. Run: one isolated agent per (arm, pass, question). Re-running retries only invalid runs.
compare/bin/run_campaign.sh $CAMP mcp,gh-lean 1 1-30 4      # arms · passes · questions · parallel jobs

# 2. Judge: blind X/Y per question, a different model family than the runners.
for q in $(seq 1 30); do echo Q$q; done | xargs -P 4 -I{} compare/bin/judge_pair.sh $CAMP mcp gh-lean 1 {}

# 3. Summarize the campaign into committed results, then rebuild the matrix.
python3 compare/bin/campaign_summary.py $CAMP --octocode-label "Octocode v20 (local 20.1.1)"
python3 compare/bin/matrix_summary.py                       # → results/MATRIX.md, results/matrix_summary.json

# 4. Show it: static page in the repo, and the shareable dashboard (references/dashboard.md).
python3 skills/octocode-benchmark/dashboard/build_datasets.py --static results/index.html
```

Then write `results/<campaign>.md` as [output.md](output.md) describes.

## Arms

| Arm | The agent gets | Brief |
|---|---|---|
| `mcp` | the Octocode MCP server only, clasify off | `compare/arms/mcp.md` |
| `mcp-clasify` | the same, clasify offered (needs a provider key) | `compare/arms/mcp.md` |
| `local-mcp` | five local MCP read tools, semantic features off | `compare/arms/mcp.md` |
| `local-mcp-clasify` | the same, with optional goals and clasify | `compare/arms/mcp.md` |
| `gh-lean` | read-only `gh` + `--json/--jq/--limit` + `grep/sed -n/head/jq` filters | `compare/arms/gh-lean.md` |
| `gh` | read-only `gh`, no filters | `compare/arms/gh.md` |
| `rtk` | `rtk gh …` | `compare/arms/rtk.md` |
| `headroom` | `ghc …` (gh → Headroom; needs `HR_PY`) | `compare/arms/headroom.md` |

**Rate an MCP version:** `OCTO_MCP_CMD="npx -y octocode-mcp@20.1.1" run_campaign.sh …` runs a
published version; unset, it runs the local build (`packages/octocode-mcp/dist`) against a
snapshot of the MCP bundle and native addon taken when the campaign starts. Give each version its own
`--octocode-label` and the matrix shows them side by side. **Add an arm:** write
`compare/arms/<arm>.md` and its tool flags in `run_arm.sh`.

GitHub runners share `compare/arms/runner.md`; local runners share `compare/arms/local-runner.md`.
Compare arms on the same `RUNNER_MODEL`, within the same campaign and question set.
The default runner is Claude; `RUNNER=pi` and `RUNNER=codex` select other installed hosts.
For Terra use `RUNNER=codex RUNNER_MODEL=gpt-5.6-terra`; Codex supports MCP arms only.

For a local comparison, set `QUESTION_DIR` to `compare/local-questions-v2` and
`QUESTION_REPO_MAP` to its `repositories.json`, using absolute paths. Set `ANSWER_DIR` only
for the judge's private rubrics. Codex copies the question's selected tracked repositories
into a fresh lab and denies evaluator paths through the actual MCP policy. Its local arms
offer only the five MCP read tools, plus clasify when available. Check CLI-only tools in a
separate applicability lane; do not claim they were available to the solver.

Use `compare/bin/with_credentials.mjs -- <command> ...` to load canonical credentials into
the child environment. Enable `BENCH_CLASSIFICATION_TRACE=1` for JEV ablations: the proxy
records every provider attempt, including setup and errors, without saving bodies or keys.
Freeze the product, questions and harness before scored runs. Record budgets and run order;
see [method](references/method.md) for Codex limits, isolation and accounting.

## Rules that keep it honest

- **Isolation.** One fresh agent process per run: no inherited settings, project instructions, skills, memory, or
  other tools. Never let a runner see another arm, a verdict, or an answer key.
- **Measured, never reported.** Characters come from the runner's own transcript
  (`transcript_to_log.py`): tool calls written + tool results read + the final answer.
  Failed and refused calls count. `sumlog.py --strict <log>` re-hashes every artifact.
- **Retain invalid runs.** Crashes, budget stops and missing MCP execution are invalid.
  Preserve every attempt and its cost; retry only within the campaign's declared budget.
  Never rerun an unfavorable valid answer.
- **Correctness first, as whole points.** The judge moves about a point between runs, so
  report correctness rounded to whole points and treat arms within one point as tied. Only
  then do characters decide.
- **Ratios are per question.** Headline the geometric mean of per-question ratios with a 95%
  bootstrap CI and the leaner count; never a pooled total alone.
- **Same campaign beats cross-campaign.** Arms from different campaigns ran with different
  agents or days: show them, label them, but draw conclusions from same-campaign pairs.
- **No tuning to the questions.** `leak_check.py` must find no question term in the briefs or
  the MCP's instructions and tool list. A product change made because a benchmark question
  failed turns that question into development data: note it, and confirm on new questions.
- **Missing is unknown.** Hosts expose different token and timing fields. Do not turn missing
  API time, usage or provider cost into zero. Codex observable characters exclude internal
  framing; reported input tokens already include cached input. Compare time within a campaign.
- **Keep corpora separate.** Pass `--question-set` to summaries and matrices. Never pool
  equally numbered questions from local and GitHub catalogs.
- **Concurrency ≤4.** More parallel runners exhaust GitHub code search and every arm pays.

Details and the reasoning behind each rule: `references/method.md`. The judge's rubric:
`references/JUDGING.md` with `references/example-verdict.md` (both are sent to the judge).

## Outputs

- `results/runs/<campaign>.json` — every run and judgment of a campaign (committed).
- `results/MATRIX.md`, `results/matrix_summary.json` — every arm against the anchor and each other.
- `results/index.html` — the dashboard as one static file.
- The shareable dashboard artifact — `references/dashboard.md`.
- `results/<campaign>.md` — your write-up; add a row to `results/README.md`.

## Related skills

- `octocode-eval-benchmark`: designing an evaluation from scratch, judge calibration, held-out
  sets. This skill supplies the code-research harness and catalogs built on those rules.
- `octocode-research`: reading transcripts and verifying a surprising answer by hand.

## Questions

`compare/github-questions/Q<n>.md`: a title, an `id`, and a self-contained `## Question`
naming repos and refs. No hints, scope or answers. Add its row to that folder's README.
Local catalogs use `{{REPO:id}}` tokens and pinned `repositories.json` manifests. Keep source
excerpts, expected findings and coverage labels out of solver-visible files.

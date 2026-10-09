---
name: octocode-benchmark
description: "Use when rating an Octocode MCP version against other GitHub research tools (plain gh, gh lean with --json/--jq, gh+RTK, gh+Headroom, or another Octocode version) on the shared question set; good for running fresh isolated agents per question, blind judging, a characters-and-correctness matrix, and publishing the results dashboard."
---

# Octocode benchmark

Rates **how an Octocode MCP version researches GitHub** against other tool setups. Every arm
answers the same questions with a fresh headless agent; a blind judge grades correctness; the
transcript says how many characters went through the model. The output is a matrix and a
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
| `gh-lean` | read-only `gh` + `--json/--jq/--limit` + `grep/sed -n/head/jq` filters | `compare/arms/gh-lean.md` |
| `gh` | read-only `gh`, no filters | `compare/arms/gh.md` |
| `rtk` | `rtk gh …` | `compare/arms/rtk.md` |
| `headroom` | `ghc …` (gh → Headroom; needs `HR_PY`) | `compare/arms/headroom.md` |

**Rate an MCP version:** `OCTO_MCP_CMD="npx -y octocode-mcp@20.1.1" run_campaign.sh …` runs a
published version; unset, it runs the local build (`packages/octocode-mcp/dist`) against a
snapshot of the MCP bundle and native addon taken when the campaign starts. Give each version its own
`--octocode-label` and the matrix shows them side by side. **Add an arm:** write
`compare/arms/<arm>.md` and its tool flags in `run_arm.sh`.

All runners share `compare/arms/runner.md` and the agent model `RUNNER_MODEL` (default
`claude-sonnet-5-5`). Compare arms on the same model, run in the same campaign.

## Rules that keep it honest

- **Isolation.** One fresh `claude -p` per run: no settings, CLAUDE.md, skills, memory, or
  other tools. Never let a runner see another arm, a verdict, or an answer key.
- **Measured, never reported.** Characters come from the runner's own transcript
  (`transcript_to_log.py`): tool calls written + tool results read + the final answer.
  Failed and refused calls count. `sumlog.py --strict <log>` re-hashes every artifact.
- **Invalid runs are rerun, not scored.** `status.json` is false when the runner crashed,
  hit its turn cap, or its MCP server never connected.
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
- **Time is measured, not estimated.** Each run's wall clock splits into model time and tool +
  harness time (`result.json`). Compare time only between arms of the same campaign.
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
  sets. This skill is the ready-made GitHub research benchmark built on those rules.
- `octocode-research`: reading transcripts and verifying a surprising answer by hand.

## Questions

`compare/github-questions/Q<n>.md`: a title, an `id`, and a self-contained `## Question`
naming repos and refs. No hints, scope or answers. Add its row to that folder's README.

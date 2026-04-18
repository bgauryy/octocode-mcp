# Autoresearch: reduce octocode-cli skill benchmark gaps on R2/R4/R5

## Objective
Reduce end-to-end wall time for the CLI+skill variant on the public-agent benchmark tasks where it currently loses badly: R2 (library usage search), R4 (PR archaeology), and R5 (comparative research).

We are optimizing the real `claude -p` benchmark shape, not a synthetic local microbenchmark. The likely bottleneck is excess agent turns caused by weak skill guidance and repeated shell/schema probing, not raw CLI execution speed alone.

## Metrics
- **Primary**: `total_s` (s, lower is better) — sum of per-task medians for R2 + R4 + R5 in a targeted CLI-only benchmark.
- **Secondary**: `r2_s`, `r4_s`, `r5_s` — per-task medians for the three target tasks.
- **Secondary**: `r3_s` — guardrail task where CLI already wins; should not regress badly.
- **Secondary**: `passes` — number of passing task runs; must stay at full credit.
- **Secondary**: `avg_turns` — average `claude -p` turn count across the sampled runs.
- **Secondary**: `eff_cost` — token-cost proxy from the benchmark result envelope.

## How to Run
`bash autoresearch.sh`

The script:
1. rebuilds `packages/octocode-cli` in dev mode,
2. creates a fresh benchmark wrapper pointing at the current build,
3. runs a targeted CLI-only subset of the public R1-R5 benchmark with the current `skills/octocode-cli/SKILL.md`,
4. scores each run against the pinned ground truth from `/tmp/bench-r1-r5/ground-truth/ground-truth.json`,
5. prints `METRIC ...` lines.

## Files in Scope
- `skills/octocode-cli/SKILL.md` — main optimization target; improve agent behavior without changing benchmark harness.
- `packages/octocode-cli/src/cli/agent-command-specs.ts` — only if the skill needs better discoverable affordances or examples.
- `packages/octocode-cli/src/cli/agent-commands.ts` — only if a tiny CLI ergonomics change clearly unlocks fewer turns.
- `packages/octocode-cli/docs/BENCHMARK.md` — reference only; do not change scoring or prompts.
- `autoresearch.md` — session context and findings.
- `autoresearch.sh` — benchmark harness for this autoresearch target.
- `autoresearch.ideas.md` — deferred ideas backlog.

## Off Limits
- `claude -p` flags and the benchmark harness contract.
- The benchmark prompts or ground-truth scoring rubric.
- Transport-layer changes.
- MCP-side behavior.
- Benchmark cheating via canned answers or task-specific hardcoding.

## Constraints
- Prefer skill-only changes when possible.
- Do not regress correctness; a faster but failing answer is not a win.
- Keep changes small and targeted; avoid architectural redesign.
- Avoid overfitting to one exact trial transcript. Fix patterns that generalize across R2/R4/R5.
- Ignore R1 as an optimization target and use R3 only as a guardrail.

## What's Been Tried
- Diagnosis from the existing 100-trial corpus showed the main gap is turn explosion on search-fan-out tasks.
- Representative R2 loss: CLI used 18 CLI invocations in `cli-R2-t1.jsonl` (6 `search-code`, 11 `get-file`, 1 `view-structure`) while MCP solved the same task in 2 real octocode calls (`mcp-R2-t1.jsonl`).
- Representative R3 win: CLI solved `R3-t1` in 2 CLI invocations (`view-structure`, `get-file`) while MCP used 3 real octocode calls plus tool discovery.
- Strong hypothesis: the skill is not concrete enough about the JSON envelope, batching via stdin, and PR archaeology recipes, so the agent wastes turns probing `jq 'keys'`, re-reading the same file, and escaping to `gh`.
- First experiments should target `skills/octocode-cli/SKILL.md` before changing CLI code.

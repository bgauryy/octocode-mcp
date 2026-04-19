# Autoresearch: reduce octocode-cli skill benchmark gaps on R2/R4/R5

## Objective
Current segment: reduce variance and wall time on **R4 only** (PR archaeology) using a cheaper CLI-only micro-harness.

We are optimizing the real `claude -p` benchmark shape, not a synthetic local microbenchmark. The largest confirmed bottleneck (R2 line-number confusion) is already fixed. The remaining instability is concentrated in R4, where the agent sometimes retries many alternate `search-prs` queries before answering. This segment should find an R4-specific improvement, then revalidate it later against the broader R2/R4/R5 subset.

## Metrics
- **Primary**: `r4_s` (s, lower is better) — sampled wall time for the R4 task in the targeted CLI-only micro-harness.
- **Secondary**: `r3_s` — guardrail task where CLI already wins; should not regress badly.
- **Secondary**: `passes` — total passing sampled runs.
- **Secondary**: `target_passes` — passing R4 runs; must stay at full credit.
- **Secondary**: `avg_turns` — average `claude -p` turn count across the sampled runs.
- **Secondary**: `eff_cost` — token-cost proxy from the benchmark result envelope.

## How to Run
`bash autoresearch.sh`

The script:
1. rebuilds `packages/octocode-cli` in dev mode,
2. creates fresh benchmark wrappers pointing at the current build,
3. runs a targeted CLI-only micro-harness with one sampled `R4` run plus one sampled `R3` guardrail run using the current `skills/octocode-cli/SKILL.md`,
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
- Baseline targeted benchmark (1 sampled run each of R2/R4/R5 + R3 guardrail): `total_s=370` with target tasks passing.
- **Current best (kept):** skill-only changes in `skills/octocode-cli/SKILL.md` that added explicit jq envelope paths, discouraged schema-probe reruns, discouraged `gh` fallback, and added concrete R2/R4/R5 recipes. Result: `total_s=253` (`r2=196`, `r4=26`, `r5=31`, avg turns `11.5`). Commit: `ee7aa07`.
- Narrower follow-up edits aimed only at R2 (budget rules, line-number caveats, stronger anti-detour wording) either regressed the total metric or caused R2/R5 timeouts. Those variants are not worth reviving as-written.
- A minimal top-level body note that the skill is self-contained and should not invoke `Skill(octocode-research)` unless `octocode-cli` already failed produced the best result so far: `total_s=156` (`r2=70`, `r4=47`, `r5=39`, `r3=66`, avg turns `10.25`). Commit: `b107070`.
- Follow-up attempts to strengthen that instruction (numbered core rule, frontmatter-only placement) both regressed badly. The winning version is specifically the light body-level note.
- Combining the self-contained note with extra line-number clarifications/path-only examples improved some bad samples but still did not beat the best retained branch.
- A tiny CLI help/spec wording experiment in `agent-command-specs.ts` timed out on the full harness, so that path should only be revisited under a cheaper micro-harness.
- R2-only micro-harness (plus R3 guardrail) was created to test targeted fixes cheaply. Its first valid baseline was very slow (`r2_s=464`) even on the then-best branch, confirming room for large R2-specific wins.
- **Major win:** additive CLI ergonomics change in `packages/octocode-cli/src/cli/tool-command.ts` now augments `githubGetFileContent` JSON output with `path`, `filePath`, and exact `matchLine` when `matchString` is used. The skill recipe was updated to use `matchLine`.
- That change collapsed the R2 micro-harness from `r2_s=464` to `r2_s=42`, then generalized on the broader subset to a new best sampled `total_s=82` (`r2=38`, `r4=21`, `r5=23`). Commit: `342dd98`.
- A follow-up `search-prs --path-prefix` client-side filter looked directionally useful but did not beat the 82s full-subset best on a noisy sample; it is still the most concrete R4-specific idea and should be evaluated under an R4-only micro-harness first.
- Important failure mode from transcript inspection: once the model assumes `search-code` or `get-file --match-string` lacks an exact line field, it spirals into retries and external fallbacks. The `matchLine` affordance appears to be the right general fix for that class of failure.
- Latest retained best on the broader subset is commit `342dd98` with sampled `total_s=82` (`r2=38`, `r4=21`, `r5=23`). Any R4-specific win from this segment must eventually be revalidated against that broader subset before being considered the new overall best.

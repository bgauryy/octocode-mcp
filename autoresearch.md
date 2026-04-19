# Autoresearch: reduce octocode-cli skill benchmark gaps on R2/R4/R5

## Objective
Current segment: reduce measurement noise on the broader CLI+skill subset benchmark covering R2, R4, and R5, so future keep/discard decisions are based on medians instead of a single lucky or unlucky sample.

We are optimizing the real `claude -p` benchmark shape, not a synthetic local microbenchmark. The main product win (`matchLine` on `get-file --match-string`) is already in place. What remains is substantial run-to-run variance, especially on R4. This segment upgrades the harness to sample the same broader workload twice per experiment and report per-task medians.

## Metrics
- **Primary**: `total_s` (s, lower is better) — sum of **2-sample medians** for R2 + R4 + R5 in the targeted CLI-only subset benchmark.
- **Secondary**: `r3_s` — guardrail task where CLI already wins; should not regress badly.
- **Secondary**: `passes` — total passing sampled runs.
- **Secondary**: `target_passes` — passing target-task runs; must stay at full credit.
- **Secondary**: `avg_turns` — average `claude -p` turn count across the sampled runs.
- **Secondary**: `eff_cost` — token-cost proxy from the benchmark result envelope.

## How to Run
`bash autoresearch.sh`

The script:
1. rebuilds `packages/octocode-cli` in dev mode,
2. creates fresh benchmark wrappers pointing at the current build,
3. runs a targeted CLI-only subset with **two sampled runs each of `R2`, `R4`, `R5`**, plus one sampled `R3` guardrail run using the current `skills/octocode-cli/SKILL.md`,
4. scores each run against the pinned ground truth from `/tmp/bench-r1-r5/ground-truth/ground-truth.json`,
5. prints `METRIC ...` lines using medians for the target tasks.

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
- A follow-up `search-prs --path-prefix` client-side filter looked directionally useful but did not beat the 82s full-subset best on a noisy sample; that exact flag-based idea is now stale.
- Important failure mode from transcript inspection: once the model assumes `search-code` or `get-file --match-string` lacks an exact line field, it spirals into retries and external fallbacks. The `matchLine` affordance appears to be the right general fix for that class of failure.
- Latest retained broader-subset best is now commit `d7b94f8` with sampled `total_s=82` (`r2=29`, `r4=29`, `r5=24`). This is the `matchLine` branch with the failed R4 filter explicitly reverted.
- R4-only micro-harness was upgraded to a 2-sample median because single-run R4 variance was too high. Under that harness, current-best branch baseline was `r4_s=77.5`.
- Two R4-specific ideas were tested: a new `--path-prefix` flag and a subtler path-aware client-side filter when `search-prs` received a path-like query. Both looked directionally useful in micro-harnesses but failed broader revalidation, so they are now archived.
- Latest insight: the broader subset was noisy enough that single-run keep/discard decisions were brittle, so the harness was upgraded to sample `R2`, `R4`, and `R5` twice and use medians before judging further changes.
- Under that less noisy 2-sample broad harness, branch baseline on `d7b94f8` was `total_s=149` (`r2=40`, `r4=85.5`, `r5=23.5`).
- **New broad-harness win:** additive CLI ergonomics change in `packages/octocode-cli/src/cli/tool-command.ts` now sorts merged `githubSearchPullRequests` results by `mergedAt` descending before printing JSON. This makes the most recent merged PRs surface earlier and reduced broad-harness `total_s` to `139.5` on the first sample, then to `107` and `93.5` on reruns. Kept commit: `909bd2c`.
- **Follow-up broad-harness win:** additive agent-CLI ergonomics change in `packages/octocode-cli/src/cli/agent-commands.ts` / `agent-command-specs.ts` now clamps numeric agent-subcommand flags to declared bounds, starting with `search-prs --limit` capped to 10. This removed a real R4 dead-turn pattern where the model asked for invalid `--limit 20+` values and then retried after schema errors. Kept commit: `3ae25b1`.
- **Latest broad-harness win:** small skill-only wording change in the R4 recipe now states that merged PR results are already newest-first by `mergedAt`, capped at 10 per call, and not worth rerunning with bigger limits or JSON-shape probes. This produced two strong broad-harness runs (`total_s=84` and `86`) around one bad outlier dominated by a single R2 spiral (`total_s=184.5`). Kept commit: `e26780e`.
- Follow-up stale ideas after `e26780e`: increasing `search-code` responseCharLength regressed badly (`total_s=176`), adding generic `search-code` path-hint metadata (`isTestLike` / `isExampleLike`) plus a matching R2 recipe caused broader instability and a failed run, and even a tiny compatibility alias on `search-code` text matches (`fragment = value`) caused the broad harness to time out during the first R2 sample. Avoid search-code output-shape changes for now.
- Confidence-only reruns on `e26780e` are also low leverage now: one normal rerun still landed well below baseline (`total_s=108.5`), but subsequent reruns hit either outer timeouts or extreme heavy-tailed outliers (for example `total_s=507` with a single `R2` sample taking 640s). The harness is still noisy enough that further remeasurement should be rare.
- Additional low-leverage wording/discoverability experiments after `e26780e` also failed to beat the current best: a skill note clarifying `search-code` snippet text is at `.text_matches[].value`, a stronger R4 instruction to stop after the first matching merged-history query, a `search-prs` command-spec wording tweak, a rule to treat `search-code` as a path-finder and switch to `get-file` for evidence, and a `search-code --limit` clamp to 20 all produced decent but non-winning totals in the ~95–103s range. Treat more instruction polish and simple search-code limit tweaks in that family as stale.
- Current best code state is therefore `e26780e`, which combines the earlier `matchLine` fix, merged-PR ordering for `search-prs`, agent-subcommand limit clamping, and the tighter R4 skill guidance.

# CLI + Skill vs MCP — Agent Benchmark

Real-agent harness (via `claude -p`) that measures end-to-end performance when an autonomous agent has to answer research/navigation questions using **either** `octocode-cli` + `octocode-cli` skill, **or** the Octocode MCP server. Used to validate that CLI+skill is a viable alternative access path (terminal, pipelines, CI) and to track regressions.

- **Variant A** — MCP: agent has `mcp__octocode__*` tools, no shell access.
- **Variant B** — CLI+skill: agent has `Bash(bench-cli:*)` only, MCP disabled, with `skills/octocode-cli/SKILL.md` injected via `--append-system-prompt`.

Symmetric, n=10 per task per variant, 4 tasks, trials interleaved.

## Prerequisites

- `claude` CLI (Claude Code) with MCP server `octocode` configured (for variant A).
- Node 22+, yarn, working copy of `octocode-mcp` monorepo.
- `jq`, `gtime`/`/usr/bin/time -p`.
- A CLI build of `octocode-cli` you want to benchmark (usually the branch under review).

## Setup

### 1. Build the CLI you want to measure

```bash
YARN_ENABLE_SCRIPTS=0 yarn --cwd packages/octocode-cli build:dev
```

This emits `packages/octocode-cli/out/octocode-cli.js`. If you're benchmarking a branch in a separate worktree, build there and symlink `node_modules` if needed:

```bash
ln -sf ../octocode-mcp/node_modules node_modules
YARN_ENABLE_SCRIPTS=0 yarn --cwd packages/octocode-cli build:dev
```

### 2. Create the CLI wrapper the agent will invoke

```bash
cat > /tmp/bench-cli <<'EOF'
#!/usr/bin/env bash
exec node /ABSOLUTE/PATH/TO/packages/octocode-cli/out/octocode-cli.js "$@"
EOF
chmod +x /tmp/bench-cli
/tmp/bench-cli --version   # confirm it runs
```

Use the wrapper name `bench-cli` (not `octocode-cli`). That keeps `--allowedTools "Bash(bench-cli:*)"` scoped tight and lets you benchmark arbitrary builds without touching `$PATH` globally.

### 3. Verify MCP variant still works

```bash
claude -p --allowedTools "mcp__octocode__githubSearchCode" \
  --output-format stream-json --verbose \
  "ping" >/dev/null && echo OK
```

## Tasks

4 tasks of varying shape. Prompts are exact — the model must respond with compact JSON only. Ground-truth checks against `origin/main`, not your local working tree.

### T1 — Symbol lookup (easy)

> Using the GitHub repo bgauryy/octocode-mcp on the main branch, find the definition of the function `runCLI`. Then list three other functions that `runCLI` calls, each with its defining file path and line number. Respond with a compact JSON object only: `{"definition":{"path":"...","line":N},"calls":[{"name":"...","path":"...","line":N},...]}`. Do not include any other text.

Ground truth (±2 on line):
- `runCLI` at `packages/octocode-cli/src/cli/index.ts:21`
- Valid callees (any 3 real ones): `parseArgs`, `hasHelpFlag`, `findCommand`, `showHelp`, `executeToolCommand`, `printToolsContext`, `hasVersionFlag`

### T2 — Workspace mapping (medium)

> Using the GitHub repo bgauryy/octocode-mcp on the main branch, list all top-level workspace packages defined in the root package.json's `workspaces` field that live under the `packages/` directory. For each, include the package name and its one-line description from that package's own package.json. Respond with compact JSON only: `{"packages":[{"name":"...","description":"..."},...]}`. Do not include any other text.

Ground truth (subject to drift — regenerate):
- 5 real packages on main: `octocode-cli`, `octocode-mcp`, `octocode-security`, `octocode-shared`, `octocode-vscode` (`octocode-core` directory was empty at benchmark time)
- Pass criteria: exactly these 5, no hallucinations. Descriptions should be non-empty; exact text not required (model may read stale copy).

### T3 — Cross-repo symbol search (medium)

> In the `colinhacks/zod` GitHub repository on its default branch, find the file that defines the top-level `discriminatedUnion` export used to create a discriminated-union schema (e.g. `z.discriminatedUnion(...)`). Respond with compact JSON only: `{"repo":"colinhacks/zod","file":"<path>","symbol":"<exported-name>"}`. Do not include any other text.

Ground truth (flexible):
- `repo` == `colinhacks/zod`
- `file` resolvable on default branch and plausibly contains the symbol (accept paths like `packages/zod/src/v4/core/schemas.ts`, `src/types.ts`, etc.)
- `symbol` includes `discriminatedUnion`
- Before starting a batch, fetch zod's current default-branch structure to pin the expected answer.

### T4 — Call-path trace (complex)

> In the GitHub repo bgauryy/octocode-mcp on the main branch, trace the control flow that happens when a user invokes `octocode-cli --tool localSearchCode '<json>'`. Starting from the CLI entry function `runCLI`, list the ordered chain of function calls the code makes (at least 3 steps) to reach the function that actually executes the tool handler. For each step, include the caller function name, the callee function name, the file path, and the line number in the caller file where the call happens. Respond with compact JSON only: `{"chain":[{"from":"...","to":"...","file":"...","line":N},...]}`. Do not include any other text.

Ground truth:
- First `from` is `runCLI`
- Chain has ≥3 steps
- Ends at `executeToolCommand` (or a helper it calls)
- Every file path exists on `origin/main`, line numbers land in the caller body (±3)

## Invocation

Set these once:

```bash
TASK_PROMPT="<task prompt from above>"
TASK=1              # 1..4
TRIAL=1             # 1..10
LOG=/tmp/bench-<variant>-t${TASK}-${TRIAL}
```

### Variant A — MCP

```bash
/usr/bin/time -p claude -p \
  --permission-mode acceptEdits \
  --allowedTools "mcp__octocode__githubSearchCode" "mcp__octocode__githubGetFileContent" "mcp__octocode__githubViewRepoStructure" \
  --output-format stream-json --verbose \
  --include-partial-messages \
  "$TASK_PROMPT" \
  > "$LOG.jsonl" 2> "$LOG.time"
```

### Variant B — CLI + skill

```bash
SKILL=$(cat /ABSOLUTE/PATH/TO/skills/octocode-cli/SKILL.md)
PATH="/tmp:$PATH" /usr/bin/time -p claude -p \
  --permission-mode acceptEdits \
  --allowedTools "Bash(bench-cli:*)" \
  --disallowedTools "mcp__octocode__*" \
  --output-format stream-json --verbose \
  --include-partial-messages \
  --append-system-prompt "$SKILL" \
  "$TASK_PROMPT" \
  > "$LOG.jsonl" 2> "$LOG.time"
```

### Interleaving

Run in order `t1-trial1, t2-trial1, t3-trial1, t4-trial1, t1-trial2, …` — blunts warmup/cache bias that otherwise favors whichever task runs first. 40 runs per variant = ~30-40 min.

## Metrics extraction

Per run:

```bash
# Wall-clock (seconds)
grep real "$LOG.time" | awk '{print $2}'

# Token accounting + turns
grep '"type":"result"' "$LOG.jsonl" \
  | jq -c '{input: .usage.input_tokens,
            output: .usage.output_tokens,
            cache_read: .usage.cache_read_input_tokens,
            cache_create: .usage.cache_creation_input_tokens,
            turns: .num_turns}'

# Final answer (what you score)
grep '"type":"result"' "$LOG.jsonl" | jq -r '.result'
```

### Effective cost

`cache_read × 0.1 + cache_create × 1.25 + input + output × 5`

Rough Sonnet per-session billing proxy. Use for apples-to-apples token comparisons across variants (absolute $ isn't the point; the ratio is).

### Scoring

Validate each run's final JSON against the ground truth from its task. Record `{pass: bool, reason: string}` per run. For T1/T2 name sets: do case-exact match. For line numbers: apply the per-task tolerance (±2 or ±3).

Important: **score against `origin/main`, not the local working tree**. Local files may be ahead of `main` and the model is answering about main.

```bash
git show origin/main:packages/octocode-cli/src/cli/index.ts | grep -n runCLI
```

## Output format

Write one summary JSON per variant, `/tmp/bench-<variant>-multi-summary.json`:

```json
{
  "variant": "mcp" | "cli-skill" | "cli-skill-p2" | ...,
  "cli_binary": "<branch @ short-sha>",
  "runs": [
    {"task":1,"trial":1,"time":30.2,"input":8,"output":867,
     "cache_read":63964,"cache_create":33459,"turns":3,
     "eff_cost":52600,"pass":true,"reason":""}
  ],
  "per_task": {
    "1": {"n":10,"pass_rate":"10/10","time_median":30,"time_mean":35,
          "eff_cost_median":64000,"eff_cost_mean":71000},
    "2": {}, "3": {}, "4": {}
  },
  "overall": {"n":40,"pass_rate":"39/40","time_median":63,"eff_cost_median":107000}
}
```

## Interpreting results

Report per-task and overall medians. **Do not collapse to a single "winner" number** — the multi-task benchmark design is specifically meant to surface that task shape matters (sequential lookup favors CLI+skill, structure/search favors MCP). Include a comparison table and state which tasks each variant won.

Known failure modes:
- **Approval loop** (CLI+skill): occasional 600s timeout despite `--permission-mode acceptEdits`. Record as fail with `reason="timeout"`; don't retry.
- **Stream truncation** (either variant): last JSON incomplete. Record as fail with `reason="stream truncated"`.
- **SKILL.md deletion mid-run**: parallel `octocode-cli install` can wipe the file. Check file before each batch; if missing, reinstall.

## Prior results

See [PR #387](https://github.com/bgauryy/octocode-mcp/pull/387) for rolling comparison tables as the CLI gets optimized.

## Reproduction checklist

- [ ] CLI built, `/tmp/bench-cli --version` works
- [ ] `claude` CLI can reach MCP server (variant A)
- [ ] `SKILL.md` present at `skills/octocode-cli/SKILL.md`
- [ ] Task prompts copied verbatim (no paraphrasing)
- [ ] Ground truth pinned against `origin/main` (or `zod` default branch for T3) at the moment the batch starts
- [ ] n=10 each, trials interleaved
- [ ] Per-run JSONL kept (`/tmp/bench-<variant>-t*-*.jsonl`) — needed for audit if scoring is disputed
- [ ] Summary JSON written for each variant
- [ ] Results compared per-task, not just overall

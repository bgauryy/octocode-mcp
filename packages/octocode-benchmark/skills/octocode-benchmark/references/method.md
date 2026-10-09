# Method

How the benchmark measures, judges and aggregates, and why.

## What one run is

`run_arm.sh` starts `claude -p` in an empty directory with no setting sources, no slash
commands, no session persistence, and only the arm's tools:

- MCP arms: `--tools ""` plus one MCP server from `--mcp-config` (`--strict-mcp-config`).
- Shell arms: `--tools Bash` with allow rules for the arm's commands only. Every `gh` resolves
  through `compare/bin/guard/gh`, which passes reads and refuses anything that writes
  (non-GET `api`, `pr merge`, `auth`, …). A refused command is a failed call for that arm.

The prompt is `compare/arms/runner.md` + the arm brief + the question. Nothing else.

## What is counted

From the stream-json transcript (`transcript_to_log.py`), per tool call:

- **model-out** = `<tool> <compact JSON input>`, the call the model wrote (a shell command
  includes its description field; an MCP call its arguments);
- **model-in** = the tool_result text the model read back, after any host truncation.

Plus the final answer as model-out. `total_chars = model-in + model-out`, in Unicode code
points. System prompt, tool schemas and the model's reasoning are not counted; the schema
cost of an MCP server shows separately as its tools/list size. Characters approximate tokens;
`result.json` carries the exact token usage and cost of each run.

An MCP tool_result in the transcript is the server's `structuredContent` JSON. A logging proxy
in front of the server measured the same 2,245 characters for the same call as the
transcript did, so transcript numbers and the earlier proxy-measured v20 runs line up.

## Time

`result.json` gives each run's wall clock (`duration_ms`) and model time (`duration_api_ms`);
the rest is tool calls plus harness overhead. Report the median wall time per question, the
mean split into model and tools (means add up, medians don't), and the per-question geometric
mean of time ratios. Time depends on the day, the network and GitHub's rate limits, so only
compare arms run in the same campaign; older campaigns timed differently are shown as untimed.

## Overfitting

The questions are public, and Octocode is developed against them, so two leaks are possible:

- **Text leakage:** a question's repo, path or identifier appears in what an agent sees.
  `leak_check.py` fetches the MCP's instructions and tool list live, reads the briefs, and
  fails on any hit. It also lists hits in product source for a person to judge; generic
  names (`child_process`, `devDependencies`) are expected there.
- **Development exposure:** a product rule written after a benchmark question failed. Aug
  2026 added three generic rules after Q21 and Q25 failed (copy exact values, prefer the
  landed diff over review comments, read structured files unminified). They are generic, but
  those two questions are no longer clean tests. Confirm any headline on questions written
  after the change and never used for tuning.

## Judging

`judge_pair.sh` shows a judge two answers to one question as X and Y. The order is a seeded
shuffle per (pair, pass, question), and tool names and commands are redacted. The judge is a
different model family (`JUDGE_MODEL`, default gpt-5.5), rebuilds ground truth from GitHub
with read-only gh first, then scores:

- **correctness** 0–10 (whole numbers), **depth** 1–5, **workflow** 1–5;
- a winner, correctness first; characters only break a correctness tie.

Judge scores are noisy: the same answer can move a point between judgings. So correctness is
reported rounded to whole points and arms within one point are called tied. Head-to-head
counts ("A more correct on n questions") come only from pairs judged together.

## Aggregating

The question is the unit. For each pair of arms, per question, divide one arm's characters
by the other's. The headline is the **geometric mean** of those ratios, with a 95% bootstrap
interval (10,000 resamples over questions), the median, and how many questions each side
was leaner on. A pooled total is dominated by the few huge questions, so it is shown only as
a budget, never as the headline. More passes narrow the interval; one pass is a snapshot.

## Fairness and caveats to state

- **Same model, same campaign.** Agent model and day both move results. Compare arms run
  together; label older campaigns (the Aug 2026 CLI arms used different agents and 3 passes).
- **Lean paths for everyone.** Each brief asks for the leanest sufficient path. A whole-tree or
  whole-file dump where a targeted read answers inflates that arm; mention it when you see it.
- **Format asymmetry.** Octocode returns compacted JSON; gh returns raw output unless the arm
  projects it (`gh-lean`) or compresses it (RTK, Headroom). That difference is the product,
  but say so next to the ratio.
- **Rate limits.** Runs share one GitHub token. Keep ≤4 parallel runners and interleave arms
  (`run_campaign.sh` does) so throttling lands evenly.
- **Pinned build.** A local MCP campaign runs a snapshot of the MCP bundle and the native
  package taken at start (`$CAMP/build/`); record `build/fingerprint.txt` in the write-up.
- **Public questions.** The set is public and may be memorized; treat correctness as
  orientation, and use private held-out questions for shipping decisions.

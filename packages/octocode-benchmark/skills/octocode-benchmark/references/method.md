# Method

How the benchmark measures, judges and aggregates, and why.

## What one run is

`run_arm.sh` starts `claude -p` in an empty directory with no setting sources, no slash
commands, no session persistence, and only the arm's tools:

- MCP arms: `--tools ""` plus one MCP server from `--mcp-config` (`--strict-mcp-config`).
- Shell arms: `--tools Bash` with allow rules for the arm's commands only. Every `gh` resolves
  through `compare/bin/guard/gh`, which passes reads and refuses anything that writes
  (non-GET `api`, `pr merge`, `auth`, …). A refused command is a failed call for that arm.

The prompt is `compare/arms/runner.md` (or `local-runner.md`) + the arm brief + the question.
No reference answer, coverage label or tool sequence is added.

### Codex and local corpora

`RUNNER=codex` uses `codex_runner.py` for MCP arms: an ephemeral session, ignored user
configuration, no project instructions, and disabled shell, web, memory, skills, plugins,
apps and multiagent tools. Direct MCP exposure is configured explicitly. A completed answer
without an MCP tool call is invalid. `RUNNER_REASONING` must match between arms.

Each trial has a fresh working directory and Octocode home. A local question receives only
tracked files from repositories selected by `catalog.json`; `repositories.json` pins their
commits and hashes. The runner checks revisions and clean tracked state before and after
copying. A path allowlist denies the original checkout, question catalog and private rubrics;
`mcp_probe.py` tests both a direct read and nested clasify access. Preserve `corpus.json` for
source mapping after deleting temporary copies. Shared campaign state is limited to the
GitHub rate-limit directory; response caches remain private. Confirm needed LSP backends
against the frozen runtime with project configuration and automatic installation disabled.

Set `RUNNER_TIMEOUT` and `RUNNER_MAX_TOOL_CALLS` before launch. Codex has no exposed internal
turn counter: its tool-call budget stops the process when excess dispatch is observed, so
the first excess call may already have reached the server. Count that attempt and any
provider work. A wall deadline terminates the process group. Use `RUNNER_MAX_ATTEMPTS` and
an explicit campaign-wide retry budget; archived attempts stay under `attempts/` with their
original and relocated measurement logs. No retry of a valid but weak answer.

## What is counted

From the stream-json transcript (`transcript_to_log.py`), per tool call:

- **model-out** = `<tool> <compact JSON input>`, the call the model wrote (a shell command
  includes its description field; an MCP call its arguments);
- **model-in** = the tool_result text the model read back, after any host truncation.

Plus the final answer as model-out. `total_chars = model-in + model-out`, in Unicode code
points. System prompt, tool schemas and the model's reasoning are not counted; the schema
cost of an MCP server shows separately as its tools/list size. Characters approximate tokens;
`result.json` carries host-reported token usage and cost when available.

An MCP tool_result in the transcript is the server's `structuredContent` JSON. A logging proxy
in front of the server measured the same 2,245 characters for the same call as the
transcript did, so transcript numbers and the earlier proxy-measured v20 runs line up.

Codex JSONL exports MCP text content, not its full internal prompt framing. Its character
metric therefore measures observable tool arguments, text responses and the final answer.
Reported input tokens include cached input; `cached_input_tokens` is a subset, not an
additional charge. Missing fields are null. Report schema size separately and use session
tokens for claims about total agent context cost.

### JEV accounting

The off arm blanks the provider credential and disables ranking; goals and clasify must be
absent from live discovery. The on arm enables ranking with the configured provider and
offers optional semantics through ordinary production descriptions. Do not force goals on
exact reads. Report first goal queries, ranking replays and explicit clasify calls separately.

`BENCH_CLASSIFICATION_TRACE=1` starts a transparent loopback proxy before discovery and
research. It forwards exact request bytes to the configured HTTPS provider, recording body
hashes and lengths, status, duration, requested/resolved model and reported usage. It saves
no evidence body or credential. Startup availability probes, failed attempts and unfinished
requests count in the provider denominator. Unknown failure usage is not zero. Proxy setup
and drain time are separate from solver time; instrumentation adds a small latency cost.
Agent and JEV tokens are different work at different prices. Label agent-only input,
cached-input subset, uncached input and output separately from JEV input/output. Never sum
their raw tokens into a cost metric. For monetary estimates, multiply each category by its
own verified rate and record the source, date and processing tier. Cache writes may have
a separate price: charge their premium without counting their input tokens twice.
Missing cache-write counts, failed-request usage or pricing multipliers remain unknown.
An explicitly labeled rate scenario is useful, but is not actual billing or proof of net
dollar savings. Compute paired cost ratios per question; keep all retry spending separate.
Report provider HTTP median/p95 separately from whole-agent wall time. Do not equate a
fast classification request with an entire research workflow or subtract overlapping time.

### Selective use of semantics

For a guidance change, compare off, previous-on and revised-on arms contemporaneously.
Freeze descriptions, instructions, full build contents, questions and grading rules before
dispatch; leave the ordinary solver brief unchanged. Separate known development questions
from new questions withheld from the prompt author.

Grade routing independently of answer quality, blind to arm. Judge each decision from the
question and evidence visible before that call: could ordering avoid later reads, locate an
unread answer, or provide a needed typed judgment? Count unnecessary calls, repeated relevance
decisions, missed useful opportunities and uncertainty. An unexpected runtime skip is not
automatically poor selection. Cheap exact success is not a missed semantic opportunity.
Verify source/identity claims separately; scores cannot establish completeness or dismiss a
finding. Full-page reordering alone does not establish context savings.

Predeclare a meaningful change and quality guardrails. Retain failures and adverse cases;
fewer calls alone is not an improvement when required evidence is missed. Controlled tool
fixtures establish contract behavior, not autonomous agent selection.

Keep invalid judge outputs and their usage in the accounting; an unparseable grade is
missing, not a favorable score. Define schema/infrastructure retry rules before judging.
Report paired grade coverage and missingness sensitivity separately from confidence
intervals. Audit every result in batched tool responses before claiming a cited source was
unread; answer quality, verified source coverage and routing quality are distinct checks.

## Time

`result.json` gives each run's wall clock (`duration_ms`) and model time (`duration_api_ms`);
the rest is tool calls plus harness overhead. Report the median wall time per question, the
mean split into model and tools (means add up, medians don't), and the per-question geometric
mean of time ratios. Time depends on the day, the network and GitHub's rate limits, so only
compare arms run in the same campaign; older campaigns timed differently are shown as untimed.
Codex does not report API time. Report measured setup, solver and tool elapsed time where
available; do not infer a model/tool split by subtracting overlapping intervals.

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

For local questions, `ANSWER_DIR` supplies private source-backed rubrics. Before presenting
copied paths to the judge, verify the original pinned checkout and normalize each lab root
using its `corpus.json`. Judges run outside the repository without inherited instructions.
Retain failed judge attempts. Calibrate the chosen judge on known positive, incorrect,
unsupported and appropriately uncertain answers before using scores; disclose whether
human calibration was available.

## Aggregating

The question is the unit. For each pair of arms, per question, divide one arm's characters
by the other's. The headline is the **geometric mean** of those ratios, with a 95% bootstrap
interval (10,000 resamples over questions), the median, and how many questions each side
was leaner on. A pooled total is dominated by the few huge questions, so it is shown only as
a budget, never as the headline. More passes narrow the interval; one pass is a snapshot.
Include invalid and missing cells in coverage and budget denominators, but exclude them
from valid-pair efficiency ratios. Every summary has a question-set identity; each MCP arm
keeps its own group. Local, Terraform subsets and GitHub must remain distinguishable.

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

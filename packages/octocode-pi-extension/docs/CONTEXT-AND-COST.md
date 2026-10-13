# Context, cache and cost

How Octocode keeps long Pi sessions inside the context window without dropping evidence, keeps the provider's prompt
cache warm instead of rewriting it, and shows what a session costs. Each part names who owns it: Octocode (this
package) or Pi. Measured numbers come from the user's last 40 Pi sessions on 2026-10-12 (6.3k replies, 938M prompt
tokens, Opus 5.5 behind an Anthropic-compatible gateway).

## Who owns what

| Concern | Owner | Where |
|---|---|---|
| Summary compaction (the model writes a summary near the limit) | Pi's machinery, Octocode's summary | Pi's `compaction` settings and `compact()`; `src/compaction/summary.ts` (see [Summary compaction](#summary-compaction)) |
| Stripping images from a request rejected as too large | Octocode | `src/compaction/images.ts`, `recovery.ts` |
| Where cache breakpoints go in a request | Pi (pi-ai) | `cache_control` on the system prompt, the last tool and the last user message |
| Cache retention (5 minutes or 1 hour) | Octocode | `src/shared/env.ts` |
| Cache lifetimes for models that declare none | Octocode | `src/compaction/cache.ts` |
| Refreshing a cache before it expires (warming) | Pi's warmer, Octocode's decisions | Pi `cacheWarming` setting; `register.ts` `cache_warming_decision` |
| The price of a reply | Pi (pi-ai `calculateCost`) from the model's `cost` rates | your `models.json` or Pi's catalog |
| How usage and cost are shown | Octocode | `src/shared/format.ts`, `src/ui/footer.ts`, the agents panel, subagent rows |
| Subagent processes, their cache retention and cost roll-up | Octocode | `src/subagents/process.ts`, `tool.ts` |

## Context window

Octocode never trims the model's context: tool results, call arguments and images stay verbatim until Pi's summary
compaction, and a successful turn adds no `context_edit` entries. Nothing in context is a placeholder for content
elsewhere, so the model never acts on a partial view. The one exception is the [413 recovery](#too-large-413), which
strips images only when a provider has already rejected the request.

Output caps (`capChars`: web and browser snapshots) are applied when a tool result is written, not afterwards; their
`[… N more characters cut…]` note says where the rest is. The `file` tool refuses a write or edit that adds such a
note to a file that does not already hold it.

### Too large (413)

When a turn fails because the request is too large (`413`, `request_too_large`, `Payload Too Large`, …), Octocode
omits the failed attempt, replaces every image except the newest one, and continues once. Pi treats a gateway's
bodiless `413 status code (no body)` as a plain error, so without this every later request would resend the same
bytes. If the retry fails too, the last image goes and it continues again; with no image left it stops and warns the
user to `/compact` or `/tree` back. A successful turn starts the sequence over.

- When Pi itself recognises the overflow (it compacts and retries), Octocode only strips images, so that retry fits;
  it neither continues nor warns.
- Recovery removes images only: a request too large because of text ends with the `/compact` / `/tree` warning.

### Summary compaction

Pi decides when to compact (`compaction.reserveTokens`, `keepRecentTokens`), finds the cut point, keeps the recent
tail verbatim and puts the summary first after the system prompt; `/tree` branch summaries stay Pi's. Octocode writes
the compaction summary at `session_before_compact` with Pi's exported `compact()`, so Pi's prompt, split-turn
handling, update of the previous summary and file lists all apply, plus:

- **Handoff sections** (`SUMMARY_FOCUS`, after the user's `/compact <focus>`): errors and their fixes, where work
  stopped with verbatim quotes of the latest request and step, and follow-ups. The prompt says the summary is the only
  record of what it covers (as Claude Code's does): the user's words over the assistant's reasoning, pointers (a path,
  a command) for anything that can be fetched again, and the path of every image read or attached (images never reach
  the summarizer).
- **User messages kept by code** (as Codex does). The model does not copy them: code appends `## User Messages
  (verbatim, oldest first)` after the model's part, newest first within `USER_MESSAGES_CHARS` (60,000), each cut in
  the middle past `USER_MESSAGE_CHARS` (6,000), with a count of the older ones left out. The section is carried
  across compactions, and the model updates only its own part, so the words are never paraphrased and do not count
  against Pi's summary length cap.
- **Exact details on demand.** The summary ends with the session file's path (the full transcript, never compacted)
  and, when `backlog` is active, an instruction to record follow-ups there.
- **Same model and auth.** The call goes through `ctx.modelRegistry.streamSimple` on the session model and thinking
  level, so providers an extension registered work too. If it fails (or there is no model), Pi writes its default
  summary; a UI session gets a warning.
- **Changed files.** The paths the `file` tool changed go into `preparation.fileOps`, so the summary's
  `<modified-files>` list is complete. Pi carries file lists forward only from its own summaries, so Octocode adds the
  previous summary's lists when it wrote that one.
- **Files read back** (as Claude Code does). At `session_compact`, the files read or changed in the summarized part,
  most recent first, that the kept tail does not show come back as a hidden `octocode-restored-files` message:
  at most `RESTORE_MAX_FILES` (5) text files, each cut at a line past `RESTORE_FILE_CHARS` (20,000), within
  `RESTORE_TOTAL_CHARS` (50,000) and at most `RESTORE_SHARE` (10%) of the window left after Pi's reserve (none below
  `RESTORE_MIN_FILE_CHARS`, 2,000, per file), so a small model is not refilled to its threshold. Pi holds a
  context-only message until the running turn ends, so they count as read for the `file` tool from the first model
  call that carries them (the `context` event), and again after a resume or reload. The kept user messages scale the
  same way (`USER_MESSAGES_SHARE`, 10%).
- **Tool results as the summarizer sees them.** Pi shows the summarizer only the first 2,000 characters of each tool
  result. Octocode hands it a copy where a longer result keeps its head (1,000 characters) and its tail within that
  cut, so the end of a test run, build or stack trace (where errors and verdicts are) reaches the summary; the
  session's messages are not changed.
- **Thrash breaker** (as Claude Code does). When the context refilled to the limit within `THRASH_TURNS` (3) model turns
  of the previous compaction `THRASH_STREAK` (3) times in a row, the next automatic compaction is cancelled and the run
  stopped with an explanation: another summary would not make room. A manual `/compact` always runs and starts the
  count over.
- **Compaction before a smaller model** (as Codex does). Switching to a model whose window cannot hold the context
  (less its reserve: `compaction.modelOverrides["provider/id"].reserveTokens`, else `compaction.reserveTokens`) compacts
  first, summarizing on the previous model, which can still read all of it. It runs even with `compaction.enabled`
  off (the next request would fail), and like `/compact` it stops a running turn first.
- **Reads in context.** After a compaction, a branch move, a resume or a reload, the file guard keeps the reads the
  context still shows (the kept tail and the files read back) and drops the rest, so another file read before the
  cut must be read again before the `file` tool changes it; a file changed on disk since its read always needs a
  fresh read.
- **Running work.** At `session_compact`, a hidden, non-waking message (`octocode-running-work`, at most 500
  characters) lists background bash jobs (id, command, log) and background subagents (id, task) started since this
  session started in this process that have not reported yet, and this session's ongoing backlog items. It is read from the session's own entries: a `bash` result
  with `details.job` and no `octocode-bash-job` report for its log, and an `agent` result with
  `details.status: 'background'` and no `octocode-agent-result` message for its id.
- **SessionStart hooks** run again with source `compact` (with `OCTOCODE_HOOKS=1`, as in Claude Code); their context
  comes with the next prompt.
- **Memory.** Injections from the compaction's first kept entry on are still in context, so only ids injected before
  it may be injected again.

## Prompt cache

Anthropic caches a request's prefix (tools, then system prompt, then messages) at the breakpoints pi-ai marks. A
write costs more than plain input, a read much less (on Opus 5.5 at Anthropic's list price: $4 input, $5 write, $8 for
a 1-hour write, $0.20 read per million tokens), so a write costs 25× a read. In the measured sessions 94% of prompt tokens were cache reads, yet
cache writes were 44% of the spend; that is what this section reduces.

### Retention

At `session_start`, before the first request, and again before every run (so a long-lived process that lost the value
heals at its next prompt), Octocode sets `PI_CACHE_RETENTION`:

| Session | Retention | Why |
|---|---|---|
| Interactive (has a UI) | `long`: 1-hour entries | 55% of measured cache-write spend was entries that expired after 5 to 60 minutes of idling (186 of 195 misses had gaps under an hour) |
| Headless (print, JSON) | `short`: 5 minutes | no one idles between its requests |
| Subagents | `short`, set in the child's environment | a child runs briefly and back to back; the main session's `long` never reaches it |

A value you export always wins, in subagents too. pi-ai and Pi's warmer both read this one variable, so they agree
on the lifetime. A 1-hour write costs 2× input instead of 1.25×; the measured saving outweighs it
(about −$45 of idle rewrites against +$23 on other writes per $200 of spend). Verified on a live gateway: an
interactive session's write reports `cacheWrite1h`, a headless one's does not.

`long` asks every provider for its longer entry: 1 hour on Anthropic and Bedrock, `prompt_cache_retention: "24h"` on
OpenAI-style APIs; other providers ignore it. Warming and the registry lifetimes below are for `anthropic-messages`
models only; other models use the inferred lifetime for warming decisions only.

### Lifetimes for models that declare none

Pi's warmer and Octocode's warming decisions need to know how long an entry lives. A model in Pi's catalog declares it
(`promptCache`); a custom model in `models.json` usually does not. Once such a model's replies report cache reads or
writes, it is known to cache until the extension reloads (an aborted reply without usage does not undo that; after a
`/reload` its next cached reply teaches it again) and gets
300 s (3,600 s with `long`, or 300 s when its replies show `cacheWrite1h: 0`, meaning the provider granted only 5
minutes). For an `anthropic-messages` model Octocode also puts those lifetimes into Pi's registry with
`pi.registerProvider`, listing the provider's models as the registry has them and adding `promptCache` only to the
models seen caching. Auth, headers config and `modelOverrides` stay Pi's (overrides apply last, so your own
`promptCache` override still wins); a provider whose models carry resolved headers (a built-in one) is left alone, and
a refused registration is not retried. Other APIs get the inferred lifetime for warming decisions only. Verified on a live
gateway: the request after the re-registration authenticates and reads the cache.

### Warming

Pi's warmer refreshes a cache entry before it expires when that is expected to pay: during an active run by default
(`cacheWarming: "streaming"`), and also between runs with `"idle"` (a global Pi setting). Octocode decides through
Pi's `cache_warming_decision` event:

- **Never in a headless run or subagent:** they end soon, so a refresh is wasted.
- **Idle refreshes from the session's own pauses** instead of Pi's constant 15% chance that the user continues:
  q(t) is the share of past gaps longer than the current idle time t that ended after t + τ/10 and by t + τ (τ the
  lifetime), and a refresh is sent when q(t) × the miss cost beats the refresh cost. With fewer than 5 past gaps,
  Pi's own decision stands.

## Cost and usage

### Where a price comes from

Octocode never prices tokens. Every displayed amount is a sum of the `usage.cost.total` Pi attaches to each reply,
computed by pi-ai's `calculateCost` from the model's `cost` rates (per million tokens):

`cost = input × in + output × out + cacheRead × read + (cacheWrite − cacheWrite1h) × write + cacheWrite1h × 2 × in`

A rate `tier` (for example Haiku 5.5 above 100k prompt tokens) applies when the request's prompt tokens
(input + cache reads + cache writes) exceed its threshold. The rates come from your `models.json` for a custom
provider, or from Pi's built-in catalog. Pi treats a model with no `cost` as free (all rates 0).

So every amount is an **estimate at list price**: not what a gateway bills, and without data-residency (US-only
inference ×1.1), fast-mode or batch modifiers.

### How it is shown

One money format and one token format (`src/shared/format.ts`) are used everywhere: the footer, the agents panel and
its header, `coordinate list` and `/agents`, subagent live rows, `Done (…)` lines and background reports, and
`/sessions`.

| Shown | Meaning |
|---|---|
| `≈$2.28` | the summed list-price estimate (`≈$<0.01` for tiny amounts) |
| `≈$2.28 + n/a` | part of the usage came from a model with no pricing, so it is not in the amount |
| `cost n/a` | none of it was priced |
| `↑1.2M (94% cached) ↓35k` | ↑ every prompt token (uncached input, cache reads and cache writes), with the share read from cache; ↓ output |

A reply that spent tokens counts as unpriced when its model's registry rates are all zero (or, for a model the
registry does not know, when its own cost is 0). A subagent's `agent` result names no model, so its run's own verdict
(`details.unpriced`, set when any of the child's replies was unpriced, even if the rest were priced) decides for it. The
first unpriced reply in a session warns once: `<provider>/<model> has no pricing in models.json; its usage is not in the
cost`. Team members' totals live in the shared agent database (`cache_read` and `unpriced` columns),
and each session's flag in `sessions.unpriced`, so other sessions' rows and `/sessions` show the same
format; an older extension in another running Pi refuses a newer database and shows `team off` until it is updated.

To price a custom model, add its `cost` (and `tiers`) to `models.json`; Anthropic's list prices are at
[platform.claude.com pricing](https://platform.claude.com/docs/en/about-claude/pricing).

## Subagents

A subagent is a separate `pi --mode json --no-session` process running this extension, so everything above applies
inside it too (it gets `short` retention; its warming is stopped).

- **Cache sharing.** No per-child data (id, name, goal, scratch folder, parent) goes into the system prompt: it rides
  in the task message. So children of the same profile and options (`collaborate`, `isolate` change the prompt) send
  the same tools and system prompt and read each other's
  cached prefix within its lifetime. Each child still pays one write of what differs (on a live check, about 19k
  tokens, roughly $0.10 on Opus 5.5). A child in an isolated worktree has a different working folder in its system
  prompt, so it shares nothing.
- **Cost roll-up.** The parent reads each child reply's usage (with its provider and model) from the child's event
  stream and adds it to the run's row, `Done (…)` line and background report, unpriced marker included. The `agent`
  tool result carries the child's total usage, so the parent session's footer and `/sessions` count it too. A forked
  session's `/sessions` cost counts only what it spent since the fork (the parent paid for the copied history); the
  footer shows the whole branch.
- **No session file.** Children run with `--no-session`, so their per-reply cache behaviour is visible only as the
  totals on the parent's row.

## Continuation across sessions

Background work reports back as a message. A job that session end (quit, `/new`, `/resume`, reload) stops is reported
before it stops, without waking the session, so the record shows it did not finish; background subagents do the same.
Work that never reported (Pi crashed or was killed) is named on resume: the resume brief lists it
(``Stopped when the session ended, without a report: bash-3 (`yarn test`, log …); general-ab12 (task "…")``), and that
alone is worth a brief. A log the retention sweep already removed is shown as `log deleted`, never as a path to read.

## Check it yourself

- **Fixed context:** `tests/prompt-size.test.ts` budgets extension-owned descriptions, schemas, guidelines and the
  Octocode section. `tests/e2e.test.ts` also budgets a real Pi request with the local MCP: base prompt, active tools and
  server instructions. Personal skills, repository instructions, other MCP servers and conversation history add to it.
- **This session:** the footer shows `↑… (N% cached)` and `≈$`; a cache miss notice appears when Pi's
  `showCacheMissNotices` setting is on.
- **Past sessions:** each reply's `usage` in `~/.pi/agent/sessions/*/*.jsonl` has `input`, `cacheRead`,
  `cacheWrite`, `cacheWrite1h` and the `cost` breakdown; sum the `cost.cacheWrite` share to see what writes cost.
- **Retention granted:** a reply with `cacheWrite1h > 0` used a 1-hour entry.
- **A summary:** the session's `compaction` entries hold each summary, its `details` file lists and `fromHook: true`
  when Octocode wrote it.

## Known limits

- Without trimming, a session reaches Pi's compaction threshold sooner, so summaries happen more often.
- Octocode's summary call does not use Pi's summarization retry policy or virtual-model routing (both private to Pi);
  a failure falls back to Pi's own summary, which does.
- A split turn's prefix is summarized by Pi's turn-prefix prompt, without the handoff sections.
- Pi caps the model's summary at 80% of `compaction.reserveTokens` (13,107 tokens by default) and drops one that hits
  the cap (then Pi's summary is used); the user messages are added by code after it, outside the cap.
- Idle warming only runs with Pi's `cacheWarming: "idle"`; with the default `"streaming"`, the 1-hour retention is
  what covers pauses.
- Amounts are list-price estimates.
- Pi's built-in catalog (pi-ai 0.99.2, `providers/data/anthropic.json`, `chat:claude-sonnet-5-5`) lists Sonnet 5.5
  cache reads at $0.20 per million instead of the official $0.10 (an upstream issue; a `models.json` entry overrides
  it).
- The footer sums replies and tool results; usage Pi records separately (cache refreshes, compaction and branch
  summaries) counts in Pi's `/session` totals but not in the footer.

## Tests

| Test | Covers |
|---|---|
| `tests/compaction.test.ts`, `compaction-summary.test.ts`, `compaction-restore.test.ts` | file-tool paths added to Pi's file ops, the handoff instructions, user messages kept by code within budgets, the transcript note, file lists carried from Octocode's summaries, files read back within budgets and counted as read |
| `tests/compaction-policy.test.ts` | idle continuation, no warming in headless runs, no context edits after a successful turn |
| `tests/compaction-cache.test.ts` | lifetimes, the registry supply, the granted tier, warming, retention |
| `tests/compaction-images.test.ts` | the staged `413` recovery, saved copies of stripped images |
| `tests/files.test.ts`, `elision.test.ts` | reads restored from the context; the `capChars` note and the summary's cut notes refused in file writes |
| `tests/sessions.test.ts`, `bash.test.ts`, `hooks.test.ts`, `memory.test.ts` | the running-work note and resume brief, the session-end job report, the `compact` SessionStart source, injected ids kept across a compaction |
| `tests/shared.test.ts`, `footer.test.ts`, `team-panel.test.ts`, `subagent-goal.test.ts` | the money and token formats, the unpriced marker and its one-time warning |
| `tests/agentdb.test.ts`, `subagent-tool.test.ts`, `sessions.test.ts` | missing schema added on open, nothing removed, the team and session usage columns, a child's cost roll-up and denied count, `/sessions` counting subagent usage and marking unpriced usage |
| `tests/permission-*.test.ts`, `subagent-permission.test.ts` | session grants, the kinds a child is handed |
| `tests/e2e.test.ts` › `compaction` | a real Pi session with a scripted provider: Octocode's summary on the session model with the user's `/compact` focus and the handoff sections, file lists that include `file` changes and carry across compactions, the user messages verbatim in the summary, files read back and changeable without a fresh read, the summary first in the next request, the fallback to Pi's summary; › `keeps every tool result verbatim`: no context edits |

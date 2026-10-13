# Context, cache and cost

How Octocode keeps long Pi sessions inside the context window while retaining raw evidence, keeps the provider's prompt
cache warm instead of rewriting it, and shows what a session costs. Each part names who owns it: Octocode (this
package) or Pi. Measured numbers come from the user's last 40 Pi sessions on 2026-10-12 (6.3k replies, 938M prompt
tokens, Opus 5.5 behind an Anthropic-compatible gateway).

## Who owns what

| Concern | Owner | Where |
|---|---|---|
| Trimming old tool results, call arguments and images | Octocode | `src/compaction/register.ts`, `policy.ts`, `images.ts`, `recovery.ts` |
| Summary compaction (the model writes a summary near the limit) | Pi | Pi's `compaction` settings; Octocode only adds to it (see [Summary compaction](#summary-compaction-pis)) |
| Where cache breakpoints go in a request | Pi (pi-ai) | `cache_control` on the system prompt, the last tool and the last user message |
| Cache retention (5 minutes or 1 hour) | Octocode | `src/shared/env.ts` |
| Cache lifetimes for models that declare none | Octocode | `src/compaction/cache.ts` |
| Refreshing a cache before it expires (warming) | Pi's warmer, Octocode's decisions | Pi `cacheWarming` setting; `register.ts` `cache_warming_decision` |
| The price of a reply | Pi (pi-ai `calculateCost`) from the model's `cost` rates | your `models.json` or Pi's catalog |
| How usage and cost are shown | Octocode | `src/shared/format.ts`, `src/ui/footer.ts`, the agents panel, subagent rows |
| Subagent processes, their cache retention and cost roll-up | Octocode | `src/subagents/process.ts`, `tool.ts` |

## Context window

Two layers keep a session in its window: Octocode's trims (every turn, no model call) and Pi's summary compaction
(rarely, with a model call). Trims are the cheap layer: research on SWE-agent–style agents found that masking old
observations matches LLM summarization at about half the cost ([JetBrains, 2025](https://arxiv.org/html/2508.21433)).

### Recoverable trims

Every piece of context a trim removes is saved first, and the note in its place names the file, its SHA-256 prefix
and its byte count, so the model reads back the exact removed bytes instead of rerunning the call.

- Copies go to the session's `output/` folder, named by content (`<label>-<sha256 prefix>.<ext>`): planning the same
  trim twice, or after a `/reload`, points at the same file.
- If saving fails, nothing is trimmed (a result keeps its text, a call its arguments, an image stays). The only
  exception is the `413` recovery below, whose note then says the image could not be saved.
- Pi keeps the raw entries in the session history; trims are append-only `context_edit` entries.
- A placeholder copied into a new call never runs: the first tool-call gate refuses any call other than `file` whose
  arguments contain one, and the `file` tool refuses one the file does not already hold. So a subagent never
  receives a task's head plus a placeholder.
- `tests/compaction-recoverable.test.ts` checks that every pointer reads back the exact removed bytes (text, JSON
  arguments, image bytes).
- Copies live in the session's `output/` folder and are swept with it after `OCTOCODE_CLEANUP_DAYS` (30 by default;
  see [CONFIGURATION](CONFIGURATION.md)), so in a session resumed after that a pointer can name a removed file.

### What is trimmed

**Old tool results** over 3,000 characters (all text parts together) keep their first 800 and last 300 characters
(about 1,200 with the note). The tail stays because spill pointers, exit codes and summaries sit at the end. Up to 3
lines in between that point at the full text on disk (`Full output: …`, `Full report: …`, `Log: …`, written by
spilled output, Pi's bash truncation note, background job reports and subagent reports) stay too. The complete result
is always saved before it is cut; a path mentioned in tool output is not proof that it contains that result.

**Arguments of old successful calls** whose JSON exceeds 2,000 characters: each string over 320 characters (a written
file's `content`, edit `oldText`/`newText`, a long command) keeps its first 160 characters and a note naming the JSON
file that holds the call's full arguments. A call is left alone unless this saves at least 1,000 characters. Paths,
keys and short values stay. Calls whose result failed keep their arguments verbatim.

**Images** are saved and replaced with a note naming the file. They are budgeted by their real base64 size, because a
screenshot of about 450 KB costs few tokens but many request bytes (a tiny image counts as 4,000 characters only when
savings are estimated): only the newest tool
results with images keep them, at most 3, while their images fit 1,000,000 characters together (the newest always),
even inside the recent window. Older results keep their text.

**Never trimmed:**

- the recent window: at least the 4 newest results, and up to 12 while their text fits Pi's
  `compaction.keepRecentTokens` (default 20,000 tokens, about 80,000 characters: the same tail Pi keeps unsummarized).
  The exception is successful `file` changes, whose text is already on disk;
- results of the turn that just ended, images included, because the model has not seen them yet (if they alone are
  too large, the [413 recovery](#too-large-413) handles it);
- `agent` reports and `askUser` answers, which cannot be regenerated; `agent`, `sendMessage` and `askUser`
  *arguments*, because a delegated task, a message or a question exists only in the context, and a shortened one
  becomes the template the model copies into its next call;
- custom messages (background job and subagent reports, team messages, memory injections, hook context, the resume
  brief, the running-work note). Each is bounded when it is written: job output tails at 4 KB / 40 lines with terminal
  escapes stripped, subagent previews at 8 KB / 200 lines with the full report on disk, team messages at 8,000
  characters.

When a trimmed result was the latest Pi `read` of a file (MCP tool results never count as reads), the file guard
forgets that read: its content left the context, so the `file` tool asks for a fresh read before changing the file;
a later verbatim read of the same file keeps it in view. Each call's verdict is remembered by tool-call id while the
call stays in the active branch (cleared on session start, compaction and tree moves), so a turn only judges calls it
has not judged before.

### When trims run

A trim changes the cached prompt from its first edit on, so whether a batch runs is a cost decision
(`src/compaction/policy.ts`), made at `turn_end`:

1. **Free:** the next request misses the cache anyway: its lifetime has passed since the prompt was last written or
   kept warm, or the model has no prompt cache. Every due trim runs then.
2. **Pressure:** half the context window used, or 1,500,000 request characters (gateways can reject requests of a
   few MB). Every due trim runs.
3. **Warm cache:** a batch must pay for itself. It saves S tokens on every later request and makes the next request
   rewrite the R tokens after its first edit, so it runs only when

   `S × (write + later × (N − 1)) > R × (write − read)`

   - the prices are the model's own `cost` rates (a 1-hour write at 2× input, as pi-ai prices `cacheWrite1h`); a
     model without prices uses Anthropic's ratios 0.1× / 1.25× / 2×;
   - `later` blends a read with a fresh write by the share of this session's requests that found the cache cold;
   - N, the requests expected to reuse the context, is the number that already did, capped by the growth that fits
     before Pi's own compaction (`contextWindow − compaction.reserveTokens`).
   - S and R use text-character estimates and Pi's visual-token estimate for images. Base64 payload length affects
     request-size pressure and the batch floor, but is never priced as text tokens: a large encoded screenshot does
     not justify rewriting a long cached text prefix by itself.

   Because R depends on where the first edit is, the planner compares every batch made of the newest candidates back
   to an older one and takes the one worth most: on a warm cache a batch near the end can pay where one reaching back
   to the oldest result cannot.

Every batch must also clear a floor, so edits are never trivial: at least 10 results saving 20,000 characters, or any
batch saving 60,000. Request size counts what the provider is actually sent: text, thinking with its
signature (pi-ai resends both to Anthropic), tool-call names and arguments, and images.

### Too large (413)

When a turn fails because the request is too large (`413`, `request_too_large`, `Payload Too Large`, …), Octocode
omits the failed attempt, replaces every image except the newest one, and continues once. Pi treats a gateway's
bodiless `413 status code (no body)` as a plain error, so without this every later request would resend the same
bytes. If the retry fails too, the last image goes and it continues again; with no image left it stops and warns the
user to `/compact` or `/tree` back. A successful turn starts the sequence over.

- When Pi itself recognises the overflow (it compacts and retries), Octocode only strips images, so that retry fits;
  it neither continues nor warns.
- Recovery removes images only: a request too large because of text ends with the `/compact` / `/tree` warning.

### Summary compaction (Pi's)

Pi writes the summary with the user's session model, prompt, auth, routing and retry policy, and reports failures
itself; `/compact <focus>` passes the focus to Pi; `/tree` branch summaries are Pi's too. Octocode adds:

- **Changed files.** At `session_before_compact`, the paths the `file` tool changed go into Pi's file tracking
  (`preparation.fileOps`), so the summary's `<modified-files>` list is complete and carries forward.
- **Fresh reads.** After a compaction the file guard forgets every read: a file read before it must be read again
  before the `file` tool changes it.
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

A value you export always wins, in subagents too. pi-ai, Pi's warmer and the trims all read this one variable, so
they agree on the lifetime. A 1-hour write costs 2× input instead of 1.25×; the measured saving outweighs it
(about −$45 of idle rewrites against +$23 on other writes per $200 of spend). Verified on a live gateway: an
interactive session's write reports `cacheWrite1h`, a headless one's does not.

`long` asks every provider for its longer entry: 1 hour on Anthropic and Bedrock, `prompt_cache_retention: "24h"` on
OpenAI-style APIs; other providers ignore it. Warming and the registry lifetimes below are for `anthropic-messages`
models only; other models use the inferred lifetime for trims only.

### Lifetimes for models that declare none

Pi's warmer and Octocode's trims need to know how long an entry lives. A model in Pi's catalog declares it
(`promptCache`); a custom model in `models.json` usually does not. Once such a model's replies report cache reads or
writes, it is known to cache until the extension reloads (an aborted reply without usage does not undo that; after a
`/reload` its next cached reply teaches it again) and gets
300 s (3,600 s with `long`, or 300 s when its replies show `cacheWrite1h: 0`, meaning the provider granted only 5
minutes). For an `anthropic-messages` model Octocode also puts those lifetimes into Pi's registry with
`pi.registerProvider`, listing the provider's models as the registry has them and adding `promptCache` only to the
models seen caching. Auth, headers config and `modelOverrides` stay Pi's (overrides apply last, so your own
`promptCache` override still wins); a provider whose models carry resolved headers (a built-in one) is left alone, and
a refused registration is not retried. Other APIs get the inferred lifetime for trims only. Verified on a live
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
- Only a successful refresh counts as a write for trimming. Octocode observes Pi's persisted `cache_warm` usage
  on the active branch and uses the preceding decision time as a conservative request-start bound. A failed or
  cancelled warm does not postpone trimming; completion time is never treated as the start of the cache lifetime.

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
cost`. Team members' totals live in the shared agent database (`cache_read` and `unpriced` columns since schema v3),
and each session's flag in `sessions.unpriced` (schema v4), so other sessions' rows and `/sessions` show the same
format; an older extension in another running Pi refuses a newer database and shows `team off` until it is updated.

To price a custom model, add its `cost` (and `tiers`) to `models.json`; Anthropic's list prices are at
[platform.claude.com pricing](https://platform.claude.com/docs/en/about-claude/pricing).

## Subagents

A subagent is a separate `pi --mode json --no-session` process running this extension, so everything above applies
inside it too (its trims save every removed piece; it gets `short` retention; its warming is stopped).

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
- **A trim's pointer:** the note's path, SHA-256 prefix and byte count match the saved file.

## Known limits

- Some limits are fixed policy floors, not derived: the recent window's 4 to 12 results, the batch floor (10 results
  and 20,000 characters, or 60,000), the 800/300 head and tail, and the pressure triggers (50% of the window,
  1,500,000 request characters).
- After a summary compaction nothing re-reads the files the session was working on (Claude Code re-reads up to 5), and
  the paths of saved trim copies are not carried into Pi's summary.
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
| `tests/compaction.test.ts`, `compaction-trim.test.ts` | the trim plan, head/tail trimming with spill pointers, the per-session memo, the guard forgetting trimmed reads, file-tool paths added to Pi's file ops |
| `tests/compaction-policy.test.ts` | the cost decision, the recent window, idle continuation |
| `tests/compaction-cache.test.ts` | lifetimes, the registry supply, the granted tier, warming, retention |
| `tests/compaction-recoverable.test.ts` | every pointer reads back the exact removed bytes |
| `tests/compaction-images.test.ts` | the image budget, the size-pressure trigger, the staged `413` recovery |
| `tests/sessions.test.ts`, `bash.test.ts`, `hooks.test.ts`, `memory.test.ts` | the running-work note and resume brief, the session-end job report, the `compact` SessionStart source, injected ids kept across a compaction |
| `tests/shared.test.ts`, `footer.test.ts`, `team-panel.test.ts`, `subagent-goal.test.ts` | the money and token formats, the unpriced marker and its one-time warning |
| `tests/agentdb.test.ts`, `subagent-tool.test.ts`, `sessions.test.ts` | the v3 team and v4 session columns, a child's cost roll-up and denied count, `/sessions` counting subagent usage and marking unpriced usage |
| `tests/permission-*.test.ts`, `subagent-permission.test.ts` | session grants, the kinds a child is handed |
| `tests/e2e.test.ts` › `compaction` | a real Pi session with a scripted provider: Pi summarizes on the session model with the user's `/compact` focus, the summary's file lists include `file` changes and carry across compactions, and the guard requires fresh reads afterwards |

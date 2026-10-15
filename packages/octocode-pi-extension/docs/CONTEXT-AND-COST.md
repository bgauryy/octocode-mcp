# Context, cache and cost

How Octocode keeps long Pi sessions inside the context window without dropping evidence, keeps the provider's prompt
cache warm instead of rewriting it, and shows what a session costs. Each part names who owns it: Octocode (this
package) or Pi. Measured numbers come from the user's last 40 Pi sessions on 2026-10-12 (6.3k replies, 938M prompt
tokens, Opus 5.5 behind an Anthropic-compatible gateway).

## Who owns what

| Concern | Owner | Where |
|---|---|---|
| Summary compaction (the model writes a summary near the limit) | Pi's machinery, Octocode's summary | Pi's `compaction` settings and `compact()`; `src/compaction/summary.ts`, `shared-summary.ts` (see [Summary compaction](#summary-compaction)) |
| Stripping images from a request rejected as too large | Octocode | `src/compaction/images.ts`, `recovery.ts` |
| Where cache breakpoints go in a request | Pi (pi-ai) | `cache_control` on the system prompt, the last tool and the last user message |
| Cache retention (5 minutes or 1 hour) | Octocode | `src/shared/env.ts` |
| Cache lifetimes for models that declare none | Octocode | `src/compaction/cache.ts` |
| Refreshing a cache before it expires (warming) | Pi's warmer, Octocode's decisions | Pi `cacheWarming` setting; `register.ts` `cache_warming_decision` |
| The price of a reply | Pi (pi-ai `calculateCost`) from the model's `cost` rates | your `models.json` or Pi's catalog |
| How usage and cost are shown | Octocode | `src/shared/format.ts`, `src/ui/footer.ts`, the agents panel, subagent rows |
| Subagent processes, their cache retention and cost roll-up | Octocode | `src/subagents/process.ts`, `tool.ts` |

## Context window

Tool results, call arguments and images stay verbatim until Pi's summary compaction, with three exceptions, each
shown to the model as a note that says what happened and where the full text is:

- **The [413 recovery](#too-large-413)** strips images only when a provider has already rejected the request.
- **[Cold-cache clearing](#cold-cache-clearing)** replaces old, re-fetchable tool results with a placeholder after the
  prompt cache has expired.
- **[Repeated reads](#repeated-reads)** of an unchanged file get a one-line note instead of the content again.

A result too large for one turn is bounded when it is written instead, and never silently: the whole output goes to
a file in the session's `output/` folder (or `bash/` for commands) and the model sees a preview with a note that
names the file, so it can search or read the rest by range. See [Spilled outputs](#spilled-outputs).

### Cold-cache clearing

Clearing an old result while the prompt cache is warm makes the next request rewrite the whole cache entry. After an
idle gap longer than the cache lifetime in use (1 hour for interactive sessions, 5 minutes for headless runs and
subagents; `promptCacheTtlMs`) the next request rewrites it anyway, so clearing then costs nothing and every later
request is smaller. This is what Claude Code does after 65 minutes idle.

At `before_agent_start` (a user prompt, or a custom message that wakes the session) `clearColdResults`
(`src/compaction/clearing.ts`) checks the time since the cache was last used (`lastCacheUseAt`): the last assistant
reply, or a later refresh by Pi's warmer (its `cache_warm` usage entry), which restarts the entry's lifetime. Past the
lifetime, it clears results by these rules:

- **Clearable:** successful, text-only results of `read`, `grep`, `find`, `ls`, `web` and `mcp__octocode__*`: a call
  you can run again. Never `bash`, `file`, `agent`, custom messages, errors, or results with an image.
- **Kept:** the newest 5 clearable results (a [repeated-read note](#repeated-reads) is not one of them). The older
  ones are cleared only when their text totals at least 20,000 tokens (`CLEAR_AT_LEAST_TOKENS`, at `CHARS_PER_TOKEN`
  characters per token).
- **Nothing is lost:** each result's whole text is first saved to `output/cleared-<tool>-<hash>.txt`. A result that
  cannot be saved stays. The placeholder is
  `[Old tool result cleared after the prompt cache expired. Full output: <path> (sha256 …, N bytes). Read that file, or run the call again.]`.
  A repeated-read note that points at a cleared result gets the same placeholder, so it never points at text that is gone.
- **Stable between requests:** the decision is a session entry (`octocode-cleared-results`, never sent to the model).
  The `context` handler applies it to every request in the same way, so the prompt does not change from one request to
  the next, and a resume, reload or fork applies it again from the branch. After a compaction the cleared messages are
  gone and there is nothing to do. A summary compaction lists these saved files in its `<saved-results>` block.
- **File guard:** a cleared `read` no longer shows the file, so the guard forgets it (`contextReads` skips cleared
  results) and the `file` tool asks for a fresh read before changing that file.

The next request after a clear is a normal request on the smaller context.

### Repeated reads

When Pi's `read` (or `mcp__octocode__localFetch`) returns exactly the text an earlier call with the same arguments
returned, and that earlier result is still in the context, `registerReadDedupe` (`src/files/dedupe.ts`) replaces the new
result with `[Unchanged since your earlier read of <path> (same range); that result is above in your context.]`. The
same text is the proof that the file did not change; nothing is guessed from modification times. No note replaces:

- a read with other arguments (another range) or other text (the file changed);
- a read whose earlier result was compacted away, cleared by cold-cache clearing, or was an error;
- an error or an image.

The note keeps the read's own `details` and adds `unchangedOf` (the earlier call's id). The file guard digests the
text the read returned before the note replaces it, and a note still counts as a read while the result it points at is
in the context: not once that result is cleared, or cut away by a compaction that kept the note.

### Spilled outputs

| Output | Kept in context | The rest |
|---|---|---|
| Any result bounded by `capOutputToFile` (`src/shared/spill.ts`) | its head (about 70%) and tail (about 30%) within the cap, with `[… N lines omitted …]` between them | the whole text in `output/<label>-….txt`, named by the closing `[Output trimmed: showing … lines (…). Full output: <path>; …]` note |
| MCP text part (`src/mcp/tools.ts`) | whole up to 60,000 UTF-16 characters (`TEXT_MAX_CHARS`), including multi-byte text and short lines: room for an Octocode result page and its header. Over it, a head and tail preview uses the character allowance as a conservative byte limit; the tail keeps the `next.*` continuation | spilled as above (the whole part, named in the note) |
| MCP text parts of one assistant message (`TurnBudget`, reset at `turn_start`) | whole while the turn's MCP text is under 200,000 characters (`TURN_MAX_CHARS`); a part that would pass it keeps a head and tail preview within the remaining allowance (at least 4,000); previews use that allowance as a byte limit, while a whole part is measured in characters | each cut part spilled whole as above |
| MCP image over 600,000 base64 characters (`IMAGE_MAX_CHARS`, `boundImagePart`) | resized by Pi to fit, with `[Image fitted for context. Original saved to <path>.]` | the original in `output/`; when Pi cannot resize it only the path is left: `[image/png image of … left out: too large for the context. Saved to <path>.]` |
| `web` fetch (`src/web/web.ts`) | the first `maxChars` characters (20,000 by default, up to 50,000) with `[… N more characters cut; the whole page (… lines, links included) is in <path>: …]`; then Pi's 50 KB / 2,000-line cap | the whole page in `output/web-….txt` |
| `browser` evaluate and console (`src/browser/tool.ts`) | Pi's 50 KB / 2,000 lines | spilled as above |
| `browser` screenshot (`src/browser/screenshot.ts`) | the capture, or a smaller retake when it is over 600,000 base64 characters; only the path when no retake fits | the full-size capture in `output/`, always named |
| `browser` snapshot text, change lists, footers (`capChars`) | up to each list's character budget with `[… N more characters cut; take a snapshot to see …]` | the page itself (take a snapshot) |
| `bash` (Pi's own truncation) | the tail within 50 KB / 2,000 lines with Pi's note | the full output, moved into the session's `bash/` folder |
| Subagent report (`src/subagents/report.ts`) | the first 8 KB / 200 lines | the whole report in the run's scratch folder, named in the note |
| Hook context, block reasons and asks (`src/hooks/runner.ts`) | 16 KB through `capOutputToFile` | spilled as above; output a hook prints past 64 KB is not read, and a note says how much |

Spilled files stay as long as the session's other output (`OCTOCODE_CLEANUP_DAYS`, default 30 days), so a path in a
kept transcript or a subagent's report stays readable. The `file` tool refuses a write or edit that adds any of these
notes (the `capChars` cut, the omitted-lines gap, the `[Output trimmed: …]` note, a restored file's
`[… shown lines …]` note, or a summary's cut notes) to a file that does not already hold it: a copied preview would
save a hole, not content.

### Too large (413)

When a turn fails because the request is too large (`413`, `request_too_large`, `Payload Too Large`, …), Octocode
omits the failed attempt, replaces the images of every tool result and user message except the newest one (oldest
first; each saved to `output/` and named in the note that replaces it), and continues once. Pi treats a gateway's
bodiless `413 status code (no body)` as a plain error, so without this every later request would resend the same
bytes. If the retry fails too, the last image goes and it continues again; with no image left it stops and warns the
user to `/compact` or `/tree` back. A successful turn starts the sequence over.

- When Pi itself recognises the overflow (it compacts and retries), Octocode only strips images, so that retry fits;
  it neither continues nor warns.
- Recovery removes images only: a request too large because of text ends with the `/compact` / `/tree` warning.

### When to compact

Pi compacts automatically when the context passes the window less `compaction.reserveTokens`. On a 1M window with
the default reserve that is near 980k tokens: every request re-reads the whole history (cache reads were 36% of a
measured 565k-token session's spend), and recall degrades long before the window is full. Compact on a token
budget instead (as Codex's `model_auto_compact_token_limit` does) through Pi's per-model reserve, so Pi's own
mid-run compaction, Octocode's summary and the files read back all apply:

```json
"compaction": {
  "reserveTokens": 40000,
  "keepRecentTokens": 30000,
  "modelOverrides": { "<provider>/<1M-window model>": { "reserveTokens": 800000 } }
}
```

`800000` on a 1M window compacts at 200k. The summary cap (80% of the reserve) is still bounded by the model's
`maxTokens`, and the kept user messages and files read back are sized from the 200k left, so they stay at their
caps. The footer's gauge reads against this point (`ctx … 45% of 200k`): 100% is where Pi compacts.

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
  the middle past `USER_MESSAGE_CHARS` (6,000), with a count of the older ones left out. A skill Pi expanded into a
  message (`/skill:name`) is kept as `[skill <name> loaded from <path>]`, not its body. The section is carried
  across compactions, and the model updates only its own part, so the words are never paraphrased and do not count
  against Pi's summary length cap.
- **Saved results** (`src/compaction/saved-results.ts`). After a summary compaction, the files Octocode saved from the
  summarized results (trimmed or cleared tool results, fetched pages, screenshots, bash logs, and the log and rotated
  `.1` file that a finished background job's report names) are listed once in a `<saved-results>` block after the file
  lists, and kept in the compaction's `details.savedResults` so later summaries carry them. A `<saved-results>` block
  the model writes itself is removed and replaced by the code-written one. A list over 3,000 characters
  (`SAVED_RESULTS_INLINE_CHARS`) is written to a file in the session's `output/` folder and the block names that file;
  if that file cannot be written the list stays in the summary. Pi's own fallback summary lists none of it, but the
  list is not lost: the next Octocode summary walks back to the newest compaction that carries
  `details.savedResults` and continues from it.
- **Exact details on demand.** The summary ends with the session file's path (the full transcript, never compacted)
  and, when `backlog` is active, an instruction to record follow-ups there.
- **Prompt-cache sharing** (as Claude Code does; `src/compaction/shared-summary.ts`). On the session's own model
  Octocode does not hand `compact()` a new prompt, which the provider would bill as fresh input for the whole context.
  It sends the session's own request, built the way Pi builds one (the session projection: the system and tool
  declarations and every message, run through `convertToLlm`, with the cold-cache clearing placeholders applied), plus
  one final user message: Pi's summary format, the instruction to reply with text only and not to record that request,
  where the kept messages begin (quoted, so the model summarizes only what comes before them), a note to carry an
  earlier summary forward without copying the `## User Messages` and `## Recovery` sections and file blocks code
  re-appends, then the user's focus and `SUMMARY_FOCUS`. The model, thinking level and budgets, transport and routing
  id are the session's, and tools stay declared with no tool choice, because changing any of them invalidates the cached
  messages. The provider finds the cached prefix of the session's last request and bills only the new message. The
  `<read-files>` and `<modified-files>` lists are built from `preparation.fileOps` in Pi's format, with
  `details.readFiles`/`modifiedFiles`, so the file-list carrying and Pi's later compactions work as before. A live run
  on `claude-haiku-5-5` through the gateway (108k tokens of context, thinking `high`) read 107,821 tokens from cache
  with 4 uncached input and 1,132 written; the standalone request has no cache read.
- **Fallback.** The standalone `compact()` call, which Pi's own prompts and retry policy shape and which goes through
  `ctx.modelRegistry.streamSimple` on the session model and thinking level (so providers an extension registered
  work), runs instead when the summary model is not the session's (a downshift, summarized on the previous model),
  when images are blocked (`images.blockImages`, which the shared request cannot honor), or when the shared request
  fails: an error, an aborted or length stop, empty text, any tool call, or a summary over the cap. If that fails too
  (or there is no model), Pi writes its default summary; a UI session gets a warning.
- **Changed files.** The paths of the `file` tool's queries that succeeded go into `preparation.fileOps` (a refused or
  failed query changed nothing, so it is not listed), so the summary's `<modified-files>` list is complete. Pi carries file lists forward only from its own summaries, so Octocode adds the
  previous summary's lists when it wrote that one.
- **Files read back** (as Claude Code does). At `session_compact`, the files read or changed in the summarized part,
  most recently worked on first, that the kept tail does not show come back as a hidden `octocode-restored-files`
  message: at most `RESTORE_MAX_FILES` (5) text files, each up to `RESTORE_FILE_CHARS` (20,000) of whole lines,
  within `RESTORE_TOTAL_CHARS` (50,000) and at most `RESTORE_SHARE` (10%) of the window left after Pi's reserve (none
  below `RESTORE_MIN_FILE_CHARS`, 2,000, per file), so a small model is not refilled to its threshold. A longer file
  shows the lines from where the agent last read (`offset`) or changed it, and ends with
  `[… shown lines A–B of N; read the file with an offset for the rest]`. A file read back keeps the time of the work
  it stands for, so the next compaction does not rank it as new and bring it back ahead of newer work. Pi holds a
  context-only message until the running turn ends, so they count as read for the `file` tool from the first model
  call that carries them (the `context` event), and again after a resume or reload. The kept user messages scale the
  same way (`USER_MESSAGES_SHARE`, 10%). These budgets count three characters a token (`CHARS_PER_TOKEN` in `src/shared/tokens.ts`, the one constant every
  estimate without a tokenizer uses): code, paths and JSON tokenize nearer three than prose's four.
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
  off (the next request would fail), and like `/compact` it stops a running turn first. Right after a compaction Pi
  has no token count until the next reply, so the context is estimated then: the system prompt, the active tools'
  definitions (name, description, schema and guidelines) and every message.
- **Reads in context.** After a compaction, a branch move, a resume or a reload, the file guard keeps the reads the
  context still shows (the kept tail and the files read back) and drops the rest, so another file read before the
  cut must be read again before the `file` tool changes it; a file changed on disk since its read always needs a
  fresh read.
- **Running work.** At `session_compact`, a hidden, non-waking message (`octocode-running-work`) lists background
  bash jobs (id, command, log) and background subagents (id, task) started since this session started in this
  process that have not reported yet (about 380 characters of them, then `+N more`), and this session's ongoing
  backlog items (five, then `+N more`), each with its goal (cut at 160 characters) and up to three paths; the resume
  brief uses the same line. It is read from the session's own entries: a `bash` result
  with `details.job` and no `octocode-bash-job` report for its log, and an `agent` result with
  `details.status: 'background'` and no `octocode-agent-result` message for its id.
- **SessionStart hooks** run again with source `compact` (with `OCTOCODE_HOOKS=1`, as in Claude Code); their context
  comes with the next prompt (over 16 KB it is spilled to a file like any long output).
- **Memory.** Injections from the compaction's first kept entry on are still in context, so only ids injected before
  it may be injected again. A memory edited after its injection counts as new and is injected again; a memory line
  over 600 characters ends with `(memory get M<n>)` for the whole note.

## Prompt cache

Anthropic caches a request's prefix (tools, then system prompt, then messages) at the breakpoints pi-ai marks. A
write costs more than plain input, a read much less (on Opus 5.5 at Anthropic's list price: $4 input, $5 write, $8 for
a 1-hour write, $0.20 read per million tokens), so a write costs 25× a read. In the measured sessions 94% of prompt tokens were cache reads, yet
cache writes were 44% of the spend; that is what this section reduces.

### Keeping the prefix stable

Any change before the newest messages (tools, system prompt) re-bills everything after it. Two causes rewrote whole
contexts in measured sessions (45% of spend over 12 sessions):

- **Pi older than 1.2.0** starts a run that a background report wakes without `before_agent_start`, so from its
  second request the `octocode` prompt section is patched away (`sections: {octocode: null}`) and the next prompt
  adds it back: two full rewrites per report ([pi#10267](https://github.com/earendil-works/pi/issues/10267), fixed in
  1.2.0). An interactive session warns at start when Pi is older than the package's peer range.
- **A custom model without the catalog's `compat`.** Without `supportsMidConvoSystemMessages` (and
  `supportsMidConvoToolChanges`), `anthropic-messages` folds every prompt or tool change into the head of the request
  instead of appending it, so a late MCP connect or a tool-set change rewrites the cache. Copy the built-in entry's
  `compat`, `promptCache`, `reasoning` and `thinkingLevelMap` into your `models.json` copy (the footer already warns
  about a missing `reasoning`).

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
`/sessions`. A subagent's row and background report are labelled by the outcome word its report starts with
(`Done`, `Partial`, `Blocked`, `Failed`; "reported blocked"); a crash is `Failed`, and a report without the word
reads `finished`.

| Shown | Meaning |
|---|---|
| `≈$2.28` | the summed list-price estimate (`≈$<0.01` for tiny amounts) |
| `≈$2.28 + n/a` | part of the usage came from a model with no pricing, so it is not in the amount |
| `cost n/a` | none of it was priced |
| `↑1.2M (94% cached) ↓35k` | ↑ every prompt token (uncached input, cache reads and cache writes), with the share read from cache; ↓ output |
| `ctx ▰▰▱▱ 45% of 200k` | the context against where Pi compacts automatically (the window less the model's `compaction.reserveTokens`; the window when compaction is off) |

The footer and `/sessions` count the same messages (`spendOf` in `src/shared/util.ts`): replies, a foreground
subagent's `agent` result (its `usage`) and a background subagent's report (its `details.usage` and
`details.unpriced`), so the session's amount includes every subagent it started. `coordinate list` and the agents
panel show each agent's own replies; a parent's children are listed as their own rows while they run.

A reply that spent tokens counts as unpriced when its model's registry rates are all zero (or, for a model the
registry does not know, when its own cost is 0). A subagent's `agent` result names no model, so its run's own verdict
(`details.unpriced`, set when any of the child's replies was unpriced, even if the rest were priced) decides for it. The
first unpriced reply in a session warns once: `<provider>/<model> has no pricing in models.json; its usage is not in the
cost`. Team members' totals live in the shared agent database (`cache_read` and `unpriced` columns),
and each session's flag in `sessions.unpriced`, so other sessions' rows and `/sessions` show the same
format. Every build adds the columns it needs when it opens the database and removes nothing, so builds of different
ages share the file.

To price a custom model, add its `cost` (and `tiers`) to `models.json`; Anthropic's list prices are at
[platform.claude.com pricing](https://platform.claude.com/docs/en/about-claude/pricing).

## Subagents

A subagent is a separate `pi --mode rpc` process running this extension (the task is sent as a `prompt` command on
stdin, and stdin closes once the run has settled), so everything above applies inside it too (it gets `short`
retention; its warming is stopped).

- **Cache sharing.** No per-child data (id, name, goal, scratch folder, parent) goes into the system prompt: it rides
  in the task message, and the coordination rule (Pi team versus agents-communication) is only in the main session's
  prompt. So children of the same profile and options (`collaborate`, `isolate` change the prompt) send
  the same tools and system prompt and read each other's
  cached prefix within its lifetime. Each child still pays one write of what differs (on a live check, about 19k
  tokens, roughly $0.10 on Opus 5.5). A child in an isolated worktree has a different working folder in its system
  prompt, so it shares nothing.
- **Cost roll-up.** The parent reads each child reply's usage (with its provider and model) from the child's event
  stream and adds it to the run's row, `Done (…)` line and background report, unpriced marker included. The `agent`
  tool result (foreground) and the report message (background, `details.usage`) carry the child's total usage, so
  the parent session's footer and `/sessions` count it too; a run that was stopped reports what it spent until then. A forked
  session's `/sessions` cost counts only what it spent since the fork (the parent paid for the copied history); the
  footer shows the whole branch.
- **No session file.** Children run with `--no-session` (unless they linger, see
  [`OCTOCODE_SUBAGENT_LINGER_SECONDS`](CONFIGURATION.md#environment-variables)), so their per-reply cache behaviour is visible only as the
  totals on the parent's row. A child still has an in-memory session id, so what it spills lands in that id's
  session folder, kept for the same `OCTOCODE_CLEANUP_DAYS` as the parent's output.

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

- Results are bounded when written (see [Spilled outputs](#spilled-outputs)). Later, only a cold cache clears old
  results (see [Cold-cache clearing](#cold-cache-clearing)), so a session that never idles that long reaches Pi's
  compaction threshold sooner and summaries happen more often.
- Octocode's summary calls do not use Pi's summarization retry policy or virtual-model routing (both private to Pi);
  a failure falls back to Pi's own summary, which does.
- The cache-sharing request replays only Octocode's own `context` transform (the cold-cache placeholders). Another
  extension's `context` or `before_provider_request` changes cannot be replayed, so with one the provider may find
  less cached prefix, which costs a cache miss and nothing else. The cache must still be warm: after the cache
  lifetime the request is billed as fresh input, like the standalone one.
- A split turn's prefix is summarized by Pi's turn-prefix prompt, without the handoff sections, only in the
  standalone fallback; the cache-sharing request summarizes everything before the cut in one pass.
- Pi caps the model's summary at 80% of `compaction.reserveTokens` (13,107 tokens by default) and drops one that hits
  the cap (then the standalone summary is tried, then Pi's); the user messages and the `<saved-results>` list are added
  by code after it, outside the cap.
- Idle warming only runs with Pi's `cacheWarming: "idle"`; with the default `"streaming"`, the 1-hour retention is
  what covers pauses.
- Amounts are list-price estimates.
- Prices come from Pi's built-in catalog (pi-ai's `providers/data/*.json`), and a catalog entry can be wrong or out of
  date; Octocode shows what it says. A `models.json` entry overrides it.
- Background reports saved before their usage was recorded count nothing (older sessions undercount them).
- The footer sums replies, tool results and subagent reports; usage Pi records separately (cache refreshes, compaction and branch
  summaries) counts in Pi's `/session` totals but not in the footer.

## Tests

| Test | Covers |
|---|---|
| `tests/compaction-shared-summary.test.ts` | the cache-sharing summary request (the session's projection, model, thinking and routing id plus one user message), cold-cache placeholders, Pi-shaped result with file lists and usage, the kept-messages boundary, the previous-summary note, every fallback case, the downshift and total-failure paths |
| `tests/compaction.test.ts`, `compaction-summary.test.ts`, `compaction-restore.test.ts` | file-tool paths added to Pi's file ops, the handoff instructions, user messages kept by code within budgets (skills as pointers), the transcript note, file lists carried from Octocode's summaries, files read back within budgets from the last range worked on, ranked by their original work and counted as read |
| `tests/compaction-saved-results.test.ts` | saved trim and cleared files named once in the summary, carried across compactions (also past a fallback summary), a long list spilled to a file, a job report's log and rotated part, a model-written block replaced |
| `tests/compaction-policy.test.ts` | idle continuation, no warming in headless runs, no context edits after a successful turn |
| `tests/compaction-clearing.test.ts` | cold-cache clearing: nothing while warm or below 20,000 tokens, the newest 5 kept, only re-fetchable tools, each result saved before it is cleared, byte-stable placeholders, the decision kept across a resume, the file guard forgetting cleared reads, a warmer refresh counting as cache use, notes of cleared results taking their placeholder |
| `tests/read-dedupe.test.ts` | a repeated unchanged read becomes a note; other range, changed text, compacted or cleared earlier result, errors and images keep the content; the guard still counts the note |
| `tests/compaction-cache.test.ts` | lifetimes, the registry supply, the granted tier, warming, retention |
| `tests/compaction-images.test.ts` | the staged `413` recovery (tool-result and user images), saved copies of stripped images |
| `tests/compaction-pacing.test.ts` | the thrash breaker, downshift compaction and its context estimate after a compaction |
| `tests/files.test.ts`, `elision.test.ts` | reads restored from the context; the `capChars`, spill, trim, restore-range and summary notes refused in file writes |
| `tests/sessions.test.ts`, `sessions-sweep.test.ts`, `bash.test.ts`, `hooks.test.ts`, `memory*.test.ts` | the running-work note and resume brief with `+N more` counts, one retention for spilled output and unlisted session folders, the session-end job report, the `compact` SessionStart source and spilled hook context, injected ids kept across a compaction, edited memories injected again |
| `tests/shared.test.ts`, `footer.test.ts`, `team-panel.test.ts`, `subagent-goal.test.ts` | the money and token formats, the unpriced marker and its one-time warning |
| `tests/agentdb.test.ts`, `subagent-tool.test.ts`, `sessions.test.ts` | missing schema added on open, nothing removed, the team and session usage columns, a child's cost roll-up and denied count, `/sessions` counting subagent usage and marking unpriced usage |
| `tests/permission-*.test.ts`, `subagent-permission.test.ts` | session grants, the kinds a child is handed |
| `tests/e2e.test.ts` › `compaction` | a real Pi session with a scripted provider: Octocode's summary on the session model with the user's `/compact` focus and the handoff sections, file lists that include `file` changes and carry across compactions, the user messages verbatim in the summary, files read back and changeable without a fresh read, the summary first in the next request, the cache-sharing request in the real session, the fallback through the standalone request to Pi's summary; › `keeps every tool result verbatim`: no context edits |

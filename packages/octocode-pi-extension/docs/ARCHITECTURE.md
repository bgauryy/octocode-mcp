# Architecture

How the extension is laid out, for contributors. Users start with the [README](../README.md).

```bash
yarn workspace @octocodeai/pi-extension build      # tsc → dist/, then the Pi entry (scripts/bundle-pi.mjs)
yarn workspace @octocodeai/pi-extension test       # unit + end-to-end (real Pi session, scripted model, stdio MCP servers)
yarn workspace @octocodeai/pi-extension lint
pi --no-extensions -e packages/octocode-pi-extension/dist/pi-entry.cjs -e builtin:mcp -e builtin:tool-search
```

Pi loads `dist/pi-entry.cjs`. Pi evaluates an extension's entry once per process and calls its factory again on every
`/reload`, and Node caches ES modules by URL, so loading `dist/index.js` directly kept running the first build until a
restart. The build bundles `dist/index.js` into `dist/pi/octocode-<content hash>.js` (dependencies external) and the
entry's factory imports whichever bundle `dist/pi/current` names: after `yarn build`, `/reload` runs the new code
(`tests/reload-entry.test.ts`). Subagents start fresh processes and load `dist/index.js`.

Source map: `src/index.ts` composes the features (each registers its own tools, hooks and commands), `src/turn.ts` sets each turn's active tools and prompt section, and `src/prompt.ts` is the prompt text; each folder is one domain and may depend only on the ones below it (enforced by `tests/architecture.test.ts`).

| Folder | Owns |
|---|---|
| `shared/` | Leaf helpers, one owner each: `util` (errors, caps, JSON parsing, content text, usage sums), `env` (flag and number parsing), `atomic` (crash-safe writes, SHA-256), `process` (liveness, process-tree kill), `home` (Octocode home and workspace paths, owner-only runtime folders, Pi's tool-path rule, repository root, the agent-state and per-session folders, output sweeping), `spill` (oversized results and images saved whole to the session's `output/` folder), `trust` (project-config trust), `package` (manifests, package root), `commands` (the `/octocode` subcommand router and `say`, command output that also reaches print and JSON modes; each subcommand holds the dialog lock), `locks` (the re-entrant per-tool lock, the one dialog queue every interaction holds so Pi never draws two dialogs at once, and the time a call spent in `tool_call` checks), `format`, `render` (shared tool presentation), `sanitize` (terminal escape and invisible-character stripping). |
| `files/` | The `file` tool (`tool`; its crash-safe writes are `shared/atomic`), edit checkpoints and `/octocode rewind` (`checkpoint`, with the on-disk journal and fork inheritance in `checkpoint-store`; retention is the sessions sweep), the change review that is `manual` mode's `file.workspace` dialog (`review`), the `bash` override with its deadline and background jobs (`bash`), and how the `bash` and `file` calls and results are drawn (`render`). |
| `permission/` | Permission modes (`mode`: the one action-class × mode table, the start mode from `OCTOCODE_PERMISSION` (else full), child grants, the footer chip), the one ask helper every confirmation goes through (`ask`: `Permission.check` with session grants, the default dialog, headless and subagent denial, the audit entries and mode-change notes), tool-call classification and the permission step of the `tool_call` pipeline (`gate`), the catastrophic-shell hard refusal and the shell parser (`shell`), the provenance tripwire (`provenance`), the editor-scoped Shift+Tab override that composes the current editor factory (`editor`), and `/octocode permission` (`command`). Hard refusals run before it; nothing here is a sandbox. |
| `agentdb/` | The local agent database `octocode.db` (`db`: open, owner-only files, one shared connection per process, repository keys, the secret screen; `liveness`: whether a Pi session's recorded process still runs) and its versioned schema (v1, the first published one; later changes append forward migrations) (`schema`: `sessions`, `backlog` (with `from_item`, the item it came from), `backlog_notes` (agent notes and store-written change entries), `memories`, `memories_fts`, `meta`, and the team tables `agents`, `messages`, `deliveries`, `leases`, `edits`). |
| `sessions/` | The session extras (`store`), its Pi wiring (`register`: extras rows, stats, resume brief), the `/sessions` picker (`command`), the resume brief (`brief`) and retention of session folders (`sweep`). |
| `backlog/` | The backlog store (`store`) and database-row mapping (`row`), the `backlog` tool (`tool`), `/octocode backlog` (`command`) and its TUI board (`board`), text and Markdown export (`format`), who is acting (`context`), and the footer status wiring (`index`). |
| `memory/` | The memory store with FTS5 / `LIKE` search and duplicate checks (`store`, `query`), the `memory` tool (`tool`), automatic injection (`inject`, wired in `register`) and `/octocode memory` (`command`). |
| `ask/` | The `askUser` tool (`tool`) and its dialog (`dialog`). |
| `mcp/` | The Octocode MCP client: `client.ts` runs one stdio server (connect, retry, reconnect, `list_changed`, process-tree close), `tools.ts` turns its tools and results into Pi tools (sanitized; oversized text and images spilled to files), `octocode.ts` owns launch config, ownership (`mcp.json`, `OCTOCODE_MCP`) and the session hooks, `command.ts` is `/octocode mcp`. |
| `web/` | The `web` tool (`web`) with URL fetching and caching (`fetch`), HTML-to-text (`html`), web search (`search`) and its private-address guard (`guard`). |
| `browser/` | The DevTools `browser` tool (`tool`, with its call and result rendering in `render`), the page snapshot and what changed since the last one (`snapshot`), mouse, keyboard, forms and waits (`input`), tabs and popups (`tabs`), dialog/upload/download (`actions`), per-page locale and download setup (`emulation`) and its protocol client (`cdp`, which also owns the abort error the browser files share). |
| `api/` | The external API (`bridge`): JSON-RPC 2.0 over a private Unix socket and optional loopback HTTP + SSE (`protocol`, `server`), instance discovery (`registry`), event replay (`events`), a client (`client`) and its command line (`cli`), and the Pi wiring with `/octocode api` (`register`). |
| `team/` | The team store on the agent database's team tables (`store`) and its record shapes (`model`), the recent-edits log (`edits`), this agent's own reservations and their idle lapse (`held`), routing and text (`routing`), agent names and goals, and a member's first record (`identity`), this process's membership (`session`), paced, batched delivery recorded when a model call includes it (`inbox`), injecting team mail and notices into Pi, holding an interrupt until the stopped run settles, and finding the mail in a model call's context (`mail`), the `coordinate` and `sendMessage` tools (`tools`), the one shared 1-second ticker that beats delivery and refreshes the watchers' view (`ticker`), and the agents panel (`panel`). |
| `subagents/` | Profile loading (`profiles`), model routing (`model`: a profile's or the call's model resolved against the parent's available models), child process spawning and bounded event parsing (`process`), incremental report storage with a bounded preview (`report`), handoff folders and batched background-report delivery (`handoff`), claiming a run slot, the child's identity and its task header (`claim`), the `agent` tool with background mode (`tool`), `/octocode agents` (`command`), how the `agent` call, its live progress and background reports are drawn (`render`), worktree isolation (`worktree`) and screenshot saving (`screenshots`). |
| `hooks/` | Optional Claude Code / Codex hooks: configuration (`config`), command runner (`runner`) and Pi event mapping (`register`). |
| `compaction/` | Context trims and `file` paths for Pi's summaries (`register`), the cost decision of when trims pay and idle-warming continuation (`policy`), prompt-cache lifetimes for models that declare none and the registry supply (`cache`), image budgets and request size (`images`), and the staged `413` recovery (`recovery`). Behaviour: [CONTEXT-AND-COST.md](CONTEXT-AND-COST.md). |
| `ui/` | The banner header, spinner, thinking label and `tok/s` status (`chrome`, `banner`), the two-line footer (`footer`), the working line and team activity (`activity`), the queued-message ledger installed on `pi.sendMessage` that survives Esc (`delivery`), and the answer-ready / waiting-for-you terminal notifications with focus reports and the title marker (`notify`). |
| root | `prompt.ts` (the system prompt section), `turn.ts` (active tools and prompt per turn) and `skills.ts` (extra skill directories). |

## Liveness: who is still running

Every "is it alive" question is answered by `processAlive` (`shared/process`, the only implementation) over a pid someone recorded. Where that pid lives depends on who must be able to read it and when. Each source below stays for the reason given; none duplicates another.

| Source | Answers | Why it is separate |
|---|---|---|
| `agents` table (`team/store`: one `agentGone` test, a stale heartbeat or a dead pid) | Is this team member, or the owner of a lease, running? | The team's own state, kept fresh by the 5 s heartbeat (a recycled pid does not keep a row alive). |
| `sessions.pid` (`agentdb/liveness`: `runningPid`) | Is this Pi session open in a process? Backlog claims, `/octocode sessions` and the sweep ask it. | A session has an `agents` row only after it joins the team, and most never do (joining is opt-in; it makes the session addressable and shows it in the panel). Backlog ownership and resume warnings need an answer for every session. |
| `OCTOCODE_PARENT_PID` (`team/session`) | Is my parent process alive, so should this subagent exit? | Passed in the environment; the parent may never have joined the team, and the check must not need the database. A change of `process.ppid` since load also counts as gone: the child was reparented, so a reused parent pid cannot keep it running. |
| API instance files (`api/registry`) | Which Octocode APIs are running on this machine? | The CLI discovers instances without SQLite, and `api/` depends only on `shared/`. |
| Worktree owner files (`subagents/worktree`) | May this isolated worktree be pruned? | Recovery has to work when the database is unusable. |
| Scratch owner files (`subagents/handoff`) | May this handoff folder be removed? | Keyed by a child id whose `agents` row has already disappeared. |
| `_pid-<n>` session folders (`sessions/sweep`) | Is the session-less process that made this folder gone? | Such a process has no session row and no team row; the folder name is its only record. |
| Chrome `SingletonLock` (`browser/launch`) | Does another Chrome own this profile? | Chrome's own record, not ours. |

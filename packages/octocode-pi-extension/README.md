# Octocode for Pi

Turn [Pi](https://pi.dev) into a research-driven coding agent. Octocode adds code research (local search, LSP, GitHub and package registries through [Octocode MCP](https://github.com/bgauryy/octocode)), subagents, a safer file tool, a per-repository backlog and memory, and a browser. It builds on Pi's own tools, MCP, sessions, compaction and UI instead of replacing them.

```bash
pi install npm:@octocodeai/pi-extension    # install for every session
pi -e npm:@octocodeai/pi-extension         # or try it once
```

Requires Pi 1.2 or later in the 1.x release line and Node.js 24.15+ (24.x).

## Contents

- [Built on the Octocode ecosystem](#built-on-the-octocode-ecosystem)
- [Quick start](#quick-start)
- [How Octocode extends Pi](#how-octocode-extends-pi)
- [Features](#features)
- [Tools the agent gets](#tools-the-agent-gets)
- [Commands](#commands)
- [Best practices](#best-practices)
- [Configuration](#configuration)
- [Documentation](#documentation)
- [Development](#development)

## Built on the Octocode ecosystem

Octocode for Pi is the Pi front end of the [Octocode](https://github.com/bgauryy/octocode) toolchain. The same research engine and skills also run in Claude Code, Codex and the `octocode` CLI, and Octocode keeps its config and state in one `.octocode` layout, so what you set up once carries across agents.

```
            Pi (tools, MCP, sessions, compaction, UI)
                          │
            Octocode for Pi extension
   ┌──────────────┼───────────────────┐
Octocode MCP     Octocode skills     .octocode home + workspace
(research)       (workflows)         (config and agent state)
```

| Part | What it is | How the extension uses it |
|---|---|---|
| **Octocode MCP** (`octocode-mcp`, bundled) | The research engine: local search and reading, structure and AST search, LSP, GitHub repo/code/PR/history search, packages | Run by the extension's own MCP client; its tools appear as `mcp__octocode__*`, and the prompt routes research to them. Override it with a server named `octocode` in Pi's `mcp.json`, or turn it off with `OCTOCODE_MCP=0`. |
| **Octocode skills** | Reusable workflows such as `octocode-research`, `octocode-architect`, `octocode-agents-communication`, `octocode-documentation`, and `octocode-chrome-devtools` | Loaded from `~/.octocode/skills` and, in trusted projects, `<repo>/.octocode/skills`, next to Pi's, Claude Code's and Codex's skill folders. Install one with `npx -y octocode skill install <name>`. |
| **Agent model** | The octocode-agents-communication model: agents, messages, deliveries and file leases | Backs `coordinate`, `sendMessage`, the `/agents` panel and subagent hand-offs. Inside a Pi team the agent uses `coordinate`, `sendMessage` and `agent`; the agents-communication tools are only for agents outside Pi (Claude Code, Codex, other hosts), and Pi honors their file locks. |
| **Subagent profiles** | Markdown profiles: bundled `implementer`, `researcher`, `reviewer`, `webHeadless`, `webLive` | Each sets a `model` purpose (`small`, `medium`) resolved among your models, or a model id (see [CONFIGURATION](docs/CONFIGURATION.md#subagent-profiles)). Add your own in `~/.octocode/agents/` or `<repo>/.octocode/agents/` (Pi's `~/.pi/agent/agents/` and `.pi/agents/` work too). |
| **Octocode home** (`~/.octocode`, `OCTOCODE_HOME`) | User config: `skills/`, `agents/`, `hooks.json`. Runtime state in `agent/pi/`: the agent database `octocode.db` (sessions, backlog, memory, team), per-session output, bash logs and checkpoints | One SQLite file shared by every Pi session on the machine, so the backlog, memory and team are visible across sessions and subagents. |
| **Workspace** (`<repo>/.octocode`) | Project config: `skills/`, `agents/`, `hooks.json` (trusted projects only), plus `tmp/` for subagent hand-off docs and `backlog.md` exports | Resolved from the repository root, so a session started in a subfolder sees the same files. |

See [CONFIGURATION.md](docs/CONFIGURATION.md#where-files-go) for every path and variable.

## Quick start

1. Install the extension and start Pi in a repository:

   ```bash
   pi install npm:@octocodeai/pi-extension
   cd my-repo && pi
   ```

2. Type `/octocode` to check the setup. It shows the version, the number of Octocode MCP tools, the subagent profiles, the loaded skills and whether hooks are on.

3. Ask a research question, for example `Where is the session token refreshed, and who calls it?` The agent searches with the `mcp__octocode__*` tools, reads only the lines it needs, and cites `path:line`.

4. For GitHub research, export a token before you start Pi (for example `GITHUB_TOKEN`). The Octocode MCP server inherits Pi's environment.

## How Octocode extends Pi

Octocode uses Pi's extension API and keeps Pi's behavior where Pi already does the job.

| Pi feature | What Octocode adds | Pi API used |
|---|---|---|
| MCP | Registers the Octocode research server: local code search, file reading, structure and AST search, LSP callers, references and types, GitHub repo, code, PR and history search, packages. Every tool is declared from the first request (no `tool_search` step), and results reach the model whole up to 60 KB per text part and 200,000 characters of MCP text per assistant message (longer text and images over 600 KB are saved to files, with the path in the result). `/octocode mcp` shows its state; other servers, `/mcp` and OAuth stay Pi's. | `registerTool`, `session_start`, `before_agent_start` |
| System prompt | A short `octocode` section: investigate before changing, verify for real, prefer Octocode MCP for research, when to delegate. Pi's tool list, `AGENTS.md` context and skills are unchanged. | `before_agent_start` prompt sections |
| `edit` / `write` | One `file` tool batches edits, writes and deletes, each with a reasoning line, on Pi's own edit and write engines. It refuses stale edits and writes atomically. It replaces `edit` and `write` once per session, unless you name them in `--tools` or `defaultTools`. | `createEditToolDefinition`, `createWriteToolDefinition` |
| `bash` | Pi's own bash with your `shellPath` and `shellCommandPrefix`, plus a 15-minute default deadline, background jobs and a flag on common destructive commands (a prompt in `manual` and `workspace`, a ⚠ line in the log in `full`; not a security boundary). | `createBashToolDefinition`, `tool_call` |
| Compaction | Octocode writes the summary with Pi's `compact()` on your model, adding verbatim user messages, errors and fixes, where work stopped, follow-ups and the transcript path, plus the files its `file` tool changed. After an idle gap longer than the prompt cache's life, old re-fetchable results are cleared (each saved to a file the placeholder names); a repeated read of an unchanged file returns a short note. | `session_before_compact` |
| Sessions | `/sessions` lists Pi's sessions with branch, estimated cost and files changed, and resumes them with a short brief. Pi's `/resume` and session names are untouched. | `SessionManager.list`, `switchSession` |
| Skills | Also loads skills from `~/.claude/skills`, `~/.codex/skills` and `~/.octocode/skills`, plus project skills in trusted projects. Claude.ai `synced/` skills under `~/.claude/skills` are skipped: they need connectors Pi does not have. | `resources_discover` |
| Project trust | Gates Claude Code and Codex hooks, project agent profiles and project skills behind `/octocode trust`, because Pi's trust covers only Pi's own files. | `isProjectTrusted` |
| UI | Octocode replaces Pi's header with the gradient "OCTOCODE CODE" banner (one light sweep at startup) and its footer with a two-line one (model, permission mode, thinking, context bar, running agents, background subagents, bash jobs, queued messages `✉ n queued`, `tok/s`, estimated cost `≈$2.28`; cwd, branch, session name, tokens `↑1.2M (94% cached) ↓35k`, other statuses; usage from a model without pricing in `models.json` shows `n/a` and warns once, never as free), and adds a gradient spinner, a `✻ Thinking…` label for hidden thinking, an `octocode · <dir>` title, a working line that names the running step, a desktop notification and title `●` when an answer is ready while the terminal is in the background, an agents panel while subagents run, one-at-a-time queueing for its dialogs, and compact renderers for its tools. | `setHeader`, `setFooter`, `setWorkingIndicator`, `setHiddenThinkingLabel`, `setStatus`, `setWorkingMessage`, `setWidget`, `setTitle`, `ui_prompt_start`, tool renderers |

## Features

Each feature has a full description in [docs/FEATURES.md](docs/FEATURES.md).

### Research and code

- **Octocode MCP**: every research tool the server registers (local search and reads, AST, LSP, GitHub, packages), named `mcp__octocode__*` and declared as the server describes it; `/octocode mcp` shows the server's state. Its instructions join the prompt whole.
- **`file` tool**: batched edit, write and delete with a reasoning line per change. A change to a file that moved on disk since the agent read it is refused until it reads the file again. Writes are atomic and keep the file mode.
- **Checkpoints**: before `file` changes a path, its bytes are saved. `/octocode rewind [turns]` restores files the agent changed, but never overwrites files you changed since.
- **Permission modes**: sessions start in `full`: nothing asks, and every action is recorded (`/octocode permission log`; the footer counts them as `full · 12 actions · 1 ⚠`, the ⚠ for destructive shell commands, browser control and private-address access). `workspace` runs work inside the repository and asks before leaving it, before destructive commands, private addresses and browser control, and before files that run in later sessions (git hooks, `.husky`, CI workflows, `.pi/`, `.claude/`, …); `manual` also asks before file changes, shell, web, browser, MCP writes and subagents (its `file` review has Apply all, Review one by one, or Reject all). Each prompt opens with the effect, how to undo it and why it asks. A hook's ask and a provenance hit ask in `manual` and `workspace` and run in `full`. Shift+Tab in the editor cycles full → workspace → manual; export `OCTOCODE_PERMISSION` to start elsewhere. Without a UI every ask is denied; a subagent's prompts are relayed to your session's UI. A short list of invariants refuses in every mode (the Octocode home, team reservations, stale reads, page requests to private addresses). Modes are not a sandbox: see [Permissions](docs/FEATURES.md#permissions).
- **Bash**: streaming output, a deadline, and `background: true` jobs whose exit status and log tail arrive later as a message. `/octocode jobs` lists and stops them.

### Delegation and teamwork

- **Subagents**: the `agent` tool runs a task in a fresh Pi process, up to 3 at once (more calls wait for a slot). Each call states a `goal` label (about 48 characters show); the agent gets a short name such as `inky-kraken`, shown with its role and goal in the panel, `/agents` and its reports. Bundled profiles: `researcher`, `reviewer`, `implementer`, `webHeadless` and `webLive`. Coding profiles (`implementer`, `reviewer`) prefer Sonnet and exploration profiles (`researcher`, `webHeadless`, `webLive`) prefer Haiku; a profile's `model` that your providers do not offer falls back to the parent's model. A report starts with an outcome word (`done`, `partial`, `blocked` or `failed`) that the row and the background header show.
- **Background subagents**: `background: true` returns at once. The report arrives as a message when the subagent finishes, so the agent never polls.
- **Isolation**: `isolate: true` runs a subagent in a private git worktree and commits its changes to `refs/octocode/pi/<name>`. `/agents merge <name>` merges them.
- **Team**: agents in one repository see each other with `coordinate`, reserve files before editing, and message each other with `sendMessage`. An idle agent wakes only for a message that needs a reply. `file`, `edit` and `write` are also refused on a path that an agent in another tool holds in the agents-communication database (read-only for Pi). Lock keys fold case by Unicode rules, so `Straße.ts` and `STRASSE.ts` are one file.

### Backlog, memory and sessions

- **Backlog**: a task board per repository (`backlog` → `todo` → `ongoing` → `done`). The agent tracks work that outlives a turn, links splits and follow-ups to the item they came from, and every change is logged. An item carries a goal (done-when; the agent must give one), where, why, evidence and a plan; `/backlog` opens the board and `/backlog do <id>` hands an item to the agent.
- **Memory**: durable notes (preferences, facts, decisions, gotchas, procedures) per repository or global, with full-text search. Relevant notes are injected before each prompt, labelled as data.
- **Session resume**: `/sessions` lists this repository's sessions. Resuming one adds a brief when the branch moved, backlog items are ongoing (each shown with its goal and paths), or you were away over an hour.

### Working in the TUI

- **Working line**: names the current step: `Waiting for model` (once the first token takes over 2 s), `Thinking: <the latest finished sentence of its thinking>`, `Writing`, `Running bash yarn test`, `Running localSearch useState in src +2`, `Running agent <goal>`, `Running 5 tools: bash · web ×2 +2`, `Checking bash …` while pre-run checks and PreToolUse hooks run, or `Waiting for you: <question>` during a dialog. After 2 s it adds the elapsed time; the line stays within 70 columns. The agents panel shows the same line as the agent's activity, so a subagent's thinking is visible there too, and a running `agent` row lists its latest steps: tool calls (`→ read a.ts`), the gist of each thought (`✻ …`), its narration (`› …`) and what it is thinking now.
- **Parallel tool calls**: tools batched in one message run in parallel. `file`, `browser`, `memory` and `backlog` keep their own calls in order with a per-tool lock and `askUser` waits in the shared dialog queue, so MCP searches and bash in the same batch never wait behind them.
- **One dialog at a time**: Pi shows one extension dialog at a time, and a second one would leave the first unanswered forever ([pi#6978](https://github.com/earendil-works/pi/issues/6978)). Octocode queues every dialog it opens (`askUser`, permission asks including the file review, trust confirms, `/octocode` pickers). The working line shows `(+N queued)` while others wait, and a cancelled call leaves the queue.
- **Wait times in tool rows**: a row shows `waiting` until its checks, approval or lock end. The newest running row shows a live clock that matches its final run time; older running rows show none (the working line has the elapsed time). A row whose call waited more than 250 ms before it ran shows `checks 1.2s` (its own reservation, shell-guard, PreToolUse and permission checks) or `queued 2.0s` (other calls' checks or the tool's lock), next to its run time. Collapsed, a batched call lists 3 queries, then `+N more`.
- **Queued messages survive Esc**: messages that arrive while the agent works (subagent reports, background bash reports, teammate messages) show as `✉ n queued`. Pi's Esc clears its queue but restores only your typed text, so Octocode adds the cleared messages back to the conversation without starting a turn and says so. This applies in the TUI only.
- **Answer-ready notifications**: when an answer finishes or the agent opens a dialog during a run while the terminal is in the background, Octocode sends a desktop notification and puts `●` in the terminal title until you return.
  - It sends OSC 9 for iTerm2, OSC 777 for Ghostty and WezTerm, OSC 99 for Kitty and the bell elsewhere, wrapped for tmux.
  - It knows the terminal is in the background from the terminal's focus reports. In fullscreen mode it uses idle time instead: a run of at least 30 s with no key pressed for 30 s.
  - Subagents, aborted runs and print, JSON and RPC modes never send these terminal signals.
  - Set `OCTOCODE_NOTIFY=always` to notify while focused, or `off` to never notify.

### Web

- **`web`**: fetches a page as readable text, or searches the web (Tavily, Serper, Exa or Brave with an API key; DuckDuckGo and Bing without). A private, loopback or cloud-metadata address is a `net.private` ask.
- **`browser`**: drives Chrome over DevTools for JavaScript pages, forms, uploads and screenshots. The main session hands it to the `webHeadless` / `webLive` subagents instead of paying its schema on every request (name it in `--tools` to keep it). Every request a page makes is checked: one to a private address is refused without a prompt. Private targets the agent chooses, script evaluation and uploads ask first (see [Permissions](docs/FEATURES.md#permissions)). It never attaches to your Chrome unless you opt in.

### Integrations

- **Hooks** (opt-in): with `OCTOCODE_HOOKS=1`, Claude Code and Codex command hooks run on Pi events (`PreToolUse`, `PostToolUse`, `SessionStart`, `PreCompact`, `Stop`, `Notification`). Existing Claude hooks work unchanged.
  - **Blocking:** `PreToolUse` can block a call. A `Stop` hook that returns `{"decision":"block","reason":…}` continues the finished run with that reason. As in Claude Code, it gets `stop_hook_active` and is capped at 8 continuations in a row.
  - **Notification:** `Notification` hooks fire on `permission_prompt`, `elicitation_dialog` and `idle_prompt`, the first two only for dialogs the agent opens during a run; also in RPC mode. They run in the background and never block.
  - **Running:** matching hooks run in parallel, and a hook listed in several files runs once. Hook context over 16 KB is saved whole to a file, not truncated; the context gets its head, tail and path.
  - **Timing:** Pi checks every call of a batch before any of them runs, so a slow `PreToolUse` hook holds up the whole batch. A hook over 5 s is reported once, and `/hooks` shows each command's run count, average and slowest time.
- **External API** (opt-in): with `OCTOCODE_API=1`, other programs message the session and follow its events over JSON-RPC. `tool.start` and `tool.end` events carry `depth` (0 for the agent's own calls) and, for calls made by another tool, `parentId`. `tool.end` also carries `durationMs`. `octocode-pi-api watch --top-level` drops the nested calls. See [docs/API.md](docs/API.md).
- **`askUser`**: the agent asks related questions, with choices or free text, in an inline dialog when a choice depends on you.

## Tools the agent gets

| Tool | Purpose |
|---|---|
| `read` | Pi's read tool, unchanged |
| `bash` | Shell commands, with a deadline and background jobs |
| `file` | Batched edit, write and delete |
| `mcp__octocode__*` | Code, LSP, GitHub and package research |
| `web` | Fetch a URL or search the web |
| `browser` | Drive Chrome over DevTools |
| `agent` | Run a subagent |
| `coordinate` | List agents, reserve files, see recent changes |
| `sendMessage` | Message another agent |
| `backlog` | Track repository tasks |
| `memory` | Search and save durable notes |
| `askUser` | Ask you questions, with choices or free text |

Subagents get a reduced set: no `agent` or `askUser`, and each profile drops what it doesn't need. For example, `researcher` and `reviewer` have no `file`.

## Commands

Everything lives under `/octocode`; tab completes subcommands. `/agents`, `/sessions`, `/backlog`, `/memory` and `/hooks` are shortcuts. `/mcp` is Pi's own MCP command for your other servers.

| Command | Does |
|---|---|
| `/octocode [status]` | Status: version, Octocode MCP tools, profiles, skills, hooks |
| `/octocode help` | List subcommands, their arguments and available shortcuts |
| `/octocode models` | The models you can use (price, window, abilities, from Pi and models.dev) and which one each subagent purpose and profile runs on |
| `/octocode mcp [restart]` | Show the Octocode MCP server's state, version, tool count and process, or restart it |
| `/octocode rewind [turns]` | Undo the `file` changes of the last turns (default 1) |
| `/octocode permission [manual\|workspace\|full\|grants [clear]\|log]` | Show or set the permission mode (Shift+Tab in the editor cycles), list or clear session grants, show recent decisions |
| `/octocode jobs [kill <id>]` | List or stop background bash jobs |
| `/octocode trust [off]` | Review and trust this project's hooks, agent profiles and skills |
| `/octocode api [on [http] \| off]` | Start or stop the external API |
| `/agents [tell <id\|all> <text> \| kill <id> \| merge <id>]` | List the team, message agents, stop or merge a subagent (shortcut for `/octocode agents`) |
| `/sessions [all \| <words>]` | Find and resume sessions |
| `/backlog [add <title> \| <id> [state] \| do <id> \| export]` | Open, edit or work the board |
| `/memory [search <words> \| add [title] \| auto on\|off \| last]` | Browse, search and add memories |
| `/hooks` | Loaded hooks, the files to edit, and each hook's runs, average and slowest time |

Shift+Tab in the main editor cycles `full` → `workspace` → `manual` → `full`; the footer shows the mode and shortcut. Octocode uses Pi's custom-editor API because Pi reserves that key for thinking. Use `/thinking <level>` for thinking, or assign `app.thinking.cycle` another key in Pi's `keybindings.json`. Pi's `/hotkeys` still lists its configured thinking binding; `/octocode help` and the footer describe the Octocode override. Tab completion and dialog keys keep their usual behavior.

Without a UI (print or JSON mode), these commands write text to stderr instead of opening a picker.

## Best practices

**Ask for evidence, not guesses.** Phrase research as a question about the code ("who calls X?", "why does Y fail?"). The agent searches with Octocode MCP and reads only the lines it needs. Before a change to shared code, ask it to confirm callers with `lspSearch`.

**Delegate wide work, keep narrow work.** Ask for parallel subagents when the work splits cleanly: one per module to review, or research next to implementation. Small sequential edits are faster in the main session. Ask for `isolate: true` when a subagent's edits might collide with yours.

**Let background work come back to you.** Long builds belong in `bash` background jobs and long tasks in background subagents. Results arrive as messages; nothing needs polling.

**Keep the backlog for follow-ups.** Say "add a backlog item to…" for work you discover and leave for later. Use `/backlog do <id>` to start one later in any session.

**Teach it once with memory.** Say "remember that we use pnpm" or "never edit generated files" and it saves a memory that is injected in later sessions. Store where a secret lives, never the secret itself; credential-like text is refused.

**Review risky edits.** Use `manual` mode (Shift+Tab in the editor, or `/octocode permission manual`) in unfamiliar repositories, and `/octocode rewind` to undo a turn's `file` changes. Run untrusted work in a container: modes are not a sandbox.

**Trust deliberately.** Run `/octocode trust` only after reading what it lists: project hooks run commands with your permissions.

**Split dependent steps.** Calls in one message run in parallel, so put an edit and the test that checks it in separate messages. Keep `PreToolUse` hooks fast: each one delays every call in its batch. A row's `checks Ns` shows how long.

**Keep the context lean.** Prefer `web` for static pages and `browser` only for JavaScript or interaction. Use the `webHeadless` profile for multi-page browsing so screenshots and snapshots stay out of the main context.

## Configuration

Most users need nothing. Common settings:

| Variable | Effect |
|---|---|
| `GITHUB_TOKEN` | GitHub access for Octocode MCP |
| `OCTOCODE_HOOKS=1` | Run Claude Code and Codex hooks |
| `OCTOCODE_PERMISSION=manual\|workspace\|full` | Start mode (default `full`) |
| `OCTOCODE_NOTIFY=off\|always` | Answer-ready notifications (default: only when the terminal is in the background) |
| `OCTOCODE_NOTIFY_METHOD=osc9\|osc777\|osc99\|bel` | Force a notification method (default: picked from the terminal) |
| `OCTOCODE_API=1` | Serve the external JSON-RPC API on a Unix socket |
| `OCTOCODE_MAX_SUBAGENTS` | Subagents allowed at once (default 3) |
| `OCTOCODE_MCP=0` | Don't start the Octocode MCP server |
| `TAVILY_API_KEY`, `SERPER_API_KEY`, `EXA_API_KEY`, `BRAVE_API_KEY` | Web search providers |
| `OCTOCODE_HOME` | Where Octocode keeps config and state (default `~/.octocode`) |

Other MCP servers are configured with Pi: `pi mcp add`, `~/.pi/agent/mcp.json` or `.pi/mcp.json`. A server named `octocode` there overrides the bundled one. The Octocode tools don't need Pi's MCP; with `pi --no-extensions`, add `-e builtin:mcp -e builtin:tool-search` only to keep your other servers and tool search.

Every variable, file location, trust rule, hook and profile format is in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Documentation

| Page | Covers |
|---|---|
| [docs/FEATURES.md](docs/FEATURES.md) | Detailed behavior of every feature |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Environment variables, file locations, trust, hooks, subagent profiles, MCP, retention |
| [docs/API.md](docs/API.md) | External JSON-RPC API and the `octocode-pi-api` command |
| [docs/CONTEXT-AND-COST.md](docs/CONTEXT-AND-COST.md) | Compaction, cold-cache clearing and repeated reads, prompt cache retention and warming, pricing and the usage display, subagents, known limits |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Source layout, for contributors |

## Development

```bash
yarn workspace @octocodeai/pi-extension build   # tsc → dist/, then the Pi entry
yarn workspace @octocodeai/pi-extension test    # unit and end-to-end tests
pi --no-extensions -e packages/octocode-pi-extension/dist/pi-entry.cjs -e builtin:mcp -e builtin:tool-search
```

After `yarn build`, `/reload` in a running Pi loads the new code (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). A Pi
started before this change loaded `dist/index.js` directly and needs one restart.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the source layout.

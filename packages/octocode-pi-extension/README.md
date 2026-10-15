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
| **Workspace** (`<repo>/.octocode`) | Project config: `skills/`, `agents/`, `hooks.json` (trusted projects only), plus `tmp/` for subagent hand-off docs and `backlog.md` / `backlog.html` exports | Resolved from the repository root, so a session started in a subfolder sees the same files. |

See [CONFIGURATION.md](docs/CONFIGURATION.md#where-files-go) for every path and variable.

## Quick start

1. Install the extension and start Pi in a repository:

   ```bash
   pi install npm:@octocodeai/pi-extension
   cd my-repo && pi
   ```

2. Type `/octocode` to check the setup. It shows the version, the number of Octocode MCP tools, the subagent profiles, the loaded skills and whether hooks are on.

3. Ask a research question, for example `Where is the session token refreshed, and who calls it?` The agent searches with the `mcp__octocode__*` tools, reads only the lines it needs, and cites `path:line`.

4. For GitHub research, sign in with `gh auth login` or export `GITHUB_TOKEN` before you start Pi; the Octocode MCP server inherits Pi's environment. See [Octocode authentication](https://github.com/bgauryy/octocode/blob/main/docs/AUTHENTICATION.md).

## How Octocode extends Pi

Octocode uses Pi's extension API and keeps Pi's behavior where Pi already does the job.

| Pi feature | What Octocode adds | Pi API used |
|---|---|---|
| MCP | Registers the Octocode research server's tools from the first request (no `tool_search` step). Results reach the model whole within a per-part and per-message budget; anything longer is saved to a file the result names ([Spilled outputs](docs/CONTEXT-AND-COST.md#spilled-outputs)). `/octocode mcp` shows its state; other servers, `/mcp` and OAuth stay Pi's. | `registerTool`, `session_start`, `before_agent_start` |
| System prompt | A short `octocode` section: investigate before changing, verify for real, prefer Octocode MCP for research, when to delegate. Pi's tool list, `AGENTS.md` context and skills are unchanged. | `before_agent_start` prompt sections |
| `edit` / `write` | One `file` tool batches edits, writes and deletes, each with a reasoning line, on Pi's own edit and write engines. It refuses stale edits and writes atomically. It replaces `edit` and `write` once per session, unless you name them in `--tools` or `defaultTools`. | `createEditToolDefinition`, `createWriteToolDefinition` |
| `bash` | Pi's own bash with your `shellPath` and `shellCommandPrefix`, plus a 15-minute default deadline, background jobs and a flag on common destructive commands (a prompt in `manual` and `workspace`, a ⚠ line in the log in `full`; not a security boundary). | `createBashToolDefinition`, `tool_call` |
| Compaction | Octocode writes the summary with Pi's `compact()` on your model, adding verbatim user messages, errors and fixes, where work stopped, follow-ups and the transcript path, plus the files its `file` tool changed. After an idle gap longer than the prompt cache's life, old re-fetchable results are cleared (each saved to a file the placeholder names); a repeated read of an unchanged file returns a short note. | `session_before_compact` |
| Sessions | `/sessions` lists Pi's sessions with branch, estimated cost and files changed, and resumes them with a short brief. Pi's `/resume` and session names are untouched. | `SessionManager.list`, `switchSession` |
| Skills | Also loads skills from `~/.claude/skills`, `~/.codex/skills` and `~/.octocode/skills`, plus project skills in trusted projects. Claude.ai `synced/` skills under `~/.claude/skills` are skipped: they need connectors Pi does not have. | `resources_discover` |
| Project trust | Gates Claude Code and Codex hooks, project agent profiles and project skills behind `/octocode trust`, because Pi's trust covers only Pi's own files. | `isProjectTrusted` |
| UI | A banner header, a two-line footer (model, permission mode, context, agents, jobs, tokens, estimated cost), a working line that names the running step, an agents panel, answer-ready notifications, one-at-a-time dialogs and compact tool renderers. See [UI](docs/FEATURES.md#ui). | `setHeader`, `setFooter`, `setWorkingIndicator`, `setHiddenThinkingLabel`, `setStatus`, `setWorkingMessage`, `setWidget`, `setTitle`, `ui_prompt_start`, tool renderers |

## Features

Each feature has a full description in [docs/FEATURES.md](docs/FEATURES.md).

### Research and code

- **Octocode MCP**: every research tool the server lists, named `mcp__octocode__*`, with the server's instructions in the prompt. See [MCP](docs/CONFIGURATION.md#mcp).
- **`file` tool**: batched edit, write and delete with a reasoning line per change. A change to a file that changed on disk since the agent read it is refused until it reads the file again. Writes are atomic and keep the file mode.
- **Checkpoints**: `/octocode rewind [turns]` restores files the agent changed, never files you changed since.
- **Permission modes**: `full` (the default: nothing asks, every action is recorded), `workspace` (asks before leaving the repository and before destructive or persistent actions) and `manual` (also asks before file changes, shell, web, browser, MCP writes and subagents). Shift+Tab in the editor cycles them; `OCTOCODE_PERMISSION` sets the start mode. A short list of invariants refuses in every mode. Modes are not a sandbox: see [Permissions](docs/FEATURES.md#permissions).
- **Bash**: streaming output, a deadline, and `background: true` jobs whose result arrives later as a message. `/octocode jobs` lists and stops them.

### Delegation and teamwork

- **Subagents**: the `agent` tool runs a task in a fresh Pi process, a few at once. Each run gets a short name (`inky-kraken`), its profile as role and the call's `goal`, shown in `/agents` and its report; the panel under the editor shows each run's name, goal, model, elapsed time and tokens (with the cached share). Bundled profiles: `researcher`, `reviewer`, `implementer`, `webHeadless` and `webLive`; each names a model purpose (`small` or `medium`) resolved among your models. A report starts with an outcome word (`done`, `partial`, `blocked` or `failed`).
- **Background subagents**: `background: true` returns at once; the report arrives as a message, so the agent never polls.
- **Isolation**: `isolate: true` runs a subagent in a private git worktree and commits its changes to `refs/octocode/pi/<name>`; `/agents merge <name>` merges them.
- **Team**: agents in one repository see each other with `coordinate`, reserve files before editing, and message each other with `sendMessage`. `file`, `edit` and `write` also honor file locks that agents in other tools hold through octocode-agents-communication.

### Backlog, memory and sessions

- **Backlog**: a task board per repository (`backlog` → `todo` → `ongoing` → `done`) for work that outlives a turn. `/backlog` opens it; `/backlog do <id>` hands an item to the agent.
- **Memory**: durable notes per repository or global, with full-text search. Relevant notes are injected before each prompt, labelled as data.
- **Session resume**: `/sessions` lists this repository's sessions and resumes one with a short brief of what changed.

### Working in the TUI

The working line names the running step, tool rows show their wait and run times, dialogs queue one at a time, queued messages survive Esc, and a desktop notification fires when an answer is ready while the terminal is in the background. Tools batched in one message run in parallel; `file`, `browser`, `memory` and `backlog` keep their own calls in order. See [UI](docs/FEATURES.md#ui).

### Web

- **`web`**: fetches a page as readable text, or searches the web (API providers with a key, keyless pages otherwise).
- **`browser`**: drives Chrome over DevTools for JavaScript pages, forms, uploads and screenshots. The main session leaves it to the `webHeadless` and `webLive` subagents unless you name it in `--tools`. Requests to private addresses are checked; see [Web and browser](docs/FEATURES.md#web-and-browser).

### Integrations

- **Hooks** (opt-in, `OCTOCODE_HOOKS=1`): Claude Code and Codex command hooks run on Pi events. See [Hooks](docs/FEATURES.md#hooks-opt-in).
- **External agents**: `externalAgent` connects to another Pi session or an ACP adapter. See [API.md](docs/API.md#connect-to-external-agents).
- **External API** (opt-in, `OCTOCODE_API=1`): other programs message the session and follow its events over JSON-RPC. See [API.md](docs/API.md).
- **`askUser`**: the agent asks related questions, with choices or free text, when a decision depends on you.

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
| `/octocode external <JSON>` | Discover, connect, prompt, cancel or disconnect external agents |
| `/octocode api [on [http] \| off]` | Start or stop the external API |
| `/agents [tell <id\|all> <text> \| interrupt <id> <text> \| kill <id> \| merge <id>]` | List the team, message or redirect agents, stop or merge a subagent (shortcut for `/octocode agents`) |
| `/sessions [all \| <words>]` | Find and resume sessions |
| `/backlog [add <title> \| <id> [state] \| do <id> \| export \| html]` | Open, edit or work the board; `html` opens it as a page in your browser |
| `/memory [search <words> \| add [title] \| auto on\|off \| last]` | Browse, search and add memories |
| `/hooks` | Loaded hooks, the files to edit, and each hook's runs, average and slowest time |

Shift+Tab in the main editor cycles the permission mode instead of Pi's thinking level; use `/thinking <level>`, or bind `app.thinking.cycle` to another key in Pi's `keybindings.json`.

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

Most users need nothing. The variables people set most are `OCTOCODE_PERMISSION` (start mode), `OCTOCODE_HOOKS=1`, `OCTOCODE_API=1`, `OCTOCODE_MCP=0`, `OCTOCODE_MAX_SUBAGENTS`, `OCTOCODE_NOTIFY` and the web search keys. Every variable, file location, trust rule, hook and profile format is in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

Other MCP servers are configured with Pi (`pi mcp add`, `~/.pi/agent/mcp.json` or `.pi/mcp.json`); a server named `octocode` there overrides the bundled one.

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

After `yarn build`, `/reload` in a running Pi loads the new code. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the source layout.

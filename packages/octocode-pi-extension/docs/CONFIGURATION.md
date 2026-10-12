# Configuration

Where Octocode reads config and writes state, what it trusts, and every environment variable. See the [README](../README.md) for an overview and [FEATURES.md](FEATURES.md) for behavior.

## Where files go

`.octocode` is the one place Octocode reads its own config and saves things, at two levels: the Octocode home (`OCTOCODE_HOME`, default `~/.octocode`: `skills/`, `agents/`, `hooks.json`, runtime state) and the workspace `<repo root>/.octocode` (`skills/`, `agents/`, `hooks.json`, trusted projects only; `tmp/` scratch for agent hand-offs). Workspace paths resolve from the repository root, so a session started in a subfolder reads the same files. Everything the extension writes at runtime lives under the workspace or the Octocode home (`OCTOCODE_HOME`, default `~/.octocode`). Per-session state lives in `agent/pi/`: the agent database `octocode.db` (session index, backlog, memories, team tables; `OCTOCODE_AGENT_DB` moves it; its schema migrates forward, and a database a newer extension migrated is refused by an older one, whose team then shows `team off` until it is updated) and one folder per session, `sessions/<session id>/`, holding the full text of oversized `web`, `browser` and bash results and `browser download` files (`output/`, downloads in `output/downloads/`; readable by the Octocode MCP tools even when `OCTOCODE_HOME` is outside the home directory), bash job logs and truncated bash output (`bash/`), and edit checkpoints (`checkpoints/`); output written before a session id is known goes to `sessions/_pid-<pid>/`. The rest: browser profiles (`pi-browser/` temporary, `pi-browser-profile/` for `webLive`), subagent screenshots (`pi-team/shots/`), worktrees (`pi-worktrees/`), and API records (`pi-api/`); `/octocode backlog export` writes `<repo>/.octocode/backlog.md`. The one exception is an API Unix socket whose path under the home would exceed the OS limit of about 100 bytes: it falls back to the private temp directory.

## Environment variables

| Variable | Effect |
|----------|--------|
| `OCTOCODE_HOME` | The Octocode home (default `~/.octocode`): user config (`skills/`, `agents/`, `hooks.json`) and everything the extension writes at runtime |
| `OCTOCODE_AGENT_DB` | Agent database path: session extras, backlog, memories and team tables (default `<Octocode home>/agent/pi/octocode.db`) |
| `PI_CACHE_RETENTION` | Pi's prompt-cache retention. Unset, Octocode sets `long` (1-hour Anthropic cache entries) for an interactive session and `short` (5 minutes) for headless runs and subagents, at session start. A value you export always wins, in subagents too. A 1-hour write costs 2× input instead of 1.25×; measured sessions spent 55% of their cache-write cost on entries that expired after 5 to 60 minutes idle. See [Prompt cache](CONTEXT-AND-COST.md#prompt-cache) |
| `OCTOCODE_CLEANUP_DAYS` | Days spilled output, bash logs, idle checkpoints and subagent screenshots are kept (default 30); `0` turns the session sweep off |
| `OCTOCODE_MEMORY_AUTO=0` | Do not inject memories before prompts in this process (`/octocode memory auto off` turns it off everywhere) |
| `OCTOCODE_EXTRA_SKILLS=0` | Skip the extra skill directories (`~/.claude/skills` without its claude.ai `synced/` folder, `~/.codex/skills`, `<Octocode home>/skills`, project `.claude/skills` and `.octocode/skills`) |
| `TAVILY_API_KEY` / `SERPER_API_KEY` / `EXA_API_KEY` / `BRAVE_API_KEY` | Web search providers, tried in this order before the keyless pages (DuckDuckGo, then Bing, then DuckDuckGo lite); every provider passes to the next when it fails or finds nothing |
| `OCTOCODE_WEB_LANGUAGE` | Accept-Language that `web` sends (default `en-US,en;q=0.9`) |
| `OCTOCODE_BROWSER_LOCALE` / `OCTOCODE_BROWSER_TIMEZONE` | Pin the browser's language (for example `en-US`: `navigator.language`, `Intl` formatting, Accept-Language) and time zone (for example `America/New_York`). Sites that price by IP address still answer for the machine's location |
| `OCTOCODE_CHROME_PORT` | Opt in to sharing an open Chrome: the browser tool opens (and later closes) its own tab on this remote-debugging port. Unset, it never attaches on its own; a headless Chrome is launched when nothing listens |
| `OCTOCODE_BROWSER_HEADLESS=0` | Show the launched Chrome window (temporary profile) |
| `OCTOCODE_BROWSER_VISIBLE=1` | Visible Chrome on the persistent profile `<Octocode home>/pi-browser-profile/` (set by `webLive`) |
| `OCTOCODE_API` | `1` serves the [External API](API.md) on a Unix socket (off) |
| `OCTOCODE_API_HTTP` | Also serve the API over loopback HTTP on this port (`0` = any free port) |
| `OCTOCODE_API_DIR` | API instance-record directory (default `<Octocode home>/pi-api`) |
| `OCTOCODE_MCP=0` | Do not start the Octocode server (set for profiles with `mcp: false`) |
| `OCTOCODE_MCP_WAIT_SECONDS` | The longest the first prompt waits for the Octocode server to connect, so its instructions are in the first request (default `10`; `0` = no wait). It bounds the real connect: a failure ends the wait at once |
| `OCTOCODE_BASH_TIMEOUT` | Longest wait for a foreground bash command, in seconds (default `900`) |
| `OCTOCODE_SUBAGENT_LINGER_SECONDS` | Seconds a finished background subagent stays reachable (default `0`: off). While it lingers, its conversation is saved in its scratch folder (`session/`), and a `sendMessage` from its parent (or `/agents tell` from you) resumes that conversation as a new background run under the same name and goal, reporting again; `coordinate stop <name>` ends the window. Not for isolated runs (their worktree is gone) |
| `OCTOCODE_MAX_SUBAGENTS` | Subagents allowed to run at once, foreground and background together (default `3`) |
| `OCTOCODE_SUBAGENT_COLLABORATE` | `1` makes `agent` calls collaborate by default (off) |
| `OCTOCODE_SUBAGENT_IDLE_MINUTES` | Stop a subagent that emits no output for this many minutes while its model generates (default `10`; `0` = never). A running tool or the settle after its answer gets 15 more minutes |
| `OCTOCODE_SUBAGENT_MAX_MINUTES` | Wall-clock limit for one subagent run, in minutes (default `0` = none) |
| `OCTOCODE_LEASE_IDLE_MINUTES` | Minutes an idle session keeps renewing its file reservations (default `30`; `0` = until it ends) |
| `OCTOCODE_TEAM_WORKSPACE` | Absolute path used as the team scope instead of the git root (set for isolated worktree subagents) |
| `OCTOCODE_HOOKS` | `1` runs Claude Code / Codex command hooks (off) |
| `OCTOCODE_PERMISSION` | The [permission mode](FEATURES.md#permissions) a session starts in: `manual`, `workspace` or `full` (default: `full`, no routine asks). An invalid value starts in `manual` with a warning. Without a UI every ask is denied, so this is how a print or CI run allows what it needs. In a subagent the parent sets it from its own current mode |
| `OCTOCODE_PERMISSION_GRANTS` | Set by the parent in a subagent only: the kinds the user allowed for the parent's session ("Allow all … for this session") plus the workspace action classes (`file.workspace`, `shell`) its `agent` spawn was allowed in `manual` mode. Tripwire kinds (`provenance`, `hook.ask`) and unknown names in it are ignored |
| `OCTOCODE_NOTIFY` | When to signal a finished answer or an open dialog: `unfocused` (default: only while the terminal is in the background), `always` or `off` |
| `OCTOCODE_NOTIFY_METHOD` | `osc9`, `osc777`, `osc99` or `bel` (default: picked from the terminal: OSC 99 for Kitty, OSC 9 for iTerm2, OSC 777 for Ghostty and WezTerm, else the bell; wrapped for tmux) |
| `OCTOCODE_WEB_ALLOW_PRIVATE=1` | Let `web` fetch, and `browser` open without asking (in every permission mode), loopback, private and link-local addresses (blocked by default) |

## Trust

Project hooks (`.claude/settings.json`, `.claude/settings.local.json`, `.codex/hooks.json`, `.octocode/hooks.json`), subagent profiles (`.pi/agents`, `.octocode/agents`) and skills (`.claude/skills`, `.octocode/skills`) can start commands or steer the agent, so they need an explicit trust decision. Project MCP files are Pi's (`.pi/mcp.json`) and gated by Pi's own trust. Pi's own trust is not enough on its own: Pi only asks when a project holds Pi resources (`.pi/settings.json`, `.pi/extensions`, `.agents/skills`, …) and otherwise reports it trusted. So these files load only after `/octocode trust`, which lists exactly what would run (every hook command, never cut; agent and skill files, the skill files being every file Pi's skill loader reads: root `.md` files, a root `SKILL.md` and `SKILL.md` at any depth), asks, and reloads. The listing is fingerprinted before the dialog; if the files change while it is open, it asks again about the new content. When Pi itself resolved trust for such a project (or a saved `/trust` applies) and Octocode has no decision yet, the gated files present at that point (possibly none) are recorded as trusted without a dialog, except hook files that hold commands: those wait for `/octocode trust`, which shows them. Either way the decision is stored in `<Octocode home>/pi-trust.json` (`0600`), one per repository root (so it holds in any subfolder and through symlinked paths), with a SHA-256 of those files, so any change to them (such as a later-pulled hook file) needs `/octocode trust` again, in a Pi-trusted project too; `/octocode trust off` withdraws it, also in a Pi-trusted project. The fingerprint covers the gated config files themselves (hook JSON, agent `.md` files, skill files), not the scripts or binaries their commands run: a later change to, say, `./scripts/hook.sh` is not re-prompted, so trust a project only when you trust what its commands point at. Until then startup skips them with one notice (startup never opens a dialog; print and JSON runs just skip). Subagents follow the parent session's decision; an isolated (worktree) subagent, whose checkout is a different root, follows the decision stored for the parent's repository (passed as `OCTOCODE_TRUST_ROOT`), and only while its gated files are byte-for-byte the ones that decision covered; otherwise they stay off, since no one can be asked in a subagent. A project Pi was told not to trust (`--no-approve`, a declined prompt) never loads them.

Trust does not set the [permission mode](FEATURES.md#permissions) (sessions start in `full` unless `OCTOCODE_PERMISSION` is exported). Trust decides what project config loads at startup; the permission mode decides which agent actions run without asking. Neither is a sandbox.

## Hooks

**Quick start.** Hooks are off by default because they run arbitrary commands. Start Pi with `OCTOCODE_HOOKS=1 pi`, then put Claude Code / Codex-style hooks in `~/.claude/settings.json` or `~/.codex/hooks.json` or `~/.octocode/hooks.json` (all projects), or `<repo>/.claude/settings.json`, `.claude/settings.local.json`, `.codex/hooks.json` or `.octocode/hooks.json` (this repository, trusted projects only). All use the same `{ "hooks": { "PreToolUse": [...] } }` format. Existing Claude Code hooks work as they are. Type `/hooks` to see whether hooks are on, what loaded, and which files exist (✓). Files are read at session start, so run `/reload` after editing.

```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "./scripts/check-bash.sh", "timeout": 30 }] }],
    "PostToolUse": [{ "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "yarn lint --quiet" }] }]
  }
}
```

Only `type: "command"` hooks for `PreToolUse`, `PostToolUse`, `SessionStart`, `PreCompact`, `Stop` and `Notification` are used; other events are ignored. As in Claude Code, all matching hooks run in parallel and a command listed in several files runs once. `timeout` is in seconds (default 60, at most 600). The hook gets the event as JSON on stdin and `CLAUDE_PROJECT_DIR` set to the repository root. See [Hooks in FEATURES.md](FEATURES.md#hooks-opt-in) for how each event maps to Pi.

## Subagent profiles

Profiles are Markdown files with frontmatter. Bundled profiles live in `subagents/`; add your own in `~/.pi/agent/agents/`, `~/.octocode/agents/`, `<repo root>/.pi/agents/` or `<repo root>/.octocode/agents/` (the last two in trusted projects only). Later directories override earlier ones by name, in that order, after the bundled ones.

```markdown
---
name: migrator
description: Applies a database migration and verifies it
tools: read,edit,write,bash
model: claude-sonnet-5-5
---
Instructions for the subagent…
```

`tools` is an allowlist (Pi's `--tools`); `excludeTools` is a denylist (Pi's `--exclude-tools`); `visibleBrowser: true` gives the child a visible Chrome on the persistent profile (it sets `OCTOCODE_BROWSER_VISIBLE=1`, as `webLive` does). The bundled `researcher` and `reviewer` set `excludeTools: file,browser` (subagents never get `askUser`), `implementer` excludes `browser`, and `webHeadless` / `webLive` exclude `file,bash` and set `mcp: false`. `mcp: false` starts the child without Pi's built-in MCP and without the `octocode` server (it sets `OCTOCODE_MCP=0`), so a profile that never researches code pays for no MCP tool schemas. The switches `mcp`, `visibleBrowser` and `hooks` take YAML booleans only (`mcp: false`, not `"false"` or `no`): any other value makes the profile malformed, so it is skipped and the rest still load.

`model` is the profile's preferred model: `provider/id` or a bare id, optionally with Pi's `:<thinking>` suffix (`claude-sonnet-5-5:high`). A bare id resolves against the models the parent can use, preferring the parent's provider, then any provider that has it; the child gets the resolved `--model provider/id`. The bundled profiles use bare ids so they work with whichever provider you use: `implementer` and `reviewer` run `claude-sonnet-5-5`; `researcher`, `webHeadless` and `webLive` run `claude-haiku-5-5`. When a profile's model is not available, the run does not fail: the child is pinned to the parent's current model (as is a run whose profile names no model), and the `agent` row and the result details (`fallback`) say which preference was skipped. Override a bundled profile by name in `~/.octocode/agents/` to change its model, or drop `model` to always run on the parent's model. The `agent` tool's own `model` parameter beats the profile and is strict: an unavailable model is refused with the closest available ids.

Subagents start with `--no-session` and this extension only, and cannot spawn further subagents. They do not run the user's command hooks unless their profile sets `hooks: true` (a hook meant for the main session would otherwise fire once per subagent). Each child receives a fresh run identity and profile-specific browser visibility; user settings such as MCP opt-out remain inherited. Their model usage is added to the parent session's totals, and a subagent whose model call fails is reported as a failed tool call.

## MCP

Octocode runs on this extension's own MCP client, built on `@earendil-works/pi-mcp` (`McpClient`, `StdioTransport`), not on Pi's built-in MCP. On `session_start` it starts one stdio server, `octocode` (the `octocode-mcp` installed with the extension, whose dependency is `^20.2.0`, so installing or updating the extension fetches the newest compatible 20.x release; or `npx -y octocode-mcp@^20.2.0` when it is not installed next to the extension; in this monorepo `dev setup` resolves it to the workspace build `packages/octocode-mcp`), with `cwd` and `WORKSPACE_ROOT` set to the session's folder and `ALLOWED_PATHS` to that folder and the Octocode home. GitHub tokens (`GITHUB_TOKEN`, …) reach it through the process environment. `OCTOCODE_MCP=0` starts nothing. A stderr tail (the last 2,000 characters) is kept to explain a failure.

The extension registers every tool the server lists with `pi.registerTool`, named `mcp__octocode__<tool>`. Names, descriptions, annotations and input schemas come from the server's `tools/list`; none is hardcoded, so the server's tool list is the source (the set depends on the server's version and settings, for example `clasify` only with a classification API). Each tool is `direct`, so the model has all of them from the first request, with no `tool_search` step, and sits in the namespace `mcp__octocode` that carries the server's instructions. Rows render compactly like the extension's other tools: a one-line call, a short preview, full output on ctrl+o. The `file` guard counts only Pi's `read`, so read a file with `read` before changing it.

Results reach the model whole up to a generous bound. The extension calls `tools/call` itself (60 s timeout, aborted with the turn) and hands the model the server's content: text as text, images as images, other blocks through `toLlmContent`. Octocode already bounds each page (in characters, so non-ASCII source easily passes 20 KB of UTF-8) and puts every row's `next.*` continuation inside it, so a result under 200,000 bytes and 10,000 lines per text part is passed byte for byte. A longer text part is saved whole to the session's `output/` folder and replaced by its head and tail and the file's path. An image over 600,000 base64 characters is saved to `output/` too and replaced by a text note with its path: a gateway in front of the model rejects a request of a few MB (HTTP 413), and a dozen large screenshots reach that. The server's `structuredContent` is kept on the result when the tool declares an `outputSchema`. A result with `isError` is an error result carrying the server's text. Terminal control sequences, bidi overrides and invisible characters (Unicode tags U+E0000–E007F among them) are stripped from text and structured content before the model reads them or the terminal draws them.

The prompt waits for the real connect. Before the first agent run, `before_agent_start` awaits the connection, at most `OCTOCODE_MCP_WAIT_SECONDS` (default 10; a bound on the connect, not a poll). A server that connects in time costs only the connect; a failure ends the wait at once. Once connected, the server's own `initialize` instructions (how its tools chain, page with `next.*` and count as evidence) are added whole to the `octocode` prompt section under `# Octocode MCP server instructions`, together with the research routing. If the server cannot start, the session shows one warning (when there is a UI) and the prompt carries no Octocode routing, since the model has no Octocode tools; the next prompt retries once. A server that is only slow keeps connecting, and its tools join the session when it is up. Once Octocode is on in the prompt it stays on for the session so the cached prompt does not change.

Lifecycle. The server closes, process tree included, on `session_shutdown` and when the session's folder changes (the new folder gets its own server). If the process dies, the next tool call starts it once more; if that fails, calls return an error that names the cause until `/octocode mcp restart`. A `notifications/tools/list_changed` makes the extension list the tools again: new ones are registered and withdrawn ones are hidden from the model.

`/octocode mcp` shows the state (connected, connecting, failed or stopped, with the error), the server's name and version, the tool count and the process id; `/octocode mcp restart` starts a fresh process.

A server named `octocode` in Pi's `mcp.json` (the trusted project file replacing the global one) takes precedence, which is how to override or disable it: the extension then starts no client and registers no tools, and the prompt's research guidance follows the Octocode tools Pi registers for it. Pi owns that server, including how it handles its results.

Every other server is configured with Pi's MCP: `~/.pi/agent/mcp.json`, `.pi/mcp.json`, `pi mcp add`, `/mcp` (status, reconnect, sign-in) and Pi's OAuth. See [Pi's MCP docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md). `pi --no-extensions` also turns off Pi's built-in MCP; add `-e builtin:mcp -e builtin:tool-search` to keep it and the tool search that loads a user's deferred MCP servers (for example `pi --no-extensions -e packages/octocode-pi-extension/dist/index.js -e builtin:mcp -e builtin:tool-search`).

## Retention

A sweep runs at most every 6 hours across all sessions, off the session start path; it never touches the current session or Pi's own session files. "Pi lists the session" covers Pi's default sessions dir and every custom session dir (`--session-dir`) a session ran from, recorded at session start. When any of those listings fails, including a recorded dir that can no longer be read, the sweep removes nothing.

| What | Removed when |
|---|---|
| A session's folder and extras row, when Pi no longer lists the session (deleted, ephemeral, a subagent's) | 7 days after the folder was last written, unless its process is running |
| A `_pid-<pid>` folder (output written before a session id was known) | 1 day after that process died |
| Spilled `output/` and `bash/` logs inside a kept session | `OCTOCODE_CLEANUP_DAYS` days after they were written (default 30; `0` turns the whole sweep off) |
| A kept session's `checkpoints/` | `OCTOCODE_CLEANUP_DAYS` days after its journal or blobs were last written, whole (a rewind then finds nothing); never the current session's or one whose process is running. Otherwise with the session's folder (and the 256-entry / 128 MiB cap per session) |
| Subagent screenshots in `pi-team/shots/` | `OCTOCODE_CLEANUP_DAYS` days after they were written (also the newest 30 are kept) |
| Backlog items, notes and memories | Never automatically: they stay until deleted (items on `/backlog`; memories on `/memory` or with the `memory` tool's `delete`) |

`/sessions` → Forget Octocode data removes one session's folder and extras row at once.
